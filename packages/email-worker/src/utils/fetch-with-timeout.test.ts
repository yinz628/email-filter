/**
 * Tests for fetch-with-timeout utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchWithTimeout,
  fetchFireAndForget,
  createAuthHeaders,
  TIMEOUT,
} from './fetch-with-timeout';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetch-with-timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TIMEOUT constants', () => {
    it('should have correct default values', () => {
      expect(TIMEOUT.API_FILTER).toBe(5000);
      expect(TIMEOUT.TRACKING).toBe(3000);
      expect(TIMEOUT.HEALTH_CHECK).toBe(5000);
    });
  });

  describe('fetchWithTimeout', () => {
    it('should return success with data on successful response', async () => {
      const mockData = { action: 'forward', forwardTo: 'test@example.com' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const resultPromise = fetchWithTimeout<typeof mockData>('https://api.example.com/test', {
        timeoutMs: 5000,
        headers: { 'Content-Type': 'application/json' },
        body: { test: true },
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: true }),
        })
      );
    });

    it('should return error on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const resultPromise = fetchWithTimeout('https://api.example.com/test', {
        timeoutMs: 5000,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Internal Server Error');
      expect(result.status).toBe(500);
    });

    it('should return timeout error when request exceeds timeout', async () => {
      // Use real timers for this test since AbortController timeout works with real time
      vi.useRealTimers();
      
      mockFetch.mockImplementationOnce((url: string, options: { signal: AbortSignal }) => {
        return new Promise((_, reject) => {
          const signal = options?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('Aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      const result = await fetchWithTimeout('https://api.example.com/test', {
        timeoutMs: 50, // Very short timeout for test
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      
      // Restore fake timers for other tests
      vi.useFakeTimers();
    });

    it('should return error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const resultPromise = fetchWithTimeout('https://api.example.com/test', {
        timeoutMs: 5000,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should use GET method when specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const resultPromise = fetchWithTimeout('https://api.example.com/health', {
        timeoutMs: 5000,
        method: 'GET',
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/health',
        expect.objectContaining({
          method: 'GET',
          body: undefined,
        })
      );
    });
  });

  describe('fetchFireAndForget', () => {
    it('should return result without throwing on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tracked: true }),
      });

      const resultPromise = fetchFireAndForget('https://api.example.com/track', {
        timeoutMs: 3000,
        body: { event: 'test' },
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
    });

    it('should return error result without throwing on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const resultPromise = fetchFireAndForget('https://api.example.com/track', {
        timeoutMs: 3000,
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should call debugLog on failure when provided', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const debugLog = vi.fn();

      const resultPromise = fetchFireAndForget(
        'https://api.example.com/track',
        { timeoutMs: 3000 },
        debugLog
      );

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(debugLog).toHaveBeenCalledWith(
        expect.stringContaining('Fire-and-forget request failed')
      );
    });

    it('should not call debugLog on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      const debugLog = vi.fn();

      const resultPromise = fetchFireAndForget(
        'https://api.example.com/track',
        { timeoutMs: 3000 },
        debugLog
      );

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(debugLog).not.toHaveBeenCalled();
    });
  });

  describe('createAuthHeaders', () => {
    it('should create headers with Bearer token', () => {
      const headers = createAuthHeaders('my-secret-token');

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer my-secret-token',
      });
    });
  });
});
