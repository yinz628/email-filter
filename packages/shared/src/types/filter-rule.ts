/**
 * Filter rule category types
 */
export type RuleCategory = 'whitelist' | 'blacklist' | 'dynamic' | 'forward';

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
  tags?: string[];  // Optional tags for organization
  forwardTo?: string;  // Override default forwarding address when rule matches
  /**
   * When true (forward rules only), the email-worker will extract a
   * verification code/link from the message body via the extraction-worker.
   * Mutually exclusive with extractDiscount.
   */
  extractVerification?: boolean;
  /**
   * When true (forward rules only), the email-worker will extract a discount
   * code/link from the message body via the extraction-worker.
   * Mutually exclusive with extractVerification.
   */
  extractDiscount?: boolean;
  /** Optional user-configured regex for code extraction (verification or discount). */
  codePattern?: string;
  /** Optional user-configured regex for link anchor text matching. */
  linkAnchorPattern?: string;
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
  tags?: string[];
  forwardTo?: string;
  extractVerification?: boolean;
  extractDiscount?: boolean;
  codePattern?: string;
  linkAnchorPattern?: string;
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
  tags?: string[];
  forwardTo?: string;
  extractVerification?: boolean;
  extractDiscount?: boolean;
  codePattern?: string;
  linkAnchorPattern?: string;
  enabled?: boolean;
}
