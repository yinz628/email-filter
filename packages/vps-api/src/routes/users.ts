/**
 * User Management Routes (Admin Only)
 * Endpoints for managing users
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { UserService, type CreateUserDTO, type UpdateUserDTO } from '../services/user.service.js';
import { AuthService } from '../services/auth.service.js';
import { UserSettingsService } from '../services/user-settings.service.js';
import { createAdminMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

/**
 * Create user request body
 */
interface CreateUserBody {
  username: string;
  password: string;
  role?: 'admin' | 'user';
}

/**
 * Update user request body
 */
interface UpdateUserBody {
  password?: string;
  role?: 'admin' | 'user';
}

/**
 * Route params with user ID
 */
interface UserParams {
  id: string;
}

/**
 * Register user management routes
 */
export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize services
  const db = getDatabase();
  const userService = new UserService(db);
  const authService = new AuthService(userService, db, config.jwtSecret, config.jwtExpiry);
  const userSettingsService = new UserSettingsService(db);
  const adminMiddleware = createAdminMiddleware(authService);

  // Apply admin middleware to all routes in this plugin
  // Requirement 10.5: Only admin users can access these routes
  fastify.addHook('preHandler', adminMiddleware);

  /**
   * GET /api/admin/users
   * Get all users (without passwords)
   * 
   * Requirements: 10.1
   */
  fastify.get('/', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      // Requirement 10.1: Return all users without passwords
      const users = userService.getAllUsers();

      return reply.send({
        success: true,
        users,
      });
    } catch (error) {
      request.log.error(error, 'Get users error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * POST /api/admin/users
   * Create a new user
   * 
   * Requirements: 10.2
   */
  fastify.post<{ Body: CreateUserBody }>('/', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { username, password, role } = request.body;

      // Validate input
      if (!username || !password) {
        return reply.status(400).send({
          success: false,
          error: 'Username and password are required',
        });
      }

      if (username.length < 3) {
        return reply.status(400).send({
          success: false,
          error: 'Username must be at least 3 characters',
        });
      }

      if (password.length < 6) {
        return reply.status(400).send({
          success: false,
          error: 'Password must be at least 6 characters',
        });
      }

      if (role && !['admin', 'user'].includes(role)) {
        return reply.status(400).send({
          success: false,
          error: 'Role must be either "admin" or "user"',
        });
      }

      // Requirement 10.2: Validate username uniqueness
      const createData: CreateUserDTO = {
        username,
        password,
        role: role || 'user',
      };

      const user = await userService.createUser(createData);

      return reply.status(201).send({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error: any) {
      if (error.message === 'Username already exists') {
        return reply.status(400).send({
          success: false,
          error: 'Username already exists',
        });
      }
      request.log.error(error, 'Create user error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/admin/users/:id
   * Update a user
   * 
   * Requirements: 10.3
   */
  fastify.put<{ Params: UserParams; Body: UpdateUserBody }>('/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const { password, role } = request.body;

      // Check if user exists
      const existingUser = userService.findById(id);
      if (!existingUser) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      // Validate input
      if (password !== undefined && password.length < 6) {
        return reply.status(400).send({
          success: false,
          error: 'Password must be at least 6 characters',
        });
      }

      if (role !== undefined && !['admin', 'user'].includes(role)) {
        return reply.status(400).send({
          success: false,
          error: 'Role must be either "admin" or "user"',
        });
      }

      // Requirement 10.3: Allow changing password and role
      const updateData: UpdateUserDTO = {};
      if (password !== undefined) {
        updateData.password = password;
      }
      if (role !== undefined) {
        updateData.role = role;
      }

      const user = await userService.updateUser(id, updateData);

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

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
    } catch (error) {
      request.log.error(error, 'Update user error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/admin/users/:id
   * Delete a user and their settings
   * 
   * Requirements: 10.4
   */
  fastify.delete<{ Params: UserParams }>('/:id', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      // Check if user exists
      const existingUser = userService.findById(id);
      if (!existingUser) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      // Prevent deleting yourself
      if (request.user && request.user.userId === id) {
        return reply.status(400).send({
          success: false,
          error: 'Cannot delete your own account',
        });
      }

      // Requirement 10.4: Remove user and their settings
      // Note: UserService.deleteUser already handles cascade deletion of settings
      const deleted = userService.deleteUser(id);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      return reply.send({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      request.log.error(error, 'Delete user error');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });
}
