# 折扣码正则生成器 — 设计规格

> 状态：设计中（待实现）
> 日期：2026-07-24
> 依赖：`2026-07-23-extraction-worker-architecture-spec.md`、`2026-07-23-discount-code-extraction-spec.md`
> 参考：`F:\tools\yahoo imap\src\regex-generator.ts`（yahoo-mail-extractor 项目的正则生成器）

## 1. 概述

折扣码的格式远比验证码丰富多样——纯字母数字、字母+数字、数字+字母、连字符分隔、前缀关键词、UUID、百分比、金额等。手写正则容易遗漏格式或误报。

本方案设计一个**正则生成器**：用户在邮件预览中选中一个真实折扣码样例，生成器自动识别其形态，产出多个候选正则（精确→弹性→通用），按置信度排序。用户选一个绑定到 forward 规则即可。

核心设计移植自 yahoo-mail-extractor 的 `suggestPatterns()`，适配到 extraction-worker 运行环境。

## 2. 折扣码形态分类（完整枚举）

yahoo 项目识别的折扣码形态，按检测优先级排列：

| 形态 | 样例 | 检测正则 | 生成正则模式 | 置信度 |
|------|------|---------|-------------|--------|
| **带前缀** | `Use code: SAVE20` | 前缀词表匹配 | `${prefix}(?<code>[A-Z0-9]{N})` | 0.98 |
| **纯字母数字** | `Z78J2DM2G5B6` | `^[A-Z0-9]+$` | `(?<code>[A-Z0-9]{N})` | 0.90 |
| **字母+数字** | `ABC123` | `^[A-Z]+[0-9]+$` | `(?<code>[A-Z]{L}[0-9]{D})` | 0.85 |
| **数字+字母** | `123ABC` | `^[0-9]+[A-Z]+$` | `(?<code>[0-9]{D}[A-Z]{L})` | 0.85 |
| **字母-数字-字母** | `AB123CD` | `^[A-Z]+[0-9]+[A-Z]+$` | `(?<code>[A-Z]+[0-9]+[A-Z]+)` | 0.80 |
| **纯数字** | `482913` | `^\d+$` | `(?<code>\d{N})` | 0.90（折扣码场景谨慎） |
| **连字符分隔** | `ABC-123-XYZ` | `^[A-Z0-9]+-[A-Z0-9]+...` | 各段精确长度用 `-` 连接 | 0.90 |
| **关键词前缀** | `SAVE20`、`PROMO50` | `^(SAVE\|OFF\|GET\|...)` | `(?<code>${KW}[A-Z0-9]+)` | 0.90 |
| **UUID** | `A1B2C3D4-...` | UUID 格式 | UUID 正则 | 0.95 |
| **百分比** | `50%` | `^\d+(?:\.\d+)?%$` | `(?<code>\d+(?:\.\d+)?%)` | 0.95 |
| **金额** | `$50`、`¥100` | `^[\$¥€£]...` | `(?<code>\$[\d,]+...)` | 0.90 |

> **命名组统一为 `code`**：所有形态的捕获组统一用 `(?<code>...)`（包括百分比/金额），因为正则生成器的目标是生成"折扣码本身的正则"。折扣值（discount_value 字段）的提取用的是折扣码 spec §5.4 中**硬编码**的 `(?<value>...)` 正则，不走本生成器。

每种形态生成 **3 个候选**（精确长度 → 弹性长度 ±2 → 通用），按置信度排序，取前 6 个返回。

## 3. 前缀词表（prefix detection）

前缀检测是最高置信度的形态——折扣码紧跟标准前缀短语时，生成带前缀锚定的正则。

### 3.1 英文前缀

```
Use code: XXX        →  (?:use\s+)?code[:\s]+(?<code>...)
Promo code: XXX      →  promo(?:\s+code)?[:\s]+(?<code>...)
Coupon code: XXX     →  coupon(?:\s+code)?[:\s]+(?<code>...)
Discount code: XXX   →  discount(?:\s+code)?[:\s]+(?<code>...)
Voucher code: XXX    →  voucher(?:\s+code)?[:\s]+(?<code>...)
Your code: XXX       →  your\s+code[:\s]+(?<code>...)
Redemption code: XXX →  redemption\s+code[:\s]+(?<code>...)
Gift code: XXX       →  gift\s+code[:\s]+(?<code>...)
Activation code: XXX →  activation\s+code[:\s]+(?<code>...)
Refer a friend: XXX  →  refer[a-z]*\s+(?:code)?[:\s]+(?<code>...)
Offer code: XXX      →  offer\s+(?:code)?[:\s]+(?<code>...)
```

### 3.2 中文前缀

```
优惠码：XXX           →  (?:优惠码|优惠代码)[：:\s]+(?<code>...)
折扣码：XXX           →  (?:折扣码|折扣代码)[：:\s]+(?<code>...)
兑换码：XXX           →  兑换码[：:\s]+(?<code>...)
激活码：XXX           →  激活码[：:\s]+(?<code>...)
礼品码：XXX           →  礼品码[：:\s]+(?<code>...)
代码：XXX             →  代码[：:\s]+(?<code>...)
```

### 3.3 关键词前缀（code 本身以营销词开头）

折扣码常以营销关键词开头：`SAVE20`、`PROMO50`、`FREESHIP`、`WELCOME10`、`VIP2024`、`NEW15`、`FIRST`、`DEAL`、`SALE`、`DISCOUNT`、`CODE`、`GET`、`OFF`。

```
关键词: SAVE|OFF|GET|CODE|PROMO|DISCOUNT|FREE|DEAL|SALE|VIP|NEW|FIRST|WELCOME|SHIP|SUMMER|WINTER|SPRING|FALL|BLACK|CYBER|HOLIDAY|CHRISTMAS
检测: ^(关键词)[A-Z0-9]+$
生成: (?<code>关键词[A-Z0-9]+)
```

## 4. 生成器函数设计

### 4.1 `generateFromTarget(target, emailContent?)`

**输入**：
- `target`：用户选中的折扣码样例（如 `SAVE20` 或 `promo code: SUMMER2024`）
- `emailContent`（可选）：邮件正文，用于定位样例上下文

**输出**：
```typescript
interface PatternSuggestion {
  pattern: string;        // 正则（含命名捕获组）
  description: string;    // 中文描述
  confidence: number;     // 0-1 置信度
}
interface GeneratedPattern {
  literal: string;        // 转义后的字面匹配（保底）
  suggestions: PatternSuggestion[];  // 候选正则，按置信度降序
  context?: string;       // 样例在邮件中的上下文（若提供 emailContent）
  foundAt?: number;       // 样例在邮件中的位置
}
```

**处理流程**：
```
generateFromTarget(target):
  ① literal = escapeSpecialChars(target)           ← 字面匹配（保底）
  ② suggestions = suggestPatterns(target)          ← 形态识别 + 候选生成
  ③ 若有 emailContent: 定位上下文（前后各 100 字符）
  ④ 返回 { literal, suggestions, context, foundAt }
```

### 4.2 `suggestPatterns(target)` — 核心形态识别

按检测优先级逐分支判断，命中即生成候选。每个分支生成 3 个候选：

| 候选 | 模式 | 置信度 | 特点 |
|------|------|--------|------|
| 精确 | `(?<code>[A-Z0-9]{N})` | 0.98/0.90 | 严格匹配 N 位 |
| 弹性 | `(?<code>[A-Z0-9]{N-2,N+2})` | 0.95/0.80 | 容差 ±2 位 |
| 通用 | `(?<code>[A-Z0-9]+)` | 0.85 | 任意长度（误报风险） |

分支检测顺序（命中前缀优先返回，后续按形态逐个添加）：
1. 前缀检测（英/中）→ 命中返回前 6
2. 通用前缀兜底（always 加）
3. 纯字母数字 → 精确/弹性/通用 + 子形态（字母+数字、数字+字母、字母-数字-字母）
4. 纯数字 → 精确/弹性
5. 连字符分隔 → 各段精确 + 通用连字符
6. 百分比 → 百分比正则
7. 金额 → 货币正则
8. 关键词前缀 → `${KW}[A-Z0-9]+`
9. UUID → UUID 正则
10. 排序（置信度降序）+ 截断前 6

### 4.3 `validateRegex(pattern, flags)`

校验用户输入的正则是否可编译：
- 空检查
- flags 合法性（`[gimsuy]*`，无重复）
- `try { new RegExp(pattern, flags) }` 编译测试
- 返回 `{ valid: boolean, error?: string }`

### 4.4 `testRegexMatch(pattern, flags, content)`

预览正则在实际内容上的匹配结果：
- 先 validateRegex
- 全局匹配（g flag）迭代，去重
- 防护：maxMatches=1000、maxContentLength=500KB、零宽匹配保护
- 返回 `{ matches: string[], positions: number[] }`

## 5. API 端点

> 端点路由总表见架构 spec §5。本文定义请求/响应详细契约。

### 5.1 生成正则

```
POST /api/generate-pattern?type=discount
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "target": "SAVE20",
  "emailContent": "Use promo code SAVE20 for 20% off your order..."  // 可选
}
```

**响应**：
```json
{
  "literal": "SAVE20",
  "suggestions": [
    { "pattern": "(?<code>SAVE[A-Z0-9]+)", "description": "以 'SAVE' 开头的优惠码", "confidence": 0.90 },
    { "pattern": "(?<code>[A-Z0-9]{6})", "description": "精确 6 位字母数字代码", "confidence": 0.90 },
    { "pattern": "(?<code>[A-Z]{4}[0-9]{2})", "description": "4 个字母后跟 2 个数字", "confidence": 0.85 },
    { "pattern": "(?<code>[A-Z0-9]{4,8})", "description": "4-8 位代码", "confidence": 0.80 },
    { "pattern": "(?:code|优惠码|promo)[：:\\s]+(?<code>[A-Z0-9]{6,20})", "description": "通用优惠码格式", "confidence": 0.92 },
    { "pattern": "SAVE20", "description": "字面匹配", "confidence": 0.5 }
  ],
  "context": "Use promo code SAVE20 for 20% off...",
  "foundAt": 15
}
```

### 5.2 测试正则

```
POST /api/test-pattern
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "pattern": "(?<code>SAVE[A-Z0-9]+)",
  "flags": "gi",
  "content": "Use code SAVE20 today! Also try SUMMER50 and SAVEBIG."
}
```

**响应**：
```json
{
  "valid": true,
  "matches": ["SAVE20", "SAVEBIG"],
  "positions": [9, 46]
}
```

## 6. 前端交互流程

### 6.1 从样例生成正则

```
用户在 VPS 规则编辑表单:
  ① 点击「从样例生成」按钮
  ② 弹窗：
     - 输入框：折扣码样例（如 SAVE20）
     - 可选：粘贴邮件正文片段
  ③ 点「生成」→ 调 POST /api/generate-pattern?type=discount
  ④ 展示候选正则列表（pattern + description + confidence 进度条）
  ⑤ 用户选一个 → 填入 code_pattern 输入框
  ⑥ 可选：点「测试」→ 输入测试文本 → 调 POST /api/test-pattern → 显示匹配结果
```

### 6.2 候选选择建议

前端标注每个候选的置信度和特点，帮助用户选择：
- 🟢 精确匹配（0.95+）：最安全，只匹配确切格式
- 🟡 弹性匹配（0.80-0.95）：容差少量变化
- 🔴 通用匹配（<0.80）：误报风险，需测试确认

## 7. 与验证码正则生成的区别

| 维度 | 验证码 | 折扣码 |
|------|--------|--------|
| 主形态 | 纯数字 4-8 位 | 字母+数字混合（多种子形态） |
| 前缀词 | verification/verify/OTP/验证码 | promo/coupon/discount/优惠码/折扣码 |
| 关键词前缀 | 无 | SAVE/PROMO/FREE/WELCOME 等 |
| 验证器 | 接受纯数字 | **拒绝纯数字**（订单号/价格） |
| 形态分支数 | 少（纯数字+字母数字） | 多（11 种形态） |
| generate-pattern type 参数 | `?type=verification` | `?type=discount` |

两者共享 `generateFromTarget` / `validateRegex` / `testRegexMatch` 的函数框架，但 `suggestPatterns` 的形态分支和前缀词表各自独立。

## 8. ReDoS 防护

用户生成的正则可能触发灾难性回溯：
- `testRegexMatch`：maxMatches=1000、maxContentLength=500KB、零宽保护
- 绑定到规则后实际提取时：内容截断 50KB、正则源 ≤200 字符、try/catch 降级
- Worker CPU 时限作为最终兜底

## 9. 实现文件

| 文件 | 内容 |
|------|------|
| `extraction-worker/src/regex-generator.ts` | generateFromTarget、suggestPatterns、validateRegex、testRegexMatch |
| `extraction-worker/src/regex-generator.test.ts` | 各形态分支的单测（参考 yahoo 测试用例） |
| `extraction-worker/src/index.ts` | /api/generate-pattern、/api/test-pattern 路由 |

## 10. 测试用例（关键形态覆盖）

```
带前缀:   "promo code: SUMMER2024" → 前缀锚定正则
纯字母数字: "Z78J2DM2G5B6"        → 精确 12 位
字母+数字: "ABC123"               → [A-Z]{3}[0-9]{3}
数字+字母: "123ABC"               → [0-9]{3}[A-Z]{3}
连字符:    "ABC-123-XYZ"          → 分段精确
关键词:    "SAVE20"               → SAVE[A-Z0-9]+
百分比:    "50%"                  → \d+(?:\.\d+)?%
金额:      "$50"                  → \$[\d,]+
UUID:      "A1B2C3D4-..."         → UUID 正则
纯数字:    "482913"               → \d{6}（折扣码场景标注谨慎）
中文前缀:  "优惠码：ABC123"        → 中文前缀锚定
```
