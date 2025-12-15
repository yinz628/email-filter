/**
 * Email Filter Worker (Standalone)
 * 
 * 独立单文件版本，可直接在 Cloudflare Dashboard 网页端部署
 * 支持从 VPS API 同步动态规则
 * 
 * 部署步骤：
 * 1. 登录 Cloudflare Dashboard
 * 2. 进入 Workers & Pages
 * 3. 创建新 Worker
 * 4. 将此文件内容粘贴到编辑器
 * 5. 保存并部署
 * 6. 在 Settings > Variables 中：
 *    - 添加 KV Namespace 绑定，名称为 EMAIL_FILTER_KV
 *    - 添加 Secret，名称为 AUTH_PASSWORD，值为你的管理密码
 *    - (可选) 添加 VPS_API_URL，值为 VPS API 地址 (如 https://your-domain.com)
 *    - (可选) 添加 VPS_API_TOKEN，值为 VPS API Token
 * 7. 配置 Email Routing 将邮件路由到此 Worker
 */

// ============================================
// VPS Sync Configuration
// ============================================

const DEFAULT_SYNC_INTERVAL_MINUTES = 5; // 默认5分钟

// 获取同步间隔（从 KV 配置或使用默认值）
async function getSyncIntervalMs(kv) {
  const config = await kv.get('config:vps-sync');
  if (config) {
    const parsed = JSON.parse(config);
    return (parsed.syncIntervalMinutes || DEFAULT_SYNC_INTERVAL_MINUTES) * 60 * 1000;
  }
  return DEFAULT_SYNC_INTERVAL_MINUTES * 60 * 1000;
}

async function getVpsSyncConfig(kv) {
  const config = await kv.get('config:vps-sync');
  if (config) return JSON.parse(config);
  return { syncIntervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES };
}

async function setVpsSyncConfig(kv, config) {
  if (config.syncIntervalMinutes < 1 || config.syncIntervalMinutes > 60) {
    throw { code: 'INVALID_CONFIG', message: '同步间隔必须在 1-60 分钟之间' };
  }
  await kv.put('config:vps-sync', JSON.stringify(config));
  return config;
}

// ============================================
// Response Helpers
// ============================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(code, message, status = 400) {
  return jsonResponse({ success: false, error: { code, message } }, status);
}

function successResponse(data, status = 200) {
  return jsonResponse({ success: true, data }, status);
}

function addCorsHeaders(response, request) {
  const origin = request.headers.get('Origin') || '*';
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

// ============================================
// Auth Functions
// ============================================

function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function login(kv, password, correctPassword) {
  if (!correctPassword) return { success: false, error: 'AUTH_PASSWORD not configured' };
  if ((password || '').trim() !== correctPassword.trim()) return { success: false, error: 'Invalid password' };
  const token = generateToken();
  await kv.put(`session:${token}`, String(Date.now() + 86400000), { expirationTtl: 86400 });
  return { success: true, token };
}

async function validateToken(kv, token) {
  const expiresAt = await kv.get(`session:${token}`);
  if (!expiresAt) return false;
  return Date.now() < parseInt(expiresAt, 10);
}

async function logout(kv, token) {
  await kv.delete(`session:${token}`);
}

function getAuthToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

async function requireAuth(request, env) {
  const token = getAuthToken(request);
  if (!token) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  const isValid = await validateToken(env.EMAIL_FILTER_KV, token);
  if (!isValid) return errorResponse('SESSION_EXPIRED', 'Session expired', 401);
  return null;
}


// ============================================
// Filter Engine
// ============================================

function validatePattern(pattern) {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

function evaluate(email, rules) {
  const matchedRules = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    try {
      // 根据规则类型选择匹配目标
      let target;
      if (rule.type === 'sender') {
        target = email.senderDisplayName;
      } else if (rule.type === 'from') {
        target = email.fromAddress;
      } else {
        target = email.subject;
      }
      
      // 根据 matchMode 决定匹配方式
      let matched = false;
      if (rule.matchMode === 'text') {
        // 普通文本：包含匹配（不区分大小写）
        matched = target.toLowerCase().includes(rule.pattern.toLowerCase());
      } else {
        // 正则表达式匹配
        const regex = new RegExp(rule.pattern, 'i');
        matched = regex.test(target);
      }
      
      if (matched) {
        // 返回更详细的匹配信息
        matchedRules.push({
          id: rule.id,
          name: rule.name,
          type: rule.type,
          pattern: rule.pattern,
          category: rule.category || 'manual',
          matchedValue: target
        });
      }
    } catch {
      // Skip invalid regex
    }
  }
  return { filtered: matchedRules.length > 0, matchedRules };
}

function evaluateByCategory(email, whitelistRules, dynamicRules, manualRules) {
  // Priority: whitelist > manual (filter rules) > dynamic
  
  // Check whitelist first - matched emails are always forwarded
  const whitelistResult = evaluate(email, whitelistRules);
  if (whitelistResult.filtered) {
    return { action: 'forward', reason: 'whitelist', matchedRules: whitelistResult.matchedRules };
  }
  
  // Check manual filter rules
  const manualResult = evaluate(email, manualRules);
  if (manualResult.filtered) {
    return { action: 'filter', reason: 'manual', matchedRules: manualResult.matchedRules };
  }
  
  // Check dynamic rules
  const dynamicResult = evaluate(email, dynamicRules);
  if (dynamicResult.filtered) {
    return { action: 'filter', reason: 'dynamic', matchedRules: dynamicResult.matchedRules };
  }
  
  return { action: 'forward', reason: 'none', matchedRules: [] };
}

// ============================================
// VPS Sync Functions (从 VPS API 同步动态规则)
// ============================================

async function getLastSyncTime(kv) {
  const time = await kv.get('vps:last_sync');
  return time ? parseInt(time, 10) : 0;
}

async function setLastSyncTime(kv) {
  await kv.put('vps:last_sync', String(Date.now()));
}

async function shouldSyncFromVps(kv) {
  const lastSync = await getLastSyncTime(kv);
  const intervalMs = await getSyncIntervalMs(kv);
  return Date.now() - lastSync > intervalMs;
}

async function syncDynamicRulesFromVps(kv, vpsApiUrl, vpsApiToken) {
  if (!vpsApiUrl || !vpsApiToken) {
    console.log('⚠️ VPS API 未配置，跳过同步');
    return { synced: false, reason: 'VPS API not configured' };
  }

  try {
    console.log('🔄 开始从 VPS 同步动态规则...');
    
    const response = await fetch(`${vpsApiUrl}/api/rules?category=dynamic`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${vpsApiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('❌ VPS API 请求失败:', response.status);
      return { synced: false, reason: `API error: ${response.status}` };
    }

    const data = await response.json();
    const vpsRules = data.rules || [];
    
    // 转换 VPS 规则格式为本地格式
    const localRules = vpsRules.map(r => ({
      id: r.id,
      name: `[VPS] ${r.pattern}`,
      type: r.matchType === 'sender' ? 'from' : r.matchType, // sender -> from
      pattern: r.pattern,
      matchMode: r.matchMode === 'contains' ? 'text' : 'regex',
      category: 'dynamic',
      enabled: r.enabled,
      createdAt: new Date(r.createdAt).getTime(),
      updatedAt: new Date(r.updatedAt).getTime(),
      fromVps: true, // 标记来自 VPS
    }));

    // 获取现有规则数据
    const rulesData = await getAllRulesData(kv);
    
    // 保留本地创建的动态规则，合并 VPS 规则
    const localDynamic = (rulesData.dynamic || []).filter(r => !r.fromVps);
    rulesData.dynamic = [...localDynamic, ...localRules];
    
    await saveAllRulesData(kv, rulesData);
    await setLastSyncTime(kv);
    
    console.log(`✅ 同步完成: ${localRules.length} 条 VPS 动态规则`);
    return { synced: true, count: localRules.length };
  } catch (error) {
    console.error('❌ VPS 同步失败:', error.message || error);
    return { synced: false, reason: error.message || 'Unknown error' };
  }
}

// 手动触发同步
async function forceSyncFromVps(kv, vpsApiUrl, vpsApiToken) {
  return await syncDynamicRulesFromVps(kv, vpsApiUrl, vpsApiToken);
}

// ============================================
// Storage Functions (优化版 - 合并存储减少 KV 读取)
// ============================================

// 获取所有规则（单次 KV 读取，支持旧数据迁移）
async function getAllRulesData(kv) {
  const data = await kv.get('rules:all');
  if (data) return JSON.parse(data);
  
  // 迁移旧数据格式
  const result = { manual: [], whitelist: [], dynamic: [] };
  
  // 迁移 manual 规则
  const manualIndex = await kv.get('rules:index');
  if (manualIndex) {
    const ids = JSON.parse(manualIndex);
    for (const id of ids) {
      const ruleData = await kv.get(`rule:${id}`);
      if (ruleData) result.manual.push(JSON.parse(ruleData));
    }
  }
  
  // 迁移 whitelist 规则
  const whitelistIndex = await kv.get('rules:index:whitelist');
  if (whitelistIndex) {
    const ids = JSON.parse(whitelistIndex);
    for (const id of ids) {
      const ruleData = await kv.get(`rule:whitelist:${id}`);
      if (ruleData) result.whitelist.push(JSON.parse(ruleData));
    }
  }
  
  // 迁移 dynamic 规则
  const dynamicIndex = await kv.get('rules:index:dynamic');
  if (dynamicIndex) {
    const ids = JSON.parse(dynamicIndex);
    for (const id of ids) {
      const ruleData = await kv.get(`rule:dynamic:${id}`);
      if (ruleData) result.dynamic.push(JSON.parse(ruleData));
    }
  }
  
  // 如果有旧数据，保存到新格式
  if (result.manual.length || result.whitelist.length || result.dynamic.length) {
    await kv.put('rules:all', JSON.stringify(result));
  }
  
  return result;
}

// 保存所有规则（单次 KV 写入）
async function saveAllRulesData(kv, data) {
  await kv.put('rules:all', JSON.stringify(data));
}

async function getAllRules(kv) {
  const data = await getAllRulesData(kv);
  return (data.manual || []).sort((a, b) => b.createdAt - a.createdAt);
}

async function getRulesByCategory(kv, category) {
  const data = await getAllRulesData(kv);
  return (data[category] || []).sort((a, b) => b.createdAt - a.createdAt);
}

async function createRule(kv, input, category = 'manual') {
  if (!input.name || !input.type || !input.pattern) {
    throw { code: 'MISSING_FIELDS', message: 'Name, type, and pattern are required' };
  }
  const validation = validatePattern(input.pattern);
  if (!validation.valid) {
    throw { code: 'INVALID_REGEX', message: validation.error };
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  const rule = {
    id,
    name: input.name,
    type: input.type,
    pattern: input.pattern,
    matchMode: input.matchMode || 'regex',
    category: category,
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  
  const data = await getAllRulesData(kv);
  if (!data[category]) data[category] = [];
  data[category].push(rule);
  await saveAllRulesData(kv, data);
  
  return rule;
}

async function createWhitelistRule(kv, input) {
  return createRule(kv, input, 'whitelist');
}

async function updateRule(kv, id, input, category = 'manual') {
  const data = await getAllRulesData(kv);
  const rules = data[category] || [];
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) {
    throw { code: 'RULE_NOT_FOUND', message: 'Rule not found' };
  }
  const rule = rules[index];
  if (input.pattern !== undefined) {
    const validation = validatePattern(input.pattern);
    if (!validation.valid) {
      throw { code: 'INVALID_REGEX', message: validation.error };
    }
    rule.pattern = input.pattern;
  }
  if (input.name !== undefined) rule.name = input.name;
  if (input.type !== undefined) rule.type = input.type;
  if (input.matchMode !== undefined) rule.matchMode = input.matchMode;
  if (input.enabled !== undefined) rule.enabled = input.enabled;
  rule.updatedAt = Date.now();
  rules[index] = rule;
  data[category] = rules;
  await saveAllRulesData(kv, data);
  return rule;
}

async function deleteRule(kv, id, category = 'manual') {
  const data = await getAllRulesData(kv);
  const rules = data[category] || [];
  const index = rules.findIndex(r => r.id === id);
  if (index === -1) {
    throw { code: 'RULE_NOT_FOUND', message: 'Rule not found' };
  }
  rules.splice(index, 1);
  data[category] = rules;
  await saveAllRulesData(kv, data);
}

async function getForwardAddress(kv) {
  return await kv.get('config:forward');
}

async function setForwardAddress(kv, address) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(address)) {
    throw { code: 'INVALID_EMAIL', message: 'Invalid email address format' };
  }
  await kv.put('config:forward', address);
}

async function getDynamicDetectionConfig(kv) {
  const configData = await kv.get('config:dynamic-detection');
  if (!configData) {
    return {
      enabled: true,
      timeWindowMinutes: 30,
      emailThreshold: 5,
      expirationHours: 48,
    };
  }
  return JSON.parse(configData);
}

async function setDynamicDetectionConfig(kv, config) {
  if (config.timeWindowMinutes < 5 || config.timeWindowMinutes > 60) {
    throw { code: 'INVALID_CONFIG', message: 'Time window must be between 5 and 60 minutes' };
  }
  if (config.emailThreshold < 3 || config.emailThreshold > 100) {
    throw { code: 'INVALID_CONFIG', message: 'Email threshold must be between 3 and 100' };
  }
  if (config.expirationHours < 1 || config.expirationHours > 168) {
    throw { code: 'INVALID_CONFIG', message: 'Expiration hours must be between 1 and 168' };
  }
  await kv.put('config:dynamic-detection', JSON.stringify(config));
  return config;
}

async function getDynamicRules(kv) {
  return getRulesByCategory(kv, 'dynamic');
}

async function deleteDynamicRule(kv, id) {
  return deleteRule(kv, id, 'dynamic');
}


// ============================================
// API Handlers
// ============================================

async function handleLogin(request, env) {
  try {
    const body = await request.json();
    if (!body.password) return errorResponse('MISSING_FIELDS', 'Password required', 400);
    const result = await login(env.EMAIL_FILTER_KV, body.password, env.AUTH_PASSWORD);
    if (!result.success) return errorResponse('UNAUTHORIZED', result.error, 401);
    return successResponse({ token: result.token });
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Login failed', 500);
  }
}

async function handleLogout(request, env) {
  const token = getAuthToken(request);
  if (token) await logout(env.EMAIL_FILTER_KV, token);
  return successResponse({ message: 'Logged out' });
}

async function handleGetRules(env) {
  try {
    const rules = await getAllRules(env.EMAIL_FILTER_KV);
    return successResponse(rules);
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch rules', 500);
  }
}

async function handleCreateRule(request, env) {
  try {
    const body = await request.json();
    const rule = await createRule(env.EMAIL_FILTER_KV, body);
    return successResponse(rule, 201);
  } catch (error) {
    if (error.code) return errorResponse(error.code, error.message, 400);
    return errorResponse('INTERNAL_ERROR', 'Failed to create rule', 500);
  }
}

async function handleUpdateRule(request, env, id) {
  try {
    const body = await request.json();
    const rule = await updateRule(env.EMAIL_FILTER_KV, id, body);
    return successResponse(rule);
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') return errorResponse(error.code, error.message, 404);
    if (error.code) return errorResponse(error.code, error.message, 400);
    return errorResponse('INTERNAL_ERROR', 'Failed to update rule', 500);
  }
}

async function handleDeleteRule(env, id) {
  try {
    await deleteRule(env.EMAIL_FILTER_KV, id);
    return successResponse({ message: 'Rule deleted' });
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') return errorResponse(error.code, error.message, 404);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete rule', 500);
  }
}

async function handleValidatePattern(request) {
  try {
    const body = await request.json();
    if (typeof body.pattern !== 'string') return errorResponse('MISSING_FIELDS', 'Pattern required', 400);
    const result = validatePattern(body.pattern);
    return successResponse(result);
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Validation failed', 500);
  }
}

async function handleGetForwardAddress(env) {
  try {
    const address = await getForwardAddress(env.EMAIL_FILTER_KV);
    return successResponse({ forwardAddress: address });
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to get forward address', 500);
  }
}

async function handleSetForwardAddress(request, env) {
  try {
    const body = await request.json();
    if (!body.forwardAddress) return errorResponse('MISSING_FIELDS', 'Forward address required', 400);
    await setForwardAddress(env.EMAIL_FILTER_KV, body.forwardAddress);
    return successResponse({ message: 'Forward address updated' });
  } catch (error) {
    if (error.code === 'INVALID_EMAIL') return errorResponse(error.code, error.message, 400);
    return errorResponse('INTERNAL_ERROR', 'Failed to set forward address', 500);
  }
}

async function handleGetWhitelist(env) {
  try {
    const rules = await getRulesByCategory(env.EMAIL_FILTER_KV, 'whitelist');
    return successResponse(rules);
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch whitelist', 500);
  }
}

async function handleCreateWhitelistRule(request, env) {
  try {
    const body = await request.json();
    const rule = await createWhitelistRule(env.EMAIL_FILTER_KV, body);
    return successResponse(rule, 201);
  } catch (error) {
    if (error.code) return errorResponse(error.code, error.message, 400);
    return errorResponse('INTERNAL_ERROR', 'Failed to create whitelist rule', 500);
  }
}

async function handleUpdateWhitelistRule(request, env, id) {
  try {
    const body = await request.json();
    const rule = await updateRule(env.EMAIL_FILTER_KV, id, body, 'whitelist');
    return successResponse(rule);
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') return errorResponse(error.code, error.message, 404);
    if (error.code) return errorResponse(error.code, error.message, 400);
    return errorResponse('INTERNAL_ERROR', 'Failed to update whitelist rule', 500);
  }
}

async function handleDeleteWhitelistRule(env, id) {
  try {
    await deleteRule(env.EMAIL_FILTER_KV, id, 'whitelist');
    return successResponse({ message: 'Whitelist rule deleted' });
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') return errorResponse(error.code, error.message, 404);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete whitelist rule', 500);
  }
}



async function handleGetDynamicDetectionConfig(env) {
  try {
    const config = await getDynamicDetectionConfig(env.EMAIL_FILTER_KV);
    return successResponse(config);
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch dynamic detection config', 500);
  }
}

async function handleSetDynamicDetectionConfig(request, env) {
  try {
    const body = await request.json();
    const config = await setDynamicDetectionConfig(env.EMAIL_FILTER_KV, body);
    return successResponse(config);
  } catch (error) {
    if (error.code) return errorResponse(error.code, error.message, 400);
    return errorResponse('INTERNAL_ERROR', 'Failed to set dynamic detection config', 500);
  }
}

async function handleGetDynamicRules(env) {
  try {
    const rules = await getDynamicRules(env.EMAIL_FILTER_KV);
    return successResponse(rules);
  } catch {
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch dynamic rules', 500);
  }
}

async function handleDeleteDynamicRule(env, id) {
  try {
    await deleteDynamicRule(env.EMAIL_FILTER_KV, id);
    return successResponse({ message: 'Dynamic rule deleted' });
  } catch (error) {
    if (error.code === 'RULE_NOT_FOUND') return errorResponse(error.code, error.message, 404);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete dynamic rule', 500);
  }
}

// VPS Sync Handlers
async function handleVpsSync(env) {
  try {
    if (!env.VPS_API_URL || !env.VPS_API_TOKEN) {
      return errorResponse('VPS_NOT_CONFIGURED', 'VPS_API_URL and VPS_API_TOKEN must be configured', 400);
    }
    const result = await forceSyncFromVps(env.EMAIL_FILTER_KV, env.VPS_API_URL, env.VPS_API_TOKEN);
    if (result.synced) {
      return successResponse({ message: `Synced ${result.count} dynamic rules from VPS`, count: result.count });
    } else {
      return errorResponse('SYNC_FAILED', result.reason, 500);
    }
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', 'Failed to sync from VPS', 500);
  }
}

async function handleVpsSyncStatus(env) {
  try {
    const lastSync = await getLastSyncTime(env.EMAIL_FILTER_KV);
    const rulesData = await getAllRulesData(env.EMAIL_FILTER_KV);
    const vpsRules = (rulesData.dynamic || []).filter(r => r.fromVps);
    const syncConfig = await getVpsSyncConfig(env.EMAIL_FILTER_KV);
    
    return successResponse({
      configured: !!(env.VPS_API_URL && env.VPS_API_TOKEN),
      vpsApiUrl: env.VPS_API_URL ? env.VPS_API_URL.replace(/\/api.*$/, '') : null,
      lastSyncAt: lastSync ? new Date(lastSync).toISOString() : null,
      vpsRulesCount: vpsRules.length,
      syncIntervalMinutes: syncConfig.syncIntervalMinutes,
    });
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', 'Failed to get sync status', 500);
  }
}

async function handleGetVpsSyncConfig(env) {
  try {
    const config = await getVpsSyncConfig(env.EMAIL_FILTER_KV);
    return successResponse(config);
  } catch (error) {
    return errorResponse('INTERNAL_ERROR', 'Failed to get sync config', 500);
  }
}

async function handleSetVpsSyncConfig(request, env) {
  try {
    const body = await request.json();
    const config = await setVpsSyncConfig(env.EMAIL_FILTER_KV, body);
    return successResponse(config);
  } catch (error) {
    if (error.code) return errorResponse(error.code, error.message, 400);
    return errorResponse('INTERNAL_ERROR', 'Failed to set sync config', 500);
  }
}


// ============================================
// Router
// ============================================

function parseRoute(pathname) {
  const rulesIdMatch = pathname.match(/^\/api\/rules\/([^/]+)$/);
  if (rulesIdMatch) return { route: '/api/rules/:id', params: { id: rulesIdMatch[1] } };
  
  const whitelistIdMatch = pathname.match(/^\/api\/whitelist\/([^/]+)$/);
  if (whitelistIdMatch) return { route: '/api/whitelist/:id', params: { id: whitelistIdMatch[1] } };
  

  
  const dynamicIdMatch = pathname.match(/^\/api\/dynamic-rules\/([^/]+)$/);
  if (dynamicIdMatch) return { route: '/api/dynamic-rules/:id', params: { id: dynamicIdMatch[1] } };
  
  return { route: pathname, params: {} };
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const { route, params } = parseRoute(url.pathname);
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return addCorsHeaders(new Response(null, { status: 204 }), request);
  }

  // Root path - serve admin panel
  if ((route === '/' || route === '') && method === 'GET') {
    return new Response(getAdminHtml(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Public routes
  if (route === '/api/auth/login' && method === 'POST') {
    const response = await handleLogin(request, env);
    return addCorsHeaders(response, request);
  }

  // Protected routes
  const authError = await requireAuth(request, env);
  if (authError) return addCorsHeaders(authError, request);

  let response;

  if (route === '/api/auth/logout' && method === 'POST') {
    response = await handleLogout(request, env);
  } else if (route === '/api/rules') {
    if (method === 'GET') response = await handleGetRules(env);
    else if (method === 'POST') response = await handleCreateRule(request, env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/rules/validate' && method === 'POST') {
    response = await handleValidatePattern(request);
  } else if (route === '/api/rules/:id') {
    if (method === 'PUT') response = await handleUpdateRule(request, env, params.id);
    else if (method === 'DELETE') response = await handleDeleteRule(env, params.id);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/config/forward') {
    if (method === 'GET') response = await handleGetForwardAddress(env);
    else if (method === 'PUT') response = await handleSetForwardAddress(request, env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/whitelist') {
    if (method === 'GET') response = await handleGetWhitelist(env);
    else if (method === 'POST') response = await handleCreateWhitelistRule(request, env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/whitelist/:id') {
    if (method === 'PUT') response = await handleUpdateWhitelistRule(request, env, params.id);
    else if (method === 'DELETE') response = await handleDeleteWhitelistRule(env, params.id);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/config/dynamic-detection') {
    if (method === 'GET') response = await handleGetDynamicDetectionConfig(env);
    else if (method === 'PUT') response = await handleSetDynamicDetectionConfig(request, env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/dynamic-rules') {
    if (method === 'GET') response = await handleGetDynamicRules(env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/dynamic-rules/:id') {
    if (method === 'DELETE') response = await handleDeleteDynamicRule(env, params.id);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/vps/sync') {
    if (method === 'POST') response = await handleVpsSync(env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/vps/status') {
    if (method === 'GET') response = await handleVpsSyncStatus(env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else if (route === '/api/vps/config') {
    if (method === 'GET') response = await handleGetVpsSyncConfig(env);
    else if (method === 'PUT') response = await handleSetVpsSyncConfig(request, env);
    else response = errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } else {
    response = errorResponse('NOT_FOUND', 'Not found', 404);
  }

  return addCorsHeaders(response, request);
}

// ============================================
// Email Handler
// ============================================

function extractSenderDisplayName(from) {
  if (!from) return '';
  const match = from.match(/^"?([^"<]+)"?\s*<[^>]+>$/);
  if (match) return match[1].trim();
  const simpleMatch = from.match(/^([^<]+)<[^>]+>$/);
  if (simpleMatch) return simpleMatch[1].trim();
  return from.trim();
}

function extractEmailAddress(from) {
  if (!from) return '';
  // 匹配 <email@example.com> 格式
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  // 如果没有尖括号，整个字符串可能就是邮箱
  return from.trim();
}

function getTypeLabel(type) {
  const labels = {
    'sender': '发件人名称',
    'from': '发件邮箱',
    'subject': '主题'
  };
  return labels[type] || type;
}

async function handleEmail(message, env) {
  const senderDisplayName = extractSenderDisplayName(message.from);
  const fromAddress = extractEmailAddress(message.from);
  const subject = message.headers.get('subject') || '';

  // 简化日志
  console.log('📧', message.from, '|', subject);

  try {
    // 检查是否需要从 VPS 同步动态规则（每5分钟一次）
    const needSync = await shouldSyncFromVps(env.EMAIL_FILTER_KV);
    if (needSync && env.VPS_API_URL && env.VPS_API_TOKEN) {
      // 异步同步，不阻塞邮件处理
      syncDynamicRulesFromVps(env.EMAIL_FILTER_KV, env.VPS_API_URL, env.VPS_API_TOKEN)
        .catch(e => console.error('后台同步失败:', e));
    }

    // 优化：单次 KV 读取获取所有规则和转发地址
    const [rulesData, forwardAddress] = await Promise.all([
      getAllRulesData(env.EMAIL_FILTER_KV),
      getForwardAddress(env.EMAIL_FILTER_KV)
    ]);
    
    const email = { senderDisplayName, fromAddress, subject };
    const result = evaluateByCategory(
      email, 
      rulesData.whitelist || [], 
      rulesData.dynamic || [], 
      rulesData.manual || []
    );

    if (result.action === 'filter') {
      console.log(`🚫 过滤: ${result.matchedRules[0]?.name || 'unknown'}`);
      return;
    }

    if (!forwardAddress) {
      console.log('⚠️ 无转发地址');
      return;
    }

    try {
      await message.forward(forwardAddress);
      console.log('✅ 转发:', forwardAddress);
    } catch (e) {
      console.error('⚠️ 转发失败:', e.message || e);
    }
  } catch (error) {
    console.error('❌ 错误:', error);
  }
}


// ============================================
// Admin Panel HTML (Embedded)
// ============================================

function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>邮件过滤管理</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root { --p: #3b82f6; --d: #ef4444; --s: #22c55e; --bg: #f8fafc; --c: #fff; --t: #1e293b; --m: #64748b; --b: #e2e8f0; --r: 8px; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--t); line-height: 1.5; }
    #app { min-height: 100vh; }
    .page { max-width: 800px; margin: 0 auto; padding: 20px; }
    .hidden { display: none !important; }
    header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; gap: 12px; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.125rem; margin-bottom: 16px; }
    .card { background: var(--c); border-radius: var(--r); padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin-bottom: 16px; }
    .btn { padding: 10px 16px; border: none; border-radius: var(--r); font-size: .875rem; cursor: pointer; }
    .btn-primary { background: var(--p); color: #fff; }
    .btn-secondary { background: var(--b); color: var(--t); }
    .btn-danger { background: var(--d); color: #fff; }
    .btn-back { background: none; border: none; color: var(--p); cursor: pointer; font-size: 1rem; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: .875rem; margin-bottom: 6px; font-weight: 500; }
    .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid var(--b); border-radius: var(--r); font-size: 1rem; }
    .form-group small { display: block; margin-top: 4px; font-size: .75rem; color: var(--m); }
    .form-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
    .error-message { color: var(--d); font-size: .875rem; min-height: 20px; margin-bottom: 8px; }
    .success-message { color: var(--s); font-size: .875rem; min-height: 20px; margin-bottom: 8px; }
    .empty-state { text-align: center; padding: 40px; color: var(--m); }
    .tabs { display: flex; margin-bottom: 20px; border-bottom: 1px solid var(--b); }
    .tab { padding: 12px 20px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; color: var(--m); font-size: 1rem; }
    .tab.active { color: var(--p); border-bottom-color: var(--p); }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .section-header h2 { margin: 0; }
    .rule-item { display: flex; align-items: center; padding: 16px; background: var(--c); border: 1px solid var(--b); border-radius: var(--r); margin-bottom: 8px; }
    .rule-toggle { margin-right: 16px; }
    .rule-info { flex: 1; }
    .rule-name { font-weight: 500; }
    .rule-meta { font-size: .75rem; color: var(--m); margin-top: 4px; }
    .rule-type { display: inline-block; padding: 2px 8px; background: var(--b); border-radius: 4px; margin-right: 8px; }
    .rule-pattern { font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; }
    .rule-actions { display: flex; gap: 8px; }
    .toggle { position: relative; width: 44px; height: 24px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; cursor: pointer; inset: 0; background: var(--b); border-radius: 24px; transition: .2s; }
    .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: .2s; }
    .toggle input:checked + .toggle-slider { background: var(--p); }
    .toggle input:checked + .toggle-slider:before { transform: translateX(20px); }
    .modal { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; }
    .modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.5); }
    .modal-content { position: relative; background: var(--c); border-radius: var(--r); padding: 24px; width: 90%; max-width: 500px; }
    .modal-small { max-width: 400px; }
    .toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); padding: 12px 24px; border-radius: var(--r); z-index: 200; opacity: 0; transition: .3s; }
    .toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    .toast-success { background: var(--s); color: #fff; }
    .toast-error { background: var(--d); color: #fff; }
  </style>
</head>
<body>
  <div id="app">
    <!-- Login Page -->
    <div id="login-page" class="page">
      <header><h1>邮件过滤管理</h1></header>
      <main>
        <section class="card">
          <form id="login-form">
            <div class="form-group">
              <label for="password">管理密码</label>
              <input type="password" id="password" required placeholder="输入管理密码">
            </div>
            <div class="error-message" id="login-error"></div>
            <button type="submit" class="btn btn-primary" style="width:100%">登录</button>
          </form>
        </section>
      </main>
    </div>

    <!-- Dashboard Page -->
    <div id="dashboard-page" class="page hidden">
      <header>
        <h1>邮件过滤管理</h1>
        <button class="btn btn-secondary" id="logout-btn">登出</button>
      </header>
      <nav class="tabs">
        <button class="tab active" data-tab="rules">过滤规则</button>
        <button class="tab" data-tab="whitelist">白名单</button>
        <button class="tab" data-tab="dynamic">动态规则</button>
        <button class="tab" data-tab="settings">设置</button>
      </nav>
      <main>
        <section id="rules-tab">
          <div class="section-header">
            <h2>过滤规则</h2>
            <button class="btn btn-primary" id="add-rule-btn">添加规则</button>
          </div>
          <div id="rules-list"></div>
          <div class="empty-state" id="no-rules">暂无过滤规则</div>
        </section>
        <section id="whitelist-tab" class="hidden">
          <div class="section-header">
            <h2>白名单</h2>
            <button class="btn btn-primary" id="add-whitelist-btn">添加白名单</button>
          </div>
          <div id="whitelist-list"></div>
          <div class="empty-state" id="no-whitelist">暂无白名单规则</div>
        </section>

        <section id="dynamic-tab" class="hidden">
          <div class="section-header">
            <h2>动态规则</h2>
            <button class="btn btn-primary" id="sync-vps-btn">从 VPS 同步</button>
          </div>
          <div class="card" id="vps-sync-status" style="margin-bottom:16px;padding:12px;background:#f1f5f9;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span id="vps-status-text">VPS 同步状态: 检查中...</span>
              <span id="vps-rules-count" style="color:#64748b;font-size:.875rem;"></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;font-size:.875rem;">
              <label>同步间隔:</label>
              <select id="sync-interval" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;">
                <option value="1">1 分钟</option>
                <option value="2">2 分钟</option>
                <option value="5">5 分钟</option>
                <option value="10">10 分钟</option>
                <option value="15">15 分钟</option>
                <option value="30">30 分钟</option>
                <option value="60">60 分钟</option>
              </select>
              <button class="btn btn-secondary" id="save-sync-interval-btn" style="padding:4px 12px;font-size:.75rem;">保存</button>
            </div>
          </div>
          <div id="dynamic-list"></div>
          <div class="empty-state" id="no-dynamic">暂无动态规则</div>
        </section>
        <section id="settings-tab" class="hidden">
          <h2>转发设置</h2>
          <section class="card">
            <form id="forward-form">
              <div class="form-group">
                <label for="forward-address">转发邮箱地址</label>
                <input type="email" id="forward-address" placeholder="example@domain.com">
                <small>未被过滤的邮件将转发到此地址</small>
              </div>
              <div class="error-message" id="forward-error"></div>
              <div class="success-message" id="forward-success"></div>
              <button type="submit" class="btn btn-primary">保存</button>
            </form>
          </section>
          <h2>动态检测设置</h2>
          <section class="card">
            <form id="dynamic-config-form">
              <div class="form-group">
                <label for="dynamic-enabled">
                  <input type="checkbox" id="dynamic-enabled">
                  启用动态异常检测
                </label>
              </div>
              <div class="form-group">
                <label for="time-window">时间窗口（分钟）</label>
                <input type="number" id="time-window" min="5" max="60" value="30">
                <small>在此时间段内检测相同主题的邮件数量</small>
              </div>
              <div class="form-group">
                <label for="email-threshold">邮件数量阈值</label>
                <input type="number" id="email-threshold" min="3" max="100" value="5">
                <small>超过此数量时自动创建过滤规则</small>
              </div>
              <div class="form-group">
                <label for="expiration-hours">规则过期时间（小时）</label>
                <input type="number" id="expiration-hours" min="1" max="168" value="48">
                <small>动态规则在此时间内未匹配则自动删除</small>
              </div>
              <div class="error-message" id="dynamic-config-error"></div>
              <div class="success-message" id="dynamic-config-success"></div>
              <button type="submit" class="btn btn-primary">保存</button>
            </form>
          </section>
        </section>
      </main>
    </div>

    <!-- Rule Modal -->
    <div id="rule-modal" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <h2 id="modal-title">添加规则</h2>
        <form id="rule-form">
          <input type="hidden" id="rule-id">
          <div class="form-group">
            <label for="rule-name">规则名称</label>
            <input type="text" id="rule-name" required placeholder="例如: 屏蔽广告邮件">
          </div>
          <div class="form-group">
            <label for="rule-type">过滤类型</label>
            <select id="rule-type">
              <option value="sender">发件人名称</option>
              <option value="from">发件邮箱</option>
              <option value="subject">主题</option>
            </select>
          </div>
          <div class="form-group">
            <label for="rule-match-mode">匹配模式</label>
            <select id="rule-match-mode">
              <option value="text">普通文本</option>
              <option value="regex">正则表达式</option>
            </select>
          </div>
          <div class="form-group">
            <label for="rule-pattern">匹配内容</label>
            <input type="text" id="rule-pattern" required placeholder="输入要匹配的文本">
            <small id="pattern-hint">输入要严格匹配的文本</small>
          </div>
          <div class="error-message" id="rule-error"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="cancel-rule">取消</button>
            <button type="submit" class="btn btn-primary">保存</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Modal -->
    <div id="delete-modal" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content modal-small">
        <h2>确认删除</h2>
        <p id="delete-message">确定删除？</p>
        <div class="form-actions">
          <button class="btn btn-secondary" id="cancel-delete">取消</button>
          <button class="btn btn-danger" id="confirm-delete">删除</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = '';
    let authToken = localStorage.getItem('email-filter:token');
    let state = { 
      rules: [], 
      whitelist: [],
      dynamic: [],
      editRule: null, 
      editCat: null,
      deleteId: null,
      deleteCat: null
    };
    const $ = id => document.getElementById(id);

    function showPage(p) {
      $('login-page').classList.toggle('hidden', p !== 'login');
      $('dashboard-page').classList.toggle('hidden', p !== 'dashboard');
    }

    function showTab(t) {
      document.querySelectorAll('.tab').forEach(e => e.classList.toggle('active', e.dataset.tab === t));
      $('rules-tab').classList.toggle('hidden', t !== 'rules');
      $('whitelist-tab').classList.toggle('hidden', t !== 'whitelist');
      $('dynamic-tab').classList.toggle('hidden', t !== 'dynamic');
      $('settings-tab').classList.toggle('hidden', t !== 'settings');
    }

    function esc(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function toast(m, t = 'success') {
      let e = $('toast');
      if (!e) {
        e = document.createElement('div');
        e.id = 'toast';
        document.body.appendChild(e);
      }
      e.textContent = m;
      e.className = 'toast toast-' + t + ' show';
      setTimeout(() => e.classList.remove('show'), 3000);
    }

    async function api(path, options = {}) {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = 'Bearer ' + authToken;
      const res = await fetch(API_BASE + path, { ...options, headers });
      return res.json();
    }

    async function doLogin() {
      $('login-error').textContent = '';
      try {
        console.log('尝试登录...');
        const r = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ password: $('password').value })
        });
        console.log('登录响应:', r);
        if (r.success && r.data && r.data.token) {
          authToken = r.data.token;
          localStorage.setItem('email-filter:token', authToken);
          console.log('登录成功，跳转到 dashboard');
          showPage('dashboard');
          loadRules();
          loadFwd();
        } else {
          const errMsg = (r.error && r.error.message) || '登录失败';
          console.log('登录失败:', errMsg);
          $('login-error').textContent = errMsg;
        }
      } catch (e) {
        console.error('登录异常:', e);
        $('login-error').textContent = '网络错误: ' + (e.message || e);
      }
    }

    async function doLogout() {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
      authToken = null;
      localStorage.removeItem('email-filter:token');
      $('password').value = '';
      showPage('login');
    }

    async function loadRules() {
      try {
        // 同时加载过滤规则和动态规则
        const [rulesRes, dynamicRes] = await Promise.all([
          api('/api/rules'),
          api('/api/dynamic-rules')
        ]);
        if (rulesRes.success) {
          // 合并过滤规则和动态规则
          const manualRules = rulesRes.data || [];
          const dynamicRules = (dynamicRes.success ? dynamicRes.data : []) || [];
          // 标记动态规则
          dynamicRules.forEach(r => { r.isDynamic = true; });
          state.rules = [...manualRules, ...dynamicRules];
          renderRules();
        } else if (rulesRes.error && (rulesRes.error.code === 'UNAUTHORIZED' || rulesRes.error.code === 'SESSION_EXPIRED')) {
          doLogout();
        }
      } catch {
        toast('加载失败', 'error');
      }
    }

    function renderRules() {
      const l = $('rules-list');
      l.innerHTML = '';
      $('no-rules').classList.toggle('hidden', state.rules.length > 0);
      state.rules.forEach(r => {
        const d = document.createElement('div');
        d.className = 'rule-item';
        const isDynamic = r.isDynamic || r.category === 'dynamic';
        const isVps = r.fromVps;
        const typeLabel = {sender:'发件人名称',from:'发件邮箱',subject:'主题'}[r.type]||r.type;
        const sourceTag = isVps ? '<span style="color:#3b82f6;font-size:.75rem;margin-left:4px">[VPS]</span>' : 
                          isDynamic ? '<span style="color:#f59e0b;font-size:.75rem;margin-left:4px">[动态]</span>' : '';
        d.innerHTML = '<label class="toggle rule-toggle"><input type="checkbox" ' + (r.enabled ? 'checked' : '') + ' data-id="' + r.id + '"><span class="toggle-slider"></span></label>' +
          '<div class="rule-info"><div class="rule-name">' + esc(r.name) + sourceTag + '</div>' +
          '<div class="rule-meta"><span class="rule-type">' + typeLabel + '</span>' +
          '<code class="rule-pattern">' + esc(r.pattern) + '</code></div></div>' +
          '<div class="rule-actions">' + (isDynamic ? '' : '<button class="btn btn-secondary">编辑</button>') + '<button class="btn btn-danger">删除</button></div>';
        d.querySelector('input').onchange = e => isDynamic ? toggleDynamicRule(r.id, e.target.checked) : toggleRule(r.id, e.target.checked);
        if (!isDynamic) {
          d.querySelectorAll('button')[0].onclick = () => openEd(r);
          d.querySelectorAll('button')[1].onclick = () => openDel(r);
        } else {
          d.querySelector('.btn-danger').onclick = () => openDel(r, 'dynamic');
        }
        l.appendChild(d);
      });
    }

    async function toggleDynamicRule(id, en) {
      // 动态规则暂不支持切换，刷新列表
      loadRules();
    }

    function escRx(s) {
      return s.replace(/[-\\/^$*+?.()|[\]{}]/g, '\\$&');
    }

    function updateHint() {
      const m = $('rule-match-mode').value;
      $('pattern-hint').textContent = m === 'regex' ? '使用正则表达式语法' : '输入要包含的文本';
      $('rule-pattern').placeholder = m === 'regex' ? '例如: 广告|推广' : '输入文本';
    }

    function openEd(r, cat) {
      state.editRule = r || null;
      state.editCat = cat || 'manual';
      let title = '添加规则';
      if (cat === 'whitelist') title = r ? '编辑白名单' : '添加白名单';
      else title = r ? '编辑规则' : '添加规则';
      $('modal-title').textContent = title;
      $('rule-id').value = r ? r.id : '';
      $('rule-name').value = r ? r.name : '';
      $('rule-type').value = r ? r.type : 'sender';
      // 使用保存的 matchMode 字段来判断
      if (r && r.matchMode === 'text') {
        $('rule-match-mode').value = 'text';
        $('rule-pattern').value = r.pattern.replace(/\\\\(.)/g, '$1'); // 反转义
      } else if (r && r.pattern) {
        $('rule-match-mode').value = 'regex';
        $('rule-pattern').value = r.pattern;
      } else {
        $('rule-match-mode').value = 'text';
        $('rule-pattern').value = '';
      }
      updateHint();
      $('rule-error').textContent = '';
      $('rule-modal').classList.remove('hidden');
    }

    function closeEd() {
      state.editRule = null;
      $('rule-modal').classList.add('hidden');
      $('rule-form').reset();
    }

    async function saveRule() {
      const m = $('rule-match-mode').value;
      let p = $('rule-pattern').value;
      if (m === 'text') p = escRx(p); // 包含匹配，转义特殊字符
      const input = {
        name: $('rule-name').value.trim(),
        type: $('rule-type').value,
        pattern: p,
        matchMode: m // 保存匹配模式
      };
      $('rule-error').textContent = '';
      try {
        const v = await api('/api/rules/validate', { method: 'POST', body: JSON.stringify({ pattern: input.pattern }) });
        if (v.success && v.data && !v.data.valid) {
          $('rule-error').textContent = v.data.error || '无效正则';
          return;
        }
        const cat = state.editCat || 'manual';
        let endpoint = '/api/rules';
        if (cat === 'whitelist') endpoint = '/api/whitelist';
        
        const res = state.editRule
          ? await api(endpoint + '/' + state.editRule.id, { method: 'PUT', body: JSON.stringify(input) })
          : await api(endpoint, { method: 'POST', body: JSON.stringify(input) });
        if (res.success) {
          closeEd();
          const catName = cat === 'whitelist' ? '白名单' : '规则';
          toast(state.editRule ? catName + '已更新' : catName + '已创建');
          if (cat === 'whitelist') loadWhitelist();
          else loadRules();
        } else {
          $('rule-error').textContent = (res.error && res.error.message) || '保存失败';
        }
      } catch {
        $('rule-error').textContent = '网络错误';
      }
    }

    async function toggleRule(id, en) {
      try {
        await api('/api/rules/' + id, { method: 'PUT', body: JSON.stringify({ enabled: en }) });
      } catch {
        loadRules();
      }
    }

    function openDel(r, cat) {
      state.deleteId = r.id;
      state.deleteCat = cat || 'manual';
      $('delete-message').textContent = '确定删除规则 "' + r.name + '" 吗？';
      $('delete-modal').classList.remove('hidden');
    }

    function closeDel() {
      state.deleteId = null;
      state.deleteCat = null;
      $('delete-modal').classList.add('hidden');
    }

    async function confirmDel() {
      if (!state.deleteId) return;
      try {
        const cat = state.deleteCat || 'manual';
        let endpoint = '/api/rules';
        if (cat === 'whitelist') endpoint = '/api/whitelist';
        else if (cat === 'dynamic') endpoint = '/api/dynamic-rules';
        
        const r = await api(endpoint + '/' + state.deleteId, { method: 'DELETE' });
        if (r.success) {
          closeDel();
          const catName = cat === 'whitelist' ? '白名单' : cat === 'dynamic' ? '动态规则' : '规则';
          toast(catName + '已删除');
          if (cat === 'whitelist') loadWhitelist();
          else if (cat === 'dynamic') loadDynamic();
          else loadRules();
        } else {
          toast('删除失败', 'error');
        }
      } catch {
        toast('网络错误', 'error');
      }
    }

    async function loadFwd() {
      try {
        const r = await api('/api/config/forward');
        if (r.success && r.data) $('forward-address').value = r.data.forwardAddress || '';
      } catch {}
    }

    async function loadWhitelist() {
      try {
        const r = await api('/api/whitelist');
        if (r.success) {
          state.whitelist = r.data;
          renderWhitelist();
        }
      } catch {
        toast('加载白名单失败', 'error');
      }
    }

    function renderWhitelist() {
      const l = $('whitelist-list');
      l.innerHTML = '';
      $('no-whitelist').classList.toggle('hidden', state.whitelist.length > 0);
      state.whitelist.forEach(r => {
        const d = document.createElement('div');
        d.className = 'rule-item';
        d.innerHTML = '<label class="toggle rule-toggle"><input type="checkbox" ' + (r.enabled ? 'checked' : '') + ' data-id="' + r.id + '"><span class="toggle-slider"></span></label>' +
          '<div class="rule-info"><div class="rule-name">' + esc(r.name) + '</div>' +
          '<div class="rule-meta"><span class="rule-type">' + ({sender:'发件人',from:'邮箱',subject:'主题'}[r.type]||r.type) + '</span>' +
          '<code class="rule-pattern">' + esc(r.pattern) + '</code></div></div>' +
          '<div class="rule-actions"><button class="btn btn-secondary">编辑</button><button class="btn btn-danger">删除</button></div>';
        d.querySelector('input').onchange = e => toggleWhitelist(r.id, e.target.checked);
        d.querySelectorAll('button')[0].onclick = () => openEd(r, 'whitelist');
        d.querySelectorAll('button')[1].onclick = () => openDel(r, 'whitelist');
        l.appendChild(d);
      });
    }

    async function toggleWhitelist(id, en) {
      try {
        await api('/api/whitelist/' + id, { method: 'PUT', body: JSON.stringify({ enabled: en }) });
      } catch {
        loadWhitelist();
      }
    }

    async function loadDynamic() {
      try {
        const r = await api('/api/dynamic-rules');
        if (r.success) {
          state.dynamic = r.data;
          renderDynamic();
        }
        // 同时加载 VPS 同步状态
        loadVpsSyncStatus();
      } catch {
        toast('加载动态规则失败', 'error');
      }
    }

    async function loadVpsSyncStatus() {
      try {
        const r = await api('/api/vps/status');
        if (r.success && r.data) {
          const d = r.data;
          if (d.configured) {
            const lastSync = d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString('zh-CN') : '从未同步';
            $('vps-status-text').innerHTML = '✅ VPS 已配置 | 上次同步: ' + lastSync;
            $('vps-rules-count').textContent = 'VPS 规则: ' + d.vpsRulesCount + ' 条';
            $('sync-vps-btn').disabled = false;
          } else {
            $('vps-status-text').innerHTML = '⚠️ VPS 未配置 (需设置 VPS_API_URL 和 VPS_API_TOKEN)';
            $('vps-rules-count').textContent = '';
            $('sync-vps-btn').disabled = true;
          }
          // 设置同步间隔下拉框
          $('sync-interval').value = d.syncIntervalMinutes || 5;
        }
      } catch {
        $('vps-status-text').textContent = '❌ 获取状态失败';
      }
    }

    async function syncFromVps() {
      $('sync-vps-btn').disabled = true;
      $('sync-vps-btn').textContent = '同步中...';
      try {
        const r = await api('/api/vps/sync', { method: 'POST' });
        if (r.success) {
          toast('同步成功: ' + r.data.count + ' 条规则');
          loadDynamic();
        } else {
          toast((r.error && r.error.message) || '同步失败', 'error');
        }
      } catch {
        toast('同步失败', 'error');
      } finally {
        $('sync-vps-btn').disabled = false;
        $('sync-vps-btn').textContent = '从 VPS 同步';
      }
    }

    async function saveSyncInterval() {
      const interval = parseInt($('sync-interval').value, 10);
      try {
        const r = await api('/api/vps/config', {
          method: 'PUT',
          body: JSON.stringify({ syncIntervalMinutes: interval })
        });
        if (r.success) {
          toast('同步间隔已保存');
        } else {
          toast((r.error && r.error.message) || '保存失败', 'error');
        }
      } catch {
        toast('保存失败', 'error');
      }
    }

    function renderDynamic() {
      const l = $('dynamic-list');
      l.innerHTML = '';
      $('no-dynamic').classList.toggle('hidden', state.dynamic.length > 0);
      state.dynamic.forEach(r => {
        const d = document.createElement('div');
        d.className = 'rule-item';
        const created = new Date(r.createdAt).toLocaleString('zh-CN');
        const lastMatched = r.lastMatchedAt ? new Date(r.lastMatchedAt).toLocaleString('zh-CN') : '未匹配';
        const source = r.fromVps ? '<span style="color:#3b82f6;margin-left:8px">[VPS]</span>' : '';
        d.innerHTML = '<div class="rule-info"><div class="rule-name">' + esc(r.name) + source + '</div>' +
          '<div class="rule-meta"><span class="rule-type">动态规则</span>' +
          '<code class="rule-pattern">' + esc(r.pattern) + '</code></div>' +
          '<div style="font-size:.75rem;color:#64748b;margin-top:8px">' +
          '创建: ' + created + ' | 最后匹配: ' + lastMatched + ' | 匹配次数: ' + (r.matchCount || 0) +
          '</div></div>' +
          '<div class="rule-actions"><button class="btn btn-danger">删除</button></div>';
        d.querySelector('button').onclick = () => openDel(r, 'dynamic');
        l.appendChild(d);
      });
    }

    async function saveFwd() {
      $('forward-error').textContent = '';
      $('forward-success').textContent = '';
      try {
        const r = await api('/api/config/forward', {
          method: 'PUT',
          body: JSON.stringify({ forwardAddress: $('forward-address').value.trim() })
        });
        if (r.success) {
          $('forward-success').textContent = '已保存';
          toast('已保存');
        } else {
          $('forward-error').textContent = (r.error && r.error.message) || '保存失败';
        }
      } catch {
        $('forward-error').textContent = '网络错误';
      }
    }

    async function loadDynamicConfig() {
      try {
        const r = await api('/api/config/dynamic-detection');
        if (r.success && r.data) {
          $('dynamic-enabled').checked = r.data.enabled;
          $('time-window').value = r.data.timeWindowMinutes;
          $('email-threshold').value = r.data.emailThreshold;
          $('expiration-hours').value = r.data.expirationHours;
        }
      } catch {}
    }

    async function saveDynamicConfig() {
      $('dynamic-config-error').textContent = '';
      $('dynamic-config-success').textContent = '';
      try {
        const config = {
          enabled: $('dynamic-enabled').checked,
          timeWindowMinutes: parseInt($('time-window').value, 10),
          emailThreshold: parseInt($('email-threshold').value, 10),
          expirationHours: parseInt($('expiration-hours').value, 10)
        };
        const r = await api('/api/config/dynamic-detection', {
          method: 'PUT',
          body: JSON.stringify(config)
        });
        if (r.success) {
          $('dynamic-config-success').textContent = '已保存';
          toast('动态检测配置已保存');
        } else {
          $('dynamic-config-error').textContent = (r.error && r.error.message) || '保存失败';
        }
      } catch {
        $('dynamic-config-error').textContent = '网络错误';
      }
    }

    // Event bindings
    $('login-form').onsubmit = e => { e.preventDefault(); doLogin(); };
    $('logout-btn').onclick = doLogout;
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));
    $('add-rule-btn').onclick = () => openEd(null, 'manual');
    $('add-whitelist-btn').onclick = () => openEd(null, 'whitelist');
    $('sync-vps-btn').onclick = syncFromVps;
    $('save-sync-interval-btn').onclick = saveSyncInterval;
    $('rule-match-mode').onchange = updateHint;
    $('rule-form').onsubmit = e => { e.preventDefault(); saveRule(); };
    $('cancel-rule').onclick = closeEd;
    $('rule-modal').querySelector('.modal-backdrop').onclick = closeEd;
    $('cancel-delete').onclick = closeDel;
    $('confirm-delete').onclick = confirmDel;
    $('delete-modal').querySelector('.modal-backdrop').onclick = closeDel;
    $('forward-form').onsubmit = e => { e.preventDefault(); saveFwd(); };
    $('dynamic-config-form').onsubmit = e => { e.preventDefault(); saveDynamicConfig(); };

    // Init
    if (authToken) {
      showPage('dashboard');
      loadRules();
      loadWhitelist();
      loadDynamic();
      loadFwd();
      loadDynamicConfig();
    } else {
      showPage('login');
    }
  </script>
</body>
</html>`;
}

// ============================================
// Export
// ============================================

export default {
  fetch: handleRequest,
  email: handleEmail,
};
