import type Database from 'better-sqlite3';
import { config } from '../config.js';
import {
  FEATURE_KEYS,
  FeatureSettingsRepository,
  type FeatureKey,
  type FeatureSettingRecord,
} from '../db/feature-settings-repository.js';

export type FeatureStatusReason = 'enabled' | 'system_disabled' | 'env_disabled';

export interface FeatureStatus {
  key: FeatureKey;
  envEnabled: boolean;
  systemEnabled: boolean;
  effectiveEnabled: boolean;
  reason: FeatureStatusReason;
  updatedAt?: string;
}

export class FeatureSettingsService {
  private readonly repository: FeatureSettingsRepository;

  constructor(db: Database.Database) {
    this.repository = new FeatureSettingsRepository(db);
  }

  getAllStatuses(): FeatureStatus[] {
    return FEATURE_KEYS.map((key) => this.getStatus(key));
  }

  getStatus(key: FeatureKey): FeatureStatus {
    const stored = this.repository.getByKey(key);
    return this.buildStatus(key, stored);
  }

  isEnabled(key: FeatureKey): boolean {
    return this.getStatus(key).effectiveEnabled;
  }

  setEnabled(key: FeatureKey, enabled: boolean): FeatureStatus {
    const record = this.repository.upsert(key, enabled);
    return this.buildStatus(key, record);
  }

  private buildStatus(key: FeatureKey, stored: FeatureSettingRecord | null): FeatureStatus {
    const envEnabled = this.getEnvEnabled(key);
    const systemEnabled = stored?.enabled ?? true;
    const effectiveEnabled = envEnabled && systemEnabled;
    const reason: FeatureStatusReason = !envEnabled
      ? 'env_disabled'
      : !systemEnabled
        ? 'system_disabled'
        : 'enabled';

    return {
      key,
      envEnabled,
      systemEnabled,
      effectiveEnabled,
      reason,
      updatedAt: stored?.updatedAt,
    };
  }

  private getEnvEnabled(key: FeatureKey): boolean {
    switch (key) {
      case 'campaignAnalytics':
        return config.features.campaignAnalyticsEnabled;
      case 'signalMonitoring':
        return config.features.signalMonitoringEnabled;
      case 'subjectTracking':
        return config.features.subjectTrackingEnabled;
    }
  }
}
