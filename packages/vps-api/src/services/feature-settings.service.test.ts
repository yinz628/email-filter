import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryState = new Map<string, { enabled: boolean; updatedAt: string }>();

vi.mock('../db/feature-settings-repository.js', () => ({
  FEATURE_KEYS: ['campaignAnalytics', 'signalMonitoring', 'subjectTracking'],
  FeatureSettingsRepository: class {
    getByKey(key: string) {
      const record = repositoryState.get(key);
      return record ? { key, ...record } : null;
    }

    upsert(key: string, enabled: boolean) {
      const record = {
        enabled,
        updatedAt: new Date().toISOString(),
      };
      repositoryState.set(key, record);
      return { key, ...record };
    }
  },
}));

describe('FeatureSettingsService', () => {
  beforeEach(() => {
    repositoryState.clear();
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../config.js');
  });

  async function loadService(envConfig: {
    campaignAnalyticsEnabled: boolean;
    signalMonitoringEnabled: boolean;
    subjectTrackingEnabled: boolean;
  }) {
    vi.doMock('../config.js', () => ({
      config: {
        features: envConfig,
      },
    }));

    const module = await import('./feature-settings.service.js');
    return module.FeatureSettingsService;
  }

  it('system disabled should stop feature while preserving env enabled', async () => {
    const FeatureSettingsService = await loadService({
      campaignAnalyticsEnabled: true,
      signalMonitoringEnabled: true,
      subjectTrackingEnabled: true,
    });

    const service = new FeatureSettingsService({} as never);
    const status = service.setEnabled('campaignAnalytics', false);

    expect(status.envEnabled).toBe(true);
    expect(status.systemEnabled).toBe(false);
    expect(status.effectiveEnabled).toBe(false);
    expect(status.reason).toBe('system_disabled');
  });

  it('env disabled should remain non-effective even if system is enabled', async () => {
    const FeatureSettingsService = await loadService({
      campaignAnalyticsEnabled: true,
      signalMonitoringEnabled: false,
      subjectTrackingEnabled: true,
    });

    const service = new FeatureSettingsService({} as never);
    service.setEnabled('signalMonitoring', true);
    const status = service.getStatus('signalMonitoring');

    expect(status.envEnabled).toBe(false);
    expect(status.systemEnabled).toBe(true);
    expect(status.effectiveEnabled).toBe(false);
    expect(status.reason).toBe('env_disabled');
  });
});
