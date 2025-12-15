/**
 * Forward Rules Repository
 * Handles CRUD operations for email forwarding configuration
 */

import type { ForwardConfig, ForwardRule } from '@email-filter/shared';

const CONFIG_KEY_DEFAULT_FORWARD = 'defaultForwardTo';
const CONFIG_KEY_FORWARD_ENABLED = 'forwardEnabled';

export interface CreateForwardRuleDTO {
  recipientPattern: string;
  matchMode: 'exact' | 'contains' | 'regex';
  forwardTo: string;
  enabled?: boolean;
}

export interface UpdateForwardRuleDTO {
  recipientPattern?: string;
  matchMode?: 'exact' | 'contains' | 'regex';
  forwardTo?: string;
  enabled?: boolean;
}

/**
 * Forward Repository class for managing forwarding configuration
 */
export class ForwardRepository {
  constructor(private db: D1Database) {}

  /**
   * Get the full forward configuration
   */
  async getConfig(): Promise<ForwardConfig> {
    const [enabledRow, defaultForwardRow] = await Promise.all([
      this.db
        .prepare('SELECT value FROM dynamic_config WHERE key = ?')
        .bind(CONFIG_KEY_FORWARD_ENABLED)
        .first<{ value: string }>(),
      this.db
        .prepare('SELECT value FROM dynamic_config WHERE key = ?')
        .bind(CONFIG_KEY_DEFAULT_FORWARD)
        .first<{ value: string }>(),
    ]);

    const rules = await this.findAllRules();

    return {
      enabled: enabledRow?.value === 'true',
      defaultForwardTo: defaultForwardRow?.value || '',
      forwardRules: rules,
    };
  }


  /**
   * Update forward configuration
   */
  async updateConfig(config: Partial<ForwardConfig>): Promise<void> {
    const statements: D1PreparedStatement[] = [];

    if (config.enabled !== undefined) {
      statements.push(
        this.db
          .prepare('INSERT OR REPLACE INTO dynamic_config (key, value) VALUES (?, ?)')
          .bind(CONFIG_KEY_FORWARD_ENABLED, config.enabled.toString())
      );
    }

    if (config.defaultForwardTo !== undefined) {
      statements.push(
        this.db
          .prepare('INSERT OR REPLACE INTO dynamic_config (key, value) VALUES (?, ?)')
          .bind(CONFIG_KEY_DEFAULT_FORWARD, config.defaultForwardTo)
      );
    }

    if (statements.length > 0) {
      await this.db.batch(statements);
    }
  }

  /**
   * Find all forward rules
   */
  async findAllRules(): Promise<ForwardRule[]> {
    const result = await this.db
      .prepare('SELECT * FROM forward_rules ORDER BY created_at DESC')
      .all<{
        id: string;
        recipient_pattern: string;
        match_mode: 'exact' | 'contains' | 'regex';
        forward_to: string;
        enabled: number;
        created_at: string;
      }>();

    return (result.results || []).map(this.mapRowToRule);
  }

  /**
   * Find enabled forward rules
   */
  async findEnabledRules(): Promise<ForwardRule[]> {
    const result = await this.db
      .prepare('SELECT * FROM forward_rules WHERE enabled = 1 ORDER BY created_at DESC')
      .all<{
        id: string;
        recipient_pattern: string;
        match_mode: 'exact' | 'contains' | 'regex';
        forward_to: string;
        enabled: number;
        created_at: string;
      }>();

    return (result.results || []).map(this.mapRowToRule);
  }

  /**
   * Find a forward rule by ID
   */
  async findById(id: string): Promise<ForwardRule | null> {
    const row = await this.db
      .prepare('SELECT * FROM forward_rules WHERE id = ?')
      .bind(id)
      .first<{
        id: string;
        recipient_pattern: string;
        match_mode: 'exact' | 'contains' | 'regex';
        forward_to: string;
        enabled: number;
        created_at: string;
      }>();

    return row ? this.mapRowToRule(row) : null;
  }

  /**
   * Create a new forward rule
   */
  async createRule(dto: CreateForwardRuleDTO): Promise<ForwardRule> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.db
      .prepare(
        'INSERT INTO forward_rules (id, recipient_pattern, match_mode, forward_to, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(id, dto.recipientPattern, dto.matchMode, dto.forwardTo, dto.enabled !== false ? 1 : 0, now)
      .run();

    return {
      id,
      recipientPattern: dto.recipientPattern,
      matchMode: dto.matchMode,
      forwardTo: dto.forwardTo,
      enabled: dto.enabled !== false,
    };
  }

  /**
   * Update a forward rule
   */
  async updateRule(id: string, dto: UpdateForwardRuleDTO): Promise<ForwardRule | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (dto.recipientPattern !== undefined) {
      updates.push('recipient_pattern = ?');
      values.push(dto.recipientPattern);
    }
    if (dto.matchMode !== undefined) {
      updates.push('match_mode = ?');
      values.push(dto.matchMode);
    }
    if (dto.forwardTo !== undefined) {
      updates.push('forward_to = ?');
      values.push(dto.forwardTo);
    }
    if (dto.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(dto.enabled ? 1 : 0);
    }

    if (updates.length === 0) return existing;

    values.push(id);
    await this.db
      .prepare(`UPDATE forward_rules SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    return this.findById(id);
  }

  /**
   * Delete a forward rule
   */
  async deleteRule(id: string): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM forward_rules WHERE id = ?')
      .bind(id)
      .run();

    return (result.meta?.changes ?? 0) > 0;
  }

  /**
   * Get forwarding address for a recipient
   */
  async getForwardAddress(recipient: string): Promise<string | null> {
    const config = await this.getConfig();
    
    if (!config.enabled) return null;

    // Check custom rules first
    const rules = await this.findEnabledRules();
    for (const rule of rules) {
      if (this.matchRecipient(recipient, rule)) {
        return rule.forwardTo;
      }
    }

    // Fall back to default
    return config.defaultForwardTo || null;
  }

  /**
   * Match recipient against a forward rule
   */
  private matchRecipient(recipient: string, rule: ForwardRule): boolean {
    const recipientLower = recipient.toLowerCase();
    const patternLower = rule.recipientPattern.toLowerCase();

    switch (rule.matchMode) {
      case 'exact':
        return recipientLower === patternLower;
      case 'contains':
        return recipientLower.includes(patternLower);
      case 'regex':
        try {
          const regex = new RegExp(rule.recipientPattern, 'i');
          return regex.test(recipient);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Map database row to ForwardRule
   */
  private mapRowToRule(row: {
    id: string;
    recipient_pattern: string;
    match_mode: 'exact' | 'contains' | 'regex';
    forward_to: string;
    enabled: number;
  }): ForwardRule {
    return {
      id: row.id,
      recipientPattern: row.recipient_pattern,
      matchMode: row.match_mode,
      forwardTo: row.forward_to,
      enabled: row.enabled === 1,
    };
  }
}
