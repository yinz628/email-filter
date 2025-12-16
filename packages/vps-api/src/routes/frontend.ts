/**
 * Frontend Routes
 * Serves the admin panel HTML interface for managing workers and rules
 */

import type { FastifyInstance } from 'fastify';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Filter 管理面板</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 24px; }
    .tabs { display: flex; gap: 10px; margin-bottom: 20px; }
    .tab { padding: 10px 20px; background: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .tab.active { background: #4a90d9; color: white; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card h2 { font-size: 18px; margin-bottom: 15px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-danger { background: #e74c3c; color: white; }
    .btn-success { background: #27ae60; color: white; }
    .btn-secondary { background: #95a5a6; color: white; }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; font-weight: 500; color: #555; }
    .form-group input, .form-group select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #4a90d9; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #555; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .status-enabled { background: #d4edda; color: #155724; }
    .status-disabled { background: #f8d7da; color: #721c24; }
    .category { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .category-whitelist { background: #d4edda; color: #155724; }
    .category-blacklist { background: #f8d7da; color: #721c24; }
    .category-dynamic { background: #fff3cd; color: #856404; }
    .hidden { display: none !important; }
    .actions { display: flex; gap: 8px; }
    .modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal-content { background: white; padding: 25px; border-radius: 8px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; position: relative; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-right: 30px; }
    .modal-header h3 { font-size: 18px; color: #333; }
    .modal-close { background: #f0f0f0; border: none; font-size: 20px; cursor: pointer; color: #666; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: absolute; top: 15px; right: 15px; z-index: 1001; transition: all 0.2s; }
    .modal-close:hover { background: #e74c3c; color: white; }
    .alert { padding: 12px; border-radius: 4px; margin-bottom: 15px; }
    .alert-success { background: #d4edda; color: #155724; }
    .alert-error { background: #f8d7da; color: #721c24; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; color: #4a90d9; }
    .stat-label { color: #666; font-size: 14px; }
    .filter-bar { display: flex; gap: 10px; margin-bottom: 15px; align-items: center; }
    .filter-bar select { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Email Filter 管理面板</h1>
      <span id="api-status">API Token: 需要配置</span>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showTab('workers')">Worker 实例</button>
      <button class="tab" onclick="showTab('rules')">过滤规则</button>
      <button class="tab" onclick="showTab('dynamic')">动态规则</button>
      <button class="tab" onclick="showTab('logs')">日志</button>
      <button class="tab" onclick="showTab('stats')">统计信息</button>
      <button class="tab" onclick="showTab('settings')">设置</button>
    </div>

    <div id="alert-container"></div>

    <!-- Workers Tab -->
    <div id="workers-tab" class="tab-content">
      <div class="card">
        <h2>Worker 实例</h2>
        <p style="color:#666;margin-bottom:15px">每个 Cloudflare Email Worker 对应一个实例，通过 workerName 关联</p>
        <button class="btn btn-primary" onclick="showModal('add-worker-modal')" style="margin-bottom:15px">+ 添加 Worker</button>
        <div style="margin-bottom:10px;">
          <button class="btn btn-sm btn-secondary" onclick="checkAllWorkersHealth()">🔄 检测所有 Worker 状态</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>Worker URL</th>
              <th>默认转发地址</th>
              <th>在线状态</th>
              <th>启用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="workers-table"></tbody>
        </table>
      </div>
    </div>

    <!-- Rules Tab -->
    <div id="rules-tab" class="tab-content hidden">
      <div class="card">
        <h2>过滤规则</h2>
        <div class="filter-bar">
          <select id="rule-worker-filter" onchange="loadRules()">
            <option value="">全部 Worker</option>
            <option value="global">全局规则</option>
          </select>
          <select id="rule-category-filter" onchange="loadRules()">
            <option value="">全部类型</option>
            <option value="whitelist">白名单</option>
            <option value="blacklist">黑名单</option>
            <option value="dynamic">动态规则</option>
          </select>
          <button class="btn btn-primary" onclick="showModal('add-rule-modal')">+ 添加规则</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>类型</th>
              <th>匹配字段</th>
              <th>匹配模式</th>
              <th>规则内容</th>
              <th>Worker</th>
              <th>最后命中</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="rules-table"></tbody>
        </table>
      </div>
    </div>

    <!-- Dynamic Rules Tab -->
    <div id="dynamic-tab" class="tab-content hidden">
      <div class="card">
        <h2>动态规则配置</h2>
        <p style="color:#666;margin-bottom:15px">当同一主题的邮件在指定时间窗口内超过阈值时，自动创建黑名单规则</p>
        <div class="form-group">
          <label>启用动态规则</label>
          <select id="dynamic-enabled">
            <option value="true">启用</option>
            <option value="false">禁用</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>时间窗口（分钟）</label>
            <input type="number" id="dynamic-time-window" min="1" value="60" placeholder="60">
          </div>
          <div class="form-group">
            <label>触发阈值（次数）</label>
            <input type="number" id="dynamic-threshold" min="1" value="5" placeholder="5">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>规则过期时间（小时）</label>
            <input type="number" id="dynamic-expiration" min="1" value="48" placeholder="48">
            <p style="color:#888;font-size:12px;margin-top:5px">从未命中的规则，创建后超过此时间将被清理</p>
          </div>
          <div class="form-group">
            <label>最后命中阈值（小时）</label>
            <input type="number" id="dynamic-last-hit-threshold" min="1" value="72" placeholder="72">
            <p style="color:#888;font-size:12px;margin-top:5px">有命中记录的规则，最后命中超过此时间将被清理</p>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveDynamicConfig()">保存配置</button>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h2 style="margin:0;border:none;padding:0;">主题追踪数据</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <span id="tracker-stats" style="color:#666;font-size:13px;">加载中...</span>
            <select id="tracker-cleanup-hours" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="0.5">30分钟前</option>
              <option value="1" selected>1小时前</option>
              <option value="6">6小时前</option>
              <option value="12">12小时前</option>
            </select>
            <button class="btn btn-danger btn-sm" onclick="cleanupSubjectTracker()">清理追踪数据</button>
          </div>
        </div>
        <p style="color:#666;margin-bottom:15px">用于检测重复主题邮件的追踪数据，定期清理可释放磁盘空间</p>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
          <h2 style="margin:0;border:none;padding:0;">自动生成的动态规则</h2>
          <button class="btn btn-danger btn-sm" onclick="cleanupExpiredDynamicRules()">清理过期规则</button>
        </div>
        <p style="color:#666;margin-bottom:15px">以下规则由系统根据邮件频率自动生成，超过过期时间未命中将自动删除</p>
        <table>
          <thead>
            <tr>
              <th>规则内容</th>
              <th>创建时间</th>
              <th>最后命中</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="dynamic-rules-table"></tbody>
        </table>
      </div>
    </div>

    <!-- Logs Tab -->
    <div id="logs-tab" class="tab-content hidden">
      <div class="card" style="height:calc(100vh - 200px);display:flex;flex-direction:column;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">系统日志</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="log-cleanup-days" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="1">1天前</option>
              <option value="3">3天前</option>
              <option value="7" selected>7天前</option>
              <option value="30">30天前</option>
            </select>
            <button class="btn btn-danger btn-sm" onclick="cleanupLogs()">清理日志</button>
            <button class="btn btn-secondary" onclick="loadLogs()">🔄 刷新</button>
          </div>
        </div>
        <div class="filter-bar">
          <input type="text" id="log-search" placeholder="搜索主题/发件人..." style="padding:6px 10px;border:1px solid #ddd;border-radius:4px;width:200px;" onkeydown="if(event.key==='Enter'){resetLogPage();loadLogs();}">
          <button class="btn btn-sm btn-primary" onclick="resetLogPage(); loadLogs()">搜索</button>
          <select id="log-category-filter" onchange="resetLogPage(); loadLogs()">
            <option value="">全部类型</option>
            <option value="email_forward">📤 转发</option>
            <option value="email_drop">🚫 拦截</option>
            <option value="admin_action">⚙️ 管理操作</option>
            <option value="system">🖥️ 系统</option>
          </select>
          <select id="log-page-size" onchange="resetLogPage(); loadLogs()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
            <option value="20">每页 20 条</option>
            <option value="50" selected>每页 50 条</option>
            <option value="100">每页 100 条</option>
          </select>
          <span id="log-counts" style="color:#666;font-size:13px;"></span>
          <button class="btn btn-sm btn-danger" id="batch-delete-btn" onclick="batchDeleteLogs()" style="display:none;">删除选中</button>
          <button class="btn btn-sm btn-danger" id="search-delete-btn" onclick="deleteBySearch()" style="display:none;">删除搜索结果</button>
        </div>
        <div style="flex:1;overflow-y:auto;">
          <table>
            <thead style="position:sticky;top:0;background:#f8f9fa;">
              <tr>
                <th style="width:40px;"><input type="checkbox" id="log-select-all" onchange="toggleSelectAllLogs()"></th>
                <th style="width:140px;">时间</th>
                <th style="width:70px;">类型</th>
                <th style="width:180px;">主题</th>
                <th style="width:160px;">发件人</th>
                <th style="width:160px;">收件人</th>
                <th>命中规则</th>
              </tr>
            </thead>
            <tbody id="logs-table"></tbody>
          </table>
        </div>
        <div id="log-pagination" style="display:flex;justify-content:center;align-items:center;gap:10px;padding:15px 0;border-top:1px solid #eee;margin-top:10px;">
          <button class="btn btn-sm btn-secondary" onclick="prevLogPage()" id="log-prev-btn" disabled>上一页</button>
          <span id="log-page-info" style="color:#666;font-size:13px;">第 1 页</span>
          <button class="btn btn-sm btn-secondary" onclick="nextLogPage()" id="log-next-btn">下一页</button>
        </div>
      </div>
    </div>

    <!-- Stats Tab -->
    <div id="stats-tab" class="tab-content hidden">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">统计信息</h2>
          <button class="btn btn-secondary" onclick="loadStats()">🔄 刷新</button>
        </div>
        <div class="stats-grid" id="stats-container">
          <div class="stat-card"><div class="stat-value" id="stat-total">-</div><div class="stat-label">总处理数</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-forwarded">-</div><div class="stat-label">已转发</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-deleted">-</div><div class="stat-label">已拦截</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-rules">-</div><div class="stat-label">规则数量</div></div>
          <div class="stat-card"><div class="stat-value" id="stat-workers">-</div><div class="stat-label">Worker 数量</div></div>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">🔥 热门拦截规则</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="trending-hours" onchange="loadTrendingRules()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="1">最近 1 小时</option>
              <option value="6">最近 6 小时</option>
              <option value="24" selected>最近 24 小时</option>
              <option value="72">最近 3 天</option>
              <option value="168">最近 7 天</option>
            </select>
          </div>
        </div>
        <p style="color:#666;margin-bottom:15px">自动统计拦截数量最多的规则（最多显示5条）</p>
        <table>
          <thead>
            <tr>
              <th style="width:50px;">排名</th>
              <th>规则内容</th>
              <th style="width:100px;">拦截次数</th>
              <th style="width:160px;">最后拦截</th>
            </tr>
          </thead>
          <tbody id="trending-rules-table"></tbody>
        </table>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">监控规则</h2>
          <button class="btn btn-primary" onclick="showModal('add-watch-modal')">+ 添加监控</button>
        </div>
        <p style="color:#666;margin-bottom:15px">监控规则仅统计命中次数，不影响邮件过滤</p>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>匹配字段</th>
              <th>匹配模式</th>
              <th>规则内容</th>
              <th>命中次数</th>
              <th>最后命中</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="watch-rules-table"></tbody>
        </table>
      </div>
    </div>

    <!-- Settings Tab -->
    <div id="settings-tab" class="tab-content hidden">
      <div class="card">
        <h2>API 设置</h2>
        <div class="form-group">
          <label>API Token</label>
          <input type="password" id="api-token" placeholder="输入 API Token">
        </div>
        <button class="btn btn-primary" onclick="saveToken()">保存 Token</button>
      </div>
      <div class="card">
        <h2>默认转发配置</h2>
        <div class="form-group">
          <label>默认转发地址</label>
          <input type="email" id="default-forward" placeholder="当没有匹配规则时转发到此地址">
        </div>
        <button class="btn btn-primary" onclick="saveForwardConfig()">保存</button>
      </div>
    </div>
  </div>

  <!-- Add Worker Modal -->
  <div id="add-worker-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加 Worker 实例</h3>
        <button class="modal-close" onclick="hideModal('add-worker-modal')">&times;</button>
      </div>
      <form id="add-worker-form">
        <div class="form-group">
          <label>Worker 名称 *</label>
          <input type="text" id="worker-name" required placeholder="唯一标识，需与 wrangler.toml 中的 WORKER_NAME 一致">
        </div>
        <div class="form-group">
          <label>默认转发地址 *</label>
          <input type="email" id="worker-forward" required placeholder="admin@gmail.com">
        </div>
        <div class="form-group">
          <label>域名（可选）</label>
          <input type="text" id="worker-domain" placeholder="example.com">
        </div>
        <div class="form-group">
          <label>Worker URL（可选，用于在线检测）</label>
          <input type="url" id="worker-url" placeholder="https://xxx.workers.dev">
          <p style="color:#888;font-size:12px;margin-top:5px">填写后可检测 Worker 是否在线</p>
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <!-- Edit Worker Modal -->
  <div id="edit-worker-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>编辑 Worker 实例</h3>
        <button class="modal-close" onclick="hideModal('edit-worker-modal')">&times;</button>
      </div>
      <form id="edit-worker-form">
        <input type="hidden" id="edit-worker-id">
        <div class="form-group">
          <label>Worker 名称</label>
          <input type="text" id="edit-worker-name" disabled style="background:#f5f5f5">
        </div>
        <div class="form-group">
          <label>默认转发地址 *</label>
          <input type="email" id="edit-worker-forward" required placeholder="admin@gmail.com">
        </div>
        <div class="form-group">
          <label>域名（可选）</label>
          <input type="text" id="edit-worker-domain" placeholder="example.com">
        </div>
        <div class="form-group">
          <label>Worker URL（可选，用于在线检测）</label>
          <input type="url" id="edit-worker-url" placeholder="https://xxx.workers.dev">
          <p style="color:#888;font-size:12px;margin-top:5px">填写后可检测 Worker 是否在线</p>
        </div>
        <button type="submit" class="btn btn-primary">保存</button>
      </form>
    </div>
  </div>

  <!-- Add Watch Rule Modal -->
  <div id="add-watch-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加监控规则</h3>
        <button class="modal-close" onclick="hideModal('add-watch-modal')">&times;</button>
      </div>
      <form id="add-watch-form">
        <div class="form-group">
          <label>规则名称 *</label>
          <input type="text" id="watch-name" required placeholder="例如：某某发件人统计">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>匹配字段 *</label>
            <select id="watch-match-type" required>
              <option value="sender">发件人</option>
              <option value="subject">主题</option>
              <option value="domain">发件域名</option>
            </select>
          </div>
          <div class="form-group">
            <label>匹配模式 *</label>
            <select id="watch-match-mode" required>
              <option value="contains">包含</option>
              <option value="exact">精确匹配</option>
              <option value="startsWith">开头匹配</option>
              <option value="endsWith">结尾匹配</option>
              <option value="regex">正则表达式</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>规则内容 *</label>
          <input type="text" id="watch-pattern" required placeholder="要匹配的内容">
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <!-- Log Detail Modal -->
  <div id="log-detail-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>日志详情</h3>
        <button class="modal-close" onclick="hideModal('log-detail-modal')">&times;</button>
      </div>
      <div id="log-detail-content"></div>
    </div>
  </div>

  <!-- Add Rule Modal -->
  <div id="add-rule-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加过滤规则</h3>
        <button class="modal-close" onclick="hideModal('add-rule-modal')">&times;</button>
      </div>
      <form id="add-rule-form">
        <div class="form-group">
          <label>关联 Worker</label>
          <select id="rule-worker">
            <option value="">全局规则（适用于所有 Worker）</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>规则类型 *</label>
            <select id="rule-category" required>
              <option value="blacklist">黑名单（拦截）</option>
              <option value="whitelist">白名单（放行）</option>
            </select>
          </div>
          <div class="form-group">
            <label>匹配字段 *</label>
            <select id="rule-match-type" required>
              <option value="sender">发件人</option>
              <option value="subject">主题</option>
              <option value="domain">发件域名</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>匹配模式 *</label>
          <select id="rule-match-mode" required>
            <option value="contains">包含</option>
            <option value="exact">精确匹配</option>
            <option value="startsWith">开头匹配</option>
            <option value="endsWith">结尾匹配</option>
            <option value="regex">正则表达式</option>
          </select>
        </div>
        <div class="form-group">
          <label>规则内容 *</label>
          <input type="text" id="rule-pattern" required placeholder="要匹配的内容">
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <script>
    let apiToken = localStorage.getItem('apiToken') || '';
    let workers = [];

    function getHeaders() {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiToken
      };
    }

    function showTab(name) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById(name + '-tab').classList.remove('hidden');
      event.target.classList.add('active');
      
      if (name === 'workers') loadWorkers();
      if (name === 'rules') loadRules();
      if (name === 'dynamic') loadDynamicConfig();
      if (name === 'logs') loadLogs();
      if (name === 'stats') loadStats();
      if (name === 'settings') loadSettings();
    }

    function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
    function hideModal(id) { document.getElementById(id).classList.add('hidden'); }
    
    // Close modal when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
      });
    });

    function showAlert(msg, type = 'success') {
      const container = document.getElementById('alert-container');
      container.innerHTML = '<div class="alert alert-' + type + '">' + msg + '</div>';
      setTimeout(() => container.innerHTML = '', 3000);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Workers
    async function loadWorkers() {
      if (!apiToken) return;
      try {
        const res = await fetch('/api/workers', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        workers = data.workers || [];
        renderWorkers();
        updateWorkerSelects();
      } catch (e) {
        showAlert('加载 Worker 失败，请检查 API Token', 'error');
      }
    }

    let workerHealthStatus = {};

    function renderWorkers() {
      const tbody = document.getElementById('workers-table');
      if (workers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">暂无 Worker 实例</td></tr>';
        return;
      }
      tbody.innerHTML = workers.map(w => {
        const enabledStatus = w.enabled ? '<span class="status status-enabled">启用</span>' : '<span class="status status-disabled">禁用</span>';
        const health = workerHealthStatus[w.id];
        let onlineStatus = '<span style="color:#999">未配置</span>';
        if (w.workerUrl) {
          if (health === undefined) {
            onlineStatus = '<span style="color:#999">未检测</span>';
          } else if (health.online) {
            onlineStatus = '<span class="status status-enabled">🟢 在线 (' + health.latency + 'ms)</span>';
          } else {
            onlineStatus = '<span class="status status-disabled">🔴 离线</span>';
          }
        }
        const workerUrlDisplay = w.workerUrl ? '<a href="' + escapeHtml(w.workerUrl) + '" target="_blank" style="color:#4a90d9;font-size:12px;">' + escapeHtml(w.workerUrl.replace('https://', '')) + '</a>' : '<span style="color:#999">-</span>';
        return '<tr data-worker-id="' + w.id + '"><td><strong>' + escapeHtml(w.name) + '</strong></td>' +
          '<td>' + workerUrlDisplay + '</td>' +
          '<td>' + escapeHtml(w.defaultForwardTo) + '</td>' +
          '<td id="health-' + w.id + '">' + onlineStatus + '</td>' +
          '<td>' + enabledStatus + '</td>' +
          '<td class="actions">' +
            (w.workerUrl ? '<button class="btn btn-sm btn-secondary" onclick="checkWorkerHealth(\\'' + w.id + '\\')">检测</button>' : '') +
            '<button class="btn btn-sm btn-primary" onclick="editWorker(\\'' + w.id + '\\')">编辑</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="toggleWorker(\\'' + w.id + '\\')">' + (w.enabled ? '禁用' : '启用') + '</button>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteWorker(\\'' + w.id + '\\')">删除</button>' +
          '</td></tr>';
      }).join('');
    }

    async function checkWorkerHealth(id) {
      const cell = document.getElementById('health-' + id);
      if (cell) cell.innerHTML = '<span style="color:#999">检测中...</span>';
      try {
        const res = await fetch('/api/workers/' + id + '/health', { headers: getHeaders() });
        const data = await res.json();
        workerHealthStatus[id] = data;
        if (cell) {
          if (data.online) {
            cell.innerHTML = '<span class="status status-enabled">🟢 在线 (' + data.latency + 'ms)</span>';
          } else {
            cell.innerHTML = '<span class="status status-disabled">🔴 离线</span>';
          }
        }
      } catch (e) {
        if (cell) cell.innerHTML = '<span class="status status-disabled">🔴 错误</span>';
      }
    }

    async function checkAllWorkersHealth() {
      try {
        const res = await fetch('/api/workers/health/all', { headers: getHeaders() });
        const data = await res.json();
        workerHealthStatus = data.health || {};
        renderWorkers();
        showAlert('Worker 状态检测完成');
      } catch (e) {
        showAlert('检测失败', 'error');
      }
    }

    function updateWorkerSelects() {
      const options = '<option value="">全局规则</option>' + 
        workers.map(w => '<option value="' + w.id + '">' + escapeHtml(w.name) + '</option>').join('');
      document.getElementById('rule-worker').innerHTML = options;
      
      const filterOptions = '<option value="">全部 Worker</option><option value="global">全局规则</option>' +
        workers.map(w => '<option value="' + w.id + '">' + escapeHtml(w.name) + '</option>').join('');
      document.getElementById('rule-worker-filter').innerHTML = filterOptions;
    }

    document.getElementById('add-worker-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('worker-name').value,
        defaultForwardTo: document.getElementById('worker-forward').value,
        domain: document.getElementById('worker-domain').value || undefined,
        workerUrl: document.getElementById('worker-url').value || undefined
      };
      try {
        const res = await fetch('/api/workers', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
        if (res.ok) {
          hideModal('add-worker-modal');
          e.target.reset();
          showAlert('Worker 创建成功');
          loadWorkers();
        } else {
          const data = await res.json();
          showAlert(data.message || '创建失败', 'error');
        }
      } catch (e) { showAlert('创建失败', 'error'); }
    });

    function editWorker(id) {
      const w = workers.find(x => x.id === id);
      if (!w) return;
      document.getElementById('edit-worker-id').value = w.id;
      document.getElementById('edit-worker-name').value = w.name;
      document.getElementById('edit-worker-forward').value = w.defaultForwardTo;
      document.getElementById('edit-worker-domain').value = w.domain || '';
      document.getElementById('edit-worker-url').value = w.workerUrl || '';
      showModal('edit-worker-modal');
    }
    
    document.getElementById('edit-worker-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-worker-id').value;
      const body = {
        defaultForwardTo: document.getElementById('edit-worker-forward').value,
        domain: document.getElementById('edit-worker-domain').value || undefined,
        workerUrl: document.getElementById('edit-worker-url').value || undefined
      };
      try {
        const res = await fetch('/api/workers/' + id, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) });
        if (res.ok) {
          hideModal('edit-worker-modal');
          showAlert('Worker 更新成功');
          loadWorkers();
        } else {
          const data = await res.json();
          showAlert(data.message || '更新失败', 'error');
        }
      } catch (e) { showAlert('更新失败', 'error'); }
    });

    async function toggleWorker(id) {
      const w = workers.find(x => x.id === id);
      if (!w) return;
      try {
        await fetch('/api/workers/' + id + '/toggle', { 
          method: 'POST', 
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        loadWorkers();
      } catch (e) {}
    }

    async function deleteWorker(id) {
      if (!confirm('确定删除？关联的规则也会被删除')) return;
      try {
        await fetch('/api/workers/' + id, { 
          method: 'DELETE', 
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        showAlert('删除成功');
        loadWorkers();
      } catch (e) { showAlert('删除失败', 'error'); }
    }

    // Rules
    async function loadRules() {
      if (!apiToken) return;
      const workerId = document.getElementById('rule-worker-filter').value;
      const category = document.getElementById('rule-category-filter').value;
      let url = '/api/rules?';
      if (workerId === 'global') url += 'global=true&';
      else if (workerId) url += 'workerId=' + workerId + '&';
      if (category) url += 'category=' + category;
      
      try {
        const res = await fetch(url, { headers: getHeaders() });
        const data = await res.json();
        renderRules(data.rules || []);
      } catch (e) { showAlert('加载规则失败', 'error'); }
    }

    function renderRules(rules) {
      const tbody = document.getElementById('rules-table');
      if (rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999">暂无规则</td></tr>';
        return;
      }
      tbody.innerHTML = rules.map(r => {
        const cat = '<span class="category category-' + r.category + '">' + 
          (r.category === 'whitelist' ? '白名单' : r.category === 'blacklist' ? '黑名单' : '动态') + '</span>';
        const status = r.enabled ? '<span class="status status-enabled">启用</span>' : '<span class="status status-disabled">禁用</span>';
        const worker = r.workerId ? (workers.find(w => w.id === r.workerId)?.name || '未知') : '全局';
        const matchType = {sender:'发件人',subject:'主题',domain:'域名'}[r.matchType] || r.matchType;
        const matchMode = {exact:'精确',contains:'包含',startsWith:'开头',endsWith:'结尾',regex:'正则'}[r.matchMode] || r.matchMode;
        const lastHit = r.lastHitAt ? new Date(r.lastHitAt).toLocaleString('zh-CN') : '-';
        return '<tr><td>' + cat + '</td><td>' + matchType + '</td><td>' + matchMode + '</td>' +
          '<td>' + escapeHtml(r.pattern) + '</td><td>' + escapeHtml(worker) + '</td>' +
          '<td style="font-size:12px;color:#666">' + lastHit + '</td><td>' + status + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-secondary" onclick="toggleRule(\\'' + r.id + '\\')">切换</button>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteRule(\\'' + r.id + '\\')">删除</button>' +
          '</td></tr>';
      }).join('');
    }

    document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        workerId: document.getElementById('rule-worker').value || undefined,
        category: document.getElementById('rule-category').value,
        matchType: document.getElementById('rule-match-type').value,
        matchMode: document.getElementById('rule-match-mode').value,
        pattern: document.getElementById('rule-pattern').value
      };
      try {
        const res = await fetch('/api/rules', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
        if (res.ok) {
          hideModal('add-rule-modal');
          e.target.reset();
          showAlert('规则创建成功');
          loadRules();
        } else {
          const data = await res.json();
          showAlert(data.message || '创建失败', 'error');
        }
      } catch (e) { showAlert('创建失败', 'error'); }
    });

    async function toggleRule(id) {
      try {
        const res = await fetch('/api/rules/' + id + '/toggle', { 
          method: 'POST', 
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        if (res.ok) {
          showAlert('规则状态已切换');
          loadRules();
        } else {
          const data = await res.json();
          showAlert(data.message || '切换失败', 'error');
        }
      } catch (e) { 
        showAlert('切换失败: ' + e.message, 'error'); 
      }
    }

    async function deleteRule(id) {
      if (!confirm('确定删除此规则？')) return;
      try {
        await fetch('/api/rules/' + id, { 
          method: 'DELETE', 
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        showAlert('删除成功');
        loadRules();
      } catch (e) { showAlert('删除失败', 'error'); }
    }

    // Dynamic Rules
    async function loadDynamicConfig() {
      if (!apiToken) return;
      try {
        const [configRes, rulesRes] = await Promise.all([
          fetch('/api/dynamic/config', { headers: getHeaders() }),
          fetch('/api/rules?category=dynamic', { headers: getHeaders() })
        ]);
        const config = await configRes.json();
        const rulesData = await rulesRes.json();
        
        document.getElementById('dynamic-enabled').value = config.enabled ? 'true' : 'false';
        document.getElementById('dynamic-time-window').value = config.timeWindowMinutes || 60;
        document.getElementById('dynamic-threshold').value = config.thresholdCount || 5;
        document.getElementById('dynamic-expiration').value = config.expirationHours || 48;
        document.getElementById('dynamic-last-hit-threshold').value = config.lastHitThresholdHours || 72;
        
        renderDynamicRules(rulesData.rules || []);
        loadTrackerStats();
      } catch (e) { console.error('Error loading dynamic config:', e); }
    }

    function renderDynamicRules(rules) {
      const tbody = document.getElementById('dynamic-rules-table');
      if (rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无动态规则</td></tr>';
        return;
      }
      tbody.innerHTML = rules.map(r => {
        const status = r.enabled ? '<span class="status status-enabled">启用</span>' : '<span class="status status-disabled">禁用</span>';
        const createdAt = new Date(r.createdAt).toLocaleString('zh-CN');
        const lastHit = r.lastHitAt ? new Date(r.lastHitAt).toLocaleString('zh-CN') : '-';
        return '<tr><td>' + escapeHtml(r.pattern) + '</td>' +
          '<td>' + createdAt + '</td><td>' + lastHit + '</td><td>' + status + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-danger" onclick="deleteRule(\\'' + r.id + '\\'); loadDynamicConfig();">删除</button>' +
          '</td></tr>';
      }).join('');
    }

    async function saveDynamicConfig() {
      const body = {
        enabled: document.getElementById('dynamic-enabled').value === 'true',
        timeWindowMinutes: parseInt(document.getElementById('dynamic-time-window').value) || 60,
        thresholdCount: parseInt(document.getElementById('dynamic-threshold').value) || 5,
        expirationHours: parseInt(document.getElementById('dynamic-expiration').value) || 48,
        lastHitThresholdHours: parseInt(document.getElementById('dynamic-last-hit-threshold').value) || 72
      };
      try {
        const res = await fetch('/api/dynamic/config', { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) });
        if (res.ok) {
          showAlert('动态规则配置已保存');
        } else {
          showAlert('保存失败', 'error');
        }
      } catch (e) { showAlert('保存失败', 'error'); }
    }

    async function cleanupExpiredDynamicRules() {
      if (!confirm('确定清理所有过期的动态规则？')) return;
      try {
        const res = await fetch('/api/dynamic/cleanup', { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiToken } });
        const data = await res.json();
        if (res.ok) {
          showAlert('已清理 ' + data.deletedCount + ' 条过期规则');
          loadDynamicConfig();
        } else {
          showAlert('清理失败', 'error');
        }
      } catch (e) { showAlert('清理失败', 'error'); }
    }

    async function loadTrackerStats() {
      try {
        const res = await fetch('/api/dynamic/tracker/stats', { headers: getHeaders() });
        const data = await res.json();
        if (res.ok) {
          const statsEl = document.getElementById('tracker-stats');
          if (data.totalRecords === 0) {
            statsEl.textContent = '暂无数据';
          } else {
            const oldest = data.oldestRecord ? new Date(data.oldestRecord).toLocaleString('zh-CN') : '-';
            statsEl.textContent = '共 ' + data.totalRecords + ' 条记录，最早: ' + oldest;
          }
        }
      } catch (e) { console.error('Failed to load tracker stats'); }
    }

    async function cleanupSubjectTracker() {
      const hours = document.getElementById('tracker-cleanup-hours').value || '1';
      const hoursText = hours === '0.5' ? '30分钟' : hours + '小时';
      if (!confirm('确定清理 ' + hoursText + ' 前的追踪数据？这不会影响已生成的动态规则。')) return;
      try {
        const res = await fetch('/api/dynamic/tracker?hours=' + hours, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + apiToken } });
        const data = await res.json();
        if (res.ok) {
          showAlert('已清理 ' + data.deleted + ' 条追踪记录');
          loadTrackerStats();
        } else {
          showAlert('清理失败', 'error');
        }
      } catch (e) { showAlert('清理失败', 'error'); }
    }

    // Logs with pagination
    let currentLogs = [];
    let logCurrentPage = 1;
    let logHasMore = false;
    
    function resetLogPage() {
      logCurrentPage = 1;
    }
    
    let currentSearchTerm = '';
    
    async function loadLogs() {
      if (!apiToken) return;
      const category = document.getElementById('log-category-filter').value;
      const search = document.getElementById('log-search').value.trim();
      currentSearchTerm = search;
      const pageSize = parseInt(document.getElementById('log-page-size').value) || 50;
      const offset = (logCurrentPage - 1) * pageSize;
      let url = '/api/logs?limit=' + (pageSize + 1) + '&offset=' + offset;
      if (category) url += '&category=' + category;
      if (search) url += '&search=' + encodeURIComponent(search);
      
      try {
        const res = await fetch(url, { headers: getHeaders() });
        const data = await res.json();
        const logs = data.logs || [];
        
        // Check if there are more pages
        logHasMore = logs.length > pageSize;
        const displayLogs = logHasMore ? logs.slice(0, pageSize) : logs;
        
        renderLogs(displayLogs);
        renderLogCounts(data.counts || {});
        updateLogPagination();
        updateBatchDeleteButtons();
      } catch (e) { console.error('Error loading logs:', e); }
    }
    
    function updateBatchDeleteButtons() {
      const searchDeleteBtn = document.getElementById('search-delete-btn');
      if (currentSearchTerm) {
        searchDeleteBtn.style.display = 'inline-block';
        searchDeleteBtn.textContent = '删除搜索结果';
      } else {
        searchDeleteBtn.style.display = 'none';
      }
    }
    
    function updateLogPagination() {
      document.getElementById('log-page-info').textContent = '第 ' + logCurrentPage + ' 页';
      document.getElementById('log-prev-btn').disabled = logCurrentPage <= 1;
      document.getElementById('log-next-btn').disabled = !logHasMore;
    }
    
    function prevLogPage() {
      if (logCurrentPage > 1) {
        logCurrentPage--;
        loadLogs();
      }
    }
    
    function nextLogPage() {
      if (logHasMore) {
        logCurrentPage++;
        loadLogs();
      }
    }
    
    function renderLogs(logs) {
      currentLogs = logs;
      const tbody = document.getElementById('logs-table');
      document.getElementById('log-select-all').checked = false;
      document.getElementById('batch-delete-btn').style.display = 'none';
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999">暂无日志</td></tr>';
        return;
      }
      const categoryLabels = {
        email_forward: '<span style="color:#27ae60">📤 转发</span>',
        email_drop: '<span style="color:#e74c3c">🚫 拦截</span>',
        admin_action: '<span style="color:#4a90d9">⚙️ 管理</span>',
        system: '<span style="color:#95a5a6">🖥️ 系统</span>'
      };
      tbody.innerHTML = logs.map((log, idx) => {
        const time = new Date(log.createdAt).toLocaleString('zh-CN');
        const cat = categoryLabels[log.category] || log.category;
        const d = log.details || {};
        const subject = d.subject || '-';
        const from = d.from || '-';
        const to = d.to || '-';
        const rule = d.matchedRule || '-';
        return '<tr>' +
          '<td onclick="event.stopPropagation()"><input type="checkbox" class="log-checkbox" data-id="' + log.id + '" onchange="updateBatchDeleteBtn()"></td>' +
          '<td style="font-size:12px;color:#666;cursor:pointer" onclick="showLogDetail(' + idx + ')">' + time + '</td>' +
          '<td style="cursor:pointer" onclick="showLogDetail(' + idx + ')">' + cat + '</td>' +
          '<td style="cursor:pointer" onclick="showLogDetail(' + idx + ')">' + escapeHtml(subject.length > 22 ? subject.substring(0,22) + '...' : subject) + '</td>' +
          '<td style="font-size:12px;cursor:pointer" onclick="showLogDetail(' + idx + ')">' + escapeHtml(from.length > 20 ? from.substring(0,20) + '...' : from) + '</td>' +
          '<td style="font-size:12px;cursor:pointer" onclick="showLogDetail(' + idx + ')">' + escapeHtml(to.length > 20 ? to.substring(0,20) + '...' : to) + '</td>' +
          '<td style="font-size:12px;color:#888;cursor:pointer" onclick="showLogDetail(' + idx + ')">' + escapeHtml(rule) + '</td>' +
          '</tr>';
      }).join('');
    }
    
    function toggleSelectAllLogs() {
      const selectAll = document.getElementById('log-select-all').checked;
      document.querySelectorAll('.log-checkbox').forEach(cb => cb.checked = selectAll);
      updateBatchDeleteBtn();
    }
    
    function updateBatchDeleteBtn() {
      const selected = document.querySelectorAll('.log-checkbox:checked').length;
      const btn = document.getElementById('batch-delete-btn');
      if (selected > 0) {
        btn.style.display = 'inline-block';
        btn.textContent = '删除选中 (' + selected + ')';
      } else {
        btn.style.display = 'none';
      }
    }
    
    async function batchDeleteLogs() {
      const ids = Array.from(document.querySelectorAll('.log-checkbox:checked')).map(cb => parseInt(cb.dataset.id));
      if (ids.length === 0) return;
      if (!confirm('确定删除选中的 ' + ids.length + ' 条日志？')) return;
      try {
        const res = await fetch('/api/logs/batch', { 
          method: 'DELETE', 
          headers: getHeaders(),
          body: JSON.stringify({ ids })
        });
        const data = await res.json();
        showAlert('已删除 ' + data.deleted + ' 条日志');
        loadLogs();
      } catch (e) { showAlert('删除失败', 'error'); }
    }
    
    async function deleteBySearch() {
      if (!currentSearchTerm) return;
      const category = document.getElementById('log-category-filter').value;
      if (!confirm('确定删除所有匹配 "' + currentSearchTerm + '" 的日志？')) return;
      try {
        let url = '/api/logs/search?search=' + encodeURIComponent(currentSearchTerm);
        if (category) url += '&category=' + category;
        const res = await fetch(url, { 
          method: 'DELETE', 
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        const data = await res.json();
        showAlert('已删除 ' + data.deleted + ' 条日志');
        document.getElementById('log-search').value = '';
        currentSearchTerm = '';
        loadLogs();
      } catch (e) { showAlert('删除失败', 'error'); }
    }
    
    function showLogDetail(idx) {
      const log = currentLogs[idx];
      if (!log) return;
      const d = log.details || {};
      const time = new Date(log.createdAt).toLocaleString('zh-CN');
      const categoryNames = {email_forward:'转发',email_drop:'拦截',admin_action:'管理操作',system:'系统'};
      const content = 
        '<p><strong>时间:</strong> ' + time + '</p>' +
        '<p><strong>类型:</strong> ' + (categoryNames[log.category] || log.category) + '</p>' +
        '<p><strong>消息:</strong> ' + escapeHtml(log.message) + '</p>' +
        '<hr style="margin:10px 0;border:none;border-top:1px solid #eee">' +
        '<p><strong>主题:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.subject || '-') + '</p>' +
        '<p><strong>发件人:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.from || '-') + '</p>' +
        '<p><strong>收件人:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.to || '-') + '</p>' +
        '<p><strong>命中规则:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.matchedRule || '-') + '</p>';
      document.getElementById('log-detail-content').innerHTML = content;
      showModal('log-detail-modal');
    }

    function renderLogCounts(counts) {
      const total = (counts.email_forward || 0) + (counts.email_drop || 0) + (counts.admin_action || 0) + (counts.system || 0);
      document.getElementById('log-counts').innerHTML = 
        '转发: ' + (counts.email_forward || 0) + ' | ' +
        '拦截: ' + (counts.email_drop || 0) + ' | ' +
        '管理: ' + (counts.admin_action || 0) + ' | ' +
        '总计: ' + total;
    }

    async function cleanupLogs() {
      const days = document.getElementById('log-cleanup-days').value;
      if (!confirm('确定清理' + days + '天前的旧日志？')) return;
      try {
        const res = await fetch('/api/logs/cleanup?days=' + days, { 
          method: 'DELETE', 
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        const data = await res.json();
        showAlert('已清理 ' + data.deletedLogs + ' 条日志，' + data.deletedTracker + ' 条追踪记录');
        loadLogs();
      } catch (e) { showAlert('清理失败', 'error'); }
    }

    // Stats
    async function loadStats() {
      if (!apiToken) return;
      try {
        const [statsRes, rulesRes, workersRes, watchRes] = await Promise.all([
          fetch('/api/stats', { headers: getHeaders() }),
          fetch('/api/rules', { headers: getHeaders() }),
          fetch('/api/workers', { headers: getHeaders() }),
          fetch('/api/watch', { headers: getHeaders() })
        ]);
        const stats = await statsRes.json();
        const rules = await rulesRes.json();
        const workersData = await workersRes.json();
        const watchData = await watchRes.json();
        
        // stats.overall contains the aggregated statistics
        const overall = stats.overall || {};
        document.getElementById('stat-total').textContent = overall.totalProcessed || 0;
        document.getElementById('stat-forwarded').textContent = overall.totalForwarded || 0;
        document.getElementById('stat-deleted').textContent = overall.totalDeleted || 0;
        document.getElementById('stat-rules').textContent = (rules.rules || []).length;
        document.getElementById('stat-workers').textContent = (workersData.workers || []).length;
        
        renderWatchRules(watchData.rules || []);
        loadTrendingRules();
      } catch (e) { console.error('Error loading stats:', e); }
    }

    async function loadTrendingRules() {
      if (!apiToken) return;
      const hours = document.getElementById('trending-hours').value || '24';
      try {
        const res = await fetch('/api/stats/trending?hours=' + hours + '&limit=5', { headers: getHeaders() });
        const data = await res.json();
        renderTrendingRules(data.trending || []);
      } catch (e) { console.error('Error loading trending rules:', e); }
    }

    function renderTrendingRules(rules) {
      const tbody = document.getElementById('trending-rules-table');
      if (rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#999">暂无拦截记录</td></tr>';
        return;
      }
      tbody.innerHTML = rules.map((r, idx) => {
        const lastSeen = r.lastSeen ? new Date(r.lastSeen).toLocaleString('zh-CN') : '-';
        const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
        return '<tr>' +
          '<td style="text-align:center;font-size:18px;">' + rankIcon + '</td>' +
          '<td>' + escapeHtml(r.pattern) + '</td>' +
          '<td style="font-size:18px;font-weight:bold;color:#e74c3c;text-align:center;">' + r.count + '</td>' +
          '<td style="font-size:12px;color:#666">' + lastSeen + '</td>' +
        '</tr>';
      }).join('');
    }
    
    // Watch Rules
    function renderWatchRules(rules) {
      const tbody = document.getElementById('watch-rules-table');
      if (rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999">暂无监控规则</td></tr>';
        return;
      }
      const matchTypeLabels = {sender:'发件人',subject:'主题',domain:'域名'};
      const matchModeLabels = {exact:'精确',contains:'包含',startsWith:'开头',endsWith:'结尾',regex:'正则'};
      tbody.innerHTML = rules.map(r => {
        const lastHit = r.lastHitAt ? new Date(r.lastHitAt).toLocaleString('zh-CN') : '-';
        const status = r.enabled ? '<span class="status status-enabled">启用</span>' : '<span class="status status-disabled">禁用</span>';
        return '<tr>' +
          '<td><strong>' + escapeHtml(r.name) + '</strong></td>' +
          '<td>' + (matchTypeLabels[r.matchType] || r.matchType) + '</td>' +
          '<td>' + (matchModeLabels[r.matchMode] || r.matchMode) + '</td>' +
          '<td>' + escapeHtml(r.pattern) + '</td>' +
          '<td style="font-size:18px;font-weight:bold;color:#4a90d9">' + (r.hitCount || 0) + '</td>' +
          '<td style="font-size:12px;color:#666">' + lastHit + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-secondary" onclick="toggleWatch(\\'' + r.id + '\\')">' + (r.enabled ? '禁用' : '启用') + '</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="resetWatch(\\'' + r.id + '\\')">重置</button>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteWatch(\\'' + r.id + '\\')">删除</button>' +
          '</td></tr>';
      }).join('');
    }
    
    document.getElementById('add-watch-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('watch-name').value,
        matchType: document.getElementById('watch-match-type').value,
        matchMode: document.getElementById('watch-match-mode').value,
        pattern: document.getElementById('watch-pattern').value
      };
      try {
        const res = await fetch('/api/watch', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
        if (res.ok) {
          hideModal('add-watch-modal');
          e.target.reset();
          showAlert('监控规则创建成功');
          loadStats();
        } else {
          const data = await res.json();
          showAlert(data.message || '创建失败', 'error');
        }
      } catch (e) { showAlert('创建失败', 'error'); }
    });
    
    async function toggleWatch(id) {
      try {
        await fetch('/api/watch/' + id + '/toggle', { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiToken } });
        loadStats();
      } catch (e) {}
    }
    
    async function resetWatch(id) {
      if (!confirm('确定重置此规则的命中次数？')) return;
      try {
        await fetch('/api/watch/' + id + '/reset', { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiToken } });
        showAlert('已重置');
        loadStats();
      } catch (e) { showAlert('重置失败', 'error'); }
    }
    
    async function deleteWatch(id) {
      if (!confirm('确定删除此监控规则？')) return;
      try {
        await fetch('/api/watch/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + apiToken } });
        showAlert('删除成功');
        loadStats();
      } catch (e) { showAlert('删除失败', 'error'); }
    }

    // Settings
    function loadSettings() {
      document.getElementById('api-token').value = apiToken;
    }

    function saveToken() {
      apiToken = document.getElementById('api-token').value;
      localStorage.setItem('apiToken', apiToken);
      showAlert('Token 已保存');
      document.getElementById('api-status').textContent = apiToken ? 'API Token: 已配置' : 'API Token: 需要配置';
      loadWorkers();
    }

    async function saveForwardConfig() {
      const defaultForwardTo = document.getElementById('default-forward').value;
      try {
        await fetch('/api/forward/config', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ defaultForwardTo })
        });
        showAlert('保存成功');
      } catch (e) { showAlert('保存失败', 'error'); }
    }

    // Init
    if (apiToken) {
      document.getElementById('api-status').textContent = 'API Token: 已配置';
      loadWorkers();
    }
  </script>
</body>
</html>`;

export async function frontendRoutes(app: FastifyInstance): Promise<void> {
  // Serve admin panel (no auth required, auth is done via API calls)
  app.get('/admin', async (request, reply) => {
    reply.type('text/html').send(HTML_TEMPLATE);
  });
}
