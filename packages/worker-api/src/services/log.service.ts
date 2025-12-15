/**
 * Log Query Service
 * Handles querying and filtering of email processing logs
 * 
 * Requirements: 7.3
 * - Supports filtering by time range
 * - Supports filtering by processing action (passed/deleted/error)
 * - Supports filtering by rule category (whitelist/blacklist/dynamic)
 */

import type {
  ProcessLog,
  LogFilter,
  ProcessAction,
  RuleCategory,
} from '@email-filter/shared';
import { ProcessLogRepository } from '../db/process-log-repository.js';

/**
 * Log query result with pagination info
 */
export interface LogQueryResult {
  logs: ProcessLog[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Log Service class for querying email processing logs
 */
export class LogService {
  constructor(private processLogRepository: ProcessLogRepository) {}

  /**
   * Query process logs with filters
   * 
   * @param filter - Filter criteria for logs
   * @returns Paginated log results
   */
  async queryLogs(filter: LogFilter = {}): Promise<LogQueryResult> {
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;

    // Get logs matching filter
    const logs = await this.processLogRepository.findWithFilter({
      ...filter,
      limit,
      offset,
    });

    // Get total count for pagination
    const total = await this.processLogRepository.countWithFilter({
      startDate: filter.startDate,
      endDate: filter.endDate,
      action: filter.action,
      ruleCategory: filter.ruleCategory,
    });

    return {
      logs,
      total,
      limit,
      offset,
      hasMore: offset + logs.length < total,
    };
  }

  /**
   * Get logs by time range
   * 
   * @param startDate - Start of time range
   * @param endDate - End of time range
   * @param limit - Maximum number of results
   * @param offset - Pagination offset
   */
  async getLogsByTimeRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100,
    offset: number = 0
  ): Promise<LogQueryResult> {
    return this.queryLogs({ startDate, endDate, limit, offset });
  }

  /**
   * Get logs by processing action
   * 
   * @param action - The processing action to filter by
   * @param limit - Maximum number of results
   * @param offset - Pagination offset
   */
  async getLogsByAction(
    action: ProcessAction,
    limit: number = 100,
    offset: number = 0
  ): Promise<LogQueryResult> {
    return this.queryLogs({ action, limit, offset });
  }

  /**
   * Get logs by rule category
   * 
   * @param ruleCategory - The rule category to filter by
   * @param limit - Maximum number of results
   * @param offset - Pagination offset
   */
  async getLogsByRuleCategory(
    ruleCategory: RuleCategory,
    limit: number = 100,
    offset: number = 0
  ): Promise<LogQueryResult> {
    return this.queryLogs({ ruleCategory, limit, offset });
  }

  /**
   * Get a single log entry by ID
   * 
   * @param id - The log entry ID
   */
  async getLogById(id: string): Promise<ProcessLog | null> {
    return this.processLogRepository.findById(id);
  }

  /**
   * Get recent logs (last N entries)
   * 
   * @param limit - Maximum number of results
   */
  async getRecentLogs(limit: number = 50): Promise<ProcessLog[]> {
    const result = await this.queryLogs({ limit, offset: 0 });
    return result.logs;
  }

  /**
   * Get logs for the last N hours
   * 
   * @param hours - Number of hours to look back
   * @param limit - Maximum number of results
   */
  async getLogsLastHours(hours: number, limit: number = 100): Promise<LogQueryResult> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000);
    return this.queryLogs({ startDate, endDate, limit });
  }

  /**
   * Get logs for today
   * 
   * @param limit - Maximum number of results
   */
  async getTodayLogs(limit: number = 100): Promise<LogQueryResult> {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    return this.queryLogs({ startDate, endDate, limit });
  }

  /**
   * Clean up old logs
   * 
   * @param olderThanDays - Delete logs older than this many days
   * @returns Number of deleted logs
   */
  async cleanupOldLogs(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    return this.processLogRepository.deleteOlderThan(cutoffDate);
  }
}
