# Requirements Document

## Introduction

本项目是一个邮箱过滤管理工具，采用分离架构设计。系统分为两个主要部分：邮箱过滤Worker实例管理面板和邮箱过滤Worker实例API。管理面板用于集中管理多个Worker实例API，并展示统计数据；Worker实例API负责具体的邮件过滤规则管理、邮件处理记录和统计功能。

## Glossary

- **Worker实例API**: 独立部署的邮件过滤服务实例，负责执行邮件过滤规则和记录处理结果
- **管理面板**: 集中管理多个Worker实例API的Web界面
- **过滤规则**: 定义邮件过滤条件的配置项，包括发件人、邮件名、发件邮箱等匹配条件
- **白名单**: 优先级最高的规则列表，匹配的邮件不进行过滤
- **黑名单**: 匹配的邮件将被静默删除
- **动态名单**: 系统自动检测异常营销邮件并动态生成的过滤规则
- **重点关注邮件**: 用户设定的需要特别关注的邮件主题列表
- **静默删除**: 删除邮件但不发送任何通知

## Requirements

### Requirement 1: Worker实例API管理

**User Story:** As a 系统管理员, I want to 管理多个Worker实例API, so that I can 集中控制和监控所有邮件过滤服务。

#### Acceptance Criteria

1. WHEN 管理员点击添加Worker实例按钮并提交有效的API地址和名称 THEN 管理面板 SHALL 创建新的Worker实例API记录并显示在实例列表中
2. WHEN 管理员选择一个Worker实例并点击删除按钮 THEN 管理面板 SHALL 移除该Worker实例API记录并从列表中删除
3. WHEN 管理员修改Worker实例API的配置信息并保存 THEN 管理面板 SHALL 更新该实例的配置并反映在界面上
4. WHEN 管理面板启动时 THEN 管理面板 SHALL 加载并显示所有已配置的Worker实例API列表

### Requirement 2: 管理面板授权登录

**User Story:** As a 系统管理员, I want to 通过密码授权登录管理面板, so that I can 保护系统配置不被未授权访问。

#### Acceptance Criteria

1. WHEN 用户访问管理面板且未登录 THEN 管理面板 SHALL 显示登录页面要求输入密码
2. WHEN 用户输入正确的密码并提交 THEN 管理面板 SHALL 验证密码并授予访问权限
3. WHEN 用户输入错误的密码 THEN 管理面板 SHALL 拒绝访问并显示错误提示
4. WHEN 用户已登录并点击登出 THEN 管理面板 SHALL 清除登录状态并重定向到登录页面

### Requirement 3: 集中统计展示

**User Story:** As a 系统管理员, I want to 在管理面板集中查看所有Worker实例的统计数据, so that I can 了解整体邮件过滤情况。

#### Acceptance Criteria

1. WHEN 管理员访问统计页面 THEN 管理面板 SHALL 按Worker实例API分类显示统计数据
2. WHEN 管理面板加载统计数据 THEN 管理面板 SHALL 显示各Worker实例的过滤规则命中邮件数量
3. WHEN 管理面板加载统计数据 THEN 管理面板 SHALL 显示各Worker实例的重点关注邮件统计
4. WHEN 管理员点击刷新按钮 THEN 管理面板 SHALL 重新从各Worker实例API获取最新统计数据

### Requirement 4: 过滤规则配置

**User Story:** As a 邮件管理员, I want to 配置邮件过滤规则, so that I can 自动过滤不需要的邮件。

#### Acceptance Criteria

1. WHEN 管理员创建基于发件人显示名称的过滤规则 THEN Worker实例API SHALL 保存该规则并用于匹配邮件的发件人显示名称
2. WHEN 管理员创建基于邮件主题名的过滤规则 THEN Worker实例API SHALL 保存该规则并用于匹配邮件主题
3. WHEN 管理员创建基于发件邮箱地址的过滤规则 THEN Worker实例API SHALL 保存该规则并用于匹配发件人邮箱地址
4. WHEN 管理员选择正则匹配模式 THEN Worker实例API SHALL 使用正则表达式进行规则匹配
5. WHEN 管理员选择普通文本匹配模式 THEN Worker实例API SHALL 使用包含匹配方式进行规则匹配

### Requirement 5: 过滤规则分类管理

**User Story:** As a 邮件管理员, I want to 将过滤规则分类为白名单、黑名单和动态名单, so that I can 实现不同优先级的邮件处理策略。

#### Acceptance Criteria

1. WHEN 邮件匹配白名单规则 THEN Worker实例API SHALL 跳过所有其他过滤规则并允许邮件通过
2. WHEN 邮件匹配黑名单规则且未匹配白名单 THEN Worker实例API SHALL 静默删除该邮件
3. WHEN 邮件匹配动态名单规则且未匹配白名单 THEN Worker实例API SHALL 静默删除该邮件
4. WHEN 管理员修改规则的启用状态 THEN Worker实例API SHALL 更新规则状态并立即生效
5. WHEN 管理员删除一条过滤规则 THEN Worker实例API SHALL 移除该规则并删除相关统计数据

### Requirement 6: 动态名单自动管理

**User Story:** As a 邮件管理员, I want to 系统自动检测异常营销邮件并生成动态过滤规则, so that I can 防止短时间内大量营销邮件淹没正常邮件。

#### Acceptance Criteria

1. WHEN 在可配置的时间段内相同主题名的邮件数量超过可配置的阈值 THEN Worker实例API SHALL 自动将该主题名添加到动态名单过滤规则中
2. WHEN 动态规则中的某条规则超过可配置的过期时间（默认48小时）没有邮件命中 THEN Worker实例API SHALL 自动删除该过期规则
3. WHEN 系统创建动态规则 THEN Worker实例API SHALL 记录规则创建时间和最后命中时间
4. WHEN 动态规则被命中 THEN Worker实例API SHALL 更新该规则的最后命中时间

### Requirement 7: 邮件处理记录

**User Story:** As a 邮件管理员, I want to 记录所有邮件的处理详情, so that I can 追踪和审计邮件过滤行为。

#### Acceptance Criteria

1. WHEN Worker实例API处理一封邮件 THEN Worker实例API SHALL 记录收件人、发件人、主题名和处理方式
2. WHEN 邮件命中过滤规则 THEN Worker实例API SHALL 在处理记录中标注命中的具体规则
3. WHEN 查询处理记录 THEN Worker实例API SHALL 支持按时间范围、处理方式和规则类型进行筛选

### Requirement 8: 过滤规则统计

**User Story:** As a 邮件管理员, I want to 查看各过滤规则的命中统计, so that I can 了解规则的有效性和邮件过滤情况。

#### Acceptance Criteria

1. WHEN 管理员查看规则统计 THEN Worker实例API SHALL 按规则分类显示各规则的命中统计
2. WHEN 管理员查看规则统计 THEN Worker实例API SHALL 显示每条规则处理的邮件总数、处理错误数量和删除处理数量
3. WHEN 管理员删除一条过滤规则 THEN Worker实例API SHALL 同时删除该规则的所有统计数据
4. WHEN 邮件被规则命中并处理 THEN Worker实例API SHALL 实时更新对应规则的统计计数

### Requirement 9: 重点关注邮件统计

**User Story:** As a 邮件管理员, I want to 统计重点关注邮件的接收情况, so that I can 确保重要邮件被正确接收。

#### Acceptance Criteria

1. WHEN 管理员添加重点关注主题名 THEN Worker实例API SHALL 保存该主题名到重点关注名单
2. WHEN 邮件主题匹配重点关注名单 THEN Worker实例API SHALL 记录该邮件并更新统计数据
3. WHEN 管理员查看重点关注统计 THEN Worker实例API SHALL 显示各主题名的邮件总数量、24小时数量和1小时数量
4. WHEN 管理员查看重点关注统计 THEN Worker实例API SHALL 显示命中各主题名的所有收件邮箱列表

### Requirement 10: 规则管理操作

**User Story:** As a 邮件管理员, I want to 对过滤规则进行增删改查操作, so that I can 灵活管理邮件过滤策略。

#### Acceptance Criteria

1. WHEN 管理员创建新规则并提交 THEN Worker实例API SHALL 验证规则格式并保存到数据库
2. WHEN 管理员修改现有规则 THEN Worker实例API SHALL 更新规则配置并立即生效
3. WHEN 管理员切换规则的启用状态 THEN Worker实例API SHALL 更新状态并在下次邮件处理时应用
4. WHEN 管理员点击刷新按钮 THEN Worker实例API管理界面 SHALL 重新加载所有规则和统计数据

### Requirement 11: 数据持久化

**User Story:** As a 系统管理员, I want to 所有配置和统计数据被持久化存储, so that I can 在系统重启后保留所有数据。

#### Acceptance Criteria

1. WHEN Worker实例API保存过滤规则 THEN Worker实例API SHALL 将规则数据持久化到存储系统
2. WHEN Worker实例API记录邮件处理 THEN Worker实例API SHALL 将处理记录持久化到存储系统
3. WHEN Worker实例API更新统计数据 THEN Worker实例API SHALL 将统计数据持久化到存储系统
4. WHEN 系统重启 THEN Worker实例API SHALL 从存储系统恢复所有配置和统计数据
