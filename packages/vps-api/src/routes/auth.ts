/**
 * Auth Routes
 * Authentication endpoints for login, logout, and current user info
 * 
 * Requirements: 2.1, 2.7, 3.4
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { UserService } from '../services/user.service.js';
import { AuthService } from '../services/auth.service.js';
import { createAuthMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

/**
 * Login request body
 */
interface LoginBody {
  username: string;
  password: string;
}

/**
 * Register auth routes
 */
export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize services
  const db = getDatabase();
  const userService = new UserService(db);
  const authService = new AuthService(userService, db, config.jwtSecret, config.jwtExpiry);
  const authMiddleware = createAuthMiddleware(authService);

  /**
   * POST /api/auth/login
   * User login endpoint
   * 
   * Requirements: 2.1, 2.2, 2.3, 2.6, 2.7
   */
  fastify.post<{ Body: LoginBody }>('/login', async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    try {
      const { username, password } = request.body;

      // Validate input
      if (!username || !password) {
        return reply.status(400).send({
          success: false,
          error: 'Username and password are required',
        });
      }

      // Attempt login
      const result = await authService.login(username, password);

      if (!result.success) {
        // Requirement 2.6: Return 401 with error message
        return reply.status(401).send({
          success: false,
          error: result.error || 'Invalid username or password',
        });
      }

      // Requirement 2.7: Return JWT token to client
      return reply.send({
        success: true,
        token: result.token,
        user: result.user,
      });
    } catch (error) {
      request.log.error(error, 'Login error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/auth/logout
   * User logout endpoint
   * 
   * Requirements: 3.1, 3.2, 3.4
   */
  fastify.post('/logout', {
    preHandler: authMiddleware,
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        // Requirement 3.1: Invalidate the current JWT token
        authService.logout(token);
      }

      // Requirement 3.4: Return success response
      return reply.send({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      request.log.error(error, 'Logout error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * GET /api/auth/me
   * Get current user information
   * 
   * Requirements: 2.7 (extended)
   */
  fastify.get('/me', {
    preHandler: authMiddleware,
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // For legacy auth, return minimal info
      if (request.isLegacyAuth) {
        return reply.send({
          success: true,
          user: {
            id: 'legacy',
            username: 'api-token-user',
            role: 'admin',
          },
          isLegacyAuth: true,
        });
      }

      // For JWT auth, return user info from token
      if (request.user) {
        const user = userService.findById(request.user.userId);
        if (user) {
          return reply.send({
            success: true,
            user: {
              id: user.id,
              username: user.username,
              role: user.role,
              createdAt: user.createdAt,
              updatedAt: user.updatedAt,
            },
          });
        }
      }

      return reply.status(401).send({
        success: false,
        error: 'User not found',
      });
    } catch (error) {
      request.log.error(error, 'Get current user error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });
}
