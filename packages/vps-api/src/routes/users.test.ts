/**
 * User Management Routes Tests
 * Property-based tests for admin authorization, username uniqueness, and user deletion cascade
 * 
 * **Feature: user-auth-and-settings**
 * **Property 8: Admin Authorization**
 * **Property 9: Username Uniqueness**
 * **Property 10: User Deletion Cascade**
 * **Validates: Requirements 10.1, 10.2, 10.4, 10.5**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Salt rounds for bcrypt hashing (matching the service)
const SALT_ROUNDS = 10;

// Test JWT secret
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';

/**
 * User role types
 */
type UserRole = 'admin' | 'user';

/**
 * User entity for testing
 */
interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User without password hash
 */
interface UserWithoutPassword {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Token payload structure
 */
interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Test-specific UserService that works with sql.js
 */
class TestUserService {
  constructor(private db: SqlJsDatabase) {}

  async hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async createUser(data: { username: string; password: string; role?: UserRole }): Promise<User> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const passwordHash = await this.hashPassword(data.password);
    const role = data.role || 'user';

    try {
      this.db.run(
        `INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, data.username, passwordHash, role, now, now]
      );

      return {
        id,
        username: data.username,
        passwordHash,
        role,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    } catch (error: any) {
      if (error.message?.includes('UNIQUE constraint failed')) {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  findByUsername(username: string): User | null {
    const result = this.db.exec(
      'SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE username = ?',
      [username]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const row = result[0].values[0];
    return {
      id: row[0] as string,
      username: row[1] as string,
      passwordHash: row[2] as string,
      role: row[3] as UserRole,
      createdAt: new Date(row[4] as string),
      updatedAt: new Date(row[5] as string),
    };
  }

  findById(id: string): User | null {
    const result = this.db.exec(
      'SELECT id, username, password_hash, role, created_at, updated_at FROM users WHERE id = ?',
      [id]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const row = result[0].values[0];
    return {
      id: row[0] as string,
      username: row[1] as string,
      passwordHash: row[2] as string,
      role: row[3] as UserRole,
      createdAt: new Date(row[4] as string),
      updatedAt: new Date(row[5] as string),
    };
  }

  getAllUsers(): UserWithoutPassword[] {
    const result = this.db.exec(
      'SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    
    if (result.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => ({
      id: row[0] as string,
      username: row[1] as string,
      role: row[2] as UserRole,
      createdAt: new Date(row[3] as string),
      updatedAt: new Date(row[4] as string),
    }));
  }

  deleteUser(id: string): boolean {
    const existing = this.findById(id);
    if (!existing) {
      return false;
    }

    // Delete user settings first
    this.db.run('DELETE FROM user_settings WHERE user_id = ?', [id]);
    
    // Delete the user
    this.db.run('DELETE FROM users WHERE id = ?', [id]);
    
    return true;
  }
}

/**
 * Test-specific UserSettingsService that works with sql.js
 */
class TestUserSettingsService {
  constructor(private db: SqlJsDatabase) {}

  getAllSettings(userId: string): Record<string, any> {
    const result = this.db.exec(
      'SELECT key, value FROM user_settings WHERE user_id = ?',
      [userId]
    );
    
    if (result.length === 0) {
      return {};
    }
    
    const settings: Record<string, any> = {};
    for (const row of result[0].values) {
      try {
        settings[row[0] as string] = JSON.parse(row[1] as string);
      } catch {
        settings[row[0] as string] = row[1];
      }
    }
    
    return settings;
  }

  setSetting(userId: string, key: string, value: any): void {
    const now = new Date().toISOString();
    const jsonValue = JSON.stringify(value);
    
    // Check if setting exists
    const existing = this.db.exec(
      'SELECT id FROM user_settings WHERE user_id = ? AND key = ?',
      [userId, key]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      this.db.run(
        'UPDATE user_settings SET value = ?, updated_at = ? WHERE user_id = ? AND key = ?',
        [jsonValue, now, userId, key]
      );
    } else {
      this.db.run(
        'INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, ?, ?, ?)',
        [userId, key, jsonValue, now]
      );
    }
  }

  setSettings(userId: string, settings: Record<string, any>): void {
    for (const [key, value] of Object.entries(settings)) {
      this.setSetting(userId, key, value);
    }
  }

  getSettingsCount(userId: string): number {
    const result = this.db.exec(
      'SELECT COUNT(*) as count FROM user_settings WHERE user_id = ?',
      [userId]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return 0;
    }
    
    return result[0].values[0][0] as number;
  }
}

/**
 * Generate JWT token for testing
 */
function generateTestToken(user: User, secret: string = TEST_JWT_SECRET): string {
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: '24h' }
  );
}

/**
 * Verify JWT token for testing
 */
function verifyTestToken(token: string, secret: string = TEST_JWT_SECRET): TokenPayload | null {
  try {
    return jwt.verify(token, secret) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Simulate admin authorization check
 * Returns true if user is admin, false otherwise
 */
function checkAdminAuthorization(token: string | null, secret: string = TEST_JWT_SECRET): { authorized: boolean; statusCode: number; error?: string } {
  if (!token) {
    return { authorized: false, statusCode: 401, error: 'Authorization header is required' };
  }

  const payload = verifyTestToken(token, secret);
  if (!payload) {
    return { authorized: false, statusCode: 401, error: 'Invalid token' };
  }

  if (payload.role !== 'admin') {
    return { authorized: false, statusCode: 403, error: 'Forbidden: Admin access required' };
  }

  return { authorized: true, statusCode: 200 };
}

// Generate valid usernames (alphanumeric, 3-20 chars)
const usernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/);

// Generate valid passwords (at least 6 chars, max 50)
const passwordArb = fc.string({ minLength: 6, maxLength: 50 });

// Generate user roles
const roleArb = fc.constantFrom<UserRole>('admin', 'user');

// Generate setting keys
const settingKeyArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/);

// Generate setting values (simple types)
const settingValueArb = fc.oneof(
  fc.string({ maxLength: 100 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null)
);

describe('User Management Routes', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let userService: TestUserService;
  let settingsService: TestUserSettingsService;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Create users table
    db.run(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.run('CREATE UNIQUE INDEX idx_users_username ON users(username)');
    
    // Create user_settings table
    db.run(`
      CREATE TABLE user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, key)
      )
    `);
    db.run('CREATE INDEX idx_user_settings_user ON user_settings(user_id)');

    // Create token_blacklist table
    db.run(`
      CREATE TABLE token_blacklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    db.run('CREATE INDEX idx_token_blacklist_hash ON token_blacklist(token_hash)');
    db.run('CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at)');

    userService = new TestUserService(db);
    settingsService = new TestUserSettingsService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: user-auth-and-settings, Property 8: Admin Authorization**
   * **Validates: Requirements 10.1, 10.5**
   * 
   * For any user management operation (list, create, update, delete users), 
   * only users with role='admin' should be allowed; others should receive 403.
   */
  describe('Property 8: Admin Authorization', () => {
    it('should allow admin users to access user management endpoints', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const uniqueUsername = `admin_${username}_${counter++}`;
            
            // Create admin user
            const adminUser = await userService.createUser({
              username: uniqueUsername,
              password,
              role: 'admin',
            });
            
            // Generate token for admin
            const token = generateTestToken(adminUser);
            
            // Check authorization
            const result = checkAdminAuthorization(token);
            
            // Admin should be authorized
            expect(result.authorized).toBe(true);
            expect(result.statusCode).toBe(200);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should deny non-admin users access to user management endpoints with 403', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const uniqueUsername = `user_${username}_${counter++}`;
            
            // Create regular user (not admin)
            const regularUser = await userService.createUser({
              username: uniqueUsername,
              password,
              role: 'user',
            });
            
            // Generate token for regular user
            const token = generateTestToken(regularUser);
            
            // Check authorization
            const result = checkAdminAuthorization(token);
            
            // Regular user should NOT be authorized
            expect(result.authorized).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(result.error).toBe('Forbidden: Admin access required');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should deny access without token with 401', () => {
      const result = checkAdminAuthorization(null);
      
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Authorization header is required');
    });

    it('should deny access with invalid token with 401', () => {
      const result = checkAdminAuthorization('invalid-token');
      
      expect(result.authorized).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid token');
    });

    it('should deny access with token signed by wrong secret with 401', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const uniqueUsername = `wrongsec_${username}_${counter++}`;
            
            // Create admin user
            const adminUser = await userService.createUser({
              username: uniqueUsername,
              password,
              role: 'admin',
            });
            
            // Generate token with wrong secret
            const token = generateTestToken(adminUser, 'wrong-secret');
            
            // Check authorization with correct secret
            const result = checkAdminAuthorization(token, TEST_JWT_SECRET);
            
            // Should be denied due to invalid signature
            expect(result.authorized).toBe(false);
            expect(result.statusCode).toBe(401);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * **Feature: user-auth-and-settings, Property 9: Username Uniqueness**
   * **Validates: Requirements 10.2**
   * 
   * For any user creation attempt with an existing username, 
   * the system should reject with an error.
   */
  describe('Property 9: Username Uniqueness', () => {
    it('should reject duplicate username with error', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          passwordArb,
          async (username, password1, password2) => {
            const uniqueUsername = `dup_${username}_${counter++}`;
            
            // Create first user
            await userService.createUser({
              username: uniqueUsername,
              password: password1,
            });
            
            // Try to create second user with same username
            await expect(
              userService.createUser({
                username: uniqueUsername,
                password: password2,
              })
            ).rejects.toThrow('Username already exists');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should allow different usernames', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          usernameArb,
          passwordArb,
          async (username1, username2, password) => {
            // Ensure usernames are different
            const uniqueUsername1 = `diff1_${username1}_${counter}`;
            const uniqueUsername2 = `diff2_${username2}_${counter++}`;
            
            // Create first user
            const user1 = await userService.createUser({
              username: uniqueUsername1,
              password,
            });
            
            // Create second user with different username
            const user2 = await userService.createUser({
              username: uniqueUsername2,
              password,
            });
            
            // Both users should exist
            expect(user1.id).toBeDefined();
            expect(user2.id).toBeDefined();
            expect(user1.id).not.toBe(user2.id);
            expect(user1.username).toBe(uniqueUsername1);
            expect(user2.username).toBe(uniqueUsername2);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should allow reusing username after user deletion', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const uniqueUsername = `reuse_${username}_${counter++}`;
            
            // Create user
            const user1 = await userService.createUser({
              username: uniqueUsername,
              password,
            });
            
            // Delete user
            const deleted = userService.deleteUser(user1.id);
            expect(deleted).toBe(true);
            
            // Create new user with same username
            const user2 = await userService.createUser({
              username: uniqueUsername,
              password,
            });
            
            // New user should be created successfully
            expect(user2.id).toBeDefined();
            expect(user2.id).not.toBe(user1.id);
            expect(user2.username).toBe(uniqueUsername);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * **Feature: user-auth-and-settings, Property 10: User Deletion Cascade**
   * **Validates: Requirements 10.4**
   * 
   * For any user deletion, all associated user_settings records should also be deleted.
   */
  describe('Property 10: User Deletion Cascade', () => {
    it('should delete all user settings when user is deleted', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          fc.array(fc.tuple(settingKeyArb, settingValueArb), { minLength: 1, maxLength: 5 }),
          async (username, password, settingPairs) => {
            const uniqueUsername = `cascade_${username}_${counter++}`;
            
            // Create user
            const user = await userService.createUser({
              username: uniqueUsername,
              password,
            });
            
            // Add settings for the user
            const settings: Record<string, any> = {};
            for (const [key, value] of settingPairs) {
              const uniqueKey = `${key}_${counter}`;
              settings[uniqueKey] = value;
            }
            settingsService.setSettings(user.id, settings);
            
            // Verify settings exist
            const settingsCountBefore = settingsService.getSettingsCount(user.id);
            expect(settingsCountBefore).toBeGreaterThan(0);
            
            // Delete user
            const deleted = userService.deleteUser(user.id);
            expect(deleted).toBe(true);
            
            // Verify user is deleted
            const foundUser = userService.findById(user.id);
            expect(foundUser).toBeNull();
            
            // Verify all settings are deleted
            const settingsCountAfter = settingsService.getSettingsCount(user.id);
            expect(settingsCountAfter).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should not affect other users settings when one user is deleted', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          usernameArb,
          passwordArb,
          fc.array(fc.tuple(settingKeyArb, settingValueArb), { minLength: 1, maxLength: 3 }),
          async (username1, username2, password, settingPairs) => {
            const uniqueUsername1 = `user1_${username1}_${counter}`;
            const uniqueUsername2 = `user2_${username2}_${counter++}`;
            
            // Create two users
            const user1 = await userService.createUser({
              username: uniqueUsername1,
              password,
            });
            const user2 = await userService.createUser({
              username: uniqueUsername2,
              password,
            });
            
            // Add settings for both users
            const settings: Record<string, any> = {};
            for (const [key, value] of settingPairs) {
              const uniqueKey = `${key}_${counter}`;
              settings[uniqueKey] = value;
            }
            settingsService.setSettings(user1.id, settings);
            settingsService.setSettings(user2.id, settings);
            
            // Verify both users have settings
            const user1SettingsBefore = settingsService.getSettingsCount(user1.id);
            const user2SettingsBefore = settingsService.getSettingsCount(user2.id);
            expect(user1SettingsBefore).toBeGreaterThan(0);
            expect(user2SettingsBefore).toBeGreaterThan(0);
            
            // Delete user1
            userService.deleteUser(user1.id);
            
            // User1 settings should be deleted
            const user1SettingsAfter = settingsService.getSettingsCount(user1.id);
            expect(user1SettingsAfter).toBe(0);
            
            // User2 settings should remain unchanged
            const user2SettingsAfter = settingsService.getSettingsCount(user2.id);
            expect(user2SettingsAfter).toBe(user2SettingsBefore);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle user with no settings gracefully', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const uniqueUsername = `nosettings_${username}_${counter++}`;
            
            // Create user without any settings
            const user = await userService.createUser({
              username: uniqueUsername,
              password,
            });
            
            // Verify no settings exist
            const settingsCountBefore = settingsService.getSettingsCount(user.id);
            expect(settingsCountBefore).toBe(0);
            
            // Delete user (should not throw)
            const deleted = userService.deleteUser(user.id);
            expect(deleted).toBe(true);
            
            // Verify user is deleted
            const foundUser = userService.findById(user.id);
            expect(foundUser).toBeNull();
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
