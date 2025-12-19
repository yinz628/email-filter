/**
 * Type-Specific Task Processors for Async Task Processing
 * 
 * Implements processors for each async task type:
 * - stats: Statistics updates (global and rule-specific)
 * - log: Log recording
 * - watch: Watch rule tracking
 * - dynamic: Dynamic rule tracking
 * - campaign: Campaign analytics
 * - monitoring: Signal monitoring
 * 
 * Requirements: 2.1, 3.3
 */

import type { Database } from 'better-sqlite3';
import type { PendingTask, AsyncTaskData } from './async-task-processor.js';
import type { StatsRepository } from '../db/stats-repository.js';
import type { LogRepository, LogCategory } from '../db/log-repository.js';
import type { WatchRepository, WatchRule } from '../db/watch-repository.js';
import type { RuleRepository } from '../db/rule-repository.js';
import { DynamicRuleService } from './dynamic-rule.service.js';
import { CampaignAnalyticsService } from './campaign-analytics.service.js';
import { HitProcessor } from './monitoring/hit-processor.js';
import { matchesRuleWebhook } from '@email-filter/shared';

/**
 * Aggregated stats for batch processing
 */
interface AggregatedStats {
  globalForwarded: number;
  globalDeleted: number;
  ruleStats: Map<string, { processed: number; deleted: number }>;
}

/**
 * Log entry for batch insert
 */
export interface LogEntry {
  category: LogCategory;
  message: string;
  details?: Record<string, unknown>;
  level: 'info' | 'warn' | 'error';
  workerName: string;
}

/**
 * Process stats tasks - aggregates and batch updates statistics
 * 
 * Requirements: 3.3 - Combine similar operations into single database writes
 * 
 * @param tasks - Array of stats tasks to process
 * @param statsRepository - Stats repository for database operations
 * @param ruleRepository - Rule repository for updating lastHitAt
 */
export async function processStatsTasks(
  tasks: PendingTask[],
  statsRepository: StatsRepository,
  ruleRepository: RuleRepository
): Promise<void> {
  if (tasks.length === 0) return;

  // Aggregate stats from all tasks
  const aggregated: AggregatedStats = {
    globalForwarded: 0,
    globalDeleted: 0,
    ruleStats: new Map(),
  };

  for (const task of tasks) {
    const { filterResult } = task.data;

    // Aggregate global stats
    if (filterResult.action === 'drop') {
      aggregated.globalDeleted++;
    } else {
      aggregated.globalForwarded++;
    }

    // Aggregate rule-specific stats
    const ruleId = filterResult.matchedRule?.id;
    if (ruleId) {
      const existing = aggregated.ruleStats.get(ruleId) || { processed: 0, deleted: 0 };
      if (filterResult.action === 'drop') {
        existing.deleted++;
      } else {
        existing.processed++;
      }
      aggregated.ruleStats.set(ruleId, existing);
    }
  }

  // Batch update global stats
  if (aggregated.globalForwarded > 0) {
    statsRepository.incrementGlobalForwardedBatch(aggregated.globalForwarded);
  }
  if (aggregated.globalDeleted > 0) {
    statsRepository.incrementGlobalDeletedBatch(aggregated.globalDeleted);
  }

  // Batch update rule-specific stats and lastHitAt
  for (const [ruleId, stats] of aggregated.ruleStats) {
    if (stats.processed > 0) {
      statsRepository.incrementProcessedBatch(ruleId, stats.processed);
    }
    if (stats.deleted > 0) {
      statsRepository.incrementDeletedBatch(ruleId, stats.deleted);
    }
    // Update lastHitAt for the rule
    ruleRepository.updateLastHit(ruleId);
  }
}

/**
 * Process log tasks - batch inserts log entries
 * 
 * Requirements: 3.3 - Combine similar operations into single database writes
 * 
 * @param tasks - Array of log tasks to process
 * @param logRepository - Log repository for database operations
 */
export async function processLogTasks(
  tasks: PendingTask[],
  logRepository: LogRepository
): Promise<void> {
  if (tasks.length === 0) return;

  // Convert tasks to log entries
  const logEntries: LogEntry[] = tasks.map((task) => {
    const { payload, filterResult } = task.data;
    const category: LogCategory = filterResult.action === 'drop' ? 'email_drop' : 'email_forward';
    const message = filterResult.action === 'drop'
      ? `拦截邮件: ${payload.subject}`
      : `转发邮件: ${payload.subject}`;
    const workerName = payload.workerName || 'global';

    return {
      category,
      message,
      details: {
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        action: filterResult.action,
        forwardTo: filterResult.forwardTo,
        matchedRule: filterResult.matchedRule?.pattern,
        reason: filterResult.reason,
      },
      level: 'info' as const,
      workerName,
    };
  });

  // Batch insert logs
  logRepository.createBatch(logEntries);
}

/**
 * Process watch tasks - batch updates watch rule hit counts
 * 
 * Requirements: 3.3 - Combine similar operations into single database writes
 * 
 * @param tasks - Array of watch tasks to process
 * @param watchRepository - Watch repository for database operations
 */
export async function processWatchTasks(
  tasks: PendingTask[],
  watchRepository: WatchRepository
): Promise<void> {
  if (tasks.length === 0) return;

  // Get enabled watch rules once
  const watchRules = watchRepository.findEnabled();
  if (watchRules.length === 0) return;

  // Aggregate hit counts per rule
  const hitCounts = new Map<string, number>();

  for (const task of tasks) {
    const { payload } = task.data;

    // Check each watch rule against the payload
    for (const rule of watchRules) {
      if (matchesWatchRule(payload, rule)) {
        const count = hitCounts.get(rule.id) || 0;
        hitCounts.set(rule.id, count + 1);
      }
    }
  }

  // Batch update hit counts
  for (const [ruleId, count] of hitCounts) {
    watchRepository.incrementHitBatch(ruleId, count);
  }
}

/**
 * Check if a payload matches a watch rule
 */
function matchesWatchRule(
  payload: { from: string; to: string; subject: string },
  rule: WatchRule
): boolean {
  let value: string;
  
  switch (rule.matchType) {
    case 'sender':
      value = payload.from;
      break;
    case 'subject':
      value = payload.subject;
      break;
    case 'domain':
      // Extract domain from sender email
      const atIndex = payload.from.lastIndexOf('@');
      value = atIndex !== -1 ? payload.from.substring(atIndex + 1).toLowerCase() : '';
      break;
    default:
      return false;
  }

  const pattern = rule.pattern;
  const valueLower = value.toLowerCase();
  const patternLower = pattern.toLowerCase();

  switch (rule.matchMode) {
    case 'exact':
      return valueLower === patternLower;
    case 'contains':
      return valueLower.includes(patternLower);
    case 'startsWith':
      return valueLower.startsWith(patternLower);
    case 'endsWith':
      return valueLower.endsWith(patternLower);
    case 'regex':
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(value);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

/**
 * Process dynamic rule tasks - tracks subjects for dynamic rule creation
 * 
 * Requirements: 2.1 - Enqueue dynamic rule tracking as async task
 * 
 * @param tasks - Array of dynamic tasks to process
 * @param dynamicRuleService - Dynamic rule service for tracking
 */
export async function processDynamicTasks(
  tasks: PendingTask[],
  dynamicRuleService: DynamicRuleService
): Promise<void> {
  if (tasks.length === 0) return;

  for (const task of tasks) {
    const { payload } = task.data;
    const receivedAt = new Date(payload.timestamp);
    
    // Track subject for dynamic rule detection
    dynamicRuleService.trackSubject(payload.subject, receivedAt);
  }
}

/**
 * Process campaign analytics tasks - tracks emails for campaign analysis
 * 
 * Requirements: 2.1 - Enqueue campaign analytics as async task
 * 
 * @param tasks - Array of campaign tasks to process
 * @param campaignAnalyticsService - Campaign analytics service for tracking
 */
export async function processCampaignTasks(
  tasks: PendingTask[],
  campaignAnalyticsService: CampaignAnalyticsService
): Promise<void> {
  if (tasks.length === 0) return;

  for (const task of tasks) {
    const { payload } = task.data;
    
    try {
      campaignAnalyticsService.trackEmailSelective({
        sender: payload.from,
        subject: payload.subject,
        recipient: payload.to,
        receivedAt: new Date(payload.timestamp).toISOString(),
        workerName: payload.workerName || 'global',
      });
    } catch (error) {
      // Log error but continue processing other tasks
      console.error('[processCampaignTasks] Error tracking email:', error);
    }
  }
}

/**
 * Process signal monitoring tasks - processes emails for monitoring rules
 * 
 * Requirements: 2.1 - Enqueue signal monitoring as async task
 * 
 * @param tasks - Array of monitoring tasks to process
 * @param hitProcessor - Hit processor for monitoring
 */
export async function processMonitoringTasks(
  tasks: PendingTask[],
  hitProcessor: HitProcessor
): Promise<void> {
  if (tasks.length === 0) return;

  for (const task of tasks) {
    const { payload } = task.data;
    
    try {
      hitProcessor.processEmail({
        sender: payload.from,
        subject: payload.subject,
        recipient: payload.to,
        receivedAt: new Date(payload.timestamp),
        workerName: payload.workerName,
      });
    } catch (error) {
      // Log error but continue processing other tasks
      console.error('[processMonitoringTasks] Error processing email:', error);
    }
  }
}

/**
 * Factory function to create all task processors with dependencies
 * 
 * @param db - Database instance
 * @param statsRepository - Stats repository
 * @param logRepository - Log repository
 * @param watchRepository - Watch repository
 * @param ruleRepository - Rule repository
 * @returns Object with all processor functions bound to their dependencies
 */
export function createTaskProcessors(
  db: Database,
  statsRepository: StatsRepository,
  logRepository: LogRepository,
  watchRepository: WatchRepository,
  ruleRepository: RuleRepository
) {
  const dynamicRuleService = new DynamicRuleService(db, ruleRepository);
  const campaignAnalyticsService = new CampaignAnalyticsService(db);
  const hitProcessor = new HitProcessor(db);

  return {
    stats: (tasks: PendingTask[]) => processStatsTasks(tasks, statsRepository, ruleRepository),
    log: (tasks: PendingTask[]) => processLogTasks(tasks, logRepository),
    watch: (tasks: PendingTask[]) => processWatchTasks(tasks, watchRepository),
    dynamic: (tasks: PendingTask[]) => processDynamicTasks(tasks, dynamicRuleService),
    campaign: (tasks: PendingTask[]) => processCampaignTasks(tasks, campaignAnalyticsService),
    monitoring: (tasks: PendingTask[]) => processMonitoringTasks(tasks, hitProcessor),
  };
}
