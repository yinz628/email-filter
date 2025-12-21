import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initializeDatabase, closeDatabase, getDatabase } from './db/index.js';
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
  monitoringRoutes,
  ratioMonitoringRoutes,
  telegramRoutes,
  adminRoutes,
  authRoutes,
  userSettingsRoutes,
  usersRoutes,
} from './routes/index.js';
import { SchedulerService } from './services/monitoring/index.js';
import { UserService } from './services/user.service.js';

// Scheduler instance
let scheduler: SchedulerService | null = null;

// Start server
async function start() {
  try {
    // Initialize database FIRST before anything else
    console.log('Initializing database...');
    initializeDatabase();
    console.log('Database initialized successfully');

    // Initialize UserService and ensure default admin exists
    // Requirements: 1.4, 1.5
    console.log('Checking for default admin user...');
    const userService = new UserService(getDatabase());
    await userService.ensureDefaultAdmin(
      config.defaultAdminUsername,
      config.defaultAdminPassword
    );

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
    await fastify.register(monitoringRoutes, { prefix: '/api/monitoring' });
    await fastify.register(ratioMonitoringRoutes, { prefix: '/api/monitoring/ratio' });
    await fastify.register(telegramRoutes, { prefix: '/api/telegram' });
    await fastify.register(adminRoutes, { prefix: '/api/admin' });
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(userSettingsRoutes, { prefix: '/api/user' });
    await fastify.register(usersRoutes, { prefix: '/api/admin/users' });

    // Initialize and start scheduler for monitoring tasks
    // - Heartbeat checks every 5 minutes (Requirement 4.1)
    // - Data cleanup daily at 3 AM (Requirements 7.2, 7.3, 7.4)
    console.log('Starting monitoring scheduler...');
    scheduler = new SchedulerService(getDatabase(), config.scheduler);
    scheduler.start();
    console.log('Monitoring scheduler started');

    // Start server
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`Server listening on http://${config.host}:${config.port}`);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      if (scheduler) {
        scheduler.stop();
      }
      closeDatabase();
      await fastify.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down...');
      if (scheduler) {
        scheduler.stop();
      }
      closeDatabase();
      await fastify.close();
      process.exit(0);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
