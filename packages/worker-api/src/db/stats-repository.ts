/**
 * Stats Repository
 * Handles CRUD operations for rule statistics in D1 database
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 * - Query statistics by rule category
 * - Track total processed, deleted count, and error count
 * - Cascade delete statistics when rule is deleted
 * - Real-time update of statistics when emails are processed
 */

import type { RuleStats, StatsSummary, RuleCategory } from '@email-filter/shared';

/**
 * Database row type for rule_stats table
 */
interface RuleStatsRow {
  rule_id: string;
  total_processed: number;
  deleted_count: number;
  error_count: number;
  last_updated: string;
}

/**
 * Extended stats row with rule information for category queries
 */
interface RuleStatsWithCategoryRow extends RuleStatsRow {
  category: string;
  pattern: string;
  enabled: number;
}

/**
 * Convert database row to RuleStats object
 */
function rowToRuleStats(row: RuleStatsRow): RuleStats {
  return {
    ruleId: row.rule_id,
    totalProcessed: row.total_processed,
    deletedCount: row.deleted_count,
    errorCount: row.error_count,
    lastUpdated: new Date(row.last_updated),
  };
}

/**
 * Stats Repository class for managing rule statistics
 */
export class StatsRepository {
  constructor(private db: D1Database) {}

  /**
   * Get statistics for a specific rule
   */
  async findByRuleId(ruleId: string): Promise<RuleStats | null> {
    const result = await this.db
      .prepare('SELECT * FROM rule_stats WHERE rule_id = ?')
      .bind(ruleId)
      .first<RuleStatsRow>();

    return result ? rowToRuleStats(result) : null;
  }


  /**
   * Get all rule statistics
   */
  async findAll(): Promise<RuleStats[]> {
    const result = await this.db
      .prepare('SELECT * FROM rule_stats ORDER BY last_updated DESC')
      .all<RuleStatsRow>();

    return (result.results || []).map(rowToRuleStats);
  }

  /**
   * Get statistics for rules in a specific category
   * Joins with filter_rules table to filter by category
   */
  async findByCategory(category: RuleCategory): Promise<RuleStats[]> {
    const result = await this.db
      .prepare(
        `SELECT rs.* FROM rule_stats rs
         INNER JOIN filter_rules fr ON rs.rule_id = fr.id
         WHERE fr.category = ?
         ORDER BY rs.last_updated DESC`
      )
      .bind(category)
      .all<RuleStatsRow>();

    return (result.results || []).map(rowToRuleStats);
  }

  /**
   * Create initial statistics record for a rule
   */
  async create(ruleId: string): Promise<RuleStats> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
         VALUES (?, 0, 0, 0, ?)`
      )
      .bind(ruleId, now)
      .run();

    return {
      ruleId,
      totalProcessed: 0,
      deletedCount: 0,
      errorCount: 0,
      lastUpdated: new Date(now),
    };
  }

  /**
   * Increment statistics counters for a rule
   * 
   * @param ruleId - The rule ID to update
   * @param action - The action taken ('passed', 'deleted', 'error')
   */
  async incrementStats(
    ruleId: string,
    action: 'passed' | 'deleted' | 'error'
  ): Promise<RuleStats | null> {
    const now = new Date().toISOString();

    // Build the update query based on action
    let updateQuery: string;
    if (action === 'deleted') {
      updateQuery = `
        UPDATE rule_stats 
        SET total_processed = total_processed + 1,
            deleted_count = deleted_count + 1,
            last_updated = ?
        WHERE rule_id = ?
      `;
    } else if (action === 'error') {
      updateQuery = `
        UPDATE rule_stats 
        SET total_processed = total_processed + 1,
            error_count = error_count + 1,
            last_updated = ?
        WHERE rule_id = ?
      `;
    } else {
      // 'passed' - only increment total_processed
      updateQuery = `
        UPDATE rule_stats 
        SET total_processed = total_processed + 1,
            last_updated = ?
        WHERE rule_id = ?
      `;
    }

    await this.db.prepare(updateQuery).bind(now, ruleId).run();

    return this.findByRuleId(ruleId);
  }


  /**
   * Delete statistics for a rule (cascade delete)
   * Called when a rule is deleted
   */
  async deleteByRuleId(ruleId: string): Promise<boolean> {
    const existing = await this.findByRuleId(ruleId);
    if (!existing) {
      return false;
    }

    await this.db
      .prepare('DELETE FROM rule_stats WHERE rule_id = ?')
      .bind(ruleId)
      .run();

    return true;
  }

  /**
   * Get summary statistics across all rules
   */
  async getSummary(): Promise<StatsSummary> {
    // Get total and active rule counts
    const ruleCountResult = await this.db
      .prepare(
        `SELECT 
           COUNT(*) as total_rules,
           SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as active_rules
         FROM filter_rules`
      )
      .first<{ total_rules: number; active_rules: number }>();

    // Get aggregated statistics
    const statsResult = await this.db
      .prepare(
        `SELECT 
           COALESCE(SUM(total_processed), 0) as total_processed,
           COALESCE(SUM(deleted_count), 0) as total_deleted,
           COALESCE(SUM(error_count), 0) as total_errors
         FROM rule_stats`
      )
      .first<{ total_processed: number; total_deleted: number; total_errors: number }>();

    return {
      totalRules: ruleCountResult?.total_rules ?? 0,
      activeRules: ruleCountResult?.active_rules ?? 0,
      totalProcessed: statsResult?.total_processed ?? 0,
      totalDeleted: statsResult?.total_deleted ?? 0,
      totalErrors: statsResult?.total_errors ?? 0,
    };
  }

  /**
   * Reset statistics for a rule
   */
  async resetStats(ruleId: string): Promise<RuleStats | null> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE rule_stats 
         SET total_processed = 0, deleted_count = 0, error_count = 0, last_updated = ?
         WHERE rule_id = ?`
      )
      .bind(now, ruleId)
      .run();

    return this.findByRuleId(ruleId);
  }

  /**
   * Ensure stats record exists for a rule (create if not exists)
   */
  async ensureExists(ruleId: string): Promise<RuleStats> {
    const existing = await this.findByRuleId(ruleId);
    if (existing) {
      return existing;
    }
    return this.create(ruleId);
  }
}
