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
 *   DEL  /codes/:id        — proxy to worker /api/codes/:id
 *   GET  /discounts        — proxy to worker /api/discounts
 *   GET  /discounts/by-merchant/:d — proxy to worker /api/discounts/by-merchant/:d
 *   DEL  /discounts/:id    — proxy to worker /api/discounts/:id
 *   POST /generate-pattern — proxy to worker /api/generate-pattern
 *   POST /test-pattern     — proxy to worker /api/test-pattern
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { authMiddleware } from '../middleware/auth.js';

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
  fastify.delete('/discounts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return proxyToWorker('DELETE', `/api/discounts/${id}`, request, reply);
  });

  // Regex generator
  fastify.post('/generate-pattern', async (request, reply) => proxyToWorker('POST', '/api/generate-pattern', request, reply));
  fastify.post('/test-pattern', async (request, reply) => proxyToWorker('POST', '/api/test-pattern', request, reply));
}
