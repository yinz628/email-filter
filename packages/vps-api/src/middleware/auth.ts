/**
 * Authentication Middleware
 * Bearer Token verification for protected routes
 * 
 * Requirements: 8.1, 8.2
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { config } from '../config.js';

/**
 * Result of authentication verification
 */
export interface AuthResult {
  valid: boolean;
  error?: string;
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
 * Verify Bearer Token from Authorization header
 * 
 * @param authHeader - The Authorization header value
 * @param expectedToken - Optional expected token (for testing), defaults to configured API token
 * @returns AuthResult indicating if token is valid
 */
export function verifyBearerToken(authHeader: string | undefined, expectedToken?: string): AuthResult {
  // Check if Authorization header exists
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

  // Verify token matches configured API token
  const validToken = expectedToken ?? getApiToken();
  if (token !== validToken) {
    return { valid: false, error: 'Invalid token' };
  }

  return { valid: true };
}

/**
 * Fastify preHandler hook for Bearer Token authentication
 * Returns 401 if token is missing or invalid
 * 
 * Requirements: 8.1, 8.2
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
