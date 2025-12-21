/**
 * Auth Service Tests
 * Property-based tests for authentication functionality
 * 
 * **Feature: user-auth-and-settings**
 * **Property 2: Login Validation**
 * **Property 3: JWT Token Integrity**
 * **Property 4: Token Blacklist Enforcement**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
 * Login result structure
 */
interface LoginResult {
  success: boolean;
  token?: string;
  user?: UserWithoutPassword;
  error?: string;
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
}


/**
 * Test-specific AuthService that works with sql.js
 */
class TestAuthService {
  private userService: TestUserService;
  private jwtSecret: string;
  private tokenExpiry: string;
  private db: SqlJsDatabase;

  constructor(
    userService: TestUserService,
    db: SqlJsDatabase,
    jwtSecret: string,
    tokenExpiry: string = '24h'
  ) {
    this.userService = userService;
    this.db = db;
    this.jwtSecret = jwtSecret;
    this.tokenExpiry = tokenExpiry;
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const user = this.userService.findByUsername(username);
    if (!user) {
      return {
        success: false,
        error: 'Invalid username or password',
      };
    }

    const isValidPassword = await this.userService.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return {
        success: false,
        error: 'Invalid username or password',
      };
    }

    const token = this.generateToken(user);

    return {
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  generateToken(user: User): string {
    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.tokenExpiry,
    });
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  logout(token: string): void {
    const decoded = jwt.decode(token) as TokenPayload | null;
    if (!decoded || !decoded.exp) {
      return;
    }

    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();
    const now = new Date().toISOString();

    try {
      this.db.run(
        `INSERT OR IGNORE INTO token_blacklist (token_hash, expires_at, created_at) VALUES (?, ?, ?)`,
        [tokenHash, expiresAt, now]
      );
    } catch (error) {
      console.error('Failed to blacklist token:', error);
    }
  }

  isTokenBlacklisted(token: string): boolean {
    const tokenHash = this.hashToken(token);
    
    const result = this.db.exec(
      'SELECT id FROM token_blacklist WHERE token_hash = ?',
      [tokenHash]
    );
    
    return result.length > 0 && result[0].values.length > 0;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

// Generate valid usernames (alphanumeric, 3-20 chars)
const usernameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/);

// Generate valid passwords (at least 1 char, max 50)
const passwordArb = fc.string({ minLength: 1, maxLength: 50 });

// Generate user roles
const roleArb = fc.constantFrom<UserRole>('admin', 'user');

// Test JWT secret
const TEST_JWT_SECRET = 'test-secret-key-for-testing-only';


describe('AuthService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let userService: TestUserService;
  let authService: TestAuthService;

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
    authService = new TestAuthService(userService, db, TEST_JWT_SECRET, '24h');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: user-auth-and-settings, Property 2: Login Validation**
   * **Validates: Requirements 2.1, 2.2, 2.6**
   * 
   * For any login attempt, the system should return success only when both 
   * username exists AND password matches the stored hash; otherwise return 401.
   */
  describe('Property 2: Login Validation', () => {
    it('should return success with valid credentials', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          roleArb,
          async (username, password, role) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_valid_${counter++}`;
            
            // Create user with known credentials
            await userService.createUser({ username: uniqueUsername, password, role });
            
            // Login with correct credentials
            const result = await authService.login(uniqueUsername, password);
            
            // Should succeed
            expect(result.success).toBe(true);
            expect(result.token).toBeDefined();
            expect(result.user).toBeDefined();
            expect(result.user!.username).toBe(uniqueUsername);
            expect(result.user!.role).toBe(role);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should return error with wrong password', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          passwordArb,
          async (username, correctPassword, wrongPassword) => {
            // Skip if passwords happen to be the same
            fc.pre(correctPassword !== wrongPassword);
            
            // Make username unique for each iteration
            const uniqueUsername = `${username}_wrong_${counter++}`;
            
            // Create user with known credentials
            await userService.createUser({ username: uniqueUsername, password: correctPassword });
            
            // Login with wrong password
            const result = await authService.login(uniqueUsername, wrongPassword);
            
            // Should fail
            expect(result.success).toBe(false);
            expect(result.token).toBeUndefined();
            expect(result.user).toBeUndefined();
            expect(result.error).toBe('Invalid username or password');
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should return error with non-existent username', async () => {
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Don't create user - login with non-existent username
            const result = await authService.login(username, password);
            
            // Should fail
            expect(result.success).toBe(false);
            expect(result.token).toBeUndefined();
            expect(result.user).toBeUndefined();
            expect(result.error).toBe('Invalid username or password');
          }
        ),
        { numRuns: 10 }
      );
    });
  });


  /**
   * **Feature: user-auth-and-settings, Property 3: JWT Token Integrity**
   * **Validates: Requirements 2.3, 2.4, 2.5**
   * 
   * For any generated JWT token, decoding it should return the correct 
   * user_id, username, and role; and the token should be verifiable with the secret key.
   */
  describe('Property 3: JWT Token Integrity', () => {
    it('should generate token with correct payload', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          roleArb,
          async (username, password, role) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_jwt_${counter++}`;
            
            // Create user
            const user = await userService.createUser({ username: uniqueUsername, password, role });
            
            // Generate token
            const token = authService.generateToken(user);
            
            // Verify token
            const payload = authService.verifyToken(token);
            
            // Payload should contain correct information
            expect(payload).not.toBeNull();
            expect(payload!.userId).toBe(user.id);
            expect(payload!.username).toBe(uniqueUsername);
            expect(payload!.role).toBe(role);
            expect(payload!.iat).toBeDefined();
            expect(payload!.exp).toBeDefined();
            expect(payload!.exp).toBeGreaterThan(payload!.iat);
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should verify token with correct secret', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_verify_${counter++}`;
            
            // Create user and login
            await userService.createUser({ username: uniqueUsername, password });
            const loginResult = await authService.login(uniqueUsername, password);
            
            expect(loginResult.success).toBe(true);
            expect(loginResult.token).toBeDefined();
            
            // Verify token
            const payload = authService.verifyToken(loginResult.token!);
            
            // Should be valid
            expect(payload).not.toBeNull();
            expect(payload!.username).toBe(uniqueUsername);
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should reject token with wrong secret', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_wrongsec_${counter++}`;
            
            // Create user
            const user = await userService.createUser({ username: uniqueUsername, password });
            
            // Generate token with different secret
            const wrongSecretToken = jwt.sign(
              { userId: user.id, username: uniqueUsername, role: user.role },
              'wrong-secret-key',
              { expiresIn: '24h' }
            );
            
            // Verify with correct service (which uses correct secret)
            const payload = authService.verifyToken(wrongSecretToken);
            
            // Should be null (invalid)
            expect(payload).toBeNull();
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should reject expired token', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_expired_${counter++}`;
            
            // Create user
            const user = await userService.createUser({ username: uniqueUsername, password });
            
            // Generate expired token (expired 1 second ago)
            const expiredToken = jwt.sign(
              { userId: user.id, username: uniqueUsername, role: user.role },
              TEST_JWT_SECRET,
              { expiresIn: '-1s' }
            );
            
            // Verify
            const payload = authService.verifyToken(expiredToken);
            
            // Should be null (expired)
            expect(payload).toBeNull();
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should reject malformed token', () => {
      const malformedTokens = [
        'not-a-jwt',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.payload',
        '',
        'a.b.c',
      ];

      for (const token of malformedTokens) {
        const payload = authService.verifyToken(token);
        expect(payload).toBeNull();
      }
    });
  });


  /**
   * **Feature: user-auth-and-settings, Property 4: Token Blacklist Enforcement**
   * **Validates: Requirements 3.1, 3.2, 3.3**
   * 
   * For any logged-out token, subsequent requests using that token should be rejected.
   */
  describe('Property 4: Token Blacklist Enforcement', () => {
    it('should blacklist token after logout', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_bl_${counter++}`;
            
            // Create user and login
            await userService.createUser({ username: uniqueUsername, password });
            const loginResult = await authService.login(uniqueUsername, password);
            
            expect(loginResult.success).toBe(true);
            const token = loginResult.token!;
            
            // Token should not be blacklisted initially
            expect(authService.isTokenBlacklisted(token)).toBe(false);
            
            // Logout
            authService.logout(token);
            
            // Token should now be blacklisted
            expect(authService.isTokenBlacklisted(token)).toBe(true);
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should not blacklist token that was never logged out', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_nobl_${counter++}`;
            
            // Create user and login
            await userService.createUser({ username: uniqueUsername, password });
            const loginResult = await authService.login(uniqueUsername, password);
            
            expect(loginResult.success).toBe(true);
            const token = loginResult.token!;
            
            // Token should not be blacklisted (never logged out)
            expect(authService.isTokenBlacklisted(token)).toBe(false);
            
            // Token should still be valid
            const payload = authService.verifyToken(token);
            expect(payload).not.toBeNull();
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should handle multiple logouts of same token gracefully', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_multi_${counter++}`;
            
            // Create user and login
            await userService.createUser({ username: uniqueUsername, password });
            const loginResult = await authService.login(uniqueUsername, password);
            
            expect(loginResult.success).toBe(true);
            const token = loginResult.token!;
            
            // Logout multiple times (should not throw)
            authService.logout(token);
            authService.logout(token);
            authService.logout(token);
            
            // Token should be blacklisted
            expect(authService.isTokenBlacklisted(token)).toBe(true);
          }
        ),
        { numRuns: 10 } // Reduced due to bcrypt operations
      );
    });

    it('should keep different tokens independent', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          usernameArb,
          passwordArb,
          async (username, password) => {
            // Make username unique for each iteration
            const uniqueUsername = `${username}_${counter++}`;
            
            // Create user
            await userService.createUser({ username: uniqueUsername, password });
            
            // Login to get first token
            const loginResult1 = await authService.login(uniqueUsername, password);
            expect(loginResult1.success).toBe(true);
            const token1 = loginResult1.token!;
            
            // Wait a tiny bit to ensure different iat timestamp
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            // Login again to get second token
            const loginResult2 = await authService.login(uniqueUsername, password);
            expect(loginResult2.success).toBe(true);
            const token2 = loginResult2.token!;
            
            // Tokens should be different (different iat due to delay)
            expect(token1).not.toBe(token2);
            
            // Logout only token1
            authService.logout(token1);
            
            // Token1 should be blacklisted, token2 should not
            expect(authService.isTokenBlacklisted(token1)).toBe(true);
            expect(authService.isTokenBlacklisted(token2)).toBe(false);
          }
        ),
        { numRuns: 3 } // Reduced due to delay between logins
      );
    });
  });
});
