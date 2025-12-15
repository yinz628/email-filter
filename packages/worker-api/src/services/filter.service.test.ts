import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  filterEmail,
  groupRulesByCategory,
  matchesWhitelist,
  matchesBlacklist,
  matchesDynamicList,
  toProcessResult,
  FilterService,
} from './filter.service.js';
import type { FilterRule, IncomingEmail, MatchType, MatchMode, RuleCategory } from '@email-filter/shared';

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
const matchModeArbitrary = fc.constantFrom<MatchMode>('regex', 'contains');
const categoryArbitrary = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');

// Generate a valid contains pattern (non-empty string)
const containsPatternArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

// Rule arbitrary with specific category
const ruleWithCategoryArbitrary = (category: RuleCategory) => fc.record({
  id: fc.uuid(),
  category: fc.constant(category),
  matchType: matchTypeArbitrary,
  matchMode: fc.constant<MatchMode>('contains'), // Use contains for predictable matching
  pattern: containsPatternArbitrary,
  enabled: fc.boolean(),
  createdAt: fc.date(),
  updatedAt: fc.date(),
  lastHitAt: fc.option(fc.date(), { nil: undefined }),
});

// Generate an enabled rule with specific category
const enabledRuleWithCategoryArbitrary = (category: RuleCategory) => fc.record({
  id: fc.uuid(),
  category: fc.constant(category),
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

// Helper to create an email that does NOT match a rule
function createNonMatchingEmail(rule: FilterRule, baseEmail: IncomingEmail): IncomingEmail {
  const email = { ...baseEmail };
  const uniqueNonMatchingValue = 'UNIQUE_VALUE_THAT_WONT_MATCH_XYZ_123';
  switch (rule.matchType) {
    case 'sender':
      email.sender = uniqueNonMatchingValue;
      break;
    case 'subject':
      email.subject = uniqueNonMatchingValue;
      break;
    case 'domain':
      email.senderEmail = `${uniqueNonMatchingValue}@nomatch.com`;
      break;
  }
  return email;
}

describe('Filter Service', () => {
  describe('groupRulesByCategory', () => {
    it('should correctly group rules by category', () => {
      fc.assert(
        fc.property(
          fc.array(ruleWithCategoryArbitrary('whitelist'), { minLength: 0, maxLength: 5 }),
          fc.array(ruleWithCategoryArbitrary('blacklist'), { minLength: 0, maxLength: 5 }),
          fc.array(ruleWithCategoryArbitrary('dynamic'), { minLength: 0, maxLength: 5 }),
          (whitelistRules, blacklistRules, dynamicRules) => {
            const allRules = [...whitelistRules, ...blacklistRules, ...dynamicRules];
            const grouped = groupRulesByCategory(allRules);
            
            expect(grouped.whitelist.length).toBe(whitelistRules.length);
            expect(grouped.blacklist.length).toBe(blacklistRules.length);
            expect(grouped.dynamic.length).toBe(dynamicRules.length);
            
            // Verify all whitelist rules are in whitelist group
            for (const rule of grouped.whitelist) {
              expect(rule.category).toBe('whitelist');
            }
            for (const rule of grouped.blacklist) {
              expect(rule.category).toBe('blacklist');
            }
            for (const rule of grouped.dynamic) {
              expect(rule.category).toBe('dynamic');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 5: 白名单优先级**
   * *For any* 同时匹配白名单和黑名单/动态名单的邮件，处理结果应为passed（允许通过），而非deleted。
   * **Validates: Requirements 5.1**
   */
  describe('Property 5: 白名单优先级', () => {
    it('whitelist should take priority over blacklist', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('whitelist'),
          enabledRuleWithCategoryArbitrary('blacklist'),
          (baseEmail, whitelistRule, blacklistRule) => {
            // Make both rules match the same field with the same pattern
            const sharedPattern = whitelistRule.pattern;
            const matchingWhitelistRule: FilterRule = { ...whitelistRule };
            const matchingBlacklistRule: FilterRule = { 
              ...blacklistRule, 
              pattern: sharedPattern,
              matchType: whitelistRule.matchType, // Same match type
            };
            
            // Create email that matches both rules
            const email = createMatchingEmail(matchingWhitelistRule, baseEmail);
            
            const result = filterEmail(email, [matchingWhitelistRule, matchingBlacklistRule]);
            
            // Whitelist should take priority - email should pass
            expect(result.action).toBe('passed');
            expect(result.matchedCategory).toBe('whitelist');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('whitelist should take priority over dynamic list', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('whitelist'),
          enabledRuleWithCategoryArbitrary('dynamic'),
          (baseEmail, whitelistRule, dynamicRule) => {
            // Make both rules match the same field with the same pattern
            const sharedPattern = whitelistRule.pattern;
            const matchingWhitelistRule: FilterRule = { ...whitelistRule };
            const matchingDynamicRule: FilterRule = { 
              ...dynamicRule, 
              pattern: sharedPattern,
              matchType: whitelistRule.matchType,
            };
            
            // Create email that matches both rules
            const email = createMatchingEmail(matchingWhitelistRule, baseEmail);
            
            const result = filterEmail(email, [matchingWhitelistRule, matchingDynamicRule]);
            
            // Whitelist should take priority - email should pass
            expect(result.action).toBe('passed');
            expect(result.matchedCategory).toBe('whitelist');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('whitelist should take priority even when blacklist rule comes first in array', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('whitelist'),
          enabledRuleWithCategoryArbitrary('blacklist'),
          (baseEmail, whitelistRule, blacklistRule) => {
            const sharedPattern = whitelistRule.pattern;
            const matchingWhitelistRule: FilterRule = { ...whitelistRule };
            const matchingBlacklistRule: FilterRule = { 
              ...blacklistRule, 
              pattern: sharedPattern,
              matchType: whitelistRule.matchType,
            };
            
            const email = createMatchingEmail(matchingWhitelistRule, baseEmail);
            
            // Put blacklist rule FIRST in the array
            const result = filterEmail(email, [matchingBlacklistRule, matchingWhitelistRule]);
            
            // Whitelist should STILL take priority
            expect(result.action).toBe('passed');
            expect(result.matchedCategory).toBe('whitelist');
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: email-filter-management, Property 6: 黑名单和动态名单过滤**
   * *For any* 匹配黑名单或动态名单但不匹配白名单的邮件，处理结果应为deleted。
   * **Validates: Requirements 5.2, 5.3**
   */
  describe('Property 6: 黑名单和动态名单过滤', () => {
    it('email matching blacklist (without whitelist match) should be deleted', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('blacklist'),
          enabledRuleWithCategoryArbitrary('whitelist'),
          (baseEmail, blacklistRule, whitelistRule) => {
            // Create email that matches blacklist but NOT whitelist
            const email = createMatchingEmail(blacklistRule, baseEmail);
            
            // Make whitelist rule NOT match by using a unique pattern
            const nonMatchingWhitelistRule: FilterRule = {
              ...whitelistRule,
              pattern: 'UNIQUE_WHITELIST_PATTERN_THAT_WONT_MATCH_999',
            };
            
            const result = filterEmail(email, [nonMatchingWhitelistRule, blacklistRule]);
            
            expect(result.action).toBe('deleted');
            expect(result.matchedCategory).toBe('blacklist');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('email matching dynamic list (without whitelist match) should be deleted', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('dynamic'),
          enabledRuleWithCategoryArbitrary('whitelist'),
          (baseEmail, dynamicRule, whitelistRule) => {
            // Create email that matches dynamic list but NOT whitelist
            const email = createMatchingEmail(dynamicRule, baseEmail);
            
            // Make whitelist rule NOT match
            const nonMatchingWhitelistRule: FilterRule = {
              ...whitelistRule,
              pattern: 'UNIQUE_WHITELIST_PATTERN_THAT_WONT_MATCH_888',
            };
            
            const result = filterEmail(email, [nonMatchingWhitelistRule, dynamicRule]);
            
            expect(result.action).toBe('deleted');
            expect(result.matchedCategory).toBe('dynamic');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('blacklist should be checked before dynamic list', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('blacklist'),
          enabledRuleWithCategoryArbitrary('dynamic'),
          (baseEmail, blacklistRule, dynamicRule) => {
            // Make both rules match the same pattern
            const sharedPattern = blacklistRule.pattern;
            const matchingBlacklistRule: FilterRule = { ...blacklistRule };
            const matchingDynamicRule: FilterRule = { 
              ...dynamicRule, 
              pattern: sharedPattern,
              matchType: blacklistRule.matchType,
            };
            
            const email = createMatchingEmail(matchingBlacklistRule, baseEmail);
            
            const result = filterEmail(email, [matchingBlacklistRule, matchingDynamicRule]);
            
            // Blacklist should be checked first
            expect(result.action).toBe('deleted');
            expect(result.matchedCategory).toBe('blacklist');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('email not matching any rule should pass', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('blacklist'),
          enabledRuleWithCategoryArbitrary('dynamic'),
          (baseEmail, blacklistRule, dynamicRule) => {
            // Create rules that won't match
            const nonMatchingBlacklistRule: FilterRule = {
              ...blacklistRule,
              pattern: 'UNIQUE_BLACKLIST_PATTERN_NO_MATCH_777',
            };
            const nonMatchingDynamicRule: FilterRule = {
              ...dynamicRule,
              pattern: 'UNIQUE_DYNAMIC_PATTERN_NO_MATCH_666',
            };
            
            // Use base email which shouldn't match these unique patterns
            const result = filterEmail(baseEmail, [nonMatchingBlacklistRule, nonMatchingDynamicRule]);
            
            expect(result.action).toBe('passed');
            expect(result.matchedRule).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 7: 规则启用状态生效**
   * *For any* 过滤规则，当enabled为false时，该规则不应匹配任何邮件；
   * 当enabled为true时，该规则应正常参与匹配。
   * **Validates: Requirements 5.4**
   */
  describe('Property 7: 规则启用状态生效', () => {
    it('disabled rules should not match any email', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          ruleWithCategoryArbitrary('blacklist'),
          (baseEmail, rule) => {
            // Create a disabled rule
            const disabledRule: FilterRule = { ...rule, enabled: false };
            
            // Create email that would match if rule was enabled
            const email = createMatchingEmail(disabledRule, baseEmail);
            
            const result = filterEmail(email, [disabledRule]);
            
            // Disabled rule should not match - email should pass
            expect(result.action).toBe('passed');
            expect(result.matchedRule).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('enabled rules should participate in matching', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('blacklist'),
          (baseEmail, rule) => {
            // Create email that matches the enabled rule
            const email = createMatchingEmail(rule, baseEmail);
            
            const result = filterEmail(email, [rule]);
            
            // Enabled rule should match
            expect(result.action).toBe('deleted');
            expect(result.matchedRule).toBeDefined();
            expect(result.matchedRule?.id).toBe(rule.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('disabled whitelist should not provide protection', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          ruleWithCategoryArbitrary('whitelist'),
          enabledRuleWithCategoryArbitrary('blacklist'),
          (baseEmail, whitelistRule, blacklistRule) => {
            // Disable the whitelist rule
            const disabledWhitelistRule: FilterRule = { ...whitelistRule, enabled: false };
            
            // Make both rules target the same pattern
            const sharedPattern = blacklistRule.pattern;
            const matchingDisabledWhitelist: FilterRule = {
              ...disabledWhitelistRule,
              pattern: sharedPattern,
              matchType: blacklistRule.matchType,
            };
            
            const email = createMatchingEmail(blacklistRule, baseEmail);
            
            const result = filterEmail(email, [matchingDisabledWhitelist, blacklistRule]);
            
            // Disabled whitelist should NOT protect - blacklist should match
            expect(result.action).toBe('deleted');
            expect(result.matchedCategory).toBe('blacklist');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('disabled blacklist should not delete emails', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          ruleWithCategoryArbitrary('blacklist'),
          (baseEmail, rule) => {
            // Disable the blacklist rule
            const disabledRule: FilterRule = { ...rule, enabled: false };
            
            // Create email that would match if rule was enabled
            const email = createMatchingEmail(disabledRule, baseEmail);
            
            const result = filterEmail(email, [disabledRule]);
            
            // Disabled blacklist should not delete - email should pass
            expect(result.action).toBe('passed');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('toProcessResult', () => {
    it('should convert FilterResult to ProcessResult correctly', () => {
      fc.assert(
        fc.property(
          enabledRuleWithCategoryArbitrary('blacklist'),
          (rule) => {
            const filterResult = {
              action: 'deleted' as const,
              matchedRule: rule,
              matchedCategory: 'blacklist' as const,
            };
            
            const processResult = toProcessResult(filterResult);
            
            expect(processResult.action).toBe('deleted');
            expect(processResult.matchedRule).toBeDefined();
            expect(processResult.matchedRule?.id).toBe(rule.id);
            expect(processResult.matchedRule?.category).toBe(rule.category);
            expect(processResult.matchedRule?.pattern).toBe(rule.pattern);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle results without matched rule', () => {
      const filterResult = {
        action: 'passed' as const,
      };
      
      const processResult = toProcessResult(filterResult);
      
      expect(processResult.action).toBe('passed');
      expect(processResult.matchedRule).toBeUndefined();
    });
  });

  describe('FilterService class', () => {
    it('should process emails correctly', () => {
      const service = new FilterService();
      
      fc.assert(
        fc.property(
          emailArbitrary,
          enabledRuleWithCategoryArbitrary('blacklist'),
          (baseEmail, rule) => {
            const email = createMatchingEmail(rule, baseEmail);
            
            const result = service.processEmail(email, [rule]);
            
            expect(result.action).toBe('deleted');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
