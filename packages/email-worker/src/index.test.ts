/**
 * Unit tests for Email Worker campaign tracking integration
 * 
 * Requirements: 8.3 - Error handling doesn't block email flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackCampaignEmail } from './index';
import type { Env } from './index';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Campaign Tracking Integration', () => {
  let mockEnv: Env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = {
      VPS_API_URL: 'https://example.com/api/webhook/email',
      VPS_API_TOKEN: 'test-token',
      DEFAULT_FORWARD_TO: 'test@example.com',
      WORKER_NAME: 'test-worker',
      DEBUG_LOGGING: 'false',
      SEB: {} as SendEmail,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('trackCampaignEmail', () => {
    const validPayload = {
      sender: 'sender@merchant.com',
      subject: 'Test Campaign',
      recipient: 'recipient@example.com',
      receivedAt: new Date().toISOString(),
    };

    it('should send tracking request to correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await trackCampaignEmail(validPayload, mockEnv);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/api/campaign/track',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          },
          body: JSON.stringify(validPayload),
        })
      );
    });

    it('should not throw when API returns error status', async () => {
      // Requirement 8.3: Error handling doesn't block email flow
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      // Should not throw - errors are logged but don't block
      await expect(trackCampaignEmail(validPayload, mockEnv)).resolves.not.toThrow();
    });

    it('should not throw when network request fails', async () => {
      // Requirement 8.3: Error handling doesn't block email flow
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw - errors are logged but don't block
      await expect(trackCampaignEmail(validPayload, mockEnv)).resolves.not.toThrow();
    });

    it('should not throw when request times out', async () => {
      // Requirement 8.3: Error handling doesn't block email flow
      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          const error = new Error('Aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });

      // Should not throw - errors are logged but don't block
      await expect(trackCampaignEmail(validPayload, mockEnv)).resolves.not.toThrow();
    });

    it('should skip tracking when VPS_API_URL is not configured', async () => {
      mockEnv.VPS_API_URL = '';

      await trackCampaignEmail(validPayload, mockEnv);

      // Should not make any fetch calls
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use VPS_API_BASE_URL when provided', async () => {
      mockEnv.VPS_API_BASE_URL = 'https://custom-api.example.com';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await trackCampaignEmail(validPayload, mockEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom-api.example.com/api/campaign/track',
        expect.any(Object)
      );
    });

    it('should derive base URL from VPS_API_URL correctly', async () => {
      mockEnv.VPS_API_URL = 'https://api.example.com:8080/api/webhook/email';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await trackCampaignEmail(validPayload, mockEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com:8080/api/campaign/track',
        expect.any(Object)
      );
    });
  });
});
