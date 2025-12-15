import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter, instancesRouter, statsRouter, frontendRouter } from './routes/index.js';
import { initializeDatabase } from './db/index.js';
import { errorResponse } from './utils/response.js';
import { authMiddleware } from './middleware/auth.js';

export type Bindings = {
  DB: D1Database;
  DEFAULT_PASSWORD?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('*', cors());

// Health check endpoint (no auth required)
app.get('/health', (c) => {
  return c.json({ message: 'Email Filter Admin Panel', status: 'healthy' });
});

// Serve frontend at root
app.route('/', frontendRouter);

// Initialize database on first request (lazy initialization)
app.use('*', async (c, next) => {
  try {
    await initializeDatabase(c.env.DB);
  } catch (error) {
    // Database might already be initialized, continue
  }
  await next();
});

// Mount auth routes (no auth required for login)
app.route('/api/auth', authRouter);

// Apply auth middleware to protected routes
app.use('/api/instances/*', authMiddleware);
app.use('/api/stats/*', authMiddleware);

// Mount protected API routes
app.route('/api/instances', instancesRouter);
app.route('/api/stats', statsRouter);

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'), 500);
});

// 404 handler
app.notFound((c) => {
  return c.json(errorResponse('NOT_FOUND', 'Endpoint not found'), 404);
});

export default app;
