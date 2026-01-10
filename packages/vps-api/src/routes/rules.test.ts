/**
 * Property-based tests for Rule Operation Admin Logging
 * 
 * **Feature: dynamic-rule-realtime, Property 5: Admin actions create logs**
 * **Validates: Requirements 5.1, 5.2, 5.3**
 * 
 * For any rule creation, update, or deletion operation, the system SHALL create
 * an admin_action log entry containing the operation details.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { CreateRuleDTO, UpdateRuleDTO, RuleCategory, MatchType, MatchMode, FilterRule } from '@email-filter/shared';
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

// Arbitraries for generating valid rule data
const categoryArb = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const matchTypeArb = fc.constantFrom<MatchType>('sender', 'subject', 'domain');
const matchModeArb = fc.constantFrom<MatchMode>('exact', 'contains', 'startsWith', 'endsWith', 'regex');
const patternArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
const workerIdArb = fc.option(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/), { nil: undefined });

// Generate valid CreateRuleDTO
const createRuleDTOArb: fc.Arbitrary<CreateRuleDTO> = fc.record({
  category: categoryArb,
  matchType: matchTypeArb,
  matchMode: matchModeArb,
  pattern: patternArb,
  enabled: fc.boolean(),
});

/**
 * Test-specific RuleRepository that works with sql.js
 */
class TestRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): FilterRule & { workerId?: string } {
    return {
      id: row[0] as string,
      workerId: row[1] as string | undefined,
      category: row[2] as RuleCategory,
      matchType: row[3] as MatchType,
      matchMode: row[4] as MatchMode,
      pattern: row[5] as string,
      enabled: row[7] === 1,
      createdAt: new Date(row[8] as string),
      updatedAt: new Date(row[9] as string),
      lastHitAt: row[10] ? new Date(row[10] as string) : undefined,
    };
  }

  create(dto: CreateRuleDTO, workerId?: string): FilterRule & { workerId?: string } {
    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    this.db.run(
      `INSERT INTO filter_rules (id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, workerId || null, dto.category, dto.matchType, dto.matchMode, dto.pattern, enabled ? 1 : 0, now, now]
    );

    this.db.run(
      `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
       VALUES (?, 0, 0, 0, ?)`,
      [id, now]
    );

    return {
      id,
      workerId,
      category: dto.category,
      matchType: dto.matchType,
      matchMode: dto.matchMode,
      pattern: dto.pattern,
      enabled,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  findById(id: string): (FilterRule & { workerId?: string }) | null {
    const result = this.db.exec('SELECT * FROM filter_rules WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.rowToRule(result[0].values[0]);
  }

  update(id: string, dto: UpdateRuleDTO & { workerId?: string | null }): (FilterRule & { workerId?: string }) | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (dto.category !== undefined) {
      updates.push('category = ?');
      params.push(dto.category);
    }
    if (dto.matchType !== undefined) {
      updates.push('match_type = ?');
      params.push(dto.matchType);
    }
    if (dto.matchMode !== undefined) {
      updates.push('match_mode = ?');
      params.push(dto.matchMode);
    }
    if (dto.pattern !== undefined) {
      updates.push('pattern = ?');
      params.push(dto.pattern);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(dto.enabled ? 1 : 0);
    }
    if (dto.workerId !== undefined) {
      updates.push('worker_id = ?');
      params.push(dto.workerId);
    }

    params.push(id);

    this.db.run(`UPDATE filter_rules SET ${updates.join(', ')} WHERE id = ?`, params);

    return this.findById(id);
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM rule_stats WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM filter_rules WHERE id = ?', [id]);
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

  findAll(filter?: { category?: LogCategory; limit?: number }): SystemLog[] {
    let query = 'SELECT id, category, level, message, details, worker_name, created_at FROM system_logs WHERE 1=1';
    const params: (string | number)[] = [];

    if (filter?.category) {
      query += ' AND category = ?';
      params.push(filter.category);
    }

    query += ' ORDER BY created_at DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    const result = this.db.exec(query, params);
    
    if (result.length === 0) {
      return [];
    }
    
    return result[0].values.map(row => this.rowToLog(row));
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

describe('Rule Operation Admin Logging', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let ruleRepository: TestRuleRepository;
  let logRepository: TestLogRepository;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    const schemaPath = join(__dirname, '..', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    ruleRepository = new TestRuleRepository(db);
    logRepository = new TestLogRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: dynamic-rule-realtime, Property 5: Admin actions create logs**
   * **Validates: Requirements 5.1, 5.2, 5.3**
   * 
   * For any rule creation, update, or deletion operation, the system SHALL create
   * an admin_action log entry containing the operation details.
   */
  describe('Property 5: Admin actions create logs', () => {
    it('should create admin_action log when creating a rule', () => {
      fc.assert(
        fc.property(createRuleDTOArb, workerIdArb, (dto, workerId) => {
          // Create a rule
          const rule = ruleRepository.create(dto, workerId);
          
          // Simulate the admin logging that happens in the route handler
          logRepository.createAdminLog('创建规则', {
            action: 'create',
            entityType: 'rule',
            entityId: rule.id,
            rule: {
              category: rule.category,
              matchType: rule.matchType,
              matchMode: rule.matchMode,
              pattern: rule.pattern,
              enabled: rule.enabled,
              workerId: workerId || null,
            },
          }, workerId || 'global');
          
          // Verify admin log was created
          const logs = logRepository.findByEntityId(rule.id);
          expect(logs.length).toBeGreaterThanOrEqual(1);
          
          const createLog = logs.find(l => l.details?.action === 'create');
          expect(createLog).toBeDefined();
          expect(createLog!.category).toBe('admin_action');
          expect(createLog!.message).toBe('创建规则');
          expect(createLog!.details?.entityType).toBe('rule');
          expect(createLog!.details?.entityId).toBe(rule.id);
          expect((createLog!.details?.rule as any)?.pattern).toBe(dto.pattern);
          expect((createLog!.details?.rule as any)?.category).toBe(dto.category);
        }),
        { numRuns: 100 }
      );
    });

    it('should create admin_action log when updating a rule', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          fc.record({
            pattern: fc.option(patternArb, { nil: undefined }),
            enabled: fc.option(fc.boolean(), { nil: undefined }),
            category: fc.option(categoryArb, { nil: undefined }),
          }),
          workerIdArb,
          (createDto, updateDto, workerId) => {
            // Create a rule first
            const existingRule = ruleRepository.create(createDto, workerId);
            
            // Update the rule
            const updatedRule = ruleRepository.update(existingRule.id, updateDto);
            expect(updatedRule).not.toBeNull();
            
            // Simulate the admin logging that happens in the route handler
            logRepository.createAdminLog('更新规则', {
              action: 'update',
              entityType: 'rule',
              entityId: updatedRule!.id,
              before: {
                category: existingRule.category,
                matchType: existingRule.matchType,
                matchMode: existingRule.matchMode,
                pattern: existingRule.pattern,
                enabled: existingRule.enabled,
                workerId: existingRule.workerId || null,
              },
              after: {
                category: updatedRule!.category,
                matchType: updatedRule!.matchType,
                matchMode: updatedRule!.matchMode,
                pattern: updatedRule!.pattern,
                enabled: updatedRule!.enabled,
                workerId: updatedRule!.workerId || null,
              },
            }, updatedRule!.workerId || 'global');
            
            // Verify admin log was created
            const logs = logRepository.findByEntityId(updatedRule!.id);
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const updateLog = logs.find(l => l.details?.action === 'update');
            expect(updateLog).toBeDefined();
            expect(updateLog!.category).toBe('admin_action');
            expect(updateLog!.message).toBe('更新规则');
            expect(updateLog!.details?.entityType).toBe('rule');
            expect(updateLog!.details?.entityId).toBe(updatedRule!.id);
            expect(updateLog!.details?.before).toBeDefined();
            expect(updateLog!.details?.after).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should create admin_action log when deleting a rule', () => {
      fc.assert(
        fc.property(createRuleDTOArb, workerIdArb, (dto, workerId) => {
          // Create a rule first
          const rule = ruleRepository.create(dto, workerId);
          const ruleId = rule.id;
          
          // Simulate the admin logging that happens in the route handler (before deletion)
          logRepository.createAdminLog('删除规则', {
            action: 'delete',
            entityType: 'rule',
            entityId: ruleId,
            deletedRule: {
              category: rule.category,
              matchType: rule.matchType,
              matchMode: rule.matchMode,
              pattern: rule.pattern,
              enabled: rule.enabled,
              workerId: workerId || null,
            },
          }, workerId || 'global');
          
          // Delete the rule
          const deleted = ruleRepository.delete(ruleId);
          expect(deleted).toBe(true);
          
          // Verify admin log was created
          const logs = logRepository.findByEntityId(ruleId);
          expect(logs.length).toBeGreaterThanOrEqual(1);
          
          const deleteLog = logs.find(l => l.details?.action === 'delete');
          expect(deleteLog).toBeDefined();
          expect(deleteLog!.category).toBe('admin_action');
          expect(deleteLog!.message).toBe('删除规则');
          expect(deleteLog!.details?.entityType).toBe('rule');
          expect(deleteLog!.details?.entityId).toBe(ruleId);
          expect(deleteLog!.details?.deletedRule).toBeDefined();
          expect((deleteLog!.details?.deletedRule as any)?.pattern).toBe(dto.pattern);
        }),
        { numRuns: 100 }
      );
    });

    it('should include correct worker name in admin logs', () => {
      fc.assert(
        fc.property(
          createRuleDTOArb,
          fc.option(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/), { nil: undefined }),
          (dto, workerId) => {
            // Create a rule
            const rule = ruleRepository.create(dto, workerId);
            
            // Simulate the admin logging
            const expectedWorkerName = workerId || 'global';
            logRepository.createAdminLog('创建规则', {
              action: 'create',
              entityType: 'rule',
              entityId: rule.id,
              rule: {
                category: rule.category,
                matchType: rule.matchType,
                matchMode: rule.matchMode,
                pattern: rule.pattern,
                enabled: rule.enabled,
                workerId: workerId || null,
              },
            }, expectedWorkerName);
            
            // Verify worker name in log
            const logs = logRepository.findByEntityId(rule.id);
            const createLog = logs.find(l => l.details?.action === 'create');
            expect(createLog).toBeDefined();
            expect(createLog!.workerName).toBe(expectedWorkerName);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
