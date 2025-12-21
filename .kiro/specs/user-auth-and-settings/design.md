# Design Document

## Overview

本设计文档描述用户认证系统和服务器端设置存储的技术实现方案。

主要组件：
1. **UserService** - 用户管理（创建、验证、更新、删除）
2. **AuthService** - 认证逻辑（登录、登出、JWT生成/验证）
3. **UserSettingsService** - 用户设置管理
4. **JWT中间件** - 请求认证
5. **登录界面** - 前端登录页面

技术选型：
- **密码哈希**: bcrypt（salt rounds: 10）
- **JWT库**: jsonwebtoken
- **Token过期**: 24小时
- **Token黑名单**: 内存存储（可扩展为Redis）

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Frontend (HTML/JS)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ Login Page      │  │ Settings Sync   │  │ Auth State Manager      │  │
│  │ (登录页面)       │  │ (设置同步)       │  │ (认证状态管理)           │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        REST API (Fastify)                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ POST /auth/login│  │ GET/PUT         │  │ GET/POST/DELETE         │  │
│  │ POST /auth/logout│ │ /user/settings  │  │ /admin/users            │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        JWT Auth Middleware                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ verifyToken() → checkBlacklist() → attachUserToRequest()        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Services                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ AuthService     │  │ UserSettings    │  │ UserService             │  │
│  │ - login()       │  │ Service         │  │ - createUser()          │  │
│  │ - logout()      │  │ - get/set()     │  │ - updateUser()          │  │
│  │ - generateJWT() │  │ - getAll()      │  │ - deleteUser()          │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      SQLite Database                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ users           │  │ user_settings   │  │ token_blacklist         │  │
│  │ - id            │  │ - id            │  │ - token_hash            │  │
│  │ - username      │  │ - user_id       │  │ - expires_at            │  │
│  │ - password_hash │  │ - key           │  │ - created_at            │  │
│  │ - role          │  │ - value (JSON)  │  └─────────────────────────┘  │
│  │ - created_at    │  │ - updated_at    │                               │
│  └─────────────────┘  └─────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. UserService

```typescript
class UserService {
  constructor(private db: Database.Database) {}

  /**
   * 创建用户
   */
  createUser(data: CreateUserDTO): User;

  /**
   * 通过用户名查找用户
   */
  findByUsername(username: string): User | null;

  /**
   * 通过ID查找用户
   */
  findById(id: string): User | null;

  /**
   * 获取所有用户（不含密码）
   */
  getAllUsers(): UserWithoutPassword[];

  /**
   * 更新用户
   */
  updateUser(id: string, data: UpdateUserDTO): User | null;

  /**
   * 删除用户
   */
  deleteUser(id: string): boolean;

  /**
   * 验证密码
   */
  verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean>;

  /**
   * 哈希密码
   */
  hashPassword(plainPassword: string): Promise<string>;

  /**
   * 创建默认管理员（如果不存在）
   */
  ensureDefaultAdmin(): void;
}
```

### 2. AuthService

```typescript
class AuthService {
  constructor(
    private userService: UserService,
    private jwtSecret: string,
    private tokenExpiry: string = '24h'
  ) {}

  /**
   * 用户登录
   */
  async login(username: string, password: string): Promise<LoginResult>;

  /**
   * 用户登出
   */
  logout(token: string): void;

  /**
   * 生成JWT Token
   */
  generateToken(user: User): string;

  /**
   * 验证JWT Token
   */
  verifyToken(token: string): TokenPayload | null;

  /**
   * 检查Token是否在黑名单中
   */
  isTokenBlacklisted(token: string): boolean;

  /**
   * 清理过期的黑名单Token
   */
  cleanupBlacklist(): void;
}
```

### 3. UserSettingsService

```typescript
class UserSettingsService {
  constructor(private db: Database.Database) {}

  /**
   * 获取用户的所有设置
   */
  getAllSettings(userId: string): Record<string, any>;

  /**
   * 获取单个设置
   */
  getSetting(userId: string, key: string): any | null;

  /**
   * 设置单个值
   */
  setSetting(userId: string, key: string, value: any): void;

  /**
   * 批量设置
   */
  setSettings(userId: string, settings: Record<string, any>): void;

  /**
   * 删除设置
   */
  deleteSetting(userId: string, key: string): void;

  /**
   * 删除用户的所有设置
   */
  deleteAllSettings(userId: string): void;
}
```

### 4. REST API Endpoints

#### POST /api/auth/login
用户登录

Request Body:
```json
{
  "username": "admin",
  "password": "password123"
}
```

Response (200):
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "admin"
  }
}
```

Response (401):
```json
{
  "success": false,
  "error": "Invalid username or password"
}
```

#### POST /api/auth/logout
用户登出

Request Headers:
```
Authorization: Bearer <token>
```

Response (200):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### GET /api/user/settings
获取当前用户的所有设置

Response:
```json
{
  "autoRefresh": {
    "logs": { "enabled": true, "interval": 60 },
    "stats": { "enabled": false, "interval": 300 }
  },
  "defaultWorker": "worker-a",
  "theme": "light"
}
```

#### PUT /api/user/settings
更新用户设置

Request Body:
```json
{
  "autoRefresh": {
    "logs": { "enabled": true, "interval": 30 }
  }
}
```

#### GET /api/admin/users
获取所有用户（仅管理员）

Response:
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "admin",
      "role": "admin",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/admin/users
创建用户（仅管理员）

Request Body:
```json
{
  "username": "newuser",
  "password": "password123",
  "role": "user"
}
```

#### DELETE /api/admin/users/:id
删除用户（仅管理员）

## Data Models

### 数据库表

#### users
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_users_username ON users(username);
```

#### user_settings
```sql
CREATE TABLE user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, key)
);
CREATE INDEX idx_user_settings_user ON user_settings(user_id);
```

#### token_blacklist
```sql
CREATE TABLE token_blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_token_blacklist_hash ON token_blacklist(token_hash);
CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);
```

### TypeScript 接口

```typescript
interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

interface UserWithoutPassword {
  id: string;
  username: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

interface CreateUserDTO {
  username: string;
  password: string;
  role?: 'admin' | 'user';
}

interface UpdateUserDTO {
  password?: string;
  role?: 'admin' | 'user';
}

interface LoginResult {
  success: boolean;
  token?: string;
  user?: UserWithoutPassword;
  error?: string;
}

interface TokenPayload {
  userId: string;
  username: string;
  role: 'admin' | 'user';
  iat: number;
  exp: number;
}

interface UserSetting {
  userId: string;
  key: string;
  value: any;
  updatedAt: Date;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Password Security
*For any* user creation or password update, the stored password_hash should NOT equal the plain text password, and bcrypt.compare should return true for the original password.
**Validates: Requirements 1.3, 2.2**

### Property 2: Login Validation
*For any* login attempt, the system should return success only when both username exists AND password matches the stored hash; otherwise return 401.
**Validates: Requirements 2.1, 2.2, 2.6**

### Property 3: JWT Token Integrity
*For any* generated JWT token, decoding it should return the correct user_id, username, and role; and the token should be verifiable with the secret key.
**Validates: Requirements 2.3, 2.4, 2.5**

### Property 4: Token Blacklist Enforcement
*For any* logged-out token, subsequent requests using that token should be rejected with 401.
**Validates: Requirements 3.1, 3.2, 3.3, 4.5**

### Property 5: JWT Validation
*For any* request with invalid JWT (wrong signature, expired, or malformed), the system should return 401 Unauthorized.
**Validates: Requirements 4.2, 4.4**

### Property 6: User Settings Isolation
*For any* two users A and B, user A should only be able to read and write their own settings, never user B's settings.
**Validates: Requirements 6.1, 6.4**

### Property 7: Settings Persistence
*For any* setting update, the value should be retrievable in subsequent requests and survive server restarts.
**Validates: Requirements 6.2, 6.3**

### Property 8: Admin Authorization
*For any* user management operation (list, create, update, delete users), only users with role='admin' should be allowed; others should receive 403.
**Validates: Requirements 10.1, 10.5**

### Property 9: Username Uniqueness
*For any* user creation attempt with an existing username, the system should reject with an error.
**Validates: Requirements 10.2**

### Property 10: User Deletion Cascade
*For any* user deletion, all associated user_settings records should also be deleted.
**Validates: Requirements 10.4**

### Property 11: Legacy Auth Compatibility
*For any* request with valid API_TOKEN (when configured), the system should accept the request alongside JWT auth.
**Validates: Requirements 9.1, 9.2**

## Error Handling

1. **Invalid Credentials**: Return 401 with generic error message (don't reveal if username exists)
2. **Expired Token**: Return 401 with "Token expired" message
3. **Invalid Token**: Return 401 with "Invalid token" message
4. **Blacklisted Token**: Return 401 with "Token revoked" message
5. **Forbidden**: Return 403 for non-admin accessing admin routes
6. **Username Exists**: Return 400 with "Username already exists" message
7. **User Not Found**: Return 404 for operations on non-existent users

## Testing Strategy

### Unit Tests
- Test UserService password hashing and verification
- Test AuthService JWT generation and verification
- Test UserSettingsService CRUD operations
- Test token blacklist functionality

### Property-Based Tests
Using fast-check library:

- **Property 1**: Generate random passwords, verify hash != plain and compare works
- **Property 2**: Generate random credentials, verify login logic
- **Property 3**: Generate users, verify JWT payload integrity
- **Property 4**: Generate tokens, logout, verify rejection
- **Property 5**: Generate invalid tokens, verify 401
- **Property 6**: Generate two users with settings, verify isolation
- **Property 7**: Generate settings, verify persistence
- **Property 8**: Generate admin/non-admin users, verify authorization
- **Property 9**: Generate duplicate usernames, verify rejection
- **Property 10**: Delete users, verify settings cascade
- **Property 11**: Test both JWT and legacy token auth

### Integration Tests
- Test full login → use API → logout flow
- Test settings sync across requests
- Test admin user management flow

