/**
 * Stats Service Property Tests
 * 
 * **Feature: vps-email-filter, Property 7: 统计计数递增**
 * **Validates: Requirements 5.1, 5.3**
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
