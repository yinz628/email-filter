import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { initializeDatabase, closeDatabase } from './db/index.js';
import { authRoutes, instanceRoutes, statsRoutes, frontendRoutes, backupProxyRoutes } from './routes/index.js';
import { authMiddleware } from './middleware/auth.js';

const app = Fastify({
  logger: config.nodeEnv !== 'test',
});

// Register plugins
await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(cookie, {
  secret: config.sessionSecret,
});

// Health check (no auth)
app.get('/health', async () => {
  return { status: 'healthy', service: 'vps-admin' };
});

// Frontend routes (no auth required for page, auth checked via API)
app.register(frontendRoutes);

// Auth routes (no auth required)
app.register(authRoutes, { prefix: '/api/auth' });

// Protected routes
app.register(async (protectedApp) => {
  protectedApp.addHook('preHandler', authMiddleware);
  
  protectedApp.register(instanceRoutes, { prefix: '/instances' });
  protectedApp.register(statsRoutes, { prefix: '/stats' });
  protectedApp.register(backupProxyRoutes, { prefix: '/backup' });
}, { prefix: '/api' });

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down...');
  await app.close();
  closeDatabase();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start server
const start = async () => {
  try {
    // Initialize database
    initializeDatabase();
    console.log('Database initialized');
    
    // Start server
    await app.listen({ port: config.port, host: config.host });
    console.log(`VPS Admin Panel running at http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export { app };
