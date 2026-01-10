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

/**
 * Result of tracking a subject with metrics
 * Used for synchronous dynamic rule creation in Phase 1
 * 
 * Requirements: 4.1, 4.2 - Detection metrics
 */
interface DynamicRuleCreationResult {
  /** The created rule, or null if no rule was created */
  rule: FilterRule | null;
  /** Time in ms from first email to rule creation */
  detectionLatencyMs?: number;
  /** Number of emails forwarded before blocking started */
  emailsForwardedBeforeBlock?: number;
}

// Arbitrary for generating valid email subjects
const subjectArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0 && !s.includes('\n'));

// Arbitrary for generating dynamic config
const dynamicConfigArb: fc.Arbitrary<DynamicConfig> = fc.record({
  enabled: fc.boolean(),
  timeWindowMinutes: fc.integer({ min: 1, max: 1440 }), // 1 min to 24 hours
  thresholdCount: fc.integer({ min: 1, max: 100 }),
  timeSpanThresholdMinutes: fc.integer({ min: 1, max: 30 }), // 1 min to 30 minutes
  expirationHours: fc.integer({ min: 1, max: 168 }), // 1 hour to 1 week
  lastHitThresholdHours: fc.integer({ min: 1, max: 168 }), // 1 hour to 1 week
});

/**
 * Test-specific RuleRepository that works with sql.js
 */
class TestRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): FilterRule {
    // Schema: id, worker_id, category, match_type, match_mode, pattern, tags, enabled, created_at, updated_at, last_hit_at
    return {
      id: row[0] as string,
      // row[1] is worker_id (skipped for FilterRule)
      category: row[2] as RuleCategory,
      matchType: row[3] as MatchType,
      matchMode: row[4] as MatchMode,
      pattern: row[5] as string,
      // row[6] is tags (skipped for FilterRule)
      enabled: row[7] === 1,
      createdAt: new Date(row[8] as string),
      updatedAt: new Date(row[9] as string),
      lastHitAt: row[10] ? new Date(row[10] as string) : undefined,
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
        case 'timeSpanThresholdMinutes':
          config.timeSpanThresholdMinutes = parseInt(value, 10);
          break;
        case 'expirationHours':
          config.expirationHours = parseInt(value, 10);
          break;
        case 'lastHitThresholdHours':
          config.lastHitThresholdHours = parseInt(value, 10);
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
      ['timeSpanThresholdMinutes', String(newConfig.timeSpanThresholdMinutes)],
      ['expirationHours', String(newConfig.expirationHours)],
      ['lastHitThresholdHours', String(newConfig.lastHitThresholdHours)],
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

  /**
   * Check if an email should be tracked for dynamic rule detection
   * 
   * Requirements 3.1, 3.2, 3.3, 3.4:
   * - Only track emails that are forwarded by default (no rule matched)
   * - Do NOT track emails that match whitelist, blacklist, or existing dynamic rules
   * 
   * @param filterResult - The result from the filter engine
   * @returns true if the email should be tracked, false otherwise
   */
  shouldTrack(filterResult: { matchedCategory?: RuleCategory }): boolean {
    // Only track emails that are forwarded by default (no rule matched)
    // matchedCategory is undefined when no rule matched
    return filterResult.matchedCategory === undefined;
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


  /**
   * Track an email subject for dynamic rule detection
   * 
   * Implements "count first, then time span" detection logic:
   * 1. First count emails with the same subject within the time window
   * 2. When count reaches threshold, calculate time span between first and Nth email
   * 3. If time span <= threshold, create rule
   * 4. If time span > threshold, don't create rule but continue tracking
   */
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

    // First count the number of emails with the same subject
    const countResult = this.db.exec(
      `SELECT COUNT(*) as count FROM email_subject_tracker
       WHERE subject_hash = ? AND received_at >= ?`,
      [subjectHash, windowStartStr]
    );
    const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    // When count reaches threshold, calculate time span
    if (count >= config.thresholdCount) {
      // Get the first and Nth (threshold) email timestamps within the window
      const timestampsResult = this.db.exec(
        `SELECT received_at FROM email_subject_tracker
         WHERE subject_hash = ? AND received_at >= ?
         ORDER BY received_at ASC
         LIMIT ?`,
        [subjectHash, windowStartStr, config.thresholdCount]
      );
      
      if (timestampsResult.length > 0 && timestampsResult[0].values.length >= config.thresholdCount) {
        const timestamps = timestampsResult[0].values;
        const firstEmailTime = new Date(timestamps[0][0] as string);
        const nthEmailTime = new Date(timestamps[config.thresholdCount - 1][0] as string);
        
        // Calculate time span between first and Nth email
        const timeSpanMinutes = (nthEmailTime.getTime() - firstEmailTime.getTime()) / (60 * 1000);
        
        // Create rule only if time span <= threshold
        if (timeSpanMinutes <= config.timeSpanThresholdMinutes) {
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
        // Time span exceeds threshold - continue tracking but don't create rule
      }
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

  /**
   * Track an email subject for dynamic rule detection with metrics
   * 
   * This is the synchronous version used in Phase 1 processing.
   * Returns detection metrics along with the created rule.
   * 
   * Requirements 1.1, 1.3, 4.1, 4.2:
   * - Synchronous rule creation affects current email
   * - Returns detection latency and forwarded email count
   */
  trackSubjectWithMetrics(subject: string, receivedAt: Date = new Date()): DynamicRuleCreationResult {
    const config = this.getConfig();
    
    if (!config.enabled) {
      return { rule: null };
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

    // First count the number of emails with the same subject
    const countResult = this.db.exec(
      `SELECT COUNT(*) as count FROM email_subject_tracker
       WHERE subject_hash = ? AND received_at >= ?`,
      [subjectHash, windowStartStr]
    );
    const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    // When count reaches threshold, calculate time span
    if (count >= config.thresholdCount) {
      // Get the first and Nth (threshold) email timestamps within the window
      const timestampsResult = this.db.exec(
        `SELECT received_at FROM email_subject_tracker
         WHERE subject_hash = ? AND received_at >= ?
         ORDER BY received_at ASC
         LIMIT ?`,
        [subjectHash, windowStartStr, config.thresholdCount]
      );
      
      if (timestampsResult.length > 0 && timestampsResult[0].values.length >= config.thresholdCount) {
        const timestamps = timestampsResult[0].values;
        const firstEmailTime = new Date(timestamps[0][0] as string);
        const nthEmailTime = new Date(timestamps[config.thresholdCount - 1][0] as string);
        
        // Calculate time span between first and Nth email
        const timeSpanMinutes = (nthEmailTime.getTime() - firstEmailTime.getTime()) / (60 * 1000);
        
        // Create rule only if time span <= threshold
        if (timeSpanMinutes <= config.timeSpanThresholdMinutes) {
          const existingRule = this.findDynamicRuleBySubject(subject);
          if (existingRule) {
            this.ruleRepository.updateLastHit(existingRule.id);
            return {
              rule: existingRule,
              detectionLatencyMs: 0,
              emailsForwardedBeforeBlock: 0,
            };
          }

          // Calculate detection metrics - Requirements 4.1, 4.2
          const detectionLatencyMs = receivedAt.getTime() - firstEmailTime.getTime();
          // Emails forwarded = count - 1 (current email will be blocked)
          const emailsForwardedBeforeBlock = count - 1;

          const ruleDto: CreateRuleDTO = {
            category: 'dynamic',
            matchType: 'subject',
            matchMode: 'contains',
            pattern: subject,
            enabled: true,
          };

          const newRule = this.ruleRepository.create(ruleDto);
          this.cleanupSubjectTracker(subjectHash, windowStart);

          return {
            rule: newRule,
            detectionLatencyMs,
            emailsForwardedBeforeBlock,
          };
        }
        // Time span exceeds threshold - continue tracking but don't create rule
      }
    }

    return { rule: null };
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
      expect(config.timeWindowMinutes).toBe(30);
      expect(config.thresholdCount).toBe(30);
      expect(config.timeSpanThresholdMinutes).toBe(3);
      expect(config.expirationHours).toBe(48);
      expect(config.lastHitThresholdHours).toBe(72);
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
            expect(retrieved.timeSpanThresholdMinutes).toBe(newConfig.timeSpanThresholdMinutes);
            expect(retrieved.expirationHours).toBe(newConfig.expirationHours);
            expect(retrieved.lastHitThresholdHours).toBe(newConfig.lastHitThresholdHours);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * **Feature: dynamic-rule-optimization, Property 5: Configuration Round-Trip**
     * **Validates: Requirements 4.1**
     * 
     * For any valid dynamic configuration including the time span threshold,
     * saving and then loading the configuration should return the same values.
     */
    it('Property 5: Configuration round-trip preserves all values including timeSpanThresholdMinutes', () => {
      fc.assert(
        fc.property(
          dynamicConfigArb,
          (originalConfig) => {
            // Clear existing config
            db.run('DELETE FROM dynamic_config');
            
            // Save the configuration
            dynamicRuleService.updateConfig(originalConfig);
            
            // Load the configuration
            const loadedConfig = dynamicRuleService.getConfig();
            
            // Verify all fields match exactly
            expect(loadedConfig.enabled).toBe(originalConfig.enabled);
            expect(loadedConfig.timeWindowMinutes).toBe(originalConfig.timeWindowMinutes);
            expect(loadedConfig.thresholdCount).toBe(originalConfig.thresholdCount);
            expect(loadedConfig.timeSpanThresholdMinutes).toBe(originalConfig.timeSpanThresholdMinutes);
            expect(loadedConfig.expirationHours).toBe(originalConfig.expirationHours);
            expect(loadedConfig.lastHitThresholdHours).toBe(originalConfig.lastHitThresholdHours);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: dynamic-rule-optimization, Property 1: Count-First Detection Logic**
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   * 
   * For any sequence of emails with the same normalized subject tracked within a time window,
   * the system should correctly count all emails and only trigger time span calculation
   * when the count reaches the threshold.
   */
  describe('Property 1: Count-First Detection Logic', () => {
    it('should count emails first and only check time span when threshold is reached', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 3, max: 10 }), // threshold
          fc.integer({ min: 1, max: 2 }),  // timeSpanThresholdMinutes
          (subject, threshold, timeSpanThreshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: timeSpanThreshold,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Track subject (threshold - 1) times - should not create rule yet
            // because count hasn't reached threshold
            for (let i = 0; i < threshold - 1; i++) {
              const result = dynamicRuleService.trackSubject(subject, now);
              expect(result).toBeNull();
            }
            
            // Verify no rule was created before threshold
            const rulesBeforeThreshold = dynamicRuleService.getAllDynamicRules();
            expect(rulesBeforeThreshold.length).toBe(0);
            
            // Track one more time (within time span threshold) - should create rule
            const finalResult = dynamicRuleService.trackSubject(subject, now);
            
            // Rule should be created because:
            // 1. Count reached threshold
            // 2. Time span is 0 (all emails at same time) which is <= timeSpanThreshold
            expect(finalResult).not.toBeNull();
            expect(finalResult?.category).toBe('dynamic');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only consider emails within the configured time window', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 5 }), // threshold
          fc.integer({ min: 5, max: 30 }), // timeWindowMinutes
          (subject, threshold, timeWindowMinutes) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: 30, // Large enough to not block rule creation
              expirationHours: 48,
            });
            
            const now = new Date();
            // Time outside the window
            const outsideWindow = new Date(now.getTime() - (timeWindowMinutes + 5) * 60 * 1000);
            
            // Track (threshold - 1) emails outside the time window
            for (let i = 0; i < threshold - 1; i++) {
              dynamicRuleService.trackSubject(subject, outsideWindow);
            }
            
            // Track 1 email inside the window - should not create rule
            // because only 1 email is within the window
            const result = dynamicRuleService.trackSubject(subject, now);
            expect(result).toBeNull();
            
            // Verify no rule was created
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: dynamic-rule-optimization, Property 2: Time Span Threshold Rule Creation**
   * **Validates: Requirements 1.3**
   * 
   * For any subject that reaches the threshold count with a time span less than or equal
   * to the configured time span threshold, the system should create exactly one dynamic
   * filter rule for that subject.
   */
  describe('Property 2: Time Span Threshold Rule Creation', () => {
    it('should create rule when time span is within threshold', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 5 }), // threshold
          fc.integer({ min: 5, max: 30 }), // timeSpanThresholdMinutes
          (subject, threshold, timeSpanThreshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: timeSpanThreshold,
              expirationHours: 48,
            });
            
            const now = new Date();
            // Create emails with time span less than threshold
            // Spread emails evenly within (timeSpanThreshold - 1) minutes
            const timeSpanMs = (timeSpanThreshold - 1) * 60 * 1000;
            const intervalMs = threshold > 1 ? timeSpanMs / (threshold - 1) : 0;
            
            let lastResult: FilterRule | null = null;
            for (let i = 0; i < threshold; i++) {
              const emailTime = new Date(now.getTime() + i * intervalMs);
              lastResult = dynamicRuleService.trackSubject(subject, emailTime);
            }
            
            // Rule should be created because time span is within threshold
            expect(lastResult).not.toBeNull();
            expect(lastResult?.category).toBe('dynamic');
            expect(lastResult?.matchType).toBe('subject');
            expect(lastResult?.enabled).toBe(true);
            
            // Verify exactly one rule was created
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create rule when all emails arrive at the same time (time span = 0)', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 10 }), // threshold
          (subject, threshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: 1, // Even with small threshold, time span 0 should pass
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // All emails at the same time - time span is 0
            let lastResult: FilterRule | null = null;
            for (let i = 0; i < threshold; i++) {
              lastResult = dynamicRuleService.trackSubject(subject, now);
            }
            
            // Rule should be created because time span (0) <= threshold
            expect(lastResult).not.toBeNull();
            expect(lastResult?.category).toBe('dynamic');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: dynamic-rule-optimization, Property 3: Time Span Threshold No Rule Creation**
   * **Validates: Requirements 1.4**
   * 
   * For any subject that reaches the threshold count with a time span greater than
   * the configured time span threshold, the system should NOT create a dynamic rule
   * and should continue tracking.
   */
  describe('Property 3: Time Span Threshold No Rule Creation', () => {
    it('should NOT create rule when time span exceeds threshold', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 5 }), // threshold
          fc.integer({ min: 1, max: 5 }), // timeSpanThresholdMinutes (small)
          (subject, threshold, timeSpanThreshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: timeSpanThreshold,
              expirationHours: 48,
            });
            
            const now = new Date();
            // Create emails with time span greater than threshold
            // Spread emails so that time span is (timeSpanThreshold + 2) minutes
            const timeSpanMs = (timeSpanThreshold + 2) * 60 * 1000;
            const intervalMs = threshold > 1 ? timeSpanMs / (threshold - 1) : 0;
            
            let lastResult: FilterRule | null = null;
            for (let i = 0; i < threshold; i++) {
              const emailTime = new Date(now.getTime() + i * intervalMs);
              lastResult = dynamicRuleService.trackSubject(subject, emailTime);
            }
            
            // Rule should NOT be created because time span exceeds threshold
            expect(lastResult).toBeNull();
            
            // Verify no rule was created
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should continue tracking after time span threshold is exceeded', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 3,
              timeSpanThresholdMinutes: 1, // 1 minute threshold
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // First batch: 3 emails spread over 5 minutes (exceeds 1 min threshold)
            // Time span = 5 minutes > 1 minute threshold
            dynamicRuleService.trackSubject(subject, now);
            dynamicRuleService.trackSubject(subject, new Date(now.getTime() + 2.5 * 60 * 1000));
            const result1 = dynamicRuleService.trackSubject(subject, new Date(now.getTime() + 5 * 60 * 1000));
            
            // Should not create rule because time span (5 min) > threshold (1 min)
            expect(result1).toBeNull();
            
            // Verify tracking records still exist (continue tracking)
            const countResult = db.exec(
              `SELECT COUNT(*) FROM email_subject_tracker`
            );
            const count = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;
            expect(count).toBe(3);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: dynamic-rule-optimization, Property 4: Tracking Scope - Only Default Forwarded Emails**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   * 
   * For any email processed by the filter system, the dynamic rule tracking should only occur
   * when the email is forwarded by default (no rule matched). Emails matching whitelist,
   * blacklist, or existing dynamic rules should NOT be tracked.
   */
  describe('Property 4: Tracking Scope - Only Default Forwarded Emails', () => {
    it('should track emails that are forwarded by default (no rule matched)', () => {
      fc.assert(
        fc.property(
          fc.record({
            action: fc.constant('forward' as const),
            forwardTo: fc.emailAddress(),
            reason: fc.string(),
            // matchedCategory is undefined for default forwarded emails
          }),
          (filterResult) => {
            // Default forwarded emails have no matchedCategory
            const result = { ...filterResult, matchedCategory: undefined };
            expect(dynamicRuleService.shouldTrack(result)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT track emails that match whitelist rules', () => {
      fc.assert(
        fc.property(
          fc.record({
            action: fc.constant('forward' as const),
            forwardTo: fc.emailAddress(),
            reason: fc.string(),
            matchedCategory: fc.constant('whitelist' as const),
            matchedRule: fc.record({
              id: fc.uuid(),
              category: fc.constant('whitelist' as const),
              matchType: fc.constantFrom('sender', 'subject', 'domain'),
              matchMode: fc.constantFrom('exact', 'contains', 'startsWith', 'endsWith', 'regex'),
              pattern: fc.string({ minLength: 1 }),
              enabled: fc.constant(true),
              createdAt: fc.date(),
              updatedAt: fc.date(),
            }),
          }),
          (filterResult) => {
            expect(dynamicRuleService.shouldTrack(filterResult)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT track emails that match blacklist rules', () => {
      fc.assert(
        fc.property(
          fc.record({
            action: fc.constant('drop' as const),
            reason: fc.string(),
            matchedCategory: fc.constant('blacklist' as const),
            matchedRule: fc.record({
              id: fc.uuid(),
              category: fc.constant('blacklist' as const),
              matchType: fc.constantFrom('sender', 'subject', 'domain'),
              matchMode: fc.constantFrom('exact', 'contains', 'startsWith', 'endsWith', 'regex'),
              pattern: fc.string({ minLength: 1 }),
              enabled: fc.constant(true),
              createdAt: fc.date(),
              updatedAt: fc.date(),
            }),
          }),
          (filterResult) => {
            expect(dynamicRuleService.shouldTrack(filterResult)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT track emails that match existing dynamic rules', () => {
      fc.assert(
        fc.property(
          fc.record({
            action: fc.constant('drop' as const),
            reason: fc.string(),
            matchedCategory: fc.constant('dynamic' as const),
            matchedRule: fc.record({
              id: fc.uuid(),
              category: fc.constant('dynamic' as const),
              matchType: fc.constantFrom('sender', 'subject', 'domain'),
              matchMode: fc.constantFrom('exact', 'contains', 'startsWith', 'endsWith', 'regex'),
              pattern: fc.string({ minLength: 1 }),
              enabled: fc.constant(true),
              createdAt: fc.date(),
              updatedAt: fc.date(),
            }),
          }),
          (filterResult) => {
            expect(dynamicRuleService.shouldTrack(filterResult)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly distinguish between matched and unmatched emails', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            // Default forwarded (should track)
            fc.record({
              action: fc.constant('forward' as const),
              forwardTo: fc.emailAddress(),
              reason: fc.constant('No matching rules, forwarding to default'),
            }),
            // Whitelist matched (should NOT track)
            fc.record({
              action: fc.constant('forward' as const),
              forwardTo: fc.emailAddress(),
              reason: fc.string(),
              matchedCategory: fc.constant('whitelist' as const),
            }),
            // Blacklist matched (should NOT track)
            fc.record({
              action: fc.constant('drop' as const),
              reason: fc.string(),
              matchedCategory: fc.constant('blacklist' as const),
            }),
            // Dynamic matched (should NOT track)
            fc.record({
              action: fc.constant('drop' as const),
              reason: fc.string(),
              matchedCategory: fc.constant('dynamic' as const),
            })
          ),
          (filterResult) => {
            const shouldTrack = dynamicRuleService.shouldTrack(filterResult);
            const hasMatchedCategory = 'matchedCategory' in filterResult && filterResult.matchedCategory !== undefined;
            
            // Should track only when no rule matched (matchedCategory is undefined)
            expect(shouldTrack).toBe(!hasMatchedCategory);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: dynamic-rule-optimization, Property 6: Configuration Validation**
   * **Validates: Requirements 2.4, 4.4**
   * 
   * For any time window value, the system should accept values between 5 and 120 minutes.
   * For any time span threshold value, the system should accept values between 1 and 30 minutes.
   */
  describe('Property 6: Configuration Validation', () => {
    /**
     * Validation function that mirrors the API route validation logic
     * This tests the validation rules that are applied in the PUT /api/dynamic/config endpoint
     */
    function validateDynamicConfig(body: unknown): { valid: boolean; error?: string; data?: Partial<DynamicConfig> } {
      if (!body || typeof body !== 'object') {
        return { valid: false, error: 'Request body is required' };
      }

      const data = body as Record<string, unknown>;
      const config: Partial<DynamicConfig> = {};

      if (data.enabled !== undefined) {
        if (typeof data.enabled !== 'boolean') {
          return { valid: false, error: 'enabled must be a boolean' };
        }
        config.enabled = data.enabled;
      }

      // Requirements 2.4: timeWindowMinutes must be between 5 and 120 minutes
      if (data.timeWindowMinutes !== undefined) {
        const value = Number(data.timeWindowMinutes);
        if (isNaN(value) || value < 5 || value > 120) {
          return { valid: false, error: 'timeWindowMinutes must be between 5 and 120' };
        }
        config.timeWindowMinutes = value;
      }

      // Requirements 3.2: timeSpanThresholdMinutes must be between 0.5 and 30 minutes
      if (data.timeSpanThresholdMinutes !== undefined) {
        const value = Number(data.timeSpanThresholdMinutes);
        if (isNaN(value) || value < 0.5 || value > 30) {
          return { valid: false, error: 'timeSpanThresholdMinutes must be between 0.5 and 30' };
        }
        config.timeSpanThresholdMinutes = value;
      }

      // Requirements 3.1: thresholdCount must be at least 5
      if (data.thresholdCount !== undefined) {
        const value = Number(data.thresholdCount);
        if (isNaN(value) || value < 5) {
          return { valid: false, error: 'thresholdCount must be at least 5' };
        }
        config.thresholdCount = value;
      }

      if (data.expirationHours !== undefined) {
        const value = Number(data.expirationHours);
        if (isNaN(value) || value < 1) {
          return { valid: false, error: 'expirationHours must be a positive number' };
        }
        config.expirationHours = value;
      }

      if (data.lastHitThresholdHours !== undefined) {
        const value = Number(data.lastHitThresholdHours);
        if (isNaN(value) || value < 1) {
          return { valid: false, error: 'lastHitThresholdHours must be a positive number' };
        }
        config.lastHitThresholdHours = value;
      }

      return { valid: true, data: config };
    }

    it('should accept timeWindowMinutes values between 5 and 120', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 120 }),
          (timeWindowMinutes) => {
            const result = validateDynamicConfig({ timeWindowMinutes });
            expect(result.valid).toBe(true);
            expect(result.data?.timeWindowMinutes).toBe(timeWindowMinutes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject timeWindowMinutes values below 5', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 4 }),
          (timeWindowMinutes) => {
            const result = validateDynamicConfig({ timeWindowMinutes });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('timeWindowMinutes must be between 5 and 120');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject timeWindowMinutes values above 120', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 121, max: 10000 }),
          (timeWindowMinutes) => {
            const result = validateDynamicConfig({ timeWindowMinutes });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('timeWindowMinutes must be between 5 and 120');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept timeSpanThresholdMinutes values between 0.5 and 30', () => {
      fc.assert(
        fc.property(
          // Generate values from 0.5 to 30 in 0.5 increments
          fc.integer({ min: 1, max: 60 }).map(n => n * 0.5),
          (timeSpanThresholdMinutes) => {
            const result = validateDynamicConfig({ timeSpanThresholdMinutes });
            expect(result.valid).toBe(true);
            expect(result.data?.timeSpanThresholdMinutes).toBe(timeSpanThresholdMinutes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject timeSpanThresholdMinutes values below 0.5', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 0 }).map(n => n * 0.1),
          (timeSpanThresholdMinutes) => {
            const result = validateDynamicConfig({ timeSpanThresholdMinutes });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('timeSpanThresholdMinutes must be between 0.5 and 30');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject timeSpanThresholdMinutes values above 30', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 31, max: 10000 }),
          (timeSpanThresholdMinutes) => {
            const result = validateDynamicConfig({ timeSpanThresholdMinutes });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('timeSpanThresholdMinutes must be between 0.5 and 30');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid combinations of timeWindowMinutes and timeSpanThresholdMinutes', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 120 }),
          fc.integer({ min: 1, max: 60 }).map(n => n * 0.5),
          (timeWindowMinutes, timeSpanThresholdMinutes) => {
            const result = validateDynamicConfig({ timeWindowMinutes, timeSpanThresholdMinutes });
            expect(result.valid).toBe(true);
            expect(result.data?.timeWindowMinutes).toBe(timeWindowMinutes);
            expect(result.data?.timeSpanThresholdMinutes).toBe(timeSpanThresholdMinutes);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid combinations where timeWindowMinutes is out of range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: -1000, max: 4 }),
            fc.integer({ min: 121, max: 10000 })
          ),
          fc.integer({ min: 1, max: 60 }).map(n => n * 0.5),
          (timeWindowMinutes, timeSpanThresholdMinutes) => {
            const result = validateDynamicConfig({ timeWindowMinutes, timeSpanThresholdMinutes });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('timeWindowMinutes must be between 5 and 120');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject NaN values for timeWindowMinutes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('abc', 'NaN', '', null, undefined, {}, []),
          (invalidValue) => {
            const result = validateDynamicConfig({ timeWindowMinutes: invalidValue });
            // NaN check should fail validation
            if (invalidValue !== undefined) {
              expect(result.valid).toBe(false);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should reject NaN values for timeSpanThresholdMinutes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('abc', 'NaN', '', null, {}, []),
          (invalidValue) => {
            const result = validateDynamicConfig({ timeSpanThresholdMinutes: invalidValue });
            expect(result.valid).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * **Feature: dynamic-rule-realtime, Property 3: Threshold configuration accepts valid low values**
     * **Validates: Requirements 3.1**
     * 
     * For any threshold count value between 5 and 1000, the system SHALL accept and save the configuration.
     */
    it('Property 3: should accept thresholdCount values >= 5', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 1000 }),
          (thresholdCount) => {
            const result = validateDynamicConfig({ thresholdCount });
            expect(result.valid).toBe(true);
            expect(result.data?.thresholdCount).toBe(thresholdCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject thresholdCount values below 5', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 4 }),
          (thresholdCount) => {
            const result = validateDynamicConfig({ thresholdCount });
            expect(result.valid).toBe(false);
            expect(result.error).toBe('thresholdCount must be at least 5');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Feature: dynamic-rule-realtime, Property 4: Time span configuration accepts valid low values**
     * **Validates: Requirements 3.2**
     * 
     * For any time span threshold value between 0.5 and 30 minutes, the system SHALL accept and save the configuration.
     */
    it('Property 4: should accept timeSpanThresholdMinutes values as low as 0.5 (30 seconds)', () => {
      fc.assert(
        fc.property(
          // Generate values from 0.5 to 30 in 0.5 increments
          fc.integer({ min: 1, max: 60 }).map(n => n * 0.5),
          (timeSpanThresholdMinutes) => {
            const result = validateDynamicConfig({ timeSpanThresholdMinutes });
            expect(result.valid).toBe(true);
            expect(result.data?.timeSpanThresholdMinutes).toBe(timeSpanThresholdMinutes);
          }
        ),
        { numRuns: 100 }
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
   * **Feature: dynamic-rule-optimization, Property 7: Existing Rules Preservation**
   * **Validates: Requirements 6.2**
   * 
   * For any existing dynamic rules in the database, the optimized detection logic
   * should not modify or delete these rules during normal operation.
   */
  describe('Property 7: Existing Rules Preservation', () => {
    it('should preserve existing dynamic rules during normal tracking operations', () => {
      fc.assert(
        fc.property(
          subjectArb,
          subjectArb,
          fc.integer({ min: 2, max: 5 }),
          (existingSubject, newSubject, threshold) => {
            // Skip if subjects are the same (would be a different test case)
            fc.pre(existingSubject.toLowerCase().trim() !== newSubject.toLowerCase().trim());
            
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: 30,
              expirationHours: 48,
            });
            
            // Create an existing dynamic rule directly
            const existingRuleId = uuidv4();
            const now = new Date().toISOString();
            db.run(
              `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at)
               VALUES (?, 'dynamic', 'subject', 'contains', ?, 1, ?, ?, ?)`,
              [existingRuleId, existingSubject, now, now, now]
            );
            db.run(
              `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
               VALUES (?, 0, 0, 0, ?)`,
              [existingRuleId, now]
            );
            
            // Verify existing rule exists
            const existingRuleBefore = dynamicRuleService.getDynamicRule(existingRuleId);
            expect(existingRuleBefore).not.toBeNull();
            expect(existingRuleBefore?.pattern).toBe(existingSubject);
            
            // Track a different subject multiple times to trigger rule creation
            const trackTime = new Date();
            for (let i = 0; i < threshold; i++) {
              dynamicRuleService.trackSubject(newSubject, trackTime);
            }
            
            // Verify existing rule is still intact
            const existingRuleAfter = dynamicRuleService.getDynamicRule(existingRuleId);
            expect(existingRuleAfter).not.toBeNull();
            expect(existingRuleAfter?.id).toBe(existingRuleId);
            expect(existingRuleAfter?.pattern).toBe(existingSubject);
            expect(existingRuleAfter?.category).toBe('dynamic');
            expect(existingRuleAfter?.enabled).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not modify existing rules when tracking the same subject', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 5 }),
          (subject, threshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: 30,
              expirationHours: 48,
            });
            
            // Create an existing dynamic rule for the same subject
            const existingRuleId = uuidv4();
            const createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
            const createdAtStr = createdAt.toISOString();
            db.run(
              `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at)
               VALUES (?, 'dynamic', 'subject', 'contains', ?, 1, ?, ?)`,
              [existingRuleId, subject, createdAtStr, createdAtStr]
            );
            db.run(
              `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
               VALUES (?, 0, 0, 0, ?)`,
              [existingRuleId, createdAtStr]
            );
            
            // Track the same subject multiple times
            const trackTime = new Date();
            for (let i = 0; i < threshold; i++) {
              dynamicRuleService.trackSubject(subject, trackTime);
            }
            
            // Verify the existing rule is preserved (not deleted or replaced)
            const existingRule = dynamicRuleService.getDynamicRule(existingRuleId);
            expect(existingRule).not.toBeNull();
            expect(existingRule?.id).toBe(existingRuleId);
            expect(existingRule?.createdAt.getTime()).toBe(createdAt.getTime());
            
            // Verify no duplicate rules were created
            const allDynamicRules = dynamicRuleService.getAllDynamicRules();
            const rulesForSubject = allDynamicRules.filter(r => 
              r.pattern.toLowerCase() === subject.toLowerCase()
            );
            expect(rulesForSubject.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve existing rules during configuration changes', () => {
      fc.assert(
        fc.property(
          subjectArb,
          dynamicConfigArb,
          (subject, newConfig) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            // Create an existing dynamic rule
            const existingRuleId = uuidv4();
            const now = new Date().toISOString();
            db.run(
              `INSERT INTO filter_rules (id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at)
               VALUES (?, 'dynamic', 'subject', 'contains', ?, 1, ?, ?, ?)`,
              [existingRuleId, subject, now, now, now]
            );
            db.run(
              `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
               VALUES (?, 0, 0, 0, ?)`,
              [existingRuleId, now]
            );
            
            // Update configuration with new values
            dynamicRuleService.updateConfig(newConfig);
            
            // Verify existing rule is still intact after config change
            const existingRule = dynamicRuleService.getDynamicRule(existingRuleId);
            expect(existingRule).not.toBeNull();
            expect(existingRule?.id).toBe(existingRuleId);
            expect(existingRule?.pattern).toBe(subject);
            expect(existingRule?.category).toBe('dynamic');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Backward Compatibility Tests
   * **Validates: Requirements 6.1, 6.3**
   * 
   * Tests that the system operates correctly when timeSpanThresholdMinutes
   * is not present in the database configuration.
   */
  describe('Backward Compatibility: Default Values', () => {
    it('should use default timeSpanThresholdMinutes (3 minutes) when not configured', () => {
      // Clear all config to simulate old database without timeSpanThresholdMinutes
      db.run('DELETE FROM dynamic_config');
      
      const config = dynamicRuleService.getConfig();
      
      // Should use default value of 3 minutes
      expect(config.timeSpanThresholdMinutes).toBe(3);
      expect(config.enabled).toBe(true);
      expect(config.timeWindowMinutes).toBe(30);
      expect(config.thresholdCount).toBe(30);
      expect(config.expirationHours).toBe(48);
      expect(config.lastHitThresholdHours).toBe(72);
    });

    it('should operate normally with default timeSpanThresholdMinutes when only other configs exist', () => {
      // Clear all config
      db.run('DELETE FROM dynamic_config');
      
      // Set only some config values (simulating old config without timeSpanThresholdMinutes)
      db.run(
        `INSERT INTO dynamic_config (key, value) VALUES ('enabled', 'true')`
      );
      db.run(
        `INSERT INTO dynamic_config (key, value) VALUES ('timeWindowMinutes', '60')`
      );
      db.run(
        `INSERT INTO dynamic_config (key, value) VALUES ('thresholdCount', '5')`
      );
      
      const config = dynamicRuleService.getConfig();
      
      // Should use default value for timeSpanThresholdMinutes
      expect(config.timeSpanThresholdMinutes).toBe(3);
      // Other values should be from database
      expect(config.enabled).toBe(true);
      expect(config.timeWindowMinutes).toBe(60);
      expect(config.thresholdCount).toBe(5);
    });

    it('should create rules correctly using default timeSpanThresholdMinutes', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            db.run('DELETE FROM dynamic_config');
            
            // Set config without timeSpanThresholdMinutes
            db.run(
              `INSERT INTO dynamic_config (key, value) VALUES ('enabled', 'true')`
            );
            db.run(
              `INSERT INTO dynamic_config (key, value) VALUES ('timeWindowMinutes', '60')`
            );
            db.run(
              `INSERT INTO dynamic_config (key, value) VALUES ('thresholdCount', '3')`
            );
            
            const now = new Date();
            
            // Track subject 3 times at the same time (time span = 0, which is <= default 3 minutes)
            dynamicRuleService.trackSubject(subject, now);
            dynamicRuleService.trackSubject(subject, now);
            const result = dynamicRuleService.trackSubject(subject, now);
            
            // Should create rule because time span (0) <= default threshold (3 minutes)
            expect(result).not.toBeNull();
            expect(result?.category).toBe('dynamic');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect default timeSpanThresholdMinutes when time span exceeds it', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            db.run('DELETE FROM dynamic_config');
            
            // Set config without timeSpanThresholdMinutes (default is 3 minutes)
            db.run(
              `INSERT INTO dynamic_config (key, value) VALUES ('enabled', 'true')`
            );
            db.run(
              `INSERT INTO dynamic_config (key, value) VALUES ('timeWindowMinutes', '60')`
            );
            db.run(
              `INSERT INTO dynamic_config (key, value) VALUES ('thresholdCount', '3')`
            );
            
            const now = new Date();
            
            // Track subject 3 times with time span of 5 minutes (> default 3 minutes)
            dynamicRuleService.trackSubject(subject, now);
            dynamicRuleService.trackSubject(subject, new Date(now.getTime() + 2.5 * 60 * 1000));
            const result = dynamicRuleService.trackSubject(subject, new Date(now.getTime() + 5 * 60 * 1000));
            
            // Should NOT create rule because time span (5 min) > default threshold (3 min)
            expect(result).toBeNull();
            
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle system startup with old configuration gracefully', () => {
      // Simulate old configuration without new fields
      db.run('DELETE FROM dynamic_config');
      db.run(
        `INSERT INTO dynamic_config (key, value) VALUES ('enabled', 'true')`
      );
      db.run(
        `INSERT INTO dynamic_config (key, value) VALUES ('timeWindowMinutes', '30')`
      );
      db.run(
        `INSERT INTO dynamic_config (key, value) VALUES ('thresholdCount', '30')`
      );
      db.run(
        `INSERT INTO dynamic_config (key, value) VALUES ('expirationHours', '48')`
      );
      
      // System should start and operate normally
      const config = dynamicRuleService.getConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.timeWindowMinutes).toBe(30);
      expect(config.thresholdCount).toBe(30);
      expect(config.timeSpanThresholdMinutes).toBe(3); // Default value
      expect(config.expirationHours).toBe(48);
      expect(config.lastHitThresholdHours).toBe(72); // Default value
    });
  });

  /**
   * Unit Tests for Time Span Detection Logic
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
   * 
   * These tests verify specific scenarios for the "count first, then time span" detection logic.
   */
  describe('Time Span Detection Unit Tests', () => {
    it('should correctly calculate time span between first and Nth email', () => {
      // Reset database
      db.run('DELETE FROM email_subject_tracker');
      db.run('DELETE FROM filter_rules');
      db.run('DELETE FROM rule_stats');
      
      dynamicRuleService.updateConfig({
        enabled: true,
        timeWindowMinutes: 60,
        thresholdCount: 5,
        timeSpanThresholdMinutes: 10, // 10 minutes threshold
        expirationHours: 48,
      });
      
      const baseTime = new Date();
      const subject = 'Test Subject for Time Span';
      
      // Track 5 emails with 2 minutes between each (total span = 8 minutes)
      // 8 minutes < 10 minutes threshold, so rule should be created
      for (let i = 0; i < 4; i++) {
        const emailTime = new Date(baseTime.getTime() + i * 2 * 60 * 1000);
        const result = dynamicRuleService.trackSubject(subject, emailTime);
        expect(result).toBeNull(); // Not yet at threshold
      }
      
      // 5th email at 8 minutes from first
      const fifthEmailTime = new Date(baseTime.getTime() + 8 * 60 * 1000);
      const result = dynamicRuleService.trackSubject(subject, fifthEmailTime);
      
      // Should create rule because time span (8 min) <= threshold (10 min)
      expect(result).not.toBeNull();
      expect(result?.category).toBe('dynamic');
    });

    it('should NOT create rule when time span exactly equals threshold + 1 minute', () => {
      // Reset database
      db.run('DELETE FROM email_subject_tracker');
      db.run('DELETE FROM filter_rules');
      db.run('DELETE FROM rule_stats');
      
      dynamicRuleService.updateConfig({
        enabled: true,
        timeWindowMinutes: 60,
        thresholdCount: 3,
        timeSpanThresholdMinutes: 5, // 5 minutes threshold
        expirationHours: 48,
      });
      
      const baseTime = new Date();
      const subject = 'Test Subject Exceeds Threshold';
      
      // Track 3 emails with time span of 6 minutes (> 5 minutes threshold)
      dynamicRuleService.trackSubject(subject, baseTime);
      dynamicRuleService.trackSubject(subject, new Date(baseTime.getTime() + 3 * 60 * 1000));
      const result = dynamicRuleService.trackSubject(subject, new Date(baseTime.getTime() + 6 * 60 * 1000));
      
      // Should NOT create rule because time span (6 min) > threshold (5 min)
      expect(result).toBeNull();
      
      const rules = dynamicRuleService.getAllDynamicRules();
      expect(rules.length).toBe(0);
    });

    it('should create rule when time span exactly equals threshold', () => {
      // Reset database
      db.run('DELETE FROM email_subject_tracker');
      db.run('DELETE FROM filter_rules');
      db.run('DELETE FROM rule_stats');
      
      dynamicRuleService.updateConfig({
        enabled: true,
        timeWindowMinutes: 60,
        thresholdCount: 3,
        timeSpanThresholdMinutes: 5, // 5 minutes threshold
        expirationHours: 48,
      });
      
      const baseTime = new Date();
      const subject = 'Test Subject Equals Threshold';
      
      // Track 3 emails with time span of exactly 5 minutes
      dynamicRuleService.trackSubject(subject, baseTime);
      dynamicRuleService.trackSubject(subject, new Date(baseTime.getTime() + 2.5 * 60 * 1000));
      const result = dynamicRuleService.trackSubject(subject, new Date(baseTime.getTime() + 5 * 60 * 1000));
      
      // Should create rule because time span (5 min) == threshold (5 min)
      expect(result).not.toBeNull();
      expect(result?.category).toBe('dynamic');
    });

    it('should handle burst emails (many emails in very short time)', () => {
      // Reset database
      db.run('DELETE FROM email_subject_tracker');
      db.run('DELETE FROM filter_rules');
      db.run('DELETE FROM rule_stats');
      
      dynamicRuleService.updateConfig({
        enabled: true,
        timeWindowMinutes: 30,
        thresholdCount: 100, // High threshold
        timeSpanThresholdMinutes: 3, // 3 minutes threshold
        expirationHours: 48,
      });
      
      const baseTime = new Date();
      const subject = 'Burst Marketing Email';
      
      // Simulate 100 emails arriving within 2 minutes (burst scenario)
      let lastResult: ReturnType<typeof dynamicRuleService.trackSubject> = null;
      for (let i = 0; i < 100; i++) {
        // Spread 100 emails over 2 minutes (1.2 seconds apart)
        const emailTime = new Date(baseTime.getTime() + i * 1200);
        lastResult = dynamicRuleService.trackSubject(subject, emailTime);
      }
      
      // Should create rule because:
      // 1. Count reached 100
      // 2. Time span is ~2 minutes which is <= 3 minutes threshold
      expect(lastResult).not.toBeNull();
      expect(lastResult?.category).toBe('dynamic');
    });

    it('should NOT create rule for slow trickle of emails', () => {
      // Reset database
      db.run('DELETE FROM email_subject_tracker');
      db.run('DELETE FROM filter_rules');
      db.run('DELETE FROM rule_stats');
      
      dynamicRuleService.updateConfig({
        enabled: true,
        timeWindowMinutes: 60,
        thresholdCount: 5,
        timeSpanThresholdMinutes: 3, // 3 minutes threshold
        expirationHours: 48,
      });
      
      const baseTime = new Date();
      const subject = 'Slow Trickle Email';
      
      // Track 5 emails with 5 minutes between each (total span = 20 minutes)
      let lastResult: ReturnType<typeof dynamicRuleService.trackSubject> = null;
      for (let i = 0; i < 5; i++) {
        const emailTime = new Date(baseTime.getTime() + i * 5 * 60 * 1000);
        lastResult = dynamicRuleService.trackSubject(subject, emailTime);
      }
      
      // Should NOT create rule because time span (20 min) > threshold (3 min)
      expect(lastResult).toBeNull();
      
      const rules = dynamicRuleService.getAllDynamicRules();
      expect(rules.length).toBe(0);
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

  /**
   * Integration Tests: Complete Flow from Email Reception to Rule Creation
   * **Validates: Requirements 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4**
   * 
   * These tests verify the complete flow of dynamic rule detection,
   * including the interaction between shouldTrack() and trackSubject().
   */
  describe('Integration Tests: Complete Email Processing Flow', () => {
    /**
     * Test the complete flow: email arrives -> filter check -> shouldTrack -> trackSubject -> rule creation
     * **Validates: Requirements 1.1, 1.2, 1.3, 3.1, 3.2, 3.3, 3.4**
     */
    it('should create rule only for default forwarded emails that meet threshold and time span criteria', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 3, max: 10 }), // threshold
          fc.integer({ min: 1, max: 5 }),  // timeSpanThresholdMinutes
          (subject, threshold, timeSpanThreshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: timeSpanThreshold,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Simulate emails arriving - some matched by rules, some default forwarded
            const filterResults = [
              // Whitelist matched - should NOT be tracked
              { matchedCategory: 'whitelist' as const, action: 'forward' as const },
              // Blacklist matched - should NOT be tracked
              { matchedCategory: 'blacklist' as const, action: 'drop' as const },
              // Dynamic rule matched - should NOT be tracked
              { matchedCategory: 'dynamic' as const, action: 'drop' as const },
              // Default forwarded - SHOULD be tracked
              { matchedCategory: undefined, action: 'forward' as const },
            ];
            
            // Process emails with different filter results
            for (const filterResult of filterResults) {
              // Check if should track
              const shouldTrack = dynamicRuleService.shouldTrack(filterResult);
              
              if (filterResult.matchedCategory === undefined) {
                expect(shouldTrack).toBe(true);
              } else {
                expect(shouldTrack).toBe(false);
              }
            }
            
            // Now simulate the complete flow for default forwarded emails only
            // Track (threshold) emails with same subject, all within time span threshold
            let lastResult: ReturnType<typeof dynamicRuleService.trackSubject> = null;
            for (let i = 0; i < threshold; i++) {
              // All emails arrive at the same time (time span = 0)
              lastResult = dynamicRuleService.trackSubject(subject, now);
            }
            
            // Rule should be created because:
            // 1. All emails were "default forwarded" (shouldTrack returned true)
            // 2. Count reached threshold
            // 3. Time span (0) <= timeSpanThreshold
            expect(lastResult).not.toBeNull();
            expect(lastResult?.category).toBe('dynamic');
            expect(lastResult?.matchType).toBe('subject');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test that whitelist/blacklist/dynamic matched emails don't contribute to rule creation
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
     */
    it('should NOT count emails that match existing rules toward threshold', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 3,
              timeSpanThresholdMinutes: 10,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Simulate 10 emails, but only 2 are default forwarded
            // The rest match whitelist/blacklist/dynamic rules
            const filterResults = [
              { matchedCategory: 'whitelist' as const },
              { matchedCategory: undefined }, // Default forwarded - tracked
              { matchedCategory: 'blacklist' as const },
              { matchedCategory: 'dynamic' as const },
              { matchedCategory: undefined }, // Default forwarded - tracked
              { matchedCategory: 'whitelist' as const },
              { matchedCategory: 'blacklist' as const },
              { matchedCategory: 'whitelist' as const },
              { matchedCategory: 'dynamic' as const },
              { matchedCategory: 'blacklist' as const },
            ];
            
            let lastResult: ReturnType<typeof dynamicRuleService.trackSubject> = null;
            for (const filterResult of filterResults) {
              if (dynamicRuleService.shouldTrack(filterResult)) {
                lastResult = dynamicRuleService.trackSubject(subject, now);
              }
            }
            
            // Should NOT create rule because only 2 emails were tracked (< threshold of 3)
            expect(lastResult).toBeNull();
            
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test the complete flow with mixed timing scenarios
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2**
     */
    it('should correctly handle mixed timing scenarios in complete flow', () => {
      // Reset database
      db.run('DELETE FROM email_subject_tracker');
      db.run('DELETE FROM filter_rules');
      db.run('DELETE FROM rule_stats');
      
      dynamicRuleService.updateConfig({
        enabled: true,
        timeWindowMinutes: 60,
        thresholdCount: 5,
        timeSpanThresholdMinutes: 5, // 5 minutes threshold
        expirationHours: 48,
      });
      
      const baseTime = new Date();
      const subject1 = 'Fast Burst Subject';
      const subject2 = 'Slow Trickle Subject';
      
      // Scenario 1: Fast burst - 5 emails in 2 minutes
      // Should create rule (time span 2 min <= 5 min threshold)
      for (let i = 0; i < 5; i++) {
        const emailTime = new Date(baseTime.getTime() + i * 24 * 1000); // 24 seconds apart
        dynamicRuleService.trackSubject(subject1, emailTime);
      }
      
      // Scenario 2: Slow trickle - 5 emails over 10 minutes
      // Should NOT create rule (time span 10 min > 5 min threshold)
      for (let i = 0; i < 5; i++) {
        const emailTime = new Date(baseTime.getTime() + i * 2.5 * 60 * 1000); // 2.5 minutes apart
        dynamicRuleService.trackSubject(subject2, emailTime);
      }
      
      const rules = dynamicRuleService.getAllDynamicRules();
      
      // Only subject1 should have a rule
      expect(rules.length).toBe(1);
      expect(rules[0].pattern.toLowerCase()).toContain(subject1.toLowerCase().substring(0, 10));
    });

    /**
     * Test that the system correctly handles the boundary between time window and time span
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3**
     */
    it('should correctly distinguish between time window and time span thresholds', () => {
      // Reset database
      db.run('DELETE FROM email_subject_tracker');
      db.run('DELETE FROM filter_rules');
      db.run('DELETE FROM rule_stats');
      
      dynamicRuleService.updateConfig({
        enabled: true,
        timeWindowMinutes: 30, // 30 minute window
        thresholdCount: 3,
        timeSpanThresholdMinutes: 5, // 5 minute time span threshold
        expirationHours: 48,
      });
      
      const baseTime = new Date();
      const subject = 'Time Window vs Time Span Test';
      
      // Track 3 emails:
      // - First email at baseTime
      // - Second email at baseTime + 20 minutes (within 30 min window)
      // - Third email at baseTime + 25 minutes (within 30 min window)
      // Time span = 25 minutes > 5 minute threshold
      // Even though all emails are within the time window, time span exceeds threshold
      
      dynamicRuleService.trackSubject(subject, baseTime);
      dynamicRuleService.trackSubject(subject, new Date(baseTime.getTime() + 20 * 60 * 1000));
      const result = dynamicRuleService.trackSubject(subject, new Date(baseTime.getTime() + 25 * 60 * 1000));
      
      // Should NOT create rule because time span (25 min) > threshold (5 min)
      // even though all emails are within the time window (30 min)
      expect(result).toBeNull();
      
      const rules = dynamicRuleService.getAllDynamicRules();
      expect(rules.length).toBe(0);
    });

    /**
     * Test the complete flow with multiple subjects being tracked simultaneously
     * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
     */
    it('should correctly track multiple subjects independently', () => {
      fc.assert(
        fc.property(
          fc.array(subjectArb, { minLength: 2, maxLength: 5 }),
          (subjects) => {
            // Ensure all subjects are unique
            const uniqueSubjects = [...new Set(subjects.map(s => s.toLowerCase().trim()))];
            fc.pre(uniqueSubjects.length === subjects.length);
            
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 3,
              timeSpanThresholdMinutes: 10,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Track each subject 3 times (should create rules for all)
            for (const subject of subjects) {
              for (let i = 0; i < 3; i++) {
                dynamicRuleService.trackSubject(subject, now);
              }
            }
            
            // Each subject should have its own rule
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(subjects.length);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Test that existing dynamic rules are updated (lastHitAt) when same subject is tracked again
     * **Validates: Requirements 6.2, 6.3**
     */
    it('should update existing rule lastHitAt when same subject triggers threshold again', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              timeSpanThresholdMinutes: 10,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // First batch - create rule
            dynamicRuleService.trackSubject(subject, now);
            const firstRule = dynamicRuleService.trackSubject(subject, now);
            
            expect(firstRule).not.toBeNull();
            const firstRuleId = firstRule!.id;
            
            // Wait a bit and track again
            const laterTime = new Date(now.getTime() + 1000);
            dynamicRuleService.trackSubject(subject, laterTime);
            const secondResult = dynamicRuleService.trackSubject(subject, laterTime);
            
            // Should return the same rule (not create a new one)
            expect(secondResult).not.toBeNull();
            expect(secondResult!.id).toBe(firstRuleId);
            
            // Verify only one rule exists
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: dynamic-rule-realtime, Property 1: Synchronous rule creation affects current email**
   * **Validates: Requirements 1.1, 1.3**
   * 
   * For any sequence of emails with the same subject that triggers dynamic rule creation,
   * the email that triggers the rule creation SHALL be blocked by that rule in the same request.
   * 
   * This property tests that:
   * 1. When threshold is reached, a rule is created synchronously
   * 2. The rule is immediately available for matching
   * 3. Detection metrics (latency and forwarded count) are correctly calculated
   */
  describe('Property 1: Synchronous Rule Creation Affects Current Email', () => {
    it('should create rule synchronously and return detection metrics when threshold is reached', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 10 }), // threshold
          fc.integer({ min: 1, max: 10 }), // timeSpanThresholdMinutes
          (subject, threshold, timeSpanThreshold) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes: timeSpanThreshold,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Track (threshold - 1) emails - should not create rule yet
            for (let i = 0; i < threshold - 1; i++) {
              const result = dynamicRuleService.trackSubjectWithMetrics(subject, now);
              expect(result.rule).toBeNull();
              expect(result.detectionLatencyMs).toBeUndefined();
              expect(result.emailsForwardedBeforeBlock).toBeUndefined();
            }
            
            // Track the threshold-th email - should create rule with metrics
            const finalResult = dynamicRuleService.trackSubjectWithMetrics(subject, now);
            
            // Rule should be created synchronously
            expect(finalResult.rule).not.toBeNull();
            expect(finalResult.rule?.category).toBe('dynamic');
            expect(finalResult.rule?.matchType).toBe('subject');
            expect(finalResult.rule?.pattern).toBe(subject);
            expect(finalResult.rule?.enabled).toBe(true);
            
            // Detection metrics should be present
            expect(finalResult.detectionLatencyMs).toBeDefined();
            expect(finalResult.detectionLatencyMs).toBeGreaterThanOrEqual(0);
            
            // Emails forwarded before block = threshold - 1 (current email will be blocked)
            expect(finalResult.emailsForwardedBeforeBlock).toBe(threshold - 1);
            
            // Rule should be immediately available in the database
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(1);
            expect(rules[0].id).toBe(finalResult.rule!.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate correct detection latency based on time span', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 5 }), // threshold
          fc.integer({ min: 100, max: 5000 }), // intervalMs between emails
          (subject, threshold, intervalMs) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            // Set time span threshold high enough to allow rule creation
            const timeSpanThresholdMinutes = Math.ceil((threshold * intervalMs) / (60 * 1000)) + 1;
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes,
              expirationHours: 48,
            });
            
            const baseTime = new Date();
            let lastResult: DynamicRuleCreationResult = { rule: null };
            
            // Track emails with specified interval
            for (let i = 0; i < threshold; i++) {
              const emailTime = new Date(baseTime.getTime() + i * intervalMs);
              lastResult = dynamicRuleService.trackSubjectWithMetrics(subject, emailTime);
            }
            
            // Rule should be created
            expect(lastResult.rule).not.toBeNull();
            
            // Detection latency should be approximately (threshold - 1) * intervalMs
            const expectedLatencyMs = (threshold - 1) * intervalMs;
            expect(lastResult.detectionLatencyMs).toBe(expectedLatencyMs);
            
            // Emails forwarded before block
            expect(lastResult.emailsForwardedBeforeBlock).toBe(threshold - 1);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return existing rule with zero metrics when rule already exists', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            
            dynamicRuleService.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              timeSpanThresholdMinutes: 10,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Create rule first
            dynamicRuleService.trackSubjectWithMetrics(subject, now);
            const firstResult = dynamicRuleService.trackSubjectWithMetrics(subject, now);
            
            expect(firstResult.rule).not.toBeNull();
            const firstRuleId = firstResult.rule!.id;
            
            // Track again - should return existing rule with zero metrics
            const laterTime = new Date(now.getTime() + 1000);
            dynamicRuleService.trackSubjectWithMetrics(subject, laterTime);
            const secondResult = dynamicRuleService.trackSubjectWithMetrics(subject, laterTime);
            
            // Should return the same rule
            expect(secondResult.rule).not.toBeNull();
            expect(secondResult.rule!.id).toBe(firstRuleId);
            
            // Metrics should be zero for existing rule
            expect(secondResult.detectionLatencyMs).toBe(0);
            expect(secondResult.emailsForwardedBeforeBlock).toBe(0);
            
            // Only one rule should exist
            const rules = dynamicRuleService.getAllDynamicRules();
            expect(rules.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: dynamic-rule-realtime, Property 7: Dynamic rule creation creates system log**
   * **Validates: Requirements 4.1, 4.2, 6.1**
   * 
   * For any automatically created dynamic rule, the system SHALL create a system log entry
   * containing detection latency and forwarded email count.
   * 
   * This property tests that:
   * 1. When a dynamic rule is created via trackSubjectWithMetrics, a system log is created
   * 2. The log has category 'system'
   * 3. The log contains detection latency and forwarded email count
   */
  describe('Property 7: Dynamic Rule Creation Creates System Log', () => {
    /**
     * Test-specific LogRepository that works with sql.js
     */
    class TestLogRepository {
      constructor(private db: SqlJsDatabase) {}

      findAll(filter?: { category?: string }): Array<{
        id: number;
        category: string;
        level: string;
        message: string;
        details: Record<string, unknown> | null;
        workerName: string;
        createdAt: Date;
      }> {
        let query = 'SELECT * FROM system_logs WHERE 1=1';
        const params: string[] = [];

        if (filter?.category) {
          query += ' AND category = ?';
          params.push(filter.category);
        }

        query += ' ORDER BY created_at DESC';

        const result = this.db.exec(query, params);
        if (result.length === 0) {
          return [];
        }

        return result[0].values.map(row => ({
          id: row[0] as number,
          category: row[1] as string,
          level: row[2] as string,
          message: row[3] as string,
          details: row[4] ? JSON.parse(row[4] as string) : null,
          workerName: row[5] as string || 'global',
          createdAt: new Date(row[6] as string),
        }));
      }

      create(category: string, message: string, details?: Record<string, unknown>, level: string = 'info', workerName: string = 'global') {
        const now = new Date().toISOString();
        const detailsJson = details ? JSON.stringify(details) : null;

        this.db.run(
          `INSERT INTO system_logs (category, level, message, details, worker_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [category, level, message, detailsJson, workerName, now]
        );
      }
    }

    /**
     * Extended DynamicRuleService that creates system logs (mimics production behavior)
     */
    class TestDynamicRuleServiceWithLogging extends TestDynamicRuleService {
      private logRepository: TestLogRepository;

      constructor(db: SqlJsDatabase, ruleRepository: TestRuleRepository) {
        super(db, ruleRepository);
        this.logRepository = new TestLogRepository(db);
      }

      /**
       * Track subject with metrics and create system log on rule creation
       * This mimics the production behavior in dynamic-rule.service.ts
       */
      trackSubjectWithMetricsAndLog(subject: string, receivedAt: Date = new Date()): DynamicRuleCreationResult {
        const result = this.trackSubjectWithMetrics(subject, receivedAt);
        
        // If a new rule was created (not an existing rule), create system log
        if (result.rule && result.detectionLatencyMs !== undefined && result.detectionLatencyMs > 0) {
          this.logRepository.create(
            'system',
            `动态规则已创建: ${result.rule.pattern}`,
            {
              ruleId: result.rule.id,
              pattern: result.rule.pattern,
              detectionLatencyMs: result.detectionLatencyMs,
              emailsForwardedBeforeBlock: result.emailsForwardedBeforeBlock,
              firstEmailTime: new Date(receivedAt.getTime() - result.detectionLatencyMs).toISOString(),
              triggerEmailTime: receivedAt.toISOString(),
            },
            'info'
          );
        }
        
        return result;
      }

      getLogRepository(): TestLogRepository {
        return this.logRepository;
      }
    }

    it('should create system log with detection metrics when dynamic rule is created', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 10 }), // threshold
          fc.integer({ min: 100, max: 5000 }), // intervalMs between emails
          (subject, threshold, intervalMs) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            db.run('DELETE FROM system_logs');
            
            // Set time span threshold high enough to allow rule creation
            const timeSpanThresholdMinutes = Math.ceil((threshold * intervalMs) / (60 * 1000)) + 1;
            
            const serviceWithLogging = new TestDynamicRuleServiceWithLogging(db, ruleRepository);
            serviceWithLogging.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: threshold,
              timeSpanThresholdMinutes,
              expirationHours: 48,
            });
            
            const baseTime = new Date();
            
            // Track emails with specified interval
            for (let i = 0; i < threshold; i++) {
              const emailTime = new Date(baseTime.getTime() + i * intervalMs);
              serviceWithLogging.trackSubjectWithMetricsAndLog(subject, emailTime);
            }
            
            // Verify system log was created
            const logs = serviceWithLogging.getLogRepository().findAll({ category: 'system' });
            
            // Should have exactly one system log for the rule creation
            expect(logs.length).toBe(1);
            
            const log = logs[0];
            expect(log.category).toBe('system');
            expect(log.level).toBe('info');
            expect(log.message).toContain('动态规则已创建');
            expect(log.message).toContain(subject);
            
            // Verify log details contain required metrics
            expect(log.details).not.toBeNull();
            expect(log.details!.ruleId).toBeDefined();
            expect(log.details!.pattern).toBe(subject);
            expect(log.details!.detectionLatencyMs).toBeDefined();
            expect(log.details!.detectionLatencyMs).toBeGreaterThanOrEqual(0);
            expect(log.details!.emailsForwardedBeforeBlock).toBe(threshold - 1);
            expect(log.details!.firstEmailTime).toBeDefined();
            expect(log.details!.triggerEmailTime).toBeDefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should NOT create system log when rule already exists', () => {
      fc.assert(
        fc.property(
          subjectArb,
          (subject) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            db.run('DELETE FROM system_logs');
            
            const serviceWithLogging = new TestDynamicRuleServiceWithLogging(db, ruleRepository);
            serviceWithLogging.updateConfig({
              enabled: true,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              timeSpanThresholdMinutes: 10,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Create rule first
            serviceWithLogging.trackSubjectWithMetricsAndLog(subject, now);
            serviceWithLogging.trackSubjectWithMetricsAndLog(subject, new Date(now.getTime() + 100));
            
            // Clear logs to test subsequent tracking
            db.run('DELETE FROM system_logs');
            
            // Track again - should return existing rule without creating new log
            const laterTime = new Date(now.getTime() + 1000);
            serviceWithLogging.trackSubjectWithMetricsAndLog(subject, laterTime);
            serviceWithLogging.trackSubjectWithMetricsAndLog(subject, new Date(laterTime.getTime() + 100));
            
            // Should NOT have created a new system log
            const logs = serviceWithLogging.getLogRepository().findAll({ category: 'system' });
            expect(logs.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should NOT create system log when feature is disabled', () => {
      fc.assert(
        fc.property(
          subjectArb,
          fc.integer({ min: 2, max: 10 }),
          (subject, emailCount) => {
            // Reset database
            db.run('DELETE FROM email_subject_tracker');
            db.run('DELETE FROM filter_rules');
            db.run('DELETE FROM rule_stats');
            db.run('DELETE FROM system_logs');
            
            const serviceWithLogging = new TestDynamicRuleServiceWithLogging(db, ruleRepository);
            serviceWithLogging.updateConfig({
              enabled: false,
              timeWindowMinutes: 60,
              thresholdCount: 2,
              timeSpanThresholdMinutes: 10,
              expirationHours: 48,
            });
            
            const now = new Date();
            
            // Track many emails - should not create rule or log
            for (let i = 0; i < emailCount; i++) {
              serviceWithLogging.trackSubjectWithMetricsAndLog(subject, now);
            }
            
            // Should NOT have created any system logs
            const logs = serviceWithLogging.getLogRepository().findAll({ category: 'system' });
            expect(logs.length).toBe(0);
            
            // Should NOT have created any rules
            const rules = serviceWithLogging.getAllDynamicRules();
            expect(rules.length).toBe(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

