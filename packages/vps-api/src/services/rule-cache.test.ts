/**
 * Rule Cache Property Tests
 * 
 * Tests for the RuleCache class using property-based testing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { RuleCategory, MatchType, MatchMode } from '@email-filter/shared';
import type { FilterRuleWithWorker } from '../db/rule-repository.js';
import { RuleCache } from './rule-cache.js';

// Arbitrary for generating filter rules
const filterRuleArb: fc.Arbitrary<FilterRuleWithWorker> = fc.record({
  id: fc.uuid(),
  workerId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  category: fc.constantFrom('whitelist', 'blacklist', 'dynamic') as fc.Arbitrary<RuleCategory>,
  matchType: fc.constantFrom('sender', 'subject', 'domain') as fc.Arbitrary<MatchType>,
  matchMode: fc.constantFrom('exact', 'contains', 'startsWith', 'endsWith', 'regex') as fc.Arbitrary<MatchMode>,
  pattern: fc.string({ minLength: 1, maxLength: 100 }),
  tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
  enabled: fc.boolean(),
  createdAt: fc.date(),
  updatedAt: fc.date(),
  lastHitAt: fc.option(fc.date(), { nil: undefined }),
});

// Arbitrary for generating arrays of filter rules
const filterRulesArb: fc.Arbitrary<FilterRuleWithWorker[]> = fc.array(filterRuleArb, { minLength: 0, maxLength: 20 });

// Arbitrary for worker IDs (including undefined for global rules)
const workerIdArb: fc.Arbitrary<string | undefined> = fc.option(
  fc.string({ minLength: 1, maxLength: 50 }),
  { nil: undefined }
);

describe('RuleCache', () => {
  let cache: RuleCache;

  beforeEach(() => {
    cache = new RuleCache({
      ttlMs: 60000, // 60 seconds
      maxEntries: 100,
    });
  });

  /**
   * **Feature: webhook-response-optimization, Property 3: Cache Round Trip**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   * 
   * *For any* cached rules, retrieval should return same rules until TTL expires.
   */
  describe('Property 3: Cache Round Trip', () => {
    it('cached rules are retrieved unchanged before TTL expires', () => {
      fc.assert(
        fc.property(workerIdArb, filterRulesArb, (workerId, rules) => {
          cache.clear();
          
          // Set rules in cache
          cache.set(workerId, rules);
          
          // Get rules from cache
          const retrieved = cache.get(workerId);
          
          // Retrieved rules should equal original rules
          expect(retrieved).not.toBeNull();
          expect(retrieved).toHaveLength(rules.length);
          
          // Deep equality check for each rule
          for (let i = 0; i < rules.length; i++) {
            expect(retrieved![i].id).toBe(rules[i].id);
            expect(retrieved![i].category).toBe(rules[i].category);
            expect(retrieved![i].matchType).toBe(rules[i].matchType);
            expect(retrieved![i].matchMode).toBe(rules[i].matchMode);
            expect(retrieved![i].pattern).toBe(rules[i].pattern);
            expect(retrieved![i].enabled).toBe(rules[i].enabled);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('multiple gets return consistent results before TTL', () => {
      fc.assert(
        fc.property(
          workerIdArb,
          filterRulesArb,
          fc.integer({ min: 1, max: 10 }),
          (workerId, rules, numGets) => {
            cache.clear();
            
            cache.set(workerId, rules);
            
            // Multiple gets should return the same result
            const results: (FilterRuleWithWorker[] | null)[] = [];
            for (let i = 0; i < numGets; i++) {
              results.push(cache.get(workerId));
            }
            
            // All results should be equal
            for (let i = 1; i < results.length; i++) {
              expect(results[i]).toEqual(results[0]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cache returns null after TTL expires', async () => {
      // Use a very short TTL for testing
      const shortTtlCache = new RuleCache({
        ttlMs: 10, // 10ms TTL
        maxEntries: 100,
      });

      await fc.assert(
        fc.asyncProperty(workerIdArb, filterRulesArb, async (workerId, rules) => {
          shortTtlCache.clear();
          
          // Set rules in cache
          shortTtlCache.set(workerId, rules);
          
          // Immediately should be available
          expect(shortTtlCache.get(workerId)).not.toBeNull();
          
          // Wait for TTL to expire
          await new Promise(resolve => setTimeout(resolve, 20));
          
          // After TTL, should return null
          expect(shortTtlCache.get(workerId)).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('different worker IDs have independent cache entries', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          filterRulesArb,
          filterRulesArb,
          (workerId1, workerId2, rules1, rules2) => {
            // Skip if worker IDs are the same
            fc.pre(workerId1 !== workerId2);
            
            cache.clear();
            
            // Set different rules for different workers
            cache.set(workerId1, rules1);
            cache.set(workerId2, rules2);
            
            // Each worker should get their own rules
            const retrieved1 = cache.get(workerId1);
            const retrieved2 = cache.get(workerId2);
            
            expect(retrieved1).toHaveLength(rules1.length);
            expect(retrieved2).toHaveLength(rules2.length);
            
            // Verify rules are correct for each worker
            if (rules1.length > 0 && rules2.length > 0) {
              expect(retrieved1![0].id).toBe(rules1[0].id);
              expect(retrieved2![0].id).toBe(rules2[0].id);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('global rules (undefined workerId) are cached separately', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          filterRulesArb,
          filterRulesArb,
          (workerId, workerRules, globalRules) => {
            cache.clear();
            
            // Set rules for specific worker and global
            cache.set(workerId, workerRules);
            cache.set(undefined, globalRules);
            
            // Each should be independent
            const retrievedWorker = cache.get(workerId);
            const retrievedGlobal = cache.get(undefined);
            
            expect(retrievedWorker).toHaveLength(workerRules.length);
            expect(retrievedGlobal).toHaveLength(globalRules.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Cache invalidation tests
   * **Validates: Requirements 4.4**
   */
  describe('Cache Invalidation', () => {
    it('invalidate removes specific worker cache entry', () => {
      fc.assert(
        fc.property(workerIdArb, filterRulesArb, (workerId, rules) => {
          cache.clear();
          
          cache.set(workerId, rules);
          expect(cache.get(workerId)).not.toBeNull();
          
          cache.invalidate(workerId);
          expect(cache.get(workerId)).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('invalidate does not affect other cache entries', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          filterRulesArb,
          filterRulesArb,
          (workerId1, workerId2, rules1, rules2) => {
            fc.pre(workerId1 !== workerId2);
            
            cache.clear();
            
            cache.set(workerId1, rules1);
            cache.set(workerId2, rules2);
            
            // Invalidate only workerId1
            cache.invalidate(workerId1);
            
            // workerId1 should be gone
            expect(cache.get(workerId1)).toBeNull();
            
            // workerId2 should still be there
            expect(cache.get(workerId2)).not.toBeNull();
            expect(cache.get(workerId2)).toHaveLength(rules2.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invalidateAll clears entire cache', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(workerIdArb, filterRulesArb),
            { minLength: 1, maxLength: 10 }
          ),
          (entries) => {
            cache.clear();
            
            // Add multiple entries
            for (const [workerId, rules] of entries) {
              cache.set(workerId, rules);
            }
            
            expect(cache.getSize()).toBeGreaterThan(0);
            
            // Invalidate all
            cache.invalidateAll();
            
            expect(cache.getSize()).toBe(0);
            
            // All entries should be gone
            for (const [workerId] of entries) {
              expect(cache.get(workerId)).toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * LRU eviction tests
   */
  describe('LRU Eviction', () => {
    it('evicts least recently used entries when maxEntries exceeded', () => {
      fc.assert(
        fc.property(filterRulesArb, (rules) => {
          const smallCache = new RuleCache({
            ttlMs: 60000,
            maxEntries: 3,
          });
          
          // Add entries up to max
          smallCache.set('worker1', rules);
          smallCache.set('worker2', rules);
          smallCache.set('worker3', rules);
          
          expect(smallCache.getSize()).toBe(3);
          
          // Access worker3 to make it recently used (updates lastAccessedAt)
          smallCache.get('worker3');
          
          // Add a new entry - should evict one of the least recently used
          smallCache.set('worker4', rules);
          
          // Size should still be 3 (one was evicted)
          expect(smallCache.getSize()).toBe(3);
          
          // worker3 should still be there (was accessed most recently via get)
          expect(smallCache.has('worker3')).toBe(true);
          
          // worker4 should be there (just added)
          expect(smallCache.has('worker4')).toBe(true);
          
          // Count how many of the original entries remain
          const remainingOriginal = [
            smallCache.has('worker1'),
            smallCache.has('worker2'),
            smallCache.has('worker3'),
          ].filter(Boolean).length;
          
          // Exactly 2 of the original 3 should remain (one was evicted)
          expect(remainingOriginal).toBe(2);
        }),
        { numRuns: 100 }
      );
    });

    it('cache size never exceeds maxEntries', () => {
      const smallCache = new RuleCache({
        ttlMs: 60000,
        maxEntries: 5,
      });

      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 50 }),
              filterRulesArb
            ),
            { minLength: 1, maxLength: 20 }
          ),
          (entries) => {
            smallCache.clear();
            
            for (const [workerId, rules] of entries) {
              smallCache.set(workerId, rules);
              
              // Size should never exceed maxEntries
              expect(smallCache.getSize()).toBeLessThanOrEqual(5);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Statistics tracking tests
   */
  describe('Statistics Tracking', () => {
    it('hit rate is calculated correctly', () => {
      fc.assert(
        fc.property(
          workerIdArb,
          filterRulesArb,
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (workerId, rules, hits, misses) => {
            cache.clear();
            
            // Set up cache
            cache.set(workerId, rules);
            
            // Generate hits
            for (let i = 0; i < hits; i++) {
              cache.get(workerId);
            }
            
            // Generate misses (use non-existent worker IDs)
            for (let i = 0; i < misses; i++) {
              cache.get(`nonexistent-${i}`);
            }
            
            const stats = cache.getStats();
            
            expect(stats.hits).toBe(hits);
            expect(stats.misses).toBe(misses);
            
            const total = hits + misses;
            if (total > 0) {
              expect(stats.hitRate).toBeCloseTo(hits / total, 5);
            } else {
              expect(stats.hitRate).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('size reflects actual cache entries', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(
              fc.string({ minLength: 1, maxLength: 50 }),
              filterRulesArb
            ),
            { minLength: 0, maxLength: 20 }
          ),
          (entries) => {
            cache.clear();
            
            // Use a Set to track unique worker IDs
            const uniqueWorkerIds = new Set<string>();
            
            for (const [workerId, rules] of entries) {
              cache.set(workerId, rules);
              uniqueWorkerIds.add(workerId);
            }
            
            // Size should equal number of unique worker IDs
            expect(cache.getSize()).toBe(uniqueWorkerIds.size);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * has() method tests
   */
  describe('has() Method', () => {
    it('has returns true for valid cached entries', () => {
      fc.assert(
        fc.property(workerIdArb, filterRulesArb, (workerId, rules) => {
          cache.clear();
          
          expect(cache.has(workerId)).toBe(false);
          
          cache.set(workerId, rules);
          
          expect(cache.has(workerId)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('has returns false for expired entries', async () => {
      const shortTtlCache = new RuleCache({
        ttlMs: 10,
        maxEntries: 100,
      });

      await fc.assert(
        fc.asyncProperty(workerIdArb, filterRulesArb, async (workerId, rules) => {
          shortTtlCache.clear();
          
          shortTtlCache.set(workerId, rules);
          expect(shortTtlCache.has(workerId)).toBe(true);
          
          await new Promise(resolve => setTimeout(resolve, 20));
          
          expect(shortTtlCache.has(workerId)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Immutability tests - cached data should not be affected by external mutations
   */
  describe('Immutability', () => {
    it('external mutations do not affect cached rules', () => {
      fc.assert(
        fc.property(workerIdArb, filterRulesArb, (workerId, rules) => {
          fc.pre(rules.length > 0);
          
          cache.clear();
          
          // Cache the rules
          cache.set(workerId, rules);
          
          // Mutate the original array
          const originalFirstId = rules[0].id;
          rules[0] = { ...rules[0], id: 'mutated-id' };
          
          // Retrieved rules should have original ID
          const retrieved = cache.get(workerId);
          expect(retrieved![0].id).toBe(originalFirstId);
        }),
        { numRuns: 100 }
      );
    });

    it('mutations to retrieved rules do not affect cache', () => {
      fc.assert(
        fc.property(workerIdArb, filterRulesArb, (workerId, rules) => {
          fc.pre(rules.length > 0);
          
          cache.clear();
          
          cache.set(workerId, rules);
          
          // Get and mutate
          const retrieved1 = cache.get(workerId);
          const originalFirstId = retrieved1![0].id;
          retrieved1![0] = { ...retrieved1![0], id: 'mutated-id' };
          
          // Get again - should have original ID
          const retrieved2 = cache.get(workerId);
          expect(retrieved2![0].id).toBe(originalFirstId);
        }),
        { numRuns: 100 }
      );
    });
  });
});
