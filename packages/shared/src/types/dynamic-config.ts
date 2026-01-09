/**
 * Configuration for dynamic rule generation
 */
export interface DynamicConfig {
  enabled: boolean;
  timeWindowMinutes: number;  // Detection time window, default 30 minutes
  thresholdCount: number;     // Trigger threshold, default 30 emails
  timeSpanThresholdMinutes: number; // Time span threshold between first and Nth email, default 3 minutes
  expirationHours: number;    // Expiration time for rules never hit, default 48 hours
  lastHitThresholdHours: number; // Cleanup threshold for last hit time, default 72 hours
}

/**
 * Default dynamic configuration values
 */
export const DEFAULT_DYNAMIC_CONFIG: DynamicConfig = {
  enabled: true,
  timeWindowMinutes: 30,
  thresholdCount: 30,
  timeSpanThresholdMinutes: 3,
  expirationHours: 48,
  lastHitThresholdHours: 72,
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
