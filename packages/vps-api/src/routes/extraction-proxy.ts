/**
 * Extraction Proxy Routes — forwards VPS admin panel requests to extraction-worker.
 *
 * The extraction-worker stores verification codes and discount codes in its own D1.
 * These proxy endpoints let the VPS admin panel query them without exposing the
 * worker URL/token to the browser. All endpoints require admin auth (JWT).
 *
 * Mounted at /api/extraction:
 *   GET  /codes            — proxy to worker /api/codes
 *   GET  /codes/latest/:r  — proxy to worker /api/codes/latest/:r
 *   POST /codes/bulk-delete — proxy to worker /api/codes/bulk-delete
 *   DEL  /codes/:id        — proxy to worker /api/codes/:id
 *   GET  /discounts        — proxy to worker /api/discounts
 *   GET  /discounts/by-merchant/:d — proxy to worker /api/discounts/by-merchant/:d
 *   DEL  /discounts/:id    — proxy to worker /api/discounts/:id
 *   POST /discounts/bulk-delete — proxy to worker /api/discounts/bulk-delete
 *   GET  /discounts/export       — proxy to worker /api/discounts/export
 *   GET    /discount-states      — local VPS: batch read status map
 *   PUT    /discount-states/:id  — local VPS: upsert status (status/tags/favorite/note)
 *   POST   /discount-states/bulk — local VPS: batch upsert status
 *   POST /generate-pattern — proxy to worker /api/generate-pattern
 *   POST /test-pattern     — proxy to worker /api/test-pattern
 *
 * discount-states operates on the local VPS discount_code_states table — it does
 * NOT round-trip to the worker. The worker remains the L1 store for code content;
 * these endpoints only manage the orthogonal status/tags/favorite/note overlay.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';

/** Allowed status values for discount_code_states. */
const VALID_STATUSES = ['active', 'used', 'expired', 'archived'] as const;
type DiscountStatus = (typeof VALID_STATUSES)[number];
function isDiscountStatus(v: unknown): v is DiscountStatus {
  return typeof v === 'string' && (VALID_STATUSES as readonly string[]).includes(v);
}

export async function extractionProxyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  const workerUrl = config.extractionWorkerUrl;
  const workerToken = config.extractionWorkerToken;

  /**
   * Generic proxy: forward the request to extraction-worker with auth.
   * Returns the worker's response body + status.
   */
  async function proxyToWorker(
    method: string,
    workerPath: string,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    if (!workerUrl || !workerToken) {
      return reply.status(503).send({ error: 'Extraction worker not configured' });
    }
    const url = `${workerUrl}${workerPath}`;
    const init: RequestInit = {
      method,
      headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json', 'User-Agent': 'vps-proxy/1.0' },
    };
    if (method === 'POST' && request.body) {
      init.body = JSON.stringify(request.body);
    }
    try {
      const resp = await fetch(url, init);
      const body = await resp.text();
      return reply.status(resp.status).type(resp.headers.get('content-type') || 'application/json').send(body);
    } catch (err) {
      request.log.error(err, 'Extraction proxy error');
      return reply.status(502).send({ error: 'Extraction worker unreachable' });
    }
  }

  // Verification codes
  fastify.get('/codes', async (request, reply) => proxyToWorker('GET', `/api/codes${request.url.split('?')[1] ? '?' + request.url.split('?')[1] : ''}`, request, reply));
  fastify.get('/codes/latest/:recipient', async (request, reply) => {
    const { recipient } = request.params as { recipient: string };
    return proxyToWorker('GET', `/api/codes/latest/${encodeURIComponent(recipient)}`, request, reply);
  });
  // Static path — declared before /codes/:id, mirroring the discount routes.
  fastify.post('/codes/bulk-delete', async (request, reply) => proxyToWorker('POST', '/api/codes/bulk-delete', request, reply));
  fastify.delete('/codes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return proxyToWorker('DELETE', `/api/codes/${id}`, request, reply);
  });

  // Discount codes
  fastify.get('/discounts', async (request, reply) => proxyToWorker('GET', `/api/discounts${request.url.split('?')[1] ? '?' + request.url.split('?')[1] : ''}`, request, reply));
  fastify.get('/discounts/by-merchant/:domain', async (request, reply) => {
    const { domain } = request.params as { domain: string };
    return proxyToWorker('GET', `/api/discounts/by-merchant/${encodeURIComponent(domain)}${request.url.split('?')[1] ? '?' + request.url.split('?')[1] : ''}`, request, reply);
  });
  // Static paths MUST be declared before /discounts/:id (Fastify ranks static
  // above parametric, but explicit ordering keeps intent clear).
  fastify.post('/discounts/bulk-delete', async (request, reply) => proxyToWorker('POST', '/api/discounts/bulk-delete', request, reply));
  fastify.get('/discounts/export', async (request, reply) => proxyToWorker('GET', `/api/discounts/export${request.url.split('?')[1] ? '?' + request.url.split('?')[1] : ''}`, request, reply));
  fastify.delete('/discounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return proxyToWorker('DELETE', `/api/discounts/${id}`, request, reply);
  });

  // --------------------------------------------
  // Discount code STATES (local VPS table — no worker round-trip).
  // Manages the status/tags/favorite/note overlay; the worker stores code
  // content. The frontend joins the two by discount_id.
  // --------------------------------------------
  const stateDb = getDatabase();

  /** Batch-read states for a set of discount ids. GET /discount-states?ids=1,2,3 */
  fastify.get('/discount-states', async (request, reply) => {
    const query = request.query as { ids?: string };
    if (!query.ids) {
      return reply.send({ states: {} });
    }
    const ids = query.ids.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return reply.send({ states: {} });
    }
    const placeholders = ids.map(() => '?').join(',');
    const rows = stateDb.prepare(
      `SELECT discount_id, status, tags, favorite, note, updated_at FROM discount_code_states WHERE discount_id IN (${placeholders})`
    ).all(...ids) as Array<{ discount_id: number; status: string; tags: string | null; favorite: number; note: string | null; updated_at: string }>;
    const states: Record<number, { status: string; tags: string[]; favorite: boolean; note: string; updated_at: string }> = {};
    for (const r of rows) {
      states[r.discount_id] = {
        status: r.status,
        tags: r.tags ? r.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        favorite: r.favorite === 1,
        note: r.note ?? '',
        updated_at: r.updated_at,
      };
    }
    return reply.send({ states });
  });

  /** Upsert a single state. PUT /discount-states/:discount_id */
  fastify.put('/discount-states/:discount_id', async (request, reply) => {
    const discountId = parseInt((request.params as { discount_id: string }).discount_id, 10);
    if (!Number.isInteger(discountId) || discountId <= 0) {
      return reply.status(400).send({ error: 'invalid discount_id' });
    }
    const body = request.body as {
      status?: unknown; tags?: unknown; favorite?: unknown; note?: unknown;
    } | null;
    if (!body) {
      return reply.status(400).send({ error: 'body required' });
    }

    // Validate & coerce each provided field into {column, value} pairs.
    // The INSERT lists all provided columns + discount_id; the ON CONFLICT
    // clause references the inserted values via `excluded.<col>` so each value
    // is bound only once (no duplicate params, no ordering pitfalls).
    const cols: Array<{ col: string; val: string | number }> = [];
    if (body.status !== undefined) {
      if (!isDiscountStatus(body.status)) {
        return reply.status(400).send({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      cols.push({ col: 'status', val: body.status });
    }
    if (body.tags !== undefined) {
      const tagsStr = Array.isArray(body.tags)
        ? body.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).join(',')
        : '';
      cols.push({ col: 'tags', val: tagsStr });
    }
    if (body.favorite !== undefined) {
      cols.push({ col: 'favorite', val: body.favorite ? 1 : 0 });
    }
    if (body.note !== undefined) {
      cols.push({ col: 'note', val: typeof body.note === 'string' ? body.note : '' });
    }
    if (cols.length === 0) {
      return reply.status(400).send({ error: 'no updatable fields provided' });
    }
    cols.push({ col: 'updated_at', val: new Date().toISOString() });

    const colNames = cols.map((c) => c.col).join(', ');
    const placeholders = cols.map(() => '?').join(', ');
    const updateSet = cols.map((c) => `${c.col} = excluded.${c.col}`).join(', ');
    stateDb.prepare(
      `INSERT INTO discount_code_states (discount_id, ${colNames})
       VALUES (?, ${placeholders})
       ON CONFLICT(discount_id) DO UPDATE SET ${updateSet}`
    ).run(discountId, ...cols.map((c) => c.val));
    return reply.send({ ok: true, discount_id: discountId });
  });

  /** Batch upsert states (e.g. bulk mark-as-used). POST /discount-states/bulk */
  fastify.post('/discount-states/bulk', async (request, reply) => {
    const body = request.body as { updates?: unknown } | null;
    if (!body || !Array.isArray(body.updates) || body.updates.length === 0) {
      return reply.status(400).send({ error: 'updates must be a non-empty array' });
    }
    const tx = stateDb.transaction((updates: unknown[]) => {
      let n = 0;
      for (const u of updates) {
        if (!u || typeof u !== 'object') continue;
        const rec = u as { discount_id?: unknown; status?: unknown; tags?: unknown; favorite?: unknown; note?: unknown };
        const id = typeof rec.discount_id === 'number' ? rec.discount_id : parseInt(String(rec.discount_id), 10);
        if (!Number.isInteger(id) || id <= 0) continue;
        const cols: Array<{ col: string; val: string | number }> = [];
        if (isDiscountStatus(rec.status)) cols.push({ col: 'status', val: rec.status });
        if (Array.isArray(rec.tags)) {
          cols.push({ col: 'tags', val: rec.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).join(',') });
        }
        if (typeof rec.favorite === 'boolean') cols.push({ col: 'favorite', val: rec.favorite ? 1 : 0 });
        if (typeof rec.note === 'string') cols.push({ col: 'note', val: rec.note });
        if (cols.length === 0) continue;
        cols.push({ col: 'updated_at', val: new Date().toISOString() });
        const colNames = cols.map((c) => c.col).join(', ');
        const placeholders = cols.map(() => '?').join(', ');
        const updateSet = cols.map((c) => `${c.col} = excluded.${c.col}`).join(', ');
        stateDb.prepare(
          `INSERT INTO discount_code_states (discount_id, ${colNames})
           VALUES (?, ${placeholders})
           ON CONFLICT(discount_id) DO UPDATE SET ${updateSet}`
        ).run(id, ...cols.map((c) => c.val));
        n++;
      }
      return n;
    });
    const count = tx(body.updates);
    return reply.send({ ok: true, updated: count });
  });

  // Regex generator
  fastify.post('/generate-pattern', async (request, reply) => proxyToWorker('POST', '/api/generate-pattern', request, reply));
  fastify.post('/test-pattern', async (request, reply) => proxyToWorker('POST', '/api/test-pattern', request, reply));
}
