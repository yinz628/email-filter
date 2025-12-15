/**
 * Process Log Repository
 * Handles CRUD operations for email processing logs in D1 database
 */

import type {
  ProcessLog,
  ProcessAction,
  LogFilter,
} from '@email-filter/shared';
import { generateId } from './index.js';

/**
 * Database row type for process_logs table
 */
interface ProcessLogRow {
  id: string;
  recipient: string;
  sender: string;
  sender_email: string;
  subject: string;
  processed_at: string;
  action: string;
  matched_rule_id: string | null;
  matched_rule_category: string | null;
  error_message: string | null;
}

/**
 * Convert database row to ProcessLog object
 */
function rowToProcessLog(row: ProcessLogRow): ProcessLog {
  return {
    id: row.id,
    recipient: row.recipient,
    sender: row.sender,
    senderEmail: row.sender_email,
    subject: row.subject,
    processedAt: new Date(row.processed_at),
    action: row.action as ProcessAction,
    matchedRuleId: row.matched_rule_id ?? undefined,
    matchedRuleCategory: row.matched_rule_category ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}

/**
 * DTO for creating a process log entry
 */
export interface CreateProcessLogDTO {
  recipient: string;
  sender: string;
  senderEmail: string;
  subject: string;
  action: ProcessAction;
  matchedRuleId?: string;
  matchedRuleCategory?: string;
  errorMessage?: string;
}


/**
 * Process Log Repository class for managing email processing logs
 */
export class ProcessLogRepository {
  constructor(private db: D1Database) {}

  /**
   * Create a new process log entry
   */
  async create(dto: CreateProcessLogDTO): Promise<ProcessLog> {
    const id = generateId();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO process_logs (id, recipient, sender, sender_email, subject, processed_at, action, matched_rule_id, matched_rule_category, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        dto.recipient,
        dto.sender,
        dto.senderEmail,
        dto.subject,
        now,
        dto.action,
        dto.matchedRuleId ?? null,
        dto.matchedRuleCategory ?? null,
        dto.errorMessage ?? null
      )
      .run();

    return {
      id,
      recipient: dto.recipient,
      sender: dto.sender,
      senderEmail: dto.senderEmail,
      subject: dto.subject,
      processedAt: new Date(now),
      action: dto.action,
      matchedRuleId: dto.matchedRuleId,
      matchedRuleCategory: dto.matchedRuleCategory,
      errorMessage: dto.errorMessage,
    };
  }

  /**
   * Get a process log by ID
   */
  async findById(id: string): Promise<ProcessLog | null> {
    const result = await this.db
      .prepare('SELECT * FROM process_logs WHERE id = ?')
      .bind(id)
      .first<ProcessLogRow>();

    return result ? rowToProcessLog(result) : null;
  }

  /**
   * Query process logs with filters
   */
  async findWithFilter(filter: LogFilter): Promise<ProcessLog[]> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    // Time range filter
    if (filter.startDate) {
      conditions.push('processed_at >= ?');
      values.push(filter.startDate.toISOString());
    }
    if (filter.endDate) {
      conditions.push('processed_at <= ?');
      values.push(filter.endDate.toISOString());
    }

    // Action filter
    if (filter.action) {
      conditions.push('action = ?');
      values.push(filter.action);
    }

    // Rule category filter
    if (filter.ruleCategory) {
      conditions.push('matched_rule_category = ?');
      values.push(filter.ruleCategory);
    }

    let sql = 'SELECT * FROM process_logs';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY processed_at DESC';

    // Pagination
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    const stmt = this.db.prepare(sql);
    const result = values.length > 0
      ? await stmt.bind(...values).all<ProcessLogRow>()
      : await stmt.all<ProcessLogRow>();

    return (result.results || []).map(rowToProcessLog);
  }

  /**
   * Get all process logs (with default limit)
   */
  async findAll(limit: number = 100, offset: number = 0): Promise<ProcessLog[]> {
    return this.findWithFilter({ limit, offset });
  }

  /**
   * Count process logs matching filter
   */
  async countWithFilter(filter: Omit<LogFilter, 'limit' | 'offset'>): Promise<number> {
    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (filter.startDate) {
      conditions.push('processed_at >= ?');
      values.push(filter.startDate.toISOString());
    }
    if (filter.endDate) {
      conditions.push('processed_at <= ?');
      values.push(filter.endDate.toISOString());
    }
    if (filter.action) {
      conditions.push('action = ?');
      values.push(filter.action);
    }
    if (filter.ruleCategory) {
      conditions.push('matched_rule_category = ?');
      values.push(filter.ruleCategory);
    }

    let sql = 'SELECT COUNT(*) as count FROM process_logs';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const stmt = this.db.prepare(sql);
    const result = values.length > 0
      ? await stmt.bind(...values).first<{ count: number }>()
      : await stmt.first<{ count: number }>();

    return result?.count ?? 0;
  }

  /**
   * Delete old process logs (for cleanup)
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM process_logs WHERE processed_at < ?')
      .bind(date.toISOString())
      .run();

    return result.meta.changes ?? 0;
  }
}
