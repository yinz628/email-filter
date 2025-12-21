/**
 * Shared authentication and user types
 * Used across vps-api, vps-admin, and frontend packages
 */

/**
 * User role types
 */
export type UserRole = 'admin' | 'user';

/**
 * User entity (full, including password hash - for internal use only)
 */
export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User without password hash (for API responses)
 */
export interface UserWithoutPassword {
  id: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for creating a new user
 */
export interface CreateUserDTO {
  username: string;
  password: string;
  role?: UserRole;
}

/**
 * DTO for updating a user
 */
export interface UpdateUserDTO {
  password?: string;
  role?: UserRole;
}

/**
 * JWT Token payload structure
 * Requirements: 2.4
 */
export interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Login result structure
 * Requirements: 2.3, 2.6, 2.7
 */
export interface LoginResult {
  success: boolean;
  token?: string;
  user?: UserWithoutPassword;
  error?: string;
}

/**
 * User setting entity
 */
export interface UserSetting {
  userId: string;
  key: string;
  value: any;
  updatedAt: Date;
}

/**
 * Login request body
 */
export interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Logout response
 */
export interface LogoutResponse {
  success: boolean;
  message: string;
}

/**
 * User settings response
 */
export interface UserSettingsResponse {
  settings: Record<string, any>;
}

/**
 * User list response (admin)
 */
export interface UserListResponse {
  users: UserWithoutPassword[];
}
