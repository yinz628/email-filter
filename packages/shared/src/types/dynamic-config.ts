/**
 * Configuration for dynamic rule generation
 */
export interface DynamicConfig {
  enabled: boolean;
  timeWindowMinutes: number;  // Detection time window, default 60 minutes
  thresholdCount: number;     // Trigger threshold, default 50 emails
  expirationHours: number;    // Expiration time, default 48 hours
}

/**
 * Default dynamic configuration values
 */
export const DEFAULT_DYNAMIC_CONFIG: DynamicConfig = {
  enabled: true,
  timeWindowMinutes: 60,
  thresholdCount: 50,
  expirationHours: 48,
};

/**
 * Configuration for email forwarding
 */
export interface ForwardConfig {
  enabled: boolean;
  defaultForwardTo: string;   // Default forwarding address for passed emails
  forwardRules: ForwardRule[]; // Custom forwarding rules based on recipient
}

/**
 * Custom forwarding rule based on recipient
 */
export interface ForwardRule {
  id: string;
  recipientPattern: string;   // Pattern to match recipient email
  matchMode: 'exact' | 'contains' | 'regex';
  forwardTo: string;          // Forwarding address for matched emails
  enabled: boolean;
}

/**
 * Default forward configuration values
 */
export const DEFAULT_FORWARD_CONFIG: ForwardConfig = {
  enabled: true,
  defaultForwardTo: '',
  forwardRules: [],
};
