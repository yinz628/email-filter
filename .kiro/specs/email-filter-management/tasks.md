# Implementation Plan

- [x] 1. 项目初始化和基础设施






  - [x] 1.1 创建monorepo项目结构

    - 初始化pnpm工作区
    - 创建packages/admin-panel、packages/worker-api、packages/shared目录
    - 配置TypeScript、ESLint
    - _Requirements: 11.1_
  - [x] 1.2 配置Wrangler和D1数据库


    - 创建wrangler.toml配置文件
    - 定义D1数据库绑定
    - 配置构建输出为worker.js
    - _Requirements: 11.1_

  - [x] 1.3 创建共享类型定义

    - 定义FilterRule、ProcessLog、RuleStats等接口
    - 定义API请求/响应类型
    - _Requirements: 4.1, 7.1, 8.1_

- [x] 2. 共享模块实现






  - [x] 2.1 实现匹配器工具函数

    - 实现regex匹配逻辑
    - 实现contains包含匹配逻辑
    - 支持sender_name、subject、sender_email三种matchType
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.2 编写匹配器属性测试

    - **Property 3: 过滤规则匹配正确性**
    - **Property 4: 匹配模式正确性**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

- [x] 3. Worker API - 数据库层






  - [x] 3.1 创建D1数据库Schema

    - 创建filter_rules表
    - 创建process_logs表
    - 创建rule_stats表
    - 创建watch_items和watch_hits表
    - 创建dynamic_config表和email_subject_tracker表
    - _Requirements: 11.1, 11.2, 11.3_


  - [x] 3.2 实现规则Repository
    - 实现CRUD操作
    - 实现按category查询
    - 实现启用/禁用切换
    - _Requirements: 4.1, 5.4, 10.1, 10.2_
  - [x] 3.3 编写规则Repository属性测试


    - **Property 1: Worker实例CRUD一致性**（应用于规则）
    - **Validates: Requirements 10.1, 10.2**

- [x] 4. Worker API - 过滤引擎核心






  - [x] 4.1 实现过滤服务

    - 实现白名单优先级检查
    - 实现黑名单过滤
    - 实现动态名单过滤
    - 实现规则启用状态检查
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.2 编写过滤服务属性测试

    - **Property 5: 白名单优先级**
    - **Property 6: 黑名单和动态名单过滤**
    - **Property 7: 规则启用状态生效**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [x] 5. Worker API - 邮件处理和日志





  - [x] 5.1 实现邮件处理服务


    - 接收邮件并调用过滤引擎
    - 记录处理日志（收件人、发件人、主题、处理方式）
    - 记录命中的规则信息
    - _Requirements: 7.1, 7.2_

  - [x] 5.2 实现日志查询服务
    - 支持按时间范围筛选
    - 支持按处理方式筛选
    - 支持按规则类型筛选
    - _Requirements: 7.3_

  - [x] 5.3 编写邮件处理属性测试

    - **Property 12: 邮件处理日志完整性**
    - **Property 13: 处理日志筛选正确性**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 6. Worker API - 统计服务







  - [x] 6.1 实现规则统计服务

    - 实现统计计数更新
    - 实现按规则分类统计查询
    - 实现规则删除时级联删除统计

    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 6.2 编写统计服务属性测试

    - **Property 8: 规则删除级联**
    - **Property 14: 规则统计准确性**
    - **Validates: Requirements 5.5, 8.1, 8.2, 8.3, 8.4**

- [x] 7. Worker API - 动态规则服务




  - [x] 7.1 实现动态规则检测

    - 实现邮件主题追踪
    - 实现阈值检测逻辑
    - 实现自动创建动态规则
    - _Requirements: 6.1, 6.3_


  - [x] 7.2 实现动态规则过期清理
    - 实现lastHitAt更新
    - 实现过期规则检测和删除

    - _Requirements: 6.2, 6.4_

  - [x] 7.3 编写动态规则属性测试

    - **Property 9: 动态规则自动生成**
    - **Property 10: 动态规则过期清理**
    - **Property 11: 动态规则时间戳更新**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

- [x] 8. Worker API - 重点关注服务





  - [x] 8.1 实现重点关注管理
    - 实现添加/删除重点关注主题
    - 实现邮件匹配检测
    - 实现统计数据更新
    - _Requirements: 9.1, 9.2_
  - [x] 8.2 实现重点关注统计查询

    - 实现总数、24小时、1小时统计
    - 实现收件邮箱列表聚合
    - _Requirements: 9.3, 9.4_

  - [x] 8.3 编写重点关注属性测试


    - **Property 15: 重点关注CRUD一致性**
    - **Property 16: 重点关注统计准确性**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 9. Worker API - HTTP路由






  - [x] 9.1 创建Hono应用和路由

    - 创建规则管理路由 /api/rules
    - 创建邮件处理路由 /api/email
    - 创建统计路由 /api/stats
    - 创建重点关注路由 /api/watch
    - 创建动态配置路由 /api/dynamic
    - _Requirements: 4.1, 7.1, 8.1, 9.1_

  - [x] 9.2 实现请求验证和错误处理

    - 实现规则格式验证
    - 实现统一错误响应格式
    - _Requirements: 10.1_

  - [x] 9.3 编写规则验证属性测试

    - **Property 17: 规则验证**
    - **Validates: Requirements 10.1**

- [x] 10. Worker API - 前端界面

  - [x] 10.1 创建React前端框架
    - 配置React + TypeScript
    - 创建基础布局组件
    - 配置路由
    - _Requirements: 10.4_
  - [x] 10.2 实现规则管理页面
    - 规则列表展示（按分类）
    - 规则添加/编辑表单
    - 规则启用/禁用切换
    - 规则删除确认
    - 刷新按钮
    - _Requirements: 4.1, 5.4, 10.1, 10.2, 10.3, 10.4_
  - [x] 10.3 实现统计展示页面
    - 规则命中统计表格
    - 重点关注统计表格
    - 收件邮箱列表展示
    - _Requirements: 8.1, 8.2, 9.3, 9.4_
  - [x] 10.4 实现动态规则配置页面

    - 时间窗口配置
    - 阈值配置
    - 过期时间配置
    - _Requirements: 6.1, 6.2_

- [x] 11. Checkpoint - 确保Worker API测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. 管理面板 - 数据库层






  - [x] 12.1 创建D1数据库Schema

    - 创建worker_instances表
    - 创建admin_config表
    - _Requirements: 1.1, 2.1_

  - [x] 12.2 实现实例Repository





    - 实现CRUD操作
    - 实现状态更新
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 13. 管理面板 - 认证服务






  - [x] 13.1 实现密码认证

    - 实现密码哈希和验证
    - 实现JWT生成和验证
    - 实现登出处理
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 13.2 编写认证属性测试

    - **Property 2: 认证正确性**
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [x] 14. 管理面板 - 实例管理服务






  - [x] 14.1 实现Worker实例管理

    - 实现添加/删除/修改实例
    - 实现实例状态检测
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 14.2 实现统计聚合服务

    - 从各Worker实例获取统计数据
    - 按实例分类聚合展示
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 14.3 编写实例管理属性测试


    - **Property 1: Worker实例CRUD一致性**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

- [x] 15. 管理面板 - HTTP路由






  - [x] 15.1 创建Hono应用和路由

    - 创建认证路由 /api/auth
    - 创建实例管理路由 /api/instances
    - 创建统计聚合路由 /api/stats
    - _Requirements: 1.1, 2.1, 3.1_


  - [x] 15.2 实现认证中间件





    - JWT验证中间件
    - 未认证请求重定向
    - _Requirements: 2.1, 2.2_

- [x] 16. 管理面板 - 前端界面






  - [x] 16.1 创建React前端框架

    - 配置React + TypeScript
    - 创建基础布局组件
    - 配置路由和认证状态管理
    - _Requirements: 2.1_

  - [x] 16.2 实现登录页面





    - 密码输入表单
    - 登录状态处理
    - 错误提示
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 16.3 实现实例管理页面





    - 实例列表展示
    - 添加/编辑实例表单
    - 删除确认
    - 状态指示

    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 16.4 实现统计仪表盘





    - 按实例分类展示统计
    - 规则命中统计
    - 重点关注统计
    - 刷新按钮
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 17. 数据持久化测试






  - [x] 17.1 编写数据持久化属性测试

    - **Property 18: 数据持久化Round-Trip**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4**

- [x] 18. Final Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.
