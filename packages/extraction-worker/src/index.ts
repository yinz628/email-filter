/**
 * Extraction Worker — self-contained extraction service.
 *
 * CALLEE of a Cloudflare service binding. email-worker calls:
 *   const resp = await env.EXTRACTION_WORKER.fetch('https://extraction-worker/extract', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ rawMime, ruleId }),
 *   });
 *
 * Capabilities:
 *   - POST /extract: parse MIME → look up rule → extract → store D1 (service binding, no auth)
 *   - GET  /api/codes: list verification codes (Bearer auth, paginated)
 *   - GET  /api/codes/latest/:recipient: convenience endpoint for latest code
 *   - GET  /api/codes/:id: single verification code
 *   - DEL  /api/codes/:id: delete verification code
 *   - GET  /api/discounts: list discount codes (Bearer auth, paginated)
 *   - GET  /api/discounts/by-merchant/:domain: filter by merchant domain
 *   - GET  /api/discounts/:id: single discount code
 *   - DEL  /api/discounts/:id: delete discount code
 *   - POST /api/rules: VPS pushes extraction config (Bearer auth)
 *   - POST /api/generate-pattern: generate regex from sample (Bearer auth)
 *   - POST /api/test-pattern: test regex against content (Bearer auth)
 *   - GET  /admin: HTML panel (Bearer auth)
 *   - GET  /health: health check (no auth)
 */

import PostalMime from 'postal-mime';
import { extract } from './extract.js';
import {
  getRule, upsertRule,
  insertCode, queryCodes, getLatestCode, getCodeById, deleteCode,
  insertDiscount, queryDiscounts, getDiscountById, deleteDiscount,
  deleteDiscounts, queryAllDiscounts,
  type CodeFilter, type DiscountFilter,
} from './db.js';
import { generateFromTarget, validateRegex, testRegexMatch } from './regex-generator.js';
import type { ExtractRequest } from './types.js';
import { getAdminHtml } from './admin.js';

interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
}

/** Max rawMime size to protect CPU. */
const MAX_RAW_BYTES = 512 * 1024;

// ============================================
// Auth
// ============================================

function checkAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.substring(7) === env.ADMIN_TOKEN;
}

/**
 * Browser-friendly auth for the admin panel.
 * Browsers cannot set Authorization headers on a direct navigation, so /admin
 * additionally accepts the token via the ?token= query param. The returned HTML
 * persists it to localStorage so subsequent /api/* calls can use the header.
 * /api/* routes keep header-only auth (programmatic callers always set headers).
 */
function checkAdminAuth(request: Request, env: Env): boolean {
  if (checkAuth(request, env)) return true;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  return !!queryToken && queryToken === env.ADMIN_TOKEN;
}

function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

// ============================================
// /extract (service binding — no auth)
// ============================================

async function handleExtract(request: Request, env: Env): Promise<Response> {
  let rawMime: string;
  let ruleId: string | undefined;

  // Parse body: JSON {rawMime, ruleId} or plain text (backward compat)
  const contentType = request.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      const body = (await request.json()) as ExtractRequest;
      rawMime = body.rawMime;
      ruleId = body.ruleId;
    } catch {
      rawMime = await request.text();
    }
  } else {
    rawMime = await request.text();
  }

  if (rawMime.length > MAX_RAW_BYTES) {
    rawMime = rawMime.slice(0, MAX_RAW_BYTES);
  }

  // Parse MIME
  let subject: string | undefined;
  let textBody: string | undefined;
  let htmlBody: string | undefined;
  let from: string | undefined;
  let to: string | undefined;

  try {
    const parsed = await PostalMime.parse(rawMime);
    subject = parsed.subject || undefined;
    textBody = parsed.text || undefined;
    htmlBody = parsed.html || undefined;
    from = (parsed.from as { address?: string })?.address || undefined;
    to = parsed.to?.[0]?.address || undefined;
  } catch (err) {
    console.error('[extraction-worker] postal-mime parse failed:', err);
    return Response.json({ extractedAt: new Date().toISOString() });
  }

  // Look up rule to determine extract_type + patterns
  let extractType: 'verification' | 'discount' = 'verification';
  let codePattern: string | undefined;
  let linkAnchorPattern: string | undefined;

  if (ruleId) {
    const rule = await getRule(env.DB, ruleId);
    if (rule) {
      extractType = rule.extract_type === 'discount' ? 'discount' : 'verification';
      codePattern = rule.code_pattern ?? undefined;
      linkAnchorPattern = rule.link_anchor_pattern ?? undefined;
    }
  }

  // Extract
  const result = extract(subject, textBody, htmlBody, extractType, codePattern, linkAnchorPattern);

  // Store in D1 (only if something was extracted)
  if (extractType === 'discount') {
    if (result.code?.value || result.link) {
      const senderDomain = from ? from.split('@')[1] : undefined;
      await insertDiscount(env.DB, {
        recipient: to ?? '',
        sender: from,
        senderDomain,
        subject,
        code: result.code?.value,
        link: result.link,
        discountValue: result.discountValue,
        messageId: parsedMessageId(rawMime),
      });
    }
  } else {
    if (result.code?.value || result.link) {
      await insertCode(env.DB, {
        recipient: to ?? '',
        sender: from,
        subject,
        code: result.code?.value,
        link: result.link,
        messageId: parsedMessageId(rawMime),
      });
    }
  }

  return Response.json(result);
}

/** Extract Message-ID from raw MIME headers (lightweight, no full parse). */
function parsedMessageId(rawMime: string): string | undefined {
  const m = rawMime.match(/^message-id:\s*<([^>]+)>/im);
  return m?.[1];
}

// ============================================
// API: verification codes
// ============================================

async function handleListCodes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const filter: CodeFilter = {
    recipient: url.searchParams.get('recipient') || undefined,
    sender: url.searchParams.get('sender') || undefined,
    search: url.searchParams.get('search') || undefined,
    limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
    offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : undefined,
  };
  const { rows, total } = await queryCodes(env.DB, filter);
  return Response.json({
    records: rows,
    pagination: { total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 },
  });
}

async function handleLatestCode(recipient: string, env: Env): Promise<Response> {
  const row = await getLatestCode(env.DB, decodeURIComponent(recipient));
  if (!row) return Response.json({ error: 'no code found' }, { status: 404 });
  const ageSeconds = Math.floor((Date.now() - new Date(row.received_at + 'Z').getTime()) / 1000);
  return Response.json({
    code: row.code,
    link: row.link,
    received_at: row.received_at,
    age_seconds: ageSeconds,
  });
}

async function handleGetCode(id: string, env: Env): Promise<Response> {
  const row = await getCodeById(env.DB, parseInt(id, 10));
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(row);
}

async function handleDeleteCode(id: string, env: Env): Promise<Response> {
  const deleted = await deleteCode(env.DB, parseInt(id, 10));
  if (!deleted) return Response.json({ error: 'not found' }, { status: 404 });
  return new Response(null, { status: 204 });
}

// ============================================
// API: discount codes
// ============================================

/** Parse shared discount filter params from query string (used by list + export). */
function discountFilterFromQuery(url: URL, extra?: Partial<DiscountFilter>): DiscountFilter {
  return {
    recipient: url.searchParams.get('recipient') || undefined,
    senderDomain: url.searchParams.get('sender_domain') || undefined,
    subject: url.searchParams.get('subject') || undefined,
    dateFrom: url.searchParams.get('date_from') || undefined,
    dateTo: url.searchParams.get('date_to') || undefined,
    search: url.searchParams.get('search') || undefined,
    limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
    offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : undefined,
    ...extra,
  };
}

async function handleListDiscounts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const filter = discountFilterFromQuery(url);
  const { rows, total } = await queryDiscounts(env.DB, filter);
  return Response.json({
    records: rows,
    pagination: { total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 },
  });
}

async function handleDiscountsByMerchant(domain: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const filter: DiscountFilter = {
    senderDomain: decodeURIComponent(domain),
    limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
    offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!, 10) : undefined,
  };
  const { rows, total } = await queryDiscounts(env.DB, filter);
  return Response.json({
    records: rows,
    pagination: { total, limit: filter.limit ?? 50, offset: filter.offset ?? 0 },
  });
}

async function handleGetDiscount(id: string, env: Env): Promise<Response> {
  const row = await getDiscountById(env.DB, parseInt(id, 10));
  if (!row) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(row);
}

async function handleDeleteDiscount(id: string, env: Env): Promise<Response> {
  const deleted = await deleteDiscount(env.DB, parseInt(id, 10));
  if (!deleted) return Response.json({ error: 'not found' }, { status: 404 });
  return new Response(null, { status: 204 });
}

// ============================================
// API: discount codes — bulk delete + export
// ============================================

/** Max ids accepted by bulk-delete. */
const MAX_BULK_DELETE = 1000;

async function handleBulkDeleteDiscounts(request: Request, env: Env): Promise<Response> {
  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (raw.length > MAX_BULK_DELETE) {
    return Response.json({ error: `too many ids (max ${MAX_BULK_DELETE})` }, { status: 400 });
  }
  const ids: number[] = [];
  for (const v of raw) {
    // Accept integers or numeric strings; reject anything else.
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (!Number.isInteger(n) || n <= 0) {
      return Response.json({ error: `invalid id: ${JSON.stringify(v)}` }, { status: 400 });
    }
    ids.push(n);
  }
  const deleted = await deleteDiscounts(env.DB, ids);
  return Response.json({ deleted, requested: ids.length });
}

/** CSV column order for discount export. */
const DISCOUNT_CSV_COLUMNS: Array<keyof import('./db.js').DiscountCodeRow> = [
  'id', 'recipient', 'sender', 'sender_domain', 'subject',
  'code', 'link', 'discount_value', 'message_id', 'received_at',
];

/** RFC 4180 CSV cell escaping: wrap in quotes if needed, double embedded quotes. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

async function handleExportDiscounts(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const filter = discountFilterFromQuery(url);
  const rows = await queryAllDiscounts(env.DB, filter);

  const lines: string[] = [DISCOUNT_CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(DISCOUNT_CSV_COLUMNS.map((c) => csvCell(row[c])).join(','));
  }
  const csv = lines.join('\r\n');
  // Leading BOM so Excel opens UTF-8 correctly.
  const body = '\uFEFF' + csv;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="discounts.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ============================================
// API: rules (VPS push)
// ============================================

async function handlePushRule(request: Request, env: Env): Promise<Response> {
  let body: { id: string; extract_type: string; code_pattern?: string; link_anchor_pattern?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.id || !body.extract_type) {
    return Response.json({ error: 'id and extract_type required' }, { status: 400 });
  }
  if (body.extract_type !== 'verification' && body.extract_type !== 'discount') {
    return Response.json({ error: 'extract_type must be verification or discount' }, { status: 400 });
  }
  await upsertRule(env.DB, body);
  return Response.json({ ok: true });
}

// ============================================
// API: regex generator
// ============================================

async function handleGeneratePattern(request: Request): Promise<Response> {
  let body: { target: string; emailContent?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.target) {
    return Response.json({ error: 'target is required' }, { status: 400 });
  }
  const result = generateFromTarget(body.target, body.emailContent);
  return Response.json(result);
}

async function handleTestPattern(request: Request): Promise<Response> {
  let body: { pattern: string; flags?: string; content: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!body.pattern || !body.content) {
    return Response.json({ error: 'pattern and content required' }, { status: 400 });
  }
  const validation = validateRegex(body.pattern, body.flags || '');
  if (!validation.valid) {
    return Response.json({ valid: false, error: validation.error, matches: [], positions: [] });
  }
  const result = testRegexMatch(body.pattern, body.flags || 'gi', body.content);
  return Response.json({ valid: true, ...result });
}

// ============================================
// Router
// ============================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // --- No-auth routes ---
    if (method === 'GET' && (path === '/health' || path === '/')) {
      return Response.json({ status: 'ok', service: 'extraction-worker', timestamp: Date.now() });
    }

    if (method === 'POST' && path === '/extract') {
      return handleExtract(request, env);
    }

    // --- Auth-required routes ---
    // /api/* — programmatic callers, header-only (no query token leakage in logs).
    if (path.startsWith('/api/')) {
      if (!checkAuth(request, env)) return unauthorized();
    }
    // /admin — browser navigation, also accepts ?token= (browsers can't set headers).
    if (path === '/admin') {
      if (!checkAdminAuth(request, env)) return unauthorized();
    }

    // Admin panel
    if (method === 'GET' && path === '/admin') {
      return new Response(getAdminHtml(url.origin, env.ADMIN_TOKEN), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Verification codes API
    if (path === '/api/codes') {
      if (method === 'GET') return handleListCodes(request, env);
    }
    if (path.startsWith('/api/codes/latest/')) {
      const recipient = path.replace('/api/codes/latest/', '');
      if (method === 'GET') return handleLatestCode(recipient, env);
    }
    if (path.startsWith('/api/codes/')) {
      const id = path.replace('/api/codes/', '');
      if (method === 'GET') return handleGetCode(id, env);
      if (method === 'DELETE') return handleDeleteCode(id, env);
    }

    // Discount codes API
    // Specific paths (by-merchant, export, bulk-delete) MUST precede the
    // generic /api/discounts/:id wildcard below, otherwise 'export' would be
    // parsed as an :id.
    if (path.startsWith('/api/discounts/by-merchant/')) {
      const domain = path.replace('/api/discounts/by-merchant/', '');
      if (method === 'GET') return handleDiscountsByMerchant(domain, request, env);
    }
    if (path === '/api/discounts/export' && method === 'GET') {
      return handleExportDiscounts(request, env);
    }
    if (path === '/api/discounts/bulk-delete' && method === 'POST') {
      return handleBulkDeleteDiscounts(request, env);
    }
    if (path === '/api/discounts') {
      if (method === 'GET') return handleListDiscounts(request, env);
    }
    if (path.startsWith('/api/discounts/')) {
      const id = path.replace('/api/discounts/', '');
      if (method === 'GET') return handleGetDiscount(id, env);
      if (method === 'DELETE') return handleDeleteDiscount(id, env);
    }

    // Rules push
    if (path === '/api/rules' && method === 'POST') {
      return handlePushRule(request, env);
    }

    // Regex generator
    if (path === '/api/generate-pattern' && method === 'POST') {
      return handleGeneratePattern(request);
    }
    if (path === '/api/test-pattern' && method === 'POST') {
      return handleTestPattern(request);
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  },
};
