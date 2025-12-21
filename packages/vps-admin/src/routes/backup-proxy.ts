/**
 * Backup Proxy Routes
 * Proxies backup API requests to vps-api service
 * 
 * Requirements: 2.1, 3.1, 4.2, 5.2
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';

/**
 * Get VPS API URL from config
 */
function getVpsApiUrl(): string {
  return config.vpsApiUrl || 'http://localhost:3000';
}

/**
 * Get API token from config
 */
function getApiToken(): string {
  return config.apiToken || '';
}

/**
 * Register backup proxy routes
 * All routes proxy to vps-api backup endpoints
 */
export async function backupProxyRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/backup/list
   * Proxy to list all backups
   */
  fastify.get('/list', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response = await fetch(`${getVpsApiUrl()}/api/admin/backup/list`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getApiToken()}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      return reply.status(response.status).send(data);
    } catch (error) {
      request.log.error(error, 'Error proxying backup list request');
      return reply.status(500).send({
        success: false,
        error: 'Failed to connect to backup service',
      });
    }
  });

  /**
   * POST /api/backup/create
   * Proxy to create a new backup
   */
  fastify.post('/create', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const response = await fetch(`${getVpsApiUrl()}/api/admin/backup/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiToken()}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      return reply.status(response.status).send(data);
    } catch (error) {
      request.log.error(error, 'Error proxying backup create request');
      return reply.status(500).send({
        success: false,
        error: 'Failed to connect to backup service',
      });
    }
  });

  /**
   * GET /api/backup/download/:filename
   * Proxy to download a backup file
   */
  fastify.get<{ Params: { filename: string } }>(
    '/download/:filename',
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      try {
        const { filename } = request.params;
        
        const response = await fetch(
          `${getVpsApiUrl()}/api/admin/backup/download/${encodeURIComponent(filename)}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${getApiToken()}`,
            },
          }
        );

        if (!response.ok) {
          const data = await response.json();
          return reply.status(response.status).send(data);
        }

        // Forward headers for file download
        reply.header('Content-Type', response.headers.get('Content-Type') || 'application/gzip');
        reply.header('Content-Disposition', response.headers.get('Content-Disposition') || `attachment; filename="${filename}"`);

        // Stream the response body
        const buffer = await response.arrayBuffer();
        return reply.send(Buffer.from(buffer));
      } catch (error) {
        request.log.error(error, 'Error proxying backup download request');
        return reply.status(500).send({
          success: false,
          error: 'Failed to connect to backup service',
        });
      }
    }
  );

  /**
   * POST /api/backup/restore
   * Proxy to restore from uploaded backup file
   */
  fastify.post('/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as Buffer;

      const response = await fetch(`${getVpsApiUrl()}/api/admin/backup/restore`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getApiToken()}`,
          'Content-Type': 'application/octet-stream',
        },
        body: body,
      });

      const data = await response.json();
      return reply.status(response.status).send(data);
    } catch (error) {
      request.log.error(error, 'Error proxying backup restore request');
      return reply.status(500).send({
        success: false,
        error: 'Failed to connect to backup service',
      });
    }
  });

  /**
   * DELETE /api/backup/:filename
   * Proxy to delete a backup file
   */
  fastify.delete<{ Params: { filename: string } }>(
    '/:filename',
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      try {
        const { filename } = request.params;

        const response = await fetch(
          `${getVpsApiUrl()}/api/admin/backup/${encodeURIComponent(filename)}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${getApiToken()}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();
        return reply.status(response.status).send(data);
      } catch (error) {
        request.log.error(error, 'Error proxying backup delete request');
        return reply.status(500).send({
          success: false,
          error: 'Failed to connect to backup service',
        });
      }
    }
  );
}
