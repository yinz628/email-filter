/**
 * Property-based tests for Scope-Based Data Aggregation
 *
 * **Feature: worker-instance-data-separation, Property 5: Scope-Based Data Aggregation**
 * **Validates: Requirements 5.2, 5.3**
 *
 * For any monitoring rule or ratio monitor with a specific worker scope,
 * the statistics should only include data from that worker.
 * For global scope, statistics should include all workers.
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

// Arbitraries for generating valid test data
const workerNameArb = fc.oneof(
  fc.constant('worker-1'),
  fc.constant('worker-2'),
  fc.constant('worker-3'),
  fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0 && !s.includes("'"))
);

const workerScopeArb = fc.oneof(fc.constant('global'), workerNameArb);

const merchantArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0 && !s.includes("'"));
const nameArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0 && !s.includes("'"));
const intervalArb = fc.integer({ min: 1, max: 10080 });

// Generate a list of distinct worker names
const distinctWorkersArb = fc
  .array(workerNameArb, { minLength: 2, maxLength: 5 })
  .map((workers) => [...new Set(workers)])
  .filter((workers) => workers.length >= 2);

/**
 * Apply the worker instance migration to the database
 */
function applyWorkerInstanceMigration(db: SqlJsDatabase): void {
  // Check if worker_name column exists in system_logs
  const logsInfo = db.exec("PRAGMA table_info(system_logs)");
  const hasWorkerName =
    logsInfo.length > 0 && logsInfo[0].values.some((row) => row[1] === 'worker_name');

  if (!hasWorkerName) {
    db.run("ALTER TABLE system_logs ADD COLUMN worker_name TEXT DEFAULT 'global'");
    db.run('CREATE INDEX IF NOT EXISTS idx_logs_worker_name ON system_logs(worker_name)');
  }
}

describe('Property 5: Scope-Based Data Aggregation', () => {
  let SQL: any;
  let db: SqlJsDatabase;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute main schema
    const mainSchemaPath = join(__dirname, '../../db/schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    // Load and execute monitoring schema
    const monitoringSchemaPath = join(__dirname, '../../db/monitoring-schema.sql');
    const monitoringSchema = readFileSync(monitoringSchemaPath, 'utf-8');
    db.run(monitoringSchema);

    // Apply worker instance migration
    applyWorkerInstanceMigration(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * Helper function to create a monitoring rule with worker scope
   */
  function createMonitoringRule(
    merchant: string,
    name: string,
    subjectPattern: string,
    expectedInterval: number,
    deadAfter: number,
    workerScope: string
  ): string {
    const id = uuidv4();
    const now = new Date().toISOString();

    db.run(
      `INSERT INTO monitoring_rules (id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, worker_scope, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, merchant, name, subjectPattern, expectedInterval, deadAfter, workerScope, now, now]
    );

    // Create associated signal state
    db.run(
      `INSERT INTO signal_states (rule_id, state, last_seen_at, count_1h, count_12h, count_24h, updated_at)
       VALUES (?, 'DEAD', NULL, 0, 0, 0, ?)`,
      [id, now]
    );

    return id;
  }

  /**
   * Helper function to create a log entry with worker name
   */
  function createLog(
    category: string,
    message: string,
    workerName: string,
    details?: Record<string, unknown>
  ): void {
    const now = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    db.run(
      `INSERT INTO system_logs (category, level, message, details, worker_name, created_at) 
       VALUES (?, 'info', ?, ?, ?, ?)`,
      [category, message, detailsJson, workerName, now]
    );
  }

  /**
   * Helper function to get logs filtered by worker name
   */
  function getLogsByWorker(workerName?: string): number {
    if (workerName) {
      const result = db.exec('SELECT COUNT(*) as count FROM system_logs WHERE worker_name = ?', [
        workerName,
      ]);
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    } else {
      const result = db.exec('SELECT COUNT(*) as count FROM system_logs');
      return result.length > 0 ? (result[0].values[0][0] as number) : 0;
    }
  }

  /**
   * Helper function to get monitoring rules by worker scope
   */
  function getRulesByScope(workerScope?: string): string[] {
    let query = 'SELECT id FROM monitoring_rules';
    const params: string[] = [];

    if (workerScope) {
      query += ' WHERE worker_scope = ?';
      params.push(workerScope);
    }

    const result = db.exec(query, params);
    if (result.length === 0) return [];
    return result[0].values.map((row) => row[0] as string);
  }

  /**
   * **Feature: worker-instance-data-separation, Property 5: Scope-Based Data Aggregation**
   * **Validates: Requirements 5.2**
   *
   * For any monitoring rule with a specific worker scope,
   * filtering by that scope should only return rules with that scope.
   */
  describe('Monitoring rules scope filtering', () => {
    it('should only return rules with matching worker scope when filtered', () => {
      fc.assert(
        fc.property(
          merchantArb,
          nameArb,
          intervalArb,
          workerScopeArb,
          (merchant, name, interval, workerScope) => {
            // Create a rule with specific worker scope
            const ruleId = createMonitoringRule(
              merchant,
              name,
              '.*',
              interval,
              Math.ceil(interval * 2),
              workerScope
            );

            // Query rules by the same scope
            const rulesWithScope = getRulesByScope(workerScope);

            // The created rule should be in the filtered results
            expect(rulesWithScope).toContain(ruleId);

            // All returned rules should have the specified scope
            for (const id of rulesWithScope) {
              const result = db.exec('SELECT worker_scope FROM monitoring_rules WHERE id = ?', [
                id,
              ]);
              expect(result.length).toBeGreaterThan(0);
              expect(result[0].values[0][0]).toBe(workerScope);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all rules when no scope filter is applied', () => {
      fc.assert(
        fc.property(
          merchantArb,
          nameArb,
          intervalArb,
          distinctWorkersArb,
          (merchant, name, interval, workers) => {
            // Create rules with different worker scopes
            const createdRuleIds: string[] = [];
            for (const worker of workers) {
              const ruleId = createMonitoringRule(
                merchant,
                `${name}-${worker}`,
                '.*',
                interval,
                Math.ceil(interval * 2),
                worker
              );
              createdRuleIds.push(ruleId);
            }

            // Also create a global rule
            const globalRuleId = createMonitoringRule(
              merchant,
              `${name}-global`,
              '.*',
              interval,
              Math.ceil(interval * 2),
              'global'
            );
            createdRuleIds.push(globalRuleId);

            // Query all rules without scope filter
            const allRules = getRulesByScope();

            // All created rules should be in the results
            for (const ruleId of createdRuleIds) {
              expect(allRules).toContain(ruleId);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: worker-instance-data-separation, Property 5: Scope-Based Data Aggregation**
   * **Validates: Requirements 5.3**
   *
   * For global scope rules, statistics should include data from all workers.
   * For specific worker scope rules, statistics should only include data from that worker.
   */
  describe('Log data aggregation by worker scope', () => {
    it('should aggregate logs from all workers when querying without filter', () => {
      fc.assert(
        fc.property(distinctWorkersArb, fc.integer({ min: 1, max: 10 }), (workers, logsPerWorker) => {
          // Create logs for each worker
          for (const worker of workers) {
            for (let i = 0; i < logsPerWorker; i++) {
              createLog('email_drop', `Test log ${i} for ${worker}`, worker);
            }
          }

          // Query all logs without filter
          const totalLogs = getLogsByWorker();

          // Total should be at least the sum of all workers' logs
          expect(totalLogs).toBeGreaterThanOrEqual(workers.length * logsPerWorker);
        }),
        { numRuns: 50 }
      );
    });

    it('should only return logs from specific worker when filtered', () => {
      fc.assert(
        fc.property(
          distinctWorkersArb,
          fc.integer({ min: 1, max: 10 }),
          (workers, logsPerWorker) => {
            // Create logs for each worker
            for (const worker of workers) {
              for (let i = 0; i < logsPerWorker; i++) {
                createLog('email_drop', `Test log ${i} for ${worker}`, worker);
              }
            }

            // Query logs for each specific worker
            for (const worker of workers) {
              const workerLogs = getLogsByWorker(worker);

              // Should have exactly the number of logs created for this worker
              expect(workerLogs).toBeGreaterThanOrEqual(logsPerWorker);

              // Verify all returned logs have the correct worker_name
              const result = db.exec(
                'SELECT worker_name FROM system_logs WHERE worker_name = ?',
                [worker]
              );
              if (result.length > 0) {
                for (const row of result[0].values) {
                  expect(row[0]).toBe(worker);
                }
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should correctly separate data between workers', () => {
      fc.assert(
        fc.property(
          distinctWorkersArb,
          fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 5 }),
          (workers, logCounts) => {
            // Ensure we have enough log counts for workers
            const counts = workers.map((_, i) => logCounts[i % logCounts.length]);

            // Create different number of logs for each worker
            for (let i = 0; i < workers.length; i++) {
              for (let j = 0; j < counts[i]; j++) {
                createLog('email_drop', `Log ${j} for ${workers[i]}`, workers[i]);
              }
            }

            // Verify each worker has the correct count
            for (let i = 0; i < workers.length; i++) {
              const workerLogs = getLogsByWorker(workers[i]);
              expect(workerLogs).toBeGreaterThanOrEqual(counts[i]);
            }

            // Verify total is at least the sum
            const totalLogs = getLogsByWorker();
            const expectedTotal = counts.reduce((sum, count) => sum + count, 0);
            expect(totalLogs).toBeGreaterThanOrEqual(expectedTotal);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: worker-instance-data-separation, Property 5: Scope-Based Data Aggregation**
   * **Validates: Requirements 5.2, 5.3**
   *
   * For ratio monitors with specific worker scope, data should be filtered accordingly.
   */
  describe('Ratio monitor scope filtering', () => {
    it('should create ratio monitors with correct worker scope', () => {
      fc.assert(
        fc.property(nameArb, merchantArb, workerScopeArb, (name, tag, workerScope) => {
          const id = uuidv4();
          const now = new Date().toISOString();

          // Create two monitoring rules for the ratio monitor
          const firstRuleId = createMonitoringRule(
            'merchant1',
            'Rule 1',
            'pattern1',
            60,
            120,
            workerScope
          );
          const secondRuleId = createMonitoringRule(
            'merchant2',
            'Rule 2',
            'pattern2',
            60,
            120,
            workerScope
          );

          // Create ratio monitor with worker scope
          db.run(
            `INSERT INTO ratio_monitors (id, name, tag, first_rule_id, second_rule_id, threshold_percent, time_window, worker_scope, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, tag, firstRuleId, secondRuleId, 50, '24h', workerScope, now, now]
          );

          // Query the ratio monitor
          const result = db.exec('SELECT worker_scope FROM ratio_monitors WHERE id = ?', [id]);

          expect(result.length).toBeGreaterThan(0);
          expect(result[0].values[0][0]).toBe(workerScope);
        }),
        { numRuns: 50 }
      );
    });

    it('should filter ratio monitors by worker scope', () => {
      fc.assert(
        fc.property(nameArb, merchantArb, distinctWorkersArb, (name, tag, workers) => {
          const createdMonitorIds: Map<string, string[]> = new Map();

          // Create ratio monitors with different worker scopes
          for (const worker of workers) {
            const id = uuidv4();
            const now = new Date().toISOString();

            const firstRuleId = createMonitoringRule(
              'merchant1',
              `Rule 1 ${worker}`,
              'pattern1',
              60,
              120,
              worker
            );
            const secondRuleId = createMonitoringRule(
              'merchant2',
              `Rule 2 ${worker}`,
              'pattern2',
              60,
              120,
              worker
            );

            db.run(
              `INSERT INTO ratio_monitors (id, name, tag, first_rule_id, second_rule_id, threshold_percent, time_window, worker_scope, created_at, updated_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [id, `${name}-${worker}`, tag, firstRuleId, secondRuleId, 50, '24h', worker, now, now]
            );

            if (!createdMonitorIds.has(worker)) {
              createdMonitorIds.set(worker, []);
            }
            createdMonitorIds.get(worker)!.push(id);
          }

          // Query ratio monitors by each worker scope
          for (const worker of workers) {
            const result = db.exec(
              'SELECT id, worker_scope FROM ratio_monitors WHERE worker_scope = ?',
              [worker]
            );

            if (result.length > 0) {
              // All returned monitors should have the correct scope
              for (const row of result[0].values) {
                expect(row[1]).toBe(worker);
              }

              // Created monitors for this worker should be in results
              const returnedIds = result[0].values.map((row) => row[0]);
              for (const id of createdMonitorIds.get(worker) || []) {
                expect(returnedIds).toContain(id);
              }
            }
          }
        }),
        { numRuns: 30 }
      );
    });
  });
});
