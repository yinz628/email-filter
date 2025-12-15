/**
 * Filter rule category types
 */
export type RuleCategory = 'whitelist' | 'blacklist' | 'dynamic';

/**
 * Match type - what field to match against
 */
export type MatchType = 'sender' | 'subject' | 'domain';

/**
 * Match mode - how to perform the match
 */
export type MatchMode = 'exact' | 'contains' | 'startsWith' | 'endsWith' | 'regex';

/**
 * Filter rule interface
 * Defines email filtering conditions
 */
export interface FilterRule {
  id: string;
  category: RuleCategory;
  matchType: MatchType;
  matchMode: MatchMode;
  pattern: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastHitAt?: Date; // Used for dynamic rule expiration detection
}

/**
 * DTO for creating a new filter rule
 */
export interface CreateRuleDTO {
  category: RuleCategory;
  matchType: MatchType;
  matchMode: MatchMode;
  pattern: string;
  enabled?: boolean;
}

/**
 * DTO for updating an existing filter rule
 */
export interface UpdateRuleDTO {
  category?: RuleCategory;
  matchType?: MatchType;
  matchMode?: MatchMode;
  pattern?: string;
  enabled?: boolean;
}
