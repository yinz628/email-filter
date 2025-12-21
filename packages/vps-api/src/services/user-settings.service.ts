/**
 * User Settings Service for VPS API
 * Handles user settings management including CRUD operations
 * 
 * Requirements: 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.5
 */

import type Database from 'better-sqlite3';
import type { UserSetting } from '@email-filter/shared';

// Re-export types for backward compatibility
export type { UserSetting };

/**
 * Database row type for user_settings table
 */
interface UserSettingRow {
  id: number;
  user_id: string;
  key: string;
  value: string;
  updated_at: string;
}

/**
 * User Settings Service class
 * Handles all user settings-related operations
 */
export class UserSettingsService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get all settings for a user
   * Requirements: 6.1
   * 
   * @param userId - The user ID to get settings for
   * @returns Record of all settings as key-value pairs
   */
  getAllSettings(userId: string): Record<string, any> {
    const stmt = this.db.prepare('SELECT key, value FROM user_settings WHERE user_id = ?');
    const rows = stmt.all(userId) as Pick<UserSettingRow, 'key' | 'value'>[];
    
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        // If JSON parsing fails, return raw value
        settings[row.key] = row.value;
      }
    }
    
    return settings;
  }

  /**
   * Get a single setting for a user
   * Requirements: 6.5
   * 
   * @param userId - The user ID
   * @param key - The setting key
   * @returns The setting value or null if not found
   */
  getSetting(userId: string, key: string): any | null {
    const stmt = this.db.prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?');
    const row = stmt.get(userId, key) as Pick<UserSettingRow, 'value'> | undefined;
    
    if (!row) {
      return null;
    }
    
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  /**
   * Set a single setting for a user
   * Requirements: 5.3, 6.2
   * 
   * @param userId - The user ID
   * @param key - The setting key
   * @param value - The setting value (will be JSON serialized)
   */
  setSetting(userId: string, key: string, value: any): void {
    const now = new Date().toISOString();
    const jsonValue = JSON.stringify(value);
    
    const stmt = this.db.prepare(`
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    stmt.run(userId, key, jsonValue, now);
  }

  /**
   * Set multiple settings for a user (batch update)
   * Requirements: 6.3
   * 
   * @param userId - The user ID
   * @param settings - Record of settings to set
   */
  setSettings(userId: string, settings: Record<string, any>): void {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO user_settings (user_id, key, value, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);
    
    const transaction = this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        const jsonValue = JSON.stringify(value);
        stmt.run(userId, key, jsonValue, now);
      }
    });
    
    transaction();
  }

  /**
   * Delete a single setting for a user
   * 
   * @param userId - The user ID
   * @param key - The setting key to delete
   * @returns true if setting was deleted, false if not found
   */
  deleteSetting(userId: string, key: string): boolean {
    const stmt = this.db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?');
    const result = stmt.run(userId, key);
    return result.changes > 0;
  }

  /**
   * Delete all settings for a user
   * 
   * @param userId - The user ID
   * @returns Number of settings deleted
   */
  deleteAllSettings(userId: string): number {
    const stmt = this.db.prepare('DELETE FROM user_settings WHERE user_id = ?');
    const result = stmt.run(userId);
    return result.changes;
  }
}
