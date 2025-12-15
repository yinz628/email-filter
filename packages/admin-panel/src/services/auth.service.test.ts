import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  invalidateToken,
  isTokenBlacklisted,
  clearBlacklist,
} from './auth.service.js';

// Arbitrary for generating valid password strings
const passwordArbitrary = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.length > 0);

// Arbitrary for generating different passwords (for wrong password tests)
const differentPasswordsArbitrary = fc.tuple(
  passwordArbitrary,
  passwordArbitrary
).filter(([p1, p2]) => p1 !== p2);

// Arbitrary for JWT secret
const jwtSecretArbitrary = fc.string({ minLength: 32, maxLength: 64 })
  .filter(s => s.length >= 32);

describe('Auth Service', () => {
  beforeEach(() => {
    // Clear the token blacklist before each test
    clearBlacklist();
  });

  describe('Password Hashing', () => {
    it('should produce consistent hashes for the same password', async () => {
      await fc.assert(
        fc.asyncProperty(passwordArbitrary, async (password) => {
          const hash1 = await hashPassword(password);
          const hash2 = await hashPassword(password);
          
          expect(hash1).toBe(hash2);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce different hashes for different passwords', async () => {
      await fc.assert(
        fc.asyncProperty(differentPasswordsArbitrary, async ([password1, password2]) => {
          const hash1 = await hashPassword(password1);
          const hash2 = await hashPassword(password2);
          
          expect(hash1).not.toBe(hash2);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-filter-management, Property 2: 认证正确性**
   * *For any* 密码字符串，使用正确密码登录应成功获取有效token，使用错误密码登录应被拒绝，登出后token应失效。
   * **Validates: Requirements 2.2, 2.3, 2.4**
   */
  describe('Property 2: 认证正确性', () => {
    /**
     * Test: Correct password should verify successfully
     * Validates: Requirements 2.2
     */
    it('correct password should verify successfully', async () => {
      await fc.assert(
        fc.asyncProperty(passwordArbitrary, async (password) => {
          const hash = await hashPassword(password);
          const isValid = await verifyPassword(password, hash);
          
          expect(isValid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Wrong password should be rejected
     * Validates: Requirements 2.3
     */
    it('wrong password should be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(differentPasswordsArbitrary, async ([correctPassword, wrongPassword]) => {
          const hash = await hashPassword(correctPassword);
          const isValid = await verifyPassword(wrongPassword, hash);
          
          expect(isValid).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Valid token should be verified successfully
     * Validates: Requirements 2.2
     */
    it('valid token should be verified successfully', async () => {
      await fc.assert(
        fc.asyncProperty(jwtSecretArbitrary, async (secret) => {
          const token = await generateToken(secret, 3600); // 1 hour expiry
          const result = await verifyToken(token, secret);
          
          expect(result.valid).toBe(true);
          expect(result.payload).toBeDefined();
          expect(result.payload?.sub).toBe('admin');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Token with wrong secret should be rejected
     * Validates: Requirements 2.3
     */
    it('token with wrong secret should be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(
          jwtSecretArbitrary,
          jwtSecretArbitrary.filter(s => s.length >= 32),
          async (secret1, secret2) => {
            // Ensure secrets are different
            fc.pre(secret1 !== secret2);
            
            const token = await generateToken(secret1, 3600);
            const result = await verifyToken(token, secret2);
            
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid signature');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Invalidated (logged out) token should be rejected
     * Validates: Requirements 2.4
     */
    it('invalidated token should be rejected after logout', async () => {
      await fc.assert(
        fc.asyncProperty(jwtSecretArbitrary, async (secret) => {
          // Generate a valid token
          const token = await generateToken(secret, 3600);
          
          // Verify it's valid before logout
          const beforeLogout = await verifyToken(token, secret);
          expect(beforeLogout.valid).toBe(true);
          
          // Logout (invalidate the token)
          invalidateToken(token);
          
          // Verify token is now blacklisted
          expect(isTokenBlacklisted(token)).toBe(true);
          
          // Verify token is rejected after logout
          const afterLogout = await verifyToken(token, secret);
          expect(afterLogout.valid).toBe(false);
          expect(afterLogout.error).toBe('Token has been revoked');
        }),
        { numRuns: 100 }
      );
    });

    /**
     * Test: Expired token should be rejected
     */
    it('expired token should be rejected', async () => {
      await fc.assert(
        fc.asyncProperty(jwtSecretArbitrary, async (secret) => {
          // Generate a token that expires immediately (0 seconds)
          const token = await generateToken(secret, -1); // Already expired
          const result = await verifyToken(token, secret);
          
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Token expired');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Token Format Validation', () => {
    it('should reject malformed tokens', async () => {
      const malformedTokens = [
        '',
        'invalid',
        'a.b',
        'a.b.c.d',
        '...',
      ];

      for (const token of malformedTokens) {
        const result = await verifyToken(token, 'any-secret-that-is-long-enough-32chars');
        expect(result.valid).toBe(false);
      }
    });

    it('should reject tokens with invalid base64', async () => {
      const result = await verifyToken('!!!.@@@.###', 'any-secret-that-is-long-enough-32chars');
      expect(result.valid).toBe(false);
    });
  });

  describe('Token Blacklist', () => {
    it('should track multiple invalidated tokens', async () => {
      const secret = 'test-secret-that-is-long-enough-32chars';
      
      // Generate multiple tokens with different expiry times to ensure they're different
      const token1 = await generateToken(secret, 3600);
      const token2 = await generateToken(secret, 3601); // Different expiry
      const token3 = await generateToken(secret, 3602); // Different expiry
      
      // Verify tokens are different
      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      
      // Invalidate first two
      invalidateToken(token1);
      invalidateToken(token2);
      
      // Check blacklist status
      expect(isTokenBlacklisted(token1)).toBe(true);
      expect(isTokenBlacklisted(token2)).toBe(true);
      expect(isTokenBlacklisted(token3)).toBe(false);
      
      // Verify token3 is still valid
      const result = await verifyToken(token3, secret);
      expect(result.valid).toBe(true);
    });

    it('clearBlacklist should remove all entries', async () => {
      const secret = 'test-secret-that-is-long-enough-32chars';
      
      const token = await generateToken(secret, 3600);
      invalidateToken(token);
      
      expect(isTokenBlacklisted(token)).toBe(true);
      
      clearBlacklist();
      
      expect(isTokenBlacklisted(token)).toBe(false);
    });
  });
});
