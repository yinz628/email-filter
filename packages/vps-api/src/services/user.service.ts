/**
 * User Service for VPS API
 * Handles user management including creation, authentication, and CRUD operations
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 2.2, 10.1, 10.3, 10.4
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import type Database from 'better-sqlite3';
import type { User, UserWithoutPassword, CreateUserDTO, UpdateUserDTO, UserRole } from '@email-filter/shared';

// Re-export types for backward compatibility
export type { User, UserWithoutPassword, CreateUserDTO, UpdateUserDTO, UserRole };

/**
 * Database row type for users table
 */
interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  updated_at: string;
}

/**
 * Salt rounds for bcrypt hashing
 * Requirements: 1.3
 */
const SALT_ROUNDS = 10;


/**
 * Convert database row to User entity
 */
function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role as UserRole,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/**
 * Convert User to UserWithoutPassword
 */
export function toUserWithoutPassword(user: User): UserWithoutPassword {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * User Service class
 * Handles all user-related operations
 */
export class UserService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Hash a plain text password using bcrypt
   * Requirements: 1.3, 2.2
   * 
   * @param plainPassword - The plain text password to hash
   * @returns Promise resolving to the hashed password
   */
  async hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  /**
   * Verify a plain text password against a hashed password
   * Requirements: 2.2
   * 
   * @param plainPassword - The plain text password to verify
   * @param hashedPassword - The hashed password to compare against
   * @returns Promise resolving to true if passwords match, false otherwise
   */
  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Create a new user
   * Requirements: 1.2, 10.2
   * 
   * @param data - User creation data
   * @returns The created user
   * @throws Error if username already exists
   */
  async createUser(data: CreateUserDTO): Promise<User> {
    const now = new Date().toISOString();
    const id = uuidv4();
    const passwordHash = await this.hashPassword(data.password);
    const role = data.role || 'user';

    try {
      const stmt = this.db.prepare(`
        INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, data.username, passwordHash, role, now, now);

      return {
        id,
        username: data.username,
        passwordHash,
        role,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    } catch (error: any) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.message?.includes('UNIQUE constraint failed')) {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  /**
   * Find a user by username
   * Requirements: 2.1
   * 
   * @param username - The username to search for
   * @returns The user if found, null otherwise
   */
  findByUsername(username: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE username = ?');
    const row = stmt.get(username) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  /**
   * Find a user by ID
   * 
   * @param id - The user ID to search for
   * @returns The user if found, null otherwise
   */
  findById(id: string): User | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  /**
   * Get all users (without password hashes)
   * Requirements: 10.1
   * 
   * @returns Array of all users without password information
   */
  getAllUsers(): UserWithoutPassword[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC');
    const rows = stmt.all() as UserRow[];
    return rows.map(row => toUserWithoutPassword(rowToUser(row)));
  }

  /**
   * Update a user
   * Requirements: 10.3
   * 
   * @param id - The user ID to update
   * @param data - The update data
   * @returns The updated user if found, null otherwise
   */
  async updateUser(id: string, data: UpdateUserDTO): Promise<User | null> {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (data.password !== undefined) {
      const passwordHash = await this.hashPassword(data.password);
      updates.push('password_hash = ?');
      values.push(passwordHash);
    }

    if (data.role !== undefined) {
      updates.push('role = ?');
      values.push(data.role);
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE users SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Delete a user and their settings
   * Requirements: 10.4
   * 
   * @param id - The user ID to delete
   * @returns true if user was deleted, false if not found
   */
  deleteUser(id: string): boolean {
    const existing = this.findById(id);
    if (!existing) {
      return false;
    }

    // Delete user settings first (cascade should handle this, but be explicit)
    const deleteSettingsStmt = this.db.prepare('DELETE FROM user_settings WHERE user_id = ?');
    deleteSettingsStmt.run(id);

    // Delete the user
    const deleteUserStmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = deleteUserStmt.run(id);

    return result.changes > 0;
  }

  /**
   * Ensure default admin user exists
   * Requirements: 1.4, 1.5
   * 
   * @param defaultUsername - Default admin username from environment
   * @param defaultPassword - Default admin password from environment
   */
  async ensureDefaultAdmin(defaultUsername: string, defaultPassword: string): Promise<void> {
    // Check if any admin user exists
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
    const result = stmt.get() as { count: number };

    if (result.count === 0) {
      // No admin exists, create default admin
      await this.createUser({
        username: defaultUsername,
        password: defaultPassword,
        role: 'admin',
      });
      console.log(`Default admin user '${defaultUsername}' created.`);
    }
  }

  /**
   * Get user count
   * 
   * @returns Total number of users
   */
  getUserCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    return result.count;
  }
}
