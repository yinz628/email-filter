# Requirements Document

## Introduction

本模块用于对商户级营销邮件活动进行持续跟踪、统计与路径建模，重点识别并分析包含高价值折扣码的营销活动，从而为后续的邮件过滤、降频、优先级决策提供数据支撑。

由于邮件正文与 Header 信息在 Worker 层不可用，本模块仅基于以下字段进行统计建模：
- 发件人（用于识别商户）
- 邮件名（Subject）
- 收件人（Recipient）

营销活动的"价值属性"由人工进行标注与维护。

## Glossary

- **商户（Merchant）**: 以品牌或商户为统计对象（如 Macy's），通过发件人域名进行归一识别
- **营销活动（Campaign）**: 同一商户下，邮件名（Subject）完全一致的邮件集合被视为一次独立的营销活动
- **有价值营销活动（Valuable Campaign）**: 邮件中包含高价值折扣码或经人工确认具有明显促销价值的营销活动
- **收件人路径（Recipient Path）**: 在同一商户维度下，某一收件人实际经历的营销活动先后顺序
- **营销活动层级（Campaign Level）**: 根据营销活动在收件人路径中的出现顺序定义的层级（第一层为起点活动）
- **VPS API**: 运行在 VPS 上的后端 API 服务，负责数据存储和分析
- **Worker**: Cloudflare Email Worker，负责接收邮件并转发数据到 VPS API

## Requirements

### Requirement 1: 商户识别与管理

**User Story:** As a 系统管理员, I want to 自动识别和管理商户信息, so that 可以按商户维度进行营销活动分析。

#### Acceptance Criteria

1. WHEN 系统接收到一封邮件 THEN 系统 SHALL 从发件人地址中提取域名作为商户标识
2. WHEN 发现新的发件人域名 THEN 系统 SHALL 自动创建对应的商户记录
3. WHEN 查询商户列表 THEN 系统 SHALL 返回所有已识别的商户及其基本统计信息
4. WHEN 管理员编辑商户信息 THEN 系统 SHALL 支持设置商户显示名称和备注

### Requirement 2: 营销活动识别与统计

**User Story:** As a 系统管理员, I want to 自动识别和统计营销活动, so that 可以了解每个商户的营销活动情况。

#### Acceptance Criteria

1. WHEN 系统接收到一封邮件 THEN 系统 SHALL 根据商户和邮件主题创建或更新营销活动记录
2. WHEN 同一商户下邮件主题完全一致 THEN 系统 SHALL 将这些邮件归入同一营销活动
3. WHEN 查询营销活动详情 THEN 系统 SHALL 返回邮件总接收次数和覆盖的收件人数量
4. WHEN 查询营销活动详情 THEN 系统 SHALL 返回每个收件人接收该活动邮件的次数
5. WHEN 营销活动列表展示 THEN 系统 SHALL 支持按商户筛选和按时间排序

### Requirement 3: 有价值营销活动标注

**User Story:** As a 系统管理员, I want to 手动标注有价值的营销活动, so that 可以识别包含高价值折扣码的活动。

#### Acceptance Criteria

1. WHEN 管理员标记营销活动为有价值 THEN 系统 SHALL 保存该标记状态
2. WHEN 管理员取消有价值标记 THEN 系统 SHALL 更新该标记状态
3. WHEN 查询营销活动列表 THEN 系统 SHALL 显示每个活动的价值标记状态
4. WHEN 筛选营销活动 THEN 系统 SHALL 支持按价值标记状态进行筛选
5. WHEN 标记有价值活动 THEN 系统 SHALL 支持添加备注说明价值原因

### Requirement 4: 收件人路径追踪

**User Story:** As a 系统管理员, I want to 追踪每个收件人的营销活动路径, so that 可以分析营销活动的推送顺序。

#### Acceptance Criteria

1. WHEN 收件人首次收到某商户的邮件 THEN 系统 SHALL 创建该收件人在该商户下的路径记录
2. WHEN 收件人收到新的营销活动邮件 THEN 系统 SHALL 按时间顺序追加到路径记录中
3. WHEN 收件人重复收到同一营销活动邮件 THEN 系统 SHALL 忽略重复记录，仅保留首次出现
4. WHEN 查询收件人路径 THEN 系统 SHALL 返回该收件人在指定商户下的完整营销活动序列

### Requirement 5: 营销活动层级分析

**User Story:** As a 系统管理员, I want to 分析营销活动的层级结构, so that 可以了解营销活动的推送策略。

#### Acceptance Criteria

1. WHEN 分析营销活动层级 THEN 系统 SHALL 根据收件人路径自动计算每个活动的层级位置
2. WHEN 营销活动作为起点出现 THEN 系统 SHALL 将其标记为第一层活动
3. WHEN 营销活动在第一层之后出现 THEN 系统 SHALL 根据出现顺序标记为相应层级
4. WHEN 同一活动在不同路径中出现在不同位置 THEN 系统 SHALL 记录其在各层级的出现次数

### Requirement 6: 营销活动路径与分布分析

**User Story:** As a 系统管理员, I want to 分析营销活动之间的路径关系和分布比例, so that 可以了解商户的营销策略。

#### Acceptance Criteria

1. WHEN 选择某营销活动作为起点 THEN 系统 SHALL 统计接收到该活动的收件人集合作为基准人群
2. WHEN 分析后续活动分布 THEN 系统 SHALL 统计基准人群后续接收到的不同营销活动
3. WHEN 计算分布比例 THEN 系统 SHALL 返回每个后续活动的收件人数量和占基准人群的比例
4. WHEN 同一层级存在多个后续活动 THEN 系统 SHALL 支持多路径并存的分析模型
5. WHEN 生成路径图 THEN 系统 SHALL 支持分叉和汇合等复杂路径结构

### Requirement 7: 数据可视化与报表

**User Story:** As a 系统管理员, I want to 查看营销活动的可视化报表, so that 可以直观了解营销活动的整体情况。

#### Acceptance Criteria

1. WHEN 查看商户概览 THEN 系统 SHALL 显示营销活动总数、有价值活动数、总邮件量
2. WHEN 查看活动路径图 THEN 系统 SHALL 以树形或流程图形式展示活动层级关系
3. WHEN 查看路径节点 THEN 系统 SHALL 显示该节点的收件人数量和占比
4. WHEN 查看有价值活动分布 THEN 系统 SHALL 高亮显示有价值活动在路径中的位置

### Requirement 8: 数据接收接口

**User Story:** As a Worker 开发者, I want to 通过 API 上报邮件数据, so that VPS 可以进行营销活动分析。

#### Acceptance Criteria

1. WHEN Worker 接收到邮件 THEN Worker SHALL 向 VPS API 发送邮件元数据（发件人、主题、收件人、时间）
2. WHEN VPS API 接收到数据 THEN 系统 SHALL 验证数据完整性并返回处理结果
3. WHEN 数据上报失败 THEN Worker SHALL 记录错误日志但不影响邮件转发流程
4. WHEN 批量上报数据 THEN 系统 SHALL 支持批量处理以提高效率

### Requirement 9: 营销活动预览

**User Story:** As a 系统管理员, I want to 在分析开始前预览商户的营销活动列表, so that 可以快速了解商户的营销活动概况而无需等待完整分析。

#### Acceptance Criteria

1. WHEN 管理员选择某商户 THEN 系统 SHALL 显示该商户下所有营销活动的预览列表
2. WHEN 显示营销活动预览 THEN 系统 SHALL 展示活动主题、邮件数量、收件人数量和首次/最后出现时间
3. WHEN 预览列表加载 THEN 系统 SHALL 在 2 秒内返回结果以保证响应速度
4. WHEN 预览列表展示 THEN 系统 SHALL 支持按邮件数量、时间等字段排序
5. WHEN 预览列表展示 THEN 系统 SHALL 显示有价值活动的标记状态
