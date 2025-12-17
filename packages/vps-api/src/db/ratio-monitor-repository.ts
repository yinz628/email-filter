import type { Database } from 'better-sqlite3';
import type {
  RatioMonitor,
  CreateRatioMonitorDTO,
  UpdateRatioMonitorDTO,
  RatioState,
  RatioStateRecord,
  RatioTimeWindow,
  FunnelStep,
} from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

interface RatioMonitorRow {
  id: string;
  name: string;
  tag: string;
  first_rule_id: string;
  second_rule_id: string;
  steps: string;
  threshold_percent: number;
  time_window: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface RatioStateRow {
  monitor_id: string;
  state: string;
  first_count: number;
  second_count: number;
  current_ratio: number;
  steps_data: string;
  updated_at: string;
}

/**
 * Repository for ratio monitor operations
 */
export class RatioMonitorRepository {
  constructor(private db: Database) {}

  private rowToMonitor(row: RatioMonitorRow): RatioMonitor {
    let steps: FunnelStep[] = [];
    try {
      steps = JSON.parse(row.steps || '[]');
    } catch {
      steps = [];
    }
    return {
      id: row.id,
      name: row.name,
      tag: row.tag,
      firstRuleId: row.first_rule_id,
      secondRuleId: row.second_rule_id,
      steps,
      thresholdPercent: row.threshold_percent,
      timeWindow: row.time_window as RatioTimeWindow,
      enabled: row.enabled === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }


  /**
   * Create a new ratio monitor
   */
  create(dto: CreateRatioMonitorDTO): RatioMonitor {
    const id = uuidv4();
    const now = new Date().toISOString();
    const steps = dto.steps || [];
    const stepsJson = JSON.stringify(steps);

    const stmt = this.db.prepare(`
      INSERT INTO ratio_monitors (id, name, tag, first_rule_id, second_rule_id, steps, threshold_percent, time_window, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      dto.name,
      dto.tag,
      dto.firstRuleId,
      dto.secondRuleId,
      stepsJson,
      dto.thresholdPercent,
      dto.timeWindow,
      dto.enabled !== false ? 1 : 0,
      now,
      now
    );

    // Initialize ratio state
    const stateStmt = this.db.prepare(`
      INSERT INTO ratio_states (monitor_id, state, first_count, second_count, current_ratio, steps_data, updated_at)
      VALUES (?, 'HEALTHY', 0, 0, 0, '[]', ?)
    `);
    stateStmt.run(id, now);

    return {
      id,
      name: dto.name,
      tag: dto.tag,
      firstRuleId: dto.firstRuleId,
      secondRuleId: dto.secondRuleId,
      steps,
      thresholdPercent: dto.thresholdPercent,
      timeWindow: dto.timeWindow,
      enabled: dto.enabled !== false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  /**
   * Get ratio monitor by ID
   */
  getById(id: string): RatioMonitor | null {
    const stmt = this.db.prepare('SELECT * FROM ratio_monitors WHERE id = ?');
    const row = stmt.get(id) as RatioMonitorRow | undefined;
    return row ? this.rowToMonitor(row) : null;
  }

  /**
   * Get all ratio monitors
   */
  getAll(filter?: { tag?: string; enabled?: boolean }): RatioMonitor[] {
    let query = 'SELECT * FROM ratio_monitors WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.tag) {
      query += ' AND tag = ?';
      params.push(filter.tag);
    }

    if (filter?.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as RatioMonitorRow[];
    return rows.map((row) => this.rowToMonitor(row));
  }

  /**
   * Update a ratio monitor
   */
  update(id: string, dto: UpdateRatioMonitorDTO): RatioMonitor | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name);
    }
    if (dto.tag !== undefined) {
      updates.push('tag = ?');
      params.push(dto.tag);
    }
    if (dto.firstRuleId !== undefined) {
      updates.push('first_rule_id = ?');
      params.push(dto.firstRuleId);
    }
    if (dto.secondRuleId !== undefined) {
      updates.push('second_rule_id = ?');
      params.push(dto.secondRuleId);
    }
    if (dto.thresholdPercent !== undefined) {
      updates.push('threshold_percent = ?');
      params.push(dto.thresholdPercent);
    }
    if (dto.timeWindow !== undefined) {
      updates.push('time_window = ?');
      params.push(dto.timeWindow);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(dto.enabled ? 1 : 0);
    }
    if (dto.steps !== undefined) {
      updates.push('steps = ?');
      params.push(JSON.stringify(dto.steps));
    }

    if (updates.length === 0) return existing;

    const now = new Date().toISOString();
    updates.push('updated_at = ?');
    params.push(now);
    params.push(id);

    const stmt = this.db.prepare(`UPDATE ratio_monitors SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...params);

    return this.getById(id);
  }

  /**
   * Delete a ratio monitor
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM ratio_monitors WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get ratio state for a monitor
   */
  getState(monitorId: string): RatioStateRecord | null {
    const stmt = this.db.prepare('SELECT * FROM ratio_states WHERE monitor_id = ?');
    const row = stmt.get(monitorId) as RatioStateRow | undefined;
    if (!row) return null;

    return {
      monitorId: row.monitor_id,
      state: row.state as RatioState,
      firstCount: row.first_count,
      secondCount: row.second_count,
      currentRatio: row.current_ratio,
      stepsData: row.steps_data || '[]',
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update ratio state
   */
  updateState(
    monitorId: string,
    state: RatioState,
    firstCount: number,
    secondCount: number,
    currentRatio: number,
    stepsData: string = '[]'
  ): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO ratio_states (monitor_id, state, first_count, second_count, current_ratio, steps_data, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(monitor_id) DO UPDATE SET
        state = excluded.state,
        first_count = excluded.first_count,
        second_count = excluded.second_count,
        current_ratio = excluded.current_ratio,
        steps_data = excluded.steps_data,
        updated_at = excluded.updated_at
    `);
    stmt.run(monitorId, state, firstCount, secondCount, currentRatio, stepsData, now);
  }

  /**
   * Get all unique tags from ratio monitors
   */
  getAllTags(): string[] {
    const stmt = this.db.prepare('SELECT DISTINCT tag FROM ratio_monitors ORDER BY tag');
    const rows = stmt.all() as { tag: string }[];
    return rows.map((row) => row.tag);
  }
}
