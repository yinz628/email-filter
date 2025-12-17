import type { Database } from 'better-sqlite3';
import type { EmailHit, EmailMetadata } from '@email-filter/shared';

interface HitLogRow {
  id: number;
  rule_id: string;
  sender: string;
  subject: string;
  recipient: string;
  received_at: string;
  created_at: string;
}

/**
 * Repository for email hit log operations
 */
export class HitLogRepository {
  constructor(private db: Database) {}

  /**
   * Convert database row to EmailHit
   */
  private rowToHit(row: HitLogRow): EmailHit {
    return {
      id: row.id,
      ruleId: row.rule_id,
      sender: row.sender,
      subject: row.subject,
      recipient: row.recipient,
      receivedAt: new Date(row.received_at),
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Create a new hit log record
   */
  create(ruleId: string, email: EmailMetadata): EmailHit {
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO hit_logs (rule_id, sender, subject, recipient, received_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      ruleId,
      email.sender,
      email.subject,
      email.recipient,
      email.receivedAt.toISOString(),
      now
    );

    return {
      id: result.lastInsertRowid as number,
      ruleId,
      sender: email.sender,
      subject: email.subject,
      recipient: email.recipient,
      receivedAt: email.receivedAt,
      createdAt: new Date(now),
    };
  }


  /**
   * Get hit logs by rule ID
   */
  getByRuleId(ruleId: string, limit?: number): EmailHit[] {
    let query = 'SELECT * FROM hit_logs WHERE rule_id = ? ORDER BY created_at DESC';
    const params: (string | number)[] = [ruleId];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as HitLogRow[];
    return rows.map((row) => this.rowToHit(row));
  }

  /**
   * Get hit logs within a time window
   */
  getByTimeWindow(ruleId: string, startTime: Date, endTime: Date): EmailHit[] {
    const stmt = this.db.prepare(`
      SELECT * FROM hit_logs 
      WHERE rule_id = ? AND received_at >= ? AND received_at <= ?
      ORDER BY received_at DESC
    `);
    const rows = stmt.all(ruleId, startTime.toISOString(), endTime.toISOString()) as HitLogRow[];
    return rows.map((row) => this.rowToHit(row));
  }

  /**
   * Count hits within a time window
   */
  countByTimeWindow(ruleId: string, startTime: Date, endTime: Date): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM hit_logs 
      WHERE rule_id = ? AND received_at >= ? AND received_at <= ?
    `);
    const result = stmt.get(ruleId, startTime.toISOString(), endTime.toISOString()) as { count: number };
    return result.count;
  }

  /**
   * Delete hit logs older than specified date
   * Used for cleanup (48-72 hours retention)
   */
  deleteOlderThan(date: Date): number {
    const stmt = this.db.prepare('DELETE FROM hit_logs WHERE created_at < ?');
    const result = stmt.run(date.toISOString());
    return result.changes;
  }

  /**
   * Get recent hits for all rules
   */
  getRecent(limit: number = 100): EmailHit[] {
    const stmt = this.db.prepare(
      'SELECT * FROM hit_logs ORDER BY created_at DESC LIMIT ?'
    );
    const rows = stmt.all(limit) as HitLogRow[];
    return rows.map((row) => this.rowToHit(row));
  }

  /**
   * Count total hits for a rule
   */
  countByRuleId(ruleId: string): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM hit_logs WHERE rule_id = ?');
    const result = stmt.get(ruleId) as { count: number };
    return result.count;
  }
}
