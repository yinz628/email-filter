import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { verifyBearerToken, verifyLegacyToken } from './auth.js';

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
          const result = verifyBearerToken(undefined, { expectedLegacyToken: VALID_TOKEN });
          
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
          const result = verifyBearerToken(authHeader, { expectedLegacyToken: VALID_TOKEN });
          
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
          const result = verifyBearerToken(authHeader, { expectedLegacyToken: VALID_TOKEN });
          
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
          const result = verifyBearerToken(authHeader, { expectedLegacyToken: VALID_TOKEN });
          
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Invalid token');
        }),
        { numRuns: 100 }
      );
    });

    it('should accept requests with valid Bearer token (legacy)', () => {
      fc.assert(
        fc.property(fc.constant(`Bearer ${VALID_TOKEN}`), (authHeader) => {
          const result = verifyBearerToken(authHeader, { expectedLegacyToken: VALID_TOKEN });
          
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
          expect(result.isLegacy).toBe(true);
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
          const validResult = verifyBearerToken(`Bearer ${validToken}`, { expectedLegacyToken: VALID_TOKEN });
          expect(validResult.valid).toBe(true);
          
          // Random token should be rejected if it doesn't match
          const randomResult = verifyBearerToken(`Bearer ${randomToken}`, { expectedLegacyToken: VALID_TOKEN });
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
      expect(verifyBearerToken(undefined, { expectedLegacyToken: VALID_TOKEN }).valid).toBe(false);
      expect(verifyBearerToken('', { expectedLegacyToken: VALID_TOKEN }).valid).toBe(false);
    });

    it('should be case-sensitive for Bearer prefix', () => {
      // "bearer" (lowercase) should not be accepted
      const result = verifyBearerToken(`bearer ${VALID_TOKEN}`, { expectedLegacyToken: VALID_TOKEN });
      expect(result.valid).toBe(false);
    });

    it('should handle tokens with special characters', () => {
      // Test with a token containing special characters
      const specialToken = 'token-with-special_chars.123!@#';
      
      const result = verifyBearerToken(`Bearer ${specialToken}`, { expectedLegacyToken: specialToken });
      expect(result.valid).toBe(true);
      expect(result.isLegacy).toBe(true);
    });
  });

  describe('Legacy Token Verification', () => {
    it('should accept valid legacy token', () => {
      const result = verifyLegacyToken(VALID_TOKEN, VALID_TOKEN);
      expect(result.valid).toBe(true);
      expect(result.isLegacy).toBe(true);
    });

    it('should reject invalid legacy token', () => {
      const result = verifyLegacyToken('wrong-token', VALID_TOKEN);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token');
    });
  });
});


import jwt from 'jsonwebtoken';
import { verifyJwtToken } from './auth.js';

// Test JWT secret
const TEST_JWT_SECRET = 'test-jwt-secret-for-testing-only';

// Generate valid usernames (alphanumeric, 3-20 chars)
const usernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/);

// Generate user roles
const roleArb = fc.constantFrom<'admin' | 'user'>('admin', 'user');

// Generate user IDs (UUID-like)
const userIdArb = fc.uuid();

/**
 * **Feature: user-auth-and-settings, Property 5: JWT Validation**
 * **Validates: Requirements 4.2, 4.4**
 * 
 * For any request with invalid JWT (wrong signature, expired, or malformed), 
 * the system should return 401 Unauthorized.
 */
describe('Property 5: JWT Validation', () => {
  
  it('should reject tokens with wrong signature', () => {
    fc.assert(
      fc.property(
        userIdArb,
        usernameArb,
        roleArb,
        (userId, username, role) => {
          // Generate token with a different secret
          const wrongSecretToken = jwt.sign(
            { userId, username, role },
            'wrong-secret-key',
            { expiresIn: '24h' }
          );
          
          // Verify with correct secret
          const result = verifyJwtToken(wrongSecretToken, TEST_JWT_SECRET);
          
          // Should be invalid
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Invalid token');
          expect(result.payload).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject expired tokens', () => {
    fc.assert(
      fc.property(
        userIdArb,
        usernameArb,
        roleArb,
        (userId, username, role) => {
          // Generate expired token (expired 1 second ago)
          const expiredToken = jwt.sign(
            { userId, username, role },
            TEST_JWT_SECRET,
            { expiresIn: '-1s' }
          );
          
          // Verify
          const result = verifyJwtToken(expiredToken, TEST_JWT_SECRET);
          
          // Should be invalid with expired error
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Token expired');
          expect(result.payload).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject malformed tokens', () => {
    // Generate various malformed tokens
    const malformedTokenArb = fc.oneof(
      // Random strings
      fc.string({ minLength: 1, maxLength: 100 }),
      // Partial JWT structure
      fc.constant('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'),
      fc.constant('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid'),
      fc.constant('a.b.c'),
      // Empty string
      fc.constant(''),
      // Just dots
      fc.constant('...'),
      // Base64-like but invalid
      fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3', '.'), { minLength: 10, maxLength: 50 })
    );

    fc.assert(
      fc.property(malformedTokenArb, (token) => {
        const result = verifyJwtToken(token, TEST_JWT_SECRET);
        
        // Should be invalid
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.payload).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('should accept valid tokens with correct signature', () => {
    fc.assert(
      fc.property(
        userIdArb,
        usernameArb,
        roleArb,
        (userId, username, role) => {
          // Generate valid token
          const validToken = jwt.sign(
            { userId, username, role },
            TEST_JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          // Verify with correct secret
          const result = verifyJwtToken(validToken, TEST_JWT_SECRET);
          
          // Should be valid
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
          expect(result.payload).toBeDefined();
          expect(result.payload!.userId).toBe(userId);
          expect(result.payload!.username).toBe(username);
          expect(result.payload!.role).toBe(role);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject blacklisted tokens', () => {
    fc.assert(
      fc.property(
        userIdArb,
        usernameArb,
        roleArb,
        (userId, username, role) => {
          // Generate valid token
          const validToken = jwt.sign(
            { userId, username, role },
            TEST_JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          // Create a blacklist checker that always returns true
          const isBlacklisted = () => true;
          
          // Verify with blacklist check
          const result = verifyJwtToken(validToken, TEST_JWT_SECRET, isBlacklisted);
          
          // Should be invalid due to blacklist
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Token revoked');
          expect(result.payload).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should accept non-blacklisted tokens', () => {
    fc.assert(
      fc.property(
        userIdArb,
        usernameArb,
        roleArb,
        (userId, username, role) => {
          // Generate valid token
          const validToken = jwt.sign(
            { userId, username, role },
            TEST_JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          // Create a blacklist checker that always returns false
          const isBlacklisted = () => false;
          
          // Verify with blacklist check
          const result = verifyJwtToken(validToken, TEST_JWT_SECRET, isBlacklisted);
          
          // Should be valid
          expect(result.valid).toBe(true);
          expect(result.payload).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: user-auth-and-settings, Property 11: Legacy Auth Compatibility**
 * **Validates: Requirements 9.1, 9.2**
 * 
 * For any request with valid API_TOKEN (when configured), 
 * the system should accept the request alongside JWT auth.
 */
describe('Property 11: Legacy Auth Compatibility', () => {
  
  it('should accept valid legacy API_TOKEN', () => {
    // Generate various valid API tokens
    const apiTokenArb = fc.string({ minLength: 8, maxLength: 64 })
      .filter(s => s.trim().length > 0 && !s.includes(' '));

    fc.assert(
      fc.property(apiTokenArb, (apiToken) => {
        // Verify with matching legacy token
        const result = verifyBearerToken(`Bearer ${apiToken}`, { expectedLegacyToken: apiToken });
        
        // Should be valid and marked as legacy
        expect(result.valid).toBe(true);
        expect(result.isLegacy).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('should accept JWT token when legacy token is also configured', () => {
    const apiTokenArb = fc.string({ minLength: 8, maxLength: 64 })
      .filter(s => s.trim().length > 0 && !s.includes(' '));

    fc.assert(
      fc.property(
        userIdArb,
        usernameArb,
        roleArb,
        apiTokenArb,
        (userId, username, role, legacyToken) => {
          // Generate valid JWT token
          const jwtToken = jwt.sign(
            { userId, username, role },
            TEST_JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          // Verify with both JWT secret and legacy token configured
          const result = verifyBearerToken(`Bearer ${jwtToken}`, {
            jwtSecret: TEST_JWT_SECRET,
            expectedLegacyToken: legacyToken,
          });
          
          // Should be valid and NOT marked as legacy (JWT takes precedence)
          expect(result.valid).toBe(true);
          expect(result.isLegacy).toBe(false);
          expect(result.payload).toBeDefined();
          expect(result.payload!.userId).toBe(userId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should fall back to legacy token when JWT verification fails', () => {
    const apiTokenArb = fc.string({ minLength: 8, maxLength: 64 })
      .filter(s => s.trim().length > 0 && !s.includes(' '));

    fc.assert(
      fc.property(apiTokenArb, (legacyToken) => {
        // Use the legacy token as the Bearer token (not a valid JWT)
        const result = verifyBearerToken(`Bearer ${legacyToken}`, {
          jwtSecret: TEST_JWT_SECRET,
          expectedLegacyToken: legacyToken,
        });
        
        // Should be valid via legacy auth
        expect(result.valid).toBe(true);
        expect(result.isLegacy).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject when both JWT and legacy token are invalid', () => {
    const invalidTokenArb = fc.string({ minLength: 1, maxLength: 64 })
      .filter(s => s.trim().length > 0);
    const legacyTokenArb = fc.string({ minLength: 8, maxLength: 64 })
      .filter(s => s.trim().length > 0 && !s.includes(' '));

    fc.assert(
      fc.property(
        invalidTokenArb,
        legacyTokenArb,
        (invalidToken, legacyToken) => {
          // Skip if tokens happen to match
          fc.pre(invalidToken !== legacyToken);
          
          // Use an invalid token (not a valid JWT and not matching legacy token)
          const result = verifyBearerToken(`Bearer ${invalidToken}`, {
            jwtSecret: TEST_JWT_SECRET,
            expectedLegacyToken: legacyToken,
          });
          
          // Should be invalid
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should support both auth methods simultaneously', () => {
    const apiTokenArb = fc.string({ minLength: 8, maxLength: 64 })
      .filter(s => s.trim().length > 0 && !s.includes(' '));

    fc.assert(
      fc.property(
        userIdArb,
        usernameArb,
        roleArb,
        apiTokenArb,
        (userId, username, role, legacyToken) => {
          // Generate valid JWT token
          const jwtToken = jwt.sign(
            { userId, username, role },
            TEST_JWT_SECRET,
            { expiresIn: '24h' }
          );
          
          const options = {
            jwtSecret: TEST_JWT_SECRET,
            expectedLegacyToken: legacyToken,
          };
          
          // Both should work
          const jwtResult = verifyBearerToken(`Bearer ${jwtToken}`, options);
          const legacyResult = verifyBearerToken(`Bearer ${legacyToken}`, options);
          
          // JWT should be valid and not legacy
          expect(jwtResult.valid).toBe(true);
          expect(jwtResult.isLegacy).toBe(false);
          
          // Legacy should be valid and marked as legacy
          expect(legacyResult.valid).toBe(true);
          expect(legacyResult.isLegacy).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
