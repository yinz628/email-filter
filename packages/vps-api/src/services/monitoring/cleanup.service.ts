import type { Database } from 'better-sqlite3';
import { HitLogRepository } from '../../db/hit-log-repository.js';
import { AlertRepository } from '../../db/alert-repository.js';

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  deletedCount: number;
  cutoffDate: Date;
  executedAt: Date;
}

/**
 * Combined result of all cleanup operations
 */
export interface FullCleanupResult {
  hitLogs: CleanupResult;
  alerts: CleanupResult;
  totalDeleted: number;
  durationMs: number;
}

/**
 * Service for cleaning up old monitoring data
 * 
 * Handles retention policies:
 * - Hit logs: 48-72 hours retention
 * - Alerts: 30-90 days retention
 */
export class CleanupService {
  private hitLogRepository: HitLogRepository;
  private alertRepository: AlertRepository;

  constructor(db: Database) {
    this.hitLogRepository = new HitLogRepository(db);
    this.alertRepository = new AlertRepository(db);
  }

  /**
   * Clean up hit logs older than specified retention hours
   * 
   * @param retentionHours - Number of hours to retain (48-72 recommended)
   * @returns CleanupResult with details of the operation
   */
  cleanupHitLogs(retentionHours: number): CleanupResult {
    if (retentionHours < 0) {
      throw new Error('Retention hours must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionHours * 60 * 60 * 1000);

    const deletedCount = this.hitLogRepository.deleteOlderThan(cutoffDate);

    return {
      deletedCount,
      cutoffDate,
      executedAt: new Date(),
    };
  }

  /**
   * Clean up alerts older than specified retention days
   * 
   * @param retentionDays - Number of days to retain (30-90 recommended)
   * @returns CleanupResult with details of the operation
   */
  cleanupAlerts(retentionDays: number): CleanupResult {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedCount = this.alertRepository.deleteOlderThan(cutoffDate);

    return {
      deletedCount,
      cutoffDate,
      executedAt: new Date(),
    };
  }

  /**
   * Run full cleanup with default retention policies
   * 
   * @param hitLogRetentionHours - Hours to retain hit logs (default: 72)
   * @param alertRetentionDays - Days to retain alerts (default: 90)
   * @returns FullCleanupResult with combined results
   */
  runFullCleanup(
    hitLogRetentionHours: number = 72,
    alertRetentionDays: number = 90
  ): FullCleanupResult {
    const startTime = Date.now();

    const hitLogsResult = this.cleanupHitLogs(hitLogRetentionHours);
    const alertsResult = this.cleanupAlerts(alertRetentionDays);

    const durationMs = Date.now() - startTime;

    return {
      hitLogs: hitLogsResult,
      alerts: alertsResult,
      totalDeleted: hitLogsResult.deletedCount + alertsResult.deletedCount,
      durationMs,
    };
  }
}
