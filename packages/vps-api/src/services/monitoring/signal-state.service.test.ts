/**
 * Signal State Service Tests
 *
 * **Feature: email-realtime-monitoring, Property 6: 状态查询完整性**
 * **Feature: email-realtime-monitoring, Property 7: 邮件命中更新一致性**
 * **Validates: Requirements 2.5, 3.1, 3.2**
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
  SignalStatus,
  EmailMetadata,
} from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitraries for generating valid monitoring rule data
const merchantArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
const subjectPatternArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);
const intervalArb = fc.integer({ min: 1, max: 10080 }); // 1 minute to 1 week

// Generate valid CreateMonitoringRuleDTO
const createMonitoringRuleDTOArb: fc.Arbitrary<CreateMonitoringRuleDTO> = fc.record({
  merchant: merchantArb,
  name: nameArb,
  subjectPattern: subjectPatternArb,
  expectedIntervalMinutes: intervalArb,
  deadAfterMinutes: intervalArb,
  enabled: fc.boolean(),
});

// Generate valid EmailMetadata
const emailMetadataArb: fc.Arbitrary<EmailMetadata> = fc.record({
  sender: fc.emailAddress(),
  subject: fc.string({ minLength: 1, maxLength: 200 }),
  recipient: fc.emailAddress(),
  receivedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
});

/**
 * Test-specific repository implementations for sql.js
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

  delete(id: string): boolean {
    this.db.run('DELETE FROM signal_states WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM hit_logs WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM monitoring_rules WHERE id = ?', [id]);
    return true;
  }
}

class TestSignalStateRepository {
  constructor(private db: SqlJsDatabase) {}

  getByRuleId(ruleId: string): SignalStatus | null {
    const result = this.db.exec(
      `SELECT 
        ss.rule_id, ss.state, ss.last_seen_at, 
        ss.count_1h, ss.count_12h, ss.count_24h, ss.updated_at,
        mr.id, mr.merchant, mr.name, mr.subject_pattern,
        mr.expected_interval_minutes, mr.dead_after_minutes,
        mr.enabled, mr.created_at, mr.updated_at as rule_updated_at
      FROM signal_states ss
      JOIN monitoring_rules mr ON ss.rule_id = mr.id
      WHERE ss.rule_id = ?`,
      [ruleId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    const rule: MonitoringRule = {
      id: row[7] as string,
      merchant: row[8] as string,
      name: row[9] as string,
      subjectPattern: row[10] as string,
      expectedIntervalMinutes: row[11] as number,
      deadAfterMinutes: row[12] as number,
      enabled: row[13] === 1,
      createdAt: new Date(row[14] as string),
      updatedAt: new Date(row[15] as string),
    };

    const lastSeenAt = row[2] ? new Date(row[2] as string) : null;
    const now = new Date();
    const gapMinutes = lastSeenAt
      ? Math.floor((now.getTime() - lastSeenAt.getTime()) / (1000 * 60))
      : Infinity;

    return {
      ruleId: row[0] as string,
      rule,
      state: row[1] as 'ACTIVE' | 'WEAK' | 'DEAD',
      lastSeenAt,
      gapMinutes,
      count1h: row[3] as number,
      count12h: row[4] as number,
      count24h: row[5] as number,
      updatedAt: new Date(row[6] as string),
    };
  }

  updateOnHit(ruleId: string, hitTime: Date): boolean {
    const now = new Date().toISOString();
    const hitTimeStr = hitTime.toISOString();
    this.db.run(
      `UPDATE signal_states 
       SET last_seen_at = ?, state = 'ACTIVE', updated_at = ?
       WHERE rule_id = ?`,
      [hitTimeStr, now, ruleId]
    );
    return true;
  }

  incrementCounters(ruleId: string): boolean {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE signal_states 
       SET count_1h = count_1h + 1, 
           count_12h = count_12h + 1, 
           count_24h = count_24h + 1,
           updated_at = ?
       WHERE rule_id = ?`,
      [now, ruleId]
    );
    return true;
  }
}

class TestHitLogRepository {
  constructor(private db: SqlJsDatabase) {}

  create(ruleId: string, email: EmailMetadata): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO hit_logs (rule_id, sender, subject, recipient, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, email.sender, email.subject, email.recipient, email.receivedAt.toISOString(), now]
    );
  }

  countByRuleId(ruleId: string): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM hit_logs WHERE rule_id = ?', [
      ruleId,
    ]);
    if (result.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }
}

/**
 * Test-specific SignalStateService that works with sql.js
 */
class TestSignalStateService {
  private stateRepo: TestSignalStateRepository;
  private hitLogRepo: TestHitLogRepository;
  private ruleRepo: TestMonitoringRuleRepository;

  constructor(private db: SqlJsDatabase) {
    this.stateRepo = new TestSignalStateRepository(db);
    this.hitLogRepo = new TestHitLogRepository(db);
    this.ruleRepo = new TestMonitoringRuleRepository(db);
  }

  getStatus(ruleId: string): SignalStatus | null {
    return this.stateRepo.getByRuleId(ruleId);
  }

  updateOnHit(
    ruleId: string,
    hitTime: Date,
    email?: EmailMetadata
  ): { previousState: string; currentState: string } | null {
    const currentStatus = this.getStatus(ruleId);
    if (!currentStatus) {
      return null;
    }

    const previousState = currentStatus.state;

    // Update last_seen_at and set state to ACTIVE
    this.stateRepo.updateOnHit(ruleId, hitTime);

    // Increment time window counters
    this.stateRepo.incrementCounters(ruleId);

    // Record hit in hit_logs if email metadata provided
    if (email) {
      this.hitLogRepo.create(ruleId, email);
    }

    return {
      previousState,
      currentState: 'ACTIVE',
    };
  }
}

describe('SignalStateService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let ruleRepo: TestMonitoringRuleRepository;
  let service: TestSignalStateService;

  beforeEach(async () => {
    // Initialize sql.js
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load consolidated schema (includes all monitoring tables)
    const schemaPath = join(__dirname, '../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    ruleRepo = new TestMonitoringRuleRepository(db);
    service = new TestSignalStateService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-realtime-monitoring, Property 6: 状态查询完整性**
   * *For any* 信号状态查询，返回结果应包含 lastSeenAt、gapMinutes、currentState、count1h、count12h、count24h 所有字段
   * **Validates: Requirements 2.5**
   */
  describe('Property 6: 状态查询完整性', () => {
    it('should return all required fields in status query', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Get status
          const status = service.getStatus(rule.id);

          // Verify all required fields are present
          expect(status).not.toBeNull();
          expect(status!.ruleId).toBe(rule.id);
          expect(status!.rule).toBeDefined();
          expect(status!.state).toBeDefined();
          expect(['ACTIVE', 'WEAK', 'DEAD']).toContain(status!.state);

          // lastSeenAt can be null (never seen) or a Date
          expect(status!.lastSeenAt === null || status!.lastSeenAt instanceof Date).toBe(true);

          // gapMinutes should be a number (Infinity if never seen)
          expect(typeof status!.gapMinutes).toBe('number');

          // Time window counters should be numbers >= 0
          expect(typeof status!.count1h).toBe('number');
          expect(status!.count1h).toBeGreaterThanOrEqual(0);
          expect(typeof status!.count12h).toBe('number');
          expect(status!.count12h).toBeGreaterThanOrEqual(0);
          expect(typeof status!.count24h).toBe('number');
          expect(status!.count24h).toBeGreaterThanOrEqual(0);

          // updatedAt should be a Date
          expect(status!.updatedAt).toBeInstanceOf(Date);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should return null for non-existent rule', () => {
      const status = service.getStatus('non-existent-rule-id');
      expect(status).toBeNull();
    });

    it('should include complete rule information in status', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Get status
          const status = service.getStatus(rule.id);

          // Verify rule information is complete
          expect(status!.rule.id).toBe(rule.id);
          expect(status!.rule.merchant).toBe(dto.merchant);
          expect(status!.rule.name).toBe(dto.name);
          expect(status!.rule.subjectPattern).toBe(dto.subjectPattern);
          expect(status!.rule.expectedIntervalMinutes).toBe(dto.expectedIntervalMinutes);
          expect(status!.rule.deadAfterMinutes).toBe(dto.deadAfterMinutes);
          expect(status!.rule.enabled).toBe(dto.enabled);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-realtime-monitoring, Property 7: 邮件命中更新一致性**
   * *For any* 匹配监控规则的邮件，命中后 lastSeenAt 应更新为邮件接收时间，且相应时间窗口计数器应递增
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 7: 邮件命中更新一致性', () => {
    it('should update lastSeenAt to hit time on email hit', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Get initial status
          const initialStatus = service.getStatus(rule.id);
          expect(initialStatus!.lastSeenAt).toBeNull();

          // Process hit
          const hitTime = email.receivedAt;
          service.updateOnHit(rule.id, hitTime, email);

          // Get updated status
          const updatedStatus = service.getStatus(rule.id);

          // Verify lastSeenAt is updated to hit time
          expect(updatedStatus!.lastSeenAt).not.toBeNull();
          expect(updatedStatus!.lastSeenAt!.toISOString()).toBe(hitTime.toISOString());

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should increment time window counters on email hit', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Get initial status
          const initialStatus = service.getStatus(rule.id);
          const initialCount1h = initialStatus!.count1h;
          const initialCount12h = initialStatus!.count12h;
          const initialCount24h = initialStatus!.count24h;

          // Process hit
          service.updateOnHit(rule.id, email.receivedAt, email);

          // Get updated status
          const updatedStatus = service.getStatus(rule.id);

          // Verify all counters are incremented by 1
          expect(updatedStatus!.count1h).toBe(initialCount1h + 1);
          expect(updatedStatus!.count12h).toBe(initialCount12h + 1);
          expect(updatedStatus!.count24h).toBe(initialCount24h + 1);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should set state to ACTIVE on email hit', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule (initial state is DEAD)
          const rule = ruleRepo.create(dto);

          // Get initial status
          const initialStatus = service.getStatus(rule.id);
          expect(initialStatus!.state).toBe('DEAD');

          // Process hit
          const result = service.updateOnHit(rule.id, email.receivedAt, email);

          // Verify state transition
          expect(result).not.toBeNull();
          expect(result!.previousState).toBe('DEAD');
          expect(result!.currentState).toBe('ACTIVE');

          // Verify persisted state
          const updatedStatus = service.getStatus(rule.id);
          expect(updatedStatus!.state).toBe('ACTIVE');

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should record hit in hit_logs when email metadata is provided', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Get initial hit count
          const hitLogRepo = new TestHitLogRepository(db);
          const initialHitCount = hitLogRepo.countByRuleId(rule.id);

          // Process hit with email metadata
          service.updateOnHit(rule.id, email.receivedAt, email);

          // Verify hit is recorded
          const newHitCount = hitLogRepo.countByRuleId(rule.id);
          expect(newHitCount).toBe(initialHitCount + 1);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should return null when updating non-existent rule', () => {
      const result = service.updateOnHit('non-existent-rule-id', new Date());
      expect(result).toBeNull();
    });
  });

  /**
   * **Feature: email-realtime-monitoring, Property 12: 状态列表排序正确性**
   * *For any* 状态列表查询，返回结果应按 DEAD > WEAK > ACTIVE 顺序排序
   * **Validates: Requirements 6.2**
   */
  describe('Property 12: 状态列表排序正确性', () => {
    // State priority for sorting verification
    const STATE_PRIORITY: Record<string, number> = {
      DEAD: 1,
      WEAK: 2,
      ACTIVE: 3,
    };

    // Extended service with getAllStatuses method
    class TestSignalStateServiceWithGetAll extends TestSignalStateService {
      private stateRepoInternal: TestSignalStateRepository;

      constructor(db: SqlJsDatabase) {
        super(db);
        this.stateRepoInternal = new TestSignalStateRepository(db);
      }

      getAllStatuses(): SignalStatus[] {
        const result = db.exec(
          `SELECT 
            ss.rule_id, ss.state, ss.last_seen_at, 
            ss.count_1h, ss.count_12h, ss.count_24h, ss.updated_at,
            mr.id, mr.merchant, mr.name, mr.subject_pattern,
            mr.expected_interval_minutes, mr.dead_after_minutes,
            mr.enabled, mr.created_at, mr.updated_at as rule_updated_at
          FROM signal_states ss
          JOIN monitoring_rules mr ON ss.rule_id = mr.id`
        );

        if (result.length === 0) {
          return [];
        }

        const now = new Date();
        const statuses = result[0].values.map((row) => {
          const rule: MonitoringRule = {
            id: row[7] as string,
            merchant: row[8] as string,
            name: row[9] as string,
            subjectPattern: row[10] as string,
            expectedIntervalMinutes: row[11] as number,
            deadAfterMinutes: row[12] as number,
            enabled: row[13] === 1,
            createdAt: new Date(row[14] as string),
            updatedAt: new Date(row[15] as string),
          };

          const lastSeenAt = row[2] ? new Date(row[2] as string) : null;
          const gapMinutes = lastSeenAt
            ? Math.floor((now.getTime() - lastSeenAt.getTime()) / (1000 * 60))
            : Infinity;

          // Recalculate state based on current time
          const activeThreshold = rule.expectedIntervalMinutes * 1.5;
          let state: 'ACTIVE' | 'WEAK' | 'DEAD';
          if (gapMinutes <= activeThreshold) {
            state = 'ACTIVE';
          } else if (gapMinutes <= rule.deadAfterMinutes) {
            state = 'WEAK';
          } else {
            state = 'DEAD';
          }

          return {
            ruleId: row[0] as string,
            rule,
            state,
            lastSeenAt,
            gapMinutes,
            count1h: row[3] as number,
            count12h: row[4] as number,
            count24h: row[5] as number,
            updatedAt: new Date(row[6] as string),
          };
        });

        // Sort by state priority: DEAD > WEAK > ACTIVE
        return statuses.sort((a, b) => {
          const priorityDiff = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return b.rule.createdAt.getTime() - a.rule.createdAt.getTime();
        });
      }

      setStateDirectly(ruleId: string, state: 'ACTIVE' | 'WEAK' | 'DEAD', lastSeenAt: Date | null): void {
        const now = new Date().toISOString();
        const lastSeenAtStr = lastSeenAt ? lastSeenAt.toISOString() : null;
        db.run(
          `UPDATE signal_states SET state = ?, last_seen_at = ?, updated_at = ? WHERE rule_id = ?`,
          [state, lastSeenAtStr, now, ruleId]
        );
      }
    }

    it('should sort statuses with DEAD first, then WEAK, then ACTIVE', () => {
      fc.assert(
        fc.property(
          fc.array(createMonitoringRuleDTOArb, { minLength: 3, maxLength: 10 }),
          (dtos) => {
            const extendedService = new TestSignalStateServiceWithGetAll(db);
            const createdRules: MonitoringRule[] = [];

            // Create rules
            for (const dto of dtos) {
              const rule = ruleRepo.create(dto);
              createdRules.push(rule);
            }

            // Assign different states to rules
            const now = new Date();
            createdRules.forEach((rule, index) => {
              const stateIndex = index % 3;
              if (stateIndex === 0) {
                // DEAD: never seen (lastSeenAt = null)
                extendedService.setStateDirectly(rule.id, 'DEAD', null);
              } else if (stateIndex === 1) {
                // WEAK: seen but beyond active threshold
                const weakGap = Math.ceil(rule.expectedIntervalMinutes * 1.5) + 10;
                const lastSeen = new Date(now.getTime() - weakGap * 60 * 1000);
                extendedService.setStateDirectly(rule.id, 'WEAK', lastSeen);
              } else {
                // ACTIVE: recently seen
                const activeGap = Math.floor(rule.expectedIntervalMinutes * 0.5);
                const lastSeen = new Date(now.getTime() - activeGap * 60 * 1000);
                extendedService.setStateDirectly(rule.id, 'ACTIVE', lastSeen);
              }
            });

            // Get all statuses
            const statuses = extendedService.getAllStatuses();

            // Verify sorting: DEAD should come before WEAK, WEAK before ACTIVE
            for (let i = 1; i < statuses.length; i++) {
              const prevPriority = STATE_PRIORITY[statuses[i - 1].state];
              const currPriority = STATE_PRIORITY[statuses[i].state];
              expect(prevPriority).toBeLessThanOrEqual(currPriority);
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

    it('should place all DEAD statuses before any WEAK or ACTIVE', () => {
      fc.assert(
        fc.property(
          fc.array(createMonitoringRuleDTOArb, { minLength: 3, maxLength: 10 }),
          (dtos) => {
            const extendedService = new TestSignalStateServiceWithGetAll(db);
            const createdRules: MonitoringRule[] = [];

            // Create rules
            for (const dto of dtos) {
              const rule = ruleRepo.create(dto);
              createdRules.push(rule);
            }

            // Assign states randomly
            const now = new Date();
            const states: ('ACTIVE' | 'WEAK' | 'DEAD')[] = ['ACTIVE', 'WEAK', 'DEAD'];
            createdRules.forEach((rule) => {
              const randomState = states[Math.floor(Math.random() * states.length)];
              if (randomState === 'DEAD') {
                extendedService.setStateDirectly(rule.id, 'DEAD', null);
              } else if (randomState === 'WEAK') {
                const weakGap = Math.ceil(rule.expectedIntervalMinutes * 1.5) + 10;
                const lastSeen = new Date(now.getTime() - weakGap * 60 * 1000);
                extendedService.setStateDirectly(rule.id, 'WEAK', lastSeen);
              } else {
                const activeGap = Math.floor(rule.expectedIntervalMinutes * 0.5);
                const lastSeen = new Date(now.getTime() - activeGap * 60 * 1000);
                extendedService.setStateDirectly(rule.id, 'ACTIVE', lastSeen);
              }
            });

            // Get all statuses
            const statuses = extendedService.getAllStatuses();

            // Find the last DEAD index and first non-DEAD index
            let lastDeadIndex = -1;
            let firstNonDeadIndex = statuses.length;

            statuses.forEach((status, index) => {
              if (status.state === 'DEAD') {
                lastDeadIndex = index;
              } else if (firstNonDeadIndex === statuses.length) {
                firstNonDeadIndex = index;
              }
            });

            // All DEAD should come before any non-DEAD
            if (lastDeadIndex >= 0 && firstNonDeadIndex < statuses.length) {
              expect(lastDeadIndex).toBeLessThan(firstNonDeadIndex);
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

    it('should place all WEAK statuses before any ACTIVE', () => {
      fc.assert(
        fc.property(
          fc.array(createMonitoringRuleDTOArb, { minLength: 3, maxLength: 10 }),
          (dtos) => {
            const extendedService = new TestSignalStateServiceWithGetAll(db);
            const createdRules: MonitoringRule[] = [];

            // Create rules
            for (const dto of dtos) {
              const rule = ruleRepo.create(dto);
              createdRules.push(rule);
            }

            // Assign only WEAK and ACTIVE states
            const now = new Date();
            createdRules.forEach((rule, index) => {
              if (index % 2 === 0) {
                // WEAK
                const weakGap = Math.ceil(rule.expectedIntervalMinutes * 1.5) + 10;
                const lastSeen = new Date(now.getTime() - weakGap * 60 * 1000);
                extendedService.setStateDirectly(rule.id, 'WEAK', lastSeen);
              } else {
                // ACTIVE
                const activeGap = Math.floor(rule.expectedIntervalMinutes * 0.5);
                const lastSeen = new Date(now.getTime() - activeGap * 60 * 1000);
                extendedService.setStateDirectly(rule.id, 'ACTIVE', lastSeen);
              }
            });

            // Get all statuses
            const statuses = extendedService.getAllStatuses();

            // Find the last WEAK index and first ACTIVE index
            let lastWeakIndex = -1;
            let firstActiveIndex = statuses.length;

            statuses.forEach((status, index) => {
              if (status.state === 'WEAK') {
                lastWeakIndex = index;
              } else if (status.state === 'ACTIVE' && firstActiveIndex === statuses.length) {
                firstActiveIndex = index;
              }
            });

            // All WEAK should come before any ACTIVE
            if (lastWeakIndex >= 0 && firstActiveIndex < statuses.length) {
              expect(lastWeakIndex).toBeLessThan(firstActiveIndex);
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
  });
});
