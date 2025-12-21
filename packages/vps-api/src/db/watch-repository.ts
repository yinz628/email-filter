import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface WatchRule {
  id: string;
  name: string;
  matchType: 'sender' | 'subject' | 'domain';
  matchMode: 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  pattern: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchStats {
  ruleId: string;
  hitCount: number;
  lastHitAt: Date | null;
}

export interface WatchRuleWithStats extends WatchRule {
  hitCount: number;
  lastHitAt: Date | null;
}

interface WatchRuleRow {
  id: string;
  name: string;
  match_type: string;
  match_mode: string;
  pattern: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWatchRuleDTO {
  name: string;
  matchType: 'sender' | 'subject' | 'domain';
  matchMode: 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';
  pattern: string;
}

/**
 * Repository for watch rules (statistics tracking rules)
 */
export class WatchRepository {
  constructor(private db: Database) {}

  private rowToRule(row: WatchRuleRow): WatchRule {
    return {
      id: row.id,
      name: row.name,
      matchType: row.match_type as WatchRule['matchType'],
      matchMode: row.match_mode as WatchRule['matchMode'],
      pattern: row.pattern,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }


  /**
   * Create a new watch rule
   */
  create(dto: CreateWatchRuleDTO): WatchRule {
    const id = randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO watch_rules (id, name, match_type, match_mode, pattern, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);
    stmt.run(id, dto.name, dto.matchType, dto.matchMode, dto.pattern, now, now);

    // Initialize stats
    this.db.prepare(`
      INSERT INTO watch_stats (rule_id, hit_count, last_hit_at)
      VALUES (?, 0, NULL)
    `).run(id);

    return {
      id,
      name: dto.name,
      matchType: dto.matchType,
      matchMode: dto.matchMode,
      pattern: dto.pattern,
      enabled: true,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Find all watch rules with stats
   */
  findAllWithStats(): WatchRuleWithStats[] {
    const stmt = this.db.prepare(`
      SELECT r.*, s.hit_count, s.last_hit_at
      FROM watch_rules r
      LEFT JOIN watch_stats s ON r.id = s.rule_id
      ORDER BY s.hit_count DESC
    `);
    const rows = stmt.all() as (WatchRuleRow & { hit_count: number; last_hit_at: string | null })[];
    
    return rows.map(row => ({
      ...this.rowToRule(row),
      hitCount: row.hit_count || 0,
      lastHitAt: row.last_hit_at ? new Date(row.last_hit_at) : null,
    }));
  }

  /**
   * Find enabled watch rules
   */
  findEnabled(): WatchRule[] {
    const stmt = this.db.prepare('SELECT * FROM watch_rules WHERE enabled = 1');
    const rows = stmt.all() as WatchRuleRow[];
    return rows.map(row => this.rowToRule(row));
  }

  /**
   * Increment hit count for a rule
   */
  incrementHit(ruleId: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE watch_stats SET hit_count = hit_count + 1, last_hit_at = ? WHERE rule_id = ?
    `).run(now, ruleId);
  }

  /**
   * Batch increment hit count for a rule
   * Requirements: 3.3 - Combine similar operations into single database writes
   * 
   * @param ruleId - The rule ID to increment
   * @param count - Number to increment by
   */
  incrementHitBatch(ruleId: string, count: number): void {
    if (count <= 0) return;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE watch_stats SET hit_count = hit_count + ?, last_hit_at = ? WHERE rule_id = ?
    `).run(count, now, ruleId);
  }

  /**
   * Toggle rule enabled status
   */
  toggleEnabled(id: string): WatchRule | null {
    const rule = this.findById(id);
    if (!rule) return null;

    const now = new Date().toISOString();
    const newEnabled = rule.enabled ? 0 : 1;
    this.db.prepare('UPDATE watch_rules SET enabled = ?, updated_at = ? WHERE id = ?').run(newEnabled, now, id);
    
    return { ...rule, enabled: !rule.enabled, updatedAt: new Date(now) };
  }

  /**
   * Find rule by ID
   */
  findById(id: string): WatchRule | null {
    const stmt = this.db.prepare('SELECT * FROM watch_rules WHERE id = ?');
    const row = stmt.get(id) as WatchRuleRow | undefined;
    return row ? this.rowToRule(row) : null;
  }

  /**
   * Delete a watch rule
   */
  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM watch_rules WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Reset hit count for a rule
   */
  resetHitCount(ruleId: string): void {
    this.db.prepare('UPDATE watch_stats SET hit_count = 0, last_hit_at = NULL WHERE rule_id = ?').run(ruleId);
  }
}
