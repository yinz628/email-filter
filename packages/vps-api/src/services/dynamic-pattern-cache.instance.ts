/**
 * Dynamic Pattern Cache Singleton Instance
 * 
 * Provides a global singleton instance of DynamicPatternCache for use across the application.
 * 
 * Requirements: 4.1
 * - Load all dynamic rule patterns into memory at startup
 */

import { DynamicPatternCache } from './dynamic-pattern-cache.js';

/**
 * Global singleton instance of DynamicPatternCache
 */
export const dynamicPatternCache = new DynamicPatternCache();

/**
 * Get the global dynamic pattern cache instance
 */
export function getDynamicPatternCache(): DynamicPatternCache {
  return dynamicPatternCache;
}
