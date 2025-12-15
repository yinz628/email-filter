/**
 * Auth Routes
 * API endpoints for authentication
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import { Hono } from 'hono';
import type { AuthLoginRequest } from '@email-filter/shared';
import { AuthService } from '../services/auth.service.js';
import { errorResponse, successResponse } from '../utils/response.js';

export type AuthBindings = {
  DB: D1Database;
  DEFAULT_PASSWORD?: string;
};

const authRouter = new Hono<{ Bindings: AuthBindings }>();

/**
 * GET /api/auth/status - Check if admin is configured
 */
authRouter.get('/status', async (c) => {
  try {
    const authService = new AuthService(c.env.DB);
    const config = await authService.getConfig();
    return c.json(successResponse({ configured: !!config }));
  } catch (error) {
    console.error('Status check error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Status check failed'), 500);
  }
});

/**
 * POST /api/auth/setup - Initialize admin with password (first time setup)
 */
authRouter.post('/setup', async (c) => {
  try {
    const authService = new AuthService(c.env.DB);
    const existingConfig = await authService.getConfig();
    
    if (existingConfig) {
      return c.json(errorResponse('ALREADY_CONFIGURED', 'Admin is already configured'), 400);
    }

    const body = await c.req.json<{ password: string }>();
    
    if (!body.password || typeof body.password !== 'string' || body.password.length < 4) {
      return c.json(errorResponse('VALIDATION_ERROR', 'Password must be at least 4 characters'), 400);
    }

    await authService.initializeConfig(body.password);
    const result = await authService.login(body.password);

    return c.json(successResponse({ token: result.token, message: 'Admin configured successfully' }));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Setup error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Setup failed'), 500);
  }
});

/**
 * POST /api/auth/login - Login with password
 * Requirements: 2.1, 2.2, 2.3
 */
authRouter.post('/login', async (c) => {
  try {
    const body = await c.req.json<AuthLoginRequest>();
    
    if (!body.password || typeof body.password !== 'string') {
      return c.json(errorResponse('VALIDATION_ERROR', 'Password is required'), 400);
    }

    const authService = new AuthService(c.env.DB);
    
    // Auto-initialize with default password if not configured and DEFAULT_PASSWORD is set
    const config = await authService.getConfig();
    if (!config && c.env.DEFAULT_PASSWORD) {
      await authService.initializeConfig(c.env.DEFAULT_PASSWORD);
    }
    
    const result = await authService.login(body.password);

    if (!result.success) {
      return c.json(errorResponse('AUTH_FAILED', result.error || 'Authentication failed'), 401);
    }

    return c.json(successResponse({ token: result.token }));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json(errorResponse('INVALID_JSON', 'Invalid JSON in request body'), 400);
    }
    console.error('Login error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Login failed'), 500);
  }
});

/**
 * POST /api/auth/logout - Logout (invalidate token)
 * Requirements: 2.4
 */
authRouter.post('/logout', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(successResponse({ success: true }));
    }

    const token = authHeader.substring(7);
    const authService = new AuthService(c.env.DB);
    authService.logout(token);

    return c.json(successResponse({ success: true }));
  } catch (error) {
    console.error('Logout error:', error);
    return c.json(errorResponse('INTERNAL_ERROR', 'Logout failed'), 500);
  }
});

/**
 * GET /api/auth/verify - Verify token validity
 * Requirements: 2.2
 */
authRouter.get('/verify', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(successResponse({ valid: false }));
    }

    const token = authHeader.substring(7);
    const authService = new AuthService(c.env.DB);
    const result = await authService.verify(token);

    return c.json(successResponse({ valid: result.valid }));
  } catch (error) {
    console.error('Verify error:', error);
    return c.json(successResponse({ valid: false }));
  }
});

export { authRouter };
