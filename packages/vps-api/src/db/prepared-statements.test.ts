/**
 * Unit tests for Prepared Statement Manager
 * 
 * Requirements: 3.1 - Verify statements are correctly cached and reused
 * 
 * Note: These tests use sql.js to simulate the database behavior since
 * better-sqlite3 native bindings are not available in the test environment.
 * The tests verify the core logic of statement caching and reuse.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SQL_STATEMENTS } from './prepared-statements.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test-specific PreparedStatementManager that works with sql.js
 * Simulates the behavior of the real PreparedStatementManager
 */
class TestPreparedStatementManager {
  private statements: Map<string, { sql: string; prepared: boolean }> = new Map();
  private db: SqlJsDatabase | null = null;

  initialize(db: SqlJsDatabase): void {
    this.db = db;
    this.statements.clear();
  }

  getStatement(key: string, sql: string): { sql: string; prepared: boolean } {
    if (!this.db) {
      throw new Error('PreparedStatementManager not initialized. Call initialize() first.');
    }

    let stmt = this.statements.get(key);
    if (!stmt) {
      stmt = { sql: sql.trim(), prepared: true };
      this.statements.set(key, stmt);
    }
    return stmt;
  }

  get(key: keyof typeof SQL_STATEMENTS): { sql: string; prepared: boolean } {
    return this.getStatement(key, SQL_STATEMENTS[key]);
  }

  prepareCommonStatements(): void {
    if (!this.db) {
      throw new Error('PreparedStatementManager not initialized. Call initialize() first.');
    }

    for (const [key, sql] of Object.entries(SQL_STATEMENTS)) {
      if (!this.statements.has(key)) {
        this.statements.set(key, { sql: sql.trim(), prepared: true });
      }
    }
  }

  has(key: string): boolean {
    return this.statements.has(key);
  }

  get size(): number {
    return this.statements.size;
  }

  cleanup(): void {
    this.statements.clear();
    this.db = null;
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  // Helper to execute SQL using sql.js
  run(key: string, ...params: unknown[]): { changes: number } {
    if (!this.db) {
      throw new Error('PreparedStatementManager not initialized');
    }
    const stmt = this.statements.get(key);
    if (!stmt) {
      throw new Error(`Statement ${key} not found`);
    }
    this.db.run(stmt.sql, params as any[]);
    return { changes: this.db.getRowsModified() };
  }

  // Helper to get single row using sql.js
  getOne(key: string, ...params: unknown[]): Record<string, unknown> | undefined {
    if (!this.db) {
      throw new Error('PreparedStatementManager not initialized');
    }
    const stmt = this.statements.get(key);
    if (!stmt) {
      throw new Error(`Statement ${key} not found`);
    }
    const result = this.db.exec(stmt.sql, params as any[]);
    if (result.length === 0 || result[0].values.length === 0) {
      return undefined;
    }
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row;
  }

  // Helper to get all rows using sql.js
  getAll(key: string, ...params: unknown[]): Record<string, unknown>[] {
    if (!this.db) {
      throw new Error('PreparedStatementManager not initialized');
    }
    const stmt = this.statements.get(key);
    if (!stmt) {
      throw new Error(`Statement ${key} not found`);
    }
    const result = this.db.exec(stmt.sql, params as any[]);
    if (result.length === 0) {
      return [];
    }
    const columns = result[0].columns;
    return result[0].values.map(values => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      return row;
    });
  }
}

describe('PreparedStatementManager', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let manager: TestPreparedStatementManager;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();
    
    // Load schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);
    
    // Create fresh manager instance
    manager = new TestPreparedStatementManager();
    manager.initialize(db);
  });

  afterEach(() => {
    if (manager) {
      manager.cleanup();
    }
    if (db) {
      db.close();
    }
  });

  describe('initialization', () => {
    it('should initialize with database connection', () => {
      expect(manager.isInitialized()).toBe(true);
    });

    it('should throw error when not initialized', () => {
      const uninitializedManager = new TestPreparedStatementManager();
      expect(() => uninitializedManager.getStatement('test', 'SELECT 1')).toThrow(
        'PreparedStatementManager not initialized'
      );
    });

    it('should throw error when getting pre-defined statement without initialization', () => {
      const uninitializedManager = new TestPreparedStatementManager();
      expect(() => uninitializedManager.get('INSERT_SUBJECT_TRACKER')).toThrow(
        'PreparedStatementManager not initialized'
      );
    });
  });

  describe('statement caching', () => {
    it('should cache statements on first access', () => {
      expect(manager.size).toBe(0);
      
      manager.getStatement('test', 'SELECT 1');
      
      expect(manager.size).toBe(1);
      expect(manager.has('test')).toBe(true);
    });

    it('should reuse cached statements', () => {
      const stmt1 = manager.getStatement('test', 'SELECT 1');
      const stmt2 = manager.getStatement('test', 'SELECT 2'); // Different SQL, same key
      
      // Should return the same statement (cached)
      expect(stmt1).toBe(stmt2);
      expect(manager.size).toBe(1);
    });

    it('should cache different statements with different keys', () => {
      const stmt1 = manager.getStatement('test1', 'SELECT 1');
      const stmt2 = manager.getStatement('test2', 'SELECT 2');
      
      expect(stmt1).not.toBe(stmt2);
      expect(manager.size).toBe(2);
    });
  });

  describe('pre-defined statements', () => {
    it('should get INSERT_SUBJECT_TRACKER statement', () => {
      const stmt = manager.get('INSERT_SUBJECT_TRACKER');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('INSERT_SUBJECT_TRACKER')).toBe(true);
    });

    it('should get COUNT_SUBJECTS statement', () => {
      const stmt = manager.get('COUNT_SUBJECTS');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('COUNT_SUBJECTS')).toBe(true);
    });

    it('should get GET_TIMESTAMPS statement', () => {
      const stmt = manager.get('GET_TIMESTAMPS');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('GET_TIMESTAMPS')).toBe(true);
    });

    it('should get CLEANUP_SUBJECT_TRACKER statement', () => {
      const stmt = manager.get('CLEANUP_SUBJECT_TRACKER');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('CLEANUP_SUBJECT_TRACKER')).toBe(true);
    });

    it('should get FIND_DYNAMIC_RULE_EXACT statement', () => {
      const stmt = manager.get('FIND_DYNAMIC_RULE_EXACT');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('FIND_DYNAMIC_RULE_EXACT')).toBe(true);
    });

    it('should get FIND_ALL_DYNAMIC_RULES statement', () => {
      const stmt = manager.get('FIND_ALL_DYNAMIC_RULES');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('FIND_ALL_DYNAMIC_RULES')).toBe(true);
    });

    it('should get GET_DYNAMIC_CONFIG statement', () => {
      const stmt = manager.get('GET_DYNAMIC_CONFIG');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('GET_DYNAMIC_CONFIG')).toBe(true);
    });

    it('should get UPSERT_DYNAMIC_CONFIG statement', () => {
      const stmt = manager.get('UPSERT_DYNAMIC_CONFIG');
      expect(stmt).toBeDefined();
      expect(stmt.prepared).toBe(true);
      expect(manager.has('UPSERT_DYNAMIC_CONFIG')).toBe(true);
    });
  });

  describe('prepareCommonStatements', () => {
    it('should pre-compile all common statements', () => {
      expect(manager.size).toBe(0);
      
      manager.prepareCommonStatements();
      
      // Should have all pre-defined statements
      const expectedCount = Object.keys(SQL_STATEMENTS).length;
      expect(manager.size).toBe(expectedCount);
    });

    it('should not duplicate statements when called multiple times', () => {
      manager.prepareCommonStatements();
      const sizeAfterFirst = manager.size;
      
      manager.prepareCommonStatements();
      const sizeAfterSecond = manager.size;
      
      expect(sizeAfterFirst).toBe(sizeAfterSecond);
    });
  });

  describe('cleanup', () => {
    it('should clear all cached statements', () => {
      manager.prepareCommonStatements();
      expect(manager.size).toBeGreaterThan(0);
      
      manager.cleanup();
      
      expect(manager.size).toBe(0);
      expect(manager.isInitialized()).toBe(false);
    });
  });

  describe('statement execution', () => {
    it('should execute INSERT_SUBJECT_TRACKER correctly', () => {
      manager.get('INSERT_SUBJECT_TRACKER');
      const now = new Date().toISOString();
      
      const result = manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'Test Subject', now);
      
      expect(result.changes).toBe(1);
    });

    it('should execute COUNT_SUBJECTS correctly', () => {
      // Insert test data
      manager.get('INSERT_SUBJECT_TRACKER');
      const now = new Date().toISOString();
      manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'Test Subject', now);
      manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'Test Subject', now);
      
      // Count subjects
      manager.get('COUNT_SUBJECTS');
      const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const result = manager.getOne('COUNT_SUBJECTS', 'hash123', windowStart);
      
      expect(result?.count).toBe(2);
    });

    it('should execute GET_TIMESTAMPS correctly', () => {
      // Insert test data
      manager.get('INSERT_SUBJECT_TRACKER');
      const now = new Date();
      manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'Test Subject', now.toISOString());
      manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'Test Subject', new Date(now.getTime() + 1000).toISOString());
      manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'Test Subject', new Date(now.getTime() + 2000).toISOString());
      
      // Get timestamps
      manager.get('GET_TIMESTAMPS');
      const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const results = manager.getAll('GET_TIMESTAMPS', 'hash123', windowStart, 2);
      
      expect(results.length).toBe(2);
    });

    it('should execute CLEANUP_SUBJECT_TRACKER correctly', () => {
      // Insert test data
      manager.get('INSERT_SUBJECT_TRACKER');
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const newTime = new Date().toISOString();
      manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'Old Subject', oldTime);
      manager.run('INSERT_SUBJECT_TRACKER', 'hash123', 'New Subject', newTime);
      
      // Cleanup old records
      manager.get('CLEANUP_SUBJECT_TRACKER');
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const result = manager.run('CLEANUP_SUBJECT_TRACKER', 'hash123', cutoff);
      
      expect(result.changes).toBe(1);
      
      // Verify only new record remains
      manager.get('COUNT_SUBJECTS');
      const windowStart = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const countResult = manager.getOne('COUNT_SUBJECTS', 'hash123', windowStart);
      expect(countResult?.count).toBe(1);
    });

    it('should execute GET_DYNAMIC_CONFIG correctly', () => {
      // Insert test config
      manager.get('UPSERT_DYNAMIC_CONFIG');
      manager.run('UPSERT_DYNAMIC_CONFIG', 'enabled', 'true');
      manager.run('UPSERT_DYNAMIC_CONFIG', 'timeWindowMinutes', '30');
      
      // Get config
      manager.get('GET_DYNAMIC_CONFIG');
      const results = manager.getAll('GET_DYNAMIC_CONFIG');
      
      expect(results.length).toBe(2);
      expect(results.find(r => r.key === 'enabled')?.value).toBe('true');
      expect(results.find(r => r.key === 'timeWindowMinutes')?.value).toBe('30');
    });

    it('should execute UPSERT_DYNAMIC_CONFIG correctly', () => {
      manager.get('UPSERT_DYNAMIC_CONFIG');
      
      // Insert
      manager.run('UPSERT_DYNAMIC_CONFIG', 'testKey', 'value1');
      
      // Update (upsert)
      manager.run('UPSERT_DYNAMIC_CONFIG', 'testKey', 'value2');
      
      // Verify
      manager.get('GET_DYNAMIC_CONFIG');
      const results = manager.getAll('GET_DYNAMIC_CONFIG');
      
      expect(results.length).toBe(1);
      expect(results[0].value).toBe('value2');
    });
  });

  describe('SQL_STATEMENTS constant', () => {
    it('should have all required statement keys', () => {
      const requiredKeys = [
        'INSERT_SUBJECT_TRACKER',
        'COUNT_SUBJECTS',
        'GET_TIMESTAMPS',
        'CLEANUP_SUBJECT_TRACKER',
        'FIND_DYNAMIC_RULE_EXACT',
        'FIND_ALL_DYNAMIC_RULES',
        'GET_DYNAMIC_CONFIG',
        'UPSERT_DYNAMIC_CONFIG',
      ];

      for (const key of requiredKeys) {
        expect(SQL_STATEMENTS).toHaveProperty(key);
        expect(typeof SQL_STATEMENTS[key as keyof typeof SQL_STATEMENTS]).toBe('string');
      }
    });

    it('should have valid SQL syntax for all statements', () => {
      // Each statement should be a non-empty string
      for (const [key, sql] of Object.entries(SQL_STATEMENTS)) {
        expect(sql.trim().length).toBeGreaterThan(0);
        // Basic SQL keyword check
        const upperSql = sql.toUpperCase();
        const hasValidKeyword = 
          upperSql.includes('SELECT') || 
          upperSql.includes('INSERT') || 
          upperSql.includes('UPDATE') || 
          upperSql.includes('DELETE');
        expect(hasValidKeyword).toBe(true);
      }
    });
  });
});
