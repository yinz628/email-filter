/**
 * Dynamic Pattern Cache for VPS API
 * 
 * Provides in-memory caching of dynamic rule patterns for O(1) lookup.
 * Used to quickly check if a subject already has a dynamic rule without database query.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 * - 4.1: Load all dynamic rule patterns into memory at startup
 * - 4.2: Add patterns without database query when rules are created
 * - 4.3: Check in-memory Set first before database lookup
 * - 4.4: O(1) time complexity for lookups
 */

import type { Database } from 'better-sqlite3';

/**
 * Cache statistics
 */
export interface PatternCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

/**
 * Dynamic Pattern Cache
 * 
 * Uses a Set for O(1) pattern lookup to avoid database queries
 * when checking if a dynamic rule already exists for a subject.
 */
export class DynamicPatternCache {
  /** Set of all dynamic rule patterns (lowercase for case-insensitive matching) */
  private patterns: Set<string> = new Set();
  
  /** Statistics tracking */
  private hits = 0;
  private misses = 0;
  
  /** Flag to track if cache has been initialized */
  private initialized = false;

  /**
   * Load all dynamic rule patterns from the database
   * 
   * Requirement 4.1: Load all dynamic rule patterns into memory at startup
   * 
   * @param db - Database instance
   */
  loadFromDatabase(db: Database): void {
    const stmt = db.prepare(
      `SELECT pattern FROM filter_rules 
       WHERE category = 'dynamic' AND enabled = 1`
    );
    const rows = stmt.all() as { pattern: string }[];
    
    // Clear existing patterns and reload
    this.patterns.clear();
    
    for (const row of rows) {
      // Store lowercase for case-insensitive matching
      this.patterns.add(row.pattern.toLowerCase());
    }
    
    this.initialized = true;
  }

  /**
   * Check if a pattern exists in the cache
   * 
   * Requirement 4.3: Check in-memory Set first
   * Requirement 4.4: O(1) time complexity
   * 
   * @param pattern - The pattern to check
   * @returns true if pattern exists, false otherwise
   */
  has(pattern: string): boolean {
    const result = this.patterns.has(pattern.toLowerCase());
    
    if (result) {
      this.hits++;
    } else {
      this.misses++;
    }
    
    return result;
  }

  /**
   * Check if a subject matches any existing pattern
   * 
   * This performs a contains check - if any existing pattern
   * is contained in the subject, or the subject is contained
   * in any existing pattern, returns true.
   * 
   * Requirement 4.3: Check in-memory Set first
   * 
   * @param subject - The subject to check
   * @returns true if subject matches any pattern, false otherwise
   */
  hasMatchingPattern(subject: string): boolean {
    const subjectLower = subject.toLowerCase();
    
    // First check exact match (O(1))
    if (this.patterns.has(subjectLower)) {
      this.hits++;
      return true;
    }
    
    // Then check contains match (O(n) but still faster than DB)
    for (const pattern of this.patterns) {
      if (subjectLower.includes(pattern) || pattern.includes(subjectLower)) {
        this.hits++;
        return true;
      }
    }
    
    this.misses++;
    return false;
  }

  /**
   * Add a pattern to the cache
   * 
   * Requirement 4.2: Add patterns without database query
   * 
   * @param pattern - The pattern to add
   */
  add(pattern: string): void {
    this.patterns.add(pattern.toLowerCase());
  }

  /**
   * Remove a pattern from the cache
   * 
   * @param pattern - The pattern to remove
   * @returns true if pattern was removed, false if it didn't exist
   */
  remove(pattern: string): boolean {
    return this.patterns.delete(pattern.toLowerCase());
  }

  /**
   * Get the number of patterns in the cache
   */
  getSize(): number {
    return this.patterns.size;
  }

  /**
   * Check if the cache has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get cache statistics
   */
  getStats(): PatternCacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.patterns.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Clear the cache and reset statistics
   */
  clear(): void {
    this.patterns.clear();
    this.hits = 0;
    this.misses = 0;
    this.initialized = false;
  }

  /**
   * Get all patterns (for debugging/testing)
   */
  getAllPatterns(): string[] {
    return Array.from(this.patterns);
  }
}
