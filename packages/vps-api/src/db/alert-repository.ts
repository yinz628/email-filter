import type { Database } from 'better-sqlite3';
import type { Alert, AlertType, SignalState, CreateAlertDTO, AlertFilter } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

interface AlertRow {
  id: string;
  rule_id: string;
  alert_type: string;
  previous_state: string;
  current_state: string;
  gap_minutes: number;
  count_1h: number;
  count_12h: number;
  count_24h: number;
  message: string;
  sent_at: string | null;
  created_at: string;
}

/**
 * Repository for alert record operations
 */
export class AlertRepository {
  constructor(private db: Database) {}

  /**
   * Convert database row to Alert
   */
  private rowToAlert(row: AlertRow): Alert {
    return {
      id: row.id,
      ruleId: row.rule_id,
      alertType: row.alert_type as AlertType,
      previousState: row.previous_state as SignalState,
      currentState: row.current_state as SignalState,
      gapMinutes: row.gap_minutes,
      count1h: row.count_1h,
      count12h: row.count_12h,
      count24h: row.count_24h,
      message: row.message,
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  /**
   * Create a new alert record
   */
  create(dto: CreateAlertDTO): Alert {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        id, rule_id, alert_type, previous_state, current_state,
        gap_minutes, count_1h, count_12h, count_24h,
        message, sent_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `);

    stmt.run(
      id,
      dto.ruleId,
      dto.alertType,
      dto.previousState,
      dto.currentState,
      dto.gapMinutes,
      dto.count1h,
      dto.count12h,
      dto.count24h,
      dto.message,
      now
    );

    return {
      id,
      ruleId: dto.ruleId,
      alertType: dto.alertType,
      previousState: dto.previousState,
      currentState: dto.currentState,
      gapMinutes: dto.gapMinutes,
      count1h: dto.count1h,
      count12h: dto.count12h,
      count24h: dto.count24h,
      message: dto.message,
      sentAt: null,
      createdAt: new Date(now),
    };
  }

  /**
   * Get alert by ID
   */
  getById(id: string): Alert | null {
    const stmt = this.db.prepare('SELECT * FROM alerts WHERE id = ?');
    const row = stmt.get(id) as AlertRow | undefined;
    return row ? this.rowToAlert(row) : null;
  }

  /**
   * Get alerts with optional filtering
   */
  getAll(filter?: AlertFilter): Alert[] {
    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.ruleId) {
      query += ' AND rule_id = ?';
      params.push(filter.ruleId);
    }

    if (filter?.alertType) {
      query += ' AND alert_type = ?';
      params.push(filter.alertType);
    }

    if (filter?.startDate) {
      query += ' AND created_at >= ?';
      params.push(filter.startDate.toISOString());
    }

    if (filter?.endDate) {
      query += ' AND created_at <= ?';
      params.push(filter.endDate.toISOString());
    }

    query += ' ORDER BY created_at DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as AlertRow[];
    return rows.map((row) => this.rowToAlert(row));
  }

  /**
   * Update sent_at timestamp when alert is sent
   */
  markAsSent(id: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE alerts SET sent_at = ? WHERE id = ?');
    const result = stmt.run(now, id);
    return result.changes > 0;
  }

  /**
   * Get unsent alerts
   */
  getUnsent(): Alert[] {
    const stmt = this.db.prepare(
      'SELECT * FROM alerts WHERE sent_at IS NULL ORDER BY created_at ASC'
    );
    const rows = stmt.all() as AlertRow[];
    return rows.map((row) => this.rowToAlert(row));
  }

  /**
   * Delete alerts older than specified date
   */
  deleteOlderThan(date: Date): number {
    const stmt = this.db.prepare('DELETE FROM alerts WHERE created_at < ?');
    const result = stmt.run(date.toISOString());
    return result.changes;
  }

  /**
   * Count alerts
   */
  count(filter?: AlertFilter): number {
    let query = 'SELECT COUNT(*) as count FROM alerts WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.ruleId) {
      query += ' AND rule_id = ?';
      params.push(filter.ruleId);
    }

    if (filter?.alertType) {
      query += ' AND alert_type = ?';
      params.push(filter.alertType);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }
}
