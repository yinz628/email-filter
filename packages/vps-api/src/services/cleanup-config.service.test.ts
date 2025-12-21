/**
 * CleanupConfigService Tests
 *
 * **Feature: data-cleanup-settings, Property 1: Configuration Validation**
 * **Validates: Requirements 1.3, 2.1, 3.1, 3.2, 3.3, 4.1**
 *
 * **Feature: data-cleanup-settings, Property 2: Configuration Round-Trip**
 * **Validates: Requirements 1.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  CleanupConfigService,
  CleanupConfig,
  CONFIG_RANGES,
  DEFAULT_CONFIG,
} from './cleanup-config.service.js';

/**
 * Test-specific CleanupConfigService that works with sql.js
 */
class TestCleanupConfigService {
  constructor(private db: SqlJsDatabase) {}

  static validateConfig(config: Partial<CleanupConfig>): { valid: boolean; errors: string[] } {
    return CleanupConfigService.validateConfig(config);
  }

  getConfig(): CleanupConfig {
    const result = this.db.exec('SELECT key, value FROM cleanup_config');
    const config: CleanupConfig = { ...DEFAULT_CONFIG };

    if (result.length === 0) return config;

    const keyMap: Record<string, keyof CleanupConfig> = {
      system_logs_retention_days: 'systemLogsRetentionDays',
      hit_logs_retention_hours: 'hitLogsRetentionHours',
      alerts_retention_days: 'alertsRetentionDays',
      heartbeat_logs_retention_days: 'heartbeatLogsRetentionDays',
      subject_tracker_retention_hours: 'subjectTrackerRetentionHours',
      cleanup_hour: 'cleanupHour',
      auto_cleanup_enabled: 'autoCleanupEnabled',
    };

    for (const row of result[0].values) {
      const key = row[0] as string;
      const value = row[1] as string;
      const propName = keyMap[key];
      if (!propName) continue;

      if (propName === 'autoCleanupEnabled') {
        config[propName] = value === 'true';
      } else {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          (config as Record<string, number | boolean>)[propName] = numValue;
        }
      }
    }

    return config;
  }

  updateConfig(updates: Partial<CleanupConfig>): CleanupConfig {
    const validation = TestCleanupConfigService.validateConfig(updates);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    const now = new Date().toISOString();
    const reverseKeyMap: Record<keyof CleanupConfig, string> = {
      systemLogsRetentionDays: 'system_logs_retention_days',
      hitLogsRetentionHours: 'hit_logs_retention_hours',
      alertsRetentionDays: 'alerts_retention_days',
      heartbeatLogsRetentionDays: 'heartbeat_logs_retention_days',
      subjectTrackerRetentionHours: 'subject_tracker_retention_hours',
      cleanupHour: 'cleanup_hour',
      autoCleanupEnabled: 'auto_cleanup_enabled',
    };

    for (const [propName, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      const dbKey = reverseKeyMap[propName as keyof CleanupConfig];
      if (dbKey) {
        this.db.run(
          `INSERT INTO cleanup_config (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          [dbKey, String(value), now]
        );
      }
    }

    return this.getConfig();
  }
}

describe('CleanupConfigService', () => {
  let SQL: any;
  let db: SqlJsDatabase;
  let service: TestCleanupConfigService;

  beforeEach(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();

    // Load schema
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    service = new TestCleanupConfigService(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  /**
   * **Feature: data-cleanup-settings, Property 1: Configuration Validation**
   * *For any* cleanup configuration input, the validation function should accept values
   * within the defined ranges and reject values outside those ranges.
   * **Validates: Requirements 1.3, 2.1, 3.1, 3.2, 3.3, 4.1**
   */
  describe('Property 1: Configuration Validation', () => {
    it('should accept all values within valid ranges', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: CONFIG_RANGES.systemLogsRetentionDays.min, max: CONFIG_RANGES.systemLogsRetentionDays.max }),
          fc.integer({ min: CONFIG_RANGES.hitLogsRetentionHours.min, max: CONFIG_RANGES.hitLogsRetentionHours.max }),
          fc.integer({ min: CONFIG_RANGES.alertsRetentionDays.min, max: CONFIG_RANGES.alertsRetentionDays.max }),
          fc.integer({ min: CONFIG_RANGES.heartbeatLogsRetentionDays.min, max: CONFIG_RANGES.heartbeatLogsRetentionDays.max }),
          fc.integer({ min: CONFIG_RANGES.subjectTrackerRetentionHours.min, max: CONFIG_RANGES.subjectTrackerRetentionHours.max }),
          fc.integer({ min: CONFIG_RANGES.cleanupHour.min, max: CONFIG_RANGES.cleanupHour.max }),
          fc.boolean(),
          (sysLogs, hitLogs, alerts, heartbeat, subject, hour, autoEnabled) => {
            const config: CleanupConfig = {
              systemLogsRetentionDays: sysLogs,
              hitLogsRetentionHours: hitLogs,
              alertsRetentionDays: alerts,
              heartbeatLogsRetentionDays: heartbeat,
              subjectTrackerRetentionHours: subject,
              cleanupHour: hour,
              autoCleanupEnabled: autoEnabled,
            };

            const result = TestCleanupConfigService.validateConfig(config);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject systemLogsRetentionDays outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ max: CONFIG_RANGES.systemLogsRetentionDays.min - 1 }),
            fc.integer({ min: CONFIG_RANGES.systemLogsRetentionDays.max + 1 })
          ),
          (invalidValue) => {
            const result = TestCleanupConfigService.validateConfig({
              systemLogsRetentionDays: invalidValue,
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('systemLogsRetentionDays'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject hitLogsRetentionHours outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ max: CONFIG_RANGES.hitLogsRetentionHours.min - 1 }),
            fc.integer({ min: CONFIG_RANGES.hitLogsRetentionHours.max + 1 })
          ),
          (invalidValue) => {
            const result = TestCleanupConfigService.validateConfig({
              hitLogsRetentionHours: invalidValue,
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('hitLogsRetentionHours'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject alertsRetentionDays outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ max: CONFIG_RANGES.alertsRetentionDays.min - 1 }),
            fc.integer({ min: CONFIG_RANGES.alertsRetentionDays.max + 1 })
          ),
          (invalidValue) => {
            const result = TestCleanupConfigService.validateConfig({
              alertsRetentionDays: invalidValue,
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('alertsRetentionDays'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject heartbeatLogsRetentionDays outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ max: CONFIG_RANGES.heartbeatLogsRetentionDays.min - 1 }),
            fc.integer({ min: CONFIG_RANGES.heartbeatLogsRetentionDays.max + 1 })
          ),
          (invalidValue) => {
            const result = TestCleanupConfigService.validateConfig({
              heartbeatLogsRetentionDays: invalidValue,
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('heartbeatLogsRetentionDays'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject subjectTrackerRetentionHours outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ max: CONFIG_RANGES.subjectTrackerRetentionHours.min - 1 }),
            fc.integer({ min: CONFIG_RANGES.subjectTrackerRetentionHours.max + 1 })
          ),
          (invalidValue) => {
            const result = TestCleanupConfigService.validateConfig({
              subjectTrackerRetentionHours: invalidValue,
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('subjectTrackerRetentionHours'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject cleanupHour outside valid range', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ max: CONFIG_RANGES.cleanupHour.min - 1 }),
            fc.integer({ min: CONFIG_RANGES.cleanupHour.max + 1 })
          ),
          (invalidValue) => {
            const result = TestCleanupConfigService.validateConfig({
              cleanupHour: invalidValue,
            });
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('cleanupHour'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: data-cleanup-settings, Property 2: Configuration Round-Trip**
   * *For any* valid cleanup configuration, saving to the database and then loading
   * should return an equivalent configuration object.
   * **Validates: Requirements 1.4**
   */
  describe('Property 2: Configuration Round-Trip', () => {
    it('should preserve configuration after save and load', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: CONFIG_RANGES.systemLogsRetentionDays.min, max: CONFIG_RANGES.systemLogsRetentionDays.max }),
          fc.integer({ min: CONFIG_RANGES.hitLogsRetentionHours.min, max: CONFIG_RANGES.hitLogsRetentionHours.max }),
          fc.integer({ min: CONFIG_RANGES.alertsRetentionDays.min, max: CONFIG_RANGES.alertsRetentionDays.max }),
          fc.integer({ min: CONFIG_RANGES.heartbeatLogsRetentionDays.min, max: CONFIG_RANGES.heartbeatLogsRetentionDays.max }),
          fc.integer({ min: CONFIG_RANGES.subjectTrackerRetentionHours.min, max: CONFIG_RANGES.subjectTrackerRetentionHours.max }),
          fc.integer({ min: CONFIG_RANGES.cleanupHour.min, max: CONFIG_RANGES.cleanupHour.max }),
          fc.boolean(),
          (sysLogs, hitLogs, alerts, heartbeat, subject, hour, autoEnabled) => {
            const config: CleanupConfig = {
              systemLogsRetentionDays: sysLogs,
              hitLogsRetentionHours: hitLogs,
              alertsRetentionDays: alerts,
              heartbeatLogsRetentionDays: heartbeat,
              subjectTrackerRetentionHours: subject,
              cleanupHour: hour,
              autoCleanupEnabled: autoEnabled,
            };

            // Save configuration
            service.updateConfig(config);

            // Load configuration
            const loaded = service.getConfig();

            // Verify round-trip
            expect(loaded.systemLogsRetentionDays).toBe(config.systemLogsRetentionDays);
            expect(loaded.hitLogsRetentionHours).toBe(config.hitLogsRetentionHours);
            expect(loaded.alertsRetentionDays).toBe(config.alertsRetentionDays);
            expect(loaded.heartbeatLogsRetentionDays).toBe(config.heartbeatLogsRetentionDays);
            expect(loaded.subjectTrackerRetentionHours).toBe(config.subjectTrackerRetentionHours);
            expect(loaded.cleanupHour).toBe(config.cleanupHour);
            expect(loaded.autoCleanupEnabled).toBe(config.autoCleanupEnabled);

            // Clean up for next iteration
            db.run('DELETE FROM cleanup_config');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve partial configuration updates', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: CONFIG_RANGES.systemLogsRetentionDays.min, max: CONFIG_RANGES.systemLogsRetentionDays.max }),
          fc.integer({ min: CONFIG_RANGES.cleanupHour.min, max: CONFIG_RANGES.cleanupHour.max }),
          (sysLogs, hour) => {
            // Update only some fields
            service.updateConfig({
              systemLogsRetentionDays: sysLogs,
              cleanupHour: hour,
            });

            const loaded = service.getConfig();

            // Updated fields should match
            expect(loaded.systemLogsRetentionDays).toBe(sysLogs);
            expect(loaded.cleanupHour).toBe(hour);

            // Non-updated fields should have defaults
            expect(loaded.hitLogsRetentionHours).toBe(DEFAULT_CONFIG.hitLogsRetentionHours);
            expect(loaded.alertsRetentionDays).toBe(DEFAULT_CONFIG.alertsRetentionDays);

            // Clean up for next iteration
            db.run('DELETE FROM cleanup_config');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should return default config when no config exists', () => {
      const config = service.getConfig();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should throw error when updating with invalid config', () => {
      expect(() => {
        service.updateConfig({ systemLogsRetentionDays: 0 });
      }).toThrow('Invalid configuration');
    });
  });
});
