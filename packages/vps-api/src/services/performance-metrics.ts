/**
 * Performance Metrics Service
 * 
 * Collects and reports performance metrics for API operations.
 * Focuses on Phase 1 processing time tracking and p95 calculations.
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

export interface MetricsSummary {
  /** Total number of requests recorded */
  totalRequests: number;
  /** Average Phase 1 duration in milliseconds */
  averageDurationMs: number;
  /** 95th percentile Phase 1 duration in milliseconds */
  p95DurationMs: number;
  /** 99th percentile Phase 1 duration in milliseconds */
  p99DurationMs: number;
  /** Minimum Phase 1 duration in milliseconds */
  minDurationMs: number;
  /** Maximum Phase 1 duration in milliseconds */
  maxDurationMs: number;
  /** Number of requests exceeding 100ms threshold */
  slowRequestCount: number;
  /** Percentage of requests meeting the 100ms target */
  targetMetPercent: number;
  /** Requests per second (based on last minute) */
  requestsPerSecond: number;
  /** Timestamp of the metrics snapshot */
  timestamp: string;
}

export interface PerformanceMetricsConfig {
  /** Maximum number of duration samples to keep (default: 1000) */
  maxSamples?: number;
  /** Threshold in ms for slow request warnings (default: 100) */
  slowThresholdMs?: number;
  /** Window size in ms for requests per second calculation (default: 60000) */
  rpsWindowMs?: number;
}

const DEFAULT_CONFIG: Required<PerformanceMetricsConfig> = {
  maxSamples: 1000,
  slowThresholdMs: 100,
  rpsWindowMs: 60000,
};

/**
 * Performance Metrics Collector
 * 
 * Tracks Phase 1 processing times and provides statistical analysis.
 * Uses a circular buffer to maintain memory efficiency.
 */
export class PerformanceMetrics {
  private durations: number[] = [];
  private timestamps: number[] = [];
  private totalRequests = 0;
  private slowRequestCount = 0;
  private config: Required<PerformanceMetricsConfig>;

  constructor(config: PerformanceMetricsConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a Phase 1 duration
   * 
   * @param durationMs - The Phase 1 processing time in milliseconds
   * @returns true if the duration exceeded the slow threshold
   * 
   * Requirement: 8.1
   */
  recordPhase1Duration(durationMs: number): boolean {
    const now = Date.now();
    this.totalRequests++;

    // Add to circular buffer
    if (this.durations.length >= this.config.maxSamples) {
      this.durations.shift();
      this.timestamps.shift();
    }
    this.durations.push(durationMs);
    this.timestamps.push(now);

    // Track slow requests
    const isSlow = durationMs > this.config.slowThresholdMs;
    if (isSlow) {
      this.slowRequestCount++;
    }

    return isSlow;
  }

  /**
   * Calculate the p-th percentile of recorded durations
   * 
   * @param p - Percentile value (0-100)
   * @returns The p-th percentile duration in milliseconds
   * 
   * Requirement: 8.3
   */
  getPercentile(p: number): number {
    if (this.durations.length === 0) {
      return 0;
    }

    // Sort a copy of durations
    const sorted = [...this.durations].sort((a, b) => a - b);
    
    // Calculate percentile index
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    const clampedIndex = Math.max(0, Math.min(index, sorted.length - 1));
    
    return sorted[clampedIndex];
  }

  /**
   * Get the 95th percentile duration
   * 
   * Requirement: 8.3
   */
  getP95Duration(): number {
    return this.getPercentile(95);
  }

  /**
   * Get the 99th percentile duration
   */
  getP99Duration(): number {
    return this.getPercentile(99);
  }

  /**
   * Calculate average duration
   */
  getAverageDuration(): number {
    if (this.durations.length === 0) {
      return 0;
    }
    const sum = this.durations.reduce((acc, d) => acc + d, 0);
    return sum / this.durations.length;
  }

  /**
   * Get minimum duration
   */
  getMinDuration(): number {
    if (this.durations.length === 0) {
      return 0;
    }
    return Math.min(...this.durations);
  }

  /**
   * Get maximum duration
   */
  getMaxDuration(): number {
    if (this.durations.length === 0) {
      return 0;
    }
    return Math.max(...this.durations);
  }

  /**
   * Calculate requests per second based on recent window
   * 
   * Requirement: 8.3
   */
  getRequestsPerSecond(): number {
    const now = Date.now();
    const windowStart = now - this.config.rpsWindowMs;
    
    // Count requests within the window
    const recentCount = this.timestamps.filter(t => t >= windowStart).length;
    
    // Convert to requests per second
    return recentCount / (this.config.rpsWindowMs / 1000);
  }

  /**
   * Get comprehensive metrics summary
   * 
   * Requirement: 8.3
   */
  getSummary(): MetricsSummary {
    const sampleCount = this.durations.length;
    const targetMetCount = this.durations.filter(d => d <= this.config.slowThresholdMs).length;
    
    return {
      totalRequests: this.totalRequests,
      averageDurationMs: Math.round(this.getAverageDuration() * 100) / 100,
      p95DurationMs: this.getP95Duration(),
      p99DurationMs: this.getP99Duration(),
      minDurationMs: this.getMinDuration(),
      maxDurationMs: this.getMaxDuration(),
      slowRequestCount: this.slowRequestCount,
      targetMetPercent: sampleCount > 0 
        ? Math.round((targetMetCount / sampleCount) * 10000) / 100 
        : 100,
      requestsPerSecond: Math.round(this.getRequestsPerSecond() * 100) / 100,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): Required<PerformanceMetricsConfig> {
    return { ...this.config };
  }

  /**
   * Get the number of samples currently stored
   */
  getSampleCount(): number {
    return this.durations.length;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.durations = [];
    this.timestamps = [];
    this.totalRequests = 0;
    this.slowRequestCount = 0;
  }
}

// Singleton instance
let metricsInstance: PerformanceMetrics | null = null;

/**
 * Get the global performance metrics instance
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  if (!metricsInstance) {
    metricsInstance = new PerformanceMetrics();
  }
  return metricsInstance;
}

/**
 * Initialize performance metrics with custom config
 */
export function initializePerformanceMetrics(config: PerformanceMetricsConfig): PerformanceMetrics {
  metricsInstance = new PerformanceMetrics(config);
  return metricsInstance;
}
