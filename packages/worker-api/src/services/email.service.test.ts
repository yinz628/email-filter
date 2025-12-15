import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type {
  FilterRule,
  IncomingEmail,
  ProcessLog,
  LogFilter,
  RuleCategory,
  MatchType,
  MatchMode,
  ProcessAction,
} from '@email-filter/shared';
import { EmailService, EmailProcessingResult } from './email.service.js';
import { LogService, LogQueryResult } from './log.service.js';
import { ProcessLogRepository, CreateProcessLogDTO } from '../db/process-log-repository.js';
import { RuleRepository } from '../db/rule-repository.js';

// In-memory mock implementation of ProcessLogRepository for testing
class MockProcessLogRepository {
  private logs: Map<string, ProcessLog> = new Map();
  private idCounter = 0;

  async create(dto: CreateProcessLogDTO): Promise<ProcessLog> {
    const id = `log-${++this.idCounter}`;
    const log: ProcessLog = {
      id,
      recipient: dto.recipient,
      sender: dto.sender,
      senderEmail: dto.senderEmail,
      subject: dto.subject,
      processedAt: new Date(),
      action: dto.action,
      matchedRuleId: dto.matchedRuleId,
      matchedRuleCategory: dto.matchedRuleCategory,
      errorMessage: dto.errorMessage,
    };
    this.logs.set(id, log);
    return log;
  }

  async findById(id: string): Promise<ProcessLog | null> {
    return this.logs.get(id) ?? null;
  }

  async findWithFilter(filter: LogFilter): Promise<ProcessLog[]> {
    let results = Array.from(this.logs.values());

    // Time range filter
    if (filter.startDate) {
      results = results.filter(log => log.processedAt >= filter.startDate!);
    }
    if (filter.endDate) {
      results = results.filter(log => log.processedAt <= filter.endDate!);
    }

    // Action filter
    if (filter.action) {
      results = results.filter(log => log.action === filter.action);
    }

    // Rule category filter
    if (filter.ruleCategory) {
      results = results.filter(log => log.matchedRuleCategory === filter.ruleCategory);
    }


    // Sort by processedAt descending
    results.sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime());

    // Pagination
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    return results.slice(offset, offset + limit);
  }

  async countWithFilter(filter: Omit<LogFilter, 'limit' | 'offset'>): Promise<number> {
    let results = Array.from(this.logs.values());

    if (filter.startDate) {
      results = results.filter(log => log.processedAt >= filter.startDate!);
    }
    if (filter.endDate) {
      results = results.filter(log => log.processedAt <= filter.endDate!);
    }
    if (filter.action) {
      results = results.filter(log => log.action === filter.action);
    }
    if (filter.ruleCategory) {
      results = results.filter(log => log.matchedRuleCategory === filter.ruleCategory);
    }

    return results.length;
  }

  async deleteOlderThan(date: Date): Promise<number> {
    let count = 0;
    for (const [id, log] of this.logs) {
      if (log.processedAt < date) {
        this.logs.delete(id);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.logs.clear();
    this.idCounter = 0;
  }

  getLogs(): ProcessLog[] {
    return Array.from(this.logs.values());
  }
}

// In-memory mock implementation of RuleRepository for testing
class MockRuleRepository {
  private rules: Map<string, FilterRule> = new Map();
  private lastHitUpdates: Map<string, Date> = new Map();

  setRules(rules: FilterRule[]): void {
    this.rules.clear();
    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }
  }

  async findEnabled(): Promise<FilterRule[]> {
    return Array.from(this.rules.values()).filter(r => r.enabled);
  }

  async updateLastHitAt(id: string): Promise<void> {
    this.lastHitUpdates.set(id, new Date());
  }

  getLastHitUpdates(): Map<string, Date> {
    return this.lastHitUpdates;
  }

  clear(): void {
    this.rules.clear();
    this.lastHitUpdates.clear();
  }
}

// Arbitraries for generating test data
const emailArbitrary = fc.record({
  recipient: fc.emailAddress(),
  sender: fc.string({ minLength: 1, maxLength: 100 }),
  senderEmail: fc.emailAddress(),
  subject: fc.string({ minLength: 0, maxLength: 200 }),
  receivedAt: fc.date(),
});

// Use only 'sender' and 'subject' matchTypes for simpler testing
// 'domain' matching requires more complex email generation
const matchTypeArbitrary = fc.constantFrom<MatchType>('sender', 'subject');
const categoryArbitrary = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const actionArbitrary = fc.constantFrom<ProcessAction>('passed', 'deleted', 'error');

// Generate a valid contains pattern (non-empty string)
const containsPatternArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

// Generate an enabled rule with specific category
const enabledRuleArbitrary = fc.record({
  id: fc.uuid(),
  category: categoryArbitrary,
  matchType: matchTypeArbitrary,
  matchMode: fc.constant<MatchMode>('contains'),
  pattern: containsPatternArbitrary,
  enabled: fc.constant(true),
  createdAt: fc.date(),
  updatedAt: fc.date(),
  lastHitAt: fc.option(fc.date(), { nil: undefined }),
});

// Helper to create an email that matches a rule
function createMatchingEmail(rule: FilterRule, baseEmail: IncomingEmail): IncomingEmail {
  const email = { ...baseEmail };
  switch (rule.matchType) {
    case 'sender':
      email.sender = `prefix${rule.pattern}suffix`;
      break;
    case 'subject':
      email.subject = `prefix${rule.pattern}suffix`;
      break;
    case 'domain':
      // For domain matching with 'contains' mode, the pattern needs to be contained in the domain
      // The domain is extracted from senderEmail (part after @)
      // So we create a domain that contains the pattern
      email.senderEmail = `user@prefix${rule.pattern}suffix.com`;
      break;
  }
  return email;
}


describe('Email Service', () => {
  let mockProcessLogRepo: MockProcessLogRepository;
  let mockRuleRepo: MockRuleRepository;
  let emailService: EmailService;

  beforeEach(() => {
    mockProcessLogRepo = new MockProcessLogRepository();
    mockRuleRepo = new MockRuleRepository();
    emailService = new EmailService(
      mockProcessLogRepo as unknown as ProcessLogRepository,
      mockRuleRepo as unknown as RuleRepository
    );
  });

  /**
   * **Feature: email-filter-management, Property 12: 邮件处理日志完整性**
   * *For any* 被处理的邮件，处理日志应包含recipient、sender、subject和action字段，
   * 且当邮件命中规则时应包含matchedRuleId。
   * **Validates: Requirements 7.1, 7.2**
   */
  describe('Property 12: 邮件处理日志完整性', () => {
    it('process log should contain recipient, sender, subject, and action for any processed email', () => {
      return fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          fc.array(enabledRuleArbitrary, { minLength: 0, maxLength: 5 }),
          async (email, rules) => {
            // Clear state
            mockProcessLogRepo.clear();
            mockRuleRepo.clear();
            mockRuleRepo.setRules(rules);

            // Process the email
            const result = await emailService.processEmail(email);

            // Verify log contains required fields
            expect(result.log).toBeDefined();
            expect(result.log.recipient).toBe(email.recipient);
            expect(result.log.sender).toBe(email.sender);
            expect(result.log.subject).toBe(email.subject);
            expect(['passed', 'deleted', 'error']).toContain(result.log.action);
            expect(result.log.processedAt).toBeInstanceOf(Date);
            expect(result.log.id).toBeDefined();
            expect(result.log.senderEmail).toBe(email.senderEmail);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('process log should contain matchedRuleId when email hits a rule', () => {
      return fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          enabledRuleArbitrary,
          async (baseEmail, rule) => {
            // Clear state
            mockProcessLogRepo.clear();
            mockRuleRepo.clear();

            // Create email that matches the rule
            const email = createMatchingEmail(rule, baseEmail);
            
            // Set up the rule (blacklist or dynamic to trigger deletion)
            const matchingRule: FilterRule = {
              ...rule,
              category: rule.category === 'whitelist' ? 'whitelist' : rule.category,
            };
            mockRuleRepo.setRules([matchingRule]);

            // Process the email
            const result = await emailService.processEmail(email);

            // Verify log contains matched rule info
            expect(result.log.matchedRuleId).toBe(matchingRule.id);
            expect(result.log.matchedRuleCategory).toBe(matchingRule.category);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('process log should NOT contain matchedRuleId when email does not hit any rule', () => {
      return fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          async (email) => {
            // Clear state
            mockProcessLogRepo.clear();
            mockRuleRepo.clear();

            // Set up rules that won't match
            const nonMatchingRule: FilterRule = {
              id: 'non-matching-rule',
              category: 'blacklist',
              matchType: 'subject',
              matchMode: 'contains',
              pattern: 'UNIQUE_PATTERN_THAT_WONT_MATCH_XYZ_999',
              enabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockRuleRepo.setRules([nonMatchingRule]);

            // Process the email
            const result = await emailService.processEmail(email);

            // Verify log does not contain matched rule info
            expect(result.log.matchedRuleId).toBeUndefined();
            expect(result.log.matchedRuleCategory).toBeUndefined();
            expect(result.log.action).toBe('passed');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('process log action should match process result action', () => {
      return fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          fc.array(enabledRuleArbitrary, { minLength: 0, maxLength: 5 }),
          async (email, rules) => {
            // Clear state
            mockProcessLogRepo.clear();
            mockRuleRepo.clear();
            mockRuleRepo.setRules(rules);

            // Process the email
            const result = await emailService.processEmail(email);

            // Verify log action matches result action
            expect(result.log.action).toBe(result.processResult.action);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Log Service', () => {
  let mockProcessLogRepo: MockProcessLogRepository;
  let logService: LogService;

  beforeEach(() => {
    mockProcessLogRepo = new MockProcessLogRepository();
    logService = new LogService(mockProcessLogRepo as unknown as ProcessLogRepository);
  });

  // Helper to create a log entry directly in the mock repository
  async function createLog(overrides: Partial<CreateProcessLogDTO> = {}): Promise<ProcessLog> {
    const dto: CreateProcessLogDTO = {
      recipient: overrides.recipient ?? 'test@example.com',
      sender: overrides.sender ?? 'Test Sender',
      senderEmail: overrides.senderEmail ?? 'sender@example.com',
      subject: overrides.subject ?? 'Test Subject',
      action: overrides.action ?? 'passed',
      matchedRuleId: overrides.matchedRuleId,
      matchedRuleCategory: overrides.matchedRuleCategory,
      errorMessage: overrides.errorMessage,
    };
    return mockProcessLogRepo.create(dto);
  }

  /**
   * **Feature: email-filter-management, Property 13: 处理日志筛选正确性**
   * *For any* 日志筛选条件，返回的日志应全部满足指定的时间范围、处理方式和规则类型条件。
   * **Validates: Requirements 7.3**
   */
  describe('Property 13: 处理日志筛选正确性', () => {
    it('logs filtered by action should all have the specified action', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(actionArbitrary, { minLength: 5, maxLength: 20 }),
          actionArbitrary,
          async (actions, filterAction) => {
            // Clear state
            mockProcessLogRepo.clear();

            // Create logs with various actions
            for (const action of actions) {
              await createLog({ action });
            }

            // Query with action filter
            const result = await logService.getLogsByAction(filterAction);

            // Verify all returned logs have the specified action
            for (const log of result.logs) {
              expect(log.action).toBe(filterAction);
            }

            // Verify count matches expected
            const expectedCount = actions.filter(a => a === filterAction).length;
            expect(result.logs.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('logs filtered by rule category should all have the specified category', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              action: actionArbitrary,
              category: fc.option(categoryArbitrary, { nil: undefined }),
            }),
            { minLength: 5, maxLength: 20 }
          ),
          categoryArbitrary,
          async (logConfigs, filterCategory) => {
            // Clear state
            mockProcessLogRepo.clear();

            // Create logs with various categories
            for (const config of logConfigs) {
              await createLog({
                action: config.action,
                matchedRuleCategory: config.category,
                matchedRuleId: config.category ? `rule-${config.category}` : undefined,
              });
            }

            // Query with category filter
            const result = await logService.getLogsByRuleCategory(filterCategory);

            // Verify all returned logs have the specified category
            for (const log of result.logs) {
              expect(log.matchedRuleCategory).toBe(filterCategory);
            }

            // Verify count matches expected
            const expectedCount = logConfigs.filter(c => c.category === filterCategory).length;
            expect(result.logs.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('logs filtered by time range should all be within the specified range', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          async (logCount) => {
            // Clear state
            mockProcessLogRepo.clear();

            // Create logs
            const logs: ProcessLog[] = [];
            for (let i = 0; i < logCount; i++) {
              const log = await createLog({ subject: `Log ${i}` });
              logs.push(log);
            }

            // Get the time range of created logs
            const times = logs.map(l => l.processedAt.getTime());
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);

            // Query with time range that includes all logs
            const startDate = new Date(minTime - 1000);
            const endDate = new Date(maxTime + 1000);
            const result = await logService.getLogsByTimeRange(startDate, endDate);

            // Verify all returned logs are within the time range
            for (const log of result.logs) {
              expect(log.processedAt.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
              expect(log.processedAt.getTime()).toBeLessThanOrEqual(endDate.getTime());
            }

            // All logs should be returned
            expect(result.logs.length).toBe(logCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('combined filters should return logs matching ALL conditions', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              action: actionArbitrary,
              category: fc.option(categoryArbitrary, { nil: undefined }),
            }),
            { minLength: 10, maxLength: 30 }
          ),
          actionArbitrary,
          categoryArbitrary,
          async (logConfigs, filterAction, filterCategory) => {
            // Clear state
            mockProcessLogRepo.clear();

            // Create logs with various configurations
            for (const config of logConfigs) {
              await createLog({
                action: config.action,
                matchedRuleCategory: config.category,
                matchedRuleId: config.category ? `rule-${config.category}` : undefined,
              });
            }

            // Query with combined filters
            const result = await logService.queryLogs({
              action: filterAction,
              ruleCategory: filterCategory,
            });

            // Verify all returned logs match BOTH conditions
            for (const log of result.logs) {
              expect(log.action).toBe(filterAction);
              expect(log.matchedRuleCategory).toBe(filterCategory);
            }

            // Verify count matches expected
            const expectedCount = logConfigs.filter(
              c => c.action === filterAction && c.category === filterCategory
            ).length;
            expect(result.logs.length).toBe(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('pagination should return correct subset of logs', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 10, max: 50 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 0, max: 20 }),
          async (totalLogs, limit, offset) => {
            // Clear state
            mockProcessLogRepo.clear();

            // Create logs
            for (let i = 0; i < totalLogs; i++) {
              await createLog({ subject: `Log ${i}` });
            }

            // Query with pagination
            const result = await logService.queryLogs({ limit, offset });

            // Verify pagination
            const expectedCount = Math.min(limit, Math.max(0, totalLogs - offset));
            expect(result.logs.length).toBe(expectedCount);
            expect(result.total).toBe(totalLogs);
            expect(result.limit).toBe(limit);
            expect(result.offset).toBe(offset);
            expect(result.hasMore).toBe(offset + result.logs.length < totalLogs);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty filter should return all logs (up to limit)', () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 50 }),
          async (logCount) => {
            // Clear state
            mockProcessLogRepo.clear();

            // Create logs
            for (let i = 0; i < logCount; i++) {
              await createLog({ subject: `Log ${i}` });
            }

            // Query with no filters
            const result = await logService.queryLogs({});

            // Should return all logs (up to default limit of 100)
            expect(result.logs.length).toBe(Math.min(logCount, 100));
            expect(result.total).toBe(logCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
