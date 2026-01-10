/**
 * Property-based tests for Log Repository Worker Instance Support
 * 
 * **Feature: worker-instance-data-separation, Property 1: Worker Name Persistence**
 * **Validates: Requirements 1.1, 1.2**
 * 
 * For any log entry created with a worker name, querying that log should return the same worker name.
 * 
 * **Feature: worker-instance-data-separation, Property 2: Filter Consistency**
 * **Validates: Requirements 1.3**
 * 
 * For any query with a specific worker name filter, all returned records should have that worker name.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Types matching the repository
type LogCategory = 'email_forward' | 'email_drop' | 'admin_action' | 'system';
type LogLevel = 'info' | 'warn' | 'error';

interface SystemLog {
  id: number;
  category: LogCategory;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown>;
  workerName: string;
  createdAt: Date;
}

// Arbitraries for generating valid test data
const workerNameArb = fc.oneof(
  fc.constant('global'),
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/)
);

const logCategoryArb: fc.Arbitrary<LogCategory> = fc.constantFrom('email_forward', 'email_drop', 'admin_action', 'system');
const logLevelArb: fc.Arbitrary<LogLevel> = fc.constantFrom('info', 'warn', 'error');
const messageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0 && !s.includes("'"));

/**
 * Test-specific LogRepository that works with sql.js
 */
class TestLogRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToLog(row: any[]): SystemLog {
    return {
      id: row[0] as number,
      category: row[1] as LogCategory,
      level: row[2] as LogLevel,
      message: row[3] as string,
      details: row[4] ? JSON.parse(row[4] as string) : undefined,
      workerName: (row[5] as string) || 'global',
      createdAt: new Date(row[6] as string),
    };
  }

  create(category: LogCategory, message: string, details?: Record<string, unknown>, level: LogLevel = 'info', workerName: string = 'global'): SystemLog {
    const now = new Date().toISOString();
    const detailsJson = details ? JSON.stringify(details) : null;

    this.db.run(
      `INSERT INTO system_logs (category, level, message, details, worker_name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [category, level, message, detailsJson, workerName, now]
    );

    // Get the last inserted ID
    const result = this.db.exec('SELECT last_insert_rowid()');
    const id = result[0].values[0][0] as number;

    return {
      id,
      category,
      level,
      message,
      details,
      workerName,
      createdAt: new Date(now),
    };
  }

  /**
   * Create an admin action log entry
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
   */
  createAdminLog(action: string, details: Record<string, unknown>, workerName: string = 'global'): SystemLog {
    return this.create('admin_action', action, details, 'info', workerName);
  }

  /**
   * Create a system log entry
   * Requirements: 6.1, 6.2, 6.3
   */
  createSystemLog(event: string, details: Record<string, unknown>, workerName: string = 'global'): SystemLog {
    return this.create('system', event, details, 'info', workerName);
  }

  findById(id: number): SystemLog | null {
    const result = this.db.exec(
      'SELECT id, category, level, message, details, worker_name, created_at FROM system_logs WHERE id = ?',
      [id]
    );
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    
    return this.rowToLog(result[0].values[0]);
  }

  findAll(filter?: { category?: LogCategory; level?: LogLevel; workerName?: string; limit?: number; offset?: number }): SystemLog[] {
    let query = 'SELECT id, category, level, message, details, worker_name, created_at FROM system_logs WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.category) {
      query += ' AND category = ?';
      params.push(filter.category);
    }
    if (filter?.level) {
      query += ' AND level = ?';
      params.push(filter.level);
    }
    if (filter?.workerName) {
      query += ' AND worker_name = ?';
      params.push(filter.workerName);
    }

    query += ' ORDER BY created_at DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
      if (filter?.offset) {
        query += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    const result = this.db.exec(query, params);
    
    if (result.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => this.rowToLog(row));
  }
}

/**
 * Apply the worker instance migration to the database
 * Note: worker_name column is now part of the consolidated schema.sql,
 * so we only need to ensure the index exists (which is also in schema.sql)
 */
function applyWorkerInstanceMigration(_db: SqlJsDatabase): void {
  // worker_name column and index are now part of the consolidated schema.sql
  // This function is kept for backwards compatibility but no longer needs to do anything
}

describe('Log Repository Worker Instance Support', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let logRepository: TestLogRepository;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute main schema
    const mainSchemaPath = join(__dirname, 'schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    // Apply worker instance migration
    applyWorkerInstanceMigration(db);

    logRepository = new TestLogRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: worker-instance-data-separation, Property 1: Worker Name Persistence**
   * **Validates: Requirements 1.1, 1.2**
   * 
   * For any log entry created with a worker name, querying that log should return the same worker name.
   */
  describe('Property 1: Worker Name Persistence', () => {
    it('should persist and return the same worker name for any created log', () => {
      fc.assert(
        fc.property(
          logCategoryArb,
          logLevelArb,
          messageArb,
          workerNameArb,
          (category, level, message, workerName) => {
            // Create a log with the specified worker name
            const created = logRepository.create(category, message, undefined, level, workerName);
            
            // Query the log by ID
            const retrieved = logRepository.findById(created.id);
            
            // Verify the worker name is persisted correctly
            expect(retrieved).not.toBeNull();
            expect(retrieved!.workerName).toBe(workerName);
            expect(retrieved!.category).toBe(category);
            expect(retrieved!.level).toBe(level);
            expect(retrieved!.message).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should default to global when no worker name is specified', () => {
      fc.assert(
        fc.property(
          logCategoryArb,
          logLevelArb,
          messageArb,
          (category, level, message) => {
            // Create a log without specifying worker name
            const created = logRepository.create(category, message, undefined, level);
            
            // Query the log by ID
            const retrieved = logRepository.findById(created.id);
            
            // Verify the worker name defaults to 'global'
            expect(retrieved).not.toBeNull();
            expect(retrieved!.workerName).toBe('global');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: worker-instance-data-separation, Property 2: Filter Consistency**
   * **Validates: Requirements 1.3**
   * 
   * For any query with a specific worker name filter, all returned records should have that worker name.
   */
  describe('Property 2: Filter Consistency', () => {
    it('should return only logs with the specified worker name when filtering', () => {
      fc.assert(
        fc.property(
          // Generate multiple logs with different worker names
          fc.array(
            fc.tuple(logCategoryArb, logLevelArb, messageArb, workerNameArb),
            { minLength: 5, maxLength: 20 }
          ),
          // Pick a worker name to filter by
          workerNameArb,
          (logConfigs, filterWorkerName) => {
            // Create logs with various worker names
            for (const [category, level, message, workerName] of logConfigs) {
              logRepository.create(category, message, undefined, level, workerName);
            }
            
            // Also create some logs with the filter worker name to ensure we have matches
            logRepository.create('email_forward', 'Test message', undefined, 'info', filterWorkerName);
            
            // Query with worker name filter
            const filteredLogs = logRepository.findAll({ workerName: filterWorkerName });
            
            // Verify all returned logs have the specified worker name
            for (const log of filteredLogs) {
              expect(log.workerName).toBe(filterWorkerName);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all logs when no worker name filter is specified', () => {
      fc.assert(
        fc.property(
          // Generate multiple logs with different worker names
          fc.array(
            fc.tuple(logCategoryArb, logLevelArb, messageArb, workerNameArb),
            { minLength: 3, maxLength: 10 }
          ),
          (logConfigs) => {
            // Create logs with various worker names
            const createdIds: number[] = [];
            for (const [category, level, message, workerName] of logConfigs) {
              const log = logRepository.create(category, message, undefined, level, workerName);
              createdIds.push(log.id);
            }
            
            // Query without worker name filter
            const allLogs = logRepository.findAll({ limit: 100 });
            
            // Verify all created logs are returned
            const returnedIds = allLogs.map(log => log.id);
            for (const id of createdIds) {
              expect(returnedIds).toContain(id);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should correctly combine worker name filter with other filters', () => {
      fc.assert(
        fc.property(
          // Generate multiple logs with different configurations
          fc.array(
            fc.tuple(logCategoryArb, logLevelArb, messageArb, workerNameArb),
            { minLength: 10, maxLength: 30 }
          ),
          // Pick filters
          logCategoryArb,
          workerNameArb,
          (logConfigs, filterCategory, filterWorkerName) => {
            // Create logs with various configurations
            for (const [category, level, message, workerName] of logConfigs) {
              logRepository.create(category, message, undefined, level, workerName);
            }
            
            // Create some logs that match both filters
            logRepository.create(filterCategory, 'Matching log', undefined, 'info', filterWorkerName);
            
            // Query with both category and worker name filters
            const filteredLogs = logRepository.findAll({ 
              category: filterCategory, 
              workerName: filterWorkerName 
            });
            
            // Verify all returned logs match both filters
            for (const log of filteredLogs) {
              expect(log.workerName).toBe(filterWorkerName);
              expect(log.category).toBe(filterCategory);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: dynamic-rule-realtime, Property: Admin Log Helper**
   * **Validates: Requirements 5.1, 6.1**
   * 
   * For any admin action log created via createAdminLog, the log should have category 'admin_action'.
   */
  describe('Admin and System Log Helper Methods', () => {
    it('createAdminLog should create logs with admin_action category', () => {
      fc.assert(
        fc.property(
          messageArb,
          fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z]/.test(s)), fc.string()),
          workerNameArb,
          (action, details, workerName) => {
            const log = logRepository.createAdminLog(action, details, workerName);
            
            expect(log.category).toBe('admin_action');
            expect(log.level).toBe('info');
            expect(log.message).toBe(action);
            expect(log.workerName).toBe(workerName);
            
            // Verify persistence
            const retrieved = logRepository.findById(log.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.category).toBe('admin_action');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('createAdminLog should default workerName to global', () => {
      const log = logRepository.createAdminLog('Test action', { test: true });
      expect(log.workerName).toBe('global');
    });

    it('createSystemLog should create logs with system category', () => {
      fc.assert(
        fc.property(
          messageArb,
          fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z]/.test(s)), fc.string()),
          workerNameArb,
          (event, details, workerName) => {
            const log = logRepository.createSystemLog(event, details, workerName);
            
            expect(log.category).toBe('system');
            expect(log.level).toBe('info');
            expect(log.message).toBe(event);
            expect(log.workerName).toBe(workerName);
            
            // Verify persistence
            const retrieved = logRepository.findById(log.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.category).toBe('system');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('createSystemLog should default workerName to global', () => {
      const log = logRepository.createSystemLog('Test event', { test: true });
      expect(log.workerName).toBe('global');
    });

    it('admin and system logs should be filterable by category', () => {
      // Create some admin logs
      logRepository.createAdminLog('Admin action 1', { action: 'create' });
      logRepository.createAdminLog('Admin action 2', { action: 'update' });
      
      // Create some system logs
      logRepository.createSystemLog('System event 1', { event: 'startup' });
      logRepository.createSystemLog('System event 2', { event: 'cleanup' });
      
      // Filter by admin_action
      const adminLogs = logRepository.findAll({ category: 'admin_action' });
      expect(adminLogs.length).toBe(2);
      for (const log of adminLogs) {
        expect(log.category).toBe('admin_action');
      }
      
      // Filter by system
      const systemLogs = logRepository.findAll({ category: 'system' });
      expect(systemLogs.length).toBe(2);
      for (const log of systemLogs) {
        expect(log.category).toBe('system');
      }
    });
  });
});
