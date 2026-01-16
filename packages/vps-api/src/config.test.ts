/**
 * Tests for security configuration validation
 */

import { describe, it, expect } from 'vitest';
import { validateSecurityConfig, SecurityConfigError, type Config } from './config.js';

describe('Security Configuration Validation', () => {
  const createConfig = (overrides: Partial<Config> = {}): Config => ({
    port: 3000,
    host: '0.0.0.0',
    dbPath: '/data/filter.db',
    apiToken: 'secure-api-token-12345',
    defaultForwardTo: 'test@example.com',
    nodeEnv: 'production',
    vpsPublicUrl: 'https://api.example.com',
    jwtSecret: 'a-very-secure-jwt-secret-that-is-long-enough',
    jwtExpiry: '24h',
    defaultAdminUsername: 'admin',
    defaultAdminPassword: 'secure-password-123',
    scheduler: {
      heartbeatCron: '*/5 * * * *',
      cleanupCron: '0 3 * * *',
      hitLogRetentionHours: 72,
      alertRetentionDays: 90,
      runHeartbeatOnStart: false,
    },
    ...overrides,
  });

  describe('in production environment', () => {
    it('should pass with secure configuration', () => {
      const config = createConfig();
      expect(() => validateSecurityConfig(config)).not.toThrow();
    });

    it('should throw when JWT_SECRET contains "dev-"', () => {
      const config = createConfig({
        jwtSecret: 'dev-jwt-secret-change-in-production',
      });
      expect(() => validateSecurityConfig(config)).toThrow(SecurityConfigError);
      expect(() => validateSecurityConfig(config)).toThrow(/JWT_SECRET must be set/);
    });

    it('should throw when JWT_SECRET is too short', () => {
      const config = createConfig({
        jwtSecret: 'short-secret',
      });
      expect(() => validateSecurityConfig(config)).toThrow(SecurityConfigError);
      expect(() => validateSecurityConfig(config)).toThrow(/at least 32 characters/);
    });

    it('should throw when API_TOKEN is default value', () => {
      const config = createConfig({
        apiToken: 'dev-token',
      });
      expect(() => validateSecurityConfig(config)).toThrow(SecurityConfigError);
      expect(() => validateSecurityConfig(config)).toThrow(/API_TOKEN must be set/);
    });

    it('should throw when API_TOKEN is too short', () => {
      const config = createConfig({
        apiToken: 'short',
      });
      expect(() => validateSecurityConfig(config)).toThrow(SecurityConfigError);
      expect(() => validateSecurityConfig(config)).toThrow(/at least 16 characters/);
    });

    it('should throw when DEFAULT_ADMIN_PASSWORD is default value', () => {
      const config = createConfig({
        defaultAdminPassword: 'admin123',
      });
      expect(() => validateSecurityConfig(config)).toThrow(SecurityConfigError);
      expect(() => validateSecurityConfig(config)).toThrow(/DEFAULT_ADMIN_PASSWORD must be changed/);
    });

    it('should throw when DEFAULT_ADMIN_PASSWORD is too short', () => {
      const config = createConfig({
        defaultAdminPassword: 'short',
      });
      expect(() => validateSecurityConfig(config)).toThrow(SecurityConfigError);
      expect(() => validateSecurityConfig(config)).toThrow(/at least 8 characters/);
    });

    it('should report multiple errors at once', () => {
      const config = createConfig({
        jwtSecret: 'dev-secret',
        apiToken: 'dev-token',
        defaultAdminPassword: 'admin123',
      });
      
      try {
        validateSecurityConfig(config);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityConfigError);
        const message = (error as Error).message;
        expect(message).toContain('JWT_SECRET');
        expect(message).toContain('API_TOKEN');
        expect(message).toContain('DEFAULT_ADMIN_PASSWORD');
      }
    });
  });

  describe('in non-production environment', () => {
    it('should skip validation in development', () => {
      const config = createConfig({
        nodeEnv: 'development',
        jwtSecret: 'dev-jwt-secret-change-in-production',
        apiToken: 'dev-token',
        defaultAdminPassword: 'admin123',
      });
      expect(() => validateSecurityConfig(config)).not.toThrow();
    });

    it('should skip validation in test', () => {
      const config = createConfig({
        nodeEnv: 'test',
        jwtSecret: 'dev-jwt-secret-change-in-production',
        apiToken: 'dev-token',
        defaultAdminPassword: 'admin123',
      });
      expect(() => validateSecurityConfig(config)).not.toThrow();
    });
  });
});
