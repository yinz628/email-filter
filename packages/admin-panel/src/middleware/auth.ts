/**
 * Authentication Middleware
 * JWT verification middleware for protected routes
 * 
 * Requirements: 2.1, 2.2
 */

import type { Context, Next } from 'hono';
import { AuthService } from '../services/auth.service.js';
import { errorResponse } from '../utils/response.js';

export type AuthBindings = {
  DB: D1Database;
};

/**
 * Options for auth middleware configuration
 */
export interface AuthMiddlewareOptions {
  /** URL to redirect unauthenticated browser requests to (default: '/login') */
  redirectUrl?: string;
  /** Whether to enable redirect for browser requests (default: true) */
  enableRedirect?: boolean;
}

/**
 * Check if the request is from a browser (expects HTML response)
 */
function isBrowserRequest(c: Context): boolean {
  const accept = c.req.header('Accept') || '';
  const contentType = c.req.header('Content-Type') || '';
  
  // If request explicitly asks for JSON, it's an API request
  if (accept.includes('application/json') || contentType.includes('application/json')) {
    return false;
  }
  
  // If request has Authorization header, treat as API request
  if (c.req.header('Authorization')) {
    return false;
  }
  
  // If Accept header includes text/html, it's likely a browser request
  if (accept.includes('text/html')) {
    return true;
  }
  
  return false;
}

/**
 * Handle unauthorized response - either redirect or return JSON error
 */
function handleUnauthorized(
  c: Context,
  message: string,
  options: AuthMiddlewareOptions
): Response {
  const { redirectUrl = '/login', enableRedirect = true } = options;
  
  // Check if we should redirect browser requests
  if (enableRedirect && isBrowserRequest(c)) {
    return c.redirect(redirectUrl, 302);
  }
  
  // Return JSON error for API requests
  return c.json(errorResponse('UNAUTHORIZED', message), 401);
}

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header
 * Returns 401 if token is missing or invalid
 * Redirects browser requests to login page when unauthenticated
 * 
 * Requirements: 2.1, 2.2
 */
export async function authMiddleware(
  c: Context<{ Bindings: AuthBindings }>,
  next: Next
): Promise<Response | void> {
  return authMiddlewareWithOptions({})(c, next);
}

/**
 * Create auth middleware with custom options
 * Allows configuration of redirect behavior
 * 
 * Requirements: 2.1, 2.2
 */
export function authMiddlewareWithOptions(options: AuthMiddlewareOptions = {}) {
  return async function (
    c: Context<{ Bindings: AuthBindings }>,
    next: Next
  ): Promise<Response | void> {
    const authHeader = c.req.header('Authorization');

    // Check if Authorization header exists
    if (!authHeader) {
      return handleUnauthorized(c, 'Authorization header is required', options);
    }

    // Check if it's a Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      return handleUnauthorized(c, 'Invalid authorization format. Use Bearer token', options);
    }

    const token = authHeader.substring(7);

    // Verify token is not empty
    if (!token || token.trim() === '') {
      return handleUnauthorized(c, 'Token is required', options);
    }

    try {
      const authService = new AuthService(c.env.DB);
      const result = await authService.verify(token);

      if (!result.valid) {
        return handleUnauthorized(c, result.error || 'Invalid or expired token', options);
      }

      // Token is valid, proceed to next handler
      await next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return c.json(
        errorResponse('INTERNAL_ERROR', 'Authentication verification failed'),
        500
      );
    }
  };
}

/**
 * Check if a request is authenticated
 * Returns true if the token is valid, false otherwise
 */
export async function isAuthenticated(
  db: D1Database,
  authHeader: string | undefined
): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);

  if (!token || token.trim() === '') {
    return false;
  }

  try {
    const authService = new AuthService(db);
    const result = await authService.verify(token);
    return result.valid;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}
