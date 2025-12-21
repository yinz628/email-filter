/**
 * User Settings Routes
 * Endpoints for managing user settings
 * 
 * Requirements: 6.1, 6.2, 6.3
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { UserService } from '../services/user.service.js';
import { AuthService } from '../services/auth.service.js';
import { UserSettingsService } from '../services/user-settings.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

/**
 * Settings update request body
 */
interface SettingsBody {
  [key: string]: any;
}

/**
 * Register user settings routes
 */
export async function userSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize services
  const db = getDatabase();
  const userService = new UserService(db);
  const authService = new AuthService(userService, db, config.jwtSecret, config.jwtExpiry);
  const userSettingsService = new UserSettingsService(db);
  const authMiddleware = createAuthMiddleware(authService);

  // Apply auth middleware to all routes in this plugin
  fastify.addHook('preHandler', authMiddleware);

  /**
   * GET /api/user/settings
   * Get all settings for the current user
   * 
   * Requirements: 6.1, 6.4
   */
  fastify.get('/settings', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // For legacy auth, return empty settings (no user-specific settings)
      if (request.isLegacyAuth) {
        return reply.send({
          success: true,
          settings: {},
          isLegacyAuth: true,
        });
      }

      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: 'User not authenticated',
        });
      }

      // Requirement 6.1: Return all settings for that user
      // Requirement 6.4: Only return the authenticated user's settings
      const settings = userSettingsService.getAllSettings(request.user.userId);

      return reply.send({
        success: true,
        settings,
      });
    } catch (error) {
      request.log.error(error, 'Get settings error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/user/settings
   * Update settings for the current user
   * 
   * Requirements: 6.2, 6.3
   */
  fastify.put<{ Body: SettingsBody }>('/settings', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // For legacy auth, settings cannot be saved
      if (request.isLegacyAuth) {
        return reply.status(400).send({
          success: false,
          error: 'Settings cannot be saved with legacy authentication. Please use JWT authentication.',
        });
      }

      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: 'User not authenticated',
        });
      }

      const settings = request.body;

      if (!settings || typeof settings !== 'object') {
        return reply.status(400).send({
          success: false,
          error: 'Settings must be an object',
        });
      }

      // Requirement 6.2, 6.3: Save settings to the database (batch update)
      userSettingsService.setSettings(request.user.userId, settings);

      // Return updated settings
      const updatedSettings = userSettingsService.getAllSettings(request.user.userId);

      return reply.send({
        success: true,
        settings: updatedSettings,
      });
    } catch (error) {
      request.log.error(error, 'Update settings error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });
}
