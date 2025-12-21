# Requirements Document

## Introduction

本次升级将实现用户认证系统和服务器端用户设置存储功能。

**当前问题：**
1. 当前使用静态API Token认证，所有用户共享同一个Token
2. 用户设置（自动刷新、Worker选择等）存储在浏览器localStorage中
3. localStorage导致设置无法跨浏览器/设备同步
4. 清除浏览器数据会丢失所有设置

**解决方案：**
1. 实现基于用户名/密码的登录系统
2. 使用JWT（JSON Web Token）进行会话管理
3. 将用户设置存储到服务器端数据库
4. 支持多用户，每个用户有独立的设置

**安全考虑：**
1. 密码使用bcrypt哈希存储
2. JWT Token有过期时间
3. 支持登出功能使Token失效
4. 首次部署时创建默认管理员账户

## Glossary

- **User（用户）**: 系统的登录用户，拥有用户名和密码
- **JWT（JSON Web Token）**: 用于用户会话管理的令牌
- **User Settings（用户设置）**: 用户的个性化配置，如自动刷新、默认Worker等
- **Session（会话）**: 用户登录后的有效期间
- **bcrypt**: 密码哈希算法，用于安全存储密码
- **Refresh Token**: 用于刷新访问令牌的长期令牌（可选）

## Requirements

### Requirement 1: 用户数据模型

**User Story:** As a system administrator, I want to manage user accounts, so that different users can have their own credentials and settings.

#### Acceptance Criteria

1. WHEN the system starts THEN the System SHALL create users table if not exists
2. WHEN a user is created THEN the System SHALL store username, password_hash, role, and timestamps
3. WHEN storing password THEN the System SHALL hash it using bcrypt with appropriate salt rounds
4. WHEN the system first starts with empty users table THEN the System SHALL create a default admin user
5. WHEN creating default admin THEN the System SHALL use configurable credentials from environment variables

### Requirement 2: 用户登录

**User Story:** As a user, I want to log in with username and password, so that I can access the system securely.

#### Acceptance Criteria

1. WHEN a user submits login credentials THEN the System SHALL verify username exists
2. WHEN username exists THEN the System SHALL verify password against stored hash
3. WHEN credentials are valid THEN the System SHALL generate a JWT token
4. WHEN generating JWT THEN the System SHALL include user_id, username, and role in payload
5. WHEN generating JWT THEN the System SHALL set expiration time (default 24 hours)
6. WHEN credentials are invalid THEN the System SHALL return 401 with error message
7. WHEN login succeeds THEN the System SHALL return JWT token to client

### Requirement 3: 用户登出

**User Story:** As a user, I want to log out, so that my session is terminated securely.

#### Acceptance Criteria

1. WHEN a user requests logout THEN the System SHALL invalidate the current JWT token
2. WHEN token is invalidated THEN the System SHALL add it to a blacklist until expiration
3. WHEN a blacklisted token is used THEN the System SHALL reject the request with 401
4. WHEN logout succeeds THEN the System SHALL return success response

### Requirement 4: JWT认证中间件

**User Story:** As a developer, I want JWT-based authentication middleware, so that protected routes verify user identity.

#### Acceptance Criteria

1. WHEN a request has Authorization header THEN the System SHALL extract Bearer token
2. WHEN token is extracted THEN the System SHALL verify JWT signature and expiration
3. WHEN token is valid THEN the System SHALL attach user info to request context
4. WHEN token is invalid or expired THEN the System SHALL return 401 Unauthorized
5. WHEN token is blacklisted THEN the System SHALL return 401 Unauthorized
6. WHEN no Authorization header THEN the System SHALL return 401 Unauthorized

### Requirement 5: 用户设置数据模型

**User Story:** As a user, I want my settings stored on the server, so that I can access them from any browser or device.

#### Acceptance Criteria

1. WHEN the system starts THEN the System SHALL create user_settings table if not exists
2. WHEN storing settings THEN the System SHALL associate them with user_id
3. WHEN storing settings THEN the System SHALL support key-value pairs with JSON values
4. WHEN a setting is updated THEN the System SHALL update the timestamp

### Requirement 6: 用户设置API

**User Story:** As a user, I want to save and retrieve my settings via API, so that my preferences are synchronized.

#### Acceptance Criteria

1. WHEN a user requests their settings THEN the System SHALL return all settings for that user
2. WHEN a user updates a setting THEN the System SHALL save it to the database
3. WHEN a user updates multiple settings THEN the System SHALL batch update them
4. WHEN retrieving settings THEN the System SHALL only return the authenticated user's settings
5. WHEN a setting doesn't exist THEN the System SHALL return default value or null

### Requirement 7: 登录界面

**User Story:** As a user, I want a login page, so that I can enter my credentials to access the system.

#### Acceptance Criteria

1. WHEN accessing the system without authentication THEN the System SHALL show login page
2. WHEN login page is shown THEN the System SHALL display username and password fields
3. WHEN login page is shown THEN the System SHALL display a login button
4. WHEN login fails THEN the System SHALL display error message
5. WHEN login succeeds THEN the System SHALL redirect to main dashboard
6. WHEN user is already logged in THEN the System SHALL skip login page

### Requirement 8: 前端设置同步

**User Story:** As a user, I want my settings automatically synced with the server, so that changes are persisted.

#### Acceptance Criteria

1. WHEN user changes a setting THEN the System SHALL save it to server immediately
2. WHEN user logs in THEN the System SHALL load settings from server
3. WHEN settings are loaded THEN the System SHALL apply them to the UI
4. WHEN server is unavailable THEN the System SHALL use cached settings temporarily
5. WHEN settings sync fails THEN the System SHALL show error notification

### Requirement 9: 迁移现有Token认证

**User Story:** As a system administrator, I want backward compatibility during migration, so that existing deployments continue to work.

#### Acceptance Criteria

1. WHEN API_TOKEN environment variable is set THEN the System SHALL support legacy token auth
2. WHEN both JWT and legacy token are valid THEN the System SHALL accept either
3. WHEN migrating THEN the System SHALL preserve existing functionality
4. WHEN legacy auth is used THEN the System SHALL log deprecation warning

### Requirement 10: 用户管理（管理员功能）

**User Story:** As an administrator, I want to manage users, so that I can add, modify, or remove user accounts.

#### Acceptance Criteria

1. WHEN admin requests user list THEN the System SHALL return all users (without passwords)
2. WHEN admin creates a user THEN the System SHALL validate username uniqueness
3. WHEN admin updates a user THEN the System SHALL allow changing password and role
4. WHEN admin deletes a user THEN the System SHALL remove user and their settings
5. WHEN non-admin requests user management THEN the System SHALL return 403 Forbidden

