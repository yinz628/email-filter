/**
 * Stats Aggregator Service
 * Fetches and aggregates statistics from all Worker instances
 * Requirements: 3.1, 3.2, 3.3
 */

import type {
  WorkerInstance,
  AggregatedStats,
  InstanceStats,
} from '@email-filter/shared';
import { InstanceRepository } from '../db/instance-repository.js';

/**
 * Rule stats response from Worker API
 */
interface WorkerRuleStats {
  ruleId: string;
  category: string;
  pattern: string;
  totalProcessed: number;
  deletedCount: number;
  errorCount: number;
}

/**
 * Watch stats response from Worker API
 */
interface WorkerWatchStats {
  watchId: string;
  subjectPattern: string;
  totalCount: number;
  last24hCount: number;
  last1hCount: number;
  recipients?: string[];
}

/**
 * Stats response from Worker API
 */
interface WorkerStatsResponse {
  ruleStats: WorkerRuleStats[];
  watchStats: WorkerWatchStats[];
}

/**
 * Stats Aggregator Service class
 */
export class StatsAggregatorService {
  private repository: InstanceRepository;

  constructor(db: D1Database) {
    this.repository = new InstanceRepository(db);
  }


  /**
   * Get aggregated statistics from all active worker instances
   * Requirements: 3.1, 3.2, 3.3
   */
  async getAggregatedStats(): Promise<AggregatedStats> {
    const instances = await this.repository.findAll();
    const activeInstances = instances.filter(i => i.status === 'active');

    const instanceStats: InstanceStats[] = [];
    let totalProcessed = 0;
    let totalDeleted = 0;
    let totalErrors = 0;

    for (const instance of activeInstances) {
      try {
        const stats = await this.fetchInstanceStats(instance);
        instanceStats.push(stats);

        // Aggregate totals
        for (const ruleStat of stats.ruleStats) {
          totalProcessed += ruleStat.totalProcessed;
          totalDeleted += ruleStat.deletedCount;
          totalErrors += ruleStat.errorCount;
        }
      } catch {
        // Skip instances that fail to respond
        // Their status should be updated by health check
        continue;
      }
    }

    return {
      instances: instanceStats,
      totalProcessed,
      totalDeleted,
      totalErrors,
    };
  }

  /**
   * Get statistics for a specific worker instance
   * Requirements: 3.1
   */
  async getInstanceStats(instanceId: string): Promise<InstanceStats | null> {
    const instance = await this.repository.findById(instanceId);
    if (!instance) {
      return null;
    }

    try {
      return await this.fetchInstanceStats(instance);
    } catch {
      return null;
    }
  }

  /**
   * Fetch statistics from a worker instance API
   */
  private async fetchInstanceStats(instance: WorkerInstance): Promise<InstanceStats> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (instance.apiKey) {
      headers['Authorization'] = `Bearer ${instance.apiKey}`;
    }

    // Fetch rule stats
    const ruleStatsUrl = new URL('/api/stats/rules', instance.apiUrl).toString();
    const ruleStatsResponse = await fetch(ruleStatsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!ruleStatsResponse.ok) {
      throw new Error(`Failed to fetch rule stats: ${ruleStatsResponse.status}`);
    }

    const ruleStatsData = await ruleStatsResponse.json() as { data: WorkerRuleStats[] };

    // Fetch watch stats
    const watchStatsUrl = new URL('/api/stats/watch', instance.apiUrl).toString();
    const watchStatsResponse = await fetch(watchStatsUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!watchStatsResponse.ok) {
      throw new Error(`Failed to fetch watch stats: ${watchStatsResponse.status}`);
    }

    const watchStatsData = await watchStatsResponse.json() as { data: WorkerWatchStats[] };

    return {
      instanceId: instance.id,
      instanceName: instance.name,
      ruleStats: ruleStatsData.data || [],
      watchStats: (watchStatsData.data || []).map(ws => ({
        watchId: ws.watchId,
        subjectPattern: ws.subjectPattern,
        totalCount: ws.totalCount,
        last24hCount: ws.last24hCount,
        last1hCount: ws.last1hCount,
        recipients: ws.recipients || [],
      })),
    };
  }

  /**
   * Refresh statistics for all instances
   * Requirements: 3.4
   */
  async refreshAllStats(): Promise<AggregatedStats> {
    return this.getAggregatedStats();
  }
}
