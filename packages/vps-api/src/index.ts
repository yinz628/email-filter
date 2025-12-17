import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initializeDatabase, closeDatabase } from './db/index.js';
import {
  webhookRoutes,
  rulesRoutes,
  statsRoutes,
  dynamicRoutes,
  forwardRoutes,
  workerRoutes,
  frontendRoutes,
  logsRoutes,
  watchRoutes,
  campaignRoutes,
} from './routes/index.js';

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

// Register CORS
await fastify.register(cors, {
  origin: true,
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const startTime = Date.now();
  
  try {
    // Simple health check - just return status
    const responseTime = Date.now() - startTime;
    
    return reply.send({
      status: 'healthy',
      service: 'vps-email-filter-api',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
    });
  } catch (error) {
    return reply.status(500).send({
      status: 'unhealthy',
      error: 'Health check failed',
    });
  }
});

// Root endpoint - redirect to admin panel
fastify.get('/', async (request, reply) => {
  return reply.redirect('/admin');
});

// Admin panel
await fastify.register(frontendRoutes);

// Register API routes
await fastify.register(webhookRoutes, { prefix: '/api/webhook' });
await fastify.register(rulesRoutes, { prefix: '/api/rules' });
await fastify.register(statsRoutes, { prefix: '/api/stats' });
await fastify.register(dynamicRoutes, { prefix: '/api/dynamic' });
await fastify.register(forwardRoutes, { prefix: '/api/forward' });
await fastify.register(workerRoutes, { prefix: '/api/workers' });
await fastify.register(logsRoutes, { prefix: '/api/logs' });
await fastify.register(watchRoutes, { prefix: '/api/watch' });
await fastify.register(campaignRoutes, { prefix: '/api/campaign' });

// Start server
async function start() {
  try {
    // Initialize database
    console.log('Initializing database...');
    initializeDatabase();
    console.log('Database initialized successfully');

    // Start server
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  closeDatabase();
  await fastify.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  closeDatabase();
  await fastify.close();
  process.exit(0);
});

start();

export { fastify };
