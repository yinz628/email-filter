import { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { createSession, deleteSession, cleanupExpiredSessions } from '../db/session-repository.js';

interface LoginBody {
  password: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Login
  app.post<{ Body: LoginBody }>('/login', async (request, reply) => {
    const { password } = request.body;
    
    if (!password) {
      return reply.status(400).send({ error: 'Password required' });
    }
    
    if (password !== config.adminPassword) {
      return reply.status(401).send({ error: 'Invalid password' });
    }
    
    // Clean up expired sessions
    cleanupExpiredSessions();
    
    // Create new session
    const session = createSession();
    
    // Set session cookie
    reply.setCookie('session', session.id, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    return { success: true, message: 'Logged in successfully' };
  });
  
  // Logout
  app.post('/logout', async (request, reply) => {
    const sessionId = request.cookies?.session;
    
    if (sessionId) {
      deleteSession(sessionId);
      reply.clearCookie('session', { path: '/' });
    }
    
    return { success: true, message: 'Logged out successfully' };
  });
  
  // Check auth status
  app.get('/status', async (request, reply) => {
    const sessionId = request.cookies?.session;
    
    if (!sessionId) {
      return { authenticated: false };
    }
    
    const { validateSession } = await import('../db/session-repository.js');
    const isValid = validateSession(sessionId);
    
    return { authenticated: isValid };
  });
}
