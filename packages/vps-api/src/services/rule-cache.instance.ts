/**
 * Rule Cache Singleton Instance
 * 
 * Provides a global singleton instance of RuleCache for use across the application.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { RuleCache } from './rule-cache.js';

/**
 * Global singleton instance of RuleCache
 * 
 * Configuration:
 * - TTL: 60 seconds (Requirement 4.3)
 * - Max entries: 100 (reasonable default for worker caching)
 */
export const ruleCache = new RuleCache({
  ttlMs: 60000, // 60 seconds
  maxEntries: 100,
});

/**
 * Get the global rule cache instance
 */
export function getRuleCache(): RuleCache {
  return ruleCache;
}
