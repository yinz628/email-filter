/**
 * Hit Processor Tests
 *
 * **Feature: email-realtime-monitoring, Property 8: 恢复事件触发**
 * **Feature: email-realtime-monitoring, Property 15: 邮件元数据约束**
 * **Validates: Requirements 3.3, 8.2**
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
  EmailMetadata,
  SignalState,
  HitResult,
  StateChange,
} from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitraries for generating valid monitoring rule data
const merchantArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
const intervalArb = fc.integer({ min: 1, max: 10080 }); // 1 minute to 1 week

// Generate valid CreateMonitoringRuleDTO with simple pattern
const createMonitoringRuleDTOArb: fc.Arbitrary<CreateMonitoringRuleDTO> = fc.record({
  merchant: merchantArb,
  name: nameArb,
  subjectPattern: fc.constant('.*'), // Use simple pattern that matches everything
  expectedIntervalMinutes: intervalArb,
  deadAfterMinutes: intervalArb,
  enabled: fc.constant(true), // Always enabled for hit processing tests
});

// Generate valid EmailMetadata
const emailMetadataArb: fc.Arbitrary<EmailMetadata> = fc.record({
  sender: fc.emailAddress(),
  subject: fc.string({ minLength: 1, maxLength: 200 }),
  recipient: fc.emailAddress(),
  receivedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
});

// Generate non-ACTIVE states (WEAK or DEAD)
const nonActiveStateArb = fc.constantFrom<SignalState>('WEAK', 'DEAD');


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
    this.db.run('DELETE FROM signal_states WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM hit_logs WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM monitoring_rules WHERE id = ?', [id]);
    return true;
  }
}

class TestSignalStateRepository {
  constructor(private db: SqlJsDatabase) {}

  getState(ruleId: string): SignalState | null {
    const result = this.db.exec('SELECT state FROM signal_states WHERE rule_id = ?', [ruleId]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return result[0].values[0][0] as SignalState;
  }

  setState(ruleId: string, state: SignalState, lastSeenAt: Date | null): void {
    const now = new Date().toISOString();
    const lastSeenAtStr = lastSeenAt ? lastSeenAt.toISOString() : null;
    this.db.run(
      `UPDATE signal_states SET state = ?, last_seen_at = ?, updated_at = ? WHERE rule_id = ?`,
      [state, lastSeenAtStr, now, ruleId]
    );
  }

  updateOnHit(ruleId: string, hitTime: Date): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE signal_states 
       SET last_seen_at = ?, state = 'ACTIVE', updated_at = ?
       WHERE rule_id = ?`,
      [hitTime.toISOString(), now, ruleId]
    );
  }

  incrementCounters(ruleId: string): void {
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

  getByRuleId(ruleId: string): any[] {
    const result = this.db.exec(
      'SELECT * FROM hit_logs WHERE rule_id = ? ORDER BY created_at DESC',
      [ruleId]
    );
    if (result.length === 0) {
      return [];
    }
    return result[0].values;
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

class TestAlertRepository {
  constructor(private db: SqlJsDatabase) {}

  getByRuleId(ruleId: string): any[] {
    const result = this.db.exec(
      'SELECT * FROM alerts WHERE rule_id = ? ORDER BY created_at DESC',
      [ruleId]
    );
    if (result.length === 0) {
      return [];
    }
    return result[0].values;
  }

  countByRuleId(ruleId: string): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM alerts WHERE rule_id = ?', [
      ruleId,
    ]);
    if (result.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }

  getRecoveryAlerts(ruleId: string): any[] {
    const result = this.db.exec(
      `SELECT * FROM alerts WHERE rule_id = ? AND alert_type = 'SIGNAL_RECOVERED' ORDER BY created_at DESC`,
      [ruleId]
    );
    if (result.length === 0) {
      return [];
    }
    return result[0].values;
  }
}


/**
 * Test-specific HitProcessor that works with sql.js
 */
class TestHitProcessor {
  private ruleRepo: TestMonitoringRuleRepository;
  private stateRepo: TestSignalStateRepository;
  private hitLogRepo: TestHitLogRepository;
  private alertRepo: TestAlertRepository;

  constructor(private db: SqlJsDatabase) {
    this.ruleRepo = new TestMonitoringRuleRepository(db);
    this.stateRepo = new TestSignalStateRepository(db);
    this.hitLogRepo = new TestHitLogRepository(db);
    this.alertRepo = new TestAlertRepository(db);
  }

  /**
   * Process an email against all enabled monitoring rules
   */
  processEmail(email: EmailMetadata): HitResult {
    // Validate email metadata - only use required fields (Requirement 8.2)
    this.validateEmailMetadata(email);

    // Match against all enabled rules
    const matchedRules = this.matchRules(email);

    if (matchedRules.length === 0) {
      return {
        matched: false,
        matchedRules: [],
        stateChanges: [],
      };
    }

    const stateChanges: StateChange[] = [];

    // Process each matched rule
    for (const rule of matchedRules) {
      const stateChange = this.recordHit(rule.id, email);
      if (stateChange) {
        stateChanges.push(stateChange);

        // Create alert if state changed (especially for recovery - Requirement 3.3)
        if (stateChange.alertTriggered) {
          this.createAlertForStateChange(rule, stateChange, email);
        }
      }
    }

    return {
      matched: true,
      matchedRules: matchedRules.map((r) => r.id),
      stateChanges,
    };
  }

  /**
   * Match an email against all enabled monitoring rules
   */
  matchRules(email: EmailMetadata): MonitoringRule[] {
    const enabledRules = this.ruleRepo.getEnabled();
    const matchedRules: MonitoringRule[] = [];

    for (const rule of enabledRules) {
      try {
        const regex = new RegExp(rule.subjectPattern, 'i');
        if (regex.test(email.subject)) {
          matchedRules.push(rule);
        }
      } catch {
        // Invalid regex, skip this rule
      }
    }

    return matchedRules;
  }

  /**
   * Record a hit for a specific rule
   */
  recordHit(ruleId: string, email: EmailMetadata): StateChange | null {
    const previousState = this.stateRepo.getState(ruleId);
    if (!previousState) {
      return null;
    }

    // Update state to ACTIVE
    this.stateRepo.updateOnHit(ruleId, email.receivedAt);
    this.stateRepo.incrementCounters(ruleId);

    // Record hit in hit_logs
    this.hitLogRepo.create(ruleId, email);

    const currentState: SignalState = 'ACTIVE';
    const alertTriggered =
      previousState !== 'ACTIVE' && (previousState === 'WEAK' || previousState === 'DEAD');

    return {
      ruleId,
      previousState,
      currentState,
      alertTriggered,
    };
  }

  /**
   * Create an alert for a state change
   */
  private createAlertForStateChange(
    rule: MonitoringRule,
    stateChange: StateChange,
    email: EmailMetadata
  ): void {
    const now = new Date().toISOString();
    const alertId = uuidv4();

    this.db.run(
      `INSERT INTO alerts (
        id, rule_id, alert_type, previous_state, current_state,
        gap_minutes, count_1h, count_12h, count_24h,
        message, sent_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        alertId,
        rule.id,
        'SIGNAL_RECOVERED',
        stateChange.previousState,
        stateChange.currentState,
        0, // gap is 0 since we just received an email
        1,
        1,
        1,
        `Signal recovered for ${rule.merchant} / ${rule.name}`,
        now,
      ]
    );
  }

  /**
   * Validate email metadata contains only required fields
   */
  private validateEmailMetadata(email: EmailMetadata): void {
    if (!email.sender || typeof email.sender !== 'string') {
      throw new Error('Email metadata must include sender');
    }
    if (!email.subject || typeof email.subject !== 'string') {
      throw new Error('Email metadata must include subject');
    }
    if (!email.recipient || typeof email.recipient !== 'string') {
      throw new Error('Email metadata must include recipient');
    }
    if (!email.receivedAt || !(email.receivedAt instanceof Date)) {
      throw new Error('Email metadata must include receivedAt as Date');
    }
  }

  /**
   * Set state directly for testing
   */
  setRuleState(ruleId: string, state: SignalState, lastSeenAt: Date | null): void {
    this.stateRepo.setState(ruleId, state, lastSeenAt);
  }

  /**
   * Get current state for testing
   */
  getRuleState(ruleId: string): SignalState | null {
    return this.stateRepo.getState(ruleId);
  }

  /**
   * Get recovery alerts for testing
   */
  getRecoveryAlerts(ruleId: string): any[] {
    return this.alertRepo.getRecoveryAlerts(ruleId);
  }

  /**
   * Get hit logs for testing
   */
  getHitLogs(ruleId: string): any[] {
    return this.hitLogRepo.getByRuleId(ruleId);
  }
}


describe('HitProcessor', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let ruleRepo: TestMonitoringRuleRepository;
  let processor: TestHitProcessor;

  beforeEach(async () => {
    // Initialize sql.js
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load consolidated schema (includes all monitoring tables)
    const schemaPath = join(__dirname, '../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    ruleRepo = new TestMonitoringRuleRepository(db);
    processor = new TestHitProcessor(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-realtime-monitoring, Property 8: 恢复事件触发**
   * *For any* 状态为 WEAK 或 DEAD 的规则，收到匹配邮件后状态应变为 ACTIVE 且触发 RECOVERED 事件
   * **Validates: Requirements 3.3**
   */
  describe('Property 8: 恢复事件触发', () => {
    it('should change state to ACTIVE and trigger RECOVERED event when WEAK rule receives matching email', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Set state to WEAK
          const weakLastSeen = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
          processor.setRuleState(rule.id, 'WEAK', weakLastSeen);

          // Verify initial state is WEAK
          expect(processor.getRuleState(rule.id)).toBe('WEAK');

          // Process email
          const result = processor.processEmail(email);

          // Verify state changed to ACTIVE
          expect(processor.getRuleState(rule.id)).toBe('ACTIVE');

          // Verify result indicates match and state change
          expect(result.matched).toBe(true);
          expect(result.matchedRules).toContain(rule.id);
          expect(result.stateChanges.length).toBeGreaterThan(0);

          const stateChange = result.stateChanges.find((sc) => sc.ruleId === rule.id);
          expect(stateChange).toBeDefined();
          expect(stateChange!.previousState).toBe('WEAK');
          expect(stateChange!.currentState).toBe('ACTIVE');
          expect(stateChange!.alertTriggered).toBe(true);

          // Verify RECOVERED alert was created
          const recoveryAlerts = processor.getRecoveryAlerts(rule.id);
          expect(recoveryAlerts.length).toBeGreaterThan(0);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should change state to ACTIVE and trigger RECOVERED event when DEAD rule receives matching email', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule (initial state is DEAD)
          const rule = ruleRepo.create(dto);

          // Verify initial state is DEAD
          expect(processor.getRuleState(rule.id)).toBe('DEAD');

          // Process email
          const result = processor.processEmail(email);

          // Verify state changed to ACTIVE
          expect(processor.getRuleState(rule.id)).toBe('ACTIVE');

          // Verify result indicates match and state change
          expect(result.matched).toBe(true);
          expect(result.matchedRules).toContain(rule.id);
          expect(result.stateChanges.length).toBeGreaterThan(0);

          const stateChange = result.stateChanges.find((sc) => sc.ruleId === rule.id);
          expect(stateChange).toBeDefined();
          expect(stateChange!.previousState).toBe('DEAD');
          expect(stateChange!.currentState).toBe('ACTIVE');
          expect(stateChange!.alertTriggered).toBe(true);

          // Verify RECOVERED alert was created
          const recoveryAlerts = processor.getRecoveryAlerts(rule.id);
          expect(recoveryAlerts.length).toBeGreaterThan(0);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should NOT trigger RECOVERED event when ACTIVE rule receives matching email', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Set state to ACTIVE
          const activeLastSeen = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
          processor.setRuleState(rule.id, 'ACTIVE', activeLastSeen);

          // Verify initial state is ACTIVE
          expect(processor.getRuleState(rule.id)).toBe('ACTIVE');

          // Process email
          const result = processor.processEmail(email);

          // Verify state remains ACTIVE
          expect(processor.getRuleState(rule.id)).toBe('ACTIVE');

          // Verify result indicates match but no alert triggered
          expect(result.matched).toBe(true);
          expect(result.matchedRules).toContain(rule.id);

          const stateChange = result.stateChanges.find((sc) => sc.ruleId === rule.id);
          expect(stateChange).toBeDefined();
          expect(stateChange!.previousState).toBe('ACTIVE');
          expect(stateChange!.currentState).toBe('ACTIVE');
          expect(stateChange!.alertTriggered).toBe(false);

          // Verify NO RECOVERED alert was created
          const recoveryAlerts = processor.getRecoveryAlerts(rule.id);
          expect(recoveryAlerts.length).toBe(0);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should trigger RECOVERED for any non-ACTIVE state transitioning to ACTIVE', () => {
      fc.assert(
        fc.property(
          createMonitoringRuleDTOArb,
          emailMetadataArb,
          nonActiveStateArb,
          (dto, email, initialState) => {
            // Create a rule
            const rule = ruleRepo.create(dto);

            // Set state to non-ACTIVE (WEAK or DEAD)
            const lastSeen =
              initialState === 'DEAD' ? null : new Date(Date.now() - 2 * 60 * 60 * 1000);
            processor.setRuleState(rule.id, initialState, lastSeen);

            // Verify initial state
            expect(processor.getRuleState(rule.id)).toBe(initialState);

            // Process email
            const result = processor.processEmail(email);

            // Verify state changed to ACTIVE
            expect(processor.getRuleState(rule.id)).toBe('ACTIVE');

            // Verify RECOVERED alert was triggered
            const stateChange = result.stateChanges.find((sc) => sc.ruleId === rule.id);
            expect(stateChange).toBeDefined();
            expect(stateChange!.alertTriggered).toBe(true);

            // Cleanup
            ruleRepo.delete(rule.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: email-realtime-monitoring, Property 15: 邮件元数据约束**
   * *For any* 监控模块处理的邮件，仅使用 sender、subject、recipient、receivedAt 四个字段
   * **Validates: Requirements 8.2**
   */
  describe('Property 15: 邮件元数据约束', () => {
    it('should only use sender, subject, recipient, receivedAt fields from email metadata', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Process email with only the required fields
          const minimalEmail: EmailMetadata = {
            sender: email.sender,
            subject: email.subject,
            recipient: email.recipient,
            receivedAt: email.receivedAt,
          };

          // This should work without any additional fields
          const result = processor.processEmail(minimalEmail);

          // Verify processing succeeded
          expect(result.matched).toBe(true);

          // Verify hit log contains only the required fields
          const hitLogs = processor.getHitLogs(rule.id);
          expect(hitLogs.length).toBeGreaterThan(0);

          // Hit log row structure: [id, rule_id, sender, subject, recipient, received_at, created_at]
          const hitLog = hitLogs[0];
          expect(hitLog[2]).toBe(email.sender); // sender
          expect(hitLog[3]).toBe(email.subject); // subject
          expect(hitLog[4]).toBe(email.recipient); // recipient
          expect(hitLog[5]).toBe(email.receivedAt.toISOString()); // received_at

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject email metadata missing sender', () => {
      fc.assert(
        fc.property(emailMetadataArb, (email) => {
          const invalidEmail = {
            sender: '', // Empty sender
            subject: email.subject,
            recipient: email.recipient,
            receivedAt: email.receivedAt,
          } as EmailMetadata;

          expect(() => processor.processEmail(invalidEmail)).toThrow(
            'Email metadata must include sender'
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should reject email metadata missing subject', () => {
      fc.assert(
        fc.property(emailMetadataArb, (email) => {
          const invalidEmail = {
            sender: email.sender,
            subject: '', // Empty subject
            recipient: email.recipient,
            receivedAt: email.receivedAt,
          } as EmailMetadata;

          expect(() => processor.processEmail(invalidEmail)).toThrow(
            'Email metadata must include subject'
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should reject email metadata missing recipient', () => {
      fc.assert(
        fc.property(emailMetadataArb, (email) => {
          const invalidEmail = {
            sender: email.sender,
            subject: email.subject,
            recipient: '', // Empty recipient
            receivedAt: email.receivedAt,
          } as EmailMetadata;

          expect(() => processor.processEmail(invalidEmail)).toThrow(
            'Email metadata must include recipient'
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should reject email metadata with invalid receivedAt', () => {
      fc.assert(
        fc.property(emailMetadataArb, (email) => {
          const invalidEmail = {
            sender: email.sender,
            subject: email.subject,
            recipient: email.recipient,
            receivedAt: 'not-a-date' as any, // Invalid date
          } as EmailMetadata;

          expect(() => processor.processEmail(invalidEmail)).toThrow(
            'Email metadata must include receivedAt as Date'
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should process email with extra fields but only store required fields', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Create email with extra fields (simulating real email with more data)
          const emailWithExtras = {
            sender: email.sender,
            subject: email.subject,
            recipient: email.recipient,
            receivedAt: email.receivedAt,
            // Extra fields that should be ignored
            body: 'This is the email body',
            attachments: ['file1.pdf', 'file2.doc'],
            headers: { 'X-Custom': 'value' },
          } as EmailMetadata;

          // Process should succeed
          const result = processor.processEmail(emailWithExtras);
          expect(result.matched).toBe(true);

          // Verify only required fields are stored in hit log
          const hitLogs = processor.getHitLogs(rule.id);
          expect(hitLogs.length).toBeGreaterThan(0);

          // Hit log should only have the standard columns
          // [id, rule_id, sender, subject, recipient, received_at, created_at]
          const hitLog = hitLogs[0];
          expect(hitLog.length).toBe(7); // Only 7 columns in hit_logs table

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('matchRules', () => {
    it('should match emails against enabled rules only', () => {
      fc.assert(
        fc.property(emailMetadataArb, (email) => {
          // Create an enabled rule
          const enabledRule = ruleRepo.create({
            merchant: 'test-merchant',
            name: 'Enabled Rule',
            subjectPattern: '.*',
            expectedIntervalMinutes: 60,
            deadAfterMinutes: 120,
            enabled: true,
          });

          // Create a disabled rule
          const disabledDto: CreateMonitoringRuleDTO = {
            merchant: 'test-merchant',
            name: 'Disabled Rule',
            subjectPattern: '.*',
            expectedIntervalMinutes: 60,
            deadAfterMinutes: 120,
            enabled: false,
          };
          const disabledRule = ruleRepo.create(disabledDto);
          // Manually disable since create defaults to enabled
          db.run('UPDATE monitoring_rules SET enabled = 0 WHERE id = ?', [disabledRule.id]);

          // Match rules
          const matchedRules = processor.matchRules(email);

          // Should only match enabled rule
          expect(matchedRules.map((r) => r.id)).toContain(enabledRule.id);
          expect(matchedRules.map((r) => r.id)).not.toContain(disabledRule.id);

          // Cleanup
          ruleRepo.delete(enabledRule.id);
          ruleRepo.delete(disabledRule.id);
        }),
        { numRuns: 50 }
      );
    });

    it('should return empty array when no rules match', () => {
      // Create a rule with a specific pattern
      const rule = ruleRepo.create({
        merchant: 'test-merchant',
        name: 'Specific Pattern Rule',
        subjectPattern: '^SPECIFIC_PREFIX',
        expectedIntervalMinutes: 60,
        deadAfterMinutes: 120,
        enabled: true,
      });

      // Email that doesn't match
      const email: EmailMetadata = {
        sender: 'test@example.com',
        subject: 'This does not match the pattern',
        recipient: 'recipient@example.com',
        receivedAt: new Date(),
      };

      const matchedRules = processor.matchRules(email);
      expect(matchedRules.map((r) => r.id)).not.toContain(rule.id);

      // Cleanup
      ruleRepo.delete(rule.id);
    });
  });

  describe('recordHit', () => {
    it('should record hit in hit_logs', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, emailMetadataArb, (dto, email) => {
          // Create a rule
          const rule = ruleRepo.create(dto);

          // Record hit
          processor.recordHit(rule.id, email);

          // Verify hit is recorded
          const hitLogs = processor.getHitLogs(rule.id);
          expect(hitLogs.length).toBe(1);

          // Cleanup
          ruleRepo.delete(rule.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should return null for non-existent rule', () => {
      const email: EmailMetadata = {
        sender: 'test@example.com',
        subject: 'Test',
        recipient: 'recipient@example.com',
        receivedAt: new Date(),
      };

      const result = processor.recordHit('non-existent-rule-id', email);
      expect(result).toBeNull();
    });
  });
});
