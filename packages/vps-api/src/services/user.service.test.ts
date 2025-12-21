/**
 * User Service Tests
 * Property-based tests for user authentication and management
 * 
 * **Feature: user-auth-and-settings, Property 1: Password Security**
 * **Validates: Requirements 1.3, 2.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import bcrypt from 'bcrypt';

// Salt rounds for bcrypt hashing (matching the service)
const SALT_ROUNDS = 10;

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

// Generate valid usernames (alphanumeric, 3-20 chars)
const usernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/);

// Generate valid passwords (at least 1 char, max 100)
const passwordArb = fc.string({ minLength: 1, maxLength: 100 });

describe('UserService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let userService: TestUserService;

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

    userService = new TestUserService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: user-auth-and-settings, Property 1: Password Security**
   * **Validates: Requirements 1.3, 2.2**
   * 
   * For any user creation or password update, the stored password_hash 
   * should NOT equal the plain text password, and bcrypt.compare should 
   * return true for the original password.
   */
  describe('Property 1: Password Security', () => {
    it('hashed password should never equal plain text password', async () => {
      await fc.assert(
        fc.asyncProperty(
          passwordArb,
          async (plainPassword) => {
            const hashedPassword = await userService.hashPassword(plainPassword);
            
            // Hash should never equal plain text
            expect(hashedPassword).not.toBe(plainPassword);
            
            // Hash should be a valid bcrypt hash (starts with $2b$ or $2a$)
            expect(hashedPassword).toMatch(/^\$2[ab]\$/);
          }
        ),
        { numRuns: 20 } // Reduced due to bcrypt being CPU-intensive
      );
    });

    it('bcrypt.compare should return true for original password', async () => {
      await fc.assert(
        fc.asyncProperty(
          passwordArb,
          async (plainPassword) => {
            const hashedPassword = await userService.hashPassword(plainPassword);
            
            // Verify should return true for original password
            const isValid = await userService.verifyPassword(plainPassword, hashedPassword);
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 20 } // Reduced due to bcrypt being CPU-intensive
      );
    });

    it('bcrypt.compare should return false for wrong password', async () => {
      await fc.assert(
        fc.asyncProperty(
          passwordArb,
          passwordArb.filter(p => p.length > 0),
          async (originalPassword, wrongPassword) => {
            // Skip if passwords happen to be the same
            fc.pre(originalPassword !== wrongPassword);
            
            const hashedPassword = await userService.hashPassword(originalPassword);
            
            // Verify should return false for wrong password
            const isValid = await userService.verifyPassword(wrongPassword, hashedPassword);
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: 20 } // Reduced due to bcrypt being CPU-intensive
      );
    });

    it('created user should have hashed password that verifies correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const user = await userService.createUser({ username, password });
            
            // Password hash should not equal plain password
            expect(user.passwordHash).not.toBe(password);
            
            // Password should verify correctly
            const isValid = await userService.verifyPassword(password, user.passwordHash);
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 10 } // Fewer runs due to database + bcrypt operations
      );
    });
  });

  describe('User CRUD Operations', () => {
    it('should create and find user by username', async () => {
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const created = await userService.createUser({ username, password });
            const found = userService.findByUsername(username);
            
            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
            expect(found!.username).toBe(username);
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should create and find user by id', async () => {
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            const created = await userService.createUser({ username, password });
            const found = userService.findById(created.id);
            
            expect(found).not.toBeNull();
            expect(found!.id).toBe(created.id);
            expect(found!.username).toBe(username);
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should return null for non-existent username', () => {
      const found = userService.findByUsername('nonexistent_user_xyz');
      expect(found).toBeNull();
    });

    it('should return null for non-existent id', () => {
      const found = userService.findById('nonexistent-id-xyz');
      expect(found).toBeNull();
    });

    it('should delete user and return true', async () => {
      const user = await userService.createUser({
        username: 'testuser',
        password: 'testpass',
      });
      
      const deleted = userService.deleteUser(user.id);
      expect(deleted).toBe(true);
      
      const found = userService.findById(user.id);
      expect(found).toBeNull();
    });

    it('should return false when deleting non-existent user', () => {
      const deleted = userService.deleteUser('nonexistent-id');
      expect(deleted).toBe(false);
    });
  });
});
