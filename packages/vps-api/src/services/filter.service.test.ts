import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { FilterRule, EmailWebhookPayload, RuleCategory, MatchType, MatchMode } from '@email-filter/shared';
import { filterEmail, groupRulesByCategory, FilterService } from './filter.service.js';

// Arbitraries for generating valid rule data
const categoryArb = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const matchTypeArb = fc.constantFrom<MatchType>('sender', 'subject', 'domain');
const matchModeArb = fc.constantFrom<MatchMode>('exact', 'contains', 'startsWith', 'endsWith', 'regex');

// Generate non-empty pattern strings (avoid empty patterns)
const patternArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0 && !s.includes('\n'));

// Generate valid email addresses
const emailArb = fc.emailAddress();

// Generate valid subjects
const subjectArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

// Generate a valid FilterRule
const filterRuleArb = (category?: RuleCategory): fc.Arbitrary<FilterRule> =>
  fc.record({
    id: fc.uuid(),
    category: category ? fc.constant(category) : categoryArb,
    matchType: matchTypeArb,
    matchMode: matchModeArb,
    pattern: patternArb,
    enabled: fc.constant(true), // For testing, we want enabled rules
    createdAt: fc.date(),
    updatedAt: fc.date(),
    lastHitAt: fc.option(fc.date(), { nil: undefined }),
  });

// Generate a valid EmailWebhookPayload
const emailPayloadArb: fc.Arbitrary<EmailWebhookPayload> = fc.record({
  from: emailArb,
  to: emailArb,
  subject: subjectArb,
  messageId: fc.uuid(),
  timestamp: fc.integer({ min: 0 }),
});

// Generate a rule that will match a given payload
function createMatchingRule(
  payload: EmailWebhookPayload,
  category: RuleCategory,
  matchType: MatchType
): FilterRule {
  let pattern: string;
  
  switch (matchType) {
    case 'sender':
      pattern = payload.from;
      break;
    case 'subject':
      pattern = payload.subject;
      break;
    case 'domain':
      // Extract domain from email
      const atIndex = payload.from.lastIndexOf('@');
      pattern = atIndex !== -1 ? payload.from.substring(atIndex + 1) : payload.from;
      break;
  }

  return {
    id: crypto.randomUUID(),
    category,
    matchType,
    matchMode: 'exact',
    pattern,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('FilterService', () => {
  const defaultForwardTo = 'default@example.com';

  describe('groupRulesByCategory', () => {
    it('should correctly group rules by category', () => {
      fc.assert(
        fc.property(
          fc.array(filterRuleArb(), { minLength: 0, maxLength: 20 }),
          (rules) => {
            const grouped = groupRulesByCategory(rules);
            
            // All whitelist rules should be in whitelist group
            const whitelistCount = rules.filter(r => r.category === 'whitelist').length;
            expect(grouped.whitelist.length).toBe(whitelistCount);
            
            // All blacklist rules should be in blacklist group
            const blacklistCount = rules.filter(r => r.category === 'blacklist').length;
            expect(grouped.blacklist.length).toBe(blacklistCount);
            
            // All dynamic rules should be in dynamic group
            const dynamicCount = rules.filter(r => r.category === 'dynamic').length;
            expect(grouped.dynamic.length).toBe(dynamicCount);
            
            // Total should match
            expect(grouped.whitelist.length + grouped.blacklist.length + grouped.dynamic.length)
              .toBe(rules.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: vps-email-filter, Property 3: 白名单优先级**
   * **Validates: Requirements 4.3**
   * 
   * For any email that matches both whitelist and blacklist rules,
   * the system should return "forward" action (whitelist takes priority).
   */
  describe('Property 3: 白名单优先级', () => {
    it('should forward email when it matches both whitelist and blacklist rules', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          (payload, matchType) => {
            // Create a whitelist rule that matches the payload
            const whitelistRule = createMatchingRule(payload, 'whitelist', matchType);
            
            // Create a blacklist rule that also matches the payload
            const blacklistRule = createMatchingRule(payload, 'blacklist', matchType);
            
            // Process with both rules
            const rules = [whitelistRule, blacklistRule];
            const result = filterEmail(payload, rules, defaultForwardTo);
            
            // Whitelist should take priority - action should be 'forward'
            expect(result.action).toBe('forward');
            expect(result.matchedCategory).toBe('whitelist');
            expect(result.matchedRule?.id).toBe(whitelistRule.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should forward email when whitelist matches regardless of blacklist order', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          fc.boolean(), // Whether to put blacklist first
          (payload, matchType, blacklistFirst) => {
            const whitelistRule = createMatchingRule(payload, 'whitelist', matchType);
            const blacklistRule = createMatchingRule(payload, 'blacklist', matchType);
            
            // Test with different rule orders
            const rules = blacklistFirst 
              ? [blacklistRule, whitelistRule]
              : [whitelistRule, blacklistRule];
            
            const result = filterEmail(payload, rules, defaultForwardTo);
            
            // Whitelist should always take priority regardless of order
            expect(result.action).toBe('forward');
            expect(result.matchedCategory).toBe('whitelist');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should forward email when whitelist matches with dynamic rules present', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          (payload, matchType) => {
            const whitelistRule = createMatchingRule(payload, 'whitelist', matchType);
            const blacklistRule = createMatchingRule(payload, 'blacklist', matchType);
            const dynamicRule = createMatchingRule(payload, 'dynamic', matchType);
            
            const rules = [blacklistRule, dynamicRule, whitelistRule];
            const result = filterEmail(payload, rules, defaultForwardTo);
            
            // Whitelist should take priority over all
            expect(result.action).toBe('forward');
            expect(result.matchedCategory).toBe('whitelist');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: vps-email-filter, Property 4: 黑名单过滤**
   * **Validates: Requirements 4.2**
   * 
   * For any email that matches only blacklist rules (no whitelist match),
   * the system should return "drop" action.
   */
  describe('Property 4: 黑名单过滤', () => {
    it('should drop email when it matches only blacklist rules', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          (payload, matchType) => {
            // Create a blacklist rule that matches the payload
            const blacklistRule = createMatchingRule(payload, 'blacklist', matchType);
            
            // No whitelist rules
            const rules = [blacklistRule];
            const result = filterEmail(payload, rules, defaultForwardTo);
            
            // Should drop the email
            expect(result.action).toBe('drop');
            expect(result.matchedCategory).toBe('blacklist');
            expect(result.matchedRule?.id).toBe(blacklistRule.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should drop email when blacklist matches and whitelist does not match', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          (payload, matchType) => {
            // Create a blacklist rule that matches
            const blacklistRule = createMatchingRule(payload, 'blacklist', matchType);
            
            // Create a whitelist rule that does NOT match (different pattern)
            const whitelistRule: FilterRule = {
              id: crypto.randomUUID(),
              category: 'whitelist',
              matchType,
              matchMode: 'exact',
              pattern: 'non-matching-pattern-xyz-123',
              enabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            
            const rules = [whitelistRule, blacklistRule];
            const result = filterEmail(payload, rules, defaultForwardTo);
            
            // Should drop since whitelist doesn't match
            expect(result.action).toBe('drop');
            expect(result.matchedCategory).toBe('blacklist');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should drop email when dynamic rule matches and no whitelist', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          (payload, matchType) => {
            // Create a dynamic rule that matches
            const dynamicRule = createMatchingRule(payload, 'dynamic', matchType);
            
            const rules = [dynamicRule];
            const result = filterEmail(payload, rules, defaultForwardTo);
            
            // Should drop the email
            expect(result.action).toBe('drop');
            expect(result.matchedCategory).toBe('dynamic');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: vps-email-filter, Property 5: 默认转发**
   * **Validates: Requirements 4.4**
   * 
   * For any email that matches no rules,
   * the system should return "forward" action to the default destination.
   */
  describe('Property 5: 默认转发', () => {
    it('should forward email to default when no rules match', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          fc.emailAddress(), // Random default forward address
          (payload, forwardTo) => {
            // Empty rules - nothing matches
            const rules: FilterRule[] = [];
            const result = filterEmail(payload, rules, forwardTo);
            
            // Should forward to default
            expect(result.action).toBe('forward');
            expect(result.forwardTo).toBe(forwardTo);
            expect(result.matchedRule).toBeUndefined();
            expect(result.matchedCategory).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should forward email when rules exist but none match', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          fc.emailAddress(),
          (payload, forwardTo) => {
            // Create rules that won't match the payload
            const nonMatchingRules: FilterRule[] = [
              {
                id: crypto.randomUUID(),
                category: 'blacklist',
                matchType: 'sender',
                matchMode: 'exact',
                pattern: 'non-matching-sender@nowhere.invalid',
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              {
                id: crypto.randomUUID(),
                category: 'whitelist',
                matchType: 'subject',
                matchMode: 'exact',
                pattern: 'non-matching-subject-xyz-999',
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];
            
            const result = filterEmail(payload, nonMatchingRules, forwardTo);
            
            // Should forward to default since no rules match
            expect(result.action).toBe('forward');
            expect(result.forwardTo).toBe(forwardTo);
            expect(result.matchedRule).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not match disabled rules and forward to default', () => {
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          fc.emailAddress(),
          (payload, matchType, forwardTo) => {
            // Create a blacklist rule that would match but is disabled
            const disabledRule: FilterRule = {
              ...createMatchingRule(payload, 'blacklist', matchType),
              enabled: false, // Disabled!
            };
            
            const rules = [disabledRule];
            const result = filterEmail(payload, rules, forwardTo);
            
            // Should forward since the matching rule is disabled
            expect(result.action).toBe('forward');
            expect(result.forwardTo).toBe(forwardTo);
            expect(result.matchedRule).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('FilterService class', () => {
    it('should process email and return correct decision', () => {
      const service = new FilterService(defaultForwardTo);
      
      fc.assert(
        fc.property(
          emailPayloadArb,
          matchTypeArb,
          categoryArb,
          (payload, matchType, category) => {
            const rule = createMatchingRule(payload, category, matchType);
            const result = service.processEmail(payload, [rule]);
            
            if (category === 'whitelist') {
              expect(result.action).toBe('forward');
            } else {
              expect(result.action).toBe('drop');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should convert result to API response format', () => {
      const service = new FilterService(defaultForwardTo);
      
      fc.assert(
        fc.property(
          emailPayloadArb,
          (payload) => {
            const result = service.processEmail(payload, []);
            const decision = service.toApiResponse(result);
            
            expect(decision.action).toBe(result.action);
            expect(decision.forwardTo).toBe(result.forwardTo);
            expect(decision.reason).toBe(result.reason);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
