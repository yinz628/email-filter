import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rulesRouter, emailRouter, statsRouter, watchRouter, dynamicRouter, forwardRouter, frontendRouter } from './routes/index.js';
import { initializeDatabase } from './db/index.js';
import { errorResponse } from './utils/response.js';
import { RuleRepository } from './db/rule-repository.js';
import { ProcessLogRepository } from './db/process-log-repository.js';
import { ForwardRepository } from './db/forward-repository.js';
import { WatchRepository } from './db/watch-repository.js';
import { StatsRepository } from './db/stats-repository.js';
import { EmailService } from './services/email.service.js';
import { WatchService } from './services/watch.service.js';
import { DynamicRuleService } from './services/dynamic-rule.service.js';
import { StatsService } from './services/stats.service.js';

export type Bindings = {
  DB: D1Database;
  SEND_EMAIL: SendEmail;
};

// Email message interface for Cloudflare Email Workers
interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  reply(message: EmailMessage): Promise<void>;
}

// SendEmail interface
interface SendEmail {
  send(message: EmailMessage): Promise<void>;
}

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('*', cors());

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ message: 'Email Filter Worker API', status: 'healthy' });
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

// Mount API routes
app.route('/api/rules', rulesRouter);
app.route('/api/email', emailRouter);
app.route('/api/stats', statsRouter);
app.route('/api/watch', watchRouter);
app.route('/api/dynamic', dynamicRouter);
app.route('/api/forward', forwardRouter);

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(errorResponse('INTERNAL_ERROR', 'An unexpected error occurred'), 500);
});

// 404 handler
app.notFound((c) => {
  return c.json(errorResponse('NOT_FOUND', 'Endpoint not found'), 404);
});

/**
 * Parse email headers to extract sender name and subject
 */
function parseEmailHeaders(headers: Headers): { senderName: string; subject: string } {
  const from = headers.get('from') || '';
  const subject = headers.get('subject') || '';
  
  // Extract sender name from "Name <email>" format
  const nameMatch = from.match(/^([^<]+)\s*</);
  const senderName = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : from.split('@')[0];
  
  return { senderName, subject };
}

/**
 * Extract email address from "Name <email>" format
 */
function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

// Export with email handler for Cloudflare Email Workers
export default {
  // HTTP fetch handler
  fetch: app.fetch,
  
  // Email handler for Cloudflare Email Routing
  async email(message: EmailMessage, env: Bindings, ctx: ExecutionContext): Promise<void> {
    try {
      // Initialize database
      await initializeDatabase(env.DB);
      
      // Parse email information
      const { senderName, subject } = parseEmailHeaders(message.headers);
      const senderEmail = extractEmailAddress(message.from);
      const recipient = message.to;
      
      // Initialize services
      const ruleRepository = new RuleRepository(env.DB);
      const processLogRepository = new ProcessLogRepository(env.DB);
      const forwardRepository = new ForwardRepository(env.DB);
      const watchRepository = new WatchRepository(env.DB);
      const statsRepository = new StatsRepository(env.DB);
      
      const emailService = new EmailService(processLogRepository, ruleRepository, forwardRepository);
      const watchService = new WatchService(watchRepository);
      const dynamicRuleService = new DynamicRuleService(env.DB, ruleRepository);
      const statsService = new StatsService(statsRepository, ruleRepository);
      
      // Create incoming email object
      const incomingEmail = {
        recipient,
        sender: senderName,
        senderEmail,
        subject,
        receivedAt: new Date(),
      };
      
      // Process the email through filter engine
      const result = await emailService.processEmail(incomingEmail);
      
      // Track subject for dynamic rule detection (non-blocking)
      ctx.waitUntil(dynamicRuleService.trackSubject(subject, new Date()));
      
      // Check and record watch item matches (non-blocking)
      ctx.waitUntil(watchService.checkAndRecordMatches(incomingEmail));
      
      // Periodically clean up old tracking records (1% chance per email)
      if (Math.random() < 0.01) {
        ctx.waitUntil(dynamicRuleService.cleanupOldTrackingRecords());
      }
      
      // Update rule statistics if a rule was matched
      if (result.processResult.matchedRule) {
        ctx.waitUntil(statsService.recordRuleHit(
          result.processResult.matchedRule.id,
          result.log.action
        ));
      }
      
      // Handle the email based on filter result
      if (result.processResult.action === 'deleted') {
        // 静默删除：不调用任何方法，邮件会被丢弃，发件人不会收到退信
        // Silent delete: do nothing, email will be dropped without bounce
        console.log(`Email silently deleted: ${subject} from ${senderEmail} (rule: ${result.processResult.matchedRule?.pattern || 'unknown'})`);
        // 直接返回，不转发也不拒绝
        return;
      } else if (result.processResult.action === 'passed') {
        // Forward the email to the configured address
        const forwardTo = result.processResult.forwardTo;
        if (forwardTo) {
          await message.forward(forwardTo);
          console.log(`Email forwarded: ${subject} from ${senderEmail} to ${forwardTo}`);
        } else {
          // No forward address configured, silently drop
          console.log(`Email passed but no forward address configured, silently dropped: ${subject} from ${senderEmail}`);
          return;
        }
      }
    } catch (error) {
      console.error('Email processing error:', error);
      // On error, silently drop to avoid bounce
      // 出错时静默丢弃，避免退信
    }
  },
};
