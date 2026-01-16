/**
 * Fetch utilities with timeout support
 * Provides a reusable fetch wrapper with configurable timeout
 */

/** Default timeout values in milliseconds */
export const TIMEOUT = {
  /** API filter decision timeout (5 seconds) */
  API_FILTER: 5000,
  /** Tracking/monitoring timeout (3 seconds) */
  TRACKING: 3000,
  /** Health check timeout (5 seconds) */
  HEALTH_CHECK: 5000,
} as const;

/**
 * Result of a fetch operation with timeout
 */
export interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/**
 * Options for fetchWithTimeout
 */
export interface FetchWithTimeoutOptions {
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** HTTP method (default: POST) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (will be JSON stringified if object) */
  body?: unknown;
}

/**
 * Perform a fetch request with timeout
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options including timeout
 * @returns FetchResult with success status and data or error
 */
export async function fetchWithTimeout<T>(
  url: string,
  options: FetchWithTimeoutOptions
): Promise<FetchResult<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: options.headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: errorText,
        status: response.status,
      };
    }

    const data = await response.json() as T;
    return {
      success: true,
      data,
      status: response.status,
    };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Request timeout (${options.timeoutMs}ms)`,
        };
      }
      return {
        success: false,
        error: error.message,
      };
    }
    
    return {
      success: false,
      error: 'Unknown error',
    };
  }
}

/**
 * Fire-and-forget fetch with timeout
 * Errors are logged but never thrown - useful for non-critical tracking
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options including timeout
 * @param debugLog - Optional debug logging function
 * @returns Promise that always resolves (never rejects)
 */
export async function fetchFireAndForget<T>(
  url: string,
  options: FetchWithTimeoutOptions,
  debugLog?: (...args: unknown[]) => void
): Promise<FetchResult<T>> {
  try {
    const result = await fetchWithTimeout<T>(url, options);
    
    if (!result.success && debugLog) {
      debugLog(`[DEBUG] Fire-and-forget request failed: ${result.error}`);
    }
    
    return result;
  } catch (error) {
    // This should never happen since fetchWithTimeout catches all errors
    // but we handle it just in case
    console.error('Unexpected error in fetchFireAndForget:', error);
    return {
      success: false,
      error: 'Unexpected error',
    };
  }
}

/**
 * Create authorization headers with Bearer token
 */
export function createAuthHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}
