/**
 * Scheduler Service for Monitoring Module
 *
 * Manages scheduled tasks for:
 * - Heartbeat checks (every 5 minutes) - Requirements: 4.1
 * - Data cleanup (daily) - Requirements: 7.2, 7.3, 7.4, 4.2 (data-cleanup-settings)
 *
 * Uses node-cron for scheduling tasks.
 * Supports dynamic configuration reload from CleanupConfigService.
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { Database } from 'better-sqlite3';
import { HeartbeatService } from './heartbeat.service.js';
import { CleanupService } from './cleanup.service.js';
import { CleanupConfigService, type CleanupConfig } from '../cleanup-config.service.js';

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
  /** Whether to use CleanupConfigService for cleanup settings */
  useCleanupConfig: boolean;
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
  useCleanupConfig: true,             // Use CleanupConfigService by default
};

/**
 * Scheduler Service
 *
 * Manages cron jobs for monitoring tasks.
 * Supports dynamic configuration from CleanupConfigService.
 */
export class SchedulerService {
  private heartbeatService: HeartbeatService;
  private cleanupService: CleanupService;
  private cleanupConfigService: CleanupConfigService;
  private config: SchedulerConfig;
  private cleanupConfig: CleanupConfig | null = null;
  private heartbeatTask: ScheduledTask | null = null;
  private cleanupTask: ScheduledTask | null = null;
  private isRunning: boolean = false;
  private db: Database;

  constructor(db: Database, config: Partial<SchedulerConfig> = {}) {
    this.db = db;
    this.heartbeatService = new HeartbeatService(db);
    this.cleanupService = new CleanupService(db);
    this.cleanupConfigService = new CleanupConfigService(db);
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  }

  /**
   * Load cleanup configuration from database
   * Updates the cleanup cron schedule based on configured cleanup hour
   * 
   * @returns The loaded CleanupConfig
   */
  loadCleanupConfig(): CleanupConfig {
    this.cleanupConfig = this.cleanupConfigService.getConfig();
    
    // Update cleanup cron based on configured hour
    if (this.cleanupConfig) {
      this.config.cleanupCron = `0 ${this.cleanupConfig.cleanupHour} * * *`;
      this.config.hitLogRetentionHours = this.cleanupConfig.hitLogsRetentionHours;
      this.config.alertRetentionDays = this.cleanupConfig.alertsRetentionDays;
    }
    
    console.log(`[Scheduler] Loaded cleanup config: hour=${this.cleanupConfig?.cleanupHour}, autoEnabled=${this.cleanupConfig?.autoCleanupEnabled}`);
    return this.cleanupConfig;
  }

  /**
   * Reload configuration and reschedule cleanup task if needed
   * Allows configuration changes without full restart
   * 
   * Requirement: 4.2 (data-cleanup-settings)
   */
  reloadConfig(): void {
    const oldConfig = this.cleanupConfig;
    const oldCron = this.config.cleanupCron;
    
    this.loadCleanupConfig();
    
    // Check if cleanup schedule needs to be updated
    const newCron = this.config.cleanupCron;
    const wasRunning = this.isRunning;
    
    if (wasRunning && oldCron !== newCron) {
      console.log(`[Scheduler] Cleanup schedule changed from "${oldCron}" to "${newCron}", rescheduling...`);
      
      // Stop and restart cleanup task with new schedule
      if (this.cleanupTask) {
        this.cleanupTask.stop();
        this.cleanupTask = null;
      }
      
      // Only restart if auto cleanup is enabled
      if (this.cleanupConfig?.autoCleanupEnabled) {
        this.startCleanupTask();
      }
    } else if (wasRunning && oldConfig?.autoCleanupEnabled !== this.cleanupConfig?.autoCleanupEnabled) {
      // Handle auto cleanup toggle
      if (this.cleanupConfig?.autoCleanupEnabled) {
        console.log('[Scheduler] Auto cleanup enabled, starting cleanup task...');
        if (!this.cleanupTask) {
          this.startCleanupTask();
        }
      } else {
        console.log('[Scheduler] Auto cleanup disabled, stopping cleanup task...');
        if (this.cleanupTask) {
          this.cleanupTask.stop();
          this.cleanupTask = null;
        }
      }
    }
    
    console.log('[Scheduler] Configuration reloaded successfully');
  }


  /**
   * Start all scheduled tasks
   *
   * This method starts:
   * 1. Heartbeat check task (every 5 minutes by default)
   * 2. Data cleanup task (daily at configured hour by default)
   * 
   * Loads cleanup configuration from database on startup.
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Scheduler] Already running, skipping start');
      return;
    }

    console.log('[Scheduler] Starting scheduled tasks...');

    // Load cleanup configuration from database
    if (this.config.useCleanupConfig) {
      this.loadCleanupConfig();
    }

    // Start heartbeat task (Requirement 4.1)
    this.startHeartbeatTask();

    // Start cleanup task only if auto cleanup is enabled (Requirements 7.2, 7.3, 7.4, 4.2)
    if (!this.config.useCleanupConfig || this.cleanupConfig?.autoCleanupEnabled) {
      this.startCleanupTask();
    } else {
      console.log('[Scheduler] Auto cleanup is disabled, skipping cleanup task');
    }

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
   * Runs daily at configured hour (default 3 AM) to clean up old records.
   * Uses cleanup configuration from database when useCleanupConfig is enabled.
   * Requirements: 7.2, 7.3, 7.4, 4.2 (data-cleanup-settings)
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
   * Uses cleanup configuration from database when useCleanupConfig is enabled.
   * Can be called directly for testing or manual triggers.
   */
  runCleanup(): void {
    console.log('[Scheduler] Running data cleanup...');

    try {
      // Reload config to get latest settings
      if (this.config.useCleanupConfig) {
        this.loadCleanupConfig();
      }

      let result;
      if (this.config.useCleanupConfig && this.cleanupConfig) {
        // Use full cleanup with all configured retention periods
        result = this.cleanupService.runFullCleanupWithConfig(this.cleanupConfig);
        console.log(
          `[Scheduler] Data cleanup completed: ` +
          `${result.systemLogs.deletedCount} system logs, ` +
          `${result.hitLogs.deletedCount} hit logs, ` +
          `${result.alerts.deletedCount} alerts, ` +
          `${result.heartbeatLogs.deletedCount} heartbeat logs, ` +
          `${result.subjectTracker.deletedCount} subject tracker records deleted, ` +
          `total: ${result.totalDeleted}, took ${result.durationMs}ms`
        );
      } else {
        // Fallback to legacy cleanup with scheduler config
        result = this.cleanupService.runFullCleanup(
          this.config.hitLogRetentionHours,
          this.config.alertRetentionDays
        );
        console.log(
          `[Scheduler] Data cleanup completed: ` +
          `${result.hitLogs.deletedCount} hit logs deleted, ` +
          `${result.alerts.deletedCount} alerts deleted, ` +
          `took ${result.durationMs}ms`
        );
      }
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
   * Get the current cleanup configuration from database
   * Returns null if not loaded yet
   */
  getCleanupConfig(): CleanupConfig | null {
    return this.cleanupConfig ? { ...this.cleanupConfig } : null;
  }

  /**
   * Update scheduler configuration
   *
   * Note: For cleanup settings, use reloadConfig() to apply changes from database
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[Scheduler] Configuration updated. Restart required for changes to take effect.');
  }
}
