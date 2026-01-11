/**
 * Performance Metrics Unit Tests
 * 
 * Tests for the PerformanceMetrics class.
 * Validates metric recording and p95 calculation.
 * 
 * Requirements: 8.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMetrics } from './performance-metrics.js';

describe('PerformanceMetrics', () => {
  let metrics: PerformanceMetrics;

  beforeEach(() => {
    metrics = new PerformanceMetrics({
      maxSamples: 100,
      slowThresholdMs: 100,
      rpsWindowMs: 60000,
    });
  });

  describe('recordPhase1Duration', () => {
    it('records duration and returns false for fast requests', () => {
      const isSlow = metrics.recordPhase1Duration(50);
      
      expect(isSlow).toBe(false);
      expect(metrics.getSampleCount()).toBe(1);
    });

    it('records duration and returns true for slow requests', () => {
      const isSlow = metrics.recordPhase1Duration(150);
      
      expect(isSlow).toBe(true);
      expect(metrics.getSampleCount()).toBe(1);
    });

    it('returns true for requests exactly at threshold', () => {
      // Threshold is 100ms, so 100ms should NOT be slow (> not >=)
      const isSlow = metrics.recordPhase1Duration(100);
      
      expect(isSlow).toBe(false);
    });

    it('returns true for requests just above threshold', () => {
      const isSlow = metrics.recordPhase1Duration(101);
      
      expect(isSlow).toBe(true);
    });

    it('maintains circular buffer at maxSamples', () => {
      const smallMetrics = new PerformanceMetrics({ maxSamples: 5 });
      
      // Add 10 samples
      for (let i = 0; i < 10; i++) {
        smallMetrics.recordPhase1Duration(i * 10);
      }
      
      // Should only keep last 5
      expect(smallMetrics.getSampleCount()).toBe(5);
    });

    it('tracks total requests correctly', () => {
      for (let i = 0; i < 10; i++) {
        metrics.recordPhase1Duration(50);
      }
      
      const summary = metrics.getSummary();
      expect(summary.totalRequests).toBe(10);
    });

    it('tracks slow request count correctly', () => {
      // 3 fast, 2 slow
      metrics.recordPhase1Duration(50);
      metrics.recordPhase1Duration(80);
      metrics.recordPhase1Duration(150);
      metrics.recordPhase1Duration(90);
      metrics.recordPhase1Duration(200);
      
      const summary = metrics.getSummary();
      expect(summary.slowRequestCount).toBe(2);
    });
  });

  describe('getPercentile', () => {
    it('returns 0 for empty metrics', () => {
      expect(metrics.getPercentile(95)).toBe(0);
    });

    it('returns correct p95 for single value', () => {
      metrics.recordPhase1Duration(50);
      
      expect(metrics.getPercentile(95)).toBe(50);
    });

    it('calculates p95 correctly for 100 values', () => {
      // Add values 1-100
      for (let i = 1; i <= 100; i++) {
        metrics.recordPhase1Duration(i);
      }
      
      // p95 should be 95 (95th value in sorted array)
      expect(metrics.getP95Duration()).toBe(95);
    });

    it('calculates p99 correctly for 100 values', () => {
      // Add values 1-100
      for (let i = 1; i <= 100; i++) {
        metrics.recordPhase1Duration(i);
      }
      
      // p99 should be 99
      expect(metrics.getP99Duration()).toBe(99);
    });

    it('calculates p50 (median) correctly', () => {
      // Add values 1-100
      for (let i = 1; i <= 100; i++) {
        metrics.recordPhase1Duration(i);
      }
      
      expect(metrics.getPercentile(50)).toBe(50);
    });

    it('handles unsorted input correctly', () => {
      // Add values in random order
      const values = [90, 10, 50, 30, 70, 20, 80, 40, 60, 100];
      for (const v of values) {
        metrics.recordPhase1Duration(v);
      }
      
      // p90 of [10,20,30,40,50,60,70,80,90,100] should be 90
      expect(metrics.getPercentile(90)).toBe(90);
    });

    it('handles duplicate values correctly', () => {
      // Add same value multiple times
      for (let i = 0; i < 10; i++) {
        metrics.recordPhase1Duration(50);
      }
      
      expect(metrics.getP95Duration()).toBe(50);
    });
  });

  describe('getAverageDuration', () => {
    it('returns 0 for empty metrics', () => {
      expect(metrics.getAverageDuration()).toBe(0);
    });

    it('calculates average correctly', () => {
      metrics.recordPhase1Duration(10);
      metrics.recordPhase1Duration(20);
      metrics.recordPhase1Duration(30);
      
      expect(metrics.getAverageDuration()).toBe(20);
    });

    it('handles single value', () => {
      metrics.recordPhase1Duration(42);
      
      expect(metrics.getAverageDuration()).toBe(42);
    });
  });

  describe('getMinDuration and getMaxDuration', () => {
    it('returns 0 for empty metrics', () => {
      expect(metrics.getMinDuration()).toBe(0);
      expect(metrics.getMaxDuration()).toBe(0);
    });

    it('returns correct min and max', () => {
      metrics.recordPhase1Duration(50);
      metrics.recordPhase1Duration(10);
      metrics.recordPhase1Duration(100);
      metrics.recordPhase1Duration(30);
      
      expect(metrics.getMinDuration()).toBe(10);
      expect(metrics.getMaxDuration()).toBe(100);
    });
  });

  describe('getRequestsPerSecond', () => {
    it('returns 0 for empty metrics', () => {
      expect(metrics.getRequestsPerSecond()).toBe(0);
    });

    it('calculates RPS based on window', () => {
      // Add 60 requests (should be ~1 RPS for 60s window)
      for (let i = 0; i < 60; i++) {
        metrics.recordPhase1Duration(50);
      }
      
      // All requests are within the window, so RPS = 60/60 = 1
      expect(metrics.getRequestsPerSecond()).toBe(1);
    });
  });

  describe('getSummary', () => {
    it('returns complete summary with all fields', () => {
      metrics.recordPhase1Duration(50);
      metrics.recordPhase1Duration(150);
      
      const summary = metrics.getSummary();
      
      expect(summary).toHaveProperty('totalRequests');
      expect(summary).toHaveProperty('averageDurationMs');
      expect(summary).toHaveProperty('p95DurationMs');
      expect(summary).toHaveProperty('p99DurationMs');
      expect(summary).toHaveProperty('minDurationMs');
      expect(summary).toHaveProperty('maxDurationMs');
      expect(summary).toHaveProperty('slowRequestCount');
      expect(summary).toHaveProperty('targetMetPercent');
      expect(summary).toHaveProperty('requestsPerSecond');
      expect(summary).toHaveProperty('timestamp');
    });

    it('calculates targetMetPercent correctly', () => {
      // 3 fast (<=100ms), 2 slow (>100ms)
      metrics.recordPhase1Duration(50);
      metrics.recordPhase1Duration(80);
      metrics.recordPhase1Duration(100); // exactly at threshold, not slow
      metrics.recordPhase1Duration(150);
      metrics.recordPhase1Duration(200);
      
      const summary = metrics.getSummary();
      // 3 out of 5 met target = 60%
      expect(summary.targetMetPercent).toBe(60);
    });

    it('returns 100% targetMetPercent for empty metrics', () => {
      const summary = metrics.getSummary();
      expect(summary.targetMetPercent).toBe(100);
    });
  });

  describe('reset', () => {
    it('clears all metrics', () => {
      metrics.recordPhase1Duration(50);
      metrics.recordPhase1Duration(150);
      
      metrics.reset();
      
      expect(metrics.getSampleCount()).toBe(0);
      const summary = metrics.getSummary();
      expect(summary.totalRequests).toBe(0);
      expect(summary.slowRequestCount).toBe(0);
    });
  });

  describe('getConfig', () => {
    it('returns current configuration', () => {
      const config = metrics.getConfig();
      
      expect(config.maxSamples).toBe(100);
      expect(config.slowThresholdMs).toBe(100);
      expect(config.rpsWindowMs).toBe(60000);
    });

    it('uses default config when not specified', () => {
      const defaultMetrics = new PerformanceMetrics();
      const config = defaultMetrics.getConfig();
      
      expect(config.maxSamples).toBe(1000);
      expect(config.slowThresholdMs).toBe(100);
      expect(config.rpsWindowMs).toBe(60000);
    });
  });
});
