/**
 * Dynamic Pattern Cache Property Tests
 * 
 * Tests for the DynamicPatternCache class using property-based testing.
 * 
 * **Feature: api-worker-performance, Property 4: 动态 Pattern Set O(1) 查找**
 * **Validates: Requirements 2.4, 4.4**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { DynamicPatternCache } from './dynamic-pattern-cache.js';

// Arbitrary for generating pattern strings
const patternArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 });

// Arbitrary for generating arrays of patterns
const patternsArb: fc.Arbitrary<string[]> = fc.array(patternArb, { minLength: 0, maxLength: 100 });

describe('DynamicPatternCache', () => {
  let cache: DynamicPatternCache;

  beforeEach(() => {
    cache = new DynamicPatternCache();
  });

  /**
   * **Feature: api-worker-performance, Property 4: 动态 Pattern Set O(1) 查找**
   * **Validates: Requirements 2.4, 4.4**
   * 
   * *For any* size of the dynamic pattern Set (from 1 to 10000 patterns), 
   * the lookup time SHALL remain constant (O(1) time complexity).
   */
  describe('Property 4: O(1) Lookup Time Complexity', () => {
    it('lookup time remains constant regardless of set size', () => {
      fc.assert(
        fc.property(
          fc.array(patternArb, { minLength: 100, maxLength: 1000 }),
          fc.integer({ min: 0, max: 99 }),
          (patterns, lookupIndex) => {
            cache.clear();
            
            // Add all patterns
            for (const pattern of patterns) {
              cache.add(pattern);
            }
            
            // Get a pattern to look up (use one that exists)
            const patternToLookup = patterns[lookupIndex % patterns.length];
            
            // Measure lookup time for multiple iterations
            const iterations = 1000;
            const startTime = performance.now();
            
            for (let i = 0; i < iterations; i++) {
              cache.has(patternToLookup);
            }
            
            const endTime = performance.now();
            const avgTimeMs = (endTime - startTime) / iterations;
            
            // O(1) lookup should be very fast - less than 0.1ms per lookup
            // This is a generous threshold to account for test environment variations
            expect(avgTimeMs).toBeLessThan(0.1);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('lookup time does not scale linearly with set size', () => {
      fc.assert(
        fc.property(patternArb, (testPattern) => {
          // Test with small set
          const smallCache = new DynamicPatternCache();
          for (let i = 0; i < 100; i++) {
            smallCache.add(`pattern-${i}`);
          }
          smallCache.add(testPattern);
          
          // Test with large set
          const largeCache = new DynamicPatternCache();
          for (let i = 0; i < 10000; i++) {
            largeCache.add(`pattern-${i}`);
          }
          largeCache.add(testPattern);
          
          // Measure lookup times
          const iterations = 1000;
          
          const smallStart = performance.now();
          for (let i = 0; i < iterations; i++) {
            smallCache.has(testPattern);
          }
          const smallTime = performance.now() - smallStart;
          
          const largeStart = performance.now();
          for (let i = 0; i < iterations; i++) {
            largeCache.has(testPattern);
          }
          const largeTime = performance.now() - largeStart;
          
          // Large set lookup should not be significantly slower than small set
          // Allow up to 5x difference to account for hash collisions and test variance
          // For true O(1), the ratio should be close to 1
          const ratio = largeTime / smallTime;
          expect(ratio).toBeLessThan(5);
        }),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Basic functionality tests
   */
  describe('Basic Operations', () => {
    it('add and has work correctly', () => {
      fc.assert(
        fc.property(patternArb, (pattern) => {
          cache.clear();
          
          expect(cache.has(pattern)).toBe(false);
          
          cache.add(pattern);
          
          expect(cache.has(pattern)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('remove works correctly', () => {
      fc.assert(
        fc.property(patternArb, (pattern) => {
          cache.clear();
          
          cache.add(pattern);
          expect(cache.has(pattern)).toBe(true);
          
          const removed = cache.remove(pattern);
          expect(removed).toBe(true);
          expect(cache.has(pattern)).toBe(false);
          
          // Removing again should return false
          const removedAgain = cache.remove(pattern);
          expect(removedAgain).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('getSize returns correct count', () => {
      fc.assert(
        fc.property(patternsArb, (patterns) => {
          cache.clear();
          
          // Add all patterns
          for (const pattern of patterns) {
            cache.add(pattern);
          }
          
          // Size should equal unique patterns (Set deduplicates)
          const uniquePatterns = new Set(patterns.map(p => p.toLowerCase()));
          expect(cache.getSize()).toBe(uniquePatterns.size);
        }),
        { numRuns: 100 }
      );
    });

    it('clear resets the cache', () => {
      fc.assert(
        fc.property(patternsArb, (patterns) => {
          // Add patterns
          for (const pattern of patterns) {
            cache.add(pattern);
          }
          
          cache.clear();
          
          expect(cache.getSize()).toBe(0);
          expect(cache.isInitialized()).toBe(false);
          
          // All patterns should be gone
          for (const pattern of patterns) {
            expect(cache.has(pattern)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Case insensitivity tests
   */
  describe('Case Insensitivity', () => {
    it('patterns are case-insensitive', () => {
      fc.assert(
        fc.property(patternArb, (pattern) => {
          cache.clear();
          
          cache.add(pattern);
          
          // Should find regardless of case
          expect(cache.has(pattern.toLowerCase())).toBe(true);
          expect(cache.has(pattern.toUpperCase())).toBe(true);
          
          // Mixed case should also work
          const mixedCase = pattern.split('').map((c, i) => 
            i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
          ).join('');
          expect(cache.has(mixedCase)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * hasMatchingPattern tests
   */
  describe('hasMatchingPattern', () => {
    it('finds exact matches', () => {
      fc.assert(
        fc.property(patternArb, (pattern) => {
          cache.clear();
          
          cache.add(pattern);
          
          expect(cache.hasMatchingPattern(pattern)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('finds patterns contained in subject', () => {
      fc.assert(
        fc.property(
          patternArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (pattern, prefix, suffix) => {
            cache.clear();
            
            cache.add(pattern);
            
            // Subject that contains the pattern
            const subject = prefix + pattern + suffix;
            
            expect(cache.hasMatchingPattern(subject)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('finds subjects contained in patterns', () => {
      fc.assert(
        fc.property(
          patternArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (subject, prefix, suffix) => {
            cache.clear();
            
            // Pattern that contains the subject
            const pattern = prefix + subject + suffix;
            cache.add(pattern);
            
            expect(cache.hasMatchingPattern(subject)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns false for non-matching subjects', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 5, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 30, maxLength: 50 }),
          (patterns, subject) => {
            cache.clear();
            
            // Add patterns
            for (const pattern of patterns) {
              cache.add(pattern);
            }
            
            // Check if subject actually doesn't match any pattern
            const subjectLower = subject.toLowerCase();
            const hasMatch = patterns.some(p => {
              const patternLower = p.toLowerCase();
              return subjectLower.includes(patternLower) || patternLower.includes(subjectLower);
            });
            
            // Only test if there's no actual match
            fc.pre(!hasMatch);
            
            expect(cache.hasMatchingPattern(subject)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Statistics tracking tests
   */
  describe('Statistics', () => {
    it('tracks hits and misses correctly', () => {
      fc.assert(
        fc.property(
          patternsArb,
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1, max: 20 }),
          (patterns, hitCount, missCount) => {
            cache.clear();
            
            // Add patterns
            for (const pattern of patterns) {
              cache.add(pattern);
            }
            
            // Generate hits (lookup existing patterns)
            for (let i = 0; i < hitCount && patterns.length > 0; i++) {
              cache.has(patterns[i % patterns.length]);
            }
            
            // Generate misses (lookup non-existent patterns)
            for (let i = 0; i < missCount; i++) {
              cache.has(`definitely-not-in-cache-${i}-${Date.now()}`);
            }
            
            const stats = cache.getStats();
            
            // Hits should be at least hitCount (if patterns exist)
            if (patterns.length > 0) {
              expect(stats.hits).toBeGreaterThanOrEqual(hitCount);
            }
            
            // Misses should be at least missCount
            expect(stats.misses).toBeGreaterThanOrEqual(missCount);
            
            // Hit rate should be calculated correctly
            const total = stats.hits + stats.misses;
            if (total > 0) {
              expect(stats.hitRate).toBeCloseTo(stats.hits / total, 5);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * getAllPatterns tests
   */
  describe('getAllPatterns', () => {
    it('returns all patterns in lowercase', () => {
      fc.assert(
        fc.property(patternsArb, (patterns) => {
          cache.clear();
          
          for (const pattern of patterns) {
            cache.add(pattern);
          }
          
          const allPatterns = cache.getAllPatterns();
          
          // All returned patterns should be lowercase
          for (const pattern of allPatterns) {
            expect(pattern).toBe(pattern.toLowerCase());
          }
          
          // Should contain all unique lowercase patterns
          const expectedPatterns = new Set(patterns.map(p => p.toLowerCase()));
          expect(allPatterns.length).toBe(expectedPatterns.size);
        }),
        { numRuns: 100 }
      );
    });
  });
});
