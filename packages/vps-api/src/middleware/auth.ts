/**
 * Authentication Middleware
 * JWT Token and Legacy Bearer Token verification for protected routes
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthService, TokenPayload } from '../services/auth.service.js';

/**
 * Result of authentication verification
 */
export interface AuthResult {
  valid: boolean;
  error?: string;
  payload?: TokenPayload;
  isLegacy?: boolean;
}

/**
 * Extended request with user context
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user?: TokenPayload;
  isLegacyAuth?: boolean;
}

/**
 * Get the current API token (reads from env for testability)
 */
export function getApiToken(): string {
  // In tests, we may modify process.env.API_TOKEN after module load
  // So we read directly from env, falling back to config
  return process.env.API_TOKEN || config.apiToken;
}

/**
 * Get the JWT secret (reads from env for testability)
 */
export function getJwtSecret(): string {
  return process.env.JWT_SECRET || config.jwtSecret;
}

/**
 * Verify Legacy Bearer Token from Authorization header
 * Requirements: 9.1, 9.2
 * 
 * @param token - The token value (without Bearer prefix)
 * @param expectedToken - Optional expected token (for testing), defaults to configured API token
 * @returns AuthResult indicating if token is valid
 */
export function verifyLegacyToken(token: string, expectedToken?: string): AuthResult {
  const validToken = expectedToken ?? getApiToken();
  if (token === validToken) {
    return { valid: true, isLegacy: true };
  }
  return { valid: false, error: 'Invalid token' };
}


/**
 * Verify JWT Token
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 * 
 * @param token - The JWT token value (without Bearer prefix)
 * @param jwtSecret - Optional JWT secret (for testing), defaults to configured secret
 * @param isBlacklisted - Optional function to check if token is blacklisted
 * @returns AuthResult indicating if token is valid with payload
 */
export function verifyJwtToken(
  token: string,
  jwtSecret?: string,
  isBlacklisted?: (token: string) => boolean
): AuthResult {
  const secret = jwtSecret ?? getJwtSecret();
  
  try {
    // Requirement 4.2: Verify JWT signature and expiration
    const decoded = jwt.verify(token, secret) as TokenPayload;
    
    // Requirement 4.5: Check if token is blacklisted
    if (isBlacklisted && isBlacklisted(token)) {
      return { valid: false, error: 'Token revoked' };
    }
    
    // Requirement 4.3: Return payload for attaching to request context
    return { valid: true, payload: decoded, isLegacy: false };
  } catch (error) {
    // Requirement 4.4: Token is invalid or expired
    if (error instanceof jwt.TokenExpiredError) {
      return { valid: false, error: 'Token expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return { valid: false, error: 'Invalid token' };
    }
    return { valid: false, error: 'Invalid token' };
  }
}

/**
 * Verify Bearer Token from Authorization header
 * Supports both JWT and legacy API token
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2
 * 
 * @param authHeader - The Authorization header value
 * @param options - Optional configuration for testing
 * @returns AuthResult indicating if token is valid
 */
export function verifyBearerToken(
  authHeader: string | undefined,
  options?: {
    expectedLegacyToken?: string;
    jwtSecret?: string;
    isBlacklisted?: (token: string) => boolean;
  }
): AuthResult {
  // Requirement 4.6: Check if Authorization header exists
  if (!authHeader) {
    return { valid: false, error: 'Authorization header is required' };
  }

  // Check if it's a Bearer token
  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Invalid authorization format. Use Bearer token' };
  }

  const token = authHeader.substring(7);

  // Verify token is not empty
  if (!token || token.trim() === '') {
    return { valid: false, error: 'Token is required' };
  }

  // Try JWT verification first
  const jwtResult = verifyJwtToken(
    token,
    options?.jwtSecret,
    options?.isBlacklisted
  );
  
  if (jwtResult.valid) {
    return jwtResult;
  }

  // Requirement 9.1, 9.2: Fall back to legacy token verification
  const legacyResult = verifyLegacyToken(token, options?.expectedLegacyToken);
  
  if (legacyResult.valid) {
    // Requirement 9.4: Log deprecation warning for legacy auth
    console.warn('[DEPRECATED] Legacy API_TOKEN authentication used. Please migrate to JWT authentication.');
    return legacyResult;
  }

  // Both JWT and legacy verification failed
  // Return the JWT error as it's more specific
  return jwtResult;
}


/**
 * Create Fastify preHandler hook for JWT/Bearer Token authentication
 * Returns 401 if token is missing or invalid
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2
 * 
 * @param authService - Optional AuthService instance for blacklist checking
 * @returns Fastify preHandler hook function
 */
export function createAuthMiddleware(authService?: AuthService) {
  return async function authMiddleware(
    request: AuthenticatedRequest,
    reply: FastifyReply
  ): Promise<void> {
    const authHeader = request.headers.authorization;
    
    const result = verifyBearerToken(authHeader, {
      isBlacklisted: authService ? (token) => authService.isTokenBlacklisted(token) : undefined,
    });

    if (!result.valid) {
      reply.status(401).send({ error: result.error || 'Unauthorized' });
      return;
    }

    // Requirement 4.3: Attach user info to request context
    if (result.payload) {
      request.user = result.payload;
    }
    request.isLegacyAuth = result.isLegacy;
  };
}

/**
 * Default Fastify preHandler hook for Bearer Token authentication
 * Uses legacy token verification only (for backward compatibility)
 * Returns 401 if token is missing or invalid
 * 
 * Requirements: 8.1, 8.2 (legacy)
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const result = verifyBearerToken(authHeader);

  if (!result.valid) {
    reply.status(401).send({ error: result.error || 'Unauthorized' });
    return;
  }
}

/**
 * Synchronous version of auth middleware for use with done callback
 */
export function authMiddlewareSync(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const authHeader = request.headers.authorization;
  const result = verifyBearerToken(authHeader);

  if (!result.valid) {
    reply.status(401).send({ error: result.error || 'Unauthorized' });
    return;
  }

  done();
}

/**
 * Create admin-only middleware that checks user role
 * Requirements: 10.1, 10.5
 * 
 * @param authService - Optional AuthService instance for blacklist checking
 * @returns Fastify preHandler hook function
 */
export function createAdminMiddleware(authService?: AuthService) {
  return async function adminMiddleware(
    request: AuthenticatedRequest,
    reply: FastifyReply
  ): Promise<void> {
    const authHeader = request.headers.authorization;
    
    const result = verifyBearerToken(authHeader, {
      isBlacklisted: authService ? (token) => authService.isTokenBlacklisted(token) : undefined,
    });

    if (!result.valid) {
      reply.status(401).send({ error: result.error || 'Unauthorized' });
      return;
    }

    // Attach user info to request context
    if (result.payload) {
      request.user = result.payload;
    }
    request.isLegacyAuth = result.isLegacy;

    // Check admin role (legacy auth is treated as admin for backward compatibility)
    if (!result.isLegacy && result.payload?.role !== 'admin') {
      reply.status(403).send({ error: 'Forbidden: Admin access required' });
      return;
    }
  };
}
