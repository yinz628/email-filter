import type { FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from './auth.js';
import type { FeatureKey } from '../db/feature-settings-repository.js';
import type { FeatureSettingsService } from '../services/feature-settings.service.js';

export function createFeatureGuard(
  featureSettingsService: FeatureSettingsService,
  key: FeatureKey
) {
  return async function featureGuard(
    _request: AuthenticatedRequest,
    reply: FastifyReply
  ): Promise<void> {
    const status = featureSettingsService.getStatus(key);
    if (!status.effectiveEnabled) {
      reply.status(403).send({
        error: 'Feature disabled',
        feature: status.key,
        reason: status.reason,
      });
    }
  };
}
