/**
 * Admin Routes
 * Administrative endpoints for monitoring and observability
 * 
 * Requirements: 2.3, 4.1
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { getAsyncTaskProcessor } from '../services/async-task-processor.instance.js';
import { getRuleCache } from '../services/rule-cache.instance.js';
import { getPerformanceMetrics } from '../services/performance-metrics.js';

/**
 * Register admin routes
 */
export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/admin/async-queue/status
   * Get async task queue status
   * 
   * Returns queue size, processing status, total processed/failed counts
   * 
   * Requirement: 2.3
   */
  fastify.get('/async-queue/status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const processor = getAsyncTaskProcessor();
      const status = processor.getStatus();
      const config = processor.getConfig();

      return reply.send({
        status: 'ok',
        queue: {
          size: status.queueSize,
          processing: status.processing,
          maxSize: config.maxQueueSize,
        },
        stats: {
          totalProcessed: status.totalProcessed,
          totalFailed: status.totalFailed,
        },
        config: {
          batchSize: config.batchSize,
          flushIntervalMs: config.flushIntervalMs,
          maxRetries: config.maxRetries,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      request.log.error(error, 'Error fetching async queue status');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/admin/rule-cache/stats
   * Get rule cache statistics
   * 
   * Returns cache size, hit rate, hits/misses counts
   * 
   * Requirement: 4.1
   */
  fastify.get('/rule-cache/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const cache = getRuleCache();
      const stats = cache.getStats();
      const config = cache.getConfig();

      return reply.send({
        status: 'ok',
        cache: {
          size: stats.size,
          maxEntries: config.maxEntries,
        },
        stats: {
          hits: stats.hits,
          misses: stats.misses,
          hitRate: stats.hitRate,
          hitRatePercent: `${(stats.hitRate * 100).toFixed(2)}%`,
        },
        config: {
          ttlMs: config.ttlMs,
          ttlSeconds: config.ttlMs / 1000,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      request.log.error(error, 'Error fetching rule cache stats');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /api/admin/metrics
   * Get Phase 1 performance metrics
   * 
   * Returns average Phase 1 time, p95 Phase 1 time, requests per second
   * 
   * Requirement: 8.3
   */
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = getPerformanceMetrics();
      const summary = metrics.getSummary();
      const config = metrics.getConfig();

      return reply.send({
        status: 'ok',
        phase1: {
          averageMs: summary.averageDurationMs,
          p95Ms: summary.p95DurationMs,
          p99Ms: summary.p99DurationMs,
          minMs: summary.minDurationMs,
          maxMs: summary.maxDurationMs,
        },
        performance: {
          totalRequests: summary.totalRequests,
          slowRequestCount: summary.slowRequestCount,
          targetMetPercent: summary.targetMetPercent,
          requestsPerSecond: summary.requestsPerSecond,
        },
        config: {
          maxSamples: config.maxSamples,
          slowThresholdMs: config.slowThresholdMs,
          rpsWindowMs: config.rpsWindowMs,
          sampleCount: metrics.getSampleCount(),
        },
        timestamp: summary.timestamp,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching performance metrics');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
