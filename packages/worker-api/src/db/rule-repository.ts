/**
 * Rule Repository
 * Handles CRUD operations for filter rules in D1 database
 */

import type {
  FilterRule,
  CreateRuleDTO,
  UpdateRuleDTO,
  RuleCategory,
} from '@email-filter/shared';
import { generateId } from './index.js';

/**
 * Database row type for filter_rules table
 */
interface FilterRuleRow {
  id: string;
  category: string;
  match_type: string;
  match_mode: string;
  pattern: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  last_hit_at: string | null;
}

/**
 * Convert database row to FilterRule object
 */
function rowToFilterRule(row: FilterRuleRow): FilterRule {
  return {
    id: row.id,
    category: row.category as RuleCategory,
    matchType: row.match_type as FilterRule['matchType'],
    matchMode: row.match_mode as FilterRule['matchMode'],
    pattern: row.pattern,
    enabled: row.enabled === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    lastHitAt: row.last_hit_at ? new Date(row.last_hit_at) : undefined,
  };
}

/**
 * Rule Repository class for managing filter rules
 */
export class RuleRepository {
  constructor(private db: D1Database) {}

  /**
   * Get all filter rules
   */
  async findAll(): Promise<FilterRule[]> {
    const result = await this.db
      .prepare('SELECT * FROM filter_rules ORDER BY created_at DESC')
      .all<FilterRuleRow>();

    return (result.results || []).map(rowToFilterRule);
  }

  /**
   * Get filter rules by category
   */
  async findByCategory(category: RuleCategory): Promise<FilterRule[]> {
    const result = await this.db
      .prepare('SELECT * FROM filter_rules WHERE category = ? ORDER BY created_at DESC')
      .bind(category)
      .all<FilterRuleRow>();

    return (result.results || []).map(rowToFilterRule);
  }

  /**
   * Get a single filter rule by ID
   */
  async findById(id: string): Promise<FilterRule | null> {
    const result = await this.db
      .prepare('SELECT * FROM filter_rules WHERE id = ?')
      .bind(id)
      .first<FilterRuleRow>();

    return result ? rowToFilterRule(result) : null;
  }

  /**
   * Get all enabled filter rules
   * Optimized: Only select fields needed for filtering
   */
  async findEnabled(): Promise<FilterRule[]> {
    const result = await this.db
      .prepare('SELECT id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at FROM filter_rules WHERE enabled = 1 ORDER BY category, created_at DESC')
      .all<FilterRuleRow>();

    return (result.results || []).map(rowToFilterRule);
  }

  /**
   * Get enabled filter rules by category
   */
  async findEnabledByCategory(category: RuleCategory): Promise<FilterRule[]> {
    const result = await this.db
      .prepare('SELECT * FROM filter_rules WHERE category = ? AND enabled = 1 ORDER BY created_at DESC')
      .bind(category)
      .all<FilterRuleRow>();

    return (result.results || []).map(rowToFilterRule);
  }

  /**
   * Create a new filter rule
   */
  async create(dto: CreateRuleDTO): Promise<FilterRule> {
    const id = generateId();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    await this.db
      .prepare(
        `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, dto.category, dto.matchType, dto.matchMode, dto.pattern, enabled ? 1 : 0, now, now)
      .run();


    // Also create initial stats record for this rule
    await this.db
      .prepare(
        `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
         VALUES (?, 0, 0, 0, ?)`
      )
      .bind(id, now)
      .run();

    return {
      id,
      category: dto.category,
      matchType: dto.matchType,
      matchMode: dto.matchMode,
      pattern: dto.pattern,
      enabled,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Update an existing filter rule
   */
  async update(id: string, dto: UpdateRuleDTO): Promise<FilterRule | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (dto.category !== undefined) {
      updates.push('category = ?');
      values.push(dto.category);
    }
    if (dto.matchType !== undefined) {
      updates.push('match_type = ?');
      values.push(dto.matchType);
    }
    if (dto.matchMode !== undefined) {
      updates.push('match_mode = ?');
      values.push(dto.matchMode);
    }
    if (dto.pattern !== undefined) {
      updates.push('pattern = ?');
      values.push(dto.pattern);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(dto.enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.db
      .prepare(`UPDATE filter_rules SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return this.findById(id);
  }


  /**
   * Toggle the enabled status of a filter rule
   */
  async toggleEnabled(id: string): Promise<FilterRule | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const newEnabled = !existing.enabled;

    await this.db
      .prepare('UPDATE filter_rules SET enabled = ?, updated_at = ? WHERE id = ?')
      .bind(newEnabled ? 1 : 0, now, id)
      .run();

    return this.findById(id);
  }

  /**
   * Delete a filter rule and its associated statistics
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    // Delete associated stats first (cascade)
    await this.db
      .prepare('DELETE FROM rule_stats WHERE rule_id = ?')
      .bind(id)
      .run();

    // Delete the rule
    await this.db
      .prepare('DELETE FROM filter_rules WHERE id = ?')
      .bind(id)
      .run();

    return true;
  }

  /**
   * Update the last hit timestamp for a rule
   */
  async updateLastHitAt(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE filter_rules SET last_hit_at = ?, updated_at = ? WHERE id = ?')
      .bind(now, now, id)
      .run();
  }

  /**
   * Get dynamic rules that have expired (no hits within expiration period)
   */
  async findExpiredDynamicRules(expirationHours: number): Promise<FilterRule[]> {
    const cutoffTime = new Date(Date.now() - expirationHours * 60 * 60 * 1000).toISOString();
    
    const result = await this.db
      .prepare(
        `SELECT * FROM filter_rules 
         WHERE category = 'dynamic' 
         AND (last_hit_at IS NULL OR last_hit_at < ?)
         ORDER BY created_at DESC`
      )
      .bind(cutoffTime)
      .all<FilterRuleRow>();

    return (result.results || []).map(rowToFilterRule);
  }
}
