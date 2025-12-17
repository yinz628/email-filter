/**
 * Monitoring module types for real-time email signal monitoring and alerting
 */

// ============================================================================
// Signal State Types
// ============================================================================

/**
 * Signal state representing the health of a monitoring signal
 * - ACTIVE: Signal is appearing normally (gap <= expectedInterval * 1.5)
 * - WEAK: Signal is appearing but slower than expected (gap <= deadAfter)
 * - DEAD: Signal has not appeared for too long (gap > deadAfter)
 */
export type SignalState = 'ACTIVE' | 'WEAK' | 'DEAD';

/**
 * Alert type triggered on state transitions
 * - FREQUENCY_DOWN: ACTIVE → WEAK
 * - SIGNAL_DEAD: WEAK → DEAD
 * - SIGNAL_RECOVERED: DEAD/WEAK → ACTIVE
 */
export type AlertType = 'FREQUENCY_DOWN' | 'SIGNAL_DEAD' | 'SIGNAL_RECOVERED';

/**
 * Alert channel types for notification delivery
 */
export type AlertChannelType = 'webhook' | 'email';

// ============================================================================
// Monitoring Rule Types
// ============================================================================

/**
 * Monitoring rule defining a signal to track
 */
export interface MonitoringRule {
  id: string;
  merchant: string;                    // Merchant domain or identifier
  name: string;                        // Rule name for display
  subjectPattern: string;              // Subject matching pattern (regex)
  expectedIntervalMinutes: number;     // Expected appearance interval (minutes)
  deadAfterMinutes: number;            // Death threshold (minutes)
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for creating a new monitoring rule
 */
export interface CreateMonitoringRuleDTO {
  merchant: string;
  name: string;
  subjectPattern: string;
  expectedIntervalMinutes: number;
  deadAfterMinutes: number;
  enabled?: boolean;
}


/**
 * DTO for updating an existing monitoring rule
 */
export interface UpdateMonitoringRuleDTO {
  merchant?: string;
  name?: string;
  subjectPattern?: string;
  expectedIntervalMinutes?: number;
  deadAfterMinutes?: number;
  enabled?: boolean;
}

/**
 * Filter options for querying monitoring rules
 */
export interface MonitoringRuleFilter {
  merchant?: string;
  enabled?: boolean;
}

// ============================================================================
// Signal Status Types
// ============================================================================

/**
 * Current status of a monitoring signal
 */
export interface SignalStatus {
  ruleId: string;
  rule: MonitoringRule;
  state: SignalState;
  lastSeenAt: Date | null;
  gapMinutes: number;
  count1h: number;
  count12h: number;
  count24h: number;
  updatedAt: Date;
}

/**
 * Database representation of signal state
 */
export interface SignalStateRecord {
  ruleId: string;
  state: SignalState;
  lastSeenAt: string | null;
  count1h: number;
  count12h: number;
  count24h: number;
  updatedAt: string;
}

// ============================================================================
// Alert Types
// ============================================================================

/**
 * Alert record for state change notifications
 */
export interface Alert {
  id: string;
  ruleId: string;
  alertType: AlertType;
  previousState: SignalState;
  currentState: SignalState;
  gapMinutes: number;
  count1h: number;
  count12h: number;
  count24h: number;
  message: string;
  sentAt: Date | null;
  createdAt: Date;
}

/**
 * DTO for creating a new alert
 */
export interface CreateAlertDTO {
  ruleId: string;
  alertType: AlertType;
  previousState: SignalState;
  currentState: SignalState;
  gapMinutes: number;
  count1h: number;
  count12h: number;
  count24h: number;
  message: string;
}

/**
 * Filter options for querying alerts
 */
export interface AlertFilter {
  ruleId?: string;
  alertType?: AlertType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

// ============================================================================
// Email Hit Types
// ============================================================================

/**
 * Email metadata used for monitoring (minimal fields)
 */
export interface EmailMetadata {
  sender: string;
  subject: string;
  recipient: string;
  receivedAt: Date;
}

/**
 * Email hit record for audit logging
 */
export interface EmailHit {
  id: number;
  ruleId: string;
  sender: string;
  subject: string;
  recipient: string;
  receivedAt: Date;
  createdAt: Date;
}

/**
 * Result of processing an email for monitoring
 */
export interface HitResult {
  matched: boolean;
  matchedRules: string[];      // IDs of matched rules
  stateChanges: StateChange[];
}

/**
 * State change record
 */
export interface StateChange {
  ruleId: string;
  previousState: SignalState;
  currentState: SignalState;
  alertTriggered: boolean;
}

// ============================================================================
// Heartbeat Types
// ============================================================================

/**
 * Result of a heartbeat check
 */
export interface HeartbeatResult {
  checkedAt: Date;
  rulesChecked: number;
  stateChanges: StateChange[];
  alertsTriggered: number;
  durationMs: number;
}

/**
 * Heartbeat log record
 */
export interface HeartbeatLog {
  id: number;
  checkedAt: Date;
  rulesChecked: number;
  stateChanges: number;
  alertsTriggered: number;
  durationMs: number;
}

// ============================================================================
// Alert Channel Types
// ============================================================================

/**
 * Webhook configuration for alert delivery
 */
export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
}

/**
 * Email configuration for alert delivery
 */
export interface EmailAlertConfig {
  to: string[];
  from?: string;
  subject?: string;
}

/**
 * Alert channel configuration
 */
export interface AlertChannel {
  id: string;
  channelType: AlertChannelType;
  config: WebhookConfig | EmailAlertConfig;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for configuring an alert channel
 */
export interface AlertChannelConfigDTO {
  id?: string;
  channelType: AlertChannelType;
  config: WebhookConfig | EmailAlertConfig;
  enabled: boolean;
}

// ============================================================================
// State Calculation Utilities
// ============================================================================

/**
 * Calculate signal state based on gap and rule thresholds
 * 
 * State calculation formula:
 * - gap <= expectedInterval * 1.5 → ACTIVE
 * - expectedInterval * 1.5 < gap <= deadAfter → WEAK
 * - gap > deadAfter → DEAD
 * 
 * @param gapMinutes - Minutes since last signal appearance
 * @param expectedIntervalMinutes - Expected interval between signals
 * @param deadAfterMinutes - Threshold after which signal is considered dead
 * @returns The calculated signal state
 */
export function calculateSignalState(
  gapMinutes: number,
  expectedIntervalMinutes: number,
  deadAfterMinutes: number
): SignalState {
  const activeThreshold = expectedIntervalMinutes * 1.5;
  
  if (gapMinutes <= activeThreshold) {
    return 'ACTIVE';
  } else if (gapMinutes <= deadAfterMinutes) {
    return 'WEAK';
  } else {
    return 'DEAD';
  }
}

/**
 * Calculate gap in minutes from last seen time to now
 * 
 * @param lastSeenAt - Last time the signal was seen (null if never seen)
 * @param now - Current time (defaults to new Date())
 * @returns Gap in minutes, or Infinity if never seen
 */
export function calculateGapMinutes(
  lastSeenAt: Date | null,
  now: Date = new Date()
): number {
  if (lastSeenAt === null) {
    return Infinity;
  }
  const diffMs = now.getTime() - lastSeenAt.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

/**
 * Determine alert type based on state transition
 * 
 * @param previousState - Previous signal state
 * @param currentState - Current signal state
 * @returns Alert type or null if no alert should be triggered
 */
export function determineAlertType(
  previousState: SignalState,
  currentState: SignalState
): AlertType | null {
  // No state change = no alert
  if (previousState === currentState) {
    return null;
  }
  
  // Recovery: DEAD/WEAK → ACTIVE
  if (currentState === 'ACTIVE' && (previousState === 'DEAD' || previousState === 'WEAK')) {
    return 'SIGNAL_RECOVERED';
  }
  
  // Frequency down: ACTIVE → WEAK
  if (previousState === 'ACTIVE' && currentState === 'WEAK') {
    return 'FREQUENCY_DOWN';
  }
  
  // Signal dead: WEAK → DEAD or ACTIVE → DEAD
  if (currentState === 'DEAD' && (previousState === 'WEAK' || previousState === 'ACTIVE')) {
    return 'SIGNAL_DEAD';
  }
  
  return null;
}
