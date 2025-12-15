import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  extractDomain,
  getEmailFieldValue,
  getWebhookFieldValue,
  matchPattern,
  matchesRule,
  matchesRuleWebhook,
  findMatchingRule,
  findMatchingRuleWebhook,
} from './matcher.js';
import type { FilterRule, IncomingEmail, EmailWebhookPayload, MatchType, MatchMode, RuleCategory } from '../types/index.js';

// Arbitraries for generating test data
const emailArbitrary = fc.record({
  recipient: fc.emailAddress(),
  sender: fc.string({ minLength: 1, maxLength: 100 }),
  senderEmail: fc.emailAddress(),
  subject: fc.string({ minLength: 0, maxLength: 200 }),
  receivedAt: fc.date(),
});

const webhookPayloadArbitrary = fc.record({
  from: fc.emailAddress(),
  to: fc.emailAddress(),
  subject: fc.string({ minLength: 0, maxLength: 200 }),
  messageId: fc.uuid(),
  timestamp: fc.integer({ min: 0 }),
});

const matchTypeArbitrary = fc.constantFrom<MatchType>('sender', 'subject', 'domain');
const matchModeArbitrary = fc.constantFrom<MatchMode>('exact', 'contains', 'startsWith', 'endsWith', 'regex');
const categoryArbitrary = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');

// Generate a valid pattern (non-empty string)
const patternArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim().length > 0);

const ruleArbitrary = fc.record({
  id: fc.uuid(),
  category: categoryArbitrary,
  matchType: matchTypeArbitrary,
  matchMode: matchModeArbitrary,
  pattern: patternArbitrary,
  enabled: fc.boolean(),
  createdAt: fc.date(),
  updatedAt: fc.date(),
  lastHitAt: fc.option(fc.date(), { nil: undefined }),
});

describe('Matcher Utils', () => {
  describe('extractDomain', () => {
    it('should extract domain from email address', () => {
      expect(extractDomain('user@example.com')).toBe('example.com');
      expect(extractDomain('test@sub.domain.org')).toBe('sub.domain.org');
    });

    it('should return lowercase domain', () => {
      expect(extractDomain('user@EXAMPLE.COM')).toBe('example.com');
    });

    it('should handle email without @ symbol', () => {
      expect(extractDomain('invalid')).toBe('invalid');
    });
  });

  describe('getEmailFieldValue', () => {
    it('should return sender for sender matchType', () => {
      fc.assert(
        fc.property(emailArbitrary, (email) => {
          expect(getEmailFieldValue(email, 'sender')).toBe(email.sender);
        }),
        { numRuns: 100 }
      );
    });

    it('should return subject for subject matchType', () => {
      fc.assert(
        fc.property(emailArbitrary, (email) => {
          expect(getEmailFieldValue(email, 'subject')).toBe(email.subject);
        }),
        { numRuns: 100 }
      );
    });

    it('should return domain for domain matchType', () => {
      fc.assert(
        fc.property(emailArbitrary, (email) => {
          const expected = extractDomain(email.senderEmail);
          expect(getEmailFieldValue(email, 'domain')).toBe(expected);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('getWebhookFieldValue', () => {
    it('should return from for sender matchType', () => {
      fc.assert(
        fc.property(webhookPayloadArbitrary, (payload) => {
          expect(getWebhookFieldValue(payload, 'sender')).toBe(payload.from);
        }),
        { numRuns: 100 }
      );
    });

    it('should return subject for subject matchType', () => {
      fc.assert(
        fc.property(webhookPayloadArbitrary, (payload) => {
          expect(getWebhookFieldValue(payload, 'subject')).toBe(payload.subject);
        }),
        { numRuns: 100 }
      );
    });

    it('should return domain for domain matchType', () => {
      fc.assert(
        fc.property(webhookPayloadArbitrary, (payload) => {
          const expected = extractDomain(payload.from);
          expect(getWebhookFieldValue(payload, 'domain')).toBe(expected);
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: vps-email-filter, Property 6: 匹配模式正确性**
   * *For any* 规则和邮件组合，exact/contains/startsWith/endsWith/regex 匹配模式应按预期工作。
   * **Validates: Requirements 4.5**
   */
  describe('Property 6: 匹配模式正确性', () => {
    describe('exact mode', () => {
      it('should match only when value equals pattern exactly (case-insensitive)', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 50 }),
            (pattern) => {
              // Exact match should succeed
              expect(matchPattern(pattern, pattern, 'exact')).toBe(true);
              // Case-insensitive
              expect(matchPattern(pattern.toUpperCase(), pattern.toLowerCase(), 'exact')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should NOT match when value contains pattern but is not equal', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (pattern, extra) => {
              // Adding extra characters should fail exact match
              const valueWithPrefix = extra + pattern;
              const valueWithSuffix = pattern + extra;
              expect(matchPattern(valueWithPrefix, pattern, 'exact')).toBe(false);
              expect(matchPattern(valueWithSuffix, pattern, 'exact')).toBe(false);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('contains mode', () => {
      it('should match when value contains pattern anywhere', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 0, maxLength: 10 }),
            fc.string({ minLength: 0, maxLength: 10 }),
            (pattern, prefix, suffix) => {
              const value = prefix + pattern + suffix;
              expect(matchPattern(value, pattern, 'contains')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should be case-insensitive', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /[a-zA-Z]/.test(s)),
            (pattern) => {
              expect(matchPattern(pattern.toUpperCase(), pattern.toLowerCase(), 'contains')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('startsWith mode', () => {
      it('should match when value starts with pattern', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 0, maxLength: 10 }),
            (pattern, suffix) => {
              const value = pattern + suffix;
              expect(matchPattern(value, pattern, 'startsWith')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should NOT match when pattern is in middle or end', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (pattern, prefix) => {
              const value = prefix + pattern;
              // Only fails if prefix is not empty and doesn't start with pattern
              if (!value.toLowerCase().startsWith(pattern.toLowerCase())) {
                expect(matchPattern(value, pattern, 'startsWith')).toBe(false);
              }
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should be case-insensitive', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /[a-zA-Z]/.test(s)),
            (pattern) => {
              expect(matchPattern(pattern.toUpperCase(), pattern.toLowerCase(), 'startsWith')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('endsWith mode', () => {
      it('should match when value ends with pattern', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 0, maxLength: 10 }),
            (pattern, prefix) => {
              const value = prefix + pattern;
              expect(matchPattern(value, pattern, 'endsWith')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should NOT match when pattern is in middle or start', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.string({ minLength: 1, maxLength: 10 }),
            (pattern, suffix) => {
              const value = pattern + suffix;
              // Only fails if suffix is not empty and doesn't end with pattern
              if (!value.toLowerCase().endsWith(pattern.toLowerCase())) {
                expect(matchPattern(value, pattern, 'endsWith')).toBe(false);
              }
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should be case-insensitive', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /[a-zA-Z]/.test(s)),
            (pattern) => {
              expect(matchPattern(pattern.toUpperCase(), pattern.toLowerCase(), 'endsWith')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });

    describe('regex mode', () => {
      it('should match using regex pattern', () => {
        // Test with escaped patterns that should match literally
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            (text) => {
              const escapedPattern = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              expect(matchPattern(text, escapedPattern, 'regex')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });

      it('should support regex anchors', () => {
        expect(matchPattern('hello world', '^hello', 'regex')).toBe(true);
        expect(matchPattern('say hello', '^hello', 'regex')).toBe(false);
        expect(matchPattern('hello world', 'world$', 'regex')).toBe(true);
        expect(matchPattern('world hello', 'world$', 'regex')).toBe(false);
      });

      it('should return false for invalid regex patterns', () => {
        const invalidPatterns = ['[', '(', '*', '+', '?'];
        for (const pattern of invalidPatterns) {
          expect(matchPattern('test', pattern, 'regex')).toBe(false);
        }
      });

      it('should be case-insensitive', () => {
        fc.assert(
          fc.property(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /[a-zA-Z]/.test(s)),
            (text) => {
              const escapedPattern = text.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              expect(matchPattern(text.toUpperCase(), escapedPattern, 'regex')).toBe(true);
            }
          ),
          { numRuns: 100 }
        );
      });
    });
  });


  describe('matchesRule', () => {
    it('should return false for disabled rules', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          ruleArbitrary,
          (email, baseRule) => {
            const disabledRule: FilterRule = { ...baseRule, enabled: false };
            expect(matchesRule(email, disabledRule)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match sender field correctly', () => {
      const email: IncomingEmail = {
        recipient: 'user@example.com',
        sender: 'Spammer Name',
        senderEmail: 'spam@spam.com',
        subject: 'Buy now!',
        receivedAt: new Date(),
      };

      const rule: FilterRule = {
        id: 'test-rule',
        category: 'blacklist',
        matchType: 'sender',
        matchMode: 'contains',
        pattern: 'Spammer',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(matchesRule(email, rule)).toBe(true);
    });

    it('should match domain field correctly', () => {
      const email: IncomingEmail = {
        recipient: 'user@example.com',
        sender: 'Someone',
        senderEmail: 'user@spam.com',
        subject: 'Hello',
        receivedAt: new Date(),
      };

      const rule: FilterRule = {
        id: 'test-rule',
        category: 'blacklist',
        matchType: 'domain',
        matchMode: 'exact',
        pattern: 'spam.com',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(matchesRule(email, rule)).toBe(true);
    });
  });

  describe('matchesRuleWebhook', () => {
    it('should return false for disabled rules', () => {
      fc.assert(
        fc.property(
          webhookPayloadArbitrary,
          ruleArbitrary,
          (payload, baseRule) => {
            const disabledRule: FilterRule = { ...baseRule, enabled: false };
            expect(matchesRuleWebhook(payload, disabledRule)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match sender field from webhook payload', () => {
      const payload: EmailWebhookPayload = {
        from: 'spammer@spam.com',
        to: 'user@example.com',
        subject: 'Buy now!',
        messageId: 'msg-123',
        timestamp: Date.now(),
      };

      const rule: FilterRule = {
        id: 'test-rule',
        category: 'blacklist',
        matchType: 'sender',
        matchMode: 'contains',
        pattern: 'spammer',
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(matchesRuleWebhook(payload, rule)).toBe(true);
    });
  });

  describe('findMatchingRule', () => {
    it('should return first matching rule', () => {
      const email: IncomingEmail = {
        recipient: 'user@example.com',
        sender: 'Spammer',
        senderEmail: 'spam@spam.com',
        subject: 'Buy now!',
        receivedAt: new Date(),
      };

      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          category: 'blacklist',
          matchType: 'sender',
          matchMode: 'contains',
          pattern: 'NoMatch',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'rule-2',
          category: 'blacklist',
          matchType: 'sender',
          matchMode: 'contains',
          pattern: 'Spam',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'rule-3',
          category: 'blacklist',
          matchType: 'subject',
          matchMode: 'contains',
          pattern: 'Buy',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = findMatchingRule(email, rules);
      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe('rule-2');
    });

    it('should return no match when no rules match', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          (email) => {
            const rules: FilterRule[] = [
              {
                id: 'rule-1',
                category: 'blacklist',
                matchType: 'sender',
                matchMode: 'contains',
                pattern: 'UNIQUE_PATTERN_THAT_WONT_MATCH_12345',
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ];

            const result = findMatchingRule(email, rules);
            expect(result.matched).toBe(false);
            expect(result.rule).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should skip disabled rules', () => {
      const email: IncomingEmail = {
        recipient: 'user@example.com',
        sender: 'Spammer',
        senderEmail: 'spam@spam.com',
        subject: 'Buy now!',
        receivedAt: new Date(),
      };

      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          category: 'blacklist',
          matchType: 'sender',
          matchMode: 'contains',
          pattern: 'Spam',
          enabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'rule-2',
          category: 'blacklist',
          matchType: 'subject',
          matchMode: 'contains',
          pattern: 'Buy',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = findMatchingRule(email, rules);
      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe('rule-2');
    });
  });

  describe('findMatchingRuleWebhook', () => {
    it('should return first matching rule for webhook payload', () => {
      const payload: EmailWebhookPayload = {
        from: 'spammer@spam.com',
        to: 'user@example.com',
        subject: 'Buy now!',
        messageId: 'msg-123',
        timestamp: Date.now(),
      };

      const rules: FilterRule[] = [
        {
          id: 'rule-1',
          category: 'blacklist',
          matchType: 'domain',
          matchMode: 'exact',
          pattern: 'spam.com',
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const result = findMatchingRuleWebhook(payload, rules);
      expect(result.matched).toBe(true);
      expect(result.rule?.id).toBe('rule-1');
    });
  });
});
