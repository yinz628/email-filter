import type { Database } from 'better-sqlite3';

export type LogCategory = 'email_forward' | 'email_drop' | 'admin_action' | 'system';
export type LogLevel = 'info' | 'warn' | 'error';

export interface SystemLog {
  id: number;
  category: LogCategory;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
  workerName: string;
  createdAt: Date;
}

interface LogRow {
  id: number;
  category: string;
  level: string;
  message: string;
  details: string | null;
  worker_name: string;
  created_at: string;
}

export interface LogFilter {
  category?: LogCategory;
  level?: LogLevel;
  workerName?: string;
  limit?: number;
  offset?: number;
  search?: string;
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
      workerName: row.worker_name || 'global',
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Create a new log entry
   */
  create(category: LogCategory, message: string, details?: Record<string, unknown>, level: LogLevel = 'info', workerName: string = 'global'): SystemLog {
    const now = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    const stmt = this.db.prepare(`
      INSERT INTO system_logs (category, level, message, details, worker_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(category, level, message, detailsJson, workerName, now);

    return {
      id: result.lastInsertRowid as number,
      category,
      level,
      message,
      details,
      workerName,
      createdAt: new Date(now),
    };
  }

  /**
   * Batch create log entries
   * Requirements: 3.3 - Combine similar operations into single database writes
   * 
   * @param entries - Array of log entries to insert
   * @returns Number of entries inserted
   */
  createBatch(entries: Array<{
    category: LogCategory;
    message: string;
    details?: Record<string, unknown>;
    level?: LogLevel;
    workerName?: string;
  }>): number {
    if (entries.length === 0) return 0;

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO system_logs (category, level, message, details, worker_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((logs: typeof entries) => {
      let count = 0;
      for (const log of logs) {
        const detailsJson = log.details ? JSON.stringify(log.details) : null;
        stmt.run(
          log.category,
          log.level || 'info',
          log.message,
          detailsJson,
          log.workerName || 'global',
          now
        );
        count++;
      }
      return count;
    });

    return insertMany(entries);
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
    if (filter?.workerName) {
      query += ' AND worker_name = ?';
      params.push(filter.workerName);
    }
    if (filter?.search) {
      query += ' AND (message LIKE ? OR details LIKE ?)';
      const searchPattern = `%${filter.search}%`;
      params.push(searchPattern, searchPattern);
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
   * Delete logs by IDs
   */
  deleteByIds(ids: number[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM system_logs WHERE id IN (${placeholders})`);
    const result = stmt.run(...ids);
    return result.changes;
  }

  /**
   * Delete logs by search criteria
   */
  deleteBySearch(search: string, category?: LogCategory): number {
    let query = 'DELETE FROM system_logs WHERE (message LIKE ? OR details LIKE ?)';
    const searchPattern = `%${search}%`;
    const params: string[] = [searchPattern, searchPattern];
    
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    
    const stmt = this.db.prepare(query);
    const result = stmt.run(...params);
    return result.changes;
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

  /**
   * Delete logs older than specified date
   * Used for cleanup service
   */
  deleteOlderThan(date: Date): number {
    const stmt = this.db.prepare('DELETE FROM system_logs WHERE created_at < ?');
    const result = stmt.run(date.toISOString());
    return result.changes;
  }

  /**
   * Get top blocked rules by count in recent time period
   * @param hours - Time period in hours (default: 24)
   * @param limit - Max number of results (default: 5)
   * @param workerName - Optional worker name filter
   * @returns Array of trending rules with worker breakdown
   * 
   * Requirements: 3.1, 3.2, 3.3
   */
  getTopBlockedRules(hours: number = 24, limit: number = 5, workerName?: string): { pattern: string; count: number; lastSeen: string; workerBreakdown: { workerName: string; count: number }[] }[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const params: (string | number)[] = [cutoff];

    let workerFilter = '';
    if (workerName) {
      workerFilter = ' AND worker_name = ?';
      params.push(workerName);
    }

    params.push(limit);

    // Query logs where category is email_drop and extract matchedRule from details JSON
    const stmt = this.db.prepare(`
      SELECT 
        json_extract(details, '$.matchedRule') as pattern,
        COUNT(*) as count,
        MAX(created_at) as last_seen
      FROM system_logs 
      WHERE category = 'email_drop' 
        AND created_at >= ?
        AND json_extract(details, '$.matchedRule') IS NOT NULL
        ${workerFilter}
      GROUP BY json_extract(details, '$.matchedRule')
      ORDER BY count DESC
      LIMIT ?
    `);

    const rows = stmt.all(...params) as { pattern: string; count: number; last_seen: string }[];

    // Get worker breakdown for each pattern
    const results = rows.map((row) => {
      const workerBreakdown = this.getWorkerBreakdownForPattern(row.pattern, cutoff, workerName);
      return {
        pattern: row.pattern,
        count: row.count,
        lastSeen: row.last_seen,
        workerBreakdown,
      };
    });

    return results;
  }

  /**
   * Get worker breakdown for a specific pattern
   * @param pattern - The matched rule pattern
   * @param cutoff - ISO timestamp cutoff for time filtering
   * @param workerName - Optional worker name filter
   * @returns Array of worker name and count pairs
   * 
   * Requirements: 3.2
   */
  private getWorkerBreakdownForPattern(pattern: string, cutoff: string, workerName?: string): { workerName: string; count: number }[] {
    const params: string[] = [cutoff, pattern];

    let workerFilter = '';
    if (workerName) {
      workerFilter = ' AND worker_name = ?';
      params.push(workerName);
    }

    const stmt = this.db.prepare(`
      SELECT 
        worker_name,
        COUNT(*) as count
      FROM system_logs 
      WHERE category = 'email_drop' 
        AND created_at >= ?
        AND json_extract(details, '$.matchedRule') = ?
        ${workerFilter}
      GROUP BY worker_name
      ORDER BY count DESC
    `);

    const rows = stmt.all(...params) as { worker_name: string; count: number }[];

    return rows.map((row) => ({
      workerName: row.worker_name || 'global',
      count: row.count,
    }));
  }
}
