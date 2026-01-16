import type { Database } from 'better-sqlite3';
import { HitLogRepository } from '../../db/hit-log-repository.js';
import { AlertRepository } from '../../db/alert-repository.js';
import { LogRepository } from '../../db/log-repository.js';
import type { CleanupConfig } from '../cleanup-config.service.js';

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
  systemLogs: CleanupResult;
  heartbeatLogs: CleanupResult;
  subjectTracker: CleanupResult;
  subjectStats: CleanupResult;
  totalDeleted: number;
  durationMs: number;
  executedAt: Date;
}

/**
 * Service for cleaning up old monitoring data
 * 
 * Handles retention policies:
 * - Hit logs: 48-72 hours retention
 * - Alerts: 30-90 days retention
 * - System logs: 1-365 days retention
 * - Heartbeat logs: 1-90 days retention
 * - Subject tracker: 1-72 hours retention
 * - Subject stats: 1-365 days retention
 */
export class CleanupService {
  private hitLogRepository: HitLogRepository;
  private alertRepository: AlertRepository;
  private logRepository: LogRepository;
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.hitLogRepository = new HitLogRepository(db);
    this.alertRepository = new AlertRepository(db);
    this.logRepository = new LogRepository(db);
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
   * Clean up system logs older than specified retention days
   * 
   * @param retentionDays - Number of days to retain (1-365)
   * @returns CleanupResult with details of the operation
   */
  cleanupSystemLogs(retentionDays: number): CleanupResult {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const deletedCount = this.logRepository.deleteOlderThan(cutoffDate);

    return {
      deletedCount,
      cutoffDate,
      executedAt: new Date(),
    };
  }

  /**
   * Clean up heartbeat logs older than specified retention days
   * 
   * @param retentionDays - Number of days to retain (1-90)
   * @returns CleanupResult with details of the operation
   */
  cleanupHeartbeatLogs(retentionDays: number): CleanupResult {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare('DELETE FROM heartbeat_logs WHERE checked_at < ?');
    const result = stmt.run(cutoffDate.toISOString());

    return {
      deletedCount: result.changes,
      cutoffDate,
      executedAt: new Date(),
    };
  }

  /**
   * Clean up email subject tracker records older than specified retention hours
   * 
   * @param retentionHours - Number of hours to retain (1-72)
   * @returns CleanupResult with details of the operation
   */
  cleanupSubjectTracker(retentionHours: number): CleanupResult {
    if (retentionHours < 0) {
      throw new Error('Retention hours must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionHours * 60 * 60 * 1000);

    const stmt = this.db.prepare('DELETE FROM email_subject_tracker WHERE received_at < ?');
    const result = stmt.run(cutoffDate.toISOString());

    return {
      deletedCount: result.changes,
      cutoffDate,
      executedAt: new Date(),
    };
  }

  /**
   * Clean up subject stats records older than specified retention days
   * 
   * @param retentionDays - Number of days to retain (1-365)
   * @returns CleanupResult with details of the operation
   */
  cleanupSubjectStats(retentionDays: number): CleanupResult {
    if (retentionDays < 0) {
      throw new Error('Retention days must be non-negative');
    }

    const cutoffDate = new Date();
    cutoffDate.setTime(cutoffDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare('DELETE FROM subject_stats WHERE last_seen_at < ?');
    const result = stmt.run(cutoffDate.toISOString());

    return {
      deletedCount: result.changes,
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
    const executedAt = new Date();

    const hitLogsResult = this.cleanupHitLogs(hitLogRetentionHours);
    const alertsResult = this.cleanupAlerts(alertRetentionDays);
    // Use default values for new tables
    const systemLogsResult = this.cleanupSystemLogs(30);
    const heartbeatLogsResult = this.cleanupHeartbeatLogs(30);
    const subjectTrackerResult = this.cleanupSubjectTracker(24);
    const subjectStatsResult = this.cleanupSubjectStats(30);

    const durationMs = Date.now() - startTime;

    const result: FullCleanupResult = {
      hitLogs: hitLogsResult,
      alerts: alertsResult,
      systemLogs: systemLogsResult,
      heartbeatLogs: heartbeatLogsResult,
      subjectTracker: subjectTrackerResult,
      subjectStats: subjectStatsResult,
      totalDeleted: hitLogsResult.deletedCount + alertsResult.deletedCount + 
                    systemLogsResult.deletedCount + heartbeatLogsResult.deletedCount + 
                    subjectTrackerResult.deletedCount + subjectStatsResult.deletedCount,
      durationMs,
      executedAt,
    };

    // Log system event when data cleanup runs (Requirement 6.3)
    this.logRepository.createSystemLog('数据清理完成', {
      hitLogsDeleted: hitLogsResult.deletedCount,
      alertsDeleted: alertsResult.deletedCount,
      systemLogsDeleted: systemLogsResult.deletedCount,
      heartbeatLogsDeleted: heartbeatLogsResult.deletedCount,
      subjectTrackerDeleted: subjectTrackerResult.deletedCount,
      subjectStatsDeleted: subjectStatsResult.deletedCount,
      totalDeleted: result.totalDeleted,
      durationMs: result.durationMs,
      retentionConfig: {
        hitLogRetentionHours,
        alertRetentionDays,
        systemLogsRetentionDays: 30,
        heartbeatLogsRetentionDays: 30,
        subjectTrackerRetentionHours: 24,
        subjectStatsRetentionDays: 30,
      },
    });

    return result;
  }

  /**
   * Run full cleanup using configuration
   * 
   * @param config - CleanupConfig with retention settings
   * @returns FullCleanupResult with combined results
   */
  runFullCleanupWithConfig(config: CleanupConfig): FullCleanupResult {
    const startTime = Date.now();
    const executedAt = new Date();

    const hitLogsResult = this.cleanupHitLogs(config.hitLogsRetentionHours);
    const alertsResult = this.cleanupAlerts(config.alertsRetentionDays);
    const systemLogsResult = this.cleanupSystemLogs(config.systemLogsRetentionDays);
    const heartbeatLogsResult = this.cleanupHeartbeatLogs(config.heartbeatLogsRetentionDays);
    const subjectTrackerResult = this.cleanupSubjectTracker(config.subjectTrackerRetentionHours);
    const subjectStatsResult = this.cleanupSubjectStats(config.subjectStatsRetentionDays);

    const durationMs = Date.now() - startTime;

    const result: FullCleanupResult = {
      hitLogs: hitLogsResult,
      alerts: alertsResult,
      systemLogs: systemLogsResult,
      heartbeatLogs: heartbeatLogsResult,
      subjectTracker: subjectTrackerResult,
      subjectStats: subjectStatsResult,
      totalDeleted: hitLogsResult.deletedCount + alertsResult.deletedCount + 
                    systemLogsResult.deletedCount + heartbeatLogsResult.deletedCount + 
                    subjectTrackerResult.deletedCount + subjectStatsResult.deletedCount,
      durationMs,
      executedAt,
    };

    // Log system event when data cleanup runs (Requirement 6.3)
    this.logRepository.createSystemLog('数据清理完成', {
      hitLogsDeleted: hitLogsResult.deletedCount,
      alertsDeleted: alertsResult.deletedCount,
      systemLogsDeleted: systemLogsResult.deletedCount,
      heartbeatLogsDeleted: heartbeatLogsResult.deletedCount,
      subjectTrackerDeleted: subjectTrackerResult.deletedCount,
      subjectStatsDeleted: subjectStatsResult.deletedCount,
      totalDeleted: result.totalDeleted,
      durationMs: result.durationMs,
      retentionConfig: {
        hitLogsRetentionHours: config.hitLogsRetentionHours,
        alertsRetentionDays: config.alertsRetentionDays,
        systemLogsRetentionDays: config.systemLogsRetentionDays,
        heartbeatLogsRetentionDays: config.heartbeatLogsRetentionDays,
        subjectTrackerRetentionHours: config.subjectTrackerRetentionHours,
        subjectStatsRetentionDays: config.subjectStatsRetentionDays,
      },
    });

    return result;
  }
}
