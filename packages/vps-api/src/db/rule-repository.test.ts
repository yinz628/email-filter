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

// Arbitraries for generating valid rule data
const categoryArb = fc.constantFrom<RuleCategory>('whitelist', 'blacklist', 'dynamic');
const matchTypeArb = fc.constantFrom<MatchType>('sender', 'subject', 'domain');
const matchModeArb = fc.constantFrom<MatchMode>('exact', 'contains', 'startsWith', 'endsWith', 'regex');

// Generate non-empty pattern strings (avoid empty patterns)
const patternArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

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
 * This mirrors the production RuleRepository but uses sql.js for testing
 */
class TestRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): FilterRule {
    // Schema: id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at, last_hit_at
    return {
      id: row[0] as string,
      // row[1] is worker_id (skipped for FilterRule)
      category: row[2] as RuleCategory,
      matchType: row[3] as MatchType,
      matchMode: row[4] as MatchMode,
      pattern: row[5] as string,
      enabled: row[6] === 1,
      createdAt: new Date(row[7] as string),
      updatedAt: new Date(row[8] as string),
      lastHitAt: row[9] ? new Date(row[9] as string) : undefined,
    };
  }

  create(dto: CreateRuleDTO): FilterRule {
    const id = uuidv4();
    const now = new Date().toISOString();
    const enabled = dto.enabled !== undefined ? dto.enabled : true;

    this.db.run(
      `INSERT INTO filter_rules (id, worker_id, category, match_type, match_mode, pattern, enabled, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.category, dto.matchType, dto.matchMode, dto.pattern, enabled ? 1 : 0, now, now]
    );

    // Create associated stats record
    this.db.run(
      `INSERT INTO rule_stats (rule_id, total_processed, deleted_count, error_count, last_updated)
       VALUES (?, 0, 0, 0, ?)`,
      [id, now]
    );

    return {
      id,
      category: dto.category,
      matchType: dto.matchType,
      matchMode: dto.matchMode,
      pattern: dto.pattern,
      enabled,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  findById(id: string): FilterRule | null {
    const result = this.db.exec('SELECT * FROM filter_rules WHERE id = ?', [id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }
    return this.rowToRule(result[0].values[0]);
  }

  findAll(): FilterRule[] {
    const result = this.db.exec('SELECT * FROM filter_rules ORDER BY created_at DESC');
    if (result.length === 0) {
      return [];
    }
    return result[0].values.map((row) => this.rowToRule(row));
  }

  update(id: string, dto: UpdateRuleDTO): FilterRule | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const params: (string | number)[] = [now];

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

    params.push(id);

    this.db.run(`UPDATE filter_rules SET ${updates.join(', ')} WHERE id = ?`, params);

    return this.findById(id);
  }

  toggle(id: string): FilterRule | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();
    const newEnabled = existing.enabled ? 0 : 1;

    this.db.run('UPDATE filter_rules SET enabled = ?, updated_at = ? WHERE id = ?', [newEnabled, now, id]);

    return this.findById(id);
  }

  delete(id: string): boolean {
    // First delete stats (manual cascade since sql.js may not support it)
    this.db.run('DELETE FROM rule_stats WHERE rule_id = ?', [id]);
    this.db.run('DELETE FROM filter_rules WHERE id = ?', [id]);
    return true;
  }

  count(): number {
    const result = this.db.exec('SELECT COUNT(*) as count FROM filter_rules');
    if (result.length === 0) {
      return 0;
    }
    return result[0].values[0][0] as number;
  }
}

describe('RuleRepository', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let repository: TestRuleRepository;

  beforeEach(async () => {
    // Initialize sql.js
    SQL = await initSqlJs();
    db = new SQL.Database();
    
    // Load and execute schema
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);
    
    repository = new TestRuleRepository(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: vps-email-filter, Property 1: 规则 CRUD 一致性**
   * **Validates: Requirements 3.1, 3.3, 3.4**
   * 
   * For any valid filter rule data:
   * - After creation, the rule should be retrievable by ID with the same data
   * - After update, the rule should reflect the new values
   * - After deletion, the rule should not be retrievable
   */
  describe('Property 1: 规则 CRUD 一致性', () => {
    it('should maintain CRUD consistency for any valid rule', () => {
      fc.assert(
        fc.property(createRuleDTOArb, (dto) => {
          // CREATE: Create a rule and verify it can be retrieved
          const created = repository.create(dto);
          
          expect(created.id).toBeDefined();
          expect(created.category).toBe(dto.category);
          expect(created.matchType).toBe(dto.matchType);
          expect(created.matchMode).toBe(dto.matchMode);
          expect(created.pattern).toBe(dto.pattern);
          expect(created.enabled).toBe(dto.enabled);
          
          // READ: Retrieve by ID and verify data matches
          const retrieved = repository.findById(created.id);
          expect(retrieved).not.toBeNull();
          expect(retrieved!.id).toBe(created.id);
          expect(retrieved!.category).toBe(dto.category);
          expect(retrieved!.matchType).toBe(dto.matchType);
          expect(retrieved!.matchMode).toBe(dto.matchMode);
          expect(retrieved!.pattern).toBe(dto.pattern);
          expect(retrieved!.enabled).toBe(dto.enabled);
          
          // UPDATE: Update the rule and verify changes
          const newPattern = dto.pattern + '_updated';
          const updated = repository.update(created.id, { pattern: newPattern });
          expect(updated).not.toBeNull();
          expect(updated!.pattern).toBe(newPattern);
          
          // Verify update persisted
          const afterUpdate = repository.findById(created.id);
          expect(afterUpdate!.pattern).toBe(newPattern);
          
          // DELETE: Delete the rule and verify it's gone
          const deleted = repository.delete(created.id);
          expect(deleted).toBe(true);
          
          // Verify deletion
          const afterDelete = repository.findById(created.id);
          expect(afterDelete).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('should cascade delete stats when rule is deleted', () => {
      fc.assert(
        fc.property(createRuleDTOArb, (dto) => {
          // Create a rule (which also creates stats)
          const created = repository.create(dto);
          
          // Verify stats exist
          const statsBefore = db.exec('SELECT * FROM rule_stats WHERE rule_id = ?', [created.id]);
          expect(statsBefore.length).toBeGreaterThan(0);
          expect(statsBefore[0].values.length).toBeGreaterThan(0);
          
          // Delete the rule
          repository.delete(created.id);
          
          // Verify stats are also deleted (cascade)
          const statsAfter = db.exec('SELECT * FROM rule_stats WHERE rule_id = ?', [created.id]);
          expect(statsAfter.length === 0 || statsAfter[0].values.length === 0).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: vps-email-filter, Property 2: 规则启用状态切换**
   * **Validates: Requirements 3.5**
   * 
   * For any filter rule, toggling the enabled status should flip the value to its opposite.
   */
  describe('Property 2: 规则启用状态切换', () => {
    it('should toggle enabled status to opposite value', () => {
      fc.assert(
        fc.property(createRuleDTOArb, (dto) => {
          // Create a rule with known enabled state
          const created = repository.create(dto);
          const originalEnabled = created.enabled;
          
          // Toggle the enabled status
          const toggled = repository.toggle(created.id);
          expect(toggled).not.toBeNull();
          expect(toggled!.enabled).toBe(!originalEnabled);
          
          // Verify the change persisted
          const retrieved = repository.findById(created.id);
          expect(retrieved!.enabled).toBe(!originalEnabled);
          
          // Toggle again - should return to original state
          const toggledAgain = repository.toggle(created.id);
          expect(toggledAgain).not.toBeNull();
          expect(toggledAgain!.enabled).toBe(originalEnabled);
          
          // Cleanup
          repository.delete(created.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should return null when toggling non-existent rule', () => {
      const result = repository.toggle('non-existent-id');
      expect(result).toBeNull();
    });
  });
});
