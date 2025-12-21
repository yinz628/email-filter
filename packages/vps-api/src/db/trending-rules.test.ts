/**
 * Property-based tests for Trending Rules Worker Breakdown
 * 
 * **Feature: worker-instance-data-separation, Property 4: Worker Breakdown Completeness**
 * **Validates: Requirements 3.2**
 * 
 * For any trending rule query, the sum of counts in workerBreakdown should equal the total count.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types matching the repository
type LogCategory = 'email_forward' | 'email_drop' | 'admin_action' | 'system';
type LogLevel = 'info' | 'warn' | 'error';

interface WorkerBreakdown {
  workerName: string;
  count: number;
}

interface TrendingRule {
  pattern: string;
  count: number;
  lastSeen: string;
  workerBreakdown: WorkerBreakdown[];
}

// Arbitraries for generating valid test data
const workerNameArb = fc.oneof(
  fc.constant('global'),
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/)
);

const rulePatternArb = fc.oneof(
  fc.constant('spam@example.com'),
  fc.constant('newsletter@'),
  fc.constant('promo@marketing.com'),
  fc.constant('ads@'),
  fc.constant('noreply@')
);

/**
 * Test-specific LogRepository that works with sql.js
 */
class TestLogRepository {
  constructor(private db: SqlJsDatabase) {}

  create(category: LogCategory, message: string, details?: Record<string, unknown>, level: LogLevel = 'info', workerName: string = 'global'): void {
    const now = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    this.db.run(
      `INSERT INTO system_logs (category, level, message, details, worker_name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [category, level, message, detailsJson, workerName, now]
    );
  }

  /**
   * Get top blocked rules by count in recent time period with worker breakdown
   * Requirements: 3.1, 3.2, 3.3
   */
  getTopBlockedRules(hours: number = 24, limit: number = 5, workerName?: string): TrendingRule[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Query logs where category is email_drop and extract matchedRule from details JSON
    const result = this.db.exec(`
      SELECT 
        json_extract(details, '$.matchedRule') as pattern,
        COUNT(*) as count,
        MAX(created_at) as last_seen
      FROM system_logs 
      WHERE category = 'email_drop' 
        AND created_at >= '${cutoff}'
        AND json_extract(details, '$.matchedRule') IS NOT NULL
        ${workerName ? `AND worker_name = '${workerName}'` : ''}
      GROUP BY json_extract(details, '$.matchedRule')
      ORDER BY count DESC
      LIMIT ${limit}
    `);

    if (result.length === 0) {
      return [];
    }

    const rows = result[0].values;

    // Get worker breakdown for each pattern
    return rows.map((row) => {
      const pattern = row[0] as string;
      const count = row[1] as number;
      const lastSeen = row[2] as string;
      const workerBreakdown = this.getWorkerBreakdownForPattern(pattern, cutoff, workerName);
      return {
        pattern,
        count,
        lastSeen,
        workerBreakdown,
      };
    });
  }

  private getWorkerBreakdownForPattern(pattern: string, cutoff: string, workerName?: string): WorkerBreakdown[] {
    const result = this.db.exec(`
      SELECT 
        worker_name,
        COUNT(*) as count
      FROM system_logs 
      WHERE category = 'email_drop' 
        AND created_at >= '${cutoff}'
        AND json_extract(details, '$.matchedRule') = '${pattern}'
        ${workerName ? `AND worker_name = '${workerName}'` : ''}
      GROUP BY worker_name
      ORDER BY count DESC
    `);

    if (result.length === 0) {
      return [];
    }

    return result[0].values.map((row) => ({
      workerName: (row[0] as string) || 'global',
      count: row[1] as number,
    }));
  }
}

/**
 * Apply the worker instance migration to the database
 * Note: worker_name column is now part of the consolidated schema.sql,
 * so we only need to ensure the index exists (which is also in schema.sql)
 */
function applyWorkerInstanceMigration(_db: SqlJsDatabase): void {
  // worker_name column and index are now part of the consolidated schema.sql
  // This function is kept for backwards compatibility but no longer needs to do anything
}

describe('Trending Rules Worker Breakdown', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let logRepository: TestLogRepository;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute main schema
    const mainSchemaPath = join(__dirname, 'schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    // Apply worker instance migration (no-op, kept for backwards compatibility)
    applyWorkerInstanceMigration(db);

    logRepository = new TestLogRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: worker-instance-data-separation, Property 4: Worker Breakdown Completeness**
   * **Validates: Requirements 3.2**
   * 
   * For any trending rule query, the sum of counts in workerBreakdown should equal the total count.
   */
  describe('Property 4: Worker Breakdown Completeness', () => {
    it('should have workerBreakdown sum equal to total count for each trending rule', () => {
      fc.assert(
        fc.property(
          // Generate multiple email_drop logs with different worker names and patterns
          fc.array(
            fc.tuple(rulePatternArb, workerNameArb),
            { minLength: 5, maxLength: 50 }
          ),
          (logConfigs) => {
            // Create email_drop logs with various worker names and patterns
            for (const [pattern, workerName] of logConfigs) {
              logRepository.create(
                'email_drop',
                `Blocked email matching ${pattern}`,
                { matchedRule: pattern, sender: 'test@example.com' },
                'info',
                workerName
              );
            }

            // Query trending rules
            const trendingRules = logRepository.getTopBlockedRules(24, 20);

            // Verify for each trending rule, the sum of workerBreakdown counts equals total count
            for (const rule of trendingRules) {
              const breakdownSum = rule.workerBreakdown.reduce((sum, wb) => sum + wb.count, 0);
              expect(breakdownSum).toBe(rule.count);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have workerBreakdown sum equal to total count when filtering by worker', () => {
      fc.assert(
        fc.property(
          // Generate multiple email_drop logs with different worker names and patterns
          fc.array(
            fc.tuple(rulePatternArb, workerNameArb),
            { minLength: 10, maxLength: 50 }
          ),
          // Pick a worker name to filter by
          workerNameArb,
          (logConfigs, filterWorkerName) => {
            // Create email_drop logs with various worker names and patterns
            for (const [pattern, workerName] of logConfigs) {
              logRepository.create(
                'email_drop',
                `Blocked email matching ${pattern}`,
                { matchedRule: pattern, sender: 'test@example.com' },
                'info',
                workerName
              );
            }

            // Also create some logs with the filter worker name to ensure we have matches
            logRepository.create(
              'email_drop',
              'Blocked email',
              { matchedRule: 'spam@example.com', sender: 'test@example.com' },
              'info',
              filterWorkerName
            );

            // Query trending rules with worker filter
            const trendingRules = logRepository.getTopBlockedRules(24, 20, filterWorkerName);

            // Verify for each trending rule, the sum of workerBreakdown counts equals total count
            for (const rule of trendingRules) {
              const breakdownSum = rule.workerBreakdown.reduce((sum, wb) => sum + wb.count, 0);
              expect(breakdownSum).toBe(rule.count);
              
              // Also verify all breakdown entries have the filtered worker name
              for (const wb of rule.workerBreakdown) {
                expect(wb.workerName).toBe(filterWorkerName);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have non-empty workerBreakdown for each trending rule with count > 0', () => {
      fc.assert(
        fc.property(
          // Generate multiple email_drop logs
          fc.array(
            fc.tuple(rulePatternArb, workerNameArb),
            { minLength: 5, maxLength: 30 }
          ),
          (logConfigs) => {
            // Create email_drop logs
            for (const [pattern, workerName] of logConfigs) {
              logRepository.create(
                'email_drop',
                `Blocked email matching ${pattern}`,
                { matchedRule: pattern, sender: 'test@example.com' },
                'info',
                workerName
              );
            }

            // Query trending rules
            const trendingRules = logRepository.getTopBlockedRules(24, 20);

            // Verify each trending rule with count > 0 has non-empty workerBreakdown
            for (const rule of trendingRules) {
              if (rule.count > 0) {
                expect(rule.workerBreakdown.length).toBeGreaterThan(0);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
