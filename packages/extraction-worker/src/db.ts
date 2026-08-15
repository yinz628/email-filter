/**
 * D1 data access layer for extraction-worker.
 *
 * Single source of truth for all database operations. Every D1 query goes
 * through this module so schema changes are localized here.
 *
 * Design principles:
 *   - One function = one D1 operation (read or write).
 *   - INSERT OR IGNORE for idempotent writes (message_id UNIQUE dedup).
 *   - Empty results return undefined/[], never throw on "not found".
 *   - No business logic — pure data access.
 */

/** A verification code record stored in D1. */
export interface VerificationCodeRow {
  id: number;
  worker_name: string | null;
  recipient: string;
  sender: string | null;
  subject: string | null;
  code: string | null;
  link: string | null;
  message_id: string | null;
  received_at: string;
}

/** A discount code record stored in D1. */
export interface DiscountCodeRow {
  id: number;
  worker_name: string | null;
  recipient: string;
  sender: string | null;
  sender_domain: string | null;
  subject: string | null;
  code: string | null;
  link: string | null;
  discount_value: string | null;
  message_id: string | null;
  received_at: string;
}

/** An extraction rule pushed from VPS. */
export interface ExtractionRuleRow {
  id: string;
  extract_type: string;
  code_pattern: string | null;
  link_anchor_pattern: string | null;
  link_url_pattern: string | null;
  updated_at: string;
}

/** Filter parameters for listing codes. */
export interface CodeFilter {
  recipient?: string;
  sender?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DiscountFilter {
  recipient?: string;
  senderDomain?: string;
  search?: string;
  /** Subject substring filter (LIKE). */
  subject?: string;
  /** Inclusive lower bound on received_at (SQLite datetime string, e.g. '2026-08-01 00:00:00'). */
  dateFrom?: string;
  /** Inclusive upper bound on received_at. */
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// Extraction Rules
// ============================================

/**
 * Get an extraction rule by ID (primary key lookup, O(1)).
 */
export async function getRule(db: D1Database, ruleId: string): Promise<ExtractionRuleRow | null> {
  const result = await db
    .prepare('SELECT * FROM extraction_rules WHERE id = ?')
    .bind(ruleId)
    .first<ExtractionRuleRow>();
  return result ?? null;
}

/**
 * Upsert an extraction rule (VPS pushes config changes).
 * Idempotent via ON CONFLICT.
 */
export async function upsertRule(
  db: D1Database,
  rule: { id: string; extract_type: string; code_pattern?: string; link_anchor_pattern?: string; link_url_pattern?: string }
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO extraction_rules (id, extract_type, code_pattern, link_anchor_pattern, link_url_pattern, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         extract_type = excluded.extract_type,
         code_pattern = excluded.code_pattern,
         link_anchor_pattern = excluded.link_anchor_pattern,
         link_url_pattern = excluded.link_url_pattern,
         updated_at = excluded.updated_at`
    )
    .bind(
      rule.id,
      rule.extract_type,
      rule.code_pattern ?? null,
      rule.link_anchor_pattern ?? null,
      rule.link_url_pattern ?? null,
      now
    )
    .run();
}

// ============================================
// Verification Codes
// ============================================

/** Data needed to insert a verification code record. */
export interface InsertCodeData {
  workerName?: string;
  recipient: string;
  sender?: string;
  subject?: string;
  code?: string;
  link?: string;
  messageId?: string;
}

/**
 * Insert a verification code. Idempotent: INSERT OR IGNORE on message_id UNIQUE.
 * Returns true if a row was actually inserted (false = duplicate skipped).
 */
export async function insertCode(db: D1Database, data: InsertCodeData): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO verification_codes (worker_name, recipient, sender, subject, code, link, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.workerName ?? null,
      data.recipient,
      data.sender ?? null,
      data.subject ?? null,
      data.code ?? null,
      data.link ?? null,
      data.messageId ?? null
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Query verification codes with filtering and pagination.
 * Ordered by most recent first.
 */
export async function queryCodes(db: D1Database, filter: CodeFilter): Promise<{ rows: VerificationCodeRow[]; total: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.recipient) {
    where.push('recipient = ?');
    params.push(filter.recipient);
  }
  if (filter.sender) {
    where.push('sender LIKE ?');
    params.push(`%${filter.sender}%`);
  }
  if (filter.search) {
    where.push('(code LIKE ? OR link LIKE ? OR subject LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countResult = await db
    .prepare(`SELECT COUNT(*) as c FROM verification_codes ${whereClause}`)
    .bind(...params)
    .first<{ c: number }>();
  const total = countResult?.c ?? 0;

  const rows = await db
    .prepare(
      `SELECT * FROM verification_codes ${whereClause}
       ORDER BY received_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<VerificationCodeRow>();

  return { rows: rows.results ?? [], total };
}

/**
 * Get the latest verification code for a recipient.
 * Uses the recipient + received_at index.
 */
export async function getLatestCode(db: D1Database, recipient: string): Promise<VerificationCodeRow | null> {
  const result = await db
    .prepare(
      `SELECT * FROM verification_codes
       WHERE recipient = ?
       ORDER BY received_at DESC
       LIMIT 1`
    )
    .bind(recipient)
    .first<VerificationCodeRow>();
  return result ?? null;
}

/**
 * Get a single verification code by ID.
 */
export async function getCodeById(db: D1Database, id: number): Promise<VerificationCodeRow | null> {
  const result = await db
    .prepare('SELECT * FROM verification_codes WHERE id = ?')
    .bind(id)
    .first<VerificationCodeRow>();
  return result ?? null;
}

/**
 * Delete a verification code by ID.
 * Returns true if a row was deleted.
 */
export async function deleteCode(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM verification_codes WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Bulk-delete verification codes by IDs. Single statement → atomic.
 * Returns the number of rows actually deleted (may be < ids.length if some
 * ids didn't exist). Empty input returns 0 without hitting D1.
 */
export async function deleteCodes(db: D1Database, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await db
    .prepare(`DELETE FROM verification_codes WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();
  return result.meta?.changes ?? 0;
}

// ============================================
// Discount Codes
// ============================================

export interface InsertDiscountData {
  workerName?: string;
  recipient: string;
  sender?: string;
  senderDomain?: string;
  subject?: string;
  code?: string;
  link?: string;
  discountValue?: string;
  messageId?: string;
}

/**
 * Insert a discount code. Idempotent on message_id.
 */
export async function insertDiscount(db: D1Database, data: InsertDiscountData): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO discount_codes
         (worker_name, recipient, sender, sender_domain, subject, code, link, discount_value, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.workerName ?? null,
      data.recipient,
      data.sender ?? null,
      data.senderDomain ?? null,
      data.subject ?? null,
      data.code ?? null,
      data.link ?? null,
      data.discountValue ?? null,
      data.messageId ?? null
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Build the WHERE clause + bind params shared by all discount queries
 * (list, export). Keeps filter semantics in one place.
 */
export function buildDiscountWhere(filter: DiscountFilter): { clause: string; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.recipient) {
    where.push('recipient = ?');
    params.push(filter.recipient);
  }
  if (filter.senderDomain) {
    where.push('sender_domain = ?');
    params.push(filter.senderDomain);
  }
  if (filter.subject) {
    where.push('subject LIKE ?');
    params.push(`%${filter.subject}%`);
  }
  // received_at is stored as 'YYYY-MM-DD HH:MM:SS' (UTC, lexicographically
  // ordered), so direct string comparison works for the date range.
  if (filter.dateFrom) {
    where.push('received_at >= ?');
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    where.push('received_at <= ?');
    params.push(filter.dateTo);
  }
  if (filter.search) {
    where.push('(code LIKE ? OR link LIKE ? OR subject LIKE ? OR discount_value LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return { clause, params };
}

/**
 * Query discount codes with filtering and pagination.
 */
export async function queryDiscounts(
  db: D1Database,
  filter: DiscountFilter
): Promise<{ rows: DiscountCodeRow[]; total: number }> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);
  const { clause: whereClause, params } = buildDiscountWhere(filter);

  const countResult = await db
    .prepare(`SELECT COUNT(*) as c FROM discount_codes ${whereClause}`)
    .bind(...params)
    .first<{ c: number }>();
  const total = countResult?.c ?? 0;

  const rows = await db
    .prepare(
      `SELECT * FROM discount_codes ${whereClause}
       ORDER BY received_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<DiscountCodeRow>();

  return { rows: rows.results ?? [], total };
}

/**
 * Get a single discount code by ID.
 */
export async function getDiscountById(db: D1Database, id: number): Promise<DiscountCodeRow | null> {
  const result = await db
    .prepare('SELECT * FROM discount_codes WHERE id = ?')
    .bind(id)
    .first<DiscountCodeRow>();
  return result ?? null;
}

/**
 * Delete a discount code by ID.
 */
export async function deleteDiscount(db: D1Database, id: number): Promise<boolean> {
  const result = await db.prepare('DELETE FROM discount_codes WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

/**
 * Bulk-delete discount codes by IDs. Single statement → atomic.
 * Returns the number of rows actually deleted (may be < ids.length if some
 * ids didn't exist). Empty input returns 0 without hitting D1.
 */
export async function deleteDiscounts(db: D1Database, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await db
    .prepare(`DELETE FROM discount_codes WHERE id IN (${placeholders})`)
    .bind(...ids)
    .run();
  return result.meta?.changes ?? 0;
}

/**
 * Query ALL discount codes matching the filter (no pagination), for export.
 * Capped at maxRows (default 5000) as a defensive ceiling for D1.
 */
export async function queryAllDiscounts(
  db: D1Database,
  filter: DiscountFilter,
  maxRows = 5000
): Promise<DiscountCodeRow[]> {
  const { clause: whereClause, params } = buildDiscountWhere(filter);
  const rows = await db
    .prepare(
      `SELECT * FROM discount_codes ${whereClause}
       ORDER BY received_at DESC
       LIMIT ?`
    )
    .bind(...params, maxRows)
    .all<DiscountCodeRow>();
  return rows.results ?? [];
}
