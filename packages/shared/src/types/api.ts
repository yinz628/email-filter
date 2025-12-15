/**
 * Standard API error response
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
}

/**
 * Standard API success response wrapper
 */
export interface SuccessResponse<T> {
  data: T;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Authentication request
 */
export interface AuthLoginRequest {
  password: string;
}

/**
 * Authentication response
 */
export interface AuthLoginResponse {
  token: string;
}

/**
 * Token verification response
 */
export interface AuthVerifyResponse {
  valid: boolean;
}
