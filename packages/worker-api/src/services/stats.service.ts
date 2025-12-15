/**
 * Stats Service
 * Handles rule statistics operations including updates, queries, and cascade deletes
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4
 * - Display statistics by rule category (8.1)
 * - Show total processed, deleted count, and error count per rule (8.2)
 * - Cascade delete statistics when rule is deleted (8.3)
 * - Real-time update of statistics when emails are processed (8.4)
 */

import type { RuleStats, StatsSummary, RuleCategory, ProcessAction } from '@email-filter/shared';
import { StatsRepository } from '../db/stats-repository.js';
import { RuleRepository } from '../db/rule-repository.js';

/**
 * Extended rule stats with rule information
 */
export interface RuleStatsWithInfo extends RuleStats {
  category?: RuleCategory;
  pattern?: string;
  enabled?: boolean;
}

/**
 * Stats Service class for managing rule statistics
 */
export class StatsService {
  constructor(
    private statsRepository: StatsRepository,
    private ruleRepository: RuleRepository
  ) {}

  /**
   * Get statistics for a specific rule
   */
  async getStatsByRuleId(ruleId: string): Promise<RuleStats | null> {
    return this.statsRepository.findByRuleId(ruleId);
  }

  /**
   * Get all rule statistics
   */
  async getAllStats(): Promise<RuleStats[]> {
    return this.statsRepository.findAll();
  }

  /**
   * Get statistics for rules in a specific category
   * Requirement 8.1: Display statistics by rule category
   */
  async getStatsByCategory(category: RuleCategory): Promise<RuleStats[]> {
    return this.statsRepository.findByCategory(category);
  }


  /**
   * Get statistics with rule information
   * Enriches stats with rule details for display
   */
  async getStatsWithRuleInfo(): Promise<RuleStatsWithInfo[]> {
    const stats = await this.statsRepository.findAll();
    const enrichedStats: RuleStatsWithInfo[] = [];

    for (const stat of stats) {
      const rule = await this.ruleRepository.findById(stat.ruleId);
      enrichedStats.push({
        ...stat,
        category: rule?.category,
        pattern: rule?.pattern,
        enabled: rule?.enabled,
      });
    }

    return enrichedStats;
  }

  /**
   * Get summary statistics across all rules
   * Requirement 8.2: Show aggregated statistics
   */
  async getSummary(): Promise<StatsSummary> {
    return this.statsRepository.getSummary();
  }

  /**
   * Update statistics when an email is processed by a rule
   * Requirement 8.4: Real-time update of statistics
   * 
   * @param ruleId - The rule that matched the email
   * @param action - The action taken ('passed', 'deleted', 'error')
   */
  async recordRuleHit(
    ruleId: string,
    action: ProcessAction
  ): Promise<RuleStats | null> {
    // Ensure stats record exists
    await this.statsRepository.ensureExists(ruleId);
    
    // Increment the appropriate counters
    return this.statsRepository.incrementStats(ruleId, action);
  }

  /**
   * Delete statistics for a rule (cascade delete)
   * Requirement 8.3: Delete statistics when rule is deleted
   * 
   * @param ruleId - The rule ID whose stats should be deleted
   * @returns true if stats were deleted, false if not found
   */
  async deleteStatsByRuleId(ruleId: string): Promise<boolean> {
    return this.statsRepository.deleteByRuleId(ruleId);
  }

  /**
   * Initialize statistics for a new rule
   * Called when a new rule is created
   */
  async initializeStats(ruleId: string): Promise<RuleStats> {
    return this.statsRepository.create(ruleId);
  }

  /**
   * Reset statistics for a rule
   * Useful for testing or manual reset
   */
  async resetStats(ruleId: string): Promise<RuleStats | null> {
    return this.statsRepository.resetStats(ruleId);
  }

  /**
   * Delete rule and cascade delete its statistics
   * Requirement 5.5, 8.3: Rule deletion cascades to statistics
   * 
   * @param ruleId - The rule ID to delete
   * @returns true if rule and stats were deleted
   */
  async deleteRuleWithStats(ruleId: string): Promise<boolean> {
    // First delete the stats
    await this.statsRepository.deleteByRuleId(ruleId);
    
    // Then delete the rule
    return this.ruleRepository.delete(ruleId);
  }
}
