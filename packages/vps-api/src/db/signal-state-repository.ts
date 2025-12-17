import type { Database } from 'better-sqlite3';
import type { SignalState, SignalStatus, MonitoringRule } from '@email-filter/shared';

export interface SignalStateRow {
  rule_id: string;
  state: string;
  last_seen_at: string | null;
  count_1h: number;
  count_12h: number;
  count_24h: number;
  updated_at: string;
}

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
 * Repository for signal state operations
 */
export class SignalStateRepository {
  constructor(private db: Database) {}

  /**
   * Convert database row to MonitoringRule
   */
  private rowToRule(row: MonitoringRuleRow): MonitoringRule {
    let tags: string[] = [];
    try {
      tags = JSON.parse((row as any).tags || '[]');
    } catch {
      tags = [];
    }
    return {
      id: row.id,
      merchant: row.merchant,
      name: row.name,
      subjectPattern: row.subject_pattern,
      expectedIntervalMinutes: row.expected_interval_minutes,
      deadAfterMinutes: row.dead_after_minutes,
      tags,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get signal status by rule ID
   */
  getByRuleId(ruleId: string): SignalStatus | null {
    const stmt = this.db.prepare(`
      SELECT 
        ss.rule_id, ss.state, ss.last_seen_at, 
        ss.count_1h, ss.count_12h, ss.count_24h, ss.updated_at,
        mr.id, mr.merchant, mr.name, mr.subject_pattern,
        mr.expected_interval_minutes, mr.dead_after_minutes, mr.tags,
        mr.enabled, mr.created_at, mr.updated_at as rule_updated_at
      FROM signal_states ss
      JOIN monitoring_rules mr ON ss.rule_id = mr.id
      WHERE ss.rule_id = ?
    `);

    const row = stmt.get(ruleId) as any;
    if (!row) {
      return null;
    }

    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags || '[]');
    } catch {
      tags = [];
    }
    const rule: MonitoringRule = {
      id: row.id,
      merchant: row.merchant,
      name: row.name,
      subjectPattern: row.subject_pattern,
      expectedIntervalMinutes: row.expected_interval_minutes,
      deadAfterMinutes: row.dead_after_minutes,
      tags,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.rule_updated_at),
    };

    const lastSeenAt = row.last_seen_at ? new Date(row.last_seen_at) : null;
    const now = new Date();
    const gapMinutes = lastSeenAt
      ? Math.floor((now.getTime() - lastSeenAt.getTime()) / (1000 * 60))
      : Infinity;

    return {
      ruleId: row.rule_id,
      rule,
      state: row.state as SignalState,
      lastSeenAt,
      gapMinutes,
      count1h: row.count_1h,
      count12h: row.count_12h,
      count24h: row.count_24h,
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get all signal statuses
   */
  getAll(): SignalStatus[] {
    const stmt = this.db.prepare(`
      SELECT 
        ss.rule_id, ss.state, ss.last_seen_at, 
        ss.count_1h, ss.count_12h, ss.count_24h, ss.updated_at,
        mr.id, mr.merchant, mr.name, mr.subject_pattern,
        mr.expected_interval_minutes, mr.dead_after_minutes, mr.tags,
        mr.enabled, mr.created_at, mr.updated_at as rule_updated_at
      FROM signal_states ss
      JOIN monitoring_rules mr ON ss.rule_id = mr.id
      ORDER BY 
        CASE ss.state 
          WHEN 'DEAD' THEN 1 
          WHEN 'WEAK' THEN 2 
          WHEN 'ACTIVE' THEN 3 
        END,
        mr.created_at DESC
    `);

    const rows = stmt.all() as any[];
    const now = new Date();

    return rows.map((row) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags || '[]');
      } catch {
        tags = [];
      }
      const rule: MonitoringRule = {
        id: row.id,
        merchant: row.merchant,
        name: row.name,
        subjectPattern: row.subject_pattern,
        expectedIntervalMinutes: row.expected_interval_minutes,
        deadAfterMinutes: row.dead_after_minutes,
        tags,
        enabled: row.enabled === 1,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.rule_updated_at),
      };

      const lastSeenAt = row.last_seen_at ? new Date(row.last_seen_at) : null;
      const gapMinutes = lastSeenAt
        ? Math.floor((now.getTime() - lastSeenAt.getTime()) / (1000 * 60))
        : Infinity;

      return {
        ruleId: row.rule_id,
        rule,
        state: row.state as SignalState,
        lastSeenAt,
        gapMinutes,
        count1h: row.count_1h,
        count12h: row.count_12h,
        count24h: row.count_24h,
        updatedAt: new Date(row.updated_at),
      };
    });
  }

  /**
   * Get all signal statuses for enabled rules only
   */
  getEnabled(): SignalStatus[] {
    const stmt = this.db.prepare(`
      SELECT 
        ss.rule_id, ss.state, ss.last_seen_at, 
        ss.count_1h, ss.count_12h, ss.count_24h, ss.updated_at,
        mr.id, mr.merchant, mr.name, mr.subject_pattern,
        mr.expected_interval_minutes, mr.dead_after_minutes, mr.tags,
        mr.enabled, mr.created_at, mr.updated_at as rule_updated_at
      FROM signal_states ss
      JOIN monitoring_rules mr ON ss.rule_id = mr.id
      WHERE mr.enabled = 1
      ORDER BY 
        CASE ss.state 
          WHEN 'DEAD' THEN 1 
          WHEN 'WEAK' THEN 2 
          WHEN 'ACTIVE' THEN 3 
        END,
        mr.created_at DESC
    `);

    const rows = stmt.all() as any[];
    const now = new Date();

    return rows.map((row) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags || '[]');
      } catch {
        tags = [];
      }
      const rule: MonitoringRule = {
        id: row.id,
        merchant: row.merchant,
        name: row.name,
        subjectPattern: row.subject_pattern,
        expectedIntervalMinutes: row.expected_interval_minutes,
        deadAfterMinutes: row.dead_after_minutes,
        tags,
        enabled: row.enabled === 1,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.rule_updated_at),
      };

      const lastSeenAt = row.last_seen_at ? new Date(row.last_seen_at) : null;
      const gapMinutes = lastSeenAt
        ? Math.floor((now.getTime() - lastSeenAt.getTime()) / (1000 * 60))
        : Infinity;

      return {
        ruleId: row.rule_id,
        rule,
        state: row.state as SignalState,
        lastSeenAt,
        gapMinutes,
        count1h: row.count_1h,
        count12h: row.count_12h,
        count24h: row.count_24h,
        updatedAt: new Date(row.updated_at),
      };
    });
  }


  /**
   * Update state for a rule
   */
  updateState(ruleId: string, state: SignalState): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE signal_states 
      SET state = ?, updated_at = ?
      WHERE rule_id = ?
    `);
    const result = stmt.run(state, now, ruleId);
    return result.changes > 0;
  }

  /**
   * Update last_seen_at and state on email hit
   */
  updateOnHit(ruleId: string, hitTime: Date): boolean {
    const now = new Date().toISOString();
    const hitTimeStr = hitTime.toISOString();
    const stmt = this.db.prepare(`
      UPDATE signal_states 
      SET last_seen_at = ?, state = 'ACTIVE', updated_at = ?
      WHERE rule_id = ?
    `);
    const result = stmt.run(hitTimeStr, now, ruleId);
    return result.changes > 0;
  }

  /**
   * Increment time window counters
   */
  incrementCounters(ruleId: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE signal_states 
      SET count_1h = count_1h + 1, 
          count_12h = count_12h + 1, 
          count_24h = count_24h + 1,
          updated_at = ?
      WHERE rule_id = ?
    `);
    const result = stmt.run(now, ruleId);
    return result.changes > 0;
  }

  /**
   * Reset time window counters (for rolling window updates)
   */
  resetCounter(ruleId: string, window: '1h' | '12h' | '24h'): boolean {
    const now = new Date().toISOString();
    const column = `count_${window}`;
    const stmt = this.db.prepare(`
      UPDATE signal_states 
      SET ${column} = 0, updated_at = ?
      WHERE rule_id = ?
    `);
    const result = stmt.run(now, ruleId);
    return result.changes > 0;
  }

  /**
   * Set specific counter value
   */
  setCounter(ruleId: string, window: '1h' | '12h' | '24h', value: number): boolean {
    const now = new Date().toISOString();
    const column = `count_${window}`;
    const stmt = this.db.prepare(`
      UPDATE signal_states 
      SET ${column} = ?, updated_at = ?
      WHERE rule_id = ?
    `);
    const result = stmt.run(value, now, ruleId);
    return result.changes > 0;
  }

  /**
   * Get raw signal state record (without rule join)
   */
  getRawState(ruleId: string): SignalStateRow | null {
    const stmt = this.db.prepare('SELECT * FROM signal_states WHERE rule_id = ?');
    return stmt.get(ruleId) as SignalStateRow | null;
  }
}
