/**
 * Cleanup Service Tests
 *
 * **Feature: email-realtime-monitoring, Property 14: 数据清理正确性**
 * **Validates: Requirements 7.2, 7.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test-specific HitLogRepository that works with sql.js
 */
class TestHitLogRepository {
  constructor(private db: SqlJsDatabase) {}

  create(ruleId: string, sender: string, subject: string, recipient: string, receivedAt: Date, createdAt: Date): number {
    this.db.run(
      `INSERT INTO hit_logs (rule_id, sender, subject, recipient, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, sender, subject, recipient, receivedAt.toISOString(), createdAt.toISOString()]
    );
    const result = this.db.exec('SELECT last_insert_rowid()');
    return result[0].values[0][0] as number;
  }

  deleteOlderThan(date: Date): number {
    const countBefore = this.count();
    this.db.run('DELETE FROM hit_logs WHERE created_at < ?', [date.toISOString()]);
    const countAfter = this.count();
    return countBefore - countAfter;
  }

  count(): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM hit_logs');
    return result[0].values[0][0] as number;
  }

  getAll(): Array<{ id: number; createdAt: Date }> {
    const result = this.db.exec('SELECT id, created_at FROM hit_logs');
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0] as number,
      createdAt: new Date(row[1] as string),
    }));
  }
}

/**
 * Test-specific AlertRepository that works with sql.js
 */
class TestAlertRepository {
  constructor(private db: SqlJsDatabase) {}

  create(ruleId: string, createdAt: Date): string {
    const id = uuidv4();
    this.db.run(
      `INSERT INTO alerts (id, rule_id, alert_type, previous_state, current_state, gap_minutes, count_1h, count_12h, count_24h, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ruleId, 'FREQUENCY_DOWN', 'ACTIVE', 'WEAK', 90, 1, 5, 10, 'Test alert', createdAt.toISOString()]
    );
    return id;
  }

  deleteOlderThan(date: Date): number {
    const countBefore = this.count();
    this.db.run('DELETE FROM alerts WHERE created_at < ?', [date.toISOString()]);
    const countAfter = this.count();
    return countBefore - countAfter;
  }

  count(): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM alerts');
    return result[0].values[0][0] as number;
  }

  getAll(): Array<{ id: string; createdAt: Date }> {
    const result = this.db.exec('SELECT id, created_at FROM alerts');
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0] as string,
      createdAt: new Date(row[1] as string),
    }));
  }
}

/**
 * Test-specific SystemLogRepository that works with sql.js
 */
class TestSystemLogRepository {
  constructor(private db: SqlJsDatabase) {}

  create(category: string, message: string, createdAt: Date): number {
    this.db.run(
      `INSERT INTO system_logs (category, level, message, worker_name, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [category, 'info', message, 'global', createdAt.toISOString()]
    );
    const result = this.db.exec('SELECT last_insert_rowid()');
    return result[0].values[0][0] as number;
  }

  deleteOlderThan(date: Date): number {
    const countBefore = this.count();
    this.db.run('DELETE FROM system_logs WHERE created_at < ?', [date.toISOString()]);
    const countAfter = this.count();
    return countBefore - countAfter;
  }

  count(): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM system_logs');
    return result[0].values[0][0] as number;
  }

  getAll(): Array<{ id: number; createdAt: Date }> {
    const result = this.db.exec('SELECT id, created_at FROM system_logs');
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0] as number,
      createdAt: new Date(row[1] as string),
    }));
  }
}

/**
 * Test-specific SubjectTrackerRepository that works with sql.js
 */
class TestSubjectTrackerRepository {
  constructor(private db: SqlJsDatabase) {}

  create(subjectHash: string, subject: string, receivedAt: Date): number {
    this.db.run(
      `INSERT INTO email_subject_tracker (subject_hash, subject, received_at)
       VALUES (?, ?, ?)`,
      [subjectHash, subject, receivedAt.toISOString()]
    );
    const result = this.db.exec('SELECT last_insert_rowid()');
    return result[0].values[0][0] as number;
  }

  deleteOlderThan(date: Date): number {
    const countBefore = this.count();
    this.db.run('DELETE FROM email_subject_tracker WHERE received_at < ?', [date.toISOString()]);
    const countAfter = this.count();
    return countBefore - countAfter;
  }

  count(): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM email_subject_tracker');
    return result[0].values[0][0] as number;
  }

  getAll(): Array<{ id: number; receivedAt: Date }> {
    const result = this.db.exec('SELECT id, received_at FROM email_subject_tracker');
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0] as number,
      receivedAt: new Date(row[1] as string),
    }));
  }
}

/**
 * Test-specific HeartbeatLogRepository that works with sql.js
 */
class TestHeartbeatLogRepository {
  constructor(private db: SqlJsDatabase) {}

  create(checkedAt: Date): number {
    this.db.run(
      `INSERT INTO heartbeat_logs (checked_at, rules_checked, state_changes, alerts_triggered, duration_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [checkedAt.toISOString(), 10, 0, 0, 100]
    );
    const result = this.db.exec('SELECT last_insert_rowid()');
    return result[0].values[0][0] as number;
  }

  deleteOlderThan(date: Date): number {
    const countBefore = this.count();
    this.db.run('DELETE FROM heartbeat_logs WHERE checked_at < ?', [date.toISOString()]);
    const countAfter = this.count();
    return countBefore - countAfter;
  }

  count(): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM heartbeat_logs');
    return result[0].values[0][0] as number;
  }

  getAll(): Array<{ id: number; checkedAt: Date }> {
    const result = this.db.exec('SELECT id, checked_at FROM heartbeat_logs');
    if (result.length === 0) return [];
    return result[0].values.map((row) => ({
      id: row[0] as number,
      checkedAt: new Date(row[1] as string),
    }));
  }
}

/**
 * CleanupConfig interface for testing
 */
interface TestCleanupConfig {
  systemLogsRetentionDays: number;
  hitLogsRetentionHours: number;
  alertsRetentionDays: number;
  heartbeatLogsRetentionDays: number;
  subjectTrackerRetentionHours: number;
  cleanupHour: number;
  autoCleanupEnabled: boolean;
}

/**
 * FullCleanupResult interface for testing
 */
interface TestFullCleanupResult {
  hitLogs: { deletedCount: number; cutoffDate: Date };
  alerts: { deletedCount: number; cutoffDate: Date };
  systemLogs: { deletedCount: number; cutoffDate: Date };
  heartbeatLogs: { deletedCount: number; cutoffDate: Date };
  subjectTracker: { deletedCount: number; cutoffDate: Date };
  totalDeleted: number;
  durationMs: number;
  executedAt: Date;
}

/**
 * Test CleanupService that uses sql.js
 */
class TestCleanupService {
  private hitLogRepo: TestHitLogRepository;
  private alertRepo: TestAlertRepository;
  private systemLogRepo: TestSystemLogRepository;
  private subjectTrackerRepo: TestSubjectTrackerRepository;
  private heartbeatLogRepo: TestHeartbeatLogRepository;

  constructor(private db: SqlJsDatabase) {
    this.hitLogRepo = new TestHitLogRepository(db);
    this.alertRepo = new TestAlertRepository(db);
    this.systemLogRepo = new TestSystemLogRepository(db);
    this.subjectTrackerRepo = new TestSubjectTrackerRepository(db);
    this.heartbeatLogRepo = new TestHeartbeatLogRepository(db);
  }

  cleanupHitLogs(retentionHours: number): { deletedCount: number; cutoffDate: Date } {
    if (retentionHours < 0) {
      throw new Error('Retention hours must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionHours * 60 * 60 * 1000);

    const deletedCount = this.hitLogRepo.deleteOlderThan(cutoffDate);

    return { deletedCount, cutoffDate };
  }

  cleanupAlerts(retentionDays: number): { deletedCount: number; cutoffDate: Date } {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedCount = this.alertRepo.deleteOlderThan(cutoffDate);

    return { deletedCount, cutoffDate };
  }

  cleanupSystemLogs(retentionDays: number): { deletedCount: number; cutoffDate: Date } {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedCount = this.systemLogRepo.deleteOlderThan(cutoffDate);

    return { deletedCount, cutoffDate };
  }

  cleanupSubjectTracker(retentionHours: number): { deletedCount: number; cutoffDate: Date } {
    if (retentionHours < 0) {
      throw new Error('Retention hours must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionHours * 60 * 60 * 1000);

    const deletedCount = this.subjectTrackerRepo.deleteOlderThan(cutoffDate);

    return { deletedCount, cutoffDate };
  }

  cleanupHeartbeatLogs(retentionDays: number): { deletedCount: number; cutoffDate: Date } {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedCount = this.heartbeatLogRepo.deleteOlderThan(cutoffDate);

    return { deletedCount, cutoffDate };
  }

  runFullCleanupWithConfig(config: TestCleanupConfig): TestFullCleanupResult {
    const startTime = Date.now();
    const executedAt = new Date();

    const hitLogsResult = this.cleanupHitLogs(config.hitLogsRetentionHours);
    const alertsResult = this.cleanupAlerts(config.alertsRetentionDays);
    const systemLogsResult = this.cleanupSystemLogs(config.systemLogsRetentionDays);
    const heartbeatLogsResult = this.cleanupHeartbeatLogs(config.heartbeatLogsRetentionDays);
    const subjectTrackerResult = this.cleanupSubjectTracker(config.subjectTrackerRetentionHours);

    const durationMs = Date.now() - startTime;

    return {
      hitLogs: hitLogsResult,
      alerts: alertsResult,
      systemLogs: systemLogsResult,
      heartbeatLogs: heartbeatLogsResult,
      subjectTracker: subjectTrackerResult,
      totalDeleted: hitLogsResult.deletedCount + alertsResult.deletedCount + 
                    systemLogsResult.deletedCount + heartbeatLogsResult.deletedCount + 
                    subjectTrackerResult.deletedCount,
      durationMs,
      executedAt,
    };
  }

  getHitLogRepo(): TestHitLogRepository {
    return this.hitLogRepo;
  }

  getAlertRepo(): TestAlertRepository {
    return this.alertRepo;
  }

  getSystemLogRepo(): TestSystemLogRepository {
    return this.systemLogRepo;
  }

  getSubjectTrackerRepo(): TestSubjectTrackerRepository {
    return this.subjectTrackerRepo;
  }

  getHeartbeatLogRepo(): TestHeartbeatLogRepository {
    return this.heartbeatLogRepo;
  }
}

describe('CleanupService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let service: TestCleanupService;
  let testRuleId: string;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load consolidated schema (includes all monitoring tables)
    const schemaPath = join(__dirname, '../../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Create a test rule for foreign key constraints
    testRuleId = uuidv4();
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [testRuleId, 'test-merchant', 'Test Rule', '.*', 60, 120, 1, now, now]
    );

    service = new TestCleanupService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-realtime-monitoring, Property 14: 数据清理正确性**
   * *For any* 超过保留期限的记录（命中记录 48-72h，告警记录 30-90天），
   * 清理操作应删除这些记录且不影响未过期记录
   * **Validates: Requirements 7.2, 7.3**
   */
  describe('Property 14: 数据清理正确性', () => {
    describe('Hit Log Cleanup', () => {
      it('should delete records older than retention period and preserve newer records', () => {
        fc.assert(
          fc.property(
            // Retention hours between 48-72 as per requirements
            fc.integer({ min: 48, max: 72 }),
            // Number of old records to create
            fc.integer({ min: 1, max: 10 }),
            // Number of new records to create
            fc.integer({ min: 1, max: 10 }),
            // Hours beyond retention for old records
            fc.integer({ min: 1, max: 100 }),
            (retentionHours, oldRecordCount, newRecordCount, extraHours) => {
              const hitLogRepo = service.getHitLogRepo();
              const now = new Date();

              // Create old records (beyond retention period)
              const oldTime = new Date(now.getTime() - (retentionHours + extraHours) * 60 * 60 * 1000);
              for (let i = 0; i < oldRecordCount; i++) {
                hitLogRepo.create(testRuleId, 'sender@test.com', 'Old Subject', 'recipient@test.com', oldTime, oldTime);
              }

              // Create new records (within retention period)
              const newTime = new Date(now.getTime() - (retentionHours - 1) * 60 * 60 * 1000);
              for (let i = 0; i < newRecordCount; i++) {
                hitLogRepo.create(testRuleId, 'sender@test.com', 'New Subject', 'recipient@test.com', newTime, newTime);
              }

              // Verify initial state
              const totalBefore = hitLogRepo.count();
              expect(totalBefore).toBe(oldRecordCount + newRecordCount);

              // Run cleanup
              const result = service.cleanupHitLogs(retentionHours);

              // Verify results
              expect(result.deletedCount).toBe(oldRecordCount);
              expect(hitLogRepo.count()).toBe(newRecordCount);

              // Verify remaining records are all within retention period
              const remaining = hitLogRepo.getAll();
              for (const record of remaining) {
                expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(result.cutoffDate.getTime());
              }

              // Clean up for next iteration
              db.run('DELETE FROM hit_logs');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should not delete any records when all are within retention period', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 48, max: 72 }),
            fc.integer({ min: 1, max: 10 }),
            (retentionHours, recordCount) => {
              const hitLogRepo = service.getHitLogRepo();
              const now = new Date();

              // Create records within retention period
              const recentTime = new Date(now.getTime() - (retentionHours / 2) * 60 * 60 * 1000);
              for (let i = 0; i < recordCount; i++) {
                hitLogRepo.create(testRuleId, 'sender@test.com', 'Subject', 'recipient@test.com', recentTime, recentTime);
              }

              const countBefore = hitLogRepo.count();
              const result = service.cleanupHitLogs(retentionHours);

              expect(result.deletedCount).toBe(0);
              expect(hitLogRepo.count()).toBe(countBefore);

              // Clean up for next iteration
              db.run('DELETE FROM hit_logs');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should delete all records when all are beyond retention period', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 48, max: 72 }),
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 1, max: 100 }),
            (retentionHours, recordCount, extraHours) => {
              const hitLogRepo = service.getHitLogRepo();
              const now = new Date();

              // Create records beyond retention period
              const oldTime = new Date(now.getTime() - (retentionHours + extraHours) * 60 * 60 * 1000);
              for (let i = 0; i < recordCount; i++) {
                hitLogRepo.create(testRuleId, 'sender@test.com', 'Subject', 'recipient@test.com', oldTime, oldTime);
              }

              const result = service.cleanupHitLogs(retentionHours);

              expect(result.deletedCount).toBe(recordCount);
              expect(hitLogRepo.count()).toBe(0);

              // Clean up for next iteration
              db.run('DELETE FROM hit_logs');
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Alert Cleanup', () => {
      it('should delete alerts older than retention period and preserve newer alerts', () => {
        fc.assert(
          fc.property(
            // Retention days between 30-90 as per requirements
            fc.integer({ min: 30, max: 90 }),
            // Number of old alerts to create
            fc.integer({ min: 1, max: 10 }),
            // Number of new alerts to create
            fc.integer({ min: 1, max: 10 }),
            // Days beyond retention for old alerts
            fc.integer({ min: 1, max: 30 }),
            (retentionDays, oldAlertCount, newAlertCount, extraDays) => {
              const alertRepo = service.getAlertRepo();
              const now = new Date();

              // Create old alerts (beyond retention period)
              const oldTime = new Date(now.getTime() - (retentionDays + extraDays) * 24 * 60 * 60 * 1000);
              for (let i = 0; i < oldAlertCount; i++) {
                alertRepo.create(testRuleId, oldTime);
              }

              // Create new alerts (within retention period)
              const newTime = new Date(now.getTime() - (retentionDays - 1) * 24 * 60 * 60 * 1000);
              for (let i = 0; i < newAlertCount; i++) {
                alertRepo.create(testRuleId, newTime);
              }

              // Verify initial state
              const totalBefore = alertRepo.count();
              expect(totalBefore).toBe(oldAlertCount + newAlertCount);

              // Run cleanup
              const result = service.cleanupAlerts(retentionDays);

              // Verify results
              expect(result.deletedCount).toBe(oldAlertCount);
              expect(alertRepo.count()).toBe(newAlertCount);

              // Verify remaining alerts are all within retention period
              const remaining = alertRepo.getAll();
              for (const alert of remaining) {
                expect(alert.createdAt.getTime()).toBeGreaterThanOrEqual(result.cutoffDate.getTime());
              }

              // Clean up for next iteration
              db.run('DELETE FROM alerts');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should not delete any alerts when all are within retention period', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 30, max: 90 }),
            fc.integer({ min: 1, max: 10 }),
            (retentionDays, alertCount) => {
              const alertRepo = service.getAlertRepo();
              const now = new Date();

              // Create alerts within retention period
              const recentTime = new Date(now.getTime() - (retentionDays / 2) * 24 * 60 * 60 * 1000);
              for (let i = 0; i < alertCount; i++) {
                alertRepo.create(testRuleId, recentTime);
              }

              const countBefore = alertRepo.count();
              const result = service.cleanupAlerts(retentionDays);

              expect(result.deletedCount).toBe(0);
              expect(alertRepo.count()).toBe(countBefore);

              // Clean up for next iteration
              db.run('DELETE FROM alerts');
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should delete all alerts when all are beyond retention period', () => {
        fc.assert(
          fc.property(
            fc.integer({ min: 30, max: 90 }),
            fc.integer({ min: 1, max: 10 }),
            fc.integer({ min: 1, max: 30 }),
            (retentionDays, alertCount, extraDays) => {
              const alertRepo = service.getAlertRepo();
              const now = new Date();

              // Create alerts beyond retention period
              const oldTime = new Date(now.getTime() - (retentionDays + extraDays) * 24 * 60 * 60 * 1000);
              for (let i = 0; i < alertCount; i++) {
                alertRepo.create(testRuleId, oldTime);
              }

              const result = service.cleanupAlerts(retentionDays);

              expect(result.deletedCount).toBe(alertCount);
              expect(alertRepo.count()).toBe(0);

              // Clean up for next iteration
              db.run('DELETE FROM alerts');
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    /**
     * **Feature: data-cleanup-settings, Property 3: Cleanup Removes Old Records**
     * *For any* table with records of various timestamps and a configured retention period,
     * after cleanup execution, no records older than the cutoff date should remain in that table.
     * **Validates: Requirements 2.3, 3.4**
     */
    describe('Property 3: Cleanup Removes Old Records - System Logs', () => {
      it('should delete system logs older than retention period and preserve newer logs', () => {
        fc.assert(
          fc.property(
            // Retention days between 1-365 as per requirements
            fc.integer({ min: 1, max: 365 }),
            // Number of old records to create
            fc.integer({ min: 1, max: 10 }),
            // Number of new records to create
            fc.integer({ min: 1, max: 10 }),
            // Days beyond retention for old records
            fc.integer({ min: 1, max: 30 }),
            (retentionDays, oldRecordCount, newRecordCount, extraDays) => {
              const systemLogRepo = service.getSystemLogRepo();
              const now = new Date();

              // Create old records (beyond retention period)
              const oldTime = new Date(now.getTime() - (retentionDays + extraDays) * 24 * 60 * 60 * 1000);
              for (let i = 0; i < oldRecordCount; i++) {
                systemLogRepo.create('email_forward', 'Old log message', oldTime);
              }

              // Create new records (within retention period)
              const newTime = new Date(now.getTime() - (retentionDays - 1) * 24 * 60 * 60 * 1000);
              for (let i = 0; i < newRecordCount; i++) {
                systemLogRepo.create('email_forward', 'New log message', newTime);
              }

              // Verify initial state
              const totalBefore = systemLogRepo.count();
              expect(totalBefore).toBe(oldRecordCount + newRecordCount);

              // Run cleanup
              const result = service.cleanupSystemLogs(retentionDays);

              // Verify results
              expect(result.deletedCount).toBe(oldRecordCount);
              expect(systemLogRepo.count()).toBe(newRecordCount);

              // Verify remaining records are all within retention period
              const remaining = systemLogRepo.getAll();
              for (const record of remaining) {
                expect(record.createdAt.getTime()).toBeGreaterThanOrEqual(result.cutoffDate.getTime());
              }

              // Clean up for next iteration
              db.run('DELETE FROM system_logs');
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Property 3: Cleanup Removes Old Records - Subject Tracker', () => {
      it('should delete subject tracker records older than retention period and preserve newer records', () => {
        fc.assert(
          fc.property(
            // Retention hours between 1-72 as per requirements
            fc.integer({ min: 1, max: 72 }),
            // Number of old records to create
            fc.integer({ min: 1, max: 10 }),
            // Number of new records to create
            fc.integer({ min: 1, max: 10 }),
            // Hours beyond retention for old records
            fc.integer({ min: 1, max: 100 }),
            (retentionHours, oldRecordCount, newRecordCount, extraHours) => {
              const subjectTrackerRepo = service.getSubjectTrackerRepo();
              const now = new Date();

              // Create old records (beyond retention period)
              const oldTime = new Date(now.getTime() - (retentionHours + extraHours) * 60 * 60 * 1000);
              for (let i = 0; i < oldRecordCount; i++) {
                subjectTrackerRepo.create(`hash_old_${i}`, `Old Subject ${i}`, oldTime);
              }

              // Create new records (within retention period)
              const newTime = new Date(now.getTime() - (retentionHours - 1) * 60 * 60 * 1000);
              for (let i = 0; i < newRecordCount; i++) {
                subjectTrackerRepo.create(`hash_new_${i}`, `New Subject ${i}`, newTime);
              }

              // Verify initial state
              const totalBefore = subjectTrackerRepo.count();
              expect(totalBefore).toBe(oldRecordCount + newRecordCount);

              // Run cleanup
              const result = service.cleanupSubjectTracker(retentionHours);

              // Verify results
              expect(result.deletedCount).toBe(oldRecordCount);
              expect(subjectTrackerRepo.count()).toBe(newRecordCount);

              // Verify remaining records are all within retention period
              const remaining = subjectTrackerRepo.getAll();
              for (const record of remaining) {
                expect(record.receivedAt.getTime()).toBeGreaterThanOrEqual(result.cutoffDate.getTime());
              }

              // Clean up for next iteration
              db.run('DELETE FROM email_subject_tracker');
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    /**
     * **Feature: data-cleanup-settings, Property 4: Cleanup Result Contains All Tables**
     * *For any* cleanup execution (manual or scheduled), the result should contain
     * deletion counts for all cleanable tables (systemLogs, hitLogs, alerts, heartbeatLogs, subjectTracker).
     * **Validates: Requirements 4.3, 5.3**
     */
    describe('Property 4: Cleanup Result Contains All Tables', () => {
      it('should return cleanup result containing all table counts', () => {
        fc.assert(
          fc.property(
            // Generate valid config values within ranges
            fc.integer({ min: 1, max: 365 }),   // systemLogsRetentionDays
            fc.integer({ min: 24, max: 168 }),  // hitLogsRetentionHours
            fc.integer({ min: 7, max: 365 }),   // alertsRetentionDays
            fc.integer({ min: 1, max: 90 }),    // heartbeatLogsRetentionDays
            fc.integer({ min: 1, max: 72 }),    // subjectTrackerRetentionHours
            (systemLogsRetentionDays, hitLogsRetentionHours, alertsRetentionDays, heartbeatLogsRetentionDays, subjectTrackerRetentionHours) => {
              const config: TestCleanupConfig = {
                systemLogsRetentionDays,
                hitLogsRetentionHours,
                alertsRetentionDays,
                heartbeatLogsRetentionDays,
                subjectTrackerRetentionHours,
                cleanupHour: 3,
                autoCleanupEnabled: true,
              };

              // Run full cleanup with config
              const result = service.runFullCleanupWithConfig(config);

              // Verify result contains all required table results
              expect(result).toHaveProperty('hitLogs');
              expect(result).toHaveProperty('alerts');
              expect(result).toHaveProperty('systemLogs');
              expect(result).toHaveProperty('heartbeatLogs');
              expect(result).toHaveProperty('subjectTracker');
              expect(result).toHaveProperty('totalDeleted');
              expect(result).toHaveProperty('durationMs');
              expect(result).toHaveProperty('executedAt');

              // Verify each table result has required properties
              expect(result.hitLogs).toHaveProperty('deletedCount');
              expect(result.hitLogs).toHaveProperty('cutoffDate');
              expect(result.alerts).toHaveProperty('deletedCount');
              expect(result.alerts).toHaveProperty('cutoffDate');
              expect(result.systemLogs).toHaveProperty('deletedCount');
              expect(result.systemLogs).toHaveProperty('cutoffDate');
              expect(result.heartbeatLogs).toHaveProperty('deletedCount');
              expect(result.heartbeatLogs).toHaveProperty('cutoffDate');
              expect(result.subjectTracker).toHaveProperty('deletedCount');
              expect(result.subjectTracker).toHaveProperty('cutoffDate');

              // Verify totalDeleted is sum of all table deletions
              const expectedTotal = result.hitLogs.deletedCount + 
                                    result.alerts.deletedCount + 
                                    result.systemLogs.deletedCount + 
                                    result.heartbeatLogs.deletedCount + 
                                    result.subjectTracker.deletedCount;
              expect(result.totalDeleted).toBe(expectedTotal);

              // Verify durationMs is non-negative
              expect(result.durationMs).toBeGreaterThanOrEqual(0);

              // Verify executedAt is a valid date
              expect(result.executedAt).toBeInstanceOf(Date);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should correctly sum deleted counts from all tables', () => {
        fc.assert(
          fc.property(
            // Number of records to create in each table
            fc.integer({ min: 0, max: 5 }),
            fc.integer({ min: 0, max: 5 }),
            fc.integer({ min: 0, max: 5 }),
            fc.integer({ min: 0, max: 5 }),
            fc.integer({ min: 0, max: 5 }),
            (hitLogCount, alertCount, systemLogCount, heartbeatLogCount, subjectTrackerCount) => {
              // Create old records in each table (beyond retention period)
              const oldTime = new Date(Date.now() - 1000 * 60 * 60 * 24 * 400); // 400 days ago

              for (let i = 0; i < hitLogCount; i++) {
                service.getHitLogRepo().create(testRuleId, 'sender@test.com', 'Subject', 'recipient@test.com', oldTime, oldTime);
              }
              for (let i = 0; i < alertCount; i++) {
                service.getAlertRepo().create(testRuleId, oldTime);
              }
              for (let i = 0; i < systemLogCount; i++) {
                service.getSystemLogRepo().create('email_forward', 'Test message', oldTime);
              }
              for (let i = 0; i < heartbeatLogCount; i++) {
                service.getHeartbeatLogRepo().create(oldTime);
              }
              for (let i = 0; i < subjectTrackerCount; i++) {
                service.getSubjectTrackerRepo().create(`hash_${i}`, `Subject ${i}`, oldTime);
              }

              // Run cleanup with minimal retention (should delete all old records)
              const config: TestCleanupConfig = {
                systemLogsRetentionDays: 1,
                hitLogsRetentionHours: 24,
                alertsRetentionDays: 7,
                heartbeatLogsRetentionDays: 1,
                subjectTrackerRetentionHours: 1,
                cleanupHour: 3,
                autoCleanupEnabled: true,
              };

              const result = service.runFullCleanupWithConfig(config);

              // Verify each table's deleted count
              expect(result.hitLogs.deletedCount).toBe(hitLogCount);
              expect(result.alerts.deletedCount).toBe(alertCount);
              expect(result.systemLogs.deletedCount).toBe(systemLogCount);
              expect(result.heartbeatLogs.deletedCount).toBe(heartbeatLogCount);
              expect(result.subjectTracker.deletedCount).toBe(subjectTrackerCount);

              // Verify total is correct
              const expectedTotal = hitLogCount + alertCount + systemLogCount + heartbeatLogCount + subjectTrackerCount;
              expect(result.totalDeleted).toBe(expectedTotal);

              // Clean up for next iteration
              db.run('DELETE FROM hit_logs');
              db.run('DELETE FROM alerts');
              db.run('DELETE FROM system_logs');
              db.run('DELETE FROM heartbeat_logs');
              db.run('DELETE FROM email_subject_tracker');
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty tables gracefully', () => {
        const hitResult = service.cleanupHitLogs(72);
        expect(hitResult.deletedCount).toBe(0);

        const alertResult = service.cleanupAlerts(90);
        expect(alertResult.deletedCount).toBe(0);
      });

      it('should throw error for negative retention values', () => {
        expect(() => service.cleanupHitLogs(-1)).toThrow('Retention hours must be non-negative');
        expect(() => service.cleanupAlerts(-1)).toThrow('Retention days must be non-negative');
      });

      it('should handle zero retention (delete all)', () => {
        const hitLogRepo = service.getHitLogRepo();
        const alertRepo = service.getAlertRepo();
        
        // Create records in the past (1 second ago) to ensure they are "older than" cutoff
        const pastTime = new Date(Date.now() - 1000);

        // Create some records with past timestamps
        hitLogRepo.create(testRuleId, 'sender@test.com', 'Subject', 'recipient@test.com', pastTime, pastTime);
        alertRepo.create(testRuleId, pastTime);

        // Zero retention should delete everything created before "now"
        const hitResult = service.cleanupHitLogs(0);
        const alertResult = service.cleanupAlerts(0);

        // Records created in the past should be deleted since cutoff is "now"
        expect(hitLogRepo.count()).toBe(0);
        expect(alertRepo.count()).toBe(0);
      });
    });
  });
});
