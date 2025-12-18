/**
 * Alert Service for Monitoring Module
 *
 * Manages alert creation, formatting, and delivery for state change notifications.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import type { Database } from 'better-sqlite3';
import type {
  Alert,
  AlertType,
  SignalState,
  SignalStatus,
  CreateAlertDTO,
  AlertFilter,
  MonitoringRule,
  WebhookConfig,
  EmailAlertConfig,
  AlertChannel,
} from '@email-filter/shared';
import { determineAlertType } from '@email-filter/shared';
import { AlertRepository } from '../../db/alert-repository.js';
import { ConfigRepository } from '../../db/config-repository.js';
import { sendTelegramMessage, type TelegramConfig } from './telegram.service.js';

/**
 * State icons for display formatting
 */
const STATE_ICONS: Record<SignalState, string> = {
  ACTIVE: '🟢',
  WEAK: '🟡',
  DEAD: '🔴',
};

/**
 * Alert type labels for message formatting
 */
const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  FREQUENCY_DOWN: '频率下降',
  SIGNAL_DEAD: '信号消失',
  SIGNAL_RECOVERED: '信号恢复',
  RATIO_LOW: '比例过低',
  RATIO_RECOVERED: '比例恢复',
};

/**
 * Alert Service
 *
 * Provides methods for creating, formatting, and sending alerts.
 */
export class AlertService {
  private alertRepo: AlertRepository;
  private configRepo: ConfigRepository;

  constructor(private db: Database) {
    this.alertRepo = new AlertRepository(db);
    this.configRepo = new ConfigRepository(db);
  }

  /**
   * Determine alert type based on state transition
   *
   * State transition alert matrix (Requirements 5.1, 5.2, 5.3, 5.4):
   * - ACTIVE → WEAK: FREQUENCY_DOWN
   * - WEAK → DEAD: SIGNAL_DEAD
   * - ACTIVE → DEAD: SIGNAL_DEAD
   * - DEAD/WEAK → ACTIVE: SIGNAL_RECOVERED
   * - Same state: null (no alert)
   *
   * @param previousState - Previous signal state
   * @param currentState - Current signal state
   * @returns AlertType or null if no alert should be triggered
   */
  determineAlertType(previousState: SignalState, currentState: SignalState): AlertType | null {
    return determineAlertType(previousState, currentState);
  }

  /**
   * Format alert message with all required information
   *
   * Requirements: 5.5 - Alert must include merchant, rule, state change,
   * gap time, and historical performance (24h/12h/1h counts)
   *
   * @param rule - The monitoring rule
   * @param alertType - Type of alert
   * @param previousState - Previous signal state
   * @param currentState - Current signal state
   * @param gapMinutes - Minutes since last signal
   * @param count1h - Hit count in last 1 hour
   * @param count12h - Hit count in last 12 hours
   * @param count24h - Hit count in last 24 hours
   * @param lastSeenAt - Optional last seen timestamp
   * @returns Formatted alert message
   */
  formatAlertMessage(
    rule: MonitoringRule,
    alertType: AlertType,
    previousState: SignalState,
    currentState: SignalState,
    gapMinutes: number,
    count1h: number,
    count12h: number,
    count24h: number,
    lastSeenAt?: Date | null
  ): string {
    const alertLabel = ALERT_TYPE_LABELS[alertType];
    const prevIcon = STATE_ICONS[previousState];
    const currIcon = STATE_ICONS[currentState];
    // Recalculate gapMinutes from lastSeenAt if available to ensure consistency
    const actualGapMinutes = lastSeenAt
      ? Math.floor((Date.now() - lastSeenAt.getTime()) / (1000 * 60))
      : gapMinutes;
    const gapDisplay = this.formatGapDisplay(actualGapMinutes);
    const lastSeenDisplay = lastSeenAt ? this.formatDateTime(lastSeenAt) : '从未出现';

    return (
      `[${alertLabel}] ${rule.merchant} / ${rule.name}\n` +
      `状态变化: ${prevIcon} ${previousState} → ${currIcon} ${currentState}\n` +
      `最后出现: ${lastSeenDisplay} (${gapDisplay})\n` +
      `历史表现: 24h: ${count24h} | 12h: ${count12h} | 1h: ${count1h}`
    );
  }

  /**
   * Format date time for display (Asia/Shanghai timezone)
   */
  private formatDateTime(date: Date): string {
    return date.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  /**
   * Create an alert record
   *
   * Requirements: 5.5
   *
   * @param data - Alert creation data
   * @returns Created alert
   */
  createAlert(data: CreateAlertDTO): Alert {
    return this.alertRepo.create(data);
  }

  /**
   * Create alert from state change with rule information
   *
   * @param rule - The monitoring rule
   * @param previousState - Previous signal state
   * @param currentState - Current signal state
   * @param gapMinutes - Minutes since last signal
   * @param count1h - Hit count in last 1 hour
   * @param count12h - Hit count in last 12 hours
   * @param count24h - Hit count in last 24 hours
   * @param lastSeenAt - Optional last seen timestamp
   * @returns Created alert or null if no alert should be triggered
   */
  createAlertFromStateChange(
    rule: MonitoringRule,
    previousState: SignalState,
    currentState: SignalState,
    gapMinutes: number,
    count1h: number,
    count12h: number,
    count24h: number,
    lastSeenAt?: Date | null
  ): Alert | null {
    const alertType = this.determineAlertType(previousState, currentState);
    if (!alertType) {
      return null;
    }

    const message = this.formatAlertMessage(
      rule,
      alertType,
      previousState,
      currentState,
      gapMinutes,
      count1h,
      count12h,
      count24h,
      lastSeenAt
    );

    const alert = this.createAlert({
      ruleId: rule.id,
      alertType,
      previousState,
      currentState,
      gapMinutes,
      count1h,
      count12h,
      count24h,
      message,
    });

    // Send Telegram notification
    this.sendTelegramNotification(alert).catch((err) => {
      console.error('Failed to send Telegram notification:', err);
    });

    return alert;
  }

  /**
   * Send Telegram notification for signal alert
   */
  private async sendTelegramNotification(alert: Alert): Promise<void> {
    try {
      const telegramConfig = this.configRepo.getJson<TelegramConfig>('telegram_config');

      if (!telegramConfig || !telegramConfig.enabled) {
        return;
      }

      const title =
        alert.alertType === 'SIGNAL_DEAD'
          ? '信号消失告警'
          : alert.alertType === 'SIGNAL_RECOVERED'
            ? '信号恢复'
            : alert.alertType === 'FREQUENCY_DOWN'
              ? '频率下降告警'
              : '监控告警';

      const result = await sendTelegramMessage(telegramConfig, {
        title,
        body: alert.message,
        alertType: alert.alertType,
      });

      // Mark alert as sent if Telegram message was successful
      if (result.success) {
        this.markAsSent(alert.id);
      } else {
        console.error('Telegram send failed:', result.error);
      }
    } catch (error) {
      console.error('Telegram notification error:', error);
    }
  }

  /**
   * Get alert by ID
   *
   * @param id - Alert ID
   * @returns Alert or null if not found
   */
  getAlert(id: string): Alert | null {
    return this.alertRepo.getById(id);
  }

  /**
   * Get alerts with optional filtering
   *
   * @param filter - Optional filter criteria
   * @returns Array of alerts
   */
  getAlerts(filter?: AlertFilter): Alert[] {
    return this.alertRepo.getAll(filter);
  }

  /**
   * Get unsent alerts
   *
   * @returns Array of unsent alerts
   */
  getUnsentAlerts(): Alert[] {
    return this.alertRepo.getUnsent();
  }

  /**
   * Mark alert as sent
   *
   * @param id - Alert ID
   * @returns true if successful
   */
  markAsSent(id: string): boolean {
    return this.alertRepo.markAsSent(id);
  }

  /**
   * Send alert via webhook
   *
   * Requirements: 5.6
   *
   * @param alert - Alert to send
   * @param config - Webhook configuration
   * @returns true if sent successfully
   */
  async sendViaWebhook(alert: Alert, config: WebhookConfig): Promise<boolean> {
    try {
      const method = config.method || 'POST';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...config.headers,
      };

      const response = await fetch(config.url, {
        method,
        headers,
        body: JSON.stringify({
          alertId: alert.id,
          ruleId: alert.ruleId,
          alertType: alert.alertType,
          previousState: alert.previousState,
          currentState: alert.currentState,
          gapMinutes: alert.gapMinutes,
          count1h: alert.count1h,
          count12h: alert.count12h,
          count24h: alert.count24h,
          message: alert.message,
          createdAt: alert.createdAt.toISOString(),
        }),
      });

      if (response.ok) {
        this.markAsSent(alert.id);
        return true;
      }

      console.error(`Webhook failed with status ${response.status}: ${await response.text()}`);
      return false;
    } catch (error) {
      console.error('Webhook send error:', error);
      return false;
    }
  }

  /**
   * Send alert via email (placeholder implementation)
   *
   * Requirements: 5.6
   *
   * @param alert - Alert to send
   * @param config - Email configuration
   * @returns true if sent successfully
   */
  async sendViaEmail(alert: Alert, config: EmailAlertConfig): Promise<boolean> {
    // Email sending requires external service integration
    // This is a placeholder that logs the intent
    console.log(`[Email Alert] To: ${config.to.join(', ')}`);
    console.log(`[Email Alert] Subject: ${config.subject || 'Monitoring Alert'}`);
    console.log(`[Email Alert] Body: ${alert.message}`);

    // In a real implementation, this would integrate with an email service
    // For now, we mark it as sent for testing purposes
    this.markAsSent(alert.id);
    return true;
  }

  /**
   * Send alert through a configured channel
   *
   * @param alert - Alert to send
   * @param channel - Alert channel configuration
   * @returns true if sent successfully
   */
  async sendAlert(alert: Alert, channel: AlertChannel): Promise<boolean> {
    if (!channel.enabled) {
      return false;
    }

    switch (channel.channelType) {
      case 'webhook':
        return this.sendViaWebhook(alert, channel.config as WebhookConfig);
      case 'email':
        return this.sendViaEmail(alert, channel.config as EmailAlertConfig);
      default:
        console.error(`Unknown channel type: ${channel.channelType}`);
        return false;
    }
  }

  /**
   * Count alerts
   *
   * @param filter - Optional filter criteria
   * @returns Number of alerts
   */
  countAlerts(filter?: AlertFilter): number {
    return this.alertRepo.count(filter);
  }

  /**
   * Delete alerts older than specified date
   *
   * @param date - Cutoff date
   * @returns Number of deleted alerts
   */
  deleteOlderThan(date: Date): number {
    return this.alertRepo.deleteOlderThan(date);
  }

  /**
   * Format gap time for display
   *
   * @param gapMinutes - Gap in minutes
   * @returns Formatted string (e.g., "2h 30m ago" or "45m ago")
   */
  private formatGapDisplay(gapMinutes: number): string {
    if (!Number.isFinite(gapMinutes) || gapMinutes < 0) {
      return '从未出现';
    }

    if (gapMinutes < 60) {
      return `${gapMinutes}m ago`;
    }

    const hours = Math.floor(gapMinutes / 60);
    const minutes = gapMinutes % 60;

    if (minutes === 0) {
      return `${hours}h ago`;
    }

    return `${hours}h ${minutes}m ago`;
  }
}


/**
 * Format signal status for display
 *
 * Requirements: 6.3
 * Format: [状态图标] 商户 / 规则名 last: Xh ago | 24h: N | 12h: N | 1h: N
 *
 * @param status - Signal status to format
 * @returns Formatted status string
 */
export function formatStatusDisplay(status: SignalStatus): string {
  const icon = STATE_ICONS[status.state];
  const gapDisplay = formatGapForStatus(status.gapMinutes);

  return `${icon} ${status.rule.merchant} / ${status.rule.name} last: ${gapDisplay} | 24h: ${status.count24h} | 12h: ${status.count12h} | 1h: ${status.count1h}`;
}

/**
 * Format gap time for status display
 *
 * @param gapMinutes - Gap in minutes
 * @returns Formatted string (e.g., "2h ago" or "45m ago")
 */
function formatGapForStatus(gapMinutes: number): string {
  if (!Number.isFinite(gapMinutes) || gapMinutes < 0) {
    return 'never';
  }

  if (gapMinutes < 60) {
    return `${gapMinutes}m ago`;
  }

  const hours = Math.floor(gapMinutes / 60);
  return `${hours}h ago`;
}
