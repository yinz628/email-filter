import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  FilterRule,
  CreateRuleDTO,
  RuleCategory,
  MatchType,
  MatchMode,
} from '@email-filter/shared';

// In-memory mock implementation of D1Database for testing
class MockD1Database {
  private rules: Map<string, FilterRule> = new Map();
  private stats: Map<string, { ruleId: string; totalProcessed: number; deletedCount: number; errorCount: number; lastUpdated: Date }> = new Map();

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(sql, this.rules, this.stats);
  }

  // Expose for test verification
  getRules(): FilterRule[] {
    return Array.from(this.rules.values());
  }

  getStats(): Map<string, { ruleId: string; totalProcessed: number; deletedCount: number; errorCount: number; lastUpdated: Date }> {
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
    private stats: Map<string, { ruleId: string; totalProcessed: number; deletedCount: number; errorCount: number; lastUpdated: Date }>
  ) {}

  bind(...values: (string | number | null)[]): MockD1PreparedStatement {
    this.boundValues = values;
    return this;
  }


  async run(): Promise<{ success: boolean }> {
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
        totalProcessed: totalProcessed as number,
        deletedCount: deletedCount as number,
        errorCount: errorCount as number,
        lastUpdated: new Date(lastUpdated as string),
      });
    } else if (sqlLower.includes('update filter_rules set')) {
      // Handle update - find the id (last bound value)
      const id = this.boundValues[this.boundValues.length - 1] as string;
      const existing = this.rules.get(id);
      if (existing) {
        // Parse the SET clause to determine what's being updated
        // Extract field names from SQL between SET and WHERE
        const setClause = this.sql.substring(
          this.sql.toLowerCase().indexOf('set ') + 4,
          this.sql.toLowerCase().indexOf(' where')
        );
        const fields = setClause.split(',').map(f => f.trim().split('=')[0].trim().toLowerCase());
        
        let valueIndex = 0;
        for (const field of fields) {
          const value = this.boundValues[valueIndex];
          switch (field) {
            case 'category':
              existing.category = value as RuleCategory;
              break;
            case 'match_type':
              existing.matchType = value as MatchType;
              break;
            case 'match_mode':
              existing.matchMode = value as MatchMode;
              break;
            case 'pattern':
              existing.pattern = value as string;
              break;
            case 'enabled':
              existing.enabled = value === 1;
              break;
            case 'updated_at':
              existing.updatedAt = new Date(value as string);
              break;
            case 'last_hit_at':
              existing.lastHitAt = new Date(value as string);
              break;
          }
          valueIndex++;
        }
        this.rules.set(id, existing);
      }
    } else if (sqlLower.includes('delete from rule_stats')) {
      const id = this.boundValues[0] as string;
      this.stats.delete(id);
    } else if (sqlLower.includes('delete from filter_rules')) {
      const id = this.boundValues[0] as string;
      this.rules.delete(id);
    }
    
    return { success: true };
  }


  async first<T>(): Promise<T | null> {
    const sqlLower = this.sql.toLowerCase();
    
    if (sqlLower.includes('select * from filter_rules where id =')) {
      const id = this.boundValues[0] as string;
      const rule = this.rules.get(id);
      if (!rule) return null;
      return {
        id: rule.id,
        category: rule.category,
        match_type: rule.matchType,
        match_mode: rule.matchMode,
        pattern: rule.pattern,
        enabled: rule.enabled ? 1 : 0,
        created_at: rule.createdAt.toISOString(),
        updated_at: rule.updatedAt.toISOString(),
        last_hit_at: rule.lastHitAt?.toISOString() || null,
      } as T;
    }
    
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sqlLower = this.sql.toLowerCase();
    let results: FilterRule[] = [];
    
    if (sqlLower.includes('select * from filter_rules')) {
      results = Array.from(this.rules.values());
      
      // Filter by category if specified
      if (sqlLower.includes('where category =')) {
        const category = this.boundValues[0] as string;
        results = results.filter(r => r.category === category);
      }
      
      // Filter by enabled if specified
      if (sqlLower.includes('where enabled =')) {
        results = results.filter(r => r.enabled);
      }
      
      // Filter by category AND enabled
      if (sqlLower.includes('where category = ? and enabled =')) {
        const category = this.boundValues[0] as string;
        results = results.filter(r => r.category === category && r.enabled);
      }
      
      // Filter for expired dynamic rules
      if (sqlLower.includes("where category = 'dynamic'") && sqlLower.includes('last_hit_at')) {
        const cutoffTime = new Date(this.boundValues[0] as string);
        results = results.filter(r => 
          r.category === 'dynamic' && 
          (!r.lastHitAt || r.lastHitAt < cutoffTime)
        );
      }
    }
    
    // Convert to row format
    const rows = results.map(rule => ({
      id: rule.id,
      category: rule.category,
      match_type: rule.matchType,
      match_mode: rule.matchMode,
      pattern: rule.pattern,
      enabled: rule.enabled ? 1 : 0,
      created_at: rule.createdAt.toISOString(),
      updated_at: rule.updatedAt.toISOString(),
      last_hit_at: rule.lastHitAt?.toISOString() || null,
    }));
    
    return { results: rows as T[] };
  }
}


// Import the repository after mock is defined
import { RuleRepository } from './rule-repository.js';

// Arbitraries for generating test data
const categoryArbitrary = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const matchTypeArbitrary = fc.constantFrom<MatchType>('sender_name', 'subject', 'sender_email');
const matchModeArbitrary = fc.constantFrom<MatchMode>('regex', 'contains');

const createRuleDTOArbitrary = fc.record({
  category: categoryArbitrary,
  matchType: matchTypeArbitrary,
  matchMode: matchModeArbitrary,
  pattern: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  enabled: fc.option(fc.boolean(), { nil: undefined }),
});

describe('RuleRepository', () => {
  let mockDb: MockD1Database;
  let repository: RuleRepository;

  beforeEach(() => {
    mockDb = new MockD1Database();
    repository = new RuleRepository(mockDb as unknown as D1Database);
  });

  /**
   * **Feature: email-filter-management, Property 1: Worker实例CRUD一致性**（应用于规则）
   * *For any* 过滤规则数据，创建规则后查询应返回相同数据，修改后查询应返回更新后的数据，
   * 删除后查询应返回空结果。
   * **Validates: Requirements 10.1, 10.2**
   */
  describe('Property 1: Worker实例CRUD一致性（应用于规则）', () => {
    it('CREATE: 创建规则后查询应返回相同数据', async () => {
      await fc.assert(
        fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
          // Clear database before each test
          mockDb.clear();
          
          // Create the rule
          const created = await repository.create(dto);
          
          // Query the rule
          const found = await repository.findById(created.id);
          
          // Verify the data matches
          expect(found).not.toBeNull();
          expect(found!.category).toBe(dto.category);
          expect(found!.matchType).toBe(dto.matchType);
          expect(found!.matchMode).toBe(dto.matchMode);
          expect(found!.pattern).toBe(dto.pattern);
          expect(found!.enabled).toBe(dto.enabled ?? true);
        }),
        { numRuns: 100 }
      );
    });


    it('UPDATE: 修改规则后查询应返回更新后的数据', async () => {
      await fc.assert(
        fc.asyncProperty(
          createRuleDTOArbitrary,
          fc.record({
            category: fc.option(categoryArbitrary, { nil: undefined }),
            matchType: fc.option(matchTypeArbitrary, { nil: undefined }),
            matchMode: fc.option(matchModeArbitrary, { nil: undefined }),
            pattern: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { nil: undefined }),
            enabled: fc.option(fc.boolean(), { nil: undefined }),
          }),
          async (createDto, updateDto) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create the rule
            const created = await repository.create(createDto);
            
            // Update the rule
            const updated = await repository.update(created.id, updateDto);
            
            // Query the rule
            const found = await repository.findById(created.id);
            
            // Verify the data matches expected values
            expect(found).not.toBeNull();
            expect(found!.category).toBe(updateDto.category ?? createDto.category);
            expect(found!.matchType).toBe(updateDto.matchType ?? createDto.matchType);
            expect(found!.matchMode).toBe(updateDto.matchMode ?? createDto.matchMode);
            expect(found!.pattern).toBe(updateDto.pattern ?? createDto.pattern);
            
            const expectedEnabled = updateDto.enabled !== undefined 
              ? updateDto.enabled 
              : (createDto.enabled ?? true);
            expect(found!.enabled).toBe(expectedEnabled);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('DELETE: 删除规则后查询应返回空结果', async () => {
      await fc.assert(
        fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
          // Clear database before each test
          mockDb.clear();
          
          // Create the rule
          const created = await repository.create(dto);
          
          // Verify it exists
          const beforeDelete = await repository.findById(created.id);
          expect(beforeDelete).not.toBeNull();
          
          // Delete the rule
          const deleted = await repository.delete(created.id);
          expect(deleted).toBe(true);
          
          // Query should return null
          const afterDelete = await repository.findById(created.id);
          expect(afterDelete).toBeNull();
        }),
        { numRuns: 100 }
      );
    });


    it('DELETE: 删除规则时应同时删除关联的统计数据', async () => {
      await fc.assert(
        fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
          // Clear database before each test
          mockDb.clear();
          
          // Create the rule (this also creates stats)
          const created = await repository.create(dto);
          
          // Verify stats exist
          const statsBefore = mockDb.getStats();
          expect(statsBefore.has(created.id)).toBe(true);
          
          // Delete the rule
          await repository.delete(created.id);
          
          // Verify stats are also deleted
          const statsAfter = mockDb.getStats();
          expect(statsAfter.has(created.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('TOGGLE: 切换启用状态应正确更新', async () => {
      await fc.assert(
        fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
          // Clear database before each test
          mockDb.clear();
          
          // Create the rule
          const created = await repository.create(dto);
          const initialEnabled = created.enabled;
          
          // Toggle the enabled status
          const toggled = await repository.toggleEnabled(created.id);
          
          // Verify the status is toggled
          expect(toggled).not.toBeNull();
          expect(toggled!.enabled).toBe(!initialEnabled);
          
          // Toggle again
          const toggledAgain = await repository.toggleEnabled(created.id);
          expect(toggledAgain!.enabled).toBe(initialEnabled);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('findByCategory', () => {
    it('should return only rules of the specified category', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createRuleDTOArbitrary, { minLength: 1, maxLength: 10 }),
          categoryArbitrary,
          async (dtos, targetCategory) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create all rules
            for (const dto of dtos) {
              await repository.create(dto);
            }
            
            // Query by category
            const found = await repository.findByCategory(targetCategory);
            
            // Verify all returned rules have the correct category
            for (const rule of found) {
              expect(rule.category).toBe(targetCategory);
            }
            
            // Verify count matches expected
            const expectedCount = dtos.filter(d => d.category === targetCategory).length;
            expect(found.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('findEnabled', () => {
    it('should return only enabled rules', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(createRuleDTOArbitrary, { minLength: 1, maxLength: 10 }),
          async (dtos) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create all rules
            for (const dto of dtos) {
              await repository.create(dto);
            }
            
            // Query enabled rules
            const found = await repository.findEnabled();
            
            // Verify all returned rules are enabled
            for (const rule of found) {
              expect(rule.enabled).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
