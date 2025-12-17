import type { Database } from 'better-sqlite3';
import type { RatioState } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

export type RatioAlertType = 'RATIO_LOW' | 'RATIO_RECOVERED';

export interface RatioAlert {
  id: string;
  monitorId: string;
  alertType: RatioAlertType;
  previousState: RatioState;
  currentState: RatioState;
  firstCount: number;
  secondCount: number;
  currentRatio: number;
  message: string;
  sentAt: Date | null;
  createdAt: Date;
}

export interface CreateRatioAlertDTO {
  monitorId: string;
  alertType: RatioAlertType;
  previousState: RatioState;
  currentState: RatioState;
  firstCount: number;
  secondCount: number;
  currentRatio: number;
  message: string;
}

interface RatioAlertRow {
  id: string;
  monitor_id: string;
  alert_type: string;
  previous_state: string;
  current_state: string;
  first_count: number;
  second_count: number;
  current_ratio: number;
  message: string;
  sent_at: string | null;
  created_at: string;
}

/**
 * Repository for ratio alert operations
 */
export class RatioAlertRepository {
  constructor(private db: Database) {}

  private rowToAlert(row: RatioAlertRow): RatioAlert {
    return {
      id: row.id,
      monitorId: row.monitor_id,
      alertType: row.alert_type as RatioAlertType,
      previousState: row.previous_state as RatioState,
      currentState: row.current_state as RatioState,
      firstCount: row.first_count,
      secondCount: row.second_count,
      currentRatio: row.current_ratio,
      message: row.message,
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Create a new ratio alert
   */
  create(dto: CreateRatioAlertDTO): RatioAlert {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO ratio_alerts (
        id, monitor_id, alert_type, previous_state, current_state,
        first_count, second_count, current_ratio, message, sent_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);

    stmt.run(
      id,
      dto.monitorId,
      dto.alertType,
      dto.previousState,
      dto.currentState,
      dto.firstCount,
      dto.secondCount,
      dto.currentRatio,
      dto.message,
      now
    );

    return {
      id,
      monitorId: dto.monitorId,
      alertType: dto.alertType,
      previousState: dto.previousState,
      currentState: dto.currentState,
      firstCount: dto.firstCount,
      secondCount: dto.secondCount,
      currentRatio: dto.currentRatio,
      message: dto.message,
      sentAt: null,
      createdAt: new Date(now),
    };
  }

  /**
   * Get all ratio alerts with optional limit
   */
  getAll(limit?: number): RatioAlert[] {
    let query = 'SELECT * FROM ratio_alerts ORDER BY created_at DESC';
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    const stmt = this.db.prepare(query);
    const rows = stmt.all() as RatioAlertRow[];
    return rows.map((row) => this.rowToAlert(row));
  }

  /**
   * Get alerts by monitor ID
   */
  getByMonitorId(monitorId: string, limit?: number): RatioAlert[] {
    let query = 'SELECT * FROM ratio_alerts WHERE monitor_id = ? ORDER BY created_at DESC';
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    const stmt = this.db.prepare(query);
    const rows = stmt.all(monitorId) as RatioAlertRow[];
    return rows.map((row) => this.rowToAlert(row));
  }

  /**
   * Mark alert as sent
   */
  markAsSent(id: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE ratio_alerts SET sent_at = ? WHERE id = ?');
    const result = stmt.run(now, id);
    return result.changes > 0;
  }

  /**
   * Get unsent alerts
   */
  getUnsent(): RatioAlert[] {
    const stmt = this.db.prepare(
      'SELECT * FROM ratio_alerts WHERE sent_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as RatioAlertRow[];
    return rows.map((row) => this.rowToAlert(row));
  }

  /**
   * Delete alerts older than specified date
   */
  deleteOlderThan(date: Date): number {
    const stmt = this.db.prepare('DELETE FROM ratio_alerts WHERE created_at < ?');
    const result = stmt.run(date.toISOString());
    return result.changes;
  }
}
