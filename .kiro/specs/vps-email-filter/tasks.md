# Implementation Plan

## 项目结构

```
vps-email-filter/
├── email-worker/          # Cloudflare Email Worker（极简）
├── vps-api/               # VPS 上的过滤 API
├── vps-admin/             # VPS 上的管理面板
└── shared/                # 共享类型定义
```

---

- [x] 1. 初始化项目结构和共享模块





  - [x] 1.1 创建 monorepo 项目结构


    - 创建 `vps-email-filter/` 目录
    - 初始化 pnpm workspace
    - 配置 TypeScript、ESLint
    - _Requirements: 1.4, 9.3_

  - [x] 1.2 创建 shared 模块





    - 定义 FilterRule、RuleCategory、MatchType、MatchMode 类型
    - 定义 EmailWebhookPayload、FilterDecision 接口
    - 定义 DynamicConfig、ForwardConfig 类型
    - 实现 matcher 工具函数（exact、contains、startsWith、endsWith、regex）

    - _Requirements: 4.5_
  - [x] 1.3 编写 matcher 属性测试




    - **Property 6: 匹配模式正确性**
    - **Validates: Requirements 4.5**

- [x] 2. 实现 VPS API 核心功能





  - [x] 2.1 初始化 VPS API 项目


    - 创建 Fastify 应用框架
    - 配置环境变量加载
    - 实现健康检查接口 `/health`
    - _Requirements: 1.1, 1.2, 1.4_


  - [x] 2.2 实现数据库层

    - 创建 SQLite 数据库初始化逻辑
    - 编写 schema.sql 表结构
    - 实现 RuleRepository（CRUD 操作）
    - 实现 StatsRepository（统计操作）

    - _Requirements: 1.1, 1.3_
  - [x] 2.3 编写 RuleRepository 属性测试

    - **Property 1: 规则 CRUD 一致性**
    - **Validates: Requirements 3.1, 3.3, 3.4**
  - [x] 2.4 编写规则启用状态切换属性测试


    - **Property 2: 规则启用状态切换**
    - **Validates: Requirements 3.5**

- [x] 3. 实现认证中间件





  - [x] 3.1 实现 Bearer Token 认证


    - 创建 auth 中间件
    - 验证 Authorization header
    - 返回 401 状态码（无效 token）
    - _Requirements: 8.1, 8.2_

  - [x] 3.2 编写认证属性测试

    - **Property 13: 认证验证**
    - **Validates: Requirements 8.1, 8.2**

- [x] 4. 实现过滤服务





  - [x] 4.1 实现 FilterService


    - 实现规则匹配逻辑
    - 实现白名单优先级处理
    - 实现默认转发逻辑
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 4.2 编写白名单优先级属性测试


    - **Property 3: 白名单优先级**
    - **Validates: Requirements 4.3**
  - [x] 4.3 编写黑名单过滤属性测试


    - **Property 4: 黑名单过滤**
    - **Validates: Requirements 4.2**
  - [x] 4.4 编写默认转发属性测试


    - **Property 5: 默认转发**
    - **Validates: Requirements 4.4**

- [x] 5. 实现邮件处理服务





  - [x] 5.1 实现 EmailService


    - 处理 webhook 请求
    - 调用 FilterService 获取决策
    - 更新统计数据
    - _Requirements: 4.1, 5.1_

  - [x] 5.2 实现 StatsService

    - 实现统计计数递增
    - 实现统计查询
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 5.3 编写统计计数属性测试


    - **Property 7: 统计计数递增**
    - **Validates: Requirements 5.1, 5.3**
  - [x] 5.4 编写级联删除属性测试


    - **Property 8: 级联删除**
    - **Validates: Requirements 3.4, 5.4**

- [x] 6. Checkpoint - 确保核心功能测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. 实现动态规则服务



  - [x] 7.1 实现 DynamicRuleService


    - 实现主题追踪逻辑
    - 实现阈值检测和规则创建
    - 实现过期规则清理
    - 实现 lastHitAt 更新
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 7.2 编写动态规则自动创建属性测试

    - **Property 9: 动态规则自动创建**
    - **Validates: Requirements 6.1**
  - [x] 7.3 编写动态规则过期清理属性测试


    - **Property 10: 动态规则过期清理**
    - **Validates: Requirements 6.2**
  - [x] 7.4 编写动态规则时间戳更新属性测试


    - **Property 11: 动态规则时间戳更新**
    - **Validates: Requirements 6.3**


  - [x] 7.5 编写动态规则禁用属性测试

    - **Property 12: 动态规则禁用**
    - **Validates: Requirements 6.4**

- [x] 8. 实现 API 路由



  - [x] 8.1 实现 webhook 路由


    - POST /api/webhook/email - 处理邮件 webhook
    - _Requirements: 2.2, 2.3_

  - [x] 8.2 实现规则管理路由
    - GET/POST/PUT/DELETE /api/rules
    - POST /api/rules/:id/toggle

    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 8.3 实现统计路由
    - GET /api/stats
    - GET /api/stats/rules

    - _Requirements: 5.2_
  - [x] 8.4 实现动态规则配置路由
    - GET/PUT /api/dynamic/config

    - _Requirements: 6.4_
  - [x] 8.5 实现转发配置路由

    - GET/PUT /api/forward/config
    - _Requirements: 4.4_

- [x] 9. Checkpoint - 确保 VPS API 测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. 实现 Cloudflare Email Worker






  - [x] 10.1 创建极简 Email Worker

    - 初始化 Worker 项目
    - 实现 email() 处理函数
    - 提取 from、to、subject
    - 调用 VPS API webhook
    - 执行 forward 或静默 drop
    - 实现降级处理（VPS 不可达时直接转发）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.4, 10.5_

  - [x] 10.2 配置 wrangler.toml

    - 配置环境变量（VPS_API_URL、VPS_API_TOKEN）
    - 配置 send_email 绑定
    - _Requirements: 8.3_

- [x] 11. 实现 VPS Admin Panel




  - [x] 11.1 初始化 Admin Panel 项目

    - 创建 Fastify 应用
    - 实现数据库初始化
    - _Requirements: 7.1_

  - [x] 11.2 实现实例管理
    - 实现 InstanceRepository
    - 实现实例 CRUD 路由
    - _Requirements: 7.2, 7.3_
  - [x] 11.3 编写实例管理属性测试


    - **Property 14: 实例管理**
    - **Validates: Requirements 7.2**

  - [x] 11.4 实现管理员认证

    - 实现密码验证
    - 实现 session 管理
    - _Requirements: 7.4_
  - [x] 11.5 实现前端页面



    - 实现登录页面
    - 实现实例管理页面
    - 实现系统配置页面
    - _Requirements: 7.3_

- [x] 12. 实现部署配置





  - [x] 12.1 创建 systemd 服务文件


    - email-filter-api.service
    - email-filter-admin.service
    - _Requirements: 9.2_

  - [x] 12.2 创建 Docker 配置

    - Dockerfile for vps-api
    - Dockerfile for vps-admin
    - docker-compose.yml
    - _Requirements: 9.1_

  - [x] 12.3 创建部署脚本

    - install.sh - 安装依赖和配置
    - .env.example - 环境变量模板
    - _Requirements: 9.3, 9.4_

- [x] 13. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

