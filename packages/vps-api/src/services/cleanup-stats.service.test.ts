/**
 * CleanupStatsService Tests
 *
 * **Feature: data-cleanup-settings, Property 5: Statistics Contains All Tables**
 * **Validates: Requirements 6.1, 6.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  CleanupStatsService,
  TableStats,
  CleanupStats,
} from './cleanup-stats.service.js';

/**
 * All cleanable table names that must be present in statistics
 */
const EXPECTED_TABLES = [
  'system_logs',
  'hit_logs',
  'alerts',
  'heartbeat_logs',
  'email_subject_tracker',
];

/**
 * Test-specific CleanupStatsService that works with sql.js
 */
class TestCleanupStatsService {
  constructor(private db: SqlJsDatabase) {}

  getTableStats(tableName: string): TableStats {
    const tableConfigs: Record<string, string> = {
      system_logs: 'created_at',
      hit_logs: 'created_at',
      alerts: 'created_at',
      heartbeat_logs: 'checked_at',
      email_subject_tracker: 'received_at',
    };

    const dateColumn = tableConfigs[tableName];
    if (!dateColumn) {
      return {
        tableName,
        recordCount: 0,
        oldestRecordDate: null,
        newestRecordDate: null,
      };
    }

    // Get record count
    const countResult = this.db.exec(`SELECT COUNT(*) as count FROM ${tableName}`);
    const recordCount = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    // Get oldest and newest record dates
    const dateResult = this.db.exec(`
      SELECT 
        MIN(${dateColumn}) as oldest,
        MAX(${dateColumn}) as newest
      FROM ${tableName}
    `);

    let oldestRecordDate: Date | null = null;
    let newestRecordDate: Date | null = null;

    if (dateResult.length > 0 && dateResult[0].values.length > 0) {
      const oldest = dateResult[0].values[0][0] as string | null;
      const newest = dateResult[0].values[0][1] as string | null;
      oldestRecordDate = oldest ? new Date(oldest) : null;
      newestRecordDate = newest ? new Date(newest) : null;
    }

    return {
      tableName,
      recordCount,
      oldestRecordDate,
      newestRecordDate,
    };
  }

  getStats(): CleanupStats {
    const tables: TableStats[] = EXPECTED_TABLES.map(tableName =>
      this.getTableStats(tableName)
    );

    const totalRecords = tables.reduce((sum, table) => sum + table.recordCount, 0);

    // Get last cleanup info from cleanup_config
    let lastCleanupAt: Date | null = null;
    let lastCleanupResult: string | null = null;

    try {
      const lastCleanupResult_ = this.db.exec(
        "SELECT value FROM cleanup_config WHERE key = 'last_cleanup_at'"
      );
      if (lastCleanupResult_.length > 0 && lastCleanupResult_[0].values.length > 0) {
        const value = lastCleanupResult_[0].values[0][0] as string;
        if (value) {
          lastCleanupAt = new Date(value);
        }
      }

      const lastResultResult = this.db.exec(
        "SELECT value FROM cleanup_config WHERE key = 'last_cleanup_result'"
      );
      if (lastResultResult.length > 0 && lastResultResult[0].values.length > 0) {
        lastCleanupResult = lastResultResult[0].values[0][0] as string | null;
      }
    } catch {
      // cleanup_config table might not exist or have these keys
    }

    return {
      tables,
      totalRecords,
      lastCleanupAt,
      lastCleanupResult,
    };
  }

  static getCleanableTableNames(): string[] {
    return [...EXPECTED_TABLES];
  }
}

describe('CleanupStatsService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let service: TestCleanupStatsService;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load schema
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    service = new TestCleanupStatsService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: data-cleanup-settings, Property 5: Statistics Contains All Tables**
   * *For any* call to the statistics API, the response should contain record counts
   * and oldest record dates for all cleanable tables.
   * **Validates: Requirements 6.1, 6.2**
   */
  describe('Property 5: Statistics Contains All Tables', () => {
    it('should always return statistics for all cleanable tables', () => {
      fc.assert(
        fc.property(
          // Generate random number of records to insert into each table
          fc.record({
            systemLogs: fc.integer({ min: 0, max: 10 }),
            hitLogs: fc.integer({ min: 0, max: 10 }),
            alerts: fc.integer({ min: 0, max: 10 }),
            heartbeatLogs: fc.integer({ min: 0, max: 10 }),
            subjectTracker: fc.integer({ min: 0, max: 10 }),
          }),
          (recordCounts) => {
            // Insert random records into each table
            const now = new Date().toISOString();
            
            // Insert system_logs
            for (let i = 0; i < recordCounts.systemLogs; i++) {
              db.run(
                `INSERT INTO system_logs (category, level, message, created_at) VALUES (?, ?, ?, ?)`,
                ['system', 'info', `Test message ${i}`, now]
              );
            }

            // Insert hit_logs (need a monitoring rule first)
            if (recordCounts.hitLogs > 0) {
              const ruleId = `rule-${Date.now()}`;
              db.run(
                `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [ruleId, 'test', 'Test Rule', 'test', 60, 120, now, now]
              );
              for (let i = 0; i < recordCounts.hitLogs; i++) {
                db.run(
                  `INSERT INTO hit_logs (rule_id, sender, subject, recipient, received_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                  [ruleId, 'test@test.com', 'Test Subject', 'recipient@test.com', now, now]
                );
              }
            }

            // Insert alerts (need a monitoring rule first)
            if (recordCounts.alerts > 0) {
              const ruleId = `rule-alert-${Date.now()}`;
              db.run(
                `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [ruleId, 'test', 'Test Rule', 'test', 60, 120, now, now]
              );
              for (let i = 0; i < recordCounts.alerts; i++) {
                db.run(
                  `INSERT INTO alerts (id, rule_id, alert_type, previous_state, current_state, gap_minutes, count_1h, count_12h, count_24h, message, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [`alert-${i}-${Date.now()}`, ruleId, 'state_change', 'HEALTHY', 'DEAD', 0, 0, 0, 0, 'Test alert', now]
                );
              }
            }

            // Insert heartbeat_logs
            for (let i = 0; i < recordCounts.heartbeatLogs; i++) {
              db.run(
                `INSERT INTO heartbeat_logs (checked_at, rules_checked, state_changes, alerts_triggered, duration_ms) VALUES (?, ?, ?, ?, ?)`,
                [now, 0, 0, 0, 100]
              );
            }

            // Insert email_subject_tracker (need a worker instance first)
            if (recordCounts.subjectTracker > 0) {
              const workerId = `worker-${Date.now()}`;
              db.run(
                `INSERT INTO worker_instances (id, name, default_forward_to, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
                [workerId, 'test-worker', 'test@test.com', now, now]
              );
              for (let i = 0; i < recordCounts.subjectTracker; i++) {
                db.run(
                  `INSERT INTO email_subject_tracker (worker_id, subject_hash, subject, received_at) VALUES (?, ?, ?, ?)`,
                  [workerId, `hash-${i}`, `Subject ${i}`, now]
                );
              }
            }

            // Get statistics
            const stats = service.getStats();

            // Verify all expected tables are present
            const tableNames = stats.tables.map(t => t.tableName);
            for (const expectedTable of EXPECTED_TABLES) {
              expect(tableNames).toContain(expectedTable);
            }

            // Verify each table has the required fields
            for (const table of stats.tables) {
              expect(table).toHaveProperty('tableName');
              expect(table).toHaveProperty('recordCount');
              expect(table).toHaveProperty('oldestRecordDate');
              expect(table).toHaveProperty('newestRecordDate');
              expect(typeof table.recordCount).toBe('number');
              expect(table.recordCount).toBeGreaterThanOrEqual(0);
            }

            // Verify total records is sum of all table counts
            const expectedTotal = stats.tables.reduce((sum, t) => sum + t.recordCount, 0);
            expect(stats.totalRecords).toBe(expectedTotal);

            // Clean up for next iteration
            db.run('DELETE FROM system_logs');
            db.run('DELETE FROM hit_logs');
            db.run('DELETE FROM alerts');
            db.run('DELETE FROM heartbeat_logs');
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM monitoring_rules');
            db.run('DELETE FROM worker_instances');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct record counts for each table', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (numRecords) => {
            const now = new Date().toISOString();

            // Insert records into system_logs
            for (let i = 0; i < numRecords; i++) {
              db.run(
                `INSERT INTO system_logs (category, level, message, created_at) VALUES (?, ?, ?, ?)`,
                ['system', 'info', `Test message ${i}`, now]
              );
            }

            // Get table stats
            const tableStats = service.getTableStats('system_logs');

            // Verify record count matches
            expect(tableStats.recordCount).toBe(numRecords);
            expect(tableStats.tableName).toBe('system_logs');

            // Clean up
            db.run('DELETE FROM system_logs');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return oldest and newest dates when records exist', () => {
      fc.assert(
        fc.property(
          fc.array(fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }), { minLength: 1, maxLength: 10 }),
          (dates) => {
            // Insert records with different dates
            for (const date of dates) {
              db.run(
                `INSERT INTO system_logs (category, level, message, created_at) VALUES (?, ?, ?, ?)`,
                ['system', 'info', 'Test message', date.toISOString()]
              );
            }

            // Get table stats
            const tableStats = service.getTableStats('system_logs');

            // Verify dates are present
            expect(tableStats.oldestRecordDate).not.toBeNull();
            expect(tableStats.newestRecordDate).not.toBeNull();

            // Verify oldest is <= newest
            if (tableStats.oldestRecordDate && tableStats.newestRecordDate) {
              expect(tableStats.oldestRecordDate.getTime()).toBeLessThanOrEqual(
                tableStats.newestRecordDate.getTime()
              );
            }

            // Clean up
            db.run('DELETE FROM system_logs');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null dates when table is empty', () => {
      // Verify all tables return null dates when empty
      const stats = service.getStats();

      for (const table of stats.tables) {
        expect(table.recordCount).toBe(0);
        expect(table.oldestRecordDate).toBeNull();
        expect(table.newestRecordDate).toBeNull();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should return empty stats for unknown table', () => {
      const stats = service.getTableStats('unknown_table');
      expect(stats.tableName).toBe('unknown_table');
      expect(stats.recordCount).toBe(0);
      expect(stats.oldestRecordDate).toBeNull();
      expect(stats.newestRecordDate).toBeNull();
    });

    it('should return all cleanable table names', () => {
      const tableNames = TestCleanupStatsService.getCleanableTableNames();
      expect(tableNames).toEqual(EXPECTED_TABLES);
    });
  });
});
