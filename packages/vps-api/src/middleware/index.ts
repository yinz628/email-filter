/**
 * Middleware exports
 */

export { 
  authMiddleware, 
  authMiddlewareSync, 
  verifyBearerToken,
  verifyJwtToken,
  verifyLegacyToken,
  createAuthMiddleware,
  createAdminMiddleware,
  getApiToken,
  getJwtSecret,
} from './auth.js';

export type { 
  AuthResult,
  AuthenticatedRequest,
} from './auth.js';
