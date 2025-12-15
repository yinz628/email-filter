import type { Database } from 'better-sqlite3';

export type LogCategory = 'email_forward' | 'email_drop' | 'admin_action' | 'system';
export type LogLevel = 'info' | 'warn' | 'error';

export interface SystemLog {
  id: number;
  category: LogCategory;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

interface LogRow {
  id: number;
  category: string;
  level: string;
  message: string;
  details: string | null;
  created_at: string;
}

export interface LogFilter {
  category?: LogCategory;
  level?: LogLevel;
  limit?: number;
  offset?: number;
}

/**
 * Repository for system logs
 */
export class LogRepository {
  constructor(private db: Database) {}

  private rowToLog(row: LogRow): SystemLog {
    return {
      id: row.id,
      category: row.category as LogCategory,
      level: row.level as LogLevel,
      message: row.message,
      details: row.details ? JSON.parse(row.details) : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Create a new log entry
   */
  create(category: LogCategory, message: string, details?: Record<string, unknown>, level: LogLevel = 'info'): SystemLog {
    const now = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    const stmt = this.db.prepare(`
      INSERT INTO system_logs (category, level, message, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(category, level, message, detailsJson, now);

    return {
      id: result.lastInsertRowid as number,
      category,
      level,
      message,
      details,
      createdAt: new Date(now),
    };
  }

  /**
   * Get logs with optional filtering
   */
  findAll(filter?: LogFilter): SystemLog[] {
    let query = 'SELECT * FROM system_logs WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.category) {
      query += ' AND category = ?';
      params.push(filter.category);
    }
    if (filter?.level) {
      query += ' AND level = ?';
      params.push(filter.level);
    }

    query += ' ORDER BY created_at DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
      if (filter?.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as LogRow[];
    return rows.map(row => this.rowToLog(row));
  }

  /**
   * Count logs by category
   */
  countByCategory(): Record<LogCategory, number> {
    const stmt = this.db.prepare(`
      SELECT category, COUNT(*) as count FROM system_logs GROUP BY category
    `);
    const rows = stmt.all() as { category: string; count: number }[];
    
    const result: Record<LogCategory, number> = {
      email_forward: 0,
      email_drop: 0,
      admin_action: 0,
      system: 0,
    };
    
    for (const row of rows) {
      result[row.category as LogCategory] = row.count;
    }
    return result;
  }

  /**
   * Delete old logs (keep last N days)
   */
  cleanup(daysToKeep: number = 7): number {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    const stmt = this.db.prepare('DELETE FROM system_logs WHERE created_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }
}
