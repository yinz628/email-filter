/**
 * Backup Routes
 * Database backup and restore endpoints for admin panel
 * 
 * Requirements: 1.1-1.5, 2.1-2.3, 3.1-3.6, 4.1-4.3, 5.1-5.3, 6.1-6.3
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'fs';
import { basename, join, dirname } from 'path';
import { authMiddleware, verifyBearerToken } from '../middleware/auth.js';
import { BackupService } from '../services/backup.service.js';
import { config } from '../config.js';
import { closeDatabase, initializeDatabase } from '../db/index.js';

// Backup directory path (relative to database path)
const backupDir = join(dirname(config.dbPath), 'backups');

// Create BackupService instance
const backupService = new BackupService(config.dbPath, backupDir);

/**
 * Register backup routes
 * All routes require JWT authentication via authMiddleware
 * 
 * Requirement: 6.1
 */
export async function backupRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/admin/backup/download/:filename
   * Download a specific backup file
   * This route has special auth handling to support token in query params for browser downloads
   * 
   * Requirements: 2.1, 2.2, 2.3
   */
  fastify.get<{ Params: { filename: string }; Querystring: { token?: string } }>(
    '/download/:filename',
    {
      // Skip the global preHandler hook for this route
      preHandler: async (request: FastifyRequest<{ Params: { filename: string }; Querystring: { token?: string } }>, reply: FastifyReply) => {
        // Support token from query params for browser downloads
        const queryToken = request.query.token;
        const authHeader = queryToken 
          ? `Bearer ${queryToken}` 
          : request.headers.authorization;
        
        // Verify authentication
        const authResult = verifyBearerToken(authHeader);
        if (!authResult.valid) {
          reply.status(401).send({
            success: false,
            error: authResult.error || 'Unauthorized',
          });
          return;
        }
      }
    },
    async (request: FastifyRequest<{ Params: { filename: string }; Querystring: { token?: string } }>, reply: FastifyReply) => {
      try {
        const { filename } = request.params;
        
        // Validate filename (prevent path traversal)
        const sanitizedFilename = basename(filename);
        if (sanitizedFilename !== filename || !filename.endsWith('.db.gz')) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid filename',
          });
        }
        
        const filePath = backupService.getBackupPath(sanitizedFilename);
        
        if (!filePath) {
          return reply.status(404).send({
            success: false,
            error: 'Backup file not found',
          });
        }
        
        // Set appropriate headers for file download
        // Requirement: 2.2
        reply.header('Content-Type', 'application/gzip');
        reply.header('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
        
        // Stream the file
        const stream = createReadStream(filePath);
        return reply.send(stream);
      } catch (error) {
        request.log.error(error, 'Error downloading backup');
        return reply.status(500).send({
          success: false,
          error: `Failed to download backup: ${error instanceof Error ? error.message : 'unknown error'}`,
        });
      }
    }
  );

  // Apply auth middleware to all other routes in this plugin
  // Requirement: 6.1
  fastify.addHook('preHandler', authMiddleware);

  /**
   * POST /api/admin/backup/create
   * Create a new backup of the database
   * 
   * Requirements: 1.1, 1.4
   */
  fastify.post('/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = backupService.createBackup();
      
      return reply.send({
        success: true,
        backup: {
          filename: result.filename,
          size: result.size,
          createdAt: result.createdAt,
          isPreRestore: false,
        },
        message: 'Backup created successfully',
      });
    } catch (error) {
      request.log.error(error, 'Error creating backup');
      return reply.status(500).send({
        success: false,
        error: `Failed to create backup: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  });

  /**
   * GET /api/admin/backup/list
   * List all available backups
   * 
   * Requirements: 4.1, 4.2, 4.3
   */
  fastify.get('/list', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = backupService.listBackups();
      
      return reply.send({
        success: true,
        backups: result.backups,
        totalCount: result.totalCount,
        totalSize: result.totalSize,
      });
    } catch (error) {
      request.log.error(error, 'Error listing backups');
      return reply.status(500).send({
        success: false,
        error: `Failed to list backups: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  });

  /**
   * POST /api/admin/backup/restore
   * Restore database from uploaded backup file
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
   */
  fastify.post('/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Get raw body as buffer
      const body = request.body as Buffer;
      
      if (!body || body.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No backup file provided',
        });
      }
      
      // Restore the backup with database callbacks
      const result = backupService.restoreBackup(
        body,
        () => closeDatabase(),
        () => initializeDatabase()
      );
      
      return reply.send({
        success: true,
        preRestoreBackup: result.preRestoreBackup,
        restoredFrom: result.restoredFrom,
        message: 'Database restored successfully',
      });
    } catch (error) {
      request.log.error(error, 'Error restoring backup');
      
      // Check if it's a validation error
      const errorMessage = error instanceof Error ? error.message : 'unknown error';
      const isValidationError = errorMessage.includes('Invalid backup file');
      
      return reply.status(isValidationError ? 400 : 500).send({
        success: false,
        error: errorMessage,
      });
    }
  });

  /**
   * DELETE /api/admin/backup/:filename
   * Delete a specific backup file
   * 
   * Requirements: 5.1, 5.2, 5.3
   */
  fastify.delete<{ Params: { filename: string } }>(
    '/:filename',
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      try {
        const { filename } = request.params;
        
        // Validate filename (prevent path traversal)
        const sanitizedFilename = basename(filename);
        if (sanitizedFilename !== filename || !filename.endsWith('.db.gz')) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid filename',
          });
        }
        
        const deleted = backupService.deleteBackup(sanitizedFilename);
        
        if (!deleted) {
          return reply.status(404).send({
            success: false,
            error: 'Backup file not found',
          });
        }
        
        return reply.send({
          success: true,
          deleted: sanitizedFilename,
          message: 'Backup deleted successfully',
        });
      } catch (error) {
        request.log.error(error, 'Error deleting backup');
        return reply.status(500).send({
          success: false,
          error: `Failed to delete backup: ${error instanceof Error ? error.message : 'unknown error'}`,
        });
      }
    }
  );
}
