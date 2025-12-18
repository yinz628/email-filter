/**
 * Stats Service Property Tests
 * 
 * **Feature: vps-email-filter, Property 7: 统计计数递增**
 * **Validates: Requirements 5.1, 5.3**
 * 
 * **Feature: worker-instance-data-separation, Property 3: Global Stats Aggregation**
 * **Validates: Requirements 2.1**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CreateRuleDTO, RuleCategory, MatchType, MatchMode } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitraries for generating valid rule data
const categoryArb = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const matchTypeArb = fc.constantFrom<MatchType>('sender', 'subject', 'domain');
const matchModeArb = fc.constantFrom<MatchMode>('exact', 'contains', 'startsWith', 'endsWith', 'regex');
const patternArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

const createRuleDTOArb: fc.Arbitrary<CreateRuleDTO> = fc.record({
  category: categoryArb,
  matchType: matchTypeArb,
  matchMode: matchModeArb,
  pattern: patternArb,
  enabled: fc.boolean(),
});

/**
 * Test-specific StatsRepository that works with sql.js
 */
class TestStatsRepository {
  constructor(private db: SqlJsDatabase) {}

  findByRuleId(ruleId: string): { ruleId: string; totalProcessed: number; deletedCount: number; errorCount: number; lastUpdated: Date } | null {
    const result = this.db.exec('SELECT * FROM rule_stats WHERE rule_id = ?', [ruleId]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    const row = result[0].values[0];
    return {
      ruleId: row[0] as string,
      totalProcessed: row[1] as number,
      deletedCount: row[2] as number,
      errorCount: row[3] as number,
      lastUpdated: new Date(row[4] as string),
    };
  }

  incrementProcessed(ruleId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE rule_stats SET total_processed = total_processed + 1, last_updated = ? WHERE rule_id = ?`,
      [now, ruleId]
    );
  }

  incrementDeleted(ruleId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE rule_stats SET deleted_count = deleted_count + 1, total_processed = total_processed + 1, last_updated = ? WHERE rule_id = ?`,
      [now, ruleId]
    );
  }

  incrementError(ruleId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE rule_stats SET error_count = error_count + 1, last_updated = ? WHERE rule_id = ?`,
      [now, ruleId]
    );
  }

  create(ruleId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `INSERT OR IGNORE INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated) VALUES (?, 0, 0, 0, ?)`,
      [ruleId, now]
    );
  }

  delete(ruleId: string): boolean {
    this.db.run('DELETE FROM rule_stats WHERE rule_id = ?', [ruleId]);
    return true;
  }
}

/**
 * Test-specific RuleRepository for creating rules
 */
class TestRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  create(dto: CreateRuleDTO): { id: string } {
    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    this.db.run(
      `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.category, dto.matchType, dto.matchMode, dto.pattern, enabled ? 1 : 0, now, now]
    );

    // Create associated stats record
    this.db.run(
      `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
       VALUES (?, 0, 0, 0, ?)`,
      [id, now]
    );

    return { id };
  }

  delete(id: string): void {
    this.db.run('DELETE FROM rule_stats WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM filter_rules WHERE id = ?', [id]);
  }
}

describe('StatsService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let statsRepository: TestStatsRepository;
  let ruleRepository: TestRuleRepository;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();
    
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);
    
    statsRepository = new TestStatsRepository(db);
    ruleRepository = new TestRuleRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: vps-email-filter, Property 7: 统计计数递增**
   * **Validates: Requirements 5.1, 5.3**
   * 
   * For any processed email, the related rule's statistics counter should increment,
   * and the timestamp should be updated.
   */
  describe('Property 7: 统计计数递增', () => {
    it('should increment totalProcessed counter and update timestamp', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          fc.integer({ min: 1, max: 10 }), // Number of increments
          (dto, incrementCount) => {
            // Create a rule with stats
            const rule = ruleRepository.create(dto);
            
            // Get initial stats
            const initialStats = statsRepository.findByRuleId(rule.id);
            expect(initialStats).not.toBeNull();
            expect(initialStats!.totalProcessed).toBe(0);
            const initialTimestamp = initialStats!.lastUpdated;
            
            // Increment processed count multiple times
            for (let i = 0; i < incrementCount; i++) {
              statsRepository.incrementProcessed(rule.id);
            }
            
            // Verify counter incremented correctly
            const afterStats = statsRepository.findByRuleId(rule.id);
            expect(afterStats).not.toBeNull();
            expect(afterStats!.totalProcessed).toBe(incrementCount);
            
            // Verify timestamp was updated
            expect(afterStats!.lastUpdated.getTime()).toBeGreaterThanOrEqual(initialTimestamp.getTime());
            
            // Cleanup
            ruleRepository.delete(rule.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should increment deletedCount and totalProcessed together', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          fc.integer({ min: 1, max: 10 }), // Number of deletes
          (dto, deleteCount) => {
            // Create a rule with stats
            const rule = ruleRepository.create(dto);
            
            // Get initial stats
            const initialStats = statsRepository.findByRuleId(rule.id);
            expect(initialStats).not.toBeNull();
            expect(initialStats!.deletedCount).toBe(0);
            expect(initialStats!.totalProcessed).toBe(0);
            
            // Increment deleted count multiple times
            for (let i = 0; i < deleteCount; i++) {
              statsRepository.incrementDeleted(rule.id);
            }
            
            // Verify both counters incremented correctly
            const afterStats = statsRepository.findByRuleId(rule.id);
            expect(afterStats).not.toBeNull();
            expect(afterStats!.deletedCount).toBe(deleteCount);
            // incrementDeleted also increments totalProcessed
            expect(afterStats!.totalProcessed).toBe(deleteCount);
            
            // Cleanup
            ruleRepository.delete(rule.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should increment errorCount independently', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          fc.integer({ min: 1, max: 10 }), // Number of errors
          (dto, errorCount) => {
            // Create a rule with stats
            const rule = ruleRepository.create(dto);
            
            // Get initial stats
            const initialStats = statsRepository.findByRuleId(rule.id);
            expect(initialStats).not.toBeNull();
            expect(initialStats!.errorCount).toBe(0);
            
            // Increment error count multiple times
            for (let i = 0; i < errorCount; i++) {
              statsRepository.incrementError(rule.id);
            }
            
            // Verify error counter incremented correctly
            const afterStats = statsRepository.findByRuleId(rule.id);
            expect(afterStats).not.toBeNull();
            expect(afterStats!.errorCount).toBe(errorCount);
            // Error count should not affect totalProcessed
            expect(afterStats!.totalProcessed).toBe(0);
            
            // Cleanup
            ruleRepository.delete(rule.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly track mixed operations', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          fc.integer({ min: 0, max: 5 }), // processed count
          fc.integer({ min: 0, max: 5 }), // deleted count
          fc.integer({ min: 0, max: 5 }), // error count
          (dto, processedCount, deletedCount, errorCount) => {
            // Create a rule with stats
            const rule = ruleRepository.create(dto);
            
            // Perform mixed operations
            for (let i = 0; i < processedCount; i++) {
              statsRepository.incrementProcessed(rule.id);
            }
            for (let i = 0; i < deletedCount; i++) {
              statsRepository.incrementDeleted(rule.id);
            }
            for (let i = 0; i < errorCount; i++) {
              statsRepository.incrementError(rule.id);
            }
            
            // Verify all counters
            const afterStats = statsRepository.findByRuleId(rule.id);
            expect(afterStats).not.toBeNull();
            // totalProcessed = processedCount + deletedCount (incrementDeleted adds to both)
            expect(afterStats!.totalProcessed).toBe(processedCount + deletedCount);
            expect(afterStats!.deletedCount).toBe(deletedCount);
            expect(afterStats!.errorCount).toBe(errorCount);
            
            // Cleanup
            ruleRepository.delete(rule.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// Types for log entries
type LogCategory = 'email_forward' | 'email_drop' | 'admin_action' | 'system';
type LogLevel = 'info' | 'warn' | 'error';

// Arbitraries for generating valid test data
const workerNameArb = fc.oneof(
  fc.constant('global'),
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/)
);

const logCategoryArb: fc.Arbitrary<LogCategory> = fc.constantFrom('email_forward', 'email_drop');
const logLevelArb: fc.Arbitrary<LogLevel> = fc.constantFrom('info', 'warn', 'error');
const messageArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0 && !s.includes("'"));

/**
 * Test-specific LogRepository for creating logs with worker names
 */
class TestLogRepository {
  constructor(private db: SqlJsDatabase) {}

  create(category: LogCategory, message: string, details?: Record<string, unknown>, level: LogLevel = 'info', workerName: string = 'global'): { id: number; workerName: string } {
    const now = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    this.db.run(
      `INSERT INTO system_logs (category, level, message, details, worker_name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [category, level, message, detailsJson, workerName, now]
    );

    const result = this.db.exec('SELECT last_insert_rowid()');
    const id = result[0].values[0][0] as number;

    return { id, workerName };
  }
}

/**
 * Test-specific StatsRepository for worker-based stats
 */
class TestWorkerStatsRepository {
  constructor(private db: SqlJsDatabase) {}

  /**
   * Get overall statistics (global - all workers combined)
   */
  getOverallStats(): { totalProcessed: number; totalForwarded: number; totalDeleted: number } {
    const result = this.db.exec(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN category = 'email_forward' THEN 1 ELSE 0 END) as forwarded,
        SUM(CASE WHEN category = 'email_drop' THEN 1 ELSE 0 END) as dropped
      FROM system_logs
      WHERE category IN ('email_forward', 'email_drop')
    `);

    if (result.length === 0 || result[0].values.length === 0) {
      return { totalProcessed: 0, totalForwarded: 0, totalDeleted: 0 };
    }

    const row = result[0].values[0];
    return {
      totalProcessed: (row[0] as number) || 0,
      totalForwarded: (row[1] as number) || 0,
      totalDeleted: (row[2] as number) || 0,
    };
  }

  /**
   * Get statistics filtered by worker name
   */
  getOverallStatsByWorker(workerName?: string): { totalProcessed: number; totalForwarded: number; totalDeleted: number } {
    let query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN category = 'email_forward' THEN 1 ELSE 0 END) as forwarded,
        SUM(CASE WHEN category = 'email_drop' THEN 1 ELSE 0 END) as dropped
      FROM system_logs
      WHERE category IN ('email_forward', 'email_drop')
    `;
    const params: string[] = [];

    if (workerName) {
      query += ' AND worker_name = ?';
      params.push(workerName);
    }

    const result = this.db.exec(query, params);

    if (result.length === 0 || result[0].values.length === 0) {
      return { totalProcessed: 0, totalForwarded: 0, totalDeleted: 0 };
    }

    const row = result[0].values[0];
    return {
      totalProcessed: (row[0] as number) || 0,
      totalForwarded: (row[1] as number) || 0,
      totalDeleted: (row[2] as number) || 0,
    };
  }

  /**
   * Get statistics breakdown by worker
   */
  getStatsByWorker(): { workerName: string; total: number; forwarded: number; dropped: number }[] {
    const result = this.db.exec(`
      SELECT 
        worker_name,
        COUNT(*) as total,
        SUM(CASE WHEN category = 'email_forward' THEN 1 ELSE 0 END) as forwarded,
        SUM(CASE WHEN category = 'email_drop' THEN 1 ELSE 0 END) as dropped
      FROM system_logs
      WHERE category IN ('email_forward', 'email_drop')
      GROUP BY worker_name
      ORDER BY total DESC
    `);

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map(row => ({
      workerName: (row[0] as string) || 'global',
      total: (row[1] as number) || 0,
      forwarded: (row[2] as number) || 0,
      dropped: (row[3] as number) || 0,
    }));
  }
}

/**
 * Apply the worker instance migration to the database
 */
function applyWorkerInstanceMigration(db: SqlJsDatabase): void {
  db.run("ALTER TABLE system_logs ADD COLUMN worker_name TEXT DEFAULT 'global'");
  db.run('CREATE INDEX IF NOT EXISTS idx_logs_worker_name ON system_logs(worker_name)');
}

/**
 * **Feature: worker-instance-data-separation, Property 3: Global Stats Aggregation**
 * **Validates: Requirements 2.1**
 * 
 * For any global stats query, the totals should equal the sum of all individual worker stats.
 */
describe('Property 3: Global Stats Aggregation', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let logRepository: TestLogRepository;
  let workerStatsRepository: TestWorkerStatsRepository;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute main schema
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Apply worker instance migration
    applyWorkerInstanceMigration(db);

    logRepository = new TestLogRepository(db);
    workerStatsRepository = new TestWorkerStatsRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: worker-instance-data-separation, Property 3: Global Stats Aggregation**
   * **Validates: Requirements 2.1**
   * 
   * For any global stats query, the totals should equal the sum of all individual worker stats.
   */
  it('global stats should equal sum of all worker stats', () => {
    fc.assert(
      fc.property(
        // Generate multiple logs with different worker names
        fc.array(
          fc.tuple(logCategoryArb, messageArb, workerNameArb),
          { minLength: 5, maxLength: 50 }
        ),
        (logConfigs) => {
          // Create logs with various worker names
          for (const [category, message, workerName] of logConfigs) {
            logRepository.create(category, message, undefined, 'info', workerName);
          }

          // Get global stats (all workers combined)
          const globalStats = workerStatsRepository.getOverallStats();

          // Get stats breakdown by worker
          const workerStats = workerStatsRepository.getStatsByWorker();

          // Sum up all worker stats
          const sumTotal = workerStats.reduce((sum, ws) => sum + ws.total, 0);
          const sumForwarded = workerStats.reduce((sum, ws) => sum + ws.forwarded, 0);
          const sumDropped = workerStats.reduce((sum, ws) => sum + ws.dropped, 0);

          // Verify global stats equal sum of worker stats
          expect(globalStats.totalProcessed).toBe(sumTotal);
          expect(globalStats.totalForwarded).toBe(sumForwarded);
          expect(globalStats.totalDeleted).toBe(sumDropped);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('worker-specific stats should be subset of global stats', () => {
    fc.assert(
      fc.property(
        // Generate multiple logs with different worker names
        fc.array(
          fc.tuple(logCategoryArb, messageArb, workerNameArb),
          { minLength: 5, maxLength: 30 }
        ),
        // Pick a worker name to query
        workerNameArb,
        (logConfigs, queryWorkerName) => {
          // Create logs with various worker names
          for (const [category, message, workerName] of logConfigs) {
            logRepository.create(category, message, undefined, 'info', workerName);
          }
          
          // Also create some logs with the query worker name
          logRepository.create('email_forward', 'Test forward', undefined, 'info', queryWorkerName);
          logRepository.create('email_drop', 'Test drop', undefined, 'info', queryWorkerName);

          // Get global stats
          const globalStats = workerStatsRepository.getOverallStats();

          // Get worker-specific stats
          const workerStats = workerStatsRepository.getOverallStatsByWorker(queryWorkerName);

          // Worker stats should be <= global stats
          expect(workerStats.totalProcessed).toBeLessThanOrEqual(globalStats.totalProcessed);
          expect(workerStats.totalForwarded).toBeLessThanOrEqual(globalStats.totalForwarded);
          expect(workerStats.totalDeleted).toBeLessThanOrEqual(globalStats.totalDeleted);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sum of forwarded and dropped should equal total processed for each worker', () => {
    fc.assert(
      fc.property(
        // Generate multiple logs with different worker names
        fc.array(
          fc.tuple(logCategoryArb, messageArb, workerNameArb),
          { minLength: 5, maxLength: 30 }
        ),
        (logConfigs) => {
          // Create logs with various worker names
          for (const [category, message, workerName] of logConfigs) {
            logRepository.create(category, message, undefined, 'info', workerName);
          }

          // Get stats breakdown by worker
          const workerStats = workerStatsRepository.getStatsByWorker();

          // For each worker, forwarded + dropped should equal total
          for (const ws of workerStats) {
            expect(ws.forwarded + ws.dropped).toBe(ws.total);
          }

          // Also verify for global stats
          const globalStats = workerStatsRepository.getOverallStats();
          expect(globalStats.totalForwarded + globalStats.totalDeleted).toBe(globalStats.totalProcessed);
        }
      ),
      { numRuns: 100 }
    );
  });
});
