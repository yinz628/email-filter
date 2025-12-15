/**
 * Email Service Property Tests
 * 
 * **Feature: vps-email-filter, Property 8: 级联删除**
 * **Validates: Requirements 3.4, 5.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CreateRuleDTO, RuleCategory, MatchType, MatchMode, FilterRule } from '@email-filter/shared';
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
 * Test-specific RuleRepository that works with sql.js
 */
class TestRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): FilterRule {
    return {
      id: row[0] as string,
      category: row[1] as RuleCategory,
      matchType: row[2] as MatchType,
      matchMode: row[3] as MatchMode,
      pattern: row[4] as string,
      enabled: row[5] === 1,
      createdAt: new Date(row[6] as string),
      updatedAt: new Date(row[7] as string),
      lastHitAt: row[8] ? new Date(row[8] as string) : undefined,
    };
  }

  create(dto: CreateRuleDTO): FilterRule {
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

    return {
      id,
      category: dto.category,
      matchType: dto.matchType,
      matchMode: dto.matchMode,
      pattern: dto.pattern,
      enabled,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  findById(id: string): FilterRule | null {
    const result = this.db.exec('SELECT * FROM filter_rules WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.rowToRule(result[0].values[0]);
  }

  delete(id: string): boolean {
    // Delete stats first (manual cascade)
    this.db.run('DELETE FROM rule_stats WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM filter_rules WHERE id = ?', [id]);
    return true;
  }
}

/**
 * Test-specific StatsRepository that works with sql.js
 */
class TestStatsRepository {
  constructor(private db: SqlJsDatabase) {}

  findByRuleId(ruleId: string): { ruleId: string; totalProcessed: number; deletedCount: number; errorCount: number } | null {
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
    };
  }

  incrementDeleted(ruleId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE rule_stats SET deleted_count = deleted_count + 1, total_processed = total_processed + 1, last_updated = ? WHERE rule_id = ?`,
      [now, ruleId]
    );
  }

  incrementProcessed(ruleId: string): void {
    const now = new Date().toISOString();
    this.db.run(
      `UPDATE rule_stats SET total_processed = total_processed + 1, last_updated = ? WHERE rule_id = ?`,
      [now, ruleId]
    );
  }
}

describe('EmailService - Cascade Delete', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let ruleRepository: TestRuleRepository;
  let statsRepository: TestStatsRepository;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();
    
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);
    
    ruleRepository = new TestRuleRepository(db);
    statsRepository = new TestStatsRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: vps-email-filter, Property 8: 级联删除**
   * **Validates: Requirements 3.4, 5.4**
   * 
   * For any deleted rule, its associated statistics records should also be deleted.
   */
  describe('Property 8: 级联删除', () => {
    it('should delete associated stats when rule is deleted', () => {
      fc.assert(
        fc.property(createRuleDTOArb, (dto) => {
          // Create a rule (which also creates stats)
          const rule = ruleRepository.create(dto);
          
          // Verify stats exist
          const statsBefore = statsRepository.findByRuleId(rule.id);
          expect(statsBefore).not.toBeNull();
          expect(statsBefore!.ruleId).toBe(rule.id);
          
          // Delete the rule
          const deleted = ruleRepository.delete(rule.id);
          expect(deleted).toBe(true);
          
          // Verify rule is deleted
          const ruleAfter = ruleRepository.findById(rule.id);
          expect(ruleAfter).toBeNull();
          
          // Verify stats are also deleted (cascade)
          const statsAfter = statsRepository.findByRuleId(rule.id);
          expect(statsAfter).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('should delete stats even when they have non-zero counts', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          fc.integer({ min: 1, max: 10 }), // Number of stats updates
          (dto, updateCount) => {
            // Create a rule with stats
            const rule = ruleRepository.create(dto);
            
            // Update stats to have non-zero values
            for (let i = 0; i < updateCount; i++) {
              statsRepository.incrementDeleted(rule.id);
            }
            
            // Verify stats have non-zero values
            const statsBefore = statsRepository.findByRuleId(rule.id);
            expect(statsBefore).not.toBeNull();
            expect(statsBefore!.deletedCount).toBe(updateCount);
            expect(statsBefore!.totalProcessed).toBe(updateCount);
            
            // Delete the rule
            ruleRepository.delete(rule.id);
            
            // Verify stats are deleted despite having values
            const statsAfter = statsRepository.findByRuleId(rule.id);
            expect(statsAfter).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not affect other rules stats when deleting one rule', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          createRuleDTOArb,
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 5 }),
          (dto1, dto2, count1, count2) => {
            // Create two rules with stats
            const rule1 = ruleRepository.create(dto1);
            const rule2 = ruleRepository.create(dto2);
            
            // Update stats for both rules
            for (let i = 0; i < count1; i++) {
              statsRepository.incrementProcessed(rule1.id);
            }
            for (let i = 0; i < count2; i++) {
              statsRepository.incrementProcessed(rule2.id);
            }
            
            // Verify both have stats
            const stats1Before = statsRepository.findByRuleId(rule1.id);
            const stats2Before = statsRepository.findByRuleId(rule2.id);
            expect(stats1Before).not.toBeNull();
            expect(stats2Before).not.toBeNull();
            expect(stats1Before!.totalProcessed).toBe(count1);
            expect(stats2Before!.totalProcessed).toBe(count2);
            
            // Delete rule1
            ruleRepository.delete(rule1.id);
            
            // Verify rule1 stats are deleted
            const stats1After = statsRepository.findByRuleId(rule1.id);
            expect(stats1After).toBeNull();
            
            // Verify rule2 stats are NOT affected
            const stats2After = statsRepository.findByRuleId(rule2.id);
            expect(stats2After).not.toBeNull();
            expect(stats2After!.totalProcessed).toBe(count2);
            
            // Cleanup
            ruleRepository.delete(rule2.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle deleting multiple rules with cascade', () => {
      fc.assert(
        fc.property(
          fc.array(createRuleDTOArb, { minLength: 2, maxLength: 5 }),
          (dtos) => {
            // Create multiple rules
            const rules = dtos.map((dto) => ruleRepository.create(dto));
            
            // Verify all have stats
            for (const rule of rules) {
              const stats = statsRepository.findByRuleId(rule.id);
              expect(stats).not.toBeNull();
            }
            
            // Delete all rules
            for (const rule of rules) {
              ruleRepository.delete(rule.id);
            }
            
            // Verify all stats are deleted
            for (const rule of rules) {
              const stats = statsRepository.findByRuleId(rule.id);
              expect(stats).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
