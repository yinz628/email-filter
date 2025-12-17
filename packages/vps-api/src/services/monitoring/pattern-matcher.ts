/**
 * Pattern Matcher Service for Monitoring Module
 * 
 * Provides regex pattern matching for email subjects against monitoring rules.
 * Handles regex compilation errors gracefully.
 * 
 * Requirements: 1.5
 */

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
 * Match a subject against a regex pattern
 * 
 * @param pattern - The regex pattern string
 * @param subject - The email subject to match
 * @returns PatternMatchResult with matched status and optional error
 */
export function matchSubject(pattern: string, subject: string): PatternMatchResult {
  try {
    const regex = new RegExp(pattern, 'i'); // Case-insensitive matching
    return {
      matched: regex.test(subject),
    };
  } catch (error) {
    return {
      matched: false,
      error: error instanceof Error ? error.message : 'Invalid regex pattern',
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
 * @param patterns - Array of regex pattern strings
 * @param subject - The email subject to match
 * @returns The first matching pattern or null
 */
export function findMatchingPattern(patterns: string[], subject: string): string | null {
  for (const pattern of patterns) {
    const result = matchSubject(pattern, subject);
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
   * Match a subject against a regex pattern
   */
  matchSubject(pattern: string, subject: string): PatternMatchResult {
    return matchSubject(pattern, subject);
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
  findMatchingPattern(patterns: string[], subject: string): string | null {
    return findMatchingPattern(patterns, subject);
  }

  /**
   * Check if a pattern is valid
   */
  isValidPattern(pattern: string): boolean {
    return validatePattern(pattern).valid;
  }
}
