import type { Database } from 'better-sqlite3';
import type {
  RatioMonitor,
  CreateRatioMonitorDTO,
  UpdateRatioMonitorDTO,
  RatioStatus,
  RatioState,
  FunnelStepStatus,
} from '@email-filter/shared';
import { calculateRatio, calculateRatioState } from '@email-filter/shared';
import { RatioMonitorRepository } from '../../db/ratio-monitor-repository.js';
import { MonitoringRuleRepository } from '../../db/monitoring-rule-repository.js';
import { SignalStateRepository } from '../../db/signal-state-repository.js';
import {
  RatioAlertRepository,
  type RatioAlertType,
  type RatioAlert,
} from '../../db/ratio-alert-repository.js';

/**
 * Service for ratio monitoring operations
 */
export class RatioMonitorService {
  private ratioRepo: RatioMonitorRepository;
  private ruleRepo: MonitoringRuleRepository;
  private stateRepo: SignalStateRepository;
  private ratioAlertRepo: RatioAlertRepository;

  constructor(db: Database) {
    this.ratioRepo = new RatioMonitorRepository(db);
    this.ruleRepo = new MonitoringRuleRepository(db);
    this.stateRepo = new SignalStateRepository(db);
    this.ratioAlertRepo = new RatioAlertRepository(db);
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

    const monitor = this.ratioRepo.create(dto);

    // Set initial state based on current ratio (without triggering alert)
    if (monitor.enabled) {
      this.initializeMonitorState(monitor);
    }

    return monitor;
  }

  /**
   * Initialize monitor state without triggering alerts
   * This sets the correct initial state based on current data
   */
  private initializeMonitorState(monitor: RatioMonitor): void {
    const firstStatus = this.stateRepo.getByRuleId(monitor.firstRuleId);
    const secondStatus = this.stateRepo.getByRuleId(monitor.secondRuleId);

    const firstCount = this.getCountByTimeWindow(firstStatus, monitor.timeWindow);
    const secondCount = this.getCountByTimeWindow(secondStatus, monitor.timeWindow);
    const currentRatio = calculateRatio(firstCount, secondCount);

    // Collect additional steps data
    const stepsData: { ruleId: string; count: number }[] = [];
    let overallState: RatioState = calculateRatioState(currentRatio, monitor.thresholdPercent);

    for (const step of monitor.steps || []) {
      const stepStatus = this.stateRepo.getByRuleId(step.ruleId);
      const stepCount = this.getCountByTimeWindow(stepStatus, monitor.timeWindow);
      stepsData.push({ ruleId: step.ruleId, count: stepCount });

      const stepRatio = calculateRatio(firstCount, stepCount);
      const stepState = calculateRatioState(stepRatio, step.thresholdPercent);
      if (stepState === 'LOW') {
        overallState = 'LOW';
      }
    }

    // Update state without creating alert (initial state)
    this.ratioRepo.updateState(
      monitor.id,
      overallState,
      firstCount,
      secondCount,
      currentRatio,
      JSON.stringify(stepsData)
    );
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

    // Build funnel steps status
    const funnelSteps: FunnelStepStatus[] = [];
    const firstCount = state?.firstCount || 0;
    const secondCount = state?.secondCount || 0;

    // Step 1 (first rule)
    funnelSteps.push({
      order: 1,
      ruleId: monitor.firstRuleId,
      ruleName: firstRule?.name || 'Unknown',
      count: firstCount,
      ratioToFirst: 100,
      ratioToPrevious: 100,
      state: 'HEALTHY',
    });

    // Step 2 (second rule)
    const step2Ratio = calculateRatio(firstCount, secondCount);
    funnelSteps.push({
      order: 2,
      ruleId: monitor.secondRuleId,
      ruleName: secondRule?.name || 'Unknown',
      count: secondCount,
      ratioToFirst: step2Ratio,
      ratioToPrevious: step2Ratio,
      state: calculateRatioState(step2Ratio, monitor.thresholdPercent),
    });

    // Additional steps (step 3+)
    let stepsData: { ruleId: string; count: number }[] = [];
    try {
      stepsData = JSON.parse(state?.stepsData || '[]');
    } catch {
      stepsData = [];
    }

    let prevCount = secondCount;
    for (const step of monitor.steps || []) {
      const stepRule = this.ruleRepo.getById(step.ruleId);
      const stepData = stepsData.find((s) => s.ruleId === step.ruleId);
      const stepCount = stepData?.count || 0;
      const ratioToFirst = calculateRatio(firstCount, stepCount);
      const ratioToPrevious = calculateRatio(prevCount, stepCount);

      funnelSteps.push({
        order: step.order,
        ruleId: step.ruleId,
        ruleName: stepRule?.name || 'Unknown',
        count: stepCount,
        ratioToFirst,
        ratioToPrevious,
        state: calculateRatioState(ratioToPrevious, step.thresholdPercent),
      });

      prevCount = stepCount;
    }

    return {
      monitorId: monitor.id,
      monitor,
      state: (state?.state as RatioState) || 'HEALTHY',
      firstRuleName: firstRule?.name || 'Unknown',
      secondRuleName: secondRule?.name || 'Unknown',
      firstCount,
      secondCount,
      currentRatio: state?.currentRatio || 0,
      funnelSteps,
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

    // Calculate ratio for step 1->2
    const currentRatio = calculateRatio(firstCount, secondCount);

    // Collect additional steps data
    const stepsData: { ruleId: string; count: number }[] = [];
    let overallState: RatioState = calculateRatioState(currentRatio, monitor.thresholdPercent);

    // Check additional steps
    for (const step of monitor.steps || []) {
      const stepStatus = this.stateRepo.getByRuleId(step.ruleId);
      const stepCount = this.getCountByTimeWindow(stepStatus, monitor.timeWindow);
      stepsData.push({ ruleId: step.ruleId, count: stepCount });

      // Calculate ratio to first step
      const stepRatio = calculateRatio(firstCount, stepCount);
      const stepState = calculateRatioState(stepRatio, step.thresholdPercent);

      // If any step is LOW, overall state is LOW
      if (stepState === 'LOW') {
        overallState = 'LOW';
      }
    }

    // Get previous state
    const previousStateRecord = this.ratioRepo.getState(monitor.id);
    const previousState: RatioState = (previousStateRecord?.state as RatioState) || 'HEALTHY';

    // Update state with steps data
    this.ratioRepo.updateState(
      monitor.id,
      overallState,
      firstCount,
      secondCount,
      currentRatio,
      JSON.stringify(stepsData)
    );

    // Check if alert should be triggered
    if (previousState !== overallState) {
      const alertType: RatioAlertType = overallState === 'LOW' ? 'RATIO_LOW' : 'RATIO_RECOVERED';
      const message = this.buildAlertMessage(monitor, alertType, firstCount, secondCount, currentRatio);

      this.ratioAlertRepo.create({
        monitorId: monitor.id,
        alertType,
        previousState,
        currentState: overallState,
        firstCount,
        secondCount,
        currentRatio,
        message,
      });
      return true;
    }

    return false;
  }

  /**
   * Get ratio alerts
   */
  getAlerts(limit?: number): RatioAlert[] {
    return this.ratioAlertRepo.getAll(limit);
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
    alertType: RatioAlertType,
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
