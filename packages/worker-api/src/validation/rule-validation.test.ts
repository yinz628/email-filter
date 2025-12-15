/**
 * Rule Validation Property Tests
 * 
 * **Feature: email-filter-management, Property 17: 规则验证**
 * **Validates: Requirements 10.1**
 * 
 * For any create rule request:
 * - When pattern is empty or matchType/matchMode is invalid, creation should be rejected
 * - When format is valid, creation should succeed
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { CreateRuleDTO, RuleCategory, MatchType, MatchMode } from '@email-filter/shared';
import { validateCreateRule, validateUpdateRule, isValidRegex } from './rule-validation.js';

const VALID_CATEGORIES: RuleCategory[] = ['whitelist', 'blacklist', 'dynamic'];
const VALID_MATCH_TYPES: MatchType[] = ['sender_name', 'subject', 'sender_email'];
const VALID_MATCH_MODES: MatchMode[] = ['regex', 'contains'];

// Generators for valid values
const validCategoryArb = fc.constantFrom(...VALID_CATEGORIES);
const validMatchTypeArb = fc.constantFrom(...VALID_MATCH_TYPES);
const validMatchModeArb = fc.constantFrom(...VALID_MATCH_MODES);

// Generator for non-empty patterns (for contains mode)
const nonEmptyPatternArb = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

// Generator for valid regex patterns
const validRegexPatternArb = fc.oneof(
  fc.constant('.*'),
  fc.constant('^test'),
  fc.constant('test$'),
  fc.constant('[a-z]+'),
  fc.constant('\\d+'),
  nonEmptyPatternArb.filter(s => isValidRegex(s))
);

// Generator for invalid values (not in valid set)
const invalidCategoryArb = fc.string().filter(s => !VALID_CATEGORIES.includes(s as RuleCategory));
const invalidMatchTypeArb = fc.string().filter(s => !VALID_MATCH_TYPES.includes(s as MatchType));
const invalidMatchModeArb = fc.string().filter(s => !VALID_MATCH_MODES.includes(s as MatchMode));

// Generator for empty/whitespace patterns
const emptyPatternArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t'),
  fc.constant('\n'),
  fc.stringOf(fc.constantFrom(' ', '\t', '\n'))
);

// Generator for invalid regex patterns
const invalidRegexPatternArb = fc.oneof(
  fc.constant('['),
  fc.constant('('),
  fc.constant('*'),
  fc.constant('+'),
  fc.constant('?'),
  fc.constant('[a-'),
  fc.constant('(?<invalid')
);


describe('Rule Validation Property Tests', () => {
  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Valid rule requests should pass validation
   */
  describe('Property 17: Valid rules should pass validation', () => {
    it('should accept valid rules with contains mode', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchTypeArb,
          nonEmptyPatternArb,
          fc.boolean(),
          (category, matchType, pattern, enabled) => {
            const dto: CreateRuleDTO = {
              category,
              matchType,
              matchMode: 'contains',
              pattern,
              enabled,
            };
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(true);
            expect(result.message).toBeUndefined();
            expect(result.details).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid rules with regex mode and valid regex pattern', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchTypeArb,
          validRegexPatternArb,
          fc.boolean(),
          (category, matchType, pattern, enabled) => {
            const dto: CreateRuleDTO = {
              category,
              matchType,
              matchMode: 'regex',
              pattern,
              enabled,
            };
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Invalid category should fail validation
   */
  describe('Property 17: Invalid category should fail validation', () => {
    it('should reject rules with invalid category', () => {
      fc.assert(
        fc.property(
          invalidCategoryArb,
          validMatchTypeArb,
          validMatchModeArb,
          nonEmptyPatternArb,
          (category, matchType, matchMode, pattern) => {
            const dto = {
              category,
              matchType,
              matchMode,
              pattern,
            } as CreateRuleDTO;
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.category).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Invalid matchType should fail validation
   */
  describe('Property 17: Invalid matchType should fail validation', () => {
    it('should reject rules with invalid matchType', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          invalidMatchTypeArb,
          validMatchModeArb,
          nonEmptyPatternArb,
          (category, matchType, matchMode, pattern) => {
            const dto = {
              category,
              matchType,
              matchMode,
              pattern,
            } as CreateRuleDTO;
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.matchType).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Invalid matchMode should fail validation
   */
  describe('Property 17: Invalid matchMode should fail validation', () => {
    it('should reject rules with invalid matchMode', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchTypeArb,
          invalidMatchModeArb,
          nonEmptyPatternArb,
          (category, matchType, matchMode, pattern) => {
            const dto = {
              category,
              matchType,
              matchMode,
              pattern,
            } as CreateRuleDTO;
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.matchMode).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Empty pattern should fail validation
   */
  describe('Property 17: Empty pattern should fail validation', () => {
    it('should reject rules with empty or whitespace-only pattern', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchTypeArb,
          validMatchModeArb,
          emptyPatternArb,
          (category, matchType, matchMode, pattern) => {
            const dto: CreateRuleDTO = {
              category,
              matchType,
              matchMode,
              pattern,
            };
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.pattern).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Invalid regex pattern should fail validation when matchMode is regex
   */
  describe('Property 17: Invalid regex pattern should fail validation', () => {
    it('should reject rules with invalid regex pattern when matchMode is regex', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchTypeArb,
          invalidRegexPatternArb,
          (category, matchType, pattern) => {
            const dto: CreateRuleDTO = {
              category,
              matchType,
              matchMode: 'regex',
              pattern,
            };
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.pattern).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Update validation should accept partial valid updates
   */
  describe('Property 17: Update validation should accept partial valid updates', () => {
    it('should accept valid partial updates', () => {
      fc.assert(
        fc.property(
          fc.record({
            category: fc.option(validCategoryArb, { nil: undefined }),
            matchType: fc.option(validMatchTypeArb, { nil: undefined }),
            matchMode: fc.option(fc.constant('contains' as MatchMode), { nil: undefined }),
            pattern: fc.option(nonEmptyPatternArb, { nil: undefined }),
            enabled: fc.option(fc.boolean(), { nil: undefined }),
          }),
          (dto) => {
            // Filter out undefined values
            const cleanDto = Object.fromEntries(
              Object.entries(dto).filter(([_, v]) => v !== undefined)
            );
            
            const result = validateUpdateRule(cleanDto);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 17: 规则验证**
   * **Validates: Requirements 10.1**
   * 
   * Property: Missing required fields should fail validation
   */
  describe('Property 17: Missing required fields should fail validation', () => {
    it('should reject rules with missing category', () => {
      fc.assert(
        fc.property(
          validMatchTypeArb,
          validMatchModeArb,
          nonEmptyPatternArb,
          (matchType, matchMode, pattern) => {
            const dto = {
              matchType,
              matchMode,
              pattern,
            } as CreateRuleDTO;
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.category).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject rules with missing matchType', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchModeArb,
          nonEmptyPatternArb,
          (category, matchMode, pattern) => {
            const dto = {
              category,
              matchMode,
              pattern,
            } as CreateRuleDTO;
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.matchType).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject rules with missing matchMode', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchTypeArb,
          nonEmptyPatternArb,
          (category, matchType, pattern) => {
            const dto = {
              category,
              matchType,
              pattern,
            } as CreateRuleDTO;
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.matchMode).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject rules with missing pattern', () => {
      fc.assert(
        fc.property(
          validCategoryArb,
          validMatchTypeArb,
          validMatchModeArb,
          (category, matchType, matchMode) => {
            const dto = {
              category,
              matchType,
              matchMode,
            } as CreateRuleDTO;
            
            const result = validateCreateRule(dto);
            expect(result.valid).toBe(false);
            expect(result.details?.pattern).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
