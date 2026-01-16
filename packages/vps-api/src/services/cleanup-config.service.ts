import type { Database } from 'better-sqlite3';

/**
 * Cleanup configuration interface
 */
export interface CleanupConfig {
  /** 系统日志保留天数 (1-365) */
  systemLogsRetentionDays: number;
  /** 监控命中日志保留小时数 (24-168) */
  hitLogsRetentionHours: number;
  /** 告警保留天数 (7-365) */
  alertsRetentionDays: number;
  /** 心跳日志保留天数 (1-90) */
  heartbeatLogsRetentionDays: number;
  /** 主题追踪保留小时数 (1-72) */
  subjectTrackerRetentionHours: number;
  /** 邮件主题统计保留天数 (1-365) */
  subjectStatsRetentionDays: number;
  /** 清理执行时间 (0-23) */
  cleanupHour: number;
  /** 是否启用自动清理 */
  autoCleanupEnabled: boolean;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Configuration validation ranges
 */
export const CONFIG_RANGES = {
  systemLogsRetentionDays: { min: 1, max: 365 },
  hitLogsRetentionHours: { min: 24, max: 168 },
  alertsRetentionDays: { min: 7, max: 365 },
  heartbeatLogsRetentionDays: { min: 1, max: 90 },
  subjectTrackerRetentionHours: { min: 1, max: 72 },
  subjectStatsRetentionDays: { min: 1, max: 365 },
  cleanupHour: { min: 0, max: 23 },
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: CleanupConfig = {
  systemLogsRetentionDays: 30,
  hitLogsRetentionHours: 72,
  alertsRetentionDays: 90,
  heartbeatLogsRetentionDays: 30,
  subjectTrackerRetentionHours: 24,
  subjectStatsRetentionDays: 30,
  cleanupHour: 3,
  autoCleanupEnabled: true,
};

/**
 * Database key to config property mapping
 */
const KEY_MAP: Record<string, keyof CleanupConfig> = {
  system_logs_retention_days: 'systemLogsRetentionDays',
  hit_logs_retention_hours: 'hitLogsRetentionHours',
  alerts_retention_days: 'alertsRetentionDays',
  heartbeat_logs_retention_days: 'heartbeatLogsRetentionDays',
  subject_tracker_retention_hours: 'subjectTrackerRetentionHours',
  subject_stats_retention_days: 'subjectStatsRetentionDays',
  cleanup_hour: 'cleanupHour',
  auto_cleanup_enabled: 'autoCleanupEnabled',
};

/**
 * Config property to database key mapping
 */
const REVERSE_KEY_MAP: Record<keyof CleanupConfig, string> = {
  systemLogsRetentionDays: 'system_logs_retention_days',
  hitLogsRetentionHours: 'hit_logs_retention_hours',
  alertsRetentionDays: 'alerts_retention_days',
  heartbeatLogsRetentionDays: 'heartbeat_logs_retention_days',
  subjectTrackerRetentionHours: 'subject_tracker_retention_hours',
  subjectStatsRetentionDays: 'subject_stats_retention_days',
  cleanupHour: 'cleanup_hour',
  autoCleanupEnabled: 'auto_cleanup_enabled',
};

/**
 * Service for managing cleanup configuration
 */
export class CleanupConfigService {
  constructor(private db: Database) {}

  /**
   * Validate a configuration value against its range
   */
  static validateConfig(config: Partial<CleanupConfig>): ValidationResult {
    const errors: string[] = [];

    for (const [key, value] of Object.entries(config)) {
      if (value === undefined) continue;

      if (key === 'autoCleanupEnabled') {
        if (typeof value !== 'boolean') {
          errors.push(`${key} must be a boolean`);
        }
        continue;
      }

      const range = CONFIG_RANGES[key as keyof typeof CONFIG_RANGES];
      if (!range) continue;

      if (typeof value !== 'number' || !Number.isInteger(value)) {
        errors.push(`${key} must be an integer`);
        continue;
      }

      if (value < range.min || value > range.max) {
        errors.push(`${key} must be between ${range.min} and ${range.max}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get the current cleanup configuration with defaults
   */
  getConfig(): CleanupConfig {
    const stmt = this.db.prepare('SELECT key, value FROM cleanup_config');
    const rows = stmt.all() as { key: string; value: string }[];

    const config: CleanupConfig = { ...DEFAULT_CONFIG };

    for (const row of rows) {
      const propName = KEY_MAP[row.key];
      if (!propName) continue;

      if (propName === 'autoCleanupEnabled') {
        config[propName] = row.value === 'true';
      } else {
        const numValue = parseInt(row.value, 10);
        if (!isNaN(numValue)) {
          (config as unknown as Record<string, number | boolean>)[propName] = numValue;
        }
      }
    }

    return config;
  }

  /**
   * Update cleanup configuration
   */
  updateConfig(updates: Partial<CleanupConfig>): CleanupConfig {
    const validation = CleanupConfigService.validateConfig(updates);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    const now = new Date().toISOString();
    const upsertStmt = this.db.prepare(`
      INSERT INTO cleanup_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const updateMany = this.db.transaction((entries: Array<{ key: string; value: string }>) => {
      for (const entry of entries) {
        upsertStmt.run(entry.key, entry.value, now);
      }
    });

    const entries: Array<{ key: string; value: string }> = [];
    for (const [propName, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      const dbKey = REVERSE_KEY_MAP[propName as keyof CleanupConfig];
      if (dbKey) {
        entries.push({ key: dbKey, value: String(value) });
      }
    }

    if (entries.length > 0) {
      updateMany(entries);
    }

    return this.getConfig();
  }
}
