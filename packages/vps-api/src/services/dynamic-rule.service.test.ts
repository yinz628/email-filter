import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { DynamicConfig, FilterRule, CreateRuleDTO, RuleCategory, MatchType, MatchMode } from '@email-filter/shared';
import { DEFAULT_DYNAMIC_CONFIG } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitrary for generating valid email subjects
const subjectArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0 && !s.includes('\n'));

// Arbitrary for generating dynamic config
const dynamicConfigArb: fc.Arbitrary<DynamicConfig> = fc.record({
  enabled: fc.boolean(),
  timeWindowMinutes: fc.integer({ min: 1, max: 1440 }), // 1 min to 24 hours
  thresholdCount: fc.integer({ min: 1, max: 100 }),
  expirationHours: fc.integer({ min: 1, max: 168 }), // 1 hour to 1 week
});

/**
 * Test-specific RuleRepository that works with sql.js
 */
class TestRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): FilterRule {
    // Schema: id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at
    return {
      id: row[0] as string,
      // row[1] is worker_id (skipped for FilterRule)
      category: row[2] as RuleCategory,
      matchType: row[3] as MatchType,
      matchMode: row[4] as MatchMode,
      pattern: row[5] as string,
      enabled: row[6] === 1,
      createdAt: new Date(row[7] as string),
      updatedAt: new Date(row[8] as string),
      lastHitAt: row[9] ? new Date(row[9] as string) : undefined,
    };
  }

  create(dto: CreateRuleDTO): FilterRule {
    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    this.db.run(
      `INSERT INTO filter_rules (id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.category, dto.matchType, dto.matchMode, dto.pattern, enabled ? 1 : 0, now, now]
    );

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

  findAll(options?: { category?: RuleCategory }): FilterRule[] {
    let query = 'SELECT * FROM filter_rules';
    const params: string[] = [];
    
    if (options?.category) {
      query += ' WHERE category = ?';
      params.push(options.category);
    }
    query += ' ORDER BY created_at DESC';
    
    const result = this.db.exec(query, params);
    if (result.length === 0) {
      return [];
    }
    return result[0].values.map((row) => this.rowToRule(row));
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM rule_stats WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM filter_rules WHERE id = ?', [id]);
    return true;
  }

  updateLastHit(id: string): void {
    const now = new Date().toISOString();
    this.db.run('UPDATE filter_rules SET last_hit_at = ? WHERE id = ?', [now, id]);
  }
}

/**
 * Test-specific DynamicRuleService that works with sql.js
 */
class TestDynamicRuleService {
  constructor(
    private db: SqlJsDatabase,
    private ruleRepository: TestRuleRepository
  ) {}

  getConfig(): DynamicConfig {
    const result = this.db.exec('SELECT key, value FROM dynamic_config');
    
    if (result.length === 0 || result[0].values.length === 0) {
      return { ...DEFAULT_DYNAMIC_CONFIG };
    }

    const config: DynamicConfig = { ...DEFAULT_DYNAMIC_CONFIG };
    for (const row of result[0].values) {
      const key = row[0] as string;
      const value = row[1] as string;
      switch (key) {
        case 'enabled':
          config.enabled = value === 'true';
          break;
        case 'timeWindowMinutes':
          config.timeWindowMinutes = parseInt(value, 10);
          break;
        case 'thresholdCount':
          config.thresholdCount = parseInt(value, 10);
          break;
        case 'expirationHours':
          config.expirationHours = parseInt(value, 10);
          break;
      }
    }

    return config;
  }

  updateConfig(config: Partial<DynamicConfig>): DynamicConfig {
    const currentConfig = this.getConfig();
    const newConfig = { ...currentConfig, ...config };

    const entries = [
      ['enabled', String(newConfig.enabled)],
      ['timeWindowMinutes', String(newConfig.timeWindowMinutes)],
      ['thresholdCount', String(newConfig.thresholdCount)],
      ['expirationHours', String(newConfig.expirationHours)],
    ];

    for (const [key, value] of entries) {
      this.db.run(
        `INSERT INTO dynamic_config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, value]
      );
    }

    return newConfig;
  }

  private hashSubject(subject: string): string {
    const normalized = subject.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }


  trackSubject(subject: string, receivedAt: Date = new Date()): FilterRule | null {
    const config = this.getConfig();
    
    if (!config.enabled) {
      return null;
    }

    const subjectHash = this.hashSubject(subject);
    const receivedAtStr = receivedAt.toISOString();

    this.db.run(
      `INSERT INTO email_subject_tracker (worker_id, subject_hash, subject, received_at)
       VALUES (NULL, ?, ?, ?)`,
      [subjectHash, subject, receivedAtStr]
    );

    const windowStart = new Date(receivedAt.getTime() - config.timeWindowMinutes * 60 * 1000);
    const windowStartStr = windowStart.toISOString();

    const countResult = this.db.exec(
      `SELECT COUNT(*) as count FROM email_subject_tracker
       WHERE subject_hash = ? AND received_at >= ?`,
      [subjectHash, windowStartStr]
    );
    const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    if (count >= config.thresholdCount) {
      const existingRule = this.findDynamicRuleBySubject(subject);
      if (existingRule) {
        this.ruleRepository.updateLastHit(existingRule.id);
        return existingRule;
      }

      const ruleDto: CreateRuleDTO = {
        category: 'dynamic',
        matchType: 'subject',
        matchMode: 'contains',
        pattern: subject,
        enabled: true,
      };

      const newRule = this.ruleRepository.create(ruleDto);
      this.cleanupSubjectTracker(subjectHash, windowStart);

      return newRule;
    }

    return null;
  }

  private findDynamicRuleBySubject(subject: string): FilterRule | null {
    const result = this.db.exec(
      `SELECT * FROM filter_rules 
       WHERE category = 'dynamic' AND match_type = 'subject' AND pattern = ?
       LIMIT 1`,
      [subject]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    // Schema: id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at
    return {
      id: row[0] as string,
      // row[1] is worker_id (skipped)
      category: row[2] as 'dynamic',
      matchType: row[3] as MatchType,
      matchMode: row[4] as MatchMode,
      pattern: row[5] as string,
      enabled: row[6] === 1,
      createdAt: new Date(row[7] as string),
      updatedAt: new Date(row[8] as string),
      lastHitAt: row[9] ? new Date(row[9] as string) : undefined,
    };
  }

  private cleanupSubjectTracker(subjectHash: string, olderThan: Date): void {
    this.db.run(
      `DELETE FROM email_subject_tracker
       WHERE subject_hash = ? AND received_at < ?`,
      [subjectHash, olderThan.toISOString()]
    );
  }

  findExpiredDynamicRules(expirationHours: number): FilterRule[] {
    const cutoffTime = new Date(Date.now() - expirationHours * 60 * 60 * 1000);
    const cutoffTimeStr = cutoffTime.toISOString();

    const result = this.db.exec(
      `SELECT * FROM filter_rules 
       WHERE category = 'dynamic' 
       AND (last_hit_at IS NULL OR last_hit_at < ?)
       AND created_at < ?`,
      [cutoffTimeStr, cutoffTimeStr]
    );

    if (result.length === 0) {
      return [];
    }

    // Schema: id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at
    return result[0].values.map(row => ({
      id: row[0] as string,
      // row[1] is worker_id (skipped)
      category: row[2] as 'dynamic',
      matchType: row[3] as MatchType,
      matchMode: row[4] as MatchMode,
      pattern: row[5] as string,
      enabled: row[6] === 1,
      createdAt: new Date(row[7] as string),
      updatedAt: new Date(row[8] as string),
      lastHitAt: row[9] ? new Date(row[9] as string) : undefined,
    }));
  }


  cleanupExpiredRules(): string[] {
    const config = this.getConfig();
    
    if (!config.enabled) {
      return [];
    }

    const expiredRules = this.findExpiredDynamicRules(config.expirationHours);
    const deletedIds: string[] = [];

    for (const rule of expiredRules) {
      this.ruleRepository.delete(rule.id);
      deletedIds.push(rule.id);
    }

    return deletedIds;
  }

  updateRuleHitTimestamp(ruleId: string): void {
    this.ruleRepository.updateLastHit(ruleId);
  }

  getDynamicRule(ruleId: string): FilterRule | null {
    const rule = this.ruleRepository.findById(ruleId);
    if (rule && rule.category === 'dynamic') {
      return rule;
    }
    return null;
  }

  getAllDynamicRules(): FilterRule[] {
    return this.ruleRepository.findAll({ category: 'dynamic' });
  }
}

describe('DynamicRuleService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let ruleRepository: TestRuleRepository;
  let dynamicRuleService: TestDynamicRuleService;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();
    
    const schemaPath = join(__dirname, '..', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);
    
    ruleRepository = new TestRuleRepository(db);
    dynamicRuleService = new TestDynamicRuleService(db, ruleRepository);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('Config Management', () => {
    it('should return default config when no config is set', () => {
      const config = dynamicRuleService.getConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.timeWindowMinutes).toBe(60);
      expect(config.thresholdCount).toBe(50);
      expect(config.expirationHours).toBe(48);
    });

    it('should update and retrieve config correctly', () => {
      fc.assert(
        fc.property(
          dynamicConfigArb,
          (newConfig) => {
            dynamicRuleService.updateConfig(newConfig);
            const retrieved = dynamicRuleService.getConfig();
            
            expect(retrieved.enabled).toBe(newConfig.enabled);
            expect(retrieved.timeWindowMinutes).toBe(newConfig.timeWindowMinutes);
            expect(retrieved.thresholdCount).toBe(newConfig.thresholdCount);
            expect(retrieved.expirationHours).toBe(newConfig.expirationHours);
          }
        ),
        { numRuns: 50 }
      );
    });
  });


  /**
   * **Feature: vps-email-filter, Property 9: 动态规则自动创建**
   * **Validates: Requirements 6.1**
   * 
   * For any email subject that appears more than threshold times within the time window,
   * the system should automatically create a dynamic filter rule.
   */
  describe('Property 9: 动态规则自动创建', () => {
    it('should create dynamic rule when threshold is exceeded', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 10 }),
          (subject, threshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Track subject (threshold - 1) times - should not create rule yet
            for (let i = 0; i < threshold - 1; i++) {
              const result = dynamicRuleService.trackSubject(subject, now);
              expect(result).toBeNull();
            }
            
            // Track one more time - should create rule
            const finalResult = dynamicRuleService.trackSubject(subject, now);
            
            expect(finalResult).not.toBeNull();
            expect(finalResult?.category).toBe('dynamic');
            expect(finalResult?.matchType).toBe('subject');
            expect(finalResult?.pattern).toBe(subject);
            expect(finalResult?.enabled).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not create duplicate dynamic rules for same subject', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            dynamicRuleService.trackSubject(subject, now);
            const firstRule = dynamicRuleService.trackSubject(subject, now);
            
            expect(firstRule).not.toBeNull();
            
            const secondResult = dynamicRuleService.trackSubject(subject, now);
            
            expect(secondResult).not.toBeNull();
            expect(secondResult?.id).toBe(firstRule?.id);
            
            const allDynamicRules = dynamicRuleService.getAllDynamicRules();
            expect(allDynamicRules.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: vps-email-filter, Property 10: 动态规则过期清理**
   * **Validates: Requirements 6.2**
   * 
   * For any dynamic rule that has not been hit within the expiration period,
   * the cleanup process should delete the expired rule.
   */
  describe('Property 10: 动态规则过期清理', () => {
    it('should delete expired dynamic rules during cleanup', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 1, max: 24 }),
          (subject, expirationHours) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours,
            });
            
            // Create an expired dynamic rule directly
            const expiredTime = new Date(Date.now() - (expirationHours + 1) * 60 * 60 * 1000);
            const expiredTimeStr = expiredTime.toISOString();
            
            const ruleId = uuidv4();
            db.run(
              `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at)
               VALUES (?, 'dynamic', 'subject', 'contains', ?, 1, ?, ?, ?)`,
              [ruleId, subject, expiredTimeStr, expiredTimeStr, expiredTimeStr]
            );
            
            db.run(
              `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
               VALUES (?, 0, 0, 0, ?)`,
              [ruleId, expiredTimeStr]
            );
            
            const beforeCleanup = dynamicRuleService.getDynamicRule(ruleId);
            expect(beforeCleanup).not.toBeNull();
            
            const deletedIds = dynamicRuleService.cleanupExpiredRules();
            
            expect(deletedIds).toContain(ruleId);
            const afterCleanup = dynamicRuleService.getDynamicRule(ruleId);
            expect(afterCleanup).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not delete non-expired dynamic rules during cleanup', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 24, max: 168 }),
          (subject, expirationHours) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours,
            });
            
            // Create a non-expired dynamic rule
            const recentTime = new Date();
            const recentTimeStr = recentTime.toISOString();
            
            const ruleId = uuidv4();
            db.run(
              `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at)
               VALUES (?, 'dynamic', 'subject', 'contains', ?, 1, ?, ?, ?)`,
              [ruleId, subject, recentTimeStr, recentTimeStr, recentTimeStr]
            );
            
            db.run(
              `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
               VALUES (?, 0, 0, 0, ?)`,
              [ruleId, recentTimeStr]
            );
            
            const deletedIds = dynamicRuleService.cleanupExpiredRules();
            
            expect(deletedIds).not.toContain(ruleId);
            const afterCleanup = dynamicRuleService.getDynamicRule(ruleId);
            expect(afterCleanup).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: vps-email-filter, Property 11: 动态规则时间戳更新**
   * **Validates: Requirements 6.3**
   * 
   * For any dynamic rule that is matched,
   * the system should update the lastHitAt timestamp to the current time.
   */
  describe('Property 11: 动态规则时间戳更新', () => {
    it('should update lastHitAt when rule is hit', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 48,
            });
            
            // Create a dynamic rule with old lastHitAt
            const oldTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const oldTimeStr = oldTime.toISOString();
            
            const ruleId = uuidv4();
            db.run(
              `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at)
               VALUES (?, 'dynamic', 'subject', 'contains', ?, 1, ?, ?, ?)`,
              [ruleId, subject, oldTimeStr, oldTimeStr, oldTimeStr]
            );
            
            db.run(
              `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
               VALUES (?, 0, 0, 0, ?)`,
              [ruleId, oldTimeStr]
            );
            
            const beforeUpdate = dynamicRuleService.getDynamicRule(ruleId);
            expect(beforeUpdate?.lastHitAt?.getTime()).toBe(oldTime.getTime());
            
            const beforeUpdateTime = Date.now();
            
            dynamicRuleService.updateRuleHitTimestamp(ruleId);
            
            const afterUpdateTime = Date.now();
            
            const afterUpdate = dynamicRuleService.getDynamicRule(ruleId);
            
            expect(afterUpdate?.lastHitAt).not.toBeNull();
            const lastHitTime = afterUpdate?.lastHitAt?.getTime() || 0;
            expect(lastHitTime).toBeGreaterThanOrEqual(beforeUpdateTime);
            expect(lastHitTime).toBeLessThanOrEqual(afterUpdateTime);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update lastHitAt when existing rule is matched via trackSubject', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            dynamicRuleService.trackSubject(subject, now);
            const createdRule = dynamicRuleService.trackSubject(subject, now);
            
            expect(createdRule).not.toBeNull();
            
            const laterTime = new Date(now.getTime() + 1000);
            const updatedRule = dynamicRuleService.trackSubject(subject, laterTime);
            
            expect(updatedRule).not.toBeNull();
            expect(updatedRule?.id).toBe(createdRule?.id);
            
            const ruleAfter = dynamicRuleService.getDynamicRule(createdRule!.id);
            expect(ruleAfter?.lastHitAt?.getTime()).toBeGreaterThanOrEqual(now.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: vps-email-filter, Property 12: 动态规则禁用**
   * **Validates: Requirements 6.4**
   * 
   * For any configuration where dynamic rules are disabled,
   * the system should not create new dynamic rules regardless of email count.
   */
  describe('Property 12: 动态规则禁用', () => {
    it('should not create dynamic rules when feature is disabled', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 10, max: 100 }),
          (subject, emailCount) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: false,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            for (let i = 0; i < emailCount; i++) {
              const result = dynamicRuleService.trackSubject(subject, now);
              expect(result).toBeNull();
            }
            
            const allDynamicRules = dynamicRuleService.getAllDynamicRules();
            expect(allDynamicRules.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not cleanup rules when feature is disabled', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            // First create an expired rule while enabled
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 1,
            });
            
            const expiredTime = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const expiredTimeStr = expiredTime.toISOString();
            
            const ruleId = uuidv4();
            db.run(
              `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at)
               VALUES (?, 'dynamic', 'subject', 'contains', ?, 1, ?, ?, ?)`,
              [ruleId, subject, expiredTimeStr, expiredTimeStr, expiredTimeStr]
            );
            
            db.run(
              `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
               VALUES (?, 0, 0, 0, ?)`,
              [ruleId, expiredTimeStr]
            );
            
            // Now disable the feature
            dynamicRuleService.updateConfig({
              enabled: false,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 1,
            });
            
            const deletedIds = dynamicRuleService.cleanupExpiredRules();
            
            expect(deletedIds.length).toBe(0);
            
            const ruleAfter = dynamicRuleService.getDynamicRule(ruleId);
            expect(ruleAfter).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect enabled state changes', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            // Start with feature disabled
            dynamicRuleService.updateConfig({
              enabled: false,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            dynamicRuleService.trackSubject(subject, now);
            dynamicRuleService.trackSubject(subject, now);
            
            let rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(0);
            
            // Enable the feature
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              expirationHours: 48,
            });
            
            // Track subject again - previous tracks don't count since they weren't recorded
            dynamicRuleService.trackSubject(subject, now);
            dynamicRuleService.trackSubject(subject, now);
            
            rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
