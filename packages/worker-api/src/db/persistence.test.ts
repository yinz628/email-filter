/**
 * Data Persistence Property Tests
 * 
 * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
 * *For any* 保存的过滤规则、处理日志和统计数据，重新加载后应与保存前的数据一致。
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  FilterRule,
  CreateRuleDTO,
  RuleCategory,
  MatchType,
  MatchMode,
  ProcessAction,
  ProcessLog,
  RuleStats,
  WatchItem,
} from '@email-filter/shared';

// ============================================================================
// Mock D1 Database Implementation
// ============================================================================

class MockD1Database {
  private filterRules: Map<string, FilterRule> = new Map();
  private processLogs: Map<string, ProcessLog> = new Map();
  private ruleStats: Map<string, RuleStats> = new Map();
  private watchItems: Map<string, WatchItem> = new Map();
  private watchHits: Map<string, { id: string; watchId: string; recipient: string; hitAt: Date }[]> = new Map();

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(sql, this);
  }

  // Expose internal state for verification
  getFilterRules(): Map<string, FilterRule> { return this.filterRules; }
  getProcessLogs(): Map<string, ProcessLog> { return this.processLogs; }
  getRuleStats(): Map<string, RuleStats> { return this.ruleStats; }
  getWatchItems(): Map<string, WatchItem> { return this.watchItems; }
  getWatchHits(): Map<string, { id: string; watchId: string; recipient: string; hitAt: Date }[]> { return this.watchHits; }

  clear(): void {
    this.filterRules.clear();
    this.processLogs.clear();
    this.ruleStats.clear();
    this.watchItems.clear();
    this.watchHits.clear();
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
    
    // Filter Rules
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
      this.db.getFilterRules().set(id as string, rule);
    }
    
    // Rule Stats
    else if (sqlLower.includes('insert into rule_stats')) {
      const [ruleId, totalProcessed, deletedCount, errorCount, lastUpdated] = this.boundValues;
      const lastUpdatedDate = lastUpdated ? new Date(lastUpdated as string) : new Date();
      this.db.getRuleStats().set(ruleId as string, {
        ruleId: ruleId as string,
        totalProcessed: (totalProcessed as number) || 0,
        deletedCount: (deletedCount as number) || 0,
        errorCount: (errorCount as number) || 0,
        lastUpdated: isNaN(lastUpdatedDate.getTime()) ? new Date() : lastUpdatedDate,
      });
    }
    
    // Process Logs
    else if (sqlLower.includes('insert into process_logs')) {
      const [id, recipient, sender, senderEmail, subject, processedAt, action, matchedRuleId, matchedRuleCategory, errorMessage] = this.boundValues;
      const log: ProcessLog = {
        id: id as string,
        recipient: recipient as string,
        sender: sender as string,
        senderEmail: senderEmail as string,
        subject: subject as string,
        processedAt: new Date(processedAt as string),
        action: action as ProcessAction,
        matchedRuleId: matchedRuleId as string | undefined,
        matchedRuleCategory: matchedRuleCategory as string | undefined,
        errorMessage: errorMessage as string | undefined,
      };
      this.db.getProcessLogs().set(id as string, log);
    }
    
    // Watch Items
    else if (sqlLower.includes('insert into watch_items')) {
      const [id, subjectPattern, matchMode, createdAt] = this.boundValues;
      const item: WatchItem = {
        id: id as string,
        subjectPattern: subjectPattern as string,
        matchMode: matchMode as MatchMode,
        createdAt: new Date(createdAt as string),
      };
      this.db.getWatchItems().set(id as string, item);
    }
    
    // Watch Hits
    else if (sqlLower.includes('insert into watch_hits')) {
      const [id, watchId, recipient, hitAt] = this.boundValues;
      const hits = this.db.getWatchHits().get(watchId as string) || [];
      hits.push({
        id: id as string,
        watchId: watchId as string,
        recipient: recipient as string,
        hitAt: new Date(hitAt as string),
      });
      this.db.getWatchHits().set(watchId as string, hits);
    }
    
    // Update filter rules
    else if (sqlLower.includes('update filter_rules set')) {
      const id = this.boundValues[this.boundValues.length - 1] as string;
      const existing = this.db.getFilterRules().get(id);
      if (existing) {
        const setClause = this.sql.substring(
          this.sql.toLowerCase().indexOf('set ') + 4,
          this.sql.toLowerCase().indexOf(' where')
        );
        const fields = setClause.split(',').map(f => f.trim().split('=')[0].trim().toLowerCase());
        
        let valueIndex = 0;
        for (const field of fields) {
          const value = this.boundValues[valueIndex];
          switch (field) {
            case 'category': existing.category = value as RuleCategory; break;
            case 'match_type': existing.matchType = value as MatchType; break;
            case 'match_mode': existing.matchMode = value as MatchMode; break;
            case 'pattern': existing.pattern = value as string; break;
            case 'enabled': existing.enabled = value === 1; break;
            case 'updated_at': existing.updatedAt = new Date(value as string); break;
            case 'last_hit_at': existing.lastHitAt = new Date(value as string); break;
          }
          valueIndex++;
        }
        this.db.getFilterRules().set(id, existing);
      }
    }
    
    // Update rule stats
    else if (sqlLower.includes('update rule_stats')) {
      const ruleId = this.boundValues[this.boundValues.length - 1] as string;
      const existing = this.db.getRuleStats().get(ruleId);
      if (existing) {
        if (sqlLower.includes('total_processed = total_processed + 1')) {
          existing.totalProcessed += 1;
          if (sqlLower.includes('deleted_count = deleted_count + 1')) {
            existing.deletedCount += 1;
          }
          if (sqlLower.includes('error_count = error_count + 1')) {
            existing.errorCount += 1;
          }
          existing.lastUpdated = new Date(this.boundValues[0] as string);
        }
        this.db.getRuleStats().set(ruleId, existing);
      }
    }
    
    // Delete operations
    else if (sqlLower.includes('delete from rule_stats where rule_id')) {
      const id = this.boundValues[0] as string;
      this.db.getRuleStats().delete(id);
    }
    else if (sqlLower.includes('delete from filter_rules where id')) {
      const id = this.boundValues[0] as string;
      this.db.getFilterRules().delete(id);
    }
    else if (sqlLower.includes('delete from watch_hits where watch_id')) {
      const watchId = this.boundValues[0] as string;
      this.db.getWatchHits().delete(watchId);
    }
    else if (sqlLower.includes('delete from watch_items where id')) {
      const id = this.boundValues[0] as string;
      this.db.getWatchItems().delete(id);
    }
    
    return { success: true, meta: { changes: 1 } };
  }

  async first<T>(): Promise<T | null> {
    const sqlLower = this.sql.toLowerCase();
    
    // Filter Rules
    if (sqlLower.includes('select * from filter_rules where id =')) {
      const id = this.boundValues[0] as string;
      const rule = this.db.getFilterRules().get(id);
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
    
    // Process Logs
    if (sqlLower.includes('select * from process_logs where id =')) {
      const id = this.boundValues[0] as string;
      const log = this.db.getProcessLogs().get(id);
      if (!log) return null;
      return {
        id: log.id,
        recipient: log.recipient,
        sender: log.sender,
        sender_email: log.senderEmail,
        subject: log.subject,
        processed_at: log.processedAt.toISOString(),
        action: log.action,
        matched_rule_id: log.matchedRuleId || null,
        matched_rule_category: log.matchedRuleCategory || null,
        error_message: log.errorMessage || null,
      } as T;
    }
    
    // Rule Stats - must check before other queries to avoid false matches
    if (sqlLower.includes('from rule_stats') && sqlLower.includes('where rule_id')) {
      const ruleId = this.boundValues[0] as string;
      const stats = this.db.getRuleStats().get(ruleId);
      if (!stats) return null;
      const lastUpdated = stats.lastUpdated instanceof Date && !isNaN(stats.lastUpdated.getTime())
        ? stats.lastUpdated.toISOString()
        : new Date().toISOString();
      return {
        rule_id: stats.ruleId,
        total_processed: Number(stats.totalProcessed) || 0,
        deleted_count: Number(stats.deletedCount) || 0,
        error_count: Number(stats.errorCount) || 0,
        last_updated: lastUpdated,
      } as T;
    }
    
    // Watch Items
    if (sqlLower.includes('select * from watch_items where id =')) {
      const id = this.boundValues[0] as string;
      const item = this.db.getWatchItems().get(id);
      if (!item) return null;
      return {
        id: item.id,
        subject_pattern: item.subjectPattern,
        match_mode: item.matchMode,
        created_at: item.createdAt.toISOString(),
      } as T;
    }
    
    // Watch hit count
    if (sqlLower.includes('select count(*) as count from watch_hits')) {
      const watchId = this.boundValues[0] as string;
      const hits = this.db.getWatchHits().get(watchId) || [];
      return { count: hits.length } as T;
    }
    
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    const sqlLower = this.sql.toLowerCase();
    
    // Filter Rules
    if (sqlLower.includes('select * from filter_rules')) {
      let results = Array.from(this.db.getFilterRules().values());
      
      if (sqlLower.includes('where category =')) {
        const category = this.boundValues[0] as string;
        results = results.filter(r => r.category === category);
      }
      if (sqlLower.includes('where enabled =')) {
        results = results.filter(r => r.enabled);
      }
      
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
    
    // Process Logs
    if (sqlLower.includes('select * from process_logs')) {
      const results = Array.from(this.db.getProcessLogs().values());
      const rows = results.map(log => ({
        id: log.id,
        recipient: log.recipient,
        sender: log.sender,
        sender_email: log.senderEmail,
        subject: log.subject,
        processed_at: log.processedAt.toISOString(),
        action: log.action,
        matched_rule_id: log.matchedRuleId || null,
        matched_rule_category: log.matchedRuleCategory || null,
        error_message: log.errorMessage || null,
      }));
      return { results: rows as T[] };
    }
    
    // Watch Items
    if (sqlLower.includes('select * from watch_items')) {
      const results = Array.from(this.db.getWatchItems().values());
      const rows = results.map(item => ({
        id: item.id,
        subject_pattern: item.subjectPattern,
        match_mode: item.matchMode,
        created_at: item.createdAt.toISOString(),
      }));
      return { results: rows as T[] };
    }
    
    // Distinct recipients for watch
    if (sqlLower.includes('select distinct recipient from watch_hits')) {
      const watchId = this.boundValues[0] as string;
      const hits = this.db.getWatchHits().get(watchId) || [];
      const uniqueRecipients = [...new Set(hits.map(h => h.recipient))];
      return { results: uniqueRecipients.map(r => ({ recipient: r })) as T[] };
    }
    
    return { results: [] };
  }
}


// ============================================================================
// Import Repositories
// ============================================================================

import { RuleRepository } from './rule-repository.js';
import { ProcessLogRepository, CreateProcessLogDTO } from './process-log-repository.js';
import { StatsRepository } from './stats-repository.js';
import { WatchRepository } from './watch-repository.js';

// ============================================================================
// Arbitraries for Test Data Generation
// ============================================================================

const categoryArbitrary = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const matchTypeArbitrary = fc.constantFrom<MatchType>('sender_name', 'subject', 'sender_email');
const matchModeArbitrary = fc.constantFrom<MatchMode>('regex', 'contains');
const processActionArbitrary = fc.constantFrom<ProcessAction>('passed', 'deleted', 'error');

// Filter Rule DTO generator
const createRuleDTOArbitrary = fc.record({
  category: categoryArbitrary,
  matchType: matchTypeArbitrary,
  matchMode: matchModeArbitrary,
  pattern: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  enabled: fc.option(fc.boolean(), { nil: undefined }),
});

// Process Log DTO generator
const createProcessLogDTOArbitrary = fc.record({
  recipient: fc.emailAddress(),
  sender: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  senderEmail: fc.emailAddress(),
  subject: fc.string({ minLength: 0, maxLength: 200 }),
  action: processActionArbitrary,
  matchedRuleId: fc.option(fc.uuid(), { nil: undefined }),
  matchedRuleCategory: fc.option(categoryArbitrary, { nil: undefined }),
  errorMessage: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: undefined }),
});

// Watch Item generator
const watchItemArbitrary = fc.record({
  subjectPattern: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  matchMode: matchModeArbitrary,
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 18: 数据持久化Round-Trip', () => {
  let mockDb: MockD1Database;
  let ruleRepository: RuleRepository;
  let processLogRepository: ProcessLogRepository;
  let statsRepository: StatsRepository;
  let watchRepository: WatchRepository;

  beforeEach(() => {
    mockDb = new MockD1Database();
    ruleRepository = new RuleRepository(mockDb as unknown as D1Database);
    processLogRepository = new ProcessLogRepository(mockDb as unknown as D1Database);
    statsRepository = new StatsRepository(mockDb as unknown as D1Database);
    watchRepository = new WatchRepository(mockDb as unknown as D1Database);
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: Filter rules round-trip persistence
   * **Validates: Requirements 11.1**
   */
  it('FilterRule: 保存后重新加载应返回相同数据', async () => {
    await fc.assert(
      fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
        mockDb.clear();
        
        // Save the rule
        const created = await ruleRepository.create(dto);
        
        // Reload the rule
        const reloaded = await ruleRepository.findById(created.id);
        
        // Verify round-trip consistency
        expect(reloaded).not.toBeNull();
        expect(reloaded!.id).toBe(created.id);
        expect(reloaded!.category).toBe(dto.category);
        expect(reloaded!.matchType).toBe(dto.matchType);
        expect(reloaded!.matchMode).toBe(dto.matchMode);
        expect(reloaded!.pattern).toBe(dto.pattern);
        expect(reloaded!.enabled).toBe(dto.enabled ?? true);
        
        // Verify timestamps are preserved (within reasonable tolerance)
        expect(reloaded!.createdAt.getTime()).toBe(created.createdAt.getTime());
        expect(reloaded!.updatedAt.getTime()).toBe(created.updatedAt.getTime());
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: Multiple filter rules round-trip persistence
   * **Validates: Requirements 11.1**
   */
  it('FilterRule: 批量保存后重新加载应返回所有相同数据', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(createRuleDTOArbitrary, { minLength: 1, maxLength: 10 }),
        async (dtos) => {
          mockDb.clear();
          
          // Save all rules
          const createdRules: FilterRule[] = [];
          for (const dto of dtos) {
            const created = await ruleRepository.create(dto);
            createdRules.push(created);
          }
          
          // Reload all rules
          const reloadedRules = await ruleRepository.findAll();
          
          // Verify count matches
          expect(reloadedRules.length).toBe(createdRules.length);
          
          // Verify each rule can be found and matches
          for (const created of createdRules) {
            const reloaded = await ruleRepository.findById(created.id);
            expect(reloaded).not.toBeNull();
            expect(reloaded!.category).toBe(created.category);
            expect(reloaded!.matchType).toBe(created.matchType);
            expect(reloaded!.matchMode).toBe(created.matchMode);
            expect(reloaded!.pattern).toBe(created.pattern);
            expect(reloaded!.enabled).toBe(created.enabled);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: Process logs round-trip persistence
   * **Validates: Requirements 11.2**
   */
  it('ProcessLog: 保存后重新加载应返回相同数据', async () => {
    await fc.assert(
      fc.asyncProperty(createProcessLogDTOArbitrary, async (dto) => {
        mockDb.clear();
        
        // Save the log
        const created = await processLogRepository.create(dto as CreateProcessLogDTO);
        
        // Reload the log
        const reloaded = await processLogRepository.findById(created.id);
        
        // Verify round-trip consistency
        expect(reloaded).not.toBeNull();
        expect(reloaded!.id).toBe(created.id);
        expect(reloaded!.recipient).toBe(dto.recipient);
        expect(reloaded!.sender).toBe(dto.sender);
        expect(reloaded!.senderEmail).toBe(dto.senderEmail);
        expect(reloaded!.subject).toBe(dto.subject);
        expect(reloaded!.action).toBe(dto.action);
        
        // Optional fields
        if (dto.matchedRuleId) {
          expect(reloaded!.matchedRuleId).toBe(dto.matchedRuleId);
        }
        if (dto.matchedRuleCategory) {
          expect(reloaded!.matchedRuleCategory).toBe(dto.matchedRuleCategory);
        }
        if (dto.errorMessage) {
          expect(reloaded!.errorMessage).toBe(dto.errorMessage);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: Rule statistics round-trip persistence
   * **Validates: Requirements 11.3**
   */
  it('RuleStats: 保存后重新加载应返回相同数据', async () => {
    await fc.assert(
      fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
        mockDb.clear();
        
        // Create a rule (which also creates stats)
        const rule = await ruleRepository.create(dto);
        
        // Reload the stats
        const reloaded = await statsRepository.findByRuleId(rule.id);
        
        // Verify round-trip consistency
        expect(reloaded).not.toBeNull();
        expect(reloaded!.ruleId).toBe(rule.id);
        expect(reloaded!.totalProcessed).toBe(0);
        expect(reloaded!.deletedCount).toBe(0);
        expect(reloaded!.errorCount).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: Watch items round-trip persistence
   * **Validates: Requirements 11.1**
   */
  it('WatchItem: 保存后重新加载应返回相同数据', async () => {
    await fc.assert(
      fc.asyncProperty(watchItemArbitrary, async (item) => {
        mockDb.clear();
        
        // Save the watch item
        const created = await watchRepository.create(item.subjectPattern, item.matchMode);
        
        // Reload the watch item
        const reloaded = await watchRepository.findById(created.id);
        
        // Verify round-trip consistency
        expect(reloaded).not.toBeNull();
        expect(reloaded!.id).toBe(created.id);
        expect(reloaded!.subjectPattern).toBe(item.subjectPattern);
        expect(reloaded!.matchMode).toBe(item.matchMode);
        expect(reloaded!.createdAt.getTime()).toBe(created.createdAt.getTime());
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: System restart simulation - all data should be recoverable
   * **Validates: Requirements 11.4**
   */
  it('系统重启后应能恢复所有配置和统计数据', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(createRuleDTOArbitrary, { minLength: 1, maxLength: 5 }),
        fc.array(watchItemArbitrary, { minLength: 1, maxLength: 5 }),
        async (ruleDtos, watchItems) => {
          mockDb.clear();
          
          // Save rules
          const createdRules: FilterRule[] = [];
          for (const dto of ruleDtos) {
            const created = await ruleRepository.create(dto);
            createdRules.push(created);
          }
          
          // Save watch items
          const createdWatches: WatchItem[] = [];
          for (const item of watchItems) {
            const created = await watchRepository.create(item.subjectPattern, item.matchMode);
            createdWatches.push(created);
          }
          
          // Simulate "restart" by creating new repository instances
          // (In real scenario, this would be reconnecting to the same database)
          const newRuleRepo = new RuleRepository(mockDb as unknown as D1Database);
          const newWatchRepo = new WatchRepository(mockDb as unknown as D1Database);
          const newStatsRepo = new StatsRepository(mockDb as unknown as D1Database);
          
          // Verify all rules are recoverable
          const recoveredRules = await newRuleRepo.findAll();
          expect(recoveredRules.length).toBe(createdRules.length);
          
          for (const original of createdRules) {
            const recovered = await newRuleRepo.findById(original.id);
            expect(recovered).not.toBeNull();
            expect(recovered!.category).toBe(original.category);
            expect(recovered!.pattern).toBe(original.pattern);
          }
          
          // Verify all watch items are recoverable
          const recoveredWatches = await newWatchRepo.findAll();
          expect(recoveredWatches.length).toBe(createdWatches.length);
          
          for (const original of createdWatches) {
            const recovered = await newWatchRepo.findById(original.id);
            expect(recovered).not.toBeNull();
            expect(recovered!.subjectPattern).toBe(original.subjectPattern);
          }
          
          // Verify all stats are recoverable
          for (const rule of createdRules) {
            const stats = await newStatsRepo.findByRuleId(rule.id);
            expect(stats).not.toBeNull();
            expect(stats!.ruleId).toBe(rule.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: Updated data should persist correctly
   * **Validates: Requirements 11.1, 11.3**
   */
  it('更新后的数据应正确持久化', async () => {
    await fc.assert(
      fc.asyncProperty(
        createRuleDTOArbitrary,
        fc.record({
          category: fc.option(categoryArbitrary, { nil: undefined }),
          pattern: fc.option(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { nil: undefined }),
          enabled: fc.option(fc.boolean(), { nil: undefined }),
        }),
        async (createDto, updateDto) => {
          mockDb.clear();
          
          // Create initial rule
          const created = await ruleRepository.create(createDto);
          
          // Update the rule
          await ruleRepository.update(created.id, updateDto);
          
          // Reload and verify
          const reloaded = await ruleRepository.findById(created.id);
          
          expect(reloaded).not.toBeNull();
          expect(reloaded!.category).toBe(updateDto.category ?? createDto.category);
          expect(reloaded!.pattern).toBe(updateDto.pattern ?? createDto.pattern);
          
          const expectedEnabled = updateDto.enabled !== undefined 
            ? updateDto.enabled 
            : (createDto.enabled ?? true);
          expect(reloaded!.enabled).toBe(expectedEnabled);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: email-filter-management, Property 18: 数据持久化Round-Trip**
   * Test: Deleted data should not be recoverable
   * **Validates: Requirements 11.1**
   */
  it('删除的数据不应被恢复', async () => {
    await fc.assert(
      fc.asyncProperty(createRuleDTOArbitrary, async (dto) => {
        mockDb.clear();
        
        // Create and then delete
        const created = await ruleRepository.create(dto);
        await ruleRepository.delete(created.id);
        
        // Verify rule is not recoverable
        const reloaded = await ruleRepository.findById(created.id);
        expect(reloaded).toBeNull();
        
        // Verify associated stats are also deleted
        const stats = await statsRepository.findByRuleId(created.id);
        expect(stats).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
