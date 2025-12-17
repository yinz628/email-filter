/**
 * Telegram Configuration Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../db/index.js';
import { ConfigRepository } from '../db/config-repository.js';
import {
  type TelegramConfig,
  testTelegramConfig,
} from '../services/monitoring/telegram.service.js';
import { authMiddleware } from '../middleware/auth.js';

const TELEGRAM_CONFIG_KEY = 'telegram_config';

/**
 * Get config repository instance
 */
function getConfigRepo(): ConfigRepository {
  const db = getDatabase();
  return new ConfigRepository(db);
}

/**
 * Register Telegram routes
 */
export async function telegramRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authMiddleware);

  // Get Telegram configuration
  fastify.get('/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const configRepo = getConfigRepo();
      const config = configRepo.getJson<TelegramConfig>(TELEGRAM_CONFIG_KEY);
      
      // Don't expose the full bot token for security
      if (config?.botToken) {
        const maskedToken = config.botToken.slice(0, 10) + '...' + config.botToken.slice(-5);
        return reply.send({
          ...config,
          botToken: maskedToken,
          hasToken: true,
        });
      }
      
      return reply.send({
        botToken: '',
        chatId: '',
        enabled: false,
        hasToken: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });

  // Update Telegram configuration
  fastify.put(
    '/config',
    async (
      request: FastifyRequest<{ Body: Partial<TelegramConfig> & { botToken?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const configRepo = getConfigRepo();
        const existingConfig = configRepo.getJson<TelegramConfig>(TELEGRAM_CONFIG_KEY) || {
          botToken: '',
          chatId: '',
          enabled: false,
        };

        const body = request.body;
        const newConfig: TelegramConfig = {
          botToken: body.botToken !== undefined && body.botToken !== '' 
            ? body.botToken 
            : existingConfig.botToken,
          chatId: body.chatId !== undefined ? body.chatId : existingConfig.chatId,
          enabled: body.enabled !== undefined ? body.enabled : existingConfig.enabled,
        };

        configRepo.setJson(TELEGRAM_CONFIG_KEY, newConfig);

        return reply.send({
          success: true,
          config: {
            ...newConfig,
            botToken: newConfig.botToken ? newConfig.botToken.slice(0, 10) + '...' : '',
            hasToken: !!newConfig.botToken,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Test Telegram configuration
  fastify.post('/test', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const configRepo = getConfigRepo();
      const config = configRepo.getJson<TelegramConfig>(TELEGRAM_CONFIG_KEY);

      if (!config || !config.botToken || !config.chatId) {
        return reply.status(400).send({ error: '请先配置 Telegram Bot Token 和 Chat ID' });
      }

      const result = await testTelegramConfig(config);
      
      if (result.success) {
        return reply.send({ success: true, message: '测试消息发送成功！' });
      } else {
        return reply.status(400).send({ success: false, error: result.error });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({ error: message });
    }
  });
}

/**
 * Get Telegram config for use in other services
 */
export function getTelegramConfig(): TelegramConfig | null {
  try {
    const db = getDatabase();
    const configRepo = new ConfigRepository(db);
    return configRepo.getJson<TelegramConfig>(TELEGRAM_CONFIG_KEY);
  } catch {
    return null;
  }
}
