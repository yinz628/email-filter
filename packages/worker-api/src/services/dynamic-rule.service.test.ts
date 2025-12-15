import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  FilterRule,
  RuleCategory,
  MatchType,
  MatchMode,
  DynamicConfig,
} from '@email-filter/shared';
import { DEFAULT_DYNAMIC_CONFIG } from '@email-filter/shared';

// In-memory mock implementation of D1Database for testing
class MockD1Database {
  private rules: Map<string, FilterRule> = new Map();
  private stats: Map<string, { ruleId: string; totalProcessed: number; deletedCount: number; errorCount: number; lastUpdated: Date }> = new Map();
  private subjectTracker: Array<{ id: number; subject_hash: string; subject: string; received_at: string }> = [];
  private dynamicConfig: Map<string, string> = new Map();
  private nextTrackerId = 1;

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(sql, this);
  }

  // Expose for test verification
  getRules(): Map<string, FilterRule> {
    return this.rules;
  }

  getStats(): Map<string, { ruleId: string; totalProcessed: number; deletedCount: number; errorCount: number; lastUpdated: Date }> {
    return this.stats;
  }

  getSubjectTracker(): Array<{ id: number; subject_hash: string; subject: string; received_at: string }> {
    return this.subjectTracker;
  }

  getDynamicConfig(): Map<string, string> {
    return this.dynamicConfig;
  }

  getNextTrackerId(): number {
    return this.nextTrackerId++;
  }

  clear(): void {
    this.rules.clear();
    this.stats.clear();
    this.subjectTracker = [];
    this.dynamicConfig.clear();
    this.nextTrackerId = 1;
  }
}

class MockD1PreparedStatement {
  private boundValues: (string | number | null)[] = [];

  constructor(
    private sql: string,
    private db: MockD1Database
  ) {}

  bind(...values: (string | number | null)[]): MockD1PreparedStatement {
    this.boundValues = values;
    return this;
  }

  async run(): Promise<{ success: boolean; meta: { changes: number } }> {
    const sqlLower = this.sql.toLowerCase();
    const rules = this.db.getRules();
    const stats = this.db.getStats();
    const tracker = this.db.getSubjectTracker();
    const config = this.db.getDynamicConfig();
    
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
      rules.set(id as string, rule);
    } else if (sqlLower.includes('insert into rule_stats')) {
      const [ruleId, totalProcessed, deletedCount, errorCount, lastUpdated] = this.boundValues;
      stats.set(ruleId as string, {
        ruleId: ruleId as string,
        totalProcessed: Number(totalProcessed) || 0,
        deletedCount: Number(deletedCount) || 0,
        errorCount: Number(errorCount) || 0,
        lastUpdated: new Date(lastUpdated as string),
      });
    } else if (sqlLower.includes('insert into email_subject_tracker')) {
      const [subjectHash, subject, receivedAt] = this.boundValues;
      tracker.push({
        id: this.db.getNextTrackerId(),
        subject_hash: subjectHash as string,
        subject: subject as string,
        received_at: receivedAt as string,
      });
    } else if (sqlLower.includes('insert into dynamic_config') || sqlLower.includes('on conflict')) {
      const [key, value] = this.boundValues;
      config.set(key as string, value as string);
    } else if (sqlLower.includes('delete from rule_stats')) {
      const ruleId = this.boundValues[0] as string;
      stats.delete(ruleId);
    } else if (sqlLower.includes('delete from filter_rules')) {
      const id = this.boundValues[0] as string;
      rules.delete(id);
    } else if (sqlLower.includes('delete from email_subject_tracker')) {
      if (sqlLower.includes('subject_hash = ?') && sqlLower.includes('received_at <')) {
        const [subjectHash, olderThan] = this.boundValues;
        const cutoff = new Date(olderThan as string);
        const toRemove = tracker.filter(t => 
          t.subject_hash === subjectHash && new Date(t.received_at) < cutoff
        );
        for (const item of toRemove) {
          const idx = tracker.indexOf(item);
          if (idx >= 0) tracker.splice(idx, 1);
        }
      } else if (sqlLower.includes('received_at <')) {
        const cutoff = new Date(this.boundValues[0] as string);
        const toRemove = tracker.filter(t => new Date(t.received_at) < cutoff);
        for (const item of toRemove) {
          const idx = tracker.indexOf(item);
          if (idx >= 0) tracker.splice(idx, 1);
        }
        return { success: true, meta: { changes: toRemove.length } };
      }
    } else if (sqlLower.includes('update filter_rules set last_hit_at')) {
      const [lastHitAt, updatedAt, id] = this.boundValues;
      const rule = rules.get(id as string);
      if (rule) {
        rule.lastHitAt = new Date(lastHitAt as string);
        rule.updatedAt = new Date(updatedAt as string);
        rules.set(id as string, rule);
      }
    } else if (sqlLower.includes('update filter_rules')) {
      const id = this.boundValues[this.boundValues.length - 1] as string;
      const rule = rules.get(id);
      if (rule) {
        rule.updatedAt = new Date();
        rules.set(id, rule);
      }
    }
    
    return { success: true, meta: { changes: 1 } };
  }

  async first<T>(): Promise<T | null> {
    const sqlLower = this.sql.toLowerCase();
    const rules = this.db.getRules();
    const tracker = this.db.getSubjectTracker();
    
    if (sqlLower.includes('select * from filter_rules where id =')) {
      const id = this.boundValues[0] as string;
      const rule = rules.get(id);
      if (!rule) return null;
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
    
    // Handle findDynamicRuleBySubject query
    if (sqlLower.includes("select * from filter_rules") && 
        sqlLower.includes("category = 'dynamic'") && 
        sqlLower.includes("match_type = 'subject'") && 
        sqlLower.includes("pattern = ?")) {
      const pattern = this.boundValues[0] as string;
      // Find matching dynamic rule by pattern
      for (const rule of rules.values()) {
        if (rule.category === 'dynamic' && rule.matchType === 'subject' && rule.pattern === pattern) {
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
      }
      return null;
    }
    
    if (sqlLower.includes('count(*) as count from email_subject_tracker')) {
      const [subjectHash, windowStart] = this.boundValues;
      const count = tracker.filter(t => 
        t.subject_hash === subjectHash && 
        new Date(t.received_at) >= new Date(windowStart as string)
      ).length;
      return { count } as T;
    }
    
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sqlLower = this.sql.toLowerCase();
    const rules = this.db.getRules();
    const config = this.db.getDynamicConfig();
    const tracker = this.db.getSubjectTracker();
    
    if (sqlLower.includes('select key, value from dynamic_config')) {
      const results = Array.from(config.entries()).map(([key, value]) => ({ key, value }));
      return { results: results as T[] };
    }
    
    if (sqlLower.includes('select * from filter_rules')) {
      let results = Array.from(rules.values());
      
      if (sqlLower.includes("where category = 'dynamic'")) {
        results = results.filter(r => r.category === 'dynamic');
        
        if (sqlLower.includes('last_hit_at is null or last_hit_at <')) {
          const cutoff = new Date(this.boundValues[0] as string);
          results = results.filter(r => 
            !r.lastHitAt || r.lastHitAt < cutoff
          );
        }
      } else if (sqlLower.includes('where category =')) {
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
    
    if (sqlLower.includes('select subject_hash, subject, count(*)')) {
      const windowStart = new Date(this.boundValues[0] as string);
      const filtered = tracker.filter(t => new Date(t.received_at) >= windowStart);
      const grouped = new Map<string, { subject_hash: string; subject: string; count: number }>();
      for (const t of filtered) {
        const existing = grouped.get(t.subject_hash);
        if (existing) {
          existing.count++;
        } else {
          grouped.set(t.subject_hash, { subject_hash: t.subject_hash, subject: t.subject, count: 1 });
        }
      }
      const results = Array.from(grouped.values()).sort((a, b) => b.count - a.count).slice(0, 100);
      return { results: results as T[] };
    }
    
    return { results: [] };
  }
}

// Import the service after mock is defined
import { RuleRepository } from '../db/rule-repository.js';
import { DynamicRuleService } from './dynamic-rule.service.js';

// Arbitraries for generating test data
const subjectArbitrary = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

const dynamicConfigArbitrary = fc.record({
  enabled: fc.boolean(),
  timeWindowMinutes: fc.integer({ min: 1, max: 120 }),
  thresholdCount: fc.integer({ min: 2, max: 100 }),
  expirationHours: fc.integer({ min: 1, max: 168 }),
});

describe('DynamicRuleService', () => {
  let mockDb: MockD1Database;
  let ruleRepository: RuleRepository;
  let dynamicRuleService: DynamicRuleService;

  beforeEach(() => {
    mockDb = new MockD1Database();
    ruleRepository = new RuleRepository(mockDb as unknown as D1Database);
    dynamicRuleService = new DynamicRuleService(mockDb as unknown as D1Database, ruleRepository);
  });


  /**
   * **Feature: email-filter-management, Property 9: 动态规则自动生成**
   * *For any* 在配置的时间窗口内收到超过阈值数量的相同主题邮件，系统应自动创建一条动态名单规则。
   * **Validates: Requirements 6.1**
   */
  describe('Property 9: 动态规则自动生成', () => {
    it('当相同主题邮件数量达到阈值时应自动创建动态规则', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          fc.integer({ min: 2, max: 20 }),
          async (subject, threshold) => {
            // Clear database before each test
            mockDb.clear();
            
            // Set up config with the threshold
            await dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              expirationHours: 48,
            });
            
            // Track subjects up to threshold - 1 (should not create rule yet)
            for (let i = 0; i < threshold - 1; i++) {
              const result = await dynamicRuleService.trackSubject(subject);
              expect(result).toBeNull();
            }
            
            // Verify no dynamic rule exists yet
            const rulesBefore = await ruleRepository.findByCategory('dynamic');
            const matchingBefore = rulesBefore.filter(r => r.pattern === subject);
            expect(matchingBefore.length).toBe(0);
            
            // Track one more subject to reach threshold
            const createdRule = await dynamicRuleService.trackSubject(subject);
            
            // Should have created a dynamic rule
            expect(createdRule).not.toBeNull();
            expect(createdRule!.category).toBe('dynamic');
            expect(createdRule!.matchType).toBe('subject');
            expect(createdRule!.pattern).toBe(subject);
            expect(createdRule!.enabled).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('当动态规则功能禁用时不应创建规则', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          fc.integer({ min: 2, max: 10 }),
          async (subject, threshold) => {
            // Clear database before each test
            mockDb.clear();
            
            // Disable dynamic rules
            await dynamicRuleService.updateConfig({
              enabled: false,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              expirationHours: 48,
            });
            
            // Track subjects exceeding threshold
            for (let i = 0; i < threshold + 5; i++) {
              const result = await dynamicRuleService.trackSubject(subject);
              expect(result).toBeNull();
            }
            
            // Verify no dynamic rule was created
            const rules = await ruleRepository.findByCategory('dynamic');
            expect(rules.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('已存在相同主题的动态规则时不应重复创建', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          async (subject) => {
            // Clear database before each test
            mockDb.clear();
            
            // Set up config with low threshold
            await dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 3,
              expirationHours: 48,
            });
            
            // Track subjects to create first rule
            for (let i = 0; i < 3; i++) {
              await dynamicRuleService.trackSubject(subject);
            }
            
            // Get the created rule
            const rulesAfterFirst = await ruleRepository.findByCategory('dynamic');
            const matchingRules = rulesAfterFirst.filter(r => r.pattern === subject);
            expect(matchingRules.length).toBe(1);
            const firstRuleId = matchingRules[0].id;
            
            // Track more subjects (should return existing rule, not create new)
            for (let i = 0; i < 5; i++) {
              const result = await dynamicRuleService.trackSubject(subject);
              // Should return the existing rule
              if (result) {
                expect(result.id).toBe(firstRuleId);
              }
            }
            
            // Verify still only one rule exists
            const rulesAfterMore = await ruleRepository.findByCategory('dynamic');
            const matchingAfter = rulesAfterMore.filter(r => r.pattern === subject);
            expect(matchingAfter.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 10: 动态规则过期清理**
   * *For any* 动态规则，当其lastHitAt超过配置的过期时间后，该规则应被自动删除。
   * **Validates: Requirements 6.2**
   */
  describe('Property 10: 动态规则过期清理', () => {
    it('超过过期时间未命中的动态规则应被删除', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          fc.integer({ min: 1, max: 48 }),
          async (subject, expirationHours) => {
            // Clear database before each test
            mockDb.clear();
            
            // Set up config
            await dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: expirationHours,
            });
            
            // Create a dynamic rule manually with old lastHitAt
            const oldTime = new Date(Date.now() - (expirationHours + 1) * 60 * 60 * 1000);
            const rule = await ruleRepository.create({
              category: 'dynamic',
              matchType: 'subject',
              matchMode: 'contains',
              pattern: subject,
              enabled: true,
            });
            
            // Set lastHitAt to old time (simulating expired rule)
            const rules = mockDb.getRules();
            const ruleData = rules.get(rule.id);
            if (ruleData) {
              ruleData.lastHitAt = oldTime;
              rules.set(rule.id, ruleData);
            }
            
            // Run cleanup
            const deletedIds = await dynamicRuleService.cleanupExpiredRules();
            
            // Verify rule was deleted
            expect(deletedIds).toContain(rule.id);
            
            // Verify rule no longer exists
            const ruleAfter = await ruleRepository.findById(rule.id);
            expect(ruleAfter).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('未过期的动态规则不应被删除', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          fc.integer({ min: 24, max: 72 }),
          async (subject, expirationHours) => {
            // Clear database before each test
            mockDb.clear();
            
            // Set up config
            await dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: expirationHours,
            });
            
            // Create a dynamic rule with recent lastHitAt
            const recentTime = new Date(Date.now() - (expirationHours - 1) * 60 * 60 * 1000);
            const rule = await ruleRepository.create({
              category: 'dynamic',
              matchType: 'subject',
              matchMode: 'contains',
              pattern: subject,
              enabled: true,
            });
            
            // Set lastHitAt to recent time (not expired)
            const rules = mockDb.getRules();
            const ruleData = rules.get(rule.id);
            if (ruleData) {
              ruleData.lastHitAt = recentTime;
              rules.set(rule.id, ruleData);
            }
            
            // Run cleanup
            const deletedIds = await dynamicRuleService.cleanupExpiredRules();
            
            // Verify rule was NOT deleted
            expect(deletedIds).not.toContain(rule.id);
            
            // Verify rule still exists
            const ruleAfter = await ruleRepository.findById(rule.id);
            expect(ruleAfter).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('没有lastHitAt的动态规则应被视为过期', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          async (subject) => {
            // Clear database before each test
            mockDb.clear();
            
            // Set up config with short expiration
            await dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 1,
            });
            
            // Create a dynamic rule without lastHitAt
            const rule = await ruleRepository.create({
              category: 'dynamic',
              matchType: 'subject',
              matchMode: 'contains',
              pattern: subject,
              enabled: true,
            });
            
            // Ensure lastHitAt is not set
            const rules = mockDb.getRules();
            const ruleData = rules.get(rule.id);
            if (ruleData) {
              ruleData.lastHitAt = undefined;
              rules.set(rule.id, ruleData);
            }
            
            // Run cleanup
            const deletedIds = await dynamicRuleService.cleanupExpiredRules();
            
            // Verify rule was deleted (no lastHitAt means expired)
            expect(deletedIds).toContain(rule.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 11: 动态规则时间戳更新**
   * *For any* 被命中的动态规则，其lastHitAt字段应更新为当前时间。
   * **Validates: Requirements 6.3, 6.4**
   */
  describe('Property 11: 动态规则时间戳更新', () => {
    it('调用updateRuleHitTimestamp应更新lastHitAt', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          async (subject) => {
            // Clear database before each test
            mockDb.clear();
            
            // Create a dynamic rule
            const rule = await ruleRepository.create({
              category: 'dynamic',
              matchType: 'subject',
              matchMode: 'contains',
              pattern: subject,
              enabled: true,
            });
            
            // Get initial state
            const ruleBefore = await ruleRepository.findById(rule.id);
            const lastHitBefore = ruleBefore?.lastHitAt;
            
            // Wait a tiny bit to ensure time difference
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Update hit timestamp
            await dynamicRuleService.updateRuleHitTimestamp(rule.id);
            
            // Verify lastHitAt was updated
            const ruleAfter = await ruleRepository.findById(rule.id);
            expect(ruleAfter).not.toBeNull();
            expect(ruleAfter!.lastHitAt).toBeDefined();
            
            // If there was a previous lastHitAt, the new one should be later or equal
            if (lastHitBefore) {
              expect(ruleAfter!.lastHitAt!.getTime()).toBeGreaterThanOrEqual(lastHitBefore.getTime());
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('当已存在动态规则时trackSubject应更新lastHitAt', async () => {
      await fc.assert(
        fc.asyncProperty(
          subjectArbitrary,
          async (subject) => {
            // Clear database before each test
            mockDb.clear();
            
            // Set up config
            await dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 48,
            });
            
            // Create initial dynamic rule by tracking
            await dynamicRuleService.trackSubject(subject);
            await dynamicRuleService.trackSubject(subject);
            
            // Get the created rule
            const rules = await ruleRepository.findByCategory('dynamic');
            const matchingRule = rules.find(r => r.pattern === subject);
            expect(matchingRule).toBeDefined();
            
            const lastHitBefore = matchingRule!.lastHitAt;
            
            // Wait a tiny bit
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Track again (should update lastHitAt)
            await dynamicRuleService.trackSubject(subject);
            
            // Verify lastHitAt was updated
            const ruleAfter = await ruleRepository.findById(matchingRule!.id);
            expect(ruleAfter).not.toBeNull();
            expect(ruleAfter!.lastHitAt).toBeDefined();
            
            if (lastHitBefore) {
              expect(ruleAfter!.lastHitAt!.getTime()).toBeGreaterThanOrEqual(lastHitBefore.getTime());
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Configuration Management', () => {
    it('应正确保存和读取配置', async () => {
      await fc.assert(
        fc.asyncProperty(
          dynamicConfigArbitrary,
          async (config) => {
            // Clear database before each test
            mockDb.clear();
            
            // Update config
            const savedConfig = await dynamicRuleService.updateConfig(config);
            
            // Verify saved config matches input
            expect(savedConfig.enabled).toBe(config.enabled);
            expect(savedConfig.timeWindowMinutes).toBe(config.timeWindowMinutes);
            expect(savedConfig.thresholdCount).toBe(config.thresholdCount);
            expect(savedConfig.expirationHours).toBe(config.expirationHours);
            
            // Read config back
            const readConfig = await dynamicRuleService.getConfig();
            
            // Verify read config matches saved
            expect(readConfig.enabled).toBe(config.enabled);
            expect(readConfig.timeWindowMinutes).toBe(config.timeWindowMinutes);
            expect(readConfig.thresholdCount).toBe(config.thresholdCount);
            expect(readConfig.expirationHours).toBe(config.expirationHours);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('未设置配置时应返回默认值', async () => {
      // Clear database
      mockDb.clear();
      
      // Get config without setting anything
      const config = await dynamicRuleService.getConfig();
      
      // Should return defaults
      expect(config.enabled).toBe(DEFAULT_DYNAMIC_CONFIG.enabled);
      expect(config.timeWindowMinutes).toBe(DEFAULT_DYNAMIC_CONFIG.timeWindowMinutes);
      expect(config.thresholdCount).toBe(DEFAULT_DYNAMIC_CONFIG.thresholdCount);
      expect(config.expirationHours).toBe(DEFAULT_DYNAMIC_CONFIG.expirationHours);
    });
  });
});
