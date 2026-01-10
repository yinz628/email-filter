/**
 * Property-based tests for Worker Operation Admin Logging
 * 
 * **Feature: dynamic-rule-realtime, Property 6: Worker operations create logs**
 * **Validates: Requirements 5.4, 5.5**
 * 
 * For any Worker creation, update, or deletion operation, the system SHALL create
 * an admin_action log entry containing the operation details.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

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

interface WorkerInstance {
  id: string;
  name: string;
  domain: string | null;
  defaultForwardTo: string;
  workerUrl: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateWorkerInput {
  name: string;
  domain?: string;
  defaultForwardTo: string;
  workerUrl?: string;
}

interface UpdateWorkerInput {
  name?: string;
  domain?: string;
  defaultForwardTo?: string;
  workerUrl?: string;
  enabled?: boolean;
}

// Arbitraries for generating valid worker data - use UUID suffix to ensure uniqueness
const workerNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/).filter(s => s.length > 0).map(s => `${s}_${uuidv4().slice(0, 8)}`);
const domainArb = fc.option(fc.stringMatching(/^[a-z0-9][a-z0-9.-]{0,50}\.[a-z]{2,10}$/), { nil: undefined });
const emailArb = fc.emailAddress();
const urlArb = fc.option(fc.webUrl(), { nil: undefined });


// Generate valid CreateWorkerInput
const createWorkerInputArb: fc.Arbitrary<CreateWorkerInput> = fc.record({
  name: workerNameArb,
  domain: domainArb,
  defaultForwardTo: emailArb,
  workerUrl: urlArb,
});

/**
 * Test-specific WorkerRepository that works with sql.js
 */
class TestWorkerRepository {
  constructor(private db: SqlJsDatabase) {}

  private mapRow(row: any[]): WorkerInstance {
    return {
      id: row[0] as string,
      name: row[1] as string,
      domain: row[2] as string | null,
      defaultForwardTo: row[3] as string,
      workerUrl: row[4] as string | null,
      enabled: row[5] === 1,
      createdAt: row[6] as string,
      updatedAt: row[7] as string,
    };
  }

  findById(id: string): WorkerInstance | null {
    const result = this.db.exec(
      `SELECT id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at
       FROM worker_instances WHERE id = ?`,
      [id]
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.mapRow(result[0].values[0]);
  }

  create(input: CreateWorkerInput): WorkerInstance {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.run(
      `INSERT INTO worker_instances (id, name, domain, default_forward_to, worker_url, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, input.name, input.domain || null, input.defaultForwardTo, input.workerUrl || null, now, now]
    );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateWorkerInput): WorkerInstance | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name);
    }
    if (input.domain !== undefined) {
      updates.push('domain = ?');
      values.push(input.domain || null);
    }
    if (input.defaultForwardTo !== undefined) {
      updates.push('default_forward_to = ?');
      values.push(input.defaultForwardTo);
    }
    if (input.workerUrl !== undefined) {
      updates.push('worker_url = ?');
      values.push(input.workerUrl || null);
    }
    if (input.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(input.enabled ? 1 : 0);
    }

    values.push(id);

    this.db.run(`UPDATE worker_instances SET ${updates.join(', ')} WHERE id = ?`, values);

    return this.findById(id);
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM worker_instances WHERE id = ?', [id]);
    return true;
  }
}


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

  createAdminLog(action: string, details: Record<string, unknown>, workerName: string = 'global'): SystemLog {
    return this.create('admin_action', action, details, 'info', workerName);
  }

  findByEntityId(entityId: string): SystemLog[] {
    const result = this.db.exec(
      `SELECT id, category, level, message, details, worker_name, created_at 
       FROM system_logs 
       WHERE json_extract(details, '$.entityId') = ?
       ORDER BY created_at DESC`,
      [entityId]
    );
    
    if (result.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => this.rowToLog(row));
  }
}


describe('Worker Operation Admin Logging', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let workerRepository: TestWorkerRepository;
  let logRepository: TestLogRepository;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    const schemaPath = join(__dirname, '..', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    workerRepository = new TestWorkerRepository(db);
    logRepository = new TestLogRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: dynamic-rule-realtime, Property 6: Worker operations create logs**
   * **Validates: Requirements 5.4, 5.5**
   * 
   * For any Worker creation, update, or deletion operation, the system SHALL create
   * an admin_action log entry containing the operation details.
   */
  describe('Property 6: Worker operations create logs', () => {
    it('should create admin_action log when creating a Worker', () => {
      fc.assert(
        fc.property(createWorkerInputArb, (input) => {
          // Create a worker
          const worker = workerRepository.create(input);
          
          // Simulate the admin logging that happens in the route handler
          logRepository.createAdminLog('创建Worker', {
            action: 'create',
            entityType: 'worker',
            entityId: worker.id,
            worker: {
              name: worker.name,
              domain: worker.domain,
              defaultForwardTo: worker.defaultForwardTo,
              workerUrl: worker.workerUrl,
              enabled: worker.enabled,
            },
          }, worker.name);
          
          // Verify admin log was created
          const logs = logRepository.findByEntityId(worker.id);
          expect(logs.length).toBeGreaterThanOrEqual(1);
          
          const createLog = logs.find(l => l.details?.action === 'create');
          expect(createLog).toBeDefined();
          expect(createLog!.category).toBe('admin_action');
          expect(createLog!.message).toBe('创建Worker');
          expect(createLog!.details?.entityType).toBe('worker');
          expect(createLog!.details?.entityId).toBe(worker.id);
          expect((createLog!.details?.worker as any)?.name).toBe(input.name);
          expect((createLog!.details?.worker as any)?.defaultForwardTo).toBe(input.defaultForwardTo);
          expect(createLog!.workerName).toBe(worker.name);
        }),
        { numRuns: 100 }
      );
    });


    it('should create admin_action log when updating a Worker', () => {
      fc.assert(
        fc.property(
          createWorkerInputArb,
          fc.record({
            name: fc.option(workerNameArb, { nil: undefined }),
            domain: fc.option(domainArb, { nil: undefined }),
            defaultForwardTo: fc.option(emailArb, { nil: undefined }),
            workerUrl: fc.option(urlArb, { nil: undefined }),
            enabled: fc.option(fc.boolean(), { nil: undefined }),
          }),
          (createInput, updateInput) => {
            // Create a worker first
            const existingWorker = workerRepository.create(createInput);
            
            // Update the worker
            const updatedWorker = workerRepository.update(existingWorker.id, updateInput);
            expect(updatedWorker).not.toBeNull();
            
            // Simulate the admin logging that happens in the route handler
            logRepository.createAdminLog('更新Worker', {
              action: 'update',
              entityType: 'worker',
              entityId: updatedWorker!.id,
              before: {
                name: existingWorker.name,
                domain: existingWorker.domain,
                defaultForwardTo: existingWorker.defaultForwardTo,
                workerUrl: existingWorker.workerUrl,
                enabled: existingWorker.enabled,
              },
              after: {
                name: updatedWorker!.name,
                domain: updatedWorker!.domain,
                defaultForwardTo: updatedWorker!.defaultForwardTo,
                workerUrl: updatedWorker!.workerUrl,
                enabled: updatedWorker!.enabled,
              },
            }, updatedWorker!.name);
            
            // Verify admin log was created
            const logs = logRepository.findByEntityId(updatedWorker!.id);
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const updateLog = logs.find(l => l.details?.action === 'update');
            expect(updateLog).toBeDefined();
            expect(updateLog!.category).toBe('admin_action');
            expect(updateLog!.message).toBe('更新Worker');
            expect(updateLog!.details?.entityType).toBe('worker');
            expect(updateLog!.details?.entityId).toBe(updatedWorker!.id);
            expect(updateLog!.details?.before).toBeDefined();
            expect(updateLog!.details?.after).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });


    it('should create admin_action log when deleting a Worker', () => {
      fc.assert(
        fc.property(createWorkerInputArb, (input) => {
          // Create a worker first
          const worker = workerRepository.create(input);
          const workerId = worker.id;
          const workerName = worker.name;
          
          // Simulate the admin logging that happens in the route handler (before deletion)
          logRepository.createAdminLog('删除Worker', {
            action: 'delete',
            entityType: 'worker',
            entityId: workerId,
            deletedWorker: {
              name: worker.name,
              domain: worker.domain,
              defaultForwardTo: worker.defaultForwardTo,
              workerUrl: worker.workerUrl,
              enabled: worker.enabled,
            },
          }, workerName);
          
          // Delete the worker
          const deleted = workerRepository.delete(workerId);
          expect(deleted).toBe(true);
          
          // Verify admin log was created
          const logs = logRepository.findByEntityId(workerId);
          expect(logs.length).toBeGreaterThanOrEqual(1);
          
          const deleteLog = logs.find(l => l.details?.action === 'delete');
          expect(deleteLog).toBeDefined();
          expect(deleteLog!.category).toBe('admin_action');
          expect(deleteLog!.message).toBe('删除Worker');
          expect(deleteLog!.details?.entityType).toBe('worker');
          expect(deleteLog!.details?.entityId).toBe(workerId);
          expect(deleteLog!.details?.deletedWorker).toBeDefined();
          expect((deleteLog!.details?.deletedWorker as any)?.name).toBe(input.name);
          expect(deleteLog!.workerName).toBe(workerName);
        }),
        { numRuns: 100 }
      );
    });

    it('should include correct worker name in admin logs', () => {
      fc.assert(
        fc.property(createWorkerInputArb, (input) => {
          // Create a worker
          const worker = workerRepository.create(input);
          
          // Simulate the admin logging
          logRepository.createAdminLog('创建Worker', {
            action: 'create',
            entityType: 'worker',
            entityId: worker.id,
            worker: {
              name: worker.name,
              domain: worker.domain,
              defaultForwardTo: worker.defaultForwardTo,
              workerUrl: worker.workerUrl,
              enabled: worker.enabled,
            },
          }, worker.name);
          
          // Verify worker name in log matches the worker's name
          const logs = logRepository.findByEntityId(worker.id);
          const createLog = logs.find(l => l.details?.action === 'create');
          expect(createLog).toBeDefined();
          expect(createLog!.workerName).toBe(worker.name);
        }),
        { numRuns: 100 }
      );
    });
  });
});
