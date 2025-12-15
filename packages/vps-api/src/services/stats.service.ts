/**
 * Stats Service for VPS API
 * Handles statistics counting and querying
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

import type { StatsRepository, RuleStats, OverallStats } from '../db/stats-repository.js';

/**
 * Rule statistics with additional computed fields
 */
export interface RuleStatsWithDetails extends RuleStats {
  forwardedCount: number;
}

/**
 * Stats summary response
 */
export interface StatsSummary {
  overall: OverallStats;
  ruleStats: RuleStatsWithDetails[];
}

/**
 * Stats Service class
 * Provides statistics counting and querying functionality
 */
export class StatsService {
  constructor(private statsRepository: StatsRepository) {}

  /**
   * Increment processed count for a rule
   * Called when an email is processed (forwarded via whitelist)
   * 
   * @param ruleId - The rule ID to increment
   */
  incrementProcessed(ruleId: string): void {
    this.statsRepository.incrementProcessed(ruleId);
  }

  /**
   * Increment deleted count for a rule
   * Called when an email is dropped (blacklist/dynamic match)
   * Also increments total_processed
   * 
   * @param ruleId - The rule ID to increment
   */
  incrementDeleted(ruleId: string): void {
    this.statsRepository.incrementDeleted(ruleId);
  }

  /**
   * Increment error count for a rule
   * Called when processing encounters an error
   * 
   * @param ruleId - The rule ID to increment
   */
  incrementError(ruleId: string): void {
    this.statsRepository.incrementError(ruleId);
  }

  /**
   * Get statistics for a specific rule
   * 
   * @param ruleId - The rule ID to query
   * @returns RuleStatsWithDetails or null if not found
   */
  getRuleStats(ruleId: string): RuleStatsWithDetails | null {
    const stats = this.statsRepository.findByRuleId(ruleId);
    if (!stats) return null;

    return this.enrichStats(stats);
  }

  /**
   * Get statistics for all rules
   * 
   * @returns Array of RuleStatsWithDetails
   */
  getAllRuleStats(): RuleStatsWithDetails[] {
    const allStats = this.statsRepository.findAll();
    return allStats.map((stats) => this.enrichStats(stats));
  }

  /**
   * Get overall statistics summary
   * 
   * @returns OverallStats with aggregated counts
   */
  getOverallStats(): OverallStats {
    return this.statsRepository.getOverallStats();
  }

  /**
   * Get complete stats summary including overall and per-rule stats
   * 
   * @returns StatsSummary with all statistics
   */
  getStatsSummary(): StatsSummary {
    return {
      overall: this.getOverallStats(),
      ruleStats: this.getAllRuleStats(),
    };
  }

  /**
   * Create stats record for a new rule
   * 
   * @param ruleId - The rule ID to create stats for
   */
  createStatsForRule(ruleId: string): void {
    this.statsRepository.create(ruleId);
  }

  /**
   * Delete stats for a rule
   * 
   * @param ruleId - The rule ID to delete stats for
   * @returns true if deleted, false if not found
   */
  deleteStatsForRule(ruleId: string): boolean {
    return this.statsRepository.delete(ruleId);
  }

  /**
   * Enrich stats with computed fields
   */
  private enrichStats(stats: RuleStats): RuleStatsWithDetails {
    // forwardedCount = totalProcessed - deletedCount
    // (emails that were processed but not deleted were forwarded)
    const forwardedCount = stats.totalProcessed - stats.deletedCount;

    return {
      ...stats,
      forwardedCount: Math.max(0, forwardedCount),
    };
  }
}
