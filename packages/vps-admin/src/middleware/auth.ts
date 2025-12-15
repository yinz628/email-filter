import { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession } from '../db/session-repository.js';

/**
 * Authentication middleware
 * Validates session cookie
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const sessionId = request.cookies?.session;
  
  if (!sessionId) {
    reply.status(401).send({ error: 'Unauthorized', message: 'No session found' });
    return;
  }
  
  if (!validateSession(sessionId)) {
    reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired session' });
    return;
  }
}
