/**
 * Dynamic Rule Service
 * Handles automatic detection and management of dynamic filter rules
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 * - Tracks email subjects and detects when threshold is exceeded
 * - Automatically creates dynamic rules for spam detection
 * - Manages rule expiration and cleanup
 * - Updates lastHitAt timestamps when rules are matched
 */

import type {
  FilterRule,
  DynamicConfig,
  CreateRuleDTO,
} from '@email-filter/shared';
import { DEFAULT_DYNAMIC_CONFIG } from '@email-filter/shared';
import { RuleRepository } from '../db/rule-repository.js';
import { generateId } from '../db/index.js';

/**
 * Subject tracker entry from database
 */
interface SubjectTrackerRow {
  id: number;
  subject_hash: string;
  subject: string;
  received_at: string;
}

/**
 * Subject count result
 */
interface SubjectCount {
  subjectHash: string;
  subject: string;
  count: number;
}

/**
 * Dynamic Rule Service class
 */
export class DynamicRuleService {
  constructor(
    private db: D1Database,
    private ruleRepository: RuleRepository
  ) {}

  /**
   * Get the current dynamic configuration
   */
  async getConfig(): Promise<DynamicConfig> {
    const result = await this.db
      .prepare('SELECT key, value FROM dynamic_config')
      .all<{ key: string; value: string }>();

    if (!result.results || result.results.length === 0) {
      return { ...DEFAULT_DYNAMIC_CONFIG };
    }

    const config: DynamicConfig = { ...DEFAULT_DYNAMIC_CONFIG };
    for (const row of result.results) {
      switch (row.key) {
        case 'enabled':
          config.enabled = row.value === 'true';
          break;
        case 'timeWindowMinutes':
          config.timeWindowMinutes = parseInt(row.value, 10);
          break;
        case 'thresholdCount':
          config.thresholdCount = parseInt(row.value, 10);
          break;
        case 'expirationHours':
          config.expirationHours = parseInt(row.value, 10);
          break;
      }
    }

    return config;
  }

  /**
   * Update the dynamic configuration
   */
  async updateConfig(config: Partial<DynamicConfig>): Promise<DynamicConfig> {
    const currentConfig = await this.getConfig();
    const newConfig = { ...currentConfig, ...config };

    // Upsert each config value
    const entries = [
      ['enabled', String(newConfig.enabled)],
      ['timeWindowMinutes', String(newConfig.timeWindowMinutes)],
      ['thresholdCount', String(newConfig.thresholdCount)],
      ['expirationHours', String(newConfig.expirationHours)],
    ];

    for (const [key, value] of entries) {
      await this.db
        .prepare(
          `INSERT INTO dynamic_config (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .bind(key, value)
        .run();
    }

    return newConfig;
  }

  /**
   * Generate a hash for a subject string
   * Used for efficient grouping and lookup
   */
  private hashSubject(subject: string): string {
    // Simple hash using the subject normalized (lowercase, trimmed)
    const normalized = subject.toLowerCase().trim();
    // Use a simple string hash for D1 compatibility
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * Track an email subject for dynamic rule detection
   * 
   * @param subject - The email subject to track
   * @param receivedAt - When the email was received
   * @returns The created dynamic rule if threshold was exceeded, null otherwise
   */
  async trackSubject(subject: string, receivedAt: Date = new Date()): Promise<FilterRule | null> {
    const config = await this.getConfig();
    
    if (!config.enabled) {
      return null;
    }

    const subjectHash = this.hashSubject(subject);
    const receivedAtStr = receivedAt.toISOString();

    // Insert the subject tracking record
    await this.db
      .prepare(
        `INSERT INTO email_subject_tracker (subject_hash, subject, received_at)
         VALUES (?, ?, ?)`
      )
      .bind(subjectHash, subject, receivedAtStr)
      .run();

    // Check if threshold is exceeded within time window
    const windowStart = new Date(receivedAt.getTime() - config.timeWindowMinutes * 60 * 1000);
    const windowStartStr = windowStart.toISOString();

    const countResult = await this.db
      .prepare(
        `SELECT COUNT(*) as count FROM email_subject_tracker
         WHERE subject_hash = ? AND received_at >= ?`
      )
      .bind(subjectHash, windowStartStr)
      .first<{ count: number }>();

    const count = countResult?.count || 0;

    // If threshold exceeded, create dynamic rule
    if (count >= config.thresholdCount) {
      // Check if a dynamic rule for this subject already exists
      const existingRule = await this.findDynamicRuleBySubject(subject);
      if (existingRule) {
        // Update lastHitAt for existing rule
        await this.ruleRepository.updateLastHitAt(existingRule.id);
        return existingRule;
      }

      // Create new dynamic rule
      const ruleDto: CreateRuleDTO = {
        category: 'dynamic',
        matchType: 'subject',
        matchMode: 'contains',
        pattern: subject,
        enabled: true,
      };

      const newRule = await this.ruleRepository.create(ruleDto);
      
      // Clean up old tracking records for this subject
      await this.cleanupSubjectTracker(subjectHash, windowStart);

      return newRule;
    }

    return null;
  }

  /**
   * Find an existing dynamic rule that matches a subject
   * Optimized: Direct database query instead of loading all rules
   */
  private async findDynamicRuleBySubject(subject: string): Promise<FilterRule | null> {
    // First try exact match for better performance
    const result = await this.db
      .prepare(
        `SELECT * FROM filter_rules 
         WHERE category = 'dynamic' AND match_type = 'subject' AND pattern = ?
         LIMIT 1`
      )
      .bind(subject)
      .first<{
        id: string;
        category: string;
        match_type: string;
        match_mode: string;
        pattern: string;
        enabled: number;
        created_at: string;
        updated_at: string;
        last_hit_at: string | null;
      }>();

    if (result) {
      return {
        id: result.id,
        category: result.category as 'dynamic',
        matchType: result.match_type as FilterRule['matchType'],
        matchMode: result.match_mode as FilterRule['matchMode'],
        pattern: result.pattern,
        enabled: result.enabled === 1,
        createdAt: new Date(result.created_at),
        updatedAt: new Date(result.updated_at),
        lastHitAt: result.last_hit_at ? new Date(result.last_hit_at) : undefined,
      };
    }

    return null;
  }

  /**
   * Clean up old subject tracking records
   */
  private async cleanupSubjectTracker(subjectHash: string, olderThan: Date): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM email_subject_tracker
         WHERE subject_hash = ? AND received_at < ?`
      )
      .bind(subjectHash, olderThan.toISOString())
      .run();
  }

  /**
   * Clean up expired dynamic rules
   * Removes rules that haven't been hit within the expiration period
   * 
   * @returns Array of deleted rule IDs
   */
  async cleanupExpiredRules(): Promise<string[]> {
    const config = await this.getConfig();
    
    if (!config.enabled) {
      return [];
    }

    const expiredRules = await this.ruleRepository.findExpiredDynamicRules(config.expirationHours);
    const deletedIds: string[] = [];

    for (const rule of expiredRules) {
      const deleted = await this.ruleRepository.delete(rule.id);
      if (deleted) {
        deletedIds.push(rule.id);
      }
    }

    return deletedIds;
  }

  /**
   * Update lastHitAt timestamp for a dynamic rule
   * Called when a dynamic rule matches an email
   * 
   * @param ruleId - The ID of the rule to update
   */
  async updateRuleHitTimestamp(ruleId: string): Promise<void> {
    await this.ruleRepository.updateLastHitAt(ruleId);
  }

  /**
   * Clean up old subject tracking records across all subjects
   * Should be called periodically to prevent table bloat
   */
  async cleanupOldTrackingRecords(): Promise<number> {
    const config = await this.getConfig();
    
    // Keep records for at least the time window duration
    const cutoffTime = new Date(Date.now() - config.timeWindowMinutes * 60 * 1000 * 2);
    
    const result = await this.db
      .prepare(
        `DELETE FROM email_subject_tracker WHERE received_at < ?`
      )
      .bind(cutoffTime.toISOString())
      .run();

    return result.meta?.changes || 0;
  }

  /**
   * Get subject counts within the current time window
   * Useful for monitoring and debugging
   */
  async getSubjectCounts(): Promise<SubjectCount[]> {
    const config = await this.getConfig();
    const windowStart = new Date(Date.now() - config.timeWindowMinutes * 60 * 1000);

    const result = await this.db
      .prepare(
        `SELECT subject_hash, subject, COUNT(*) as count
         FROM email_subject_tracker
         WHERE received_at >= ?
         GROUP BY subject_hash
         ORDER BY count DESC
         LIMIT 100`
      )
      .bind(windowStart.toISOString())
      .all<{ subject_hash: string; subject: string; count: number }>();

    return (result.results || []).map(row => ({
      subjectHash: row.subject_hash,
      subject: row.subject,
      count: row.count,
    }));
  }
}
