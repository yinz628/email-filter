/**
 * Rule Cache for Webhook Response Optimization
 * 
 * Provides in-memory caching of filter rules to reduce database queries.
 * Implements TTL-based expiration and LRU eviction.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import type { FilterRule } from '@email-filter/shared';
import type { FilterRuleWithWorker } from '../db/rule-repository.js';

/**
 * Configuration for the rule cache
 */
export interface RuleCacheConfig {
  /** Time-to-live in milliseconds (default: 60000ms = 60 seconds) */
  ttlMs: number;
  /** Maximum number of cache entries (default: 100) */
  maxEntries: number;
}

/**
 * A cached entry with metadata
 */
interface CacheEntry {
  rules: FilterRuleWithWorker[];
  cachedAt: number;
  lastAccessedAt: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: RuleCacheConfig = {
  ttlMs: 60000, // 60 seconds
  maxEntries: 100,
};

/**
 * Special key for global rules (no worker ID)
 */
const GLOBAL_RULES_KEY = '__global__';

/**
 * Rule Cache
 * 
 * Caches filter rules in memory with TTL-based expiration and LRU eviction.
 * 
 * Requirements:
 * - 4.1: Check in-memory cache first when worker requests rules
 * - 4.2: Return cached rules without database query when cache is valid
 * - 4.3: Fetch fresh rules when cache entry expires (TTL 60 seconds)
 * - 4.4: Invalidate cache when rules are updated via admin panel
 */
export class RuleCache {
  private cache: Map<string, CacheEntry> = new Map();
  private config: RuleCacheConfig;
  
  // Statistics
  private hits = 0;
  private misses = 0;

  constructor(config: Partial<RuleCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the cache key for a worker ID
   * 
   * @param workerId - Worker ID or undefined for global rules
   * @returns Cache key string
   */
  private getCacheKey(workerId?: string): string {
    return workerId || GLOBAL_RULES_KEY;
  }

  /**
   * Check if a cache entry is expired
   * 
   * Requirement 4.3: Cache entry expires after TTL
   * 
   * @param entry - The cache entry to check
   * @returns true if expired, false otherwise
   */
  private isExpired(entry: CacheEntry): boolean {
    const now = Date.now();
    return now - entry.cachedAt >= this.config.ttlMs;
  }

  /**
   * Evict least recently used entries when cache exceeds maxEntries
   * 
   * Uses LRU (Least Recently Used) eviction strategy.
   */
  private evictLRU(): void {
    while (this.cache.size >= this.config.maxEntries) {
      // Find the least recently accessed entry
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache) {
        if (entry.lastAccessedAt < oldestTime) {
          oldestTime = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      } else {
        // Safety: if no oldest found, break to avoid infinite loop
        break;
      }
    }
  }

  /**
   * Get cached rules for a worker
   * 
   * Requirements: 4.1, 4.2, 4.3
   * 
   * @param workerId - Worker ID or undefined for global rules
   * @returns Cached rules or null if not cached or expired
   */
  get(workerId?: string): FilterRuleWithWorker[] | null {
    const key = this.getCacheKey(workerId);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL expiration (Requirement 4.3)
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Update last accessed time for LRU
    entry.lastAccessedAt = Date.now();
    this.hits++;

    // Return a copy to prevent external mutation
    return [...entry.rules];
  }

  /**
   * Cache rules for a worker
   * 
   * @param workerId - Worker ID or undefined for global rules
   * @param rules - Rules to cache
   */
  set(workerId: string | undefined, rules: FilterRuleWithWorker[]): void {
    const key = this.getCacheKey(workerId);
    const now = Date.now();

    // Evict LRU entries if needed (before adding new entry)
    if (!this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      rules: [...rules], // Store a copy to prevent external mutation
      cachedAt: now,
      lastAccessedAt: now,
    });
  }

  /**
   * Invalidate cache for a specific worker
   * 
   * Requirement 4.4: Invalidate cache when rules are updated
   * 
   * @param workerId - Worker ID or undefined for global rules
   */
  invalidate(workerId?: string): void {
    const key = this.getCacheKey(workerId);
    this.cache.delete(key);
  }

  /**
   * Invalidate all cache entries
   * 
   * Useful when bulk rule changes occur.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * 
   * @returns Cache statistics including size and hit rate
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Get current cache size
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * Check if cache contains entry for worker
   * 
   * @param workerId - Worker ID or undefined for global rules
   * @returns true if cache contains valid (non-expired) entry
   */
  has(workerId?: string): boolean {
    const key = this.getCacheKey(workerId);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Get configuration
   */
  getConfig(): RuleCacheConfig {
    return { ...this.config };
  }

  /**
   * Clear cache and reset statistics (for testing)
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
