import type { Database } from 'better-sqlite3';
import type {
  MonitoringRule,
  CreateMonitoringRuleDTO,
  UpdateMonitoringRuleDTO,
  MonitoringRuleFilter,
} from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

interface MonitoringRuleRow {
  id: string;
  merchant: string;
  name: string;
  subject_pattern: string;
  expected_interval_minutes: number;
  dead_after_minutes: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

/**
 * Repository for monitoring rule CRUD operations
 */
export class MonitoringRuleRepository {
  constructor(private db: Database) {}

  /**
   * Convert database row to MonitoringRule
   */
  private rowToRule(row: MonitoringRuleRow): MonitoringRule {
    return {
      id: row.id,
      merchant: row.merchant,
      name: row.name,
      subjectPattern: row.subject_pattern,
      expectedIntervalMinutes: row.expected_interval_minutes,
      deadAfterMinutes: row.dead_after_minutes,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Create a new monitoring rule
   */
  create(dto: CreateMonitoringRuleDTO): MonitoringRule {
    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    const stmt = this.db.prepare(`
      INSERT INTO monitoring_rules (
        id, merchant, name, subject_pattern, 
        expected_interval_minutes, dead_after_minutes, 
        enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      dto.merchant,
      dto.name,
      dto.subjectPattern,
      dto.expectedIntervalMinutes,
      dto.deadAfterMinutes,
      enabled ? 1 : 0,
      now,
      now
    );

    // Create associated signal state record
    const stateStmt = this.db.prepare(`
      INSERT INTO signal_states (rule_id, state, last_seen_at, count_1h, count_12h, count_24h, updated_at)
      VALUES (?, 'DEAD', NULL, 0, 0, 0, ?)
    `);
    stateStmt.run(id, now);

    return {
      id,
      merchant: dto.merchant,
      name: dto.name,
      subjectPattern: dto.subjectPattern,
      expectedIntervalMinutes: dto.expectedIntervalMinutes,
      deadAfterMinutes: dto.deadAfterMinutes,
      enabled,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Get a rule by ID
   */
  getById(id: string): MonitoringRule | null {
    const stmt = this.db.prepare('SELECT * FROM monitoring_rules WHERE id = ?');
    const row = stmt.get(id) as MonitoringRuleRow | undefined;
    return row ? this.rowToRule(row) : null;
  }

  /**
   * Get all rules with optional filtering
   */
  getAll(filter?: MonitoringRuleFilter): MonitoringRule[] {
    let query = 'SELECT * FROM monitoring_rules WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.merchant) {
      query += ' AND merchant = ?';
      params.push(filter.merchant);
    }

    if (filter?.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as MonitoringRuleRow[];
    return rows.map((row) => this.rowToRule(row));
  }

  /**
   * Get all enabled rules
   */
  getEnabled(): MonitoringRule[] {
    const stmt = this.db.prepare(
      'SELECT * FROM monitoring_rules WHERE enabled = 1 ORDER BY created_at DESC'
    );
    const rows = stmt.all() as MonitoringRuleRow[];
    return rows.map((row) => this.rowToRule(row));
  }

  /**
   * Update a rule
   */
  update(id: string, dto: UpdateMonitoringRuleDTO): MonitoringRule | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number)[] = [now];

    if (dto.merchant !== undefined) {
      updates.push('merchant = ?');
      params.push(dto.merchant);
    }
    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name);
    }
    if (dto.subjectPattern !== undefined) {
      updates.push('subject_pattern = ?');
      params.push(dto.subjectPattern);
    }
    if (dto.expectedIntervalMinutes !== undefined) {
      updates.push('expected_interval_minutes = ?');
      params.push(dto.expectedIntervalMinutes);
    }
    if (dto.deadAfterMinutes !== undefined) {
      updates.push('dead_after_minutes = ?');
      params.push(dto.deadAfterMinutes);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(dto.enabled ? 1 : 0);
    }

    params.push(id);

    const stmt = this.db.prepare(
      `UPDATE monitoring_rules SET ${updates.join(', ')} WHERE id = ?`
    );
    stmt.run(...params);

    return this.getById(id);
  }

  /**
   * Toggle rule enabled status
   */
  toggleEnabled(id: string): MonitoringRule | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const newEnabled = existing.enabled ? 0 : 1;

    const stmt = this.db.prepare(
      'UPDATE monitoring_rules SET enabled = ?, updated_at = ? WHERE id = ?'
    );
    stmt.run(newEnabled, now, id);

    return this.getById(id);
  }

  /**
   * Delete a rule (cascade deletes signal_states)
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM monitoring_rules WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Count total rules
   */
  count(filter?: MonitoringRuleFilter): number {
    let query = 'SELECT COUNT(*) as count FROM monitoring_rules WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.merchant) {
      query += ' AND merchant = ?';
      params.push(filter.merchant);
    }

    if (filter?.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }
}
