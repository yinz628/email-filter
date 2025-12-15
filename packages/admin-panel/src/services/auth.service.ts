/**
 * Authentication Service
 * Handles password hashing, JWT generation/verification, and logout
 */

/**
 * Admin configuration stored in database
 */
export interface AdminConfig {
  passwordHash: string;
  jwtSecret: string;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
}

/**
 * Token blacklist entry for logout handling
 */
interface BlacklistEntry {
  token: string;
  expiresAt: number;
}

// In-memory token blacklist (for logout handling)
// In production, this would be stored in KV or D1
const tokenBlacklist: Map<string, BlacklistEntry> = new Map();

/**
 * Hash a password using SHA-256
 * Note: In production, use a proper password hashing algorithm like bcrypt or argon2
 * For Cloudflare Workers, we use Web Crypto API
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

/**
 * Generate a JWT token
 */
export async function generateToken(
  jwtSecret: string,
  expiresInSeconds: number = 24 * 60 * 60 // 24 hours default
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: 'admin',
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const signature = await sign(`${encodedHeader}.${encodedPayload}`, jwtSecret);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify a JWT token
 */
export async function verifyToken(
  token: string,
  jwtSecret: string
): Promise<{ valid: boolean; payload?: JWTPayload; error?: string }> {
  // Check if token is blacklisted (logged out)
  if (isTokenBlacklisted(token)) {
    return { valid: false, error: 'Token has been revoked' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  // Verify signature
  const expectedSignature = await sign(`${encodedHeader}.${encodedPayload}`, jwtSecret);
  if (signature !== expectedSignature) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Decode and validate payload
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload;
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Invalid payload' };
  }
}

/**
 * Invalidate a token (logout)
 */
export function invalidateToken(token: string): void {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return;
    
    const payload = JSON.parse(base64UrlDecode(parts[1])) as JWTPayload;
    
    // Add to blacklist with expiration time
    tokenBlacklist.set(token, {
      token,
      expiresAt: payload.exp * 1000, // Convert to milliseconds
    });
    
    // Clean up expired entries
    cleanupBlacklist();
  } catch {
    // Ignore invalid tokens
  }
}

/**
 * Check if a token is blacklisted
 */
export function isTokenBlacklisted(token: string): boolean {
  return tokenBlacklist.has(token);
}

/**
 * Clean up expired entries from the blacklist
 */
function cleanupBlacklist(): void {
  const now = Date.now();
  for (const [token, entry] of tokenBlacklist.entries()) {
    if (entry.expiresAt < now) {
      tokenBlacklist.delete(token);
    }
  }
}

/**
 * Clear the token blacklist (for testing)
 */
export function clearBlacklist(): void {
  tokenBlacklist.clear();
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Sign data with HMAC-SHA256
 */
async function sign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signatureArray = Array.from(new Uint8Array(signature));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  return signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * AuthService class for managing authentication
 */
export class AuthService {
  constructor(private db: D1Database) {}

  /**
   * Get admin configuration from database
   */
  async getConfig(): Promise<AdminConfig | null> {
    const passwordHashRow = await this.db
      .prepare('SELECT value FROM admin_config WHERE key = ?')
      .bind('passwordHash')
      .first<{ value: string }>();

    const jwtSecretRow = await this.db
      .prepare('SELECT value FROM admin_config WHERE key = ?')
      .bind('jwtSecret')
      .first<{ value: string }>();

    if (!passwordHashRow || !jwtSecretRow) {
      return null;
    }

    return {
      passwordHash: passwordHashRow.value,
      jwtSecret: jwtSecretRow.value,
    };
  }

  /**
   * Set admin configuration in database
   */
  async setConfig(config: AdminConfig): Promise<void> {
    await this.db.batch([
      this.db
        .prepare('INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)')
        .bind('passwordHash', config.passwordHash),
      this.db
        .prepare('INSERT OR REPLACE INTO admin_config (key, value) VALUES (?, ?)')
        .bind('jwtSecret', config.jwtSecret),
    ]);
  }

  /**
   * Initialize admin configuration with default password
   */
  async initializeConfig(defaultPassword: string): Promise<AdminConfig> {
    const passwordHash = await hashPassword(defaultPassword);
    const jwtSecret = crypto.randomUUID() + crypto.randomUUID(); // Generate random secret
    
    const config: AdminConfig = { passwordHash, jwtSecret };
    await this.setConfig(config);
    
    return config;
  }

  /**
   * Login with password
   */
  async login(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const config = await this.getConfig();
    
    if (!config) {
      return { success: false, error: 'Admin not configured' };
    }

    const isValid = await verifyPassword(password, config.passwordHash);
    
    if (!isValid) {
      return { success: false, error: 'Invalid password' };
    }

    const token = await generateToken(config.jwtSecret);
    return { success: true, token };
  }

  /**
   * Verify a token
   */
  async verify(token: string): Promise<{ valid: boolean; error?: string }> {
    const config = await this.getConfig();
    
    if (!config) {
      return { valid: false, error: 'Admin not configured' };
    }

    const result = await verifyToken(token, config.jwtSecret);
    return { valid: result.valid, error: result.error };
  }

  /**
   * Logout (invalidate token)
   */
  logout(token: string): void {
    invalidateToken(token);
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const config = await this.getConfig();
    
    if (!config) {
      return { success: false, error: 'Admin not configured' };
    }

    const isValid = await verifyPassword(currentPassword, config.passwordHash);
    
    if (!isValid) {
      return { success: false, error: 'Invalid current password' };
    }

    const newPasswordHash = await hashPassword(newPassword);
    await this.setConfig({ ...config, passwordHash: newPasswordHash });
    
    return { success: true };
  }
}
