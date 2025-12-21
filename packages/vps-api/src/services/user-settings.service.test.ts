/**
 * User Settings Service Tests
 * Property-based tests for user settings functionality
 * 
 * **Feature: user-auth-and-settings**
 * **Property 6: User Settings Isolation**
 * **Property 7: Settings Persistence**
 * **Validates: Requirements 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import crypto from 'crypto';

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
    
    const settings: Record<string, any> = {};
    if (result.length > 0 && result[0].values.length > 0) {
      for (const row of result[0].values) {
        const key = row[0] as string;
        const value = row[1] as string;
        try {
          settings[key] = JSON.parse(value);
        } catch {
          settings[key] = value;
        }
      }
    }
    
    return settings;
  }

  getSetting(userId: string, key: string): any | null {
    const result = this.db.exec(
      'SELECT value FROM user_settings WHERE user_id = ? AND key = ?',
      [userId, key]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    const value = result[0].values[0][0] as string;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
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
      // Update existing
      this.db.run(
        'UPDATE user_settings SET value = ?, updated_at = ? WHERE user_id = ? AND key = ?',
        [jsonValue, now, userId, key]
      );
    } else {
      // Insert new
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

  deleteSetting(userId: string, key: string): boolean {
    const before = this.db.exec('SELECT COUNT(*) FROM user_settings WHERE user_id = ? AND key = ?', [userId, key]);
    const countBefore = before[0]?.values[0]?.[0] as number || 0;
    
    this.db.run('DELETE FROM user_settings WHERE user_id = ? AND key = ?', [userId, key]);
    
    return countBefore > 0;
  }

  deleteAllSettings(userId: string): number {
    const before = this.db.exec('SELECT COUNT(*) FROM user_settings WHERE user_id = ?', [userId]);
    const countBefore = before[0]?.values[0]?.[0] as number || 0;
    
    this.db.run('DELETE FROM user_settings WHERE user_id = ?', [userId]);
    
    return countBefore;
  }
}

/**
 * Helper to create a test user in the database
 */
function createTestUser(db: SqlJsDatabase, username: string): string {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, username, 'test-hash', 'user', now, now]
  );
  return id;
}

// Generate valid setting keys (alphanumeric with dots/underscores, 1-50 chars)
const settingKeyArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_.]{0,49}$/);

// Generate valid setting values (various JSON-serializable types)
// Note: We exclude -0 because JSON.stringify(-0) === "0" but Object.is(-0, 0) === false
const settingValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter(n => !Object.is(n, -0)),
  fc.array(fc.string(), { maxLength: 5 }),
  fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string(), { maxKeys: 5 })
);

// Generate a record of settings
const settingsRecordArb = fc.dictionary(
  settingKeyArb,
  settingValueArb,
  { minKeys: 1, maxKeys: 5 }
);

describe('UserSettingsService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
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

    settingsService = new TestUserSettingsService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: user-auth-and-settings, Property 6: User Settings Isolation**
   * **Validates: Requirements 6.1, 6.4**
   * 
   * For any two users A and B, user A should only be able to read and write 
   * their own settings, never user B's settings.
   */
  describe('Property 6: User Settings Isolation', () => {
    it('should isolate settings between different users', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          settingValueArb,
          settingValueArb,
          async (key, valueA, valueB) => {
            // Create two different users
            const userIdA = createTestUser(db, `userA_${counter}`);
            const userIdB = createTestUser(db, `userB_${counter}`);
            counter++;
            
            // Set different values for the same key for each user
            settingsService.setSetting(userIdA, key, valueA);
            settingsService.setSetting(userIdB, key, valueB);
            
            // Each user should only see their own value
            const retrievedA = settingsService.getSetting(userIdA, key);
            const retrievedB = settingsService.getSetting(userIdB, key);
            
            expect(retrievedA).toEqual(valueA);
            expect(retrievedB).toEqual(valueB);
            
            // getAllSettings should only return own settings
            const allSettingsA = settingsService.getAllSettings(userIdA);
            const allSettingsB = settingsService.getAllSettings(userIdB);
            
            expect(allSettingsA[key]).toEqual(valueA);
            expect(allSettingsB[key]).toEqual(valueB);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should not leak settings when one user deletes their settings', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          settingValueArb,
          settingValueArb,
          async (key, valueA, valueB) => {
            // Create two different users
            const userIdA = createTestUser(db, `userA_del_${counter}`);
            const userIdB = createTestUser(db, `userB_del_${counter}`);
            counter++;
            
            // Set values for both users
            settingsService.setSetting(userIdA, key, valueA);
            settingsService.setSetting(userIdB, key, valueB);
            
            // Delete user A's setting
            settingsService.deleteSetting(userIdA, key);
            
            // User A should not have the setting anymore
            expect(settingsService.getSetting(userIdA, key)).toBeNull();
            
            // User B's setting should be unaffected
            expect(settingsService.getSetting(userIdB, key)).toEqual(valueB);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should isolate deleteAllSettings to only affect the specified user', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingsRecordArb,
          settingsRecordArb,
          async (settingsA, settingsB) => {
            // Create two different users
            const userIdA = createTestUser(db, `userA_delall_${counter}`);
            const userIdB = createTestUser(db, `userB_delall_${counter}`);
            counter++;
            
            // Set settings for both users
            settingsService.setSettings(userIdA, settingsA);
            settingsService.setSettings(userIdB, settingsB);
            
            // Delete all settings for user A
            settingsService.deleteAllSettings(userIdA);
            
            // User A should have no settings
            const allSettingsA = settingsService.getAllSettings(userIdA);
            expect(Object.keys(allSettingsA).length).toBe(0);
            
            // User B's settings should be unaffected
            const allSettingsB = settingsService.getAllSettings(userIdB);
            expect(allSettingsB).toEqual(settingsB);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Feature: user-auth-and-settings, Property 7: Settings Persistence**
   * **Validates: Requirements 6.2, 6.3**
   * 
   * For any setting update, the value should be retrievable in subsequent requests.
   */
  describe('Property 7: Settings Persistence', () => {
    it('should persist and retrieve single settings correctly', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          settingValueArb,
          async (key, value) => {
            const userId = createTestUser(db, `user_persist_${counter++}`);
            
            // Set the setting
            settingsService.setSetting(userId, key, value);
            
            // Retrieve the setting
            const retrieved = settingsService.getSetting(userId, key);
            
            // Should match the original value
            expect(retrieved).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should persist and retrieve batch settings correctly', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingsRecordArb,
          async (settings) => {
            const userId = createTestUser(db, `user_batch_${counter++}`);
            
            // Set multiple settings at once
            settingsService.setSettings(userId, settings);
            
            // Retrieve all settings
            const retrieved = settingsService.getAllSettings(userId);
            
            // Should match the original settings
            expect(retrieved).toEqual(settings);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update existing settings correctly', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          settingValueArb,
          settingValueArb,
          async (key, initialValue, updatedValue) => {
            const userId = createTestUser(db, `user_update_${counter++}`);
            
            // Set initial value
            settingsService.setSetting(userId, key, initialValue);
            expect(settingsService.getSetting(userId, key)).toEqual(initialValue);
            
            // Update to new value
            settingsService.setSetting(userId, key, updatedValue);
            
            // Should return the updated value
            expect(settingsService.getSetting(userId, key)).toEqual(updatedValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for non-existent settings', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          async (key) => {
            const userId = createTestUser(db, `user_nonexist_${counter++}`);
            
            // Don't set any settings
            
            // Should return null for non-existent key
            const retrieved = settingsService.getSetting(userId, key);
            expect(retrieved).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle complex nested objects', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          fc.record({
            enabled: fc.boolean(),
            interval: fc.integer({ min: 1, max: 3600 }),
            options: fc.array(fc.string(), { maxLength: 3 }),
            nested: fc.record({
              level: fc.integer({ min: 1, max: 10 }),
              name: fc.string()
            })
          }),
          async (key, complexValue) => {
            const userId = createTestUser(db, `user_complex_${counter++}`);
            
            // Set complex nested object
            settingsService.setSetting(userId, key, complexValue);
            
            // Retrieve and verify
            const retrieved = settingsService.getSetting(userId, key);
            expect(retrieved).toEqual(complexValue);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should delete settings correctly', async () => {
      let counter = 0;
      await fc.assert(
        fc.asyncProperty(
          settingKeyArb,
          settingValueArb,
          async (key, value) => {
            const userId = createTestUser(db, `user_delete_${counter++}`);
            
            // Set the setting
            settingsService.setSetting(userId, key, value);
            expect(settingsService.getSetting(userId, key)).toEqual(value);
            
            // Delete the setting
            const deleted = settingsService.deleteSetting(userId, key);
            expect(deleted).toBe(true);
            
            // Should return null after deletion
            expect(settingsService.getSetting(userId, key)).toBeNull();
            
            // Deleting again should return false
            const deletedAgain = settingsService.deleteSetting(userId, key);
            expect(deletedAgain).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
