import { afterEach, describe, expect, it, vi } from 'vitest';

const runCheckMock = vi.fn(() => ({
  rulesChecked: 0,
  stateChanges: [],
  alertsTriggered: 0,
  durationMs: 0,
}));

vi.mock('./heartbeat.service.js', () => ({
  HeartbeatService: class {
    runCheck = runCheckMock;
  },
}));

vi.mock('./cleanup.service.js', () => ({
  CleanupService: class {
    runFullCleanup() {
      return {
        hitLogs: { deletedCount: 0 },
        alerts: { deletedCount: 0 },
        durationMs: 0,
      };
    }

    runFullCleanupWithConfig() {
      return {
        systemLogs: { deletedCount: 0 },
        hitLogs: { deletedCount: 0 },
        alerts: { deletedCount: 0 },
        heartbeatLogs: { deletedCount: 0 },
        subjectTracker: { deletedCount: 0 },
        totalDeleted: 0,
        durationMs: 0,
      };
    }
  },
}));

vi.mock('../cleanup-config.service.js', () => ({
  CleanupConfigService: class {
    getConfig() {
      return {
        cleanupHour: 3,
        hitLogsRetentionHours: 72,
        alertsRetentionDays: 90,
        autoCleanupEnabled: false,
      };
    }
  },
}));

describe('SchedulerService', () => {
  afterEach(() => {
    runCheckMock.mockClear();
    vi.restoreAllMocks();
  });

  it('runHeartbeat should no-op when signalMonitoring is system disabled', async () => {
    const { SchedulerService } = await import('./scheduler.service.js');
    const scheduler = new SchedulerService({} as never, {
      heartbeatEnabled: true,
      useCleanupConfig: false,
      featureSettingsService: {
        isEnabled: () => false,
      } as never,
    });

    scheduler.runHeartbeat();

    expect(runCheckMock).not.toHaveBeenCalled();
  });
});
