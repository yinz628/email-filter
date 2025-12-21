/**
 * Pattern Matcher Service for Monitoring Module
 * 
 * Provides pattern matching for email subjects against monitoring rules.
 * Supports both contains matching (default) and regex matching.
 * 
 * Requirements: 1.5
 */

/**
 * Match mode for pattern matching
 */
export type MatchMode = 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';

/**
 * Result of a pattern match operation
 */
export interface PatternMatchResult {
  matched: boolean;
  error?: string;
}

/**
 * Result of pattern validation
 */
export interface PatternValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Match a subject against a pattern
 * 
 * @param pattern - The pattern string
 * @param subject - The email subject to match
 * @param mode - Match mode: 'contains' (default) or 'regex'
 * @returns PatternMatchResult with matched status and optional error
 */
export function matchSubject(pattern: string, subject: string, mode: MatchMode = 'contains'): PatternMatchResult {
  try {
    const lowerSubject = subject.toLowerCase();
    const lowerPattern = pattern.toLowerCase();
    
    switch (mode) {
      case 'exact':
        return { matched: lowerSubject === lowerPattern };
      case 'contains':
        return { matched: lowerSubject.includes(lowerPattern) };
      case 'startsWith':
        return { matched: lowerSubject.startsWith(lowerPattern) };
      case 'endsWith':
        return { matched: lowerSubject.endsWith(lowerPattern) };
      case 'regex':
        const regex = new RegExp(pattern, 'i');
        return { matched: regex.test(subject) };
      default:
        return { matched: false, error: `Unknown match mode: ${mode}` };
    }
  } catch (error) {
    return {
      matched: false,
      error: error instanceof Error ? error.message : 'Invalid pattern',
    };
  }
}

/**
 * Validate a regex pattern without matching
 * 
 * @param pattern - The regex pattern string to validate
 * @returns PatternValidationResult with validity status and optional error
 */
export function validatePattern(pattern: string): PatternValidationResult {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid regex pattern',
    };
  }
}

/**
 * Match a subject against multiple patterns
 * Returns the first matching pattern or null if none match
 * 
 * @param patterns - Array of pattern strings
 * @param subject - The email subject to match
 * @param mode - Match mode: 'contains' (default) or 'regex'
 * @returns The first matching pattern or null
 */
export function findMatchingPattern(patterns: string[], subject: string, mode: MatchMode = 'contains'): string | null {
  for (const pattern of patterns) {
    const result = matchSubject(pattern, subject, mode);
    if (result.matched) {
      return pattern;
    }
  }
  return null;
}

/**
 * Pattern Matcher Service class for dependency injection
 */
export class PatternMatcherService {
  /**
   * Match a subject against a pattern
   */
  matchSubject(pattern: string, subject: string, mode: MatchMode = 'contains'): PatternMatchResult {
    return matchSubject(pattern, subject, mode);
  }

  /**
   * Validate a regex pattern
   */
  validatePattern(pattern: string): PatternValidationResult {
    return validatePattern(pattern);
  }

  /**
   * Find the first matching pattern from a list
   */
  findMatchingPattern(patterns: string[], subject: string, mode: MatchMode = 'contains'): string | null {
    return findMatchingPattern(patterns, subject, mode);
  }

  /**
   * Check if a pattern is valid
   */
  isValidPattern(pattern: string): boolean {
    return validatePattern(pattern).valid;
  }
}
