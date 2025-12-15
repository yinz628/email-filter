import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  FilterRule,
  RuleStats,
  RuleCategory,
  MatchType,
  MatchMode,
  ProcessAction,
} from '@email-filter/shared';

// In-memory mock implementation of D1Database for testing
class MockD1Database {
  private rules: Map<string, FilterRule> = new Map();
  private stats: Map<string, RuleStats> = new Map();

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(sql, this.rules, this.stats);
  }

  // Expose for test verification
  getRules(): Map<string, FilterRule> {
    return this.rules;
  }

  getStats(): Map<string, RuleStats> {
    return this.stats;
  }

  clear(): void {
    this.rules.clear();
    this.stats.clear();
  }
}

class MockD1PreparedStatement {
  private boundValues: (string | number | null)[] = [];

  constructor(
    private sql: string,
    private rules: Map<string, FilterRule>,
    private stats: Map<string, RuleStats>
  ) {}

  bind(...values: (string | number | null)[]): MockD1PreparedStatement {
    this.boundValues = values;
    return this;
  }


  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const sqlLower = this.sql.toLowerCase();
    
    if (sqlLower.includes('insert into filter_rules')) {
      const [id, category, matchType, matchMode, pattern, enabled, createdAt, updatedAt] = this.boundValues;
      const rule: FilterRule = {
        id: id as string,
        category: category as RuleCategory,
        matchType: matchType as MatchType,
        matchMode: matchMode as MatchMode,
        pattern: pattern as string,
        enabled: enabled === 1,
        createdAt: new Date(createdAt as string),
        updatedAt: new Date(updatedAt as string),
      };
      this.rules.set(id as string, rule);
    } else if (sqlLower.includes('insert into rule_stats')) {
      const [ruleId, totalProcessed, deletedCount, errorCount, lastUpdated] = this.boundValues;
      this.stats.set(ruleId as string, {
        ruleId: ruleId as string,
        totalProcessed: Number(totalProcessed) || 0,
        deletedCount: Number(deletedCount) || 0,
        errorCount: Number(errorCount) || 0,
        lastUpdated: new Date(lastUpdated as string),
      });
    } else if (sqlLower.includes('update rule_stats')) {
      const ruleId = this.boundValues[this.boundValues.length - 1] as string;
      const existing = this.stats.get(ruleId);
      if (existing) {
        const now = new Date(this.boundValues[0] as string);
        
        // Ensure numeric values
        existing.totalProcessed = Number(existing.totalProcessed) || 0;
        existing.deletedCount = Number(existing.deletedCount) || 0;
        existing.errorCount = Number(existing.errorCount) || 0;
        
        if (sqlLower.includes('deleted_count = deleted_count + 1')) {
          existing.totalProcessed += 1;
          existing.deletedCount += 1;
          existing.lastUpdated = now;
        } else if (sqlLower.includes('error_count = error_count + 1')) {
          existing.totalProcessed += 1;
          existing.errorCount += 1;
          existing.lastUpdated = now;
        } else if (sqlLower.includes('total_processed = total_processed + 1')) {
          existing.totalProcessed += 1;
          existing.lastUpdated = now;
        } else if (sqlLower.includes('total_processed = 0')) {
          // Reset stats
          existing.totalProcessed = 0;
          existing.deletedCount = 0;
          existing.errorCount = 0;
          existing.lastUpdated = now;
        }
        this.stats.set(ruleId, existing);
      }
    } else if (sqlLower.includes('delete from rule_stats')) {
      const ruleId = this.boundValues[0] as string;
      this.stats.delete(ruleId);
    } else if (sqlLower.includes('delete from filter_rules')) {
      const id = this.boundValues[0] as string;
      this.rules.delete(id);
    } else if (sqlLower.includes('update filter_rules')) {
      // Handle rule updates
      const id = this.boundValues[this.boundValues.length - 1] as string;
      const existing = this.rules.get(id);
      if (existing) {
        existing.updatedAt = new Date();
        this.rules.set(id, existing);
      }
    }
    
    return { success: true, meta: { changes: 1 } };
  }


  async first<T>(): Promise<T | null> {
    const sqlLower = this.sql.toLowerCase();
    
    if (sqlLower.includes('select * from rule_stats where rule_id =')) {
      const ruleId = this.boundValues[0] as string;
      const stat = this.stats.get(ruleId);
      if (!stat) return null;
      // Ensure lastUpdated is a valid Date
      const lastUpdated = stat.lastUpdated instanceof Date && !isNaN(stat.lastUpdated.getTime())
        ? stat.lastUpdated.toISOString()
        : new Date().toISOString();
      return {
        rule_id: stat.ruleId,
        total_processed: stat.totalProcessed,
        deleted_count: stat.deletedCount,
        error_count: stat.errorCount,
        last_updated: lastUpdated,
      } as T;
    }
    
    if (sqlLower.includes('select * from filter_rules where id =')) {
      const id = this.boundValues[0] as string;
      const rule = this.rules.get(id);
      if (!rule) return null;
      // Ensure dates are valid
      const createdAt = rule.createdAt instanceof Date && !isNaN(rule.createdAt.getTime())
        ? rule.createdAt.toISOString()
        : new Date().toISOString();
      const updatedAt = rule.updatedAt instanceof Date && !isNaN(rule.updatedAt.getTime())
        ? rule.updatedAt.toISOString()
        : new Date().toISOString();
      const lastHitAt = rule.lastHitAt instanceof Date && !isNaN(rule.lastHitAt.getTime())
        ? rule.lastHitAt.toISOString()
        : null;
      return {
        id: rule.id,
        category: rule.category,
        match_type: rule.matchType,
        match_mode: rule.matchMode,
        pattern: rule.pattern,
        enabled: rule.enabled ? 1 : 0,
        created_at: createdAt,
        updated_at: updatedAt,
        last_hit_at: lastHitAt,
      } as T;
    }
    
    // Summary queries
    if (sqlLower.includes('count(*) as total_rules')) {
      const totalRules = this.rules.size;
      const activeRules = Array.from(this.rules.values()).filter(r => r.enabled).length;
      return { total_rules: totalRules, active_rules: activeRules } as T;
    }
    
    if (sqlLower.includes('sum(total_processed)')) {
      let totalProcessed = 0;
      let totalDeleted = 0;
      let totalErrors = 0;
      for (const stat of this.stats.values()) {
        totalProcessed += stat.totalProcessed;
        totalDeleted += stat.deletedCount;
        totalErrors += stat.errorCount;
      }
      return { total_processed: totalProcessed, total_deleted: totalDeleted, total_errors: totalErrors } as T;
    }
    
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sqlLower = this.sql.toLowerCase();
    
    if (sqlLower.includes('select * from rule_stats') || sqlLower.includes('select rs.*')) {
      let results = Array.from(this.stats.values());
      
      // Filter by category if joined with filter_rules
      if (sqlLower.includes('inner join filter_rules') && sqlLower.includes('where fr.category =')) {
        const category = this.boundValues[0] as string;
        results = results.filter(stat => {
          const rule = this.rules.get(stat.ruleId);
          return rule?.category === category;
        });
      }
      
      const rows = results.map(stat => {
        const lastUpdated = stat.lastUpdated instanceof Date && !isNaN(stat.lastUpdated.getTime())
          ? stat.lastUpdated.toISOString()
          : new Date().toISOString();
        return {
          rule_id: stat.ruleId,
          total_processed: stat.totalProcessed,
          deleted_count: stat.deletedCount,
          error_count: stat.errorCount,
          last_updated: lastUpdated,
        };
      });
      
      return { results: rows as T[] };
    }
    
    if (sqlLower.includes('select * from filter_rules')) {
      let results = Array.from(this.rules.values());
      
      if (sqlLower.includes('where category =')) {
        const category = this.boundValues[0] as string;
        results = results.filter(r => r.category === category);
      }
      
      const rows = results.map(rule => {
        const createdAt = rule.createdAt instanceof Date && !isNaN(rule.createdAt.getTime())
          ? rule.createdAt.toISOString()
          : new Date().toISOString();
        const updatedAt = rule.updatedAt instanceof Date && !isNaN(rule.updatedAt.getTime())
          ? rule.updatedAt.toISOString()
          : new Date().toISOString();
        const lastHitAt = rule.lastHitAt instanceof Date && !isNaN(rule.lastHitAt.getTime())
          ? rule.lastHitAt.toISOString()
          : null;
        return {
          id: rule.id,
          category: rule.category,
          match_type: rule.matchType,
          match_mode: rule.matchMode,
          pattern: rule.pattern,
          enabled: rule.enabled ? 1 : 0,
          created_at: createdAt,
          updated_at: updatedAt,
          last_hit_at: lastHitAt,
        };
      });
      
      return { results: rows as T[] };
    }
    
    return { results: [] };
  }
}


// Import the repositories and service after mock is defined
import { StatsRepository } from '../db/stats-repository.js';
import { RuleRepository } from '../db/rule-repository.js';
import { StatsService } from './stats.service.js';

// Arbitraries for generating test data
const categoryArbitrary = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const matchTypeArbitrary = fc.constantFrom<MatchType>('sender_name', 'subject', 'sender_email');
const matchModeArbitrary = fc.constantFrom<MatchMode>('regex', 'contains');
const actionArbitrary = fc.constantFrom<ProcessAction>('passed', 'deleted', 'error');

const createRuleDTOArbitrary = fc.record({
  category: categoryArbitrary,
  matchType: matchTypeArbitrary,
  matchMode: matchModeArbitrary,
  pattern: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  enabled: fc.option(fc.boolean(), { nil: undefined }),
});

describe('StatsService', () => {
  let mockDb: MockD1Database;
  let statsRepository: StatsRepository;
  let ruleRepository: RuleRepository;
  let statsService: StatsService;

  beforeEach(() => {
    mockDb = new MockD1Database();
    statsRepository = new StatsRepository(mockDb as unknown as D1Database);
    ruleRepository = new RuleRepository(mockDb as unknown as D1Database);
    statsService = new StatsService(statsRepository, ruleRepository);
  });

  /**
   * **Feature: email-filter-management, Property 8: 规则删除级联**
   * *For any* 被删除的过滤规则，删除后该规则的统计数据也应被删除，查询规则和统计都应返回空。
   * **Validates: Requirements 5.5, 8.3**
   */
  describe('Property 8: 规则删除级联', () => {
    it('删除规则时应同时删除关联的统计数据', async () => {
      await fc.assert(
        fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
          // Clear database before each test
          mockDb.clear();
          
          // Create a rule (this also creates stats via RuleRepository)
          const rule = await ruleRepository.create(dto);
          
          // Verify rule and stats exist
          const ruleBefore = await ruleRepository.findById(rule.id);
          const statsBefore = await statsRepository.findByRuleId(rule.id);
          expect(ruleBefore).not.toBeNull();
          expect(statsBefore).not.toBeNull();
          
          // Delete rule with cascade using StatsService
          const deleted = await statsService.deleteRuleWithStats(rule.id);
          expect(deleted).toBe(true);
          
          // Verify both rule and stats are deleted
          const ruleAfter = await ruleRepository.findById(rule.id);
          const statsAfter = await statsRepository.findByRuleId(rule.id);
          expect(ruleAfter).toBeNull();
          expect(statsAfter).toBeNull();
        }),
        { numRuns: 100 }
      );
    });


    it('删除不存在的规则应返回false', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (nonExistentId) => {
          // Clear database before each test
          mockDb.clear();
          
          // Try to delete non-existent rule
          const deleted = await statsService.deleteRuleWithStats(nonExistentId);
          
          // Should return false since rule doesn't exist
          expect(deleted).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('删除规则后统计查询应返回空', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createRuleDTOArbitrary, { minLength: 2, maxLength: 5 }),
          async (dtos) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create multiple rules
            const rules: FilterRule[] = [];
            for (const dto of dtos) {
              const rule = await ruleRepository.create(dto);
              rules.push(rule);
            }
            
            // Pick a random rule to delete
            const ruleToDelete = rules[0];
            
            // Delete the rule
            await statsService.deleteRuleWithStats(ruleToDelete.id);
            
            // Verify the deleted rule's stats are gone
            const deletedStats = await statsRepository.findByRuleId(ruleToDelete.id);
            expect(deletedStats).toBeNull();
            
            // Verify other rules' stats still exist
            for (let i = 1; i < rules.length; i++) {
              const otherStats = await statsRepository.findByRuleId(rules[i].id);
              expect(otherStats).not.toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: email-filter-management, Property 14: 规则统计准确性**
   * *For any* 被规则命中的邮件，对应规则的统计计数应正确递增
   * （totalProcessed增加，根据action增加deletedCount或errorCount）。
   * **Validates: Requirements 8.1, 8.2, 8.4**
   */
  describe('Property 14: 规则统计准确性', () => {
    it('记录规则命中时totalProcessed应递增', async () => {
      await fc.assert(
        fc.asyncProperty(
          createRuleDTOArbitrary,
          fc.integer({ min: 1, max: 20 }),
          actionArbitrary,
          async (dto, hitCount, action) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create a rule
            const rule = await ruleRepository.create(dto);
            
            // Get initial stats
            const initialStats = await statsRepository.findByRuleId(rule.id);
            expect(initialStats).not.toBeNull();
            expect(initialStats!.totalProcessed).toBe(0);
            
            // Record multiple hits
            for (let i = 0; i < hitCount; i++) {
              await statsService.recordRuleHit(rule.id, action);
            }
            
            // Verify totalProcessed increased correctly
            const finalStats = await statsRepository.findByRuleId(rule.id);
            expect(finalStats).not.toBeNull();
            expect(finalStats!.totalProcessed).toBe(hitCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('action为deleted时deletedCount应递增', async () => {
      await fc.assert(
        fc.asyncProperty(
          createRuleDTOArbitrary,
          fc.integer({ min: 1, max: 20 }),
          async (dto, hitCount) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create a rule
            const rule = await ruleRepository.create(dto);
            
            // Record hits with 'deleted' action
            for (let i = 0; i < hitCount; i++) {
              await statsService.recordRuleHit(rule.id, 'deleted');
            }
            
            // Verify deletedCount increased correctly
            const finalStats = await statsRepository.findByRuleId(rule.id);
            expect(finalStats).not.toBeNull();
            expect(finalStats!.totalProcessed).toBe(hitCount);
            expect(finalStats!.deletedCount).toBe(hitCount);
            expect(finalStats!.errorCount).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });


    it('action为error时errorCount应递增', async () => {
      await fc.assert(
        fc.asyncProperty(
          createRuleDTOArbitrary,
          fc.integer({ min: 1, max: 20 }),
          async (dto, hitCount) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create a rule
            const rule = await ruleRepository.create(dto);
            
            // Record hits with 'error' action
            for (let i = 0; i < hitCount; i++) {
              await statsService.recordRuleHit(rule.id, 'error');
            }
            
            // Verify errorCount increased correctly
            const finalStats = await statsRepository.findByRuleId(rule.id);
            expect(finalStats).not.toBeNull();
            expect(finalStats!.totalProcessed).toBe(hitCount);
            expect(finalStats!.deletedCount).toBe(0);
            expect(finalStats!.errorCount).toBe(hitCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('action为passed时只有totalProcessed递增', async () => {
      await fc.assert(
        fc.asyncProperty(
          createRuleDTOArbitrary,
          fc.integer({ min: 1, max: 20 }),
          async (dto, hitCount) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create a rule
            const rule = await ruleRepository.create(dto);
            
            // Record hits with 'passed' action
            for (let i = 0; i < hitCount; i++) {
              await statsService.recordRuleHit(rule.id, 'passed');
            }
            
            // Verify only totalProcessed increased
            const finalStats = await statsRepository.findByRuleId(rule.id);
            expect(finalStats).not.toBeNull();
            expect(finalStats!.totalProcessed).toBe(hitCount);
            expect(finalStats!.deletedCount).toBe(0);
            expect(finalStats!.errorCount).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('混合action类型时各计数应正确累加', async () => {
      await fc.assert(
        fc.asyncProperty(
          createRuleDTOArbitrary,
          fc.array(actionArbitrary, { minLength: 1, maxLength: 30 }),
          async (dto, actions) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create a rule
            const rule = await ruleRepository.create(dto);
            
            // Calculate expected counts
            const expectedDeleted = actions.filter(a => a === 'deleted').length;
            const expectedError = actions.filter(a => a === 'error').length;
            const expectedTotal = actions.length;
            
            // Record all hits
            for (const action of actions) {
              await statsService.recordRuleHit(rule.id, action);
            }
            
            // Verify counts match expected
            const finalStats = await statsRepository.findByRuleId(rule.id);
            expect(finalStats).not.toBeNull();
            expect(finalStats!.totalProcessed).toBe(expectedTotal);
            expect(finalStats!.deletedCount).toBe(expectedDeleted);
            expect(finalStats!.errorCount).toBe(expectedError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  describe('getStatsByCategory', () => {
    it('应只返回指定分类的规则统计', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createRuleDTOArbitrary, { minLength: 1, maxLength: 10 }),
          categoryArbitrary,
          async (dtos, targetCategory) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create all rules
            for (const dto of dtos) {
              await ruleRepository.create(dto);
            }
            
            // Query stats by category
            const stats = await statsService.getStatsByCategory(targetCategory);
            
            // Verify all returned stats belong to rules of the target category
            for (const stat of stats) {
              const rule = await ruleRepository.findById(stat.ruleId);
              expect(rule).not.toBeNull();
              expect(rule!.category).toBe(targetCategory);
            }
            
            // Verify count matches expected
            const expectedCount = dtos.filter(d => d.category === targetCategory).length;
            expect(stats.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('getSummary', () => {
    it('应正确聚合所有规则的统计数据', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createRuleDTOArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(
            fc.record({
              ruleIndex: fc.integer({ min: 0, max: 4 }),
              action: actionArbitrary,
            }),
            { minLength: 0, maxLength: 20 }
          ),
          async (dtos, hits) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create rules
            const rules: FilterRule[] = [];
            for (const dto of dtos) {
              const rule = await ruleRepository.create(dto);
              rules.push(rule);
            }
            
            // Record hits
            let expectedDeleted = 0;
            let expectedErrors = 0;
            let expectedTotal = 0;
            
            for (const hit of hits) {
              const ruleIndex = hit.ruleIndex % rules.length;
              await statsService.recordRuleHit(rules[ruleIndex].id, hit.action);
              expectedTotal++;
              if (hit.action === 'deleted') expectedDeleted++;
              if (hit.action === 'error') expectedErrors++;
            }
            
            // Get summary
            const summary = await statsService.getSummary();
            
            // Verify summary
            expect(summary.totalRules).toBe(rules.length);
            expect(summary.totalProcessed).toBe(expectedTotal);
            expect(summary.totalDeleted).toBe(expectedDeleted);
            expect(summary.totalErrors).toBe(expectedErrors);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
