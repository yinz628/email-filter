/**
 * Auth Service for VPS API
 * Handles user authentication including login, logout, and JWT token management
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type { TokenPayload, LoginResult, User, UserWithoutPassword } from '@email-filter/shared';
import { UserService, toUserWithoutPassword } from './user.service.js';

// Re-export types for backward compatibility
export type { TokenPayload, LoginResult };

/**
 * Database row type for token_blacklist table
 */
interface TokenBlacklistRow {
  id: number;
  token_hash: string;
  expires_at: string;
  created_at: string;
}

/**
 * Auth Service class
 * Handles all authentication-related operations
 */
export class AuthService {
  private userService: UserService;
  private jwtSecret: string;
  private tokenExpiry: string;
  private db: Database.Database;

  /**
   * Create AuthService instance
   * Requirements: 2.3
   * 
   * @param userService - UserService instance for user operations
   * @param db - Database instance for token blacklist
   * @param jwtSecret - Secret key for JWT signing
   * @param tokenExpiry - Token expiration time (default: '24h')
   */
  constructor(
    userService: UserService,
    db: Database.Database,
    jwtSecret: string,
    tokenExpiry: string = '24h'
  ) {
    this.userService = userService;
    this.db = db;
    this.jwtSecret = jwtSecret;
    this.tokenExpiry = tokenExpiry;
  }


  /**
   * User login
   * Requirements: 2.1, 2.2, 2.3, 2.6
   * 
   * @param username - Username to authenticate
   * @param password - Plain text password
   * @returns LoginResult with token and user info on success, error on failure
   */
  async login(username: string, password: string): Promise<LoginResult> {
    // Requirement 2.1: Verify username exists
    const user = this.userService.findByUsername(username);
    if (!user) {
      // Requirement 2.6: Return 401 with error message
      return {
        success: false,
        error: 'Invalid username or password',
      };
    }

    // Requirement 2.2: Verify password against stored hash
    const isValidPassword = await this.userService.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      // Requirement 2.6: Return 401 with error message
      return {
        success: false,
        error: 'Invalid username or password',
      };
    }

    // Requirement 2.3: Generate JWT token
    const token = this.generateToken(user);

    // Requirement 2.7: Return JWT token to client
    return {
      success: true,
      token,
      user: toUserWithoutPassword(user),
    };
  }

  /**
   * Generate JWT token for a user
   * Requirements: 2.3, 2.4, 2.5
   * 
   * @param user - User to generate token for
   * @returns JWT token string
   */
  generateToken(user: User): string {
    // Requirement 2.4: Include user_id, username, and role in payload
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    // Requirement 2.5: Set expiration time
    // Parse tokenExpiry string to get seconds
    const expiresInSeconds = this.parseExpiry(this.tokenExpiry);
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Parse expiry string to seconds
   * @param expiry - Expiry string like '24h', '7d', '1h'
   * @returns Number of seconds
   */
  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([hdms])$/);
    if (!match) {
      return 86400; // Default to 24 hours
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      case 'm': return value * 60;
      case 's': return value;
      default: return 86400;
    }
  }

  /**
   * Verify JWT token
   * Requirements: 2.3, 2.4, 2.5
   * 
   * @param token - JWT token to verify
   * @returns TokenPayload if valid, null if invalid or expired
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch (error) {
      // Token is invalid, expired, or malformed
      return null;
    }
  }

  /**
   * User logout - invalidate token by adding to blacklist
   * Requirements: 3.1, 3.2
   * 
   * @param token - JWT token to invalidate
   */
  logout(token: string): void {
    // Decode token to get expiration time (don't verify, just decode)
    const decoded = jwt.decode(token) as TokenPayload | null;
    if (!decoded || !decoded.exp) {
      return;
    }

    // Hash the token for storage (don't store raw tokens)
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();
    const now = new Date().toISOString();

    // Requirement 3.2: Add token to blacklist until expiration
    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO token_blacklist (token_hash, expires_at, created_at)
        VALUES (?, ?, ?)
      `);
      stmt.run(tokenHash, expiresAt, now);
    } catch (error) {
      // Log error but don't throw - logout should be best-effort
      console.error('Failed to blacklist token:', error);
    }
  }

  /**
   * Check if a token is blacklisted
   * Requirements: 3.3
   * 
   * @param token - JWT token to check
   * @returns true if token is blacklisted, false otherwise
   */
  isTokenBlacklisted(token: string): boolean {
    const tokenHash = this.hashToken(token);
    
    const stmt = this.db.prepare(`
      SELECT id FROM token_blacklist WHERE token_hash = ?
    `);
    const row = stmt.get(tokenHash);
    
    return row !== undefined;
  }

  /**
   * Clean up expired tokens from blacklist
   * Requirements: 3.2 (maintenance)
   */
  cleanupBlacklist(): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      DELETE FROM token_blacklist WHERE expires_at < ?
    `);
    const result = stmt.run(now);
    
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} expired tokens from blacklist`);
    }
  }

  /**
   * Hash a token for secure storage
   * 
   * @param token - Token to hash
   * @returns SHA-256 hash of the token
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get the UserService instance
   * Useful for middleware that needs to access user data
   */
  getUserService(): UserService {
    return this.userService;
  }
}
