/**
 * Cleanup Settings Routes
 * Endpoints for managing data cleanup configuration and execution
 * 
 * Requirements: 1.1, 1.2, 1.4, 5.1, 6.1
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { CleanupConfigService, type CleanupConfig } from '../services/cleanup-config.service.js';
import { CleanupStatsService } from '../services/cleanup-stats.service.js';
import { CleanupService } from '../services/monitoring/cleanup.service.js';
import { getScheduler } from '../index.js';

/**
 * Request body for updating cleanup configuration
 */
interface UpdateConfigBody {
  systemLogsRetentionDays?: number;
  hitLogsRetentionHours?: number;
  alertsRetentionDays?: number;
  heartbeatLogsRetentionDays?: number;
  subjectTrackerRetentionHours?: number;
  cleanupHour?: number;
  autoCleanupEnabled?: boolean;
}

/**
 * Register cleanup settings routes
 */
export async function cleanupSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize services
  const db = getDatabase();
  const configService = new CleanupConfigService(db);
  const statsService = new CleanupStatsService(db);
  const cleanupService = new CleanupService(db);

  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/admin/cleanup/config
   * Get cleanup configuration
   * 
   * Returns current cleanup settings with defaults applied
   * 
   * Requirements: 1.1, 1.2
   */
  fastify.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = configService.getConfig();

      return reply.send({
        success: true,
        config,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching cleanup config');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch cleanup configuration',
      });
    }
  });

  /**
   * PUT /api/admin/cleanup/config
   * Update cleanup configuration
   * 
   * Validates input values and persists to database
   * Triggers scheduler reload to apply changes without restart
   * 
   * Requirements: 1.3, 1.4, 4.2
   */
  fastify.put<{ Body: UpdateConfigBody }>('/config', async (request: FastifyRequest<{ Body: UpdateConfigBody }>, reply: FastifyReply) => {
    try {
      const updates = request.body;

      if (!updates || typeof updates !== 'object') {
        return reply.status(400).send({
          success: false,
          error: 'Request body must be an object',
        });
      }

      // Validate configuration
      const validation = CleanupConfigService.validateConfig(updates);
      if (!validation.valid) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid configuration',
          details: validation.errors,
        });
      }

      // Update configuration
      const updatedConfig = configService.updateConfig(updates);

      // Trigger scheduler reload to apply changes without restart
      // Requirement: 4.2 (data-cleanup-settings)
      const scheduler = getScheduler();
      if (scheduler) {
        scheduler.reloadConfig();
        request.log.info('Scheduler configuration reloaded');
      }

      return reply.send({
        success: true,
        config: updatedConfig,
        message: 'Configuration updated successfully',
      });
    } catch (error) {
      request.log.error(error, 'Error updating cleanup config');
      return reply.status(500).send({
        success: false,
        error: 'Failed to update cleanup configuration',
      });
    }
  });

  /**
   * GET /api/admin/cleanup/stats
   * Get storage statistics
   * 
   * Returns record counts and date ranges for all cleanable tables
   * 
   * Requirements: 6.1, 6.2
   */
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = statsService.getStats();

      return reply.send({
        success: true,
        stats,
      });
    } catch (error) {
      request.log.error(error, 'Error fetching cleanup stats');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch storage statistics',
      });
    }
  });

  /**
   * POST /api/admin/cleanup/run
   * Execute manual cleanup
   * 
   * Runs cleanup for all tables using current configuration
   * 
   * Requirements: 5.1, 5.3
   */
  fastify.post('/run', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get current configuration
      const config = configService.getConfig();

      // Execute cleanup with configuration
      const result = cleanupService.runFullCleanupWithConfig(config);

      // Store last cleanup info
      const now = new Date().toISOString();
      configService.updateConfig({} as Partial<CleanupConfig>); // Trigger timestamp update
      
      // Store cleanup result in cleanup_config table
      try {
        const updateStmt = db.prepare(`
          INSERT INTO cleanup_config (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);
        updateStmt.run('last_cleanup_at', now, now);
        updateStmt.run('last_cleanup_result', JSON.stringify(result), now);
      } catch (e) {
        request.log.warn(e, 'Failed to store cleanup result');
      }

      return reply.send({
        success: true,
        result: {
          systemLogs: {
            deletedCount: result.systemLogs.deletedCount,
            cutoffDate: result.systemLogs.cutoffDate.toISOString(),
          },
          hitLogs: {
            deletedCount: result.hitLogs.deletedCount,
            cutoffDate: result.hitLogs.cutoffDate.toISOString(),
          },
          alerts: {
            deletedCount: result.alerts.deletedCount,
            cutoffDate: result.alerts.cutoffDate.toISOString(),
          },
          heartbeatLogs: {
            deletedCount: result.heartbeatLogs.deletedCount,
            cutoffDate: result.heartbeatLogs.cutoffDate.toISOString(),
          },
          subjectTracker: {
            deletedCount: result.subjectTracker.deletedCount,
            cutoffDate: result.subjectTracker.cutoffDate.toISOString(),
          },
          totalDeleted: result.totalDeleted,
          durationMs: result.durationMs,
          executedAt: result.executedAt.toISOString(),
        },
        message: `Cleanup completed. ${result.totalDeleted} records deleted in ${result.durationMs}ms.`,
      });
    } catch (error) {
      request.log.error(error, 'Error executing cleanup');
      return reply.status(500).send({
        success: false,
        error: 'Failed to execute cleanup',
      });
    }
  });

  /**
   * POST /api/admin/cleanup/vacuum
   * Execute database VACUUM to reclaim disk space
   * 
   * SQLite doesn't automatically release disk space after deleting data.
   * VACUUM rebuilds the database file, reclaiming unused space.
   * 
   * Note: This operation may take a while for large databases and
   * temporarily requires additional disk space equal to the database size.
   */
  fastify.post('/vacuum', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const startTime = Date.now();
      
      // Get database file size before VACUUM
      const beforeSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number };
      
      // Execute VACUUM
      db.exec('VACUUM');
      
      // Execute ANALYZE to update statistics
      db.exec('ANALYZE');
      
      // Get database file size after VACUUM
      const afterSize = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number };
      
      const durationMs = Date.now() - startTime;
      const savedBytes = beforeSize.size - afterSize.size;

      return reply.send({
        success: true,
        result: {
          beforeSize: beforeSize.size,
          afterSize: afterSize.size,
          savedBytes,
          savedMB: (savedBytes / 1024 / 1024).toFixed(2),
          durationMs,
        },
        message: `Database optimized. Saved ${(savedBytes / 1024 / 1024).toFixed(2)} MB in ${durationMs}ms.`,
      });
    } catch (error) {
      request.log.error(error, 'Error executing VACUUM');
      return reply.status(500).send({
        success: false,
        error: 'Failed to optimize database',
      });
    }
  });
}
