/**
 * Cloudflare Email Worker - Minimal email forwarding with VPS-based filtering
 * 
 * This worker receives emails from Cloudflare Email Routing, sends a webhook
 * to the VPS API for filtering decisions, and executes forward/drop actions.
 * 
 * Design goals:
 * - Minimal CPU time (<10ms) to stay within free tier
 * - No database operations on Cloudflare
 * - Graceful degradation when VPS is unreachable
 */

export interface Env {
  /** VPS API webhook URL */
  VPS_API_URL: string;
  /** Bearer token for VPS API authentication */
  VPS_API_TOKEN: string;
  /** Default email address to forward to when no rules match or VPS is down */
  DEFAULT_FORWARD_TO: string;
  /** Unique worker name for routing to correct configuration on VPS */
  WORKER_NAME: string;
  /** Enable debug logging (true/false) */
  DEBUG_LOGGING: string;
  /** Send email binding for forwarding */
  SEB: SendEmail;
  /** VPS API base URL for campaign tracking (optional, derived from VPS_API_URL if not set) */
  VPS_API_BASE_URL?: string;
  /** KV namespace for caching monitoring hits when VPS API is unavailable (optional) */
  MONITORING_CACHE?: KVNamespace;
}

/** 
 * Debug logger - only logs when DEBUG_LOGGING is enabled
 * Optimized to skip string construction when disabled (Requirements: 9.4)
 */
function debugLog(env: Env, message: string | (() => string)): void {
  if (env.DEBUG_LOGGING === 'true') {
    // Only evaluate the message if logging is enabled
    const msg = typeof message === 'function' ? message() : message;
    console.log(msg);
  }
}

/**
 * Check if debug logging is enabled
 * Use this to guard expensive debug operations
 */
function isDebugEnabled(env: Env): boolean {
  return env.DEBUG_LOGGING === 'true';
}

/** Webhook payload sent to VPS API */
interface EmailWebhookPayload {
  from: string;
  to: string;
  subject: string;
  messageId: string;
  timestamp: number;
  workerName?: string;
}

/** Filter decision returned from VPS API */
interface FilterDecision {
  action: 'forward' | 'drop';
  forwardTo?: string;
  reason?: string;
}

/** Campaign tracking payload sent to VPS API */
interface CampaignTrackPayload {
  sender: string;
  subject: string;
  recipient: string;
  receivedAt: string;
}

/** Monitoring hit payload sent to VPS API */
interface MonitoringHitPayload {
  sender: string;
  subject: string;
  recipient: string;
  receivedAt: string;
}

/** Cached monitoring hit with metadata */
interface CachedMonitoringHit {
  payload: MonitoringHitPayload;
  cachedAt: string;
  retryCount: number;
}

/** Key prefix for cached monitoring hits in KV */
const MONITORING_CACHE_PREFIX = 'monitoring_hit:';

/** Maximum number of cached hits to sync in one batch */
const MAX_SYNC_BATCH_SIZE = 50;

/** TTL for cached monitoring hits (24 hours in seconds) */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Build minimal webhook payload by excluding null/undefined fields
 * Optimized for minimal payload size (Requirements: 9.1, 9.2)
 */
export function buildMinimalPayload(
  from: string,
  to: string,
  subject: string,
  messageId: string,
  workerName?: string
): EmailWebhookPayload {
  // Build payload with only defined fields
  const payload: EmailWebhookPayload = {
    from,
    to,
    subject,
    messageId,
    timestamp: Date.now(),
  };
  
  // Only add workerName if it's defined and non-empty
  if (workerName) {
    payload.workerName = workerName;
  }
  
  return payload;
}

/** Cached URL object to avoid repeated parsing (Requirements: 11.3) */
let cachedApiUrl: { urlString: string; parsed: URL } | null = null;

/**
 * Get cached parsed URL object
 * Avoids repeated URL parsing for the same URL string
 * Requirements: 11.3 - Cache parsed URL for reuse
 */
export function getCachedUrl(urlString: string): URL {
  if (cachedApiUrl && cachedApiUrl.urlString === urlString) {
    return cachedApiUrl.parsed;
  }
  const parsed = new URL(urlString);
  cachedApiUrl = { urlString, parsed };
  return parsed;
}

/**
 * Reset the URL cache (for testing purposes)
 */
export function resetUrlCache(): void {
  cachedApiUrl = null;
}

/**
 * Extract sender email from the "from" header
 * Handles formats like "Name <email@example.com>" or plain "email@example.com"
 * Optimized for performance using indexOf instead of regex (Requirements: 9.3)
 */
export function extractEmail(from: string): string {
  // Fast path: check for angle brackets using indexOf (faster than regex)
  const startIdx = from.indexOf('<');
  if (startIdx === -1) {
    // No angle brackets, return as-is
    return from;
  }
  
  const endIdx = from.indexOf('>', startIdx + 1);
  if (endIdx === -1) {
    // Malformed, return original
    return from;
  }
  
  // Extract email between angle brackets
  return from.substring(startIdx + 1, endIdx);
}

/**
 * Get the VPS API base URL for campaign tracking
 * Derives from VPS_API_URL by removing the /api/webhook/email path
 * Requirements: 11.3 - Use cached URL to avoid repeated parsing
 */
function getVpsApiBaseUrl(env: Env): string | null {
  if (env.VPS_API_BASE_URL) {
    return env.VPS_API_BASE_URL;
  }
  
  if (!env.VPS_API_URL) {
    return null;
  }
  
  // Try to derive base URL from VPS_API_URL using cached URL parsing
  // e.g., "https://example.com/api/webhook/email" -> "https://example.com"
  try {
    const url = getCachedUrl(env.VPS_API_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Cache a monitoring hit to KV storage when VPS API is unavailable
 * 
 * Requirements: 8.4
 */
async function cacheMonitoringHit(
  payload: MonitoringHitPayload,
  env: Env
): Promise<void> {
  if (!env.MONITORING_CACHE) {
    debugLog(env, '[DEBUG] Monitoring cache skipped: KV namespace not configured');
    return;
  }

  try {
    const cacheKey = `${MONITORING_CACHE_PREFIX}${Date.now()}_${crypto.randomUUID()}`;
    const cachedHit: CachedMonitoringHit = {
      payload,
      cachedAt: new Date().toISOString(),
      retryCount: 0,
    };

    await env.MONITORING_CACHE.put(cacheKey, JSON.stringify(cachedHit), {
      expirationTtl: CACHE_TTL_SECONDS,
    });

    debugLog(env, `[DEBUG] Monitoring hit cached: ${cacheKey}`);
  } catch (error) {
    console.error('Failed to cache monitoring hit:', error);
  }
}

/**
 * @deprecated Monitoring is now handled by VPS API in the main webhook endpoint.
 * This function is kept for backward compatibility and cache sync purposes.
 * 
 * Send email hit to monitoring API for real-time signal tracking
 * If the API is unavailable, caches the hit for later sync
 * This is fire-and-forget - errors are logged but don't block email flow
 * 
 * Requirements: 8.1, 8.2, 8.4
 * Requirements: 11.1 - HTTP keep-alive headers
 */
export async function trackMonitoringHit(
  payload: MonitoringHitPayload,
  env: Env
): Promise<void> {
  const baseUrl = getVpsApiBaseUrl(env);
  if (!baseUrl) {
    debugLog(env, '[DEBUG] Monitoring hit skipped: VPS API base URL not configured');
    return;
  }

  const hitUrl = `${baseUrl}/api/monitoring/hit`;

  try {
    // Use lazy evaluation for expensive JSON.stringify (Requirements: 9.4)
    if (isDebugEnabled(env)) {
      debugLog(env, `[DEBUG] Sending monitoring hit: ${hitUrl}`);
      debugLog(env, () => `[DEBUG] Monitoring payload: ${JSON.stringify(payload)}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch(hitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
        'Connection': 'keep-alive', // Requirements: 11.1 - HTTP keep-alive
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Monitoring hit API returned ${response.status}: ${errorText}`);
      // Cache the hit for later retry when API returns error
      await cacheMonitoringHit(payload, env);
    } else {
      debugLog(env, '[DEBUG] Monitoring hit recorded successfully');
    }
  } catch (error) {
    // Log error but don't throw - monitoring should never block email flow
    console.error('Monitoring hit error (non-blocking):', error);
    // Cache the hit for later retry when network fails
    await cacheMonitoringHit(payload, env);
  }
}

/**
 * Sync cached monitoring hits to VPS API
 * Called when API becomes available to flush cached events
 * 
 * Requirements: 8.4
 */
export async function syncCachedMonitoringHits(env: Env): Promise<{ synced: number; failed: number; remaining: number }> {
  if (!env.MONITORING_CACHE) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  const baseUrl = getVpsApiBaseUrl(env);
  if (!baseUrl) {
    return { synced: 0, failed: 0, remaining: 0 };
  }

  const hitUrl = `${baseUrl}/api/monitoring/hit`;
  let synced = 0;
  let failed = 0;

  try {
    // List cached hits
    const listResult = await env.MONITORING_CACHE.list({ prefix: MONITORING_CACHE_PREFIX, limit: MAX_SYNC_BATCH_SIZE });
    
    for (const key of listResult.keys) {
      try {
        const cachedData = await env.MONITORING_CACHE.get(key.name);
        if (!cachedData) {
          // Key expired or deleted, skip
          continue;
        }

        const cachedHit: CachedMonitoringHit = JSON.parse(cachedData);

        // Try to send the cached hit
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(hitUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
            'Connection': 'keep-alive', // Requirements: 11.1 - HTTP keep-alive
          },
          body: JSON.stringify(cachedHit.payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // Successfully synced, delete from cache
          await env.MONITORING_CACHE.delete(key.name);
          synced++;
          debugLog(env, `[DEBUG] Synced cached monitoring hit: ${key.name}`);
        } else {
          // API returned error, increment retry count
          cachedHit.retryCount++;
          if (cachedHit.retryCount >= 3) {
            // Max retries reached, delete the cached hit
            await env.MONITORING_CACHE.delete(key.name);
            failed++;
            console.error(`Monitoring hit sync failed after 3 retries: ${key.name}`);
          } else {
            // Update retry count
            await env.MONITORING_CACHE.put(key.name, JSON.stringify(cachedHit), {
              expirationTtl: CACHE_TTL_SECONDS,
            });
            failed++;
          }
        }
      } catch (error) {
        console.error(`Error syncing cached hit ${key.name}:`, error);
        failed++;
      }
    }

    // Get remaining count
    const remainingList = await env.MONITORING_CACHE.list({ prefix: MONITORING_CACHE_PREFIX, limit: 1 });
    const remaining = remainingList.keys.length > 0 ? -1 : 0; // -1 indicates there are more

    return { synced, failed, remaining };
  } catch (error) {
    console.error('Error syncing cached monitoring hits:', error);
    return { synced, failed, remaining: -1 };
  }
}

/**
 * @deprecated Campaign tracking is now handled by VPS API in the main webhook endpoint.
 * This function is kept for backward compatibility only.
 * 
 * Track email for campaign analytics
 * Sends email metadata to VPS API for campaign tracking
 * This is fire-and-forget - errors are logged but don't block email flow
 * 
 * Requirements: 8.1, 8.3
 * Requirements: 11.1 - HTTP keep-alive headers
 */
export async function trackCampaignEmail(
  payload: CampaignTrackPayload,
  env: Env
): Promise<void> {
  const baseUrl = getVpsApiBaseUrl(env);
  if (!baseUrl) {
    debugLog(env, '[DEBUG] Campaign tracking skipped: VPS API base URL not configured');
    return;
  }

  const trackUrl = `${baseUrl}/api/campaign/track`;

  try {
    // Use lazy evaluation for expensive JSON.stringify (Requirements: 9.4)
    if (isDebugEnabled(env)) {
      debugLog(env, `[DEBUG] Tracking campaign email: ${trackUrl}`);
      debugLog(env, () => `[DEBUG] Campaign payload: ${JSON.stringify(payload)}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout (shorter than filter decision)

    const response = await fetch(trackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
        'Connection': 'keep-alive', // Requirements: 11.1 - HTTP keep-alive
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Campaign tracking API returned ${response.status}: ${errorText}`);
    } else {
      debugLog(env, '[DEBUG] Campaign tracking successful');
    }
  } catch (error) {
    // Log error but don't throw - campaign tracking should never block email flow
    console.error('Campaign tracking error (non-blocking):', error);
  }
}

/** API request timeout in milliseconds (Requirements: 10.1) */
export const API_TIMEOUT_MS = 4000;

/**
 * Call VPS API to get filter decision
 * Returns null if VPS is unreachable or returns an error
 * 
 * Requirements: 10.1 - Timeout set to 4 seconds
 * Requirements: 10.3 - Immediate fallback on timeout
 * Requirements: 10.4 - Log timeout events with API URL and duration
 */
async function getFilterDecision(
  payload: EmailWebhookPayload,
  env: Env
): Promise<FilterDecision | null> {
  const startTime = Date.now();
  
  try {
    // Use lazy evaluation for expensive JSON.stringify (Requirements: 9.4)
    if (isDebugEnabled(env)) {
      debugLog(env, `[DEBUG] Calling VPS API: ${env.VPS_API_URL}`);
      debugLog(env, () => `[DEBUG] Payload: ${JSON.stringify(payload)}`);
    }
    
    const controller = new AbortController();
    // Requirements: 10.1 - Timeout reduced from 5 seconds to 4 seconds
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(env.VPS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
        'Connection': 'keep-alive', // Requirements: 11.1 - HTTP keep-alive
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    debugLog(env, `[DEBUG] VPS API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`VPS API returned ${response.status}: ${errorText}`);
      return null;
    }

    const result = await response.json() as FilterDecision;
    if (isDebugEnabled(env)) {
      debugLog(env, () => `[DEBUG] Filter decision: ${JSON.stringify(result)}`);
    }
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // Requirements: 10.4 - Log timeout events with API URL and duration
    if (error.name === 'AbortError') {
      console.error(`[TIMEOUT] VPS API request timed out after ${duration}ms | URL: ${env.VPS_API_URL} | Timeout: ${API_TIMEOUT_MS}ms`);
    } else {
      // VPS unreachable - will fallback to direct forwarding
      console.error(`[ERROR] VPS API error after ${duration}ms | URL: ${env.VPS_API_URL} | Error: ${error.message || error}`);
    }
    
    return null;
  }
}

export default {
  /**
   * HTTP handler for health check endpoint
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Basic health check - just checks Worker is running
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        status: 'ok',
        workerName: env.WORKER_NAME,
        timestamp: Date.now(),
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Sync cached monitoring hits to VPS API
    // Requirements: 8.4
    if (url.pathname === '/sync-monitoring-cache') {
      const result = await syncCachedMonitoringHits(env);
      return new Response(JSON.stringify({
        status: 'ok',
        workerName: env.WORKER_NAME,
        timestamp: Date.now(),
        ...result,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Full connectivity test - tests Worker -> VPS connection
    if (url.pathname === '/test-connection') {
      const result = {
        workerName: env.WORKER_NAME,
        vpsApiUrl: env.VPS_API_URL || 'NOT SET',
        vpsApiToken: env.VPS_API_TOKEN ? '***configured***' : 'NOT SET',
        timestamp: Date.now(),
        vpsConnection: { success: false, error: '', latency: 0 },
      };

      if (!env.VPS_API_URL) {
        result.vpsConnection.error = 'VPS_API_URL not configured';
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Test actual connection to VPS
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const testPayload = {
          from: 'health-check@test.local',
          to: 'health-check@test.local',
          subject: '[HEALTH CHECK] Connection Test',
          messageId: 'health-check-' + Date.now(),
          timestamp: Date.now(),
          workerName: env.WORKER_NAME,
          isHealthCheck: true,
        };

        const response = await fetch(env.VPS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + env.VPS_API_TOKEN,
          },
          body: JSON.stringify(testPayload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        result.vpsConnection.latency = Date.now() - startTime;

        if (response.ok) {
          result.vpsConnection.success = true;
        } else {
          const errorText = await response.text();
          result.vpsConnection.error = 'HTTP ' + response.status + ': ' + errorText.substring(0, 100);
        }
      } catch (error: any) {
        result.vpsConnection.latency = Date.now() - startTime;
        result.vpsConnection.error = error.name === 'AbortError' ? 'Timeout (5s)' : (error.message || 'Unknown error');
      }

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response('Not Found', { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    // Extract essential fields only (no body parsing to minimize CPU)
    const from = extractEmail(message.from);
    const to = message.to;
    const subject = message.headers.get('subject') || '';
    const messageId = message.headers.get('message-id') || crypto.randomUUID();

    // Use lazy evaluation for debug logs to skip string construction when disabled
    if (isDebugEnabled(env)) {
      debugLog(env, '[DEBUG] ========== Email Received ==========');
      debugLog(env, `[DEBUG] From: ${from}`);
      debugLog(env, `[DEBUG] To: ${to}`);
      debugLog(env, `[DEBUG] Subject: ${subject}`);
      debugLog(env, `[DEBUG] Message-ID: ${messageId}`);
    }

    // Build minimal webhook payload (Requirements: 9.1, 9.2)
    const payload = buildMinimalPayload(from, to, subject, messageId, env.WORKER_NAME);

    // Campaign analytics and signal monitoring are now handled by VPS API
    // in the main webhook endpoint, eliminating redundant API calls

    // Get filter decision from VPS API
    const decision = await getFilterDecision(payload, env);

    // Fallback: if VPS is unreachable, forward to default address
    if (!decision) {
      debugLog(env, `[DEBUG] VPS unreachable, forwarding to default: ${env.DEFAULT_FORWARD_TO}`);
      await message.forward(env.DEFAULT_FORWARD_TO);
      return;
    }

    // Execute the filter decision
    if (decision.action === 'forward') {
      const forwardTo = decision.forwardTo || env.DEFAULT_FORWARD_TO;
      debugLog(env, `[DEBUG] Action: FORWARD to ${forwardTo}`);
      await message.forward(forwardTo);
    } else {
      debugLog(env, `[DEBUG] Action: DROP (reason: ${decision.reason || 'no reason'})`);
    }
    // For 'drop' action: do nothing (silent drop)
    // Not calling any method causes the email to be silently discarded
  },
};
