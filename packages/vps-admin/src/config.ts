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
  adminPassword: string;
  sessionSecret: string;
  nodeEnv: string;
}

export const config: Config = {
  port: parseInt(process.env.ADMIN_PORT || process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.ADMIN_DB_PATH || process.env.DB_PATH || join(__dirname, '..', 'data', 'admin.db'),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',
  nodeEnv: process.env.NODE_ENV || 'development',
};
