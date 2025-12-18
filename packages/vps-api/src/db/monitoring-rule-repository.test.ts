import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MonitoringRule, CreateMonitoringRuleDTO, UpdateMonitoringRuleDTO } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitraries for generating valid monitoring rule data
const merchantArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
const subjectPatternArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);
const intervalArb = fc.integer({ min: 1, max: 10080 }); // 1 minute to 1 week

// Generate valid CreateMonitoringRuleDTO
const createMonitoringRuleDTOArb: fc.Arbitrary<CreateMonitoringRuleDTO> = fc.record({
  merchant: merchantArb,
  name: nameArb,
  subjectPattern: subjectPatternArb,
  expectedIntervalMinutes: intervalArb,
  deadAfterMinutes: intervalArb,
  enabled: fc.boolean(),
});

/**
 * Test-specific MonitoringRuleRepository that works with sql.js
 */
class TestMonitoringRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): MonitoringRule {
    // Schema: id, merchant, name, subject_pattern, expected_interval_minutes, dead_after_minutes, tags, worker_scope, enabled, created_at, updated_at
    return {
      id: row[0] as string,
      merchant: row[1] as string,
      name: row[2] as string,
      subjectPattern: row[3] as string,
      expectedIntervalMinutes: row[4] as number,
      deadAfterMinutes: row[5] as number,
      workerScope: (row[7] as string) || 'global',
      enabled: row[8] === 1,
      createdAt: new Date(row[9] as string),
      updatedAt: new Date(row[10] as string),
    };
  }


  create(dto: CreateMonitoringRuleDTO): MonitoringRule {
    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    this.db.run(
      `INSERT INTO monitoring_rules (
        id, merchant, name, subject_pattern, 
        expected_interval_minutes, dead_after_minutes, 
        tags, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.merchant,
        dto.name,
        dto.subjectPattern,
        dto.expectedIntervalMinutes,
        dto.deadAfterMinutes,
        '[]',
        enabled ? 1 : 0,
        now,
        now,
      ]
    );

    // Create associated signal state record
    this.db.run(
      `INSERT INTO signal_states (rule_id, state, last_seen_at, count_1h, count_12h, count_24h, updated_at)
       VALUES (?, 'DEAD', NULL, 0, 0, 0, ?)`,
      [id, now]
    );

    return {
      id,
      merchant: dto.merchant,
      name: dto.name,
      subjectPattern: dto.subjectPattern,
      expectedIntervalMinutes: dto.expectedIntervalMinutes,
      deadAfterMinutes: dto.deadAfterMinutes,
      workerScope: 'global',
      enabled,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  getById(id: string): MonitoringRule | null {
    const result = this.db.exec('SELECT * FROM monitoring_rules WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.rowToRule(result[0].values[0]);
  }

  getAll(): MonitoringRule[] {
    const result = this.db.exec('SELECT * FROM monitoring_rules ORDER BY created_at DESC');
    if (result.length === 0) {
      return [];
    }
    return result[0].values.map((row) => this.rowToRule(row));
  }

  update(id: string, dto: UpdateMonitoringRuleDTO): MonitoringRule | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number)[] = [now];

    if (dto.merchant !== undefined) {
      updates.push('merchant = ?');
      params.push(dto.merchant);
    }
    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name);
    }
    if (dto.subjectPattern !== undefined) {
      updates.push('subject_pattern = ?');
      params.push(dto.subjectPattern);
    }
    if (dto.expectedIntervalMinutes !== undefined) {
      updates.push('expected_interval_minutes = ?');
      params.push(dto.expectedIntervalMinutes);
    }
    if (dto.deadAfterMinutes !== undefined) {
      updates.push('dead_after_minutes = ?');
      params.push(dto.deadAfterMinutes);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(dto.enabled ? 1 : 0);
    }

    params.push(id);

    this.db.run(`UPDATE monitoring_rules SET ${updates.join(', ')} WHERE id = ?`, params);

    return this.getById(id);
  }

  toggleEnabled(id: string): MonitoringRule | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const newEnabled = existing.enabled ? 0 : 1;

    this.db.run('UPDATE monitoring_rules SET enabled = ?, updated_at = ? WHERE id = ?', [
      newEnabled,
      now,
      id,
    ]);

    return this.getById(id);
  }

  delete(id: string): boolean {
    // First delete signal_states (manual cascade since sql.js may not support it)
    this.db.run('DELETE FROM signal_states WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM monitoring_rules WHERE id = ?', [id]);
    return true;
  }

  count(): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM monitoring_rules');
    if (result.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }
}


describe('MonitoringRuleRepository', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let repository: TestMonitoringRuleRepository;

  beforeEach(async () => {
    // Initialize sql.js
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load and execute main schema first
    const mainSchemaPath = join(__dirname, 'schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    // Load and execute monitoring schema
    const monitoringSchemaPath = join(__dirname, 'monitoring-schema.sql');
    const monitoringSchema = readFileSync(monitoringSchemaPath, 'utf-8');
    db.run(monitoringSchema);

    repository = new TestMonitoringRuleRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-realtime-monitoring, Property 1: 规则创建完整性**
   * **Validates: Requirements 1.1, 1.4**
   *
   * For any valid monitoring rule creation request:
   * - After creation, querying the rule should return all fields with values matching the request
   */
  describe('Property 1: 规则创建完整性', () => {
    it('should create rules with all fields matching the input DTO', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // CREATE: Create a rule
          const created = repository.create(dto);

          // Verify all fields are set correctly
          expect(created.id).toBeDefined();
          expect(created.id.length).toBeGreaterThan(0);
          expect(created.merchant).toBe(dto.merchant);
          expect(created.name).toBe(dto.name);
          expect(created.subjectPattern).toBe(dto.subjectPattern);
          expect(created.expectedIntervalMinutes).toBe(dto.expectedIntervalMinutes);
          expect(created.deadAfterMinutes).toBe(dto.deadAfterMinutes);
          expect(created.enabled).toBe(dto.enabled);
          expect(created.createdAt).toBeInstanceOf(Date);
          expect(created.updatedAt).toBeInstanceOf(Date);

          // READ: Retrieve by ID and verify data matches
          const retrieved = repository.getById(created.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved!.id).toBe(created.id);
          expect(retrieved!.merchant).toBe(dto.merchant);
          expect(retrieved!.name).toBe(dto.name);
          expect(retrieved!.subjectPattern).toBe(dto.subjectPattern);
          expect(retrieved!.expectedIntervalMinutes).toBe(dto.expectedIntervalMinutes);
          expect(retrieved!.deadAfterMinutes).toBe(dto.deadAfterMinutes);
          expect(retrieved!.enabled).toBe(dto.enabled);

          // Cleanup
          repository.delete(created.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should create signal_state record when rule is created', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // Create a rule (which also creates signal_state)
          const created = repository.create(dto);

          // Verify signal_state exists
          const stateResult = db.exec('SELECT * FROM signal_states WHERE rule_id = ?', [created.id]);
          expect(stateResult.length).toBeGreaterThan(0);
          expect(stateResult[0].values.length).toBeGreaterThan(0);

          // Verify initial state is DEAD
          const state = stateResult[0].values[0];
          expect(state[1]).toBe('DEAD'); // state column

          // Cleanup
          repository.delete(created.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should cascade delete signal_states when rule is deleted', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // Create a rule (which also creates signal_state)
          const created = repository.create(dto);

          // Verify signal_state exists
          const stateBefore = db.exec('SELECT * FROM signal_states WHERE rule_id = ?', [created.id]);
          expect(stateBefore.length).toBeGreaterThan(0);
          expect(stateBefore[0].values.length).toBeGreaterThan(0);

          // Delete the rule
          repository.delete(created.id);

          // Verify signal_state is also deleted (cascade)
          const stateAfter = db.exec('SELECT * FROM signal_states WHERE rule_id = ?', [created.id]);
          expect(stateAfter.length === 0 || stateAfter[0].values.length === 0).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});
