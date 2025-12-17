import type { Database } from 'better-sqlite3';
import type {
  RatioMonitor,
  CreateRatioMonitorDTO,
  UpdateRatioMonitorDTO,
  RatioStatus,
  RatioState,
  AlertType,
  CreateAlertDTO,
} from '@email-filter/shared';
import { calculateRatio, calculateRatioState } from '@email-filter/shared';
import { RatioMonitorRepository } from '../../db/ratio-monitor-repository.js';
import { MonitoringRuleRepository } from '../../db/monitoring-rule-repository.js';
import { SignalStateRepository } from '../../db/signal-state-repository.js';
import { AlertRepository } from '../../db/alert-repository.js';

/**
 * Service for ratio monitoring operations
 */
export class RatioMonitorService {
  private ratioRepo: RatioMonitorRepository;
  private ruleRepo: MonitoringRuleRepository;
  private stateRepo: SignalStateRepository;
  private alertRepo: AlertRepository;

  constructor(db: Database) {
    this.ratioRepo = new RatioMonitorRepository(db);
    this.ruleRepo = new MonitoringRuleRepository(db);
    this.stateRepo = new SignalStateRepository(db);
    this.alertRepo = new AlertRepository(db);
  }

  /**
   * Create a new ratio monitor
   */
  create(dto: CreateRatioMonitorDTO): RatioMonitor {
    // Validate that both rules exist
    const firstRule = this.ruleRepo.getById(dto.firstRuleId);
    const secondRule = this.ruleRepo.getById(dto.secondRuleId);

    if (!firstRule) {
      throw new Error(`First rule not found: ${dto.firstRuleId}`);
    }
    if (!secondRule) {
      throw new Error(`Second rule not found: ${dto.secondRuleId}`);
    }

    return this.ratioRepo.create(dto);
  }

  /**
   * Get ratio monitor by ID
   */
  getById(id: string): RatioMonitor | null {
    return this.ratioRepo.getById(id);
  }


  /**
   * Get all ratio monitors
   */
  getAll(filter?: { tag?: string; enabled?: boolean }): RatioMonitor[] {
    return this.ratioRepo.getAll(filter);
  }

  /**
   * Update a ratio monitor
   */
  update(id: string, dto: UpdateRatioMonitorDTO): RatioMonitor | null {
    // Validate rules if being updated
    if (dto.firstRuleId) {
      const firstRule = this.ruleRepo.getById(dto.firstRuleId);
      if (!firstRule) {
        throw new Error(`First rule not found: ${dto.firstRuleId}`);
      }
    }
    if (dto.secondRuleId) {
      const secondRule = this.ruleRepo.getById(dto.secondRuleId);
      if (!secondRule) {
        throw new Error(`Second rule not found: ${dto.secondRuleId}`);
      }
    }

    return this.ratioRepo.update(id, dto);
  }

  /**
   * Delete a ratio monitor
   */
  delete(id: string): boolean {
    return this.ratioRepo.delete(id);
  }

  /**
   * Get current status of all ratio monitors
   */
  getAllStatus(filter?: { tag?: string; enabled?: boolean }): RatioStatus[] {
    const monitors = this.ratioRepo.getAll(filter);
    return monitors.map((monitor) => this.getStatus(monitor));
  }

  /**
   * Get status for a single ratio monitor
   */
  getStatus(monitor: RatioMonitor): RatioStatus {
    const state = this.ratioRepo.getState(monitor.id);
    const firstRule = this.ruleRepo.getById(monitor.firstRuleId);
    const secondRule = this.ruleRepo.getById(monitor.secondRuleId);

    return {
      monitorId: monitor.id,
      monitor,
      state: (state?.state as RatioState) || 'HEALTHY',
      firstRuleName: firstRule?.name || 'Unknown',
      secondRuleName: secondRule?.name || 'Unknown',
      firstCount: state?.firstCount || 0,
      secondCount: state?.secondCount || 0,
      currentRatio: state?.currentRatio || 0,
      updatedAt: state ? new Date(state.updatedAt) : new Date(),
    };
  }

  /**
   * Check all ratio monitors and update states
   * Returns number of alerts triggered
   */
  checkAll(): { monitorsChecked: number; alertsTriggered: number } {
    const monitors = this.ratioRepo.getAll({ enabled: true });
    let alertsTriggered = 0;

    for (const monitor of monitors) {
      const alertTriggered = this.checkMonitor(monitor);
      if (alertTriggered) {
        alertsTriggered++;
      }
    }

    return { monitorsChecked: monitors.length, alertsTriggered };
  }

  /**
   * Check a single ratio monitor and update state
   * Returns true if an alert was triggered
   */
  private checkMonitor(monitor: RatioMonitor): boolean {
    // Get counts from signal states based on time window
    const firstStatus = this.stateRepo.getByRuleId(monitor.firstRuleId);
    const secondStatus = this.stateRepo.getByRuleId(monitor.secondRuleId);

    // Get counts based on time window
    const firstCount = this.getCountByTimeWindow(firstStatus, monitor.timeWindow);
    const secondCount = this.getCountByTimeWindow(secondStatus, monitor.timeWindow);

    // Calculate ratio
    const currentRatio = calculateRatio(firstCount, secondCount);
    const newState = calculateRatioState(currentRatio, monitor.thresholdPercent);

    // Get previous state
    const previousStateRecord = this.ratioRepo.getState(monitor.id);
    const previousState: RatioState = (previousStateRecord?.state as RatioState) || 'HEALTHY';

    // Update state
    this.ratioRepo.updateState(monitor.id, newState, firstCount, secondCount, currentRatio);

    // Check if alert should be triggered
    if (previousState !== newState) {
      const alertType: AlertType = newState === 'LOW' ? 'RATIO_LOW' : 'RATIO_RECOVERED';
      const message = this.buildAlertMessage(monitor, alertType, firstCount, secondCount, currentRatio);

      const alertDto: CreateAlertDTO = {
        ruleId: monitor.id, // Using monitor ID as rule ID for ratio alerts
        alertType,
        previousState: previousState === 'HEALTHY' ? 'ACTIVE' : 'WEAK',
        currentState: newState === 'HEALTHY' ? 'ACTIVE' : 'WEAK',
        gapMinutes: 0,
        count1h: firstCount,
        count12h: secondCount,
        count24h: Math.round(currentRatio),
        message,
      };

      this.alertRepo.create(alertDto);
      return true;
    }

    return false;
  }

  private getCountByTimeWindow(
    status: { count1h: number; count12h: number; count24h: number } | null,
    timeWindow: string
  ): number {
    if (!status) return 0;
    switch (timeWindow) {
      case '1h':
        return status.count1h;
      case '12h':
        return status.count12h;
      case '24h':
      default:
        return status.count24h;
    }
  }

  private buildAlertMessage(
    monitor: RatioMonitor,
    alertType: AlertType,
    firstCount: number,
    secondCount: number,
    currentRatio: number
  ): string {
    if (alertType === 'RATIO_LOW') {
      return `[比例告警] ${monitor.name}: 比例 ${currentRatio.toFixed(1)}% 低于阈值 ${monitor.thresholdPercent}% (${secondCount}/${firstCount})`;
    } else {
      return `[比例恢复] ${monitor.name}: 比例 ${currentRatio.toFixed(1)}% 已恢复到阈值 ${monitor.thresholdPercent}% 以上 (${secondCount}/${firstCount})`;
    }
  }

  /**
   * Get all unique tags
   */
  getAllTags(): string[] {
    return this.ratioRepo.getAllTags();
  }
}
