/**
 * Alert Service Tests
 *
 * **Feature: email-realtime-monitoring, Property 10: 状态转换告警矩阵**
 * **Feature: email-realtime-monitoring, Property 11: 告警内容完整性**
 * **Feature: email-realtime-monitoring, Property 13: 状态格式化输出**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 6.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  SignalState,
  AlertType,
  MonitoringRule,
  SignalStatus,
  Alert,
  CreateAlertDTO,
} from '@email-filter/shared';
import { determineAlertType } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';
import { formatStatusDisplay } from './alert.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitrary generators
const signalStateArbitrary = fc.constantFrom<SignalState>('ACTIVE', 'WEAK', 'DEAD');
const positiveIntArbitrary = fc.integer({ min: 0, max: 10000 });
const merchantArbitrary = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const ruleNameArbitrary = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

/**
 * Test-specific AlertRepository that works with sql.js
 */
class TestAlertRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToAlert(row: any[]): Alert {
    return {
      id: row[0] as string,
      ruleId: row[1] as string,
      alertType: row[2] as AlertType,
      previousState: row[3] as SignalState,
      currentState: row[4] as SignalState,
      gapMinutes: row[5] as number,
      count1h: row[6] as number,
      count12h: row[7] as number,
      count24h: row[8] as number,
      message: row[9] as string,
      sentAt: row[10] ? new Date(row[10] as string) : null,
      createdAt: new Date(row[11] as string),
    };
  }

  create(dto: CreateAlertDTO): Alert {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO alerts (
        id, rule_id, alert_type, previous_state, current_state,
        gap_minutes, count_1h, count_12h, count_24h,
        message, sent_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
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
        now,
      ]
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

  getById(id: string): Alert | null {
    const result = this.db.exec('SELECT * FROM alerts WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.rowToAlert(result[0].values[0]);
  }
}

/**
 * Test AlertService that uses sql.js
 */
class TestAlertService {
  private alertRepo: TestAlertRepository;

  constructor(private db: SqlJsDatabase) {
    this.alertRepo = new TestAlertRepository(db);
  }

  determineAlertType(previousState: SignalState, currentState: SignalState): AlertType | null {
    return determineAlertType(previousState, currentState);
  }

  formatAlertMessage(
    rule: MonitoringRule,
    alertType: AlertType,
    previousState: SignalState,
    currentState: SignalState,
    gapMinutes: number,
    count1h: number,
    count12h: number,
    count24h: number
  ): string {
    const STATE_ICONS: Record<SignalState, string> = {
      ACTIVE: '🟢',
      WEAK: '🟡',
      DEAD: '🔴',
    };

    const ALERT_TYPE_LABELS: Record<AlertType, string> = {
      FREQUENCY_DOWN: '频率下降',
      SIGNAL_DEAD: '信号消失',
      SIGNAL_RECOVERED: '信号恢复',
    };

    const alertLabel = ALERT_TYPE_LABELS[alertType];
    const prevIcon = STATE_ICONS[previousState];
    const currIcon = STATE_ICONS[currentState];
    const gapDisplay = this.formatGapDisplay(gapMinutes);

    return (
      `[${alertLabel}] ${rule.merchant} / ${rule.name}\n` +
      `状态变化: ${prevIcon} ${previousState} → ${currIcon} ${currentState}\n` +
      `最后出现: ${gapDisplay}\n` +
      `历史表现: 24h: ${count24h} | 12h: ${count12h} | 1h: ${count1h}`
    );
  }

  createAlert(data: CreateAlertDTO): Alert {
    return this.alertRepo.create(data);
  }

  createAlertFromStateChange(
    rule: MonitoringRule,
    previousState: SignalState,
    currentState: SignalState,
    gapMinutes: number,
    count1h: number,
    count12h: number,
    count24h: number
  ): Alert | null {
    const alertType = this.determineAlertType(previousState, currentState);
    if (!alertType) {
      return null;
    }

    const message = this.formatAlertMessage(
      rule,
      alertType,
      previousState,
      currentState,
      gapMinutes,
      count1h,
      count12h,
      count24h
    );

    return this.createAlert({
      ruleId: rule.id,
      alertType,
      previousState,
      currentState,
      gapMinutes,
      count1h,
      count12h,
      count24h,
      message,
    });
  }

  private formatGapDisplay(gapMinutes: number): string {
    if (!Number.isFinite(gapMinutes) || gapMinutes < 0) {
      return '从未出现';
    }

    if (gapMinutes < 60) {
      return `${gapMinutes}m ago`;
    }

    const hours = Math.floor(gapMinutes / 60);
    const minutes = gapMinutes % 60;

    if (minutes === 0) {
      return `${hours}h ago`;
    }

    return `${hours}h ${minutes}m ago`;
  }
}

describe('AlertService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let service: TestAlertService;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load schemas
    const mainSchemaPath = join(__dirname, '../../db/schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    const monitoringSchemaPath = join(__dirname, '../../db/monitoring-schema.sql');
    const monitoringSchema = readFileSync(monitoringSchemaPath, 'utf-8');
    db.run(monitoringSchema);

    service = new TestAlertService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-realtime-monitoring, Property 10: 状态转换告警矩阵**
   * *For any* 状态转换：
   * - ACTIVE → WEAK: 触发 FREQUENCY_DOWN 告警
   * - WEAK → DEAD: 触发 SIGNAL_DEAD 告警
   * - ACTIVE → DEAD: 触发 SIGNAL_DEAD 告警
   * - DEAD/WEAK → ACTIVE: 触发 SIGNAL_RECOVERED 告警
   * - ACTIVE → ACTIVE: 不触发告警
   * - WEAK → WEAK: 不触发告警
   * - DEAD → DEAD: 不触发告警
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
   */
  describe('Property 10: 状态转换告警矩阵', () => {
    it('ACTIVE → WEAK should trigger FREQUENCY_DOWN alert', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (_) => {
          const alertType = service.determineAlertType('ACTIVE', 'WEAK');
          expect(alertType).toBe('FREQUENCY_DOWN');
        }),
        { numRuns: 100 }
      );
    });

    it('WEAK → DEAD should trigger SIGNAL_DEAD alert', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (_) => {
          const alertType = service.determineAlertType('WEAK', 'DEAD');
          expect(alertType).toBe('SIGNAL_DEAD');
        }),
        { numRuns: 100 }
      );
    });

    it('ACTIVE → DEAD should trigger SIGNAL_DEAD alert', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (_) => {
          const alertType = service.determineAlertType('ACTIVE', 'DEAD');
          expect(alertType).toBe('SIGNAL_DEAD');
        }),
        { numRuns: 100 }
      );
    });

    it('DEAD → ACTIVE should trigger SIGNAL_RECOVERED alert', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (_) => {
          const alertType = service.determineAlertType('DEAD', 'ACTIVE');
          expect(alertType).toBe('SIGNAL_RECOVERED');
        }),
        { numRuns: 100 }
      );
    });

    it('WEAK → ACTIVE should trigger SIGNAL_RECOVERED alert', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (_) => {
          const alertType = service.determineAlertType('WEAK', 'ACTIVE');
          expect(alertType).toBe('SIGNAL_RECOVERED');
        }),
        { numRuns: 100 }
      );
    });

    it('same state transitions should not trigger alerts', () => {
      fc.assert(
        fc.property(signalStateArbitrary, (state) => {
          const alertType = service.determineAlertType(state, state);
          expect(alertType).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('DEAD → WEAK should not trigger alert (degradation within dead)', () => {
      const alertType = service.determineAlertType('DEAD', 'WEAK');
      expect(alertType).toBeNull();
    });
  });

  /**
   * **Feature: email-realtime-monitoring, Property 11: 告警内容完整性**
   * *For any* 生成的告警，应包含 merchant、ruleName、previousState、currentState、
   * gapMinutes、count1h、count12h、count24h 所有字段
   * **Validates: Requirements 5.5**
   */
  describe('Property 11: 告警内容完整性', () => {
    it('created alerts should contain all required fields', () => {
      // Insert a test rule first
      const ruleId = 'test-rule-id';
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ruleId, 'test-merchant', 'Test Rule', '.*', 60, 120, 1, now, now]
      );

      fc.assert(
        fc.property(
          positiveIntArbitrary,
          positiveIntArbitrary,
          positiveIntArbitrary,
          positiveIntArbitrary,
          (gapMinutes, count1h, count12h, count24h) => {
            const alert = service.createAlert({
              ruleId,
              alertType: 'FREQUENCY_DOWN',
              previousState: 'ACTIVE',
              currentState: 'WEAK',
              gapMinutes,
              count1h,
              count12h,
              count24h,
              message: 'Test message',
            });

            // Verify all required fields are present
            expect(alert.id).toBeDefined();
            expect(alert.ruleId).toBe(ruleId);
            expect(alert.alertType).toBe('FREQUENCY_DOWN');
            expect(alert.previousState).toBe('ACTIVE');
            expect(alert.currentState).toBe('WEAK');
            expect(alert.gapMinutes).toBe(gapMinutes);
            expect(alert.count1h).toBe(count1h);
            expect(alert.count12h).toBe(count12h);
            expect(alert.count24h).toBe(count24h);
            expect(alert.message).toBeDefined();
            expect(alert.createdAt).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('formatted alert message should contain merchant, rule name, states, gap, and counts', () => {
      fc.assert(
        fc.property(
          merchantArbitrary,
          ruleNameArbitrary,
          positiveIntArbitrary,
          positiveIntArbitrary,
          positiveIntArbitrary,
          positiveIntArbitrary,
          (merchant, name, gapMinutes, count1h, count12h, count24h) => {
            const rule: MonitoringRule = {
              id: 'test-rule',
              merchant,
              name,
              subjectPattern: '.*',
              expectedIntervalMinutes: 60,
              deadAfterMinutes: 120,
              enabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            const message = service.formatAlertMessage(
              rule,
              'FREQUENCY_DOWN',
              'ACTIVE',
              'WEAK',
              gapMinutes,
              count1h,
              count12h,
              count24h
            );

            // Verify message contains all required information
            expect(message).toContain(merchant);
            expect(message).toContain(name);
            expect(message).toContain('ACTIVE');
            expect(message).toContain('WEAK');
            expect(message).toContain(`24h: ${count24h}`);
            expect(message).toContain(`12h: ${count12h}`);
            expect(message).toContain(`1h: ${count1h}`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('createAlertFromStateChange', () => {
    it('should create alert for valid state transitions', () => {
      const rule: MonitoringRule = {
        id: 'test-rule',
        merchant: 'test-merchant',
        name: 'Test Rule',
        subjectPattern: '.*',
        expectedIntervalMinutes: 60,
        deadAfterMinutes: 120,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Insert rule into database
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [rule.id, rule.merchant, rule.name, rule.subjectPattern, rule.expectedIntervalMinutes, rule.deadAfterMinutes, 1, now, now]
      );

      const alert = service.createAlertFromStateChange(rule, 'ACTIVE', 'WEAK', 90, 5, 20, 50);

      expect(alert).not.toBeNull();
      expect(alert!.alertType).toBe('FREQUENCY_DOWN');
      expect(alert!.previousState).toBe('ACTIVE');
      expect(alert!.currentState).toBe('WEAK');
    });

    it('should return null for same state transitions', () => {
      const rule: MonitoringRule = {
        id: 'test-rule',
        merchant: 'test-merchant',
        name: 'Test Rule',
        subjectPattern: '.*',
        expectedIntervalMinutes: 60,
        deadAfterMinutes: 120,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const alert = service.createAlertFromStateChange(rule, 'ACTIVE', 'ACTIVE', 30, 5, 20, 50);

      expect(alert).toBeNull();
    });
  });
});

/**
 * **Feature: email-realtime-monitoring, Property 13: 状态格式化输出**
 * *For any* 信号状态，格式化输出应包含状态图标、商户、规则名、last 时间、24h/12h/1h 计数
 * **Validates: Requirements 6.3**
 */
describe('Property 13: 状态格式化输出', () => {
  it('formatted status should contain state icon, merchant, rule name, last time, and counts', () => {
    fc.assert(
      fc.property(
        signalStateArbitrary,
        merchantArbitrary,
        ruleNameArbitrary,
        positiveIntArbitrary,
        positiveIntArbitrary,
        positiveIntArbitrary,
        positiveIntArbitrary,
        (state, merchant, name, gapMinutes, count1h, count12h, count24h) => {
          const rule: MonitoringRule = {
            id: 'test-rule',
            merchant,
            name,
            subjectPattern: '.*',
            expectedIntervalMinutes: 60,
            deadAfterMinutes: 120,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const status: SignalStatus = {
            ruleId: rule.id,
            rule,
            state,
            lastSeenAt: gapMinutes > 0 ? new Date(Date.now() - gapMinutes * 60 * 1000) : null,
            gapMinutes,
            count1h,
            count12h,
            count24h,
            updatedAt: new Date(),
          };

          const formatted = formatStatusDisplay(status);

          // Verify format contains all required elements
          // State icon (🟢, 🟡, or 🔴)
          expect(formatted).toMatch(/[🟢🟡🔴]/);
          // Merchant and rule name
          expect(formatted).toContain(merchant);
          expect(formatted).toContain(name);
          // Last time indicator
          expect(formatted).toMatch(/last:/);
          // Time window counts
          expect(formatted).toContain(`24h: ${count24h}`);
          expect(formatted).toContain(`12h: ${count12h}`);
          expect(formatted).toContain(`1h: ${count1h}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should display correct state icon for each state', () => {
    const createStatus = (state: SignalState): SignalStatus => ({
      ruleId: 'test',
      rule: {
        id: 'test',
        merchant: 'merchant',
        name: 'rule',
        subjectPattern: '.*',
        expectedIntervalMinutes: 60,
        deadAfterMinutes: 120,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      state,
      lastSeenAt: new Date(),
      gapMinutes: 30,
      count1h: 1,
      count12h: 5,
      count24h: 10,
      updatedAt: new Date(),
    });

    expect(formatStatusDisplay(createStatus('ACTIVE'))).toContain('🟢');
    expect(formatStatusDisplay(createStatus('WEAK'))).toContain('🟡');
    expect(formatStatusDisplay(createStatus('DEAD'))).toContain('🔴');
  });

  it('should format gap time correctly', () => {
    const createStatusWithGap = (gapMinutes: number): SignalStatus => ({
      ruleId: 'test',
      rule: {
        id: 'test',
        merchant: 'merchant',
        name: 'rule',
        subjectPattern: '.*',
        expectedIntervalMinutes: 60,
        deadAfterMinutes: 120,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      state: 'ACTIVE',
      lastSeenAt: new Date(),
      gapMinutes,
      count1h: 1,
      count12h: 5,
      count24h: 10,
      updatedAt: new Date(),
    });

    // Minutes format
    expect(formatStatusDisplay(createStatusWithGap(30))).toContain('30m ago');
    // Hours format
    expect(formatStatusDisplay(createStatusWithGap(120))).toContain('2h ago');
    // Never seen (Infinity)
    expect(formatStatusDisplay(createStatusWithGap(Infinity))).toContain('never');
  });
});
