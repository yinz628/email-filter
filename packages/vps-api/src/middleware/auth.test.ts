import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { verifyBearerToken } from './auth.js';

// Test token for property tests
const VALID_TOKEN = 'test-valid-token-12345';

describe('Auth Middleware', () => {

  /**
   * **Feature: vps-email-filter, Property 13: 认证验证**
   * **Validates: Requirements 8.1, 8.2**
   * 
   * For any webhook request:
   * - Missing Authorization header should return invalid result
   * - Invalid Bearer Token should return invalid result
   * - Valid Bearer Token should return valid result
   */
  describe('Property 13: 认证验证', () => {
    it('should reject requests with missing Authorization header', () => {
      fc.assert(
        fc.property(fc.constant(undefined), () => {
          const result = verifyBearerToken(undefined, VALID_TOKEN);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should reject requests with non-Bearer authorization format', () => {
      // Generate various non-Bearer authorization formats
      const nonBearerAuthArb = fc.oneof(
        // Basic auth
        fc.string({ minLength: 1 }).map(s => `Basic ${s}`),
        // Digest auth
        fc.string({ minLength: 1 }).map(s => `Digest ${s}`),
        // Just a token without prefix
        fc.string({ minLength: 1 }).filter(s => !s.startsWith('Bearer ')),
        // Empty string
        fc.constant(''),
        // Random strings that don't start with "Bearer "
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.startsWith('Bearer '))
      );

      fc.assert(
        fc.property(nonBearerAuthArb, (authHeader) => {
          const result = verifyBearerToken(authHeader, VALID_TOKEN);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should reject requests with empty Bearer token', () => {
      // Generate Bearer headers with empty or whitespace-only tokens
      const emptyBearerArb = fc.oneof(
        fc.constant('Bearer '),
        fc.constant('Bearer  '),
        fc.constant('Bearer   '),
        // Bearer followed by only whitespace
        fc.stringOf(fc.constant(' '), { minLength: 0, maxLength: 10 }).map(s => `Bearer ${s}`)
      );

      fc.assert(
        fc.property(emptyBearerArb, (authHeader) => {
          const result = verifyBearerToken(authHeader, VALID_TOKEN);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should reject requests with invalid Bearer token', () => {
      // Generate Bearer headers with tokens that don't match the valid token
      const invalidTokenArb = fc.string({ minLength: 1, maxLength: 100 })
        .filter(s => s.trim().length > 0 && s !== VALID_TOKEN)
        .map(s => `Bearer ${s}`);

      fc.assert(
        fc.property(invalidTokenArb, (authHeader) => {
          const result = verifyBearerToken(authHeader, VALID_TOKEN);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Invalid token');
        }),
        { numRuns: 100 }
      );
    });

    it('should accept requests with valid Bearer token', () => {
      fc.assert(
        fc.property(fc.constant(`Bearer ${VALID_TOKEN}`), (authHeader) => {
          const result = verifyBearerToken(authHeader, VALID_TOKEN);
          
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly distinguish valid from invalid tokens for any token pair', () => {
      // Generate pairs of (valid token, random token) and verify behavior
      const tokenPairArb = fc.tuple(
        fc.constant(VALID_TOKEN),
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)
      );

      fc.assert(
        fc.property(tokenPairArb, ([validToken, randomToken]) => {
          // Valid token should always be accepted
          const validResult = verifyBearerToken(`Bearer ${validToken}`, VALID_TOKEN);
          expect(validResult.valid).toBe(true);
          
          // Random token should be rejected if it doesn't match
          const randomResult = verifyBearerToken(`Bearer ${randomToken}`, VALID_TOKEN);
          if (randomToken === validToken) {
            expect(randomResult.valid).toBe(true);
          } else {
            expect(randomResult.valid).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle null-like values gracefully', () => {
      expect(verifyBearerToken(undefined, VALID_TOKEN).valid).toBe(false);
      expect(verifyBearerToken('', VALID_TOKEN).valid).toBe(false);
    });

    it('should be case-sensitive for Bearer prefix', () => {
      // "bearer" (lowercase) should not be accepted
      const result = verifyBearerToken(`bearer ${VALID_TOKEN}`, VALID_TOKEN);
      expect(result.valid).toBe(false);
    });

    it('should handle tokens with special characters', () => {
      // Test with a token containing special characters
      const specialToken = 'token-with-special_chars.123!@#';
      
      const result = verifyBearerToken(`Bearer ${specialToken}`, specialToken);
      expect(result.valid).toBe(true);
    });
  });
});
