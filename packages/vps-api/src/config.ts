import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  apiToken: string;
  defaultForwardTo: string;
  nodeEnv: string;
  /** JWT secret key for signing tokens - MUST be changed in production */
  jwtSecret: string;
  /** JWT token expiration time (e.g., '24h', '7d') */
  jwtExpiry: string;
  /** Default admin username - used when no users exist in database */
  defaultAdminUsername: string;
  /** Default admin password - MUST be changed in production */
  defaultAdminPassword: string;
  // Scheduler configuration
  scheduler: {
    /** Cron expression for heartbeat checks (default: every 5 minutes) */
    heartbeatCron: string;
    /** Cron expression for data cleanup (default: daily at 3 AM) */
    cleanupCron: string;
    /** Hours to retain hit logs (default: 72, range: 48-72) */
    hitLogRetentionHours: number;
    /** Days to retain alerts (default: 90, range: 30-90) */
    alertRetentionDays: number;
    /** Whether to run heartbeat immediately on start */
    runHeartbeatOnStart: boolean;
  };
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || join(__dirname, '..', 'data', 'filter.db'),
  apiToken: process.env.API_TOKEN || 'dev-token',
  defaultForwardTo: process.env.DEFAULT_FORWARD_TO || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  // JWT Authentication Configuration
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  // Default Admin Credentials (used on first startup when no users exist)
  defaultAdminUsername: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
  scheduler: {
    heartbeatCron: process.env.HEARTBEAT_CRON || '*/5 * * * *',
    cleanupCron: process.env.CLEANUP_CRON || '0 3 * * *',
    hitLogRetentionHours: parseInt(process.env.HIT_LOG_RETENTION_HOURS || '72', 10),
    alertRetentionDays: parseInt(process.env.ALERT_RETENTION_DAYS || '90', 10),
    runHeartbeatOnStart: process.env.RUN_HEARTBEAT_ON_START === 'true',
  },
};
