# Implementation Plan

- [x] 1. 数据库Schema升级











  - [x] 1.1 创建用户认证相关表


    - 在 migrate-campaign.ts 中添加 users 表
    - 添加 user_settings 表
    - 添加 token_blacklist 表
    - 添加必要的索引
    - _Requirements: 1.1, 1.2, 5.1, 5.2_



  - [x] 1.2 添加依赖包


    - 安装 bcrypt 和 @types/bcrypt
    - 安装 jsonwebtoken 和 @types/jsonwebtoken
    - _Requirements: 1.3, 2.3_

- [x] 2. 实现UserService






  - [x] 2.1 创建UserService类


    - 创建 packages/vps-api/src/services/user.service.ts
    - 实现 createUser() 方法
    - 实现 findByUsername() 方法
    - 实现 findById() 方法
    - 实现 getAllUsers() 方法
    - 实现 updateUser() 方法
    - 实现 deleteUser() 方法
    - _Requirements: 1.2, 10.1, 10.3, 10.4_


  - [x] 2.2 实现密码哈希功能

    - 实现 hashPassword() 方法（bcrypt, salt rounds: 10）
    - 实现 verifyPassword() 方法
    - _Requirements: 1.3, 2.2_

  - [x] 2.3 编写密码安全属性测试


    - **Property 1: Password Security**
    - 验证哈希后密码不等于原文
    - 验证bcrypt.compare正确工作
    - **Validates: Requirements 1.3, 2.2**

  - [x] 2.4 实现默认管理员创建


    - 实现 ensureDefaultAdmin() 方法
    - 从环境变量读取默认凭据
    - 系统启动时调用
    - _Requirements: 1.4, 1.5_

- [x] 3. 实现AuthService






  - [x] 3.1 创建AuthService类


    - 创建 packages/vps-api/src/services/auth.service.ts
    - 实现构造函数（注入UserService, jwtSecret, tokenExpiry）
    - _Requirements: 2.3_


  - [x] 3.2 实现登录功能
    - 实现 login() 方法
    - 验证用户名存在
    - 验证密码匹配
    - 生成JWT Token
    - _Requirements: 2.1, 2.2, 2.3, 2.6_

  - [x] 3.3 编写登录验证属性测试


    - **Property 2: Login Validation**
    - 验证正确凭据返回成功
    - 验证错误凭据返回401
    - **Validates: Requirements 2.1, 2.2, 2.6**


  - [x] 3.4 实现JWT生成和验证
    - 实现 generateToken() 方法
    - 实现 verifyToken() 方法
    - 包含user_id, username, role, exp
    - _Requirements: 2.3, 2.4, 2.5_

  - [x] 3.5 编写JWT完整性属性测试


    - **Property 3: JWT Token Integrity**
    - 验证JWT payload包含正确信息
    - 验证Token可用secret验证

    - **Validates: Requirements 2.3, 2.4, 2.5**

  - [x] 3.6 实现登出和Token黑名单
    - 实现 logout() 方法
    - 实现 isTokenBlacklisted() 方法
    - 实现 cleanupBlacklist() 方法
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.7 编写Token黑名单属性测试


    - **Property 4: Token Blacklist Enforcement**
    - 验证登出后Token被拒绝
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 4. Checkpoint - 确保认证服务测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 实现JWT认证中间件






  - [x] 5.1 更新认证中间件


    - 修改 packages/vps-api/src/middleware/auth.ts
    - 支持JWT Token验证
    - 支持旧版API_TOKEN兼容
    - 检查Token黑名单
    - 将用户信息附加到请求上下文
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2_

  - [x] 5.2 编写JWT验证属性测试


    - **Property 5: JWT Validation**
    - 验证无效Token返回401
    - 验证过期Token返回401
    - **Validates: Requirements 4.2, 4.4**

  - [x] 5.3 编写旧版兼容属性测试


    - **Property 11: Legacy Auth Compatibility**
    - 验证API_TOKEN仍然有效
    - **Validates: Requirements 9.1, 9.2**

- [x] 6. 实现UserSettingsService







  - [x] 6.1 创建UserSettingsService类

    - 创建 packages/vps-api/src/services/user-settings.service.ts
    - 实现 getAllSettings() 方法
    - 实现 getSetting() 方法
    - 实现 setSetting() 方法
    - 实现 setSettings() 方法（批量）
    - 实现 deleteSetting() 方法
    - 实现 deleteAllSettings() 方法
    - _Requirements: 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.5_


  - [x] 6.2 编写设置隔离属性测试

    - **Property 6: User Settings Isolation**
    - 验证用户只能访问自己的设置
    - **Validates: Requirements 6.1, 6.4**


  - [x] 6.3 编写设置持久化属性测试

    - **Property 7: Settings Persistence**
    - 验证设置保存后可检索
    - **Validates: Requirements 6.2, 6.3**

- [x] 7. 添加REST API端点







  - [x] 7.1 添加认证API

    - POST /api/auth/login
    - POST /api/auth/logout
    - GET /api/auth/me（获取当前用户信息）
    - _Requirements: 2.1, 2.7, 3.4_


  - [x] 7.2 添加用户设置API
    - GET /api/user/settings
    - PUT /api/user/settings
    - _Requirements: 6.1, 6.2, 6.3_


  - [x] 7.3 添加用户管理API（仅管理员）
    - GET /api/admin/users
    - POST /api/admin/users
    - PUT /api/admin/users/:id
    - DELETE /api/admin/users/:id

    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 7.4 编写管理员授权属性测试

    - **Property 8: Admin Authorization**
    - 验证非管理员访问返回403
    - **Validates: Requirements 10.1, 10.5**


  - [x] 7.5 编写用户名唯一性属性测试

    - **Property 9: Username Uniqueness**
    - 验证重复用户名被拒绝
    - **Validates: Requirements 10.2**


  - [x] 7.6 编写用户删除级联属性测试

    - **Property 10: User Deletion Cascade**
    - 验证删除用户时设置也被删除
    - **Validates: Requirements 10.4**

- [x] 8. Checkpoint - 确保API测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. 更新前端









  - [x] 9.1 创建登录页面





    - 添加登录表单（用户名、密码）
    - 添加登录按钮
    - 添加错误提示
    - 登录成功后跳转到主页
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.2 更新认证状态管理





    - 存储JWT Token到localStorage
    - 检查Token有效性
    - 未登录时重定向到登录页
    - 添加登出按钮
    - _Requirements: 7.6_

  - [x] 9.3 实现设置同步





    - 登录时从服务器加载设置
    - 设置变更时保存到服务器
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 9.4 实现localStorage数据迁移





    - 首次登录时检测localStorage中的旧设置
    - 将旧设置上传到服务器
    - 上传成功后显示确认对话框，询问用户是否清除本地旧设置
    - 用户确认后清除localStorage中的旧设置
    - 显示迁移成功提示
    - _Requirements: 8.2, 8.3_

  - [x] 9.5 添加用户管理界面（管理员）





    - 添加用户列表页面
    - 添加创建用户表单
    - 添加编辑/删除用户功能
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 10. 配置和环境变量







  - [x] 10.1 添加环境变量配置

    - JWT_SECRET - JWT签名密钥
    - JWT_EXPIRY - Token过期时间（默认24h）
    - DEFAULT_ADMIN_USERNAME - 默认管理员用户名
    - DEFAULT_ADMIN_PASSWORD - 默认管理员密码
    - _Requirements: 1.5, 2.5_


  - [x] 10.2 更新配置文件

    - 更新 config.ts 读取新环境变量
    - 更新 .env.example 添加新变量
    - _Requirements: 1.5_

- [x] 11. 清理和文档







  - [x] 11.1 更新shared类型定义

    - 添加User接口
    - 添加LoginResult接口
    - 添加TokenPayload接口
    - 添加UserSetting接口
    - _Requirements: 所有_


  - [x] 11.2 添加旧版认证弃用警告

    - 使用API_TOKEN时记录警告日志
    - _Requirements: 9.4_

- [x] 12. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

