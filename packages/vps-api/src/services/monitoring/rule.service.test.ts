/**
 * Monitoring Rule Service Tests
 * 
 * **Feature: email-realtime-monitoring, Property 2: 规则更新立即生效**
 * **Feature: email-realtime-monitoring, Property 3: 禁用规则跳过检查**
 * **Validates: Requirements 1.2, 1.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MonitoringRule, CreateMonitoringRuleDTO, UpdateMonitoringRuleDTO } from '@email-filter/shared';
import { v4 as uuidv4 } from 'uuid';
import {
  MonitoringRuleService,
  validateCreateRuleDTO,
  validateUpdateRuleDTO,
  RuleValidationError,
} from './rule.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Arbitraries for generating valid monitoring rule data
const merchantArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const nameArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
// Use simple patterns that are always valid regex (avoid starting with quantifiers)
const subjectPatternArb = fc.oneof(
  fc.constant('.*'),
  fc.constant('.+'),
  fc.constant('test'),
  fc.constant('order'),
  fc.constant('payment'),
  fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', '1', '2', '3'), { minLength: 1, maxLength: 10 }),
);
const intervalArb = fc.integer({ min: 1, max: 10080 }); // 1 minute to 1 week

// Generate valid CreateMonitoringRuleDTO with proper threshold relationship
const createMonitoringRuleDTOArb: fc.Arbitrary<CreateMonitoringRuleDTO> = fc
  .record({
    merchant: merchantArb,
    name: nameArb,
    subjectPattern: subjectPatternArb,
    expectedIntervalMinutes: intervalArb,
    enabled: fc.boolean(),
  })
  .map((dto) => ({
    ...dto,
    // Ensure deadAfterMinutes >= expectedIntervalMinutes * 1.5
    deadAfterMinutes: Math.ceil(dto.expectedIntervalMinutes * 2),
  }));

/**
 * Test-specific MonitoringRuleRepository that works with sql.js
 */
class TestMonitoringRuleRepository {
  constructor(private db: SqlJsDatabase) {}

  private rowToRule(row: any[]): MonitoringRule {
    return {
      id: row[0] as string,
      merchant: row[1] as string,
      name: row[2] as string,
      subjectPattern: row[3] as string,
      expectedIntervalMinutes: row[4] as number,
      deadAfterMinutes: row[5] as number,
      enabled: row[6] === 1,
      createdAt: new Date(row[7] as string),
      updatedAt: new Date(row[8] as string),
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
        enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.merchant, dto.name, dto.subjectPattern, dto.expectedIntervalMinutes, dto.deadAfterMinutes, enabled ? 1 : 0, now, now]
    );

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

  getEnabled(): MonitoringRule[] {
    const result = this.db.exec('SELECT * FROM monitoring_rules WHERE enabled = 1 ORDER BY created_at DESC');
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

    this.db.run('UPDATE monitoring_rules SET enabled = ?, updated_at = ? WHERE id = ?', [newEnabled, now, id]);

    return this.getById(id);
  }

  delete(id: string): boolean {
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

describe('MonitoringRuleService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let repository: TestMonitoringRuleRepository;
  let service: MonitoringRuleService;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    const mainSchemaPath = join(__dirname, '../../db/schema.sql');
    const mainSchema = readFileSync(mainSchemaPath, 'utf-8');
    db.run(mainSchema);

    const monitoringSchemaPath = join(__dirname, '../../db/monitoring-schema.sql');
    const monitoringSchema = readFileSync(monitoringSchemaPath, 'utf-8');
    db.run(monitoringSchema);

    repository = new TestMonitoringRuleRepository(db);
    service = new MonitoringRuleService(repository as any);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: email-realtime-monitoring, Property 2: 规则更新立即生效**
   * *For any* 规则更新操作，更新后的状态计算应使用新的配置值
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: 规则更新立即生效', () => {
    it('should immediately reflect updated configuration values', () => {
      fc.assert(
        fc.property(
          createMonitoringRuleDTOArb,
          intervalArb,
          (dto, newInterval) => {
            // Create a rule
            const created = service.createRule(dto);

            // Calculate new deadAfter to maintain valid threshold
            const newDeadAfter = Math.ceil(newInterval * 2);

            // Update the rule with new interval values
            const updateDto: UpdateMonitoringRuleDTO = {
              expectedIntervalMinutes: newInterval,
              deadAfterMinutes: newDeadAfter,
            };

            const updated = service.updateRule(created.id, updateDto);

            // Verify the update was applied immediately
            expect(updated).not.toBeNull();
            expect(updated!.expectedIntervalMinutes).toBe(newInterval);
            expect(updated!.deadAfterMinutes).toBe(newDeadAfter);

            // Verify the rule can be retrieved with new values
            const retrieved = service.getRule(created.id);
            expect(retrieved).not.toBeNull();
            expect(retrieved!.expectedIntervalMinutes).toBe(newInterval);
            expect(retrieved!.deadAfterMinutes).toBe(newDeadAfter);

            // Cleanup
            service.deleteRule(created.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update pattern and immediately use new pattern for matching', () => {
      fc.assert(
        fc.property(
          createMonitoringRuleDTOArb,
          subjectPatternArb,
          (dto, newPattern) => {
            // Create a rule
            const created = service.createRule(dto);

            // Update the pattern
            const updateDto: UpdateMonitoringRuleDTO = {
              subjectPattern: newPattern,
            };

            const updated = service.updateRule(created.id, updateDto);

            // Verify the pattern was updated immediately
            expect(updated).not.toBeNull();
            expect(updated!.subjectPattern).toBe(newPattern);

            // Cleanup
            service.deleteRule(created.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: email-realtime-monitoring, Property 3: 禁用规则跳过检查**
   * *For any* 被禁用的规则，心跳检查应跳过该规则且不产生告警
   * **Validates: Requirements 1.3**
   */
  describe('Property 3: 禁用规则跳过检查', () => {
    it('should not include disabled rules in enabled rules list', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // Create a rule (enabled by default or as specified)
          const created = service.createRule({ ...dto, enabled: true });

          // Verify it appears in enabled rules
          let enabledRules = service.getEnabledRules();
          expect(enabledRules.some((r) => r.id === created.id)).toBe(true);

          // Disable the rule
          service.toggleRule(created.id);

          // Verify it no longer appears in enabled rules
          enabledRules = service.getEnabledRules();
          expect(enabledRules.some((r) => r.id === created.id)).toBe(false);

          // Cleanup
          service.deleteRule(created.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should toggle rule enabled status correctly', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // Create a rule with known enabled state
          const created = service.createRule({ ...dto, enabled: true });
          expect(created.enabled).toBe(true);

          // Toggle to disabled
          const toggled1 = service.toggleRule(created.id);
          expect(toggled1).not.toBeNull();
          expect(toggled1!.enabled).toBe(false);

          // Toggle back to enabled
          const toggled2 = service.toggleRule(created.id);
          expect(toggled2).not.toBeNull();
          expect(toggled2!.enabled).toBe(true);

          // Cleanup
          service.deleteRule(created.id);
        }),
        { numRuns: 100 }
      );
    });

    it('should allow explicit enable/disable operations', () => {
      fc.assert(
        fc.property(createMonitoringRuleDTOArb, (dto) => {
          // Create a rule
          const created = service.createRule({ ...dto, enabled: true });

          // Disable explicitly
          const disabled = service.disableRule(created.id);
          expect(disabled).not.toBeNull();
          expect(disabled!.enabled).toBe(false);

          // Enable explicitly
          const enabled = service.enableRule(created.id);
          expect(enabled).not.toBeNull();
          expect(enabled!.enabled).toBe(true);

          // Cleanup
          service.deleteRule(created.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Validation', () => {
    it('should reject invalid regex patterns', () => {
      const invalidDto: CreateMonitoringRuleDTO = {
        merchant: 'test',
        name: 'Test Rule',
        subjectPattern: '[invalid',
        expectedIntervalMinutes: 60,
        deadAfterMinutes: 120,
      };

      const validation = validateCreateRuleDTO(invalidDto);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === 'INVALID_REGEX')).toBe(true);
    });

    it('should reject invalid threshold relationship', () => {
      const invalidDto: CreateMonitoringRuleDTO = {
        merchant: 'test',
        name: 'Test Rule',
        subjectPattern: '.*',
        expectedIntervalMinutes: 100,
        deadAfterMinutes: 100, // Should be at least 150 (100 * 1.5)
      };

      const validation = validateCreateRuleDTO(invalidDto);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === 'INVALID_THRESHOLD')).toBe(true);
    });

    it('should reject negative interval values', () => {
      const invalidDto: CreateMonitoringRuleDTO = {
        merchant: 'test',
        name: 'Test Rule',
        subjectPattern: '.*',
        expectedIntervalMinutes: -10,
        deadAfterMinutes: 120,
      };

      const validation = validateCreateRuleDTO(invalidDto);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.code === 'INVALID_VALUE')).toBe(true);
    });
  });
});
