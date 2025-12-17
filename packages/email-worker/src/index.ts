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
}

/** Debug logger - only logs when DEBUG_LOGGING is enabled */
function debugLog(env: Env, ...args: unknown[]): void {
  if (env.DEBUG_LOGGING === 'true') {
    console.log(...args);
  }
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

/**
 * Extract sender email from the "from" header
 * Handles formats like "Name <email@example.com>" or plain "email@example.com"
 */
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

/**
 * Get the VPS API base URL for campaign tracking
 * Derives from VPS_API_URL by removing the /api/webhook/email path
 */
function getVpsApiBaseUrl(env: Env): string | null {
  if (env.VPS_API_BASE_URL) {
    return env.VPS_API_BASE_URL;
  }
  
  if (!env.VPS_API_URL) {
    return null;
  }
  
  // Try to derive base URL from VPS_API_URL
  // e.g., "https://example.com/api/webhook/email" -> "https://example.com"
  try {
    const url = new URL(env.VPS_API_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

/**
 * Track email for campaign analytics
 * Sends email metadata to VPS API for campaign tracking
 * This is fire-and-forget - errors are logged but don't block email flow
 * 
 * Requirements: 8.1, 8.3
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
    debugLog(env, `[DEBUG] Tracking campaign email: ${trackUrl}`);
    debugLog(env, `[DEBUG] Campaign payload: ${JSON.stringify(payload)}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout (shorter than filter decision)

    const response = await fetch(trackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
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

/**
 * Call VPS API to get filter decision
 * Returns null if VPS is unreachable or returns an error
 */
async function getFilterDecision(
  payload: EmailWebhookPayload,
  env: Env
): Promise<FilterDecision | null> {
  try {
    debugLog(env, `[DEBUG] Calling VPS API: ${env.VPS_API_URL}`);
    debugLog(env, `[DEBUG] Payload: ${JSON.stringify(payload)}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(env.VPS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.VPS_API_TOKEN}`,
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
    debugLog(env, `[DEBUG] Filter decision: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    // VPS unreachable - will fallback to direct forwarding
    console.error('VPS API error:', error);
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
    
    // Full connectivity test - tests Worker -> VPS connection
    if (url.pathname === '/test-connection') {
      const result = {
        workerName: env.WORKER_NAME,
        vpsApiUrl: env.VPS_API_URL ? env.VPS_API_URL.substring(0, 50) + '...' : 'NOT SET',
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
    const receivedAt = new Date().toISOString();

    debugLog(env, `[DEBUG] ========== Email Received ==========`);
    debugLog(env, `[DEBUG] From: ${from}`);
    debugLog(env, `[DEBUG] To: ${to}`);
    debugLog(env, `[DEBUG] Subject: ${subject}`);
    debugLog(env, `[DEBUG] Message-ID: ${messageId}`);

    // Build minimal webhook payload
    const payload: EmailWebhookPayload = {
      from,
      to,
      subject,
      messageId,
      timestamp: Date.now(),
      workerName: env.WORKER_NAME,
    };

    // Track email for campaign analytics asynchronously (fire-and-forget)
    // Uses ctx.waitUntil to ensure the tracking completes even after response is sent
    // Requirements: 8.1, 8.3
    const campaignPayload: CampaignTrackPayload = {
      sender: from,
      subject,
      recipient: to,
      receivedAt,
    };
    ctx.waitUntil(trackCampaignEmail(campaignPayload, env));

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
