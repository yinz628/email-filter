import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getDatabase } from '../db/index.js';
import { config } from '../config.js';
import { UserService } from '../services/user.service.js';
import { AuthService } from '../services/auth.service.js';
import { FeatureSettingsService } from '../services/feature-settings.service.js';
import { FEATURE_KEYS, type FeatureKey } from '../db/feature-settings-repository.js';
import { createAdminMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';

interface UpdateFeatureBody {
  enabled?: boolean;
}

interface FeatureParams {
  key: string;
}

type ListFeaturesRequest = FastifyRequest & AuthenticatedRequest;
type UpdateFeatureRequest = FastifyRequest<{
  Params: FeatureParams;
  Body: UpdateFeatureBody;
}> & AuthenticatedRequest;

function isFeatureKey(key: string): key is FeatureKey {
  return FEATURE_KEYS.includes(key as FeatureKey);
}

export async function adminFeatureRoutes(fastify: FastifyInstance): Promise<void> {
  const db = getDatabase();
  const userService = new UserService(db);
  const authService = new AuthService(userService, db, config.jwtSecret, config.jwtExpiry);
  const adminMiddleware = createAdminMiddleware(authService);
  const featureSettingsService = new FeatureSettingsService(db);

  fastify.addHook('preHandler', adminMiddleware);

  fastify.get('/', async (_request: ListFeaturesRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      features: featureSettingsService.getAllStatuses(),
    });
  });

  fastify.patch<{ Params: FeatureParams; Body: UpdateFeatureBody }>(
    '/:key',
    async (request: UpdateFeatureRequest, reply: FastifyReply) => {
      const { key } = request.params;
      if (!isFeatureKey(key)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid feature key',
        });
      }

      if (typeof request.body?.enabled !== 'boolean') {
        return reply.status(400).send({
          success: false,
          error: 'enabled must be a boolean',
        });
      }

      const currentStatus = featureSettingsService.getStatus(key);
      if (!currentStatus.envEnabled && request.body.enabled) {
        return reply.status(409).send({
          success: false,
          error: 'Feature disabled by deployment configuration',
          feature: key,
          reason: 'env_disabled',
        });
      }

      const status = featureSettingsService.setEnabled(key, request.body.enabled);
      return reply.send({
        success: true,
        feature: status,
      });
    }
  );
}
