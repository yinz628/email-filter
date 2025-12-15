/**
 * Response Utilities
 * Standard response format helpers for API endpoints
 */

import type { ErrorResponse, SuccessResponse } from '@email-filter/shared';

/**
 * Create a success response
 */
export function successResponse<T>(data: T): SuccessResponse<T> {
  return { data };
}

/**
 * Create an error response
 */
export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, string>
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}
