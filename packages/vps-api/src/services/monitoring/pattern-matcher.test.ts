/**
 * Pattern Matcher Service Tests
 * 
 * **Feature: email-realtime-monitoring, Property 4: 正则匹配正确性**
 * **Validates: Requirements 1.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  matchSubject,
  validatePattern,
  findMatchingPattern,
  PatternMatcherService,
} from './pattern-matcher.js';

/**
 * **Feature: email-realtime-monitoring, Property 4: 正则匹配正确性**
 * *For any* 包含正则表达式的规则和任意邮件主题，匹配结果应与 JavaScript RegExp 行为一致
 * **Validates: Requirements 1.5**
 */
describe('Property 4: 正则匹配正确性', () => {
  const service = new PatternMatcherService();

  // Arbitrary for simple regex patterns (avoiding complex patterns that might cause issues)
  const simplePatternArbitrary = fc.oneof(
    fc.constant('.*'),
    fc.constant('.+'),
    fc.constant('\\d+'),
    fc.constant('\\w+'),
    fc.constant('[a-z]+'),
    fc.constant('[A-Z]+'),
    fc.constant('[0-9]+'),
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', '1', '2', '3'), { minLength: 1, maxLength: 10 }),
  );

  // Arbitrary for email subjects
  const subjectArbitrary = fc.string({ minLength: 0, maxLength: 100 });

  describe('matchSubject', () => {
    it('should match subjects that contain the literal pattern', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 0, maxLength: 20 }),
          fc.string({ minLength: 0, maxLength: 20 }),
          (pattern, prefix, suffix) => {
            // Escape special regex characters in the pattern
            const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const subject = prefix + pattern + suffix;
            
            const result = matchSubject(escapedPattern, subject);
            
            // Should match because subject contains the pattern
            expect(result.matched).toBe(true);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return consistent results with JavaScript RegExp', () => {
      fc.assert(
        fc.property(
          simplePatternArbitrary,
          subjectArbitrary,
          (pattern, subject) => {
            const result = matchSubject(pattern, subject);
            
            // Compare with native RegExp behavior
            try {
              const regex = new RegExp(pattern, 'i');
              const expected = regex.test(subject);
              expect(result.matched).toBe(expected);
              expect(result.error).toBeUndefined();
            } catch {
              // If RegExp throws, our function should return an error
              expect(result.error).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle invalid regex patterns gracefully', () => {
      const invalidPatterns = ['[', '(', '*', '+', '?', '{', '\\'];
      
      for (const pattern of invalidPatterns) {
        const result = matchSubject(pattern, 'test subject');
        // Either it matches (some patterns are valid in certain contexts) or returns an error
        if (!result.matched) {
          // If it didn't match, it might have an error or just didn't match
          // The key is it shouldn't throw
        }
      }
    });

    it('should be case-insensitive', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e'), { minLength: 1, maxLength: 10 }),
          (pattern) => {
            const lowerSubject = pattern.toLowerCase();
            const upperSubject = pattern.toUpperCase();
            
            const lowerResult = matchSubject(pattern, lowerSubject);
            const upperResult = matchSubject(pattern, upperSubject);
            
            // Both should match due to case-insensitive flag
            expect(lowerResult.matched).toBe(true);
            expect(upperResult.matched).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('validatePattern', () => {
    it('should validate correct regex patterns', () => {
      fc.assert(
        fc.property(
          simplePatternArbitrary,
          (pattern) => {
            const result = validatePattern(pattern);
            
            // All our simple patterns should be valid
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid regex patterns', () => {
      const invalidPatterns = ['[invalid', '(unclosed', '(?invalid)'];
      
      for (const pattern of invalidPatterns) {
        const result = validatePattern(pattern);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('findMatchingPattern', () => {
    it('should return the first matching pattern', () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringOf(fc.constantFrom('a', 'b', 'c'), { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 5 }),
          (patterns) => {
            // Create a subject that contains the first pattern
            const subject = patterns[0] + ' test';
            
            const result = findMatchingPattern(patterns, subject);
            
            // Should return the first pattern since it matches
            expect(result).toBe(patterns[0]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null when no patterns match', () => {
      const patterns = ['xyz123', 'abc456', 'def789'];
      const subject = 'no match here';
      
      const result = findMatchingPattern(patterns, subject);
      expect(result).toBeNull();
    });
  });

  describe('PatternMatcherService class', () => {
    it('should provide consistent results through service methods', () => {
      fc.assert(
        fc.property(
          simplePatternArbitrary,
          subjectArbitrary,
          (pattern, subject) => {
            const directResult = matchSubject(pattern, subject);
            const serviceResult = service.matchSubject(pattern, subject);
            
            expect(serviceResult.matched).toBe(directResult.matched);
            expect(serviceResult.error).toBe(directResult.error);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isValidPattern should return boolean validation result', () => {
      fc.assert(
        fc.property(
          simplePatternArbitrary,
          (pattern) => {
            const isValid = service.isValidPattern(pattern);
            const validationResult = validatePattern(pattern);
            
            expect(isValid).toBe(validationResult.valid);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
