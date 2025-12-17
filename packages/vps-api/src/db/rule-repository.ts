import type { Database } from 'better-sqlite3';
import type { FilterRule, CreateRuleDTO, UpdateRuleDTO, RuleCategory, MatchType, MatchMode } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

interface RuleRow {
  id: string;
  worker_id: string | null;
  category: string;
  match_type: string;
  match_mode: string;
  pattern: string;
  tags: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
  last_hit_at: string | null;
}

// Extend FilterRule to include workerId
export interface FilterRuleWithWorker extends FilterRule {
  workerId?: string;
}

/**
 * Repository for filter rule CRUD operations
 */
export class RuleRepository {
  constructor(private db: Database) {}

  /**
   * Convert database row to FilterRule
   */
  private rowToRule(row: RuleRow): FilterRuleWithWorker {
    return {
      id: row.id,
      workerId: row.worker_id || undefined,
      category: row.category as RuleCategory,
      matchType: row.match_type as MatchType,
      matchMode: row.match_mode as MatchMode,
      pattern: row.pattern,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastHitAt: row.last_hit_at ? new Date(row.last_hit_at) : undefined,
    };
  }

  /**
   * Check if a duplicate rule exists
   */
  findDuplicate(dto: CreateRuleDTO, workerId?: string): FilterRuleWithWorker | null {
    const stmt = this.db.prepare(`
      SELECT * FROM filter_rules 
      WHERE (worker_id = ? OR (worker_id IS NULL AND ? IS NULL))
        AND category = ? 
        AND match_type = ? 
        AND match_mode = ? 
        AND pattern = ?
      LIMIT 1
    `);
    const row = stmt.get(workerId || null, workerId || null, dto.category, dto.matchType, dto.matchMode, dto.pattern) as RuleRow | undefined;
    return row ? this.rowToRule(row) : null;
  }

  /**
   * Create a new filter rule
   * @param dto - Rule data
   * @param workerId - Optional worker ID to associate the rule with
   * @throws Error if duplicate rule exists
   */
  create(dto: CreateRuleDTO, workerId?: string): FilterRuleWithWorker {
    // Check for duplicate
    const existing = this.findDuplicate(dto, workerId);
    if (existing) {
      throw new Error('DUPLICATE_RULE');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;
    const tags = dto.tags ? JSON.stringify(dto.tags) : null;

    const stmt = this.db.prepare(`
      INSERT INTO filter_rules (id, worker_id, category, match_type, match_mode, pattern, tags, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, workerId || null, dto.category, dto.matchType, dto.matchMode, dto.pattern, tags, enabled ? 1 : 0, now, now);

    // Create associated stats record
    const statsStmt = this.db.prepare(`
      INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
      VALUES (?, 0, 0, 0, ?)
    `);
    statsStmt.run(id, now);

    return {
      id,
      workerId,
      category: dto.category,
      matchType: dto.matchType,
      matchMode: dto.matchMode,
      pattern: dto.pattern,
      tags: dto.tags,
      enabled,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Get a rule by ID
   */
  findById(id: string): FilterRuleWithWorker | null {
    const stmt = this.db.prepare('SELECT * FROM filter_rules WHERE id = ?');
    const row = stmt.get(id) as RuleRow | undefined;
    return row ? this.rowToRule(row) : null;
  }

  /**
   * Get all rules with optional pagination and worker filter
   */
  findAll(options?: { limit?: number; offset?: number; category?: RuleCategory; workerId?: string }): FilterRuleWithWorker[] {
    let query = 'SELECT * FROM filter_rules WHERE 1=1';
    const params: (string | number)[] = [];

    if (options?.category) {
      query += ' AND category = ?';
      params.push(options.category);
    }

    if (options?.workerId) {
      query += ' AND worker_id = ?';
      params.push(options.workerId);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
      if (options?.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as RuleRow[];
    return rows.map((row) => this.rowToRule(row));
  }

  /**
   * Get all enabled rules, optionally filtered by worker
   * @param workerId - If provided, returns rules for this worker + global rules (worker_id IS NULL)
   */
  findEnabled(workerId?: string): FilterRuleWithWorker[] {
    let query: string;
    let rows: RuleRow[];

    if (workerId) {
      // Get rules specific to this worker OR global rules (worker_id IS NULL)
      query = 'SELECT * FROM filter_rules WHERE enabled = 1 AND (worker_id = ? OR worker_id IS NULL) ORDER BY created_at DESC';
      rows = this.db.prepare(query).all(workerId) as RuleRow[];
    } else {
      // Get all enabled rules
      query = 'SELECT * FROM filter_rules WHERE enabled = 1 ORDER BY created_at DESC';
      rows = this.db.prepare(query).all() as RuleRow[];
    }

    return rows.map((row) => this.rowToRule(row));
  }

  /**
   * Get rules by worker ID
   */
  findByWorkerId(workerId: string): FilterRuleWithWorker[] {
    const stmt = this.db.prepare('SELECT * FROM filter_rules WHERE worker_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(workerId) as RuleRow[];
    return rows.map((row) => this.rowToRule(row));
  }

  /**
   * Get global rules (not associated with any worker)
   */
  findGlobal(): FilterRuleWithWorker[] {
    const stmt = this.db.prepare('SELECT * FROM filter_rules WHERE worker_id IS NULL ORDER BY created_at DESC');
    const rows = stmt.all() as RuleRow[];
    return rows.map((row) => this.rowToRule(row));
  }

  /**
   * Update a rule
   */
  update(id: string, dto: UpdateRuleDTO & { workerId?: string | null }): FilterRuleWithWorker | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (dto.category !== undefined) {
      updates.push('category = ?');
      params.push(dto.category);
    }
    if (dto.matchType !== undefined) {
      updates.push('match_type = ?');
      params.push(dto.matchType);
    }
    if (dto.matchMode !== undefined) {
      updates.push('match_mode = ?');
      params.push(dto.matchMode);
    }
    if (dto.pattern !== undefined) {
      updates.push('pattern = ?');
      params.push(dto.pattern);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(dto.enabled ? 1 : 0);
    }
    if (dto.workerId !== undefined) {
      updates.push('worker_id = ?');
      params.push(dto.workerId);
    }
    if (dto.tags !== undefined) {
      updates.push('tags = ?');
      params.push(dto.tags ? JSON.stringify(dto.tags) : null);
    }

    params.push(id);

    const stmt = this.db.prepare(`UPDATE filter_rules SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...params);

    return this.findById(id);
  }

  /**
   * Toggle rule enabled status
   */
  toggle(id: string): FilterRuleWithWorker | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const newEnabled = existing.enabled ? 0 : 1;

    const stmt = this.db.prepare('UPDATE filter_rules SET enabled = ?, updated_at = ? WHERE id = ?');
    stmt.run(newEnabled, now, id);

    return this.findById(id);
  }

  /**
   * Delete a rule (cascade deletes stats)
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM filter_rules WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Update last hit timestamp
   */
  updateLastHit(id: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE filter_rules SET last_hit_at = ? WHERE id = ?');
    stmt.run(now, id);
  }

  /**
   * Count total rules
   */
  count(category?: RuleCategory): number {
    let query = 'SELECT COUNT(*) as count FROM filter_rules';
    const params: string[] = [];

    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }
}
