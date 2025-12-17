/**
 * Scheduler Service for Monitoring Module
 *
 * Manages scheduled tasks for:
 * - Heartbeat checks (every 5 minutes) - Requirements: 4.1
 * - Data cleanup (daily) - Requirements: 7.2, 7.3, 7.4
 *
 * Uses node-cron for scheduling tasks.
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { Database } from 'better-sqlite3';
import { HeartbeatService } from './heartbeat.service.js';
import { CleanupService } from './cleanup.service.js';

/**
 * Configuration for the scheduler
 */
export interface SchedulerConfig {
  /** Cron expression for heartbeat checks (default: every 5 minutes) */
  heartbeatCron: string;
  /** Cron expression for data cleanup (default: daily at 3 AM) */
  cleanupCron: string;
  /** Hours to retain hit logs (default: 72) */
  hitLogRetentionHours: number;
  /** Days to retain alerts (default: 90) */
  alertRetentionDays: number;
  /** Whether to run heartbeat immediately on start */
  runHeartbeatOnStart: boolean;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  heartbeatCron: '*/5 * * * *',      // Every 5 minutes
  cleanupCron: '0 3 * * *',           // Daily at 3 AM (low traffic period)
  hitLogRetentionHours: 72,           // 72 hours (within 48-72 range)
  alertRetentionDays: 90,             // 90 days (within 30-90 range)
  runHeartbeatOnStart: false,
};

/**
 * Scheduler Service
 *
 * Manages cron jobs for monitoring tasks.
 */
export class SchedulerService {
  private heartbeatService: HeartbeatService;
  private cleanupService: CleanupService;
  private config: SchedulerConfig;
  private heartbeatTask: ScheduledTask | null = null;
  private cleanupTask: ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor(db: Database, config: Partial<SchedulerConfig> = {}) {
    this.heartbeatService = new HeartbeatService(db);
    this.cleanupService = new CleanupService(db);
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }


  /**
   * Start all scheduled tasks
   *
   * This method starts:
   * 1. Heartbeat check task (every 5 minutes by default)
   * 2. Data cleanup task (daily at 3 AM by default)
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Scheduler] Already running, skipping start');
      return;
    }

    console.log('[Scheduler] Starting scheduled tasks...');

    // Start heartbeat task (Requirement 4.1)
    this.startHeartbeatTask();

    // Start cleanup task (Requirements 7.2, 7.3, 7.4)
    this.startCleanupTask();

    this.isRunning = true;

    // Optionally run heartbeat immediately on start
    if (this.config.runHeartbeatOnStart) {
      console.log('[Scheduler] Running initial heartbeat check...');
      this.runHeartbeat();
    }

    console.log('[Scheduler] All scheduled tasks started');
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[Scheduler] Not running, skipping stop');
      return;
    }

    console.log('[Scheduler] Stopping scheduled tasks...');

    if (this.heartbeatTask) {
      this.heartbeatTask.stop();
      this.heartbeatTask = null;
    }

    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
    }

    this.isRunning = false;
    console.log('[Scheduler] All scheduled tasks stopped');
  }

  /**
   * Start the heartbeat check task
   *
   * Runs every 5 minutes by default to check all enabled monitoring rules.
   * Requirement: 4.1
   */
  private startHeartbeatTask(): void {
    console.log(`[Scheduler] Starting heartbeat task with cron: ${this.config.heartbeatCron}`);

    this.heartbeatTask = cron.schedule(this.config.heartbeatCron, () => {
      this.runHeartbeat();
    });
  }

  /**
   * Start the data cleanup task
   *
   * Runs daily at 3 AM by default to clean up old records.
   * Requirements: 7.2, 7.3, 7.4
   */
  private startCleanupTask(): void {
    console.log(`[Scheduler] Starting cleanup task with cron: ${this.config.cleanupCron}`);

    this.cleanupTask = cron.schedule(this.config.cleanupCron, () => {
      this.runCleanup();
    });
  }

  /**
   * Run heartbeat check manually
   *
   * Can be called directly for testing or manual triggers.
   */
  runHeartbeat(): void {
    const startTime = Date.now();
    console.log('[Scheduler] Running heartbeat check...');

    try {
      const result = this.heartbeatService.runCheck();
      console.log(
        `[Scheduler] Heartbeat check completed: ` +
        `${result.rulesChecked} rules checked, ` +
        `${result.stateChanges.length} state changes, ` +
        `${result.alertsTriggered} alerts triggered, ` +
        `took ${result.durationMs}ms`
      );
    } catch (error) {
      console.error('[Scheduler] Heartbeat check failed:', error);
    }
  }

  /**
   * Run data cleanup manually
   *
   * Can be called directly for testing or manual triggers.
   */
  runCleanup(): void {
    console.log('[Scheduler] Running data cleanup...');

    try {
      const result = this.cleanupService.runFullCleanup(
        this.config.hitLogRetentionHours,
        this.config.alertRetentionDays
      );
      console.log(
        `[Scheduler] Data cleanup completed: ` +
        `${result.hitLogs.deletedCount} hit logs deleted, ` +
        `${result.alerts.deletedCount} alerts deleted, ` +
        `took ${result.durationMs}ms`
      );
    } catch (error) {
      console.error('[Scheduler] Data cleanup failed:', error);
    }
  }

  /**
   * Check if the scheduler is currently running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current scheduler configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Update scheduler configuration
   *
   * Note: Changes take effect after restart
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[Scheduler] Configuration updated. Restart required for changes to take effect.');
  }
}
