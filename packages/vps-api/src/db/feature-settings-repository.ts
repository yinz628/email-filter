import type Database from 'better-sqlite3';

export const FEATURE_KEYS = ['campaignAnalytics', 'signalMonitoring', 'subjectTracking'] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];

export interface FeatureSettingRecord {
  key: FeatureKey;
  enabled: boolean;
  updatedAt: string;
}

interface FeatureSettingRow {
  key: string;
  enabled: number;
  updated_at: string;
}

export class FeatureSettingsRepository {
  constructor(private readonly db: Database.Database) {}

  getAll(): FeatureSettingRecord[] {
    const rows = this.db.prepare(`
      SELECT key, enabled, updated_at
      FROM feature_settings
      ORDER BY key ASC
    `).all() as FeatureSettingRow[];

    return rows
      .filter((row): row is FeatureSettingRow & { key: FeatureKey } =>
        FEATURE_KEYS.includes(row.key as FeatureKey)
      )
      .map((row) => ({
        key: row.key as FeatureKey,
        enabled: row.enabled === 1,
        updatedAt: row.updated_at,
      }));
  }

  getByKey(key: FeatureKey): FeatureSettingRecord | null {
    const row = this.db.prepare(`
      SELECT key, enabled, updated_at
      FROM feature_settings
      WHERE key = ?
    `).get(key) as FeatureSettingRow | undefined;

    if (!row) {
      return null;
    }

    return {
      key,
      enabled: row.enabled === 1,
      updatedAt: row.updated_at,
    };
  }

  upsert(key: FeatureKey, enabled: boolean): FeatureSettingRecord {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO feature_settings (key, enabled, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run(key, enabled ? 1 : 0, updatedAt);

    return {
      key,
      enabled,
      updatedAt,
    };
  }
}
