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
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || join(__dirname, '..', 'data', 'filter.db'),
  apiToken: process.env.API_TOKEN || 'dev-token',
  defaultForwardTo: process.env.DEFAULT_FORWARD_TO || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};
