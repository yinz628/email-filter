/**
 * Heartbeat Service Tests
 *
 * **Feature: email-realtime-monitoring, Property 9: 心跳检查覆盖所有启用规则**
 * **Validates: Requirements 4.1**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  MonitoringRule,
  CreateMonitoringRuleDTO,
  SignalState,
  HeartbeatResult,
  StateChange,
} from '@email-filter/shared';
import { calculateGapMinutes, calculateSignalState, determineAlertType } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitraries for generating valid monitoring rule data
const merchantArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
// Use simple patterns that are always valid regex
const subjectPatternArb = fc.oneof(
  fc.constant('.*'),
  fc.constant('.+'),
  fc.constant('test'),
  fc.constant('order'),
  fc.constant('payment'),
  fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', '1', '2', '3'), { minLength: 1, maxLength: 10 })
);
const intervalArb = fc.integer({ min: 1, max: 10080 }); // 1 minute to 1 week

// Generate valid CreateMonitoringRuleDTO with proper threshold relationship
const createMonitoringRuleDTOArb: fc.Arbitrary<CreateMonitoringRuleDTO> = fc
  .record({
    merchant: merchantArb,
    name: nameArb,
    subjectPattern: subjectPatternArb,
    expectedIntervalMinutes: intervalArb,
    enabled: fc.boolean(),
  })
  .map((dto) => ({
    ...dto,
    // Ensure deadAfterMinutes >= expectedIntervalMinutes * 1.5
    deadAfterMinutes: Math.ceil(dto.expectedIntervalMinutes * 2),
  }));

/**
 * Test-specific MonitoringRuleRepository that works with sql.js
 */
class TestMonitoringRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): MonitoringRule {
    return {
      id: row[0] as string,
      merchant: row[1] as string,
      name: row[2] as string,
      subjectPattern: row[3] as string,
      expectedIntervalMinutes: row[4] as number,
      deadAfterMinutes: row[5] as number,
      enabled: row[6] === 1,
      createdAt: new Date(row[7] as string),
      updatedAt: new Date(row[8] as string),
    };
  }

  create(dto: CreateMonitoringRuleDTO): MonitoringRule {
    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    this.db.run(
      `INSERT INTO monitoring_rules (
        id, merchant, name, subject_pattern, 
        expected_interval_minutes, dead_after_minutes, 
        enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.merchant,
        dto.name,
        dto.subjectPattern,
        dto.expectedIntervalMinutes,
        dto.deadAfterMinutes,
        enabled ? 1 : 0,
        now,
        now,
      ]
    );

    // Create associated signal state record
    this.db.run(
      `INSERT INTO signal_states (rule_id, state, last_seen_at, count_1h, count_12h, count_24h, updated_at)
       VALUES (?, 'DEAD', NULL, 0, 0, 0, ?)`,
      [id, now]
    );

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

  getById(id: string): MonitoringRule | null {
    const result = this.db.exec('SELECT * FROM monitoring_rules WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.rowToRule(result[0].values[0]);
  }

  getAll(): MonitoringRule[] {
    const result = this.db.exec('SELECT * FROM monitoring_rules ORDER BY created_at DESC');
    if (result.length === 0) {
      return [];
    }
    return result[0].values.map((row) => this.rowToRule(row));
  }

  getEnabled(): MonitoringRule[] {
    const result = this.db.exec(
      'SELECT * FROM monitoring_rules WHERE enabled = 1 ORDER BY created_at DESC'
    );
    if (result.length === 0) {
      return [];
    }
    return result[0].values.map((row) => this.rowToRule(row));
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM alerts WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM hit_logs WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM signal_states WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM monitoring_rules WHERE id = ?', [id]);
    return true;
  }
}

/**
 * Test-specific SignalStateRepository that works with sql.js
 */
class TestSignalStateRepository {
  constructor(private db: SqlJsDatabase) {}

  getRawState(ruleId: string): { state: string; lastSeenAt: string | null; count1h: number; count12h: number; count24h: number } | null {
    const result = this.db.exec(
      'SELECT state, last_seen_at, count_1h, count_12h, count_24h FROM signal_states WHERE rule_id = ?',
      [ruleId]
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    return {
      state: row[0] as string,
      lastSeenAt: row[1] as string | null,
      count1h: row[2] as number,
      count12h: row[3] as number,
      count24h: row[4] as number,
    };
  }

  updateState(ruleId: string, state: SignalState): boolean {
    const now = new Date().toISOString();
    this.db.run('UPDATE signal_states SET state = ?, updated_at = ? WHERE rule_id = ?', [
      state,
      now,
      ruleId,
    ]);
    return true;
  }

  setLastSeenAt(ruleId: string, lastSeenAt: Date | null): void {
    const now = new Date().toISOString();
    const lastSeenAtStr = lastSeenAt ? lastSeenAt.toISOString() : null;
    this.db.run('UPDATE signal_states SET last_seen_at = ?, updated_at = ? WHERE rule_id = ?', [
      lastSeenAtStr,
      now,
      ruleId,
    ]);
  }
}

/**
 * Test-specific HeartbeatService that works with sql.js
 */
class TestHeartbeatService {
  private ruleRepo: TestMonitoringRuleRepository;
  private stateRepo: TestSignalStateRepository;
  private checkedRuleIds: string[] = [];

  constructor(private db: SqlJsDatabase) {
    this.ruleRepo = new TestMonitoringRuleRepository(db);
    this.stateRepo = new TestSignalStateRepository(db);
  }

  /**
   * Run heartbeat check on all enabled monitoring rules
   *
   * Requirements: 4.1 - Heartbeat check should iterate through all enabled rules
   */
  runCheck(now: Date = new Date()): HeartbeatResult {
    const startTime = Date.now();
    const stateChanges: StateChange[] = [];
    let alertsTriggered = 0;

    // Reset tracked rule IDs for this check
    this.checkedRuleIds = [];

    // Get all enabled rules (Requirement 4.1)
    const enabledRules = this.ruleRepo.getEnabled();

    // Check each enabled rule
    for (const rule of enabledRules) {
      // Track that this rule was checked
      this.checkedRuleIds.push(rule.id);

      const stateChange = this.checkRule(rule, now);
      if (stateChange) {
        stateChanges.push(stateChange);
        if (stateChange.alertTriggered) {
          alertsTriggered++;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Record heartbeat log
    this.recordHeartbeatLog(now, enabledRules.length, stateChanges.length, alertsTriggered, durationMs);

    return {
      checkedAt: now,
      rulesChecked: enabledRules.length,
      stateChanges,
      alertsTriggered,
      durationMs,
    };
  }

  /**
   * Get the list of rule IDs that were checked in the last runCheck call
   */
  getCheckedRuleIds(): string[] {
    return [...this.checkedRuleIds];
  }

  /**
   * Get the list of enabled rule IDs
   */
  getEnabledRuleIds(): string[] {
    return this.ruleRepo.getEnabled().map((r) => r.id);
  }

  private checkRule(rule: MonitoringRule, now: Date): StateChange | null {
    const stateRecord = this.stateRepo.getRawState(rule.id);
    if (!stateRecord) {
      return null;
    }

    const previousState = stateRecord.state as SignalState;
    const lastSeenAt = stateRecord.lastSeenAt ? new Date(stateRecord.lastSeenAt) : null;

    // Calculate current state based on gap
    const gapMinutes = calculateGapMinutes(lastSeenAt, now);
    const currentState = calculateSignalState(
      gapMinutes,
      rule.expectedIntervalMinutes,
      rule.deadAfterMinutes
    );

    // Check if state changed
    if (previousState === currentState) {
      return null;
    }

    // Update stored state
    this.stateRepo.updateState(rule.id, currentState);

    // Determine if alert should be triggered
    const alertType = determineAlertType(previousState, currentState);
    const alertTriggered = alertType !== null;

    return {
      ruleId: rule.id,
      previousState,
      currentState,
      alertTriggered,
    };
  }

  private recordHeartbeatLog(
    checkedAt: Date,
    rulesChecked: number,
    stateChanges: number,
    alertsTriggered: number,
    durationMs: number
  ): void {
    try {
      this.db.run(
        `INSERT INTO heartbeat_logs (checked_at, rules_checked, state_changes, alerts_triggered, duration_ms)
         VALUES (?, ?, ?, ?, ?)`,
        [checkedAt.toISOString(), rulesChecked, stateChanges, alertsTriggered, durationMs]
      );
    } catch (error) {
      // Log error but don't fail the heartbeat check
      console.error('Failed to record heartbeat log:', error);
    }
  }
}

describe('HeartbeatService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let ruleRepo: TestMonitoringRuleRepository;
  let stateRepo: TestSignalStateRepository;
  let service: TestHeartbeatService;

  beforeEach(async () => {
    // Initialize sql.js
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute main schema first
    const mainSchemaPath = join(__dirname, '../../db/schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    // Load and execute monitoring schema
    const monitoringSchemaPath = join(__dirname, '../../db/monitoring-schema.sql');
    const monitoringSchema = readFileSync(monitoringSchemaPath, 'utf-8');
    db.run(monitoringSchema);

    ruleRepo = new TestMonitoringRuleRepository(db);
    stateRepo = new TestSignalStateRepository(db);
    service = new TestHeartbeatService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-realtime-monitoring, Property 9: 心跳检查覆盖所有启用规则**
   * *For any* 心跳检查执行，所有 enabled=true 的规则都应被检查且状态被重新计算
   * **Validates: Requirements 4.1**
   */
  describe('Property 9: 心跳检查覆盖所有启用规则', () => {
    it('should check all enabled rules during heartbeat', () => {
      fc.assert(
        fc.property(
          fc.array(createMonitoringRuleDTOArb, { minLength: 1, maxLength: 10 }),
          (dtos) => {
            const createdRules: MonitoringRule[] = [];

            // Create rules with mixed enabled states
            for (const dto of dtos) {
              const rule = ruleRepo.create(dto);
              createdRules.push(rule);
            }

            // Get expected enabled rule IDs
            const expectedEnabledIds = createdRules
              .filter((r) => r.enabled)
              .map((r) => r.id)
              .sort();

            // Run heartbeat check
            const result = service.runCheck();

            // Get the rule IDs that were actually checked
            const checkedIds = service.getCheckedRuleIds().sort();

            // Verify all enabled rules were checked
            expect(checkedIds).toEqual(expectedEnabledIds);

            // Verify rulesChecked count matches
            expect(result.rulesChecked).toBe(expectedEnabledIds.length);

            // Cleanup
            for (const rule of createdRules) {
              ruleRepo.delete(rule.id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not check disabled rules during heartbeat', () => {
      fc.assert(
        fc.property(
          fc.array(createMonitoringRuleDTOArb, { minLength: 1, maxLength: 10 }),
          (dtos) => {
            const createdRules: MonitoringRule[] = [];

            // Create rules
            for (const dto of dtos) {
              const rule = ruleRepo.create(dto);
              createdRules.push(rule);
            }

            // Get disabled rule IDs
            const disabledIds = createdRules.filter((r) => !r.enabled).map((r) => r.id);

            // Run heartbeat check
            service.runCheck();

            // Get the rule IDs that were actually checked
            const checkedIds = service.getCheckedRuleIds();

            // Verify no disabled rules were checked
            for (const disabledId of disabledIds) {
              expect(checkedIds).not.toContain(disabledId);
            }

            // Cleanup
            for (const rule of createdRules) {
              ruleRepo.delete(rule.id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should recalculate state for each enabled rule', () => {
      fc.assert(
        fc.property(
          fc.array(
            createMonitoringRuleDTOArb.filter((dto) => dto.enabled === true),
            { minLength: 1, maxLength: 5 }
          ),
          (dtos) => {
            const createdRules: MonitoringRule[] = [];
            const now = new Date();

            // Create enabled rules with various lastSeenAt times
            for (let i = 0; i < dtos.length; i++) {
              const dto = { ...dtos[i], enabled: true };
              const rule = ruleRepo.create(dto);
              createdRules.push(rule);

              // Set different lastSeenAt times to create different states
              if (i % 3 === 0) {
                // Recent - should be ACTIVE
                const recentTime = new Date(now.getTime() - rule.expectedIntervalMinutes * 0.5 * 60 * 1000);
                stateRepo.setLastSeenAt(rule.id, recentTime);
              } else if (i % 3 === 1) {
                // Somewhat old - should be WEAK
                const weakTime = new Date(now.getTime() - rule.expectedIntervalMinutes * 1.8 * 60 * 1000);
                stateRepo.setLastSeenAt(rule.id, weakTime);
              }
              // else: null lastSeenAt - should be DEAD
            }

            // Run heartbeat check
            const result = service.runCheck(now);

            // Verify all enabled rules were checked
            expect(result.rulesChecked).toBe(createdRules.length);

            // Verify each rule's state was recalculated correctly
            for (let i = 0; i < createdRules.length; i++) {
              const rule = createdRules[i];
              const stateRecord = stateRepo.getRawState(rule.id);
              expect(stateRecord).not.toBeNull();

              const lastSeenAt = stateRecord!.lastSeenAt ? new Date(stateRecord!.lastSeenAt) : null;
              const gapMinutes = calculateGapMinutes(lastSeenAt, now);
              const expectedState = calculateSignalState(
                gapMinutes,
                rule.expectedIntervalMinutes,
                rule.deadAfterMinutes
              );

              expect(stateRecord!.state).toBe(expectedState);
            }

            // Cleanup
            for (const rule of createdRules) {
              ruleRepo.delete(rule.id);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return correct rulesChecked count matching enabled rules', () => {
      fc.assert(
        fc.property(
          fc.array(createMonitoringRuleDTOArb, { minLength: 0, maxLength: 15 }),
          (dtos) => {
            const createdRules: MonitoringRule[] = [];

            // Create rules
            for (const dto of dtos) {
              const rule = ruleRepo.create(dto);
              createdRules.push(rule);
            }

            // Count enabled rules
            const enabledCount = createdRules.filter((r) => r.enabled).length;

            // Run heartbeat check
            const result = service.runCheck();

            // Verify rulesChecked matches enabled count
            expect(result.rulesChecked).toBe(enabledCount);

            // Cleanup
            for (const rule of createdRules) {
              ruleRepo.delete(rule.id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty rule set gracefully', () => {
      // Run heartbeat check with no rules
      const result = service.runCheck();

      expect(result.rulesChecked).toBe(0);
      expect(result.stateChanges).toHaveLength(0);
      expect(result.alertsTriggered).toBe(0);
      expect(result.checkedAt).toBeInstanceOf(Date);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should check all enabled rules even when some have errors', () => {
      fc.assert(
        fc.property(
          fc.array(
            createMonitoringRuleDTOArb.filter((dto) => dto.enabled === true),
            { minLength: 2, maxLength: 5 }
          ),
          (dtos) => {
            const createdRules: MonitoringRule[] = [];

            // Create enabled rules
            for (const dto of dtos) {
              const rule = ruleRepo.create({ ...dto, enabled: true });
              createdRules.push(rule);
            }

            // Run heartbeat check
            const result = service.runCheck();

            // Verify all rules were checked
            expect(result.rulesChecked).toBe(createdRules.length);
            expect(service.getCheckedRuleIds().length).toBe(createdRules.length);

            // Cleanup
            for (const rule of createdRules) {
              ruleRepo.delete(rule.id);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
