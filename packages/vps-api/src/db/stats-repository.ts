import type { Database } from 'better-sqlite3';

export interface RuleStats {
  ruleId: string;
  totalProcessed: number;
  deletedCount: number;
  errorCount: number;
  lastUpdated: Date;
}

interface StatsRow {
  rule_id: string;
  total_processed: number;
  deleted_count: number;
  error_count: number;
  last_updated: string;
}

export interface OverallStats {
  totalRules: number;
  enabledRules: number;
  totalProcessed: number;
  totalForwarded: number;
  totalDeleted: number;
  totalErrors: number;
}

/**
 * Repository for rule statistics operations
 */
export class StatsRepository {
  constructor(private db: Database) {}

  /**
   * Convert database row to RuleStats
   */
  private rowToStats(row: StatsRow): RuleStats {
    return {
      ruleId: row.rule_id,
      totalProcessed: row.total_processed,
      deletedCount: row.deleted_count,
      errorCount: row.error_count,
      lastUpdated: new Date(row.last_updated),
    };
  }

  /**
   * Get stats for a specific rule
   */
  findByRuleId(ruleId: string): RuleStats | null {
    const stmt = this.db.prepare('SELECT * FROM rule_stats WHERE rule_id = ?');
    const row = stmt.get(ruleId) as StatsRow | undefined;
    return row ? this.rowToStats(row) : null;
  }

  /**
   * Get stats for all rules
   */
  findAll(): RuleStats[] {
    const stmt = this.db.prepare('SELECT * FROM rule_stats ORDER BY total_processed DESC');
    const rows = stmt.all() as StatsRow[];
    return rows.map((row) => this.rowToStats(row));
  }

  /**
   * Increment processed count for a rule
   */
  incrementProcessed(ruleId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE rule_stats 
      SET total_processed = total_processed + 1, last_updated = ?
      WHERE rule_id = ?
    `);
    stmt.run(now, ruleId);
  }

  /**
   * Increment deleted count for a rule
   */
  incrementDeleted(ruleId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE rule_stats 
      SET deleted_count = deleted_count + 1, total_processed = total_processed + 1, last_updated = ?
      WHERE rule_id = ?
    `);
    stmt.run(now, ruleId);
  }

  /**
   * Increment error count for a rule
   */
  incrementError(ruleId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE rule_stats 
      SET error_count = error_count + 1, last_updated = ?
      WHERE rule_id = ?
    `);
    stmt.run(now, ruleId);
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): OverallStats {
    const rulesStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_rules,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled_rules
      FROM filter_rules
    `);
    const rulesResult = rulesStmt.get() as { total_rules: number; enabled_rules: number };

    // Get global stats
    const globalStmt = this.db.prepare(`
      SELECT total_processed, total_forwarded, total_deleted
      FROM global_stats WHERE id = 1
    `);
    const globalResult = globalStmt.get() as { total_processed: number; total_forwarded: number; total_deleted: number } | undefined;

    // Get error count from rule_stats
    const errorStmt = this.db.prepare(`
      SELECT COALESCE(SUM(error_count), 0) as total_errors FROM rule_stats
    `);
    const errorResult = errorStmt.get() as { total_errors: number };

    return {
      totalRules: rulesResult.total_rules,
      enabledRules: rulesResult.enabled_rules || 0,
      totalProcessed: globalResult?.total_processed || 0,
      totalForwarded: globalResult?.total_forwarded || 0,
      totalDeleted: globalResult?.total_deleted || 0,
      totalErrors: errorResult.total_errors,
    };
  }

  /**
   * Increment global processed count (email forwarded)
   */
  incrementGlobalForwarded(): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE global_stats 
      SET total_processed = total_processed + 1, 
          total_forwarded = total_forwarded + 1, 
          last_updated = ?
      WHERE id = 1
    `).run(now);
  }

  /**
   * Increment global deleted count (email dropped)
   */
  incrementGlobalDeleted(): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE global_stats 
      SET total_processed = total_processed + 1, 
          total_deleted = total_deleted + 1, 
          last_updated = ?
      WHERE id = 1
    `).run(now);
  }

  /**
   * Initialize global stats table if not exists
   */
  initGlobalStats(): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO global_stats (id, total_processed, total_forwarded, total_deleted, last_updated)
      VALUES (1, 0, 0, 0, datetime('now'))
    `).run();
  }

  /**
   * Create stats record for a rule (usually called when creating a rule)
   */
  create(ruleId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
      VALUES (?, 0, 0, 0, ?)
    `);
    stmt.run(ruleId, now);
  }

  /**
   * Delete stats for a rule
   */
  delete(ruleId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM rule_stats WHERE rule_id = ?');
    const result = stmt.run(ruleId);
    return result.changes > 0;
  }
}
