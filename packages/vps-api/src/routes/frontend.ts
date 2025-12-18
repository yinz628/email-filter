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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; min-height: 100vh; font-size: 14px; }
    .container { max-width: 1400px; margin: 0 auto; padding: 16px; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 16px 24px; margin-bottom: 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .header h1 { font-size: 20px; font-weight: 600; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; background: white; padding: 8px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .tab { padding: 8px 16px; background: transparent; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500; color: #666; transition: all 0.2s; }
    .tab:hover { background: #f0f2f5; color: #333; }
    .tab.active { background: #4a90d9; color: white; }
    .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card h2 { font-size: 16px; margin-bottom: 12px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px; font-weight: 600; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; display: inline-flex; align-items: center; gap: 4px; }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-primary:hover { background: #3a7bc8; }
    .btn-danger { background: #e74c3c; color: white; }
    .btn-danger:hover { background: #c0392b; }
    .btn-success { background: #27ae60; color: white; }
    .btn-success:hover { background: #219a52; }
    .btn-warning { background: #ff9800; color: white; }
    .btn-warning:hover { background: #e68900; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-secondary:hover { background: #5a6268; }
    .btn:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .form-group { margin-bottom: 12px; }
    .form-group label { display: block; margin-bottom: 4px; font-weight: 500; color: #555; font-size: 13px; }
    .form-group input, .form-group select { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; transition: border-color 0.2s; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #4a90d9; box-shadow: 0 0 0 2px rgba(74,144,217,0.1); }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .table-wrapper { overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #555; position: sticky; top: 0; }
    td { color: #333; }
    tr:hover { background: #f8f9fa; }
    .status { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .status-enabled { background: #d4edda; color: #155724; }
    .status-disabled { background: #f8d7da; color: #721c24; }
    .category { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .category-whitelist { background: #d4edda; color: #155724; }
    .category-blacklist { background: #f8d7da; color: #721c24; }
    .category-dynamic { background: #fff3cd; color: #856404; }
    .hidden { display: none !important; }
    .actions { display: flex; gap: 6px; flex-wrap: nowrap; }
    .modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px); }
    .modal-content { background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 480px; max-height: 85vh; overflow-y: auto; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-right: 30px; }
    .modal-header h3 { font-size: 16px; color: #333; font-weight: 600; }
    .modal-close { background: #f0f0f0; border: none; font-size: 18px; cursor: pointer; color: #666; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; position: absolute; top: 12px; right: 12px; z-index: 1001; transition: all 0.2s; }
    .modal-close:hover { background: #e74c3c; color: white; }
    .alert { padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; animation: slideIn 0.3s ease; }
    @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
    .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
    .stat-card { background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%); padding: 16px; border-radius: 8px; text-align: center; border: 1px solid #eee; }
    .stat-value { font-size: 28px; font-weight: 700; color: #4a90d9; }
    .stat-label { color: #666; font-size: 12px; margin-top: 4px; }
    .filter-bar { display: flex; gap: 8px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
    .filter-bar select, .filter-bar input { padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
    .tag { background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-right: 3px; display: inline-block; }
    .text-muted { color: #999; font-size: 12px; }
    .text-truncate { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle; }
    @media (max-width: 768px) {
      .container { padding: 12px; }
      .header { padding: 12px 16px; }
      .header h1 { font-size: 16px; }
      .tabs { gap: 4px; padding: 6px; }
      .tab { padding: 6px 12px; font-size: 12px; }
      .card { padding: 12px; }
      .form-row { grid-template-columns: 1fr; }
      .actions { flex-wrap: wrap; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    /* Project Detail Tabs Styles */
    .project-tab { padding: 10px 20px; border: none; background: transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
    .project-tab:hover { color: #4a90d9; background: #f8f9fa; }
    .project-tab.active { color: #4a90d9; border-bottom-color: #4a90d9; }
    .tab-panel { animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .project-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #27ae60; margin-right: 6px; }
    .root-badge { background: #4a90d9; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .value-tag-0 { background: #e9ecef; color: #666; }
    .value-tag-1 { background: #d4edda; color: #155724; }
    .value-tag-2 { background: #fff3cd; color: #856404; }
    .path-node { padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; background: #fff; }
    .path-node.highlighted { border-color: #27ae60; background: #e8f5e9; }
    .path-node.highlighted.high-value { border-color: #ffc107; background: #fff8e1; }
    .path-node-title { font-weight: 600; margin-bottom: 4px; }
    .path-node-stats { font-size: 12px; color: #666; }
    .btn-warning { background: #ffc107; color: #212529; border: 1px solid #ffc107; }
    .btn-warning:hover { background: #e0a800; border-color: #d39e00; }
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
      <button class="tab" onclick="showTab('campaign')">营销分析</button>
      <button class="tab" onclick="showTab('monitoring')">📡 信号监控</button>
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
        <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style="white-space:nowrap;">类型</th>
              <th style="white-space:nowrap;">字段</th>
              <th style="white-space:nowrap;">模式</th>
              <th style="min-width:200px;">规则内容</th>
              <th>标签</th>
              <th style="white-space:nowrap;">Worker</th>
              <th style="white-space:nowrap;">命中</th>
              <th style="white-space:nowrap;">状态</th>
              <th style="white-space:nowrap;">操作</th>
            </tr>
          </thead>
          <tbody id="rules-table"></tbody>
        </table>
        </div>
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
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="logs-auto-refresh" onchange="toggleAutoRefresh('logs')">
              <span>自动刷新</span>
            </label>
            <select id="logs-refresh-interval" onchange="updateAutoRefreshInterval('logs')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="60" selected>1分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
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
          <select id="log-worker-filter" onchange="resetLogPage(); loadLogs()">
            <option value="">全部实例</option>
          </select>
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
                <th style="width:80px;">Worker</th>
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
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="stats-worker-filter" onchange="loadStats()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="">全部实例</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="stats-auto-refresh" onchange="toggleAutoRefresh('stats')">
              <span>自动刷新</span>
            </label>
            <select id="stats-refresh-interval" onchange="updateAutoRefreshInterval('stats')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="60" selected>1分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
            <button class="btn btn-secondary" onclick="loadStats()">🔄 刷新</button>
          </div>
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
            <select id="trending-worker-filter" onchange="loadTrendingRules()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="">全部实例</option>
            </select>
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
              <th style="width:200px;">实例分布</th>
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

    <!-- Campaign Analytics Tab -->
    <div id="campaign-tab" class="tab-content hidden">
      <!-- 区域1: 标题区 (Title + Instance Selector) -->
      <div class="card" id="campaign-header-section">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="margin:0;border:none;padding:0;">📊 营销活动分析</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="campaign-worker-filter" onchange="onWorkerFilterChange()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="">选择实例</option>
            </select>
            <button class="btn btn-secondary" onclick="refreshCampaignData()">🔄 刷新</button>
          </div>
        </div>
      </div>

      <!-- 区域2: 数据管理区 - 商户列表 (Merchant List Card) -->
      <div class="card" id="campaign-merchants-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">🏪 商户列表</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="merchant-sort-field" onchange="sortMerchantList()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="emails">按邮件数排序</option>
              <option value="campaigns">按活动数排序</option>
            </select>
            <select id="merchant-sort-order" onchange="sortMerchantList()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
          </div>
        </div>
        <p style="color:#666;margin-bottom:15px">选择实例后显示该实例的商户列表。点击"创建项目"开始分析。</p>
        <div id="merchants-empty" style="text-align:center;padding:40px;">
          <div id="merchants-no-worker-prompt" style="display:block;">
            <div style="font-size:48px;margin-bottom:16px;">📋</div>
            <div style="color:#666;font-size:16px;font-weight:500;margin-bottom:8px;">请先选择 Worker 实例</div>
            <div style="color:#999;font-size:14px;margin-bottom:16px;">商户数据按 Worker 实例隔离显示，请在上方选择一个 Worker 实例以查看对应的商户列表。</div>
            <button class="btn btn-primary" onclick="document.getElementById('campaign-worker-filter').focus(); document.getElementById('campaign-worker-filter').click();">选择 Worker 实例</button>
          </div>
          <div id="merchants-loading" style="display:none;color:#999;">加载中...</div>
          <div id="merchants-empty-data" style="display:none;color:#999;">该实例暂无商户数据。</div>
          <div id="merchants-load-error" style="display:none;color:#e74c3c;">加载商户列表失败。</div>
        </div>
        <table id="merchants-table-container" style="display:none;">
          <thead>
            <tr>
              <th>商户域名</th>
              <th>营销活动数</th>
              <th>邮件总数</th>
              <th>已有项目</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="merchants-table"></tbody>
        </table>
      </div>

      <!-- 区域3: 项目列表区 (Project List Card) -->
      <div class="card" id="campaign-projects-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">📁 分析项目</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="project-status-filter" onchange="loadProjects()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="">全部状态</option>
              <option value="active">进行中</option>
              <option value="completed">已完成</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>
        <div id="projects-empty" style="text-align:center;color:#999;padding:40px;">
          暂无分析项目。请先选择实例，然后从商户列表创建项目。
        </div>
        <table id="projects-table-container" style="display:none;">
          <thead>
            <tr>
              <th>项目名称</th>
              <th>商户域名</th>
              <th>Worker</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="projects-table"></tbody>
        </table>
      </div>

      <!-- 区域4: 项目详情区 (Project Details with Tab Navigation) - 默认隐藏 -->
      <div class="card" id="campaign-project-detail-section" style="display:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;" id="project-detail-title">项目详情</h2>
          <button class="btn btn-sm btn-secondary" onclick="closeProjectDetail()">✕ 关闭</button>
        </div>
        
        <!-- 项目信息摘要 -->
        <div id="project-info-summary" style="margin-bottom:15px;padding:12px;background:#f8f9fa;border-radius:6px;display:flex;gap:20px;flex-wrap:wrap;">
          <div><strong>商户:</strong> <span id="project-info-merchant">-</span></div>
          <div><strong>Worker 实例:</strong> <span id="project-info-workers">-</span></div>
          <div><strong>状态:</strong> <span id="project-info-status">-</span></div>
        </div>
        
        <!-- 标签页导航 -->
        <div class="project-detail-tabs" style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid #eee;padding-bottom:0;">
          <button class="project-tab active" id="tab-root" onclick="switchProjectTab('root')" style="padding:10px 20px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;">
            🎯 Root确认
          </button>
          <button class="project-tab" id="tab-campaigns" onclick="switchProjectTab('campaigns')" style="padding:10px 20px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;">
            📧 营销活动
          </button>
          <button class="project-tab" id="tab-path" onclick="switchProjectTab('path')" style="padding:10px 20px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;">
            🔀 路径分析
          </button>
        </div>

        <!-- Root确认标签页内容 -->
        <div id="tab-content-root" class="tab-panel">
          <div style="margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;">
            <p style="color:#666;margin:0;">选择一个营销活动作为分析起点（Root）。Root 将作为路径分析的基准。</p>
            <button class="btn btn-primary btn-sm" onclick="detectRootCandidatesForProject()">🔍 自动检测候选</button>
          </div>
          <div id="root-current" style="margin-bottom:15px;padding:12px;background:#e8f5e9;border-radius:6px;display:none;">
            <strong>当前 Root:</strong> <span id="root-current-name">-</span>
          </div>
          <div id="root-campaigns-empty" style="text-align:center;color:#999;padding:40px;">
            加载中...
          </div>
          <table id="root-campaigns-table-container" style="display:none;">
            <thead>
              <tr>
                <th>邮件主题</th>
                <th>新用户数</th>
                <th>确认状态</th>
                <th>候选原因</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="root-campaigns-table"></tbody>
          </table>
        </div>

        <!-- 营销活动标签页内容 -->
        <div id="tab-content-campaigns" class="tab-panel" style="display:none;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
            <p style="color:#666;margin:0;">查看该商户的所有营销活动，可标记有价值的活动。</p>
            <div style="display:flex;gap:10px;align-items:center;">
              <select id="campaign-valuable-filter" onchange="loadProjectCampaigns()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
                <option value="">全部活动</option>
                <option value="1">有价值</option>
                <option value="2">高价值</option>
                <option value="0">未标记</option>
              </select>
              <select id="campaign-sort-field" onchange="sortCampaignList()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
                <option value="emails">按邮件数排序</option>
                <option value="time">按时间排序</option>
              </select>
            </div>
          </div>
          <div id="campaigns-empty" style="text-align:center;color:#999;padding:40px;">
            加载中...
          </div>
          <table id="campaigns-table-container" style="display:none;">
            <thead>
              <tr>
                <th>邮件主题</th>
                <th>邮件数</th>
                <th>收件人数</th>
                <th>价值标记</th>
                <th>首次出现</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="campaigns-table"></tbody>
          </table>
        </div>

        <!-- 路径分析标签页内容 -->
        <div id="tab-content-path" class="tab-panel" style="display:none;">
          <div id="path-no-root" style="text-align:center;color:#999;padding:40px;">
            <p style="font-size:16px;margin-bottom:10px;">⚠️ 请先在"Root确认"标签页中选择分析起点</p>
            <button class="btn btn-primary" onclick="switchProjectTab('root')">前往选择 Root</button>
          </div>
          <div id="path-analysis-container" style="display:none;">
            <div style="margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;">
              <p style="color:#666;margin:0;">基于 Root 的收件人路径流向分析。显示从 Root 开始的营销活动推送路径。</p>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-primary btn-sm" onclick="recalculatePathsForProject()">🔄 重新分析路径</button>
                <button class="btn btn-warning btn-sm" onclick="cleanupOldCustomersForProject()">🧹 清理老客户数据</button>
              </div>
            </div>
            <div id="path-flow-container" style="min-height:300px;border:1px solid #eee;border-radius:6px;padding:16px;">
              加载中...
            </div>
          </div>
        </div>
      </div>

      <!-- 旧版数据管理区域 (保留用于数据清理功能) -->
      <div class="card" id="campaign-data-management-section" style="display:none;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">🗄️ 数据管理</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="dataStats-auto-refresh" onchange="toggleAutoRefresh('dataStats')">
              <span>自动刷新</span>
            </label>
            <select id="dataStats-refresh-interval" onchange="updateAutoRefreshInterval('dataStats')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="60" selected>1分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="loadDataStats()">🔄 刷新统计</button>
          </div>
        </div>
        <div id="data-stats-container" style="margin-bottom:15px;">
          <div class="stats-grid">
            <div class="stat-card" style="background:#e8f5e9;"><div class="stat-value" id="stat-active-data" style="color:#2e7d32;">-</div><div class="stat-label">分析中商户</div></div>
            <div class="stat-card" style="background:#fff3e0;"><div class="stat-value" id="stat-pending-data" style="color:#e65100;">-</div><div class="stat-label">等待分析</div></div>
            <div class="stat-card" style="background:#ffebee;"><div class="stat-value" id="stat-ignored-data" style="color:#c62828;">-</div><div class="stat-label">已忽略</div></div>
            <div class="stat-card" style="background:#e3f2fd;"><div class="stat-value" id="stat-total-paths" style="color:#1565c0;">-</div><div class="stat-label">路径记录</div></div>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-danger" onclick="cleanupIgnoredData()">🗑️ 清理已忽略商户数据</button>
          <div style="display:flex;gap:5px;align-items:center;">
            <select id="pending-cleanup-days" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="1">1天前</option>
              <option value="3">3天前</option>
              <option value="7">7天前</option>
              <option value="14">14天前</option>
              <option value="30" selected>30天前</option>
              <option value="60">60天前</option>
            </select>
            <button class="btn btn-warning" onclick="cleanupPendingData()">🗑️ 清理旧待分析数据</button>
          </div>
        </div>
        <p style="color:#888;font-size:12px;margin-top:10px;">
          💡 提示：已忽略的商户不会记录详细营销数据，仅统计邮件数量。清理操作不可恢复，请谨慎操作。
        </p>
      </div>
    </div>

    <!-- Monitoring Tab -->
    <div id="monitoring-tab" class="tab-content hidden">
      <!-- 🔔 告警历史 - 放在最上面 -->
      <div class="card collapsible-card">
        <div class="card-header" onclick="toggleCard('alerts-card')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;margin-bottom:0;border-bottom:1px solid #eee;padding-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="collapse-icon" id="alerts-card-icon">▼</span>
            <h2 style="margin:0;border:none;padding:0;">🔔 告警历史</h2>
          </div>
          <div style="display:flex;gap:10px;align-items:center;" onclick="event.stopPropagation()">
            <select id="alert-rule-filter" onchange="filterAlerts()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;max-width:200px;">
              <option value="">全部规则</option>
            </select>
            <select id="alert-rows-limit" onchange="loadMonitoringAlerts()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="10">10条</option>
              <option value="20" selected>20条</option>
              <option value="50">50条</option>
              <option value="100">100条</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="alerts-auto-refresh" onchange="toggleAutoRefresh('alerts')">
              <span>自动刷新</span>
            </label>
            <select id="alerts-refresh-interval" onchange="updateAutoRefreshInterval('alerts')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;width:70px;">
              <option value="30">30秒</option>
              <option value="60" selected>1分钟</option>
              <option value="300">5分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="loadMonitoringAlerts()">🔄 刷新</button>
            <button class="btn btn-sm btn-danger" id="batch-delete-alerts-btn" onclick="batchDeleteAlerts()" style="display:none;">🗑️ 删除选中</button>
          </div>
        </div>
        <div class="card-body" id="alerts-card-body" style="margin-top:15px;">
          <table>
            <thead>
              <tr>
                <th style="width:30px;"><input type="checkbox" id="select-all-alerts" onchange="toggleSelectAllAlerts()"></th>
                <th>时间</th>
                <th>类型</th>
                <th>规则</th>
                <th style="white-space:nowrap;">状态变化</th>
                <th style="white-space:nowrap;">间隔</th>
                <th style="white-space:nowrap;">发送状态</th>
                <th style="white-space:nowrap;">操作</th>
              </tr>
            </thead>
            <tbody id="monitoring-alerts-table"></tbody>
          </table>
        </div>
      </div>

      <!-- 📡 信号监控规则 -->
      <div class="card collapsible-card">
        <div class="card-header" onclick="toggleCard('rules-card')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;margin-bottom:0;border-bottom:1px solid #eee;padding-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="collapse-icon" id="rules-card-icon">▼</span>
            <h2 style="margin:0;border:none;padding:0;">📡 信号监控规则</h2>
          </div>
          <div style="display:flex;gap:10px;align-items:center;" onclick="event.stopPropagation()">
            <select id="monitoring-scope-filter" onchange="loadMonitoringRules()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="">全部范围</option>
              <option value="global">全局</option>
            </select>
            <select id="monitoring-tag-filter" onchange="loadMonitoringRules()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="">全部标签</option>
            </select>
            <select id="rules-rows-limit" onchange="loadMonitoringRules()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="10">10条</option>
              <option value="20" selected>20条</option>
              <option value="50">50条</option>
              <option value="0">全部</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;" title="自动心跳检查">
              <input type="checkbox" id="heartbeat-auto-refresh" onchange="toggleAutoRefresh('heartbeat')">
              <span>自动心跳</span>
            </label>
            <select id="heartbeat-refresh-interval" onchange="updateAutoRefreshInterval('heartbeat')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;width:70px;">
              <option value="30">30秒</option>
              <option value="60" selected>1分钟</option>
              <option value="300">5分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="triggerHeartbeat()">💓 心跳检查</button>
            <button class="btn btn-sm btn-primary" onclick="showModal('add-monitoring-rule-modal')">+ 添加</button>
          </div>
        </div>
        <div class="card-body" id="rules-card-body" style="margin-top:15px;">
          <p style="color:#666;margin-bottom:15px">监控重点邮件信号的健康状态。当信号异常时自动告警。</p>
          <table>
            <thead>
              <tr>
                <th>商户</th>
                <th>规则名称</th>
                <th>标签</th>
                <th>作用范围</th>
                <th>主题匹配</th>
                <th>预期间隔</th>
                <th>死亡阈值</th>
                <th>状态</th>
                <th>启用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="monitoring-rules-table"></tbody>
          </table>
        </div>
      </div>

      <!-- 📊 信号状态 -->
      <div class="card collapsible-card">
        <div class="card-header" onclick="toggleCard('status-card')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;margin-bottom:0;border-bottom:1px solid #eee;padding-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="collapse-icon" id="status-card-icon">▼</span>
            <h2 style="margin:0;border:none;padding:0;">📊 信号状态</h2>
          </div>
          <div style="display:flex;gap:10px;align-items:center;" onclick="event.stopPropagation()">
            <select id="status-rule-filter" onchange="filterStatus()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="">全部规则</option>
            </select>
            <select id="status-rows-limit" onchange="loadMonitoringStatus()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="10">10条</option>
              <option value="20" selected>20条</option>
              <option value="50">50条</option>
              <option value="0">全部</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="status-auto-refresh" onchange="toggleAutoRefresh('status')">
              <span>自动刷新</span>
            </label>
            <select id="status-refresh-interval" onchange="updateAutoRefreshInterval('status')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;width:70px;">
              <option value="30">30秒</option>
              <option value="60" selected>1分钟</option>
              <option value="300">5分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="loadMonitoringStatus()">🔄 刷新</button>
          </div>
        </div>
        <div class="card-body" id="status-card-body" style="margin-top:15px;">
          <p style="color:#666;margin-bottom:15px">实时显示所有监控信号的健康状态。状态按 DEAD > WEAK > ACTIVE 排序。</p>
          <table>
            <thead>
              <tr>
                <th>状态</th>
                <th>商户 / 规则</th>
                <th>最后出现</th>
                <th>间隔</th>
                <th>24h</th>
                <th>12h</th>
                <th>1h</th>
              </tr>
            </thead>
            <tbody id="monitoring-status-table"></tbody>
          </table>
        </div>
      </div>

      <!-- 📈 漏斗监控 -->
      <div class="card collapsible-card">
        <div class="card-header" onclick="toggleCard('funnel-card')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;margin-bottom:0;border-bottom:1px solid #eee;padding-bottom:10px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="collapse-icon" id="funnel-card-icon">▼</span>
            <h2 style="margin:0;border:none;padding:0;">📈 漏斗监控</h2>
          </div>
          <div style="display:flex;gap:10px;align-items:center;" onclick="event.stopPropagation()">
            <select id="ratio-scope-filter" onchange="loadRatioMonitors()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="">全部范围</option>
              <option value="global">全局</option>
            </select>
            <select id="ratio-tag-filter" onchange="loadRatioMonitors()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="">全部标签</option>
            </select>
            <select id="funnel-rows-limit" onchange="loadRatioMonitors()" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;">
              <option value="5">5条</option>
              <option value="10" selected>10条</option>
              <option value="20">20条</option>
              <option value="0">全部</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="funnel-auto-refresh" onchange="toggleAutoRefresh('funnel')">
              <span>自动刷新</span>
            </label>
            <select id="funnel-refresh-interval" onchange="updateAutoRefreshInterval('funnel')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;width:70px;">
              <option value="30">30秒</option>
              <option value="60" selected>1分钟</option>
              <option value="300">5分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="checkRatioMonitors()">🔄 检查比例</button>
            <button class="btn btn-sm btn-primary" onclick="showModal('add-ratio-monitor-modal')">+ 添加</button>
          </div>
        </div>
        <div class="card-body" id="funnel-card-body" style="margin-top:15px;">
          <p style="color:#666;margin-bottom:15px">监控邮件流程的转化漏斗。支持多步骤，当任一步骤比例低于阈值时触发告警。</p>
          <div id="ratio-monitors-container"></div>
        </div>
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
      <div class="card">
        <h2>🤖 Telegram 通知</h2>
        <p style="color:#666;margin-bottom:15px">配置 Telegram Bot 接收告警通知。<a href="https://t.me/BotFather" target="_blank" style="color:#4a90d9;">创建 Bot</a></p>
        <div class="form-group">
          <label>Bot Token</label>
          <input type="password" id="telegram-bot-token" placeholder="从 @BotFather 获取的 Token">
          <p style="color:#888;font-size:12px;margin-top:5px">格式: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz</p>
        </div>
        <div class="form-group">
          <label>Chat ID</label>
          <input type="text" id="telegram-chat-id" placeholder="你的 Chat ID 或群组 ID">
          <p style="color:#888;font-size:12px;margin-top:5px">发送消息给 @userinfobot 获取你的 Chat ID</p>
        </div>
        <div class="form-group">
          <label>启用通知</label>
          <select id="telegram-enabled">
            <option value="false">禁用</option>
            <option value="true">启用</option>
          </select>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-primary" onclick="saveTelegramConfig()">保存配置</button>
          <button class="btn btn-secondary" onclick="testTelegramConfig()">发送测试消息</button>
        </div>
        <div id="telegram-status" style="margin-top:10px;"></div>
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

  <!-- Campaign Detail Modal -->
  <div id="campaign-detail-modal" class="modal hidden">
    <div class="modal-content" style="max-width:600px;">
      <div class="modal-header">
        <h3>营销活动详情</h3>
        <button class="modal-close" onclick="hideModal('campaign-detail-modal')">&times;</button>
      </div>
      <div id="campaign-detail-content"></div>
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
        <div class="form-group">
          <label>标签（可选，用逗号分隔）</label>
          <input type="text" id="rule-tags" placeholder="例如：营销,广告,垃圾">
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <!-- Edit Rule Modal -->
  <div id="edit-rule-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>编辑过滤规则</h3>
        <button class="modal-close" onclick="hideModal('edit-rule-modal')">&times;</button>
      </div>
      <form id="edit-rule-form">
        <input type="hidden" id="edit-rule-id">
        <div class="form-group">
          <label>关联 Worker</label>
          <select id="edit-rule-worker">
            <option value="">全局规则（适用于所有 Worker）</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>规则类型 *</label>
            <select id="edit-rule-category" required>
              <option value="blacklist">黑名单（拦截）</option>
              <option value="whitelist">白名单（放行）</option>
            </select>
          </div>
          <div class="form-group">
            <label>匹配字段 *</label>
            <select id="edit-rule-match-type" required>
              <option value="sender">发件人</option>
              <option value="subject">主题</option>
              <option value="domain">发件域名</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>匹配模式 *</label>
          <select id="edit-rule-match-mode" required>
            <option value="contains">包含</option>
            <option value="exact">精确匹配</option>
            <option value="startsWith">开头匹配</option>
            <option value="endsWith">结尾匹配</option>
            <option value="regex">正则表达式</option>
          </select>
        </div>
        <div class="form-group">
          <label>规则内容 *</label>
          <input type="text" id="edit-rule-pattern" required placeholder="要匹配的内容">
        </div>
        <div class="form-group">
          <label>标签（可选，用逗号分隔）</label>
          <input type="text" id="edit-rule-tags" placeholder="例如：营销,广告,垃圾">
        </div>
        <button type="submit" class="btn btn-primary">保存</button>
      </form>
    </div>
  </div>

  <!-- Add Monitoring Rule Modal -->
  <div id="add-monitoring-rule-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加监控规则</h3>
        <button class="modal-close" onclick="hideModal('add-monitoring-rule-modal')">&times;</button>
      </div>
      <form id="add-monitoring-rule-form">
        <div class="form-group">
          <label>商户标识 *</label>
          <input type="text" id="monitoring-merchant" required placeholder="例如：amazon.com">
        </div>
        <div class="form-group">
          <label>规则名称 *</label>
          <input type="text" id="monitoring-name" required placeholder="例如：Amazon订单确认">
        </div>
        <div class="form-group">
          <label>主题匹配内容 *</label>
          <input type="text" id="monitoring-pattern" required placeholder="例如：Your Amazon.com order">
        </div>
        <div class="form-group">
          <label>匹配模式</label>
          <select id="monitoring-match-mode">
            <option value="contains" selected>包含匹配</option>
            <option value="regex">正则表达式</option>
          </select>
          <p style="color:#888;font-size:12px;margin-top:5px">包含匹配：主题包含指定文本即匹配；正则表达式：使用正则语法匹配</p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>预期间隔（分钟）*</label>
            <input type="number" id="monitoring-interval" required min="1" value="1440" placeholder="1440">
            <p style="color:#888;font-size:12px;margin-top:5px">信号正常出现的间隔，1440=1天</p>
          </div>
          <div class="form-group">
            <label>死亡阈值（分钟）*</label>
            <input type="number" id="monitoring-dead-after" required min="1" value="4320" placeholder="4320">
            <p style="color:#888;font-size:12px;margin-top:5px">超过此时间判定为DEAD，4320=3天</p>
          </div>
        </div>
        <div class="form-group">
          <label>标签</label>
          <input type="text" id="monitoring-tags" placeholder="多个标签用逗号分隔，例如：重要,订单">
        </div>
        <div class="form-group">
          <label>作用范围</label>
          <select id="monitoring-worker-scope">
            <option value="global">全局（所有实例）</option>
          </select>
          <p style="color:#888;font-size:12px;margin-top:5px">选择监控规则的作用范围，全局表示统计所有实例的数据</p>
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <!-- Edit Monitoring Rule Modal -->
  <div id="edit-monitoring-rule-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>编辑监控规则</h3>
        <button class="modal-close" onclick="hideModal('edit-monitoring-rule-modal')">&times;</button>
      </div>
      <form id="edit-monitoring-rule-form">
        <input type="hidden" id="edit-monitoring-id">
        <div class="form-group">
          <label>商户标识 *</label>
          <input type="text" id="edit-monitoring-merchant" required>
        </div>
        <div class="form-group">
          <label>规则名称 *</label>
          <input type="text" id="edit-monitoring-name" required>
        </div>
        <div class="form-group">
          <label>主题匹配内容 *</label>
          <input type="text" id="edit-monitoring-pattern" required>
        </div>
        <div class="form-group">
          <label>匹配模式</label>
          <select id="edit-monitoring-match-mode">
            <option value="contains">包含匹配</option>
            <option value="regex">正则表达式</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>预期间隔（分钟）*</label>
            <input type="number" id="edit-monitoring-interval" required min="1">
          </div>
          <div class="form-group">
            <label>死亡阈值（分钟）*</label>
            <input type="number" id="edit-monitoring-dead-after" required min="1">
          </div>
        </div>
        <div class="form-group">
          <label>标签</label>
          <input type="text" id="edit-monitoring-tags" placeholder="多个标签用逗号分隔">
        </div>
        <div class="form-group">
          <label>作用范围</label>
          <select id="edit-monitoring-worker-scope">
            <option value="global">全局（所有实例）</option>
          </select>
          <p style="color:#888;font-size:12px;margin-top:5px">选择监控规则的作用范围，全局表示统计所有实例的数据</p>
        </div>
        <button type="submit" class="btn btn-primary">保存</button>
      </form>
    </div>
  </div>

  <!-- Add Ratio Monitor Modal -->
  <div id="add-ratio-monitor-modal" class="modal hidden">
    <div class="modal-content" style="max-width:600px;">
      <div class="modal-header">
        <h3>添加漏斗监控</h3>
        <button class="modal-close" onclick="hideModal('add-ratio-monitor-modal')">&times;</button>
      </div>
      <form id="add-ratio-monitor-form">
        <div class="form-row">
          <div class="form-group">
            <label>监控名称 *</label>
            <input type="text" id="ratio-name" required placeholder="例如：注册流程转化率">
          </div>
          <div class="form-group">
            <label>标签 *</label>
            <input type="text" id="ratio-tag" required placeholder="用于分组，例如：注册流程">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>默认阈值（%）*</label>
            <input type="number" id="ratio-threshold" required min="0" max="100" value="80" placeholder="80">
          </div>
          <div class="form-group">
            <label>时间窗口 *</label>
            <select id="ratio-time-window" required>
              <option value="1h">1小时</option>
              <option value="12h">12小时</option>
              <option value="24h" selected>24小时</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>作用范围</label>
          <select id="ratio-worker-scope">
            <option value="global">全局（所有实例）</option>
          </select>
          <p style="color:#888;font-size:12px;margin-top:5px">选择漏斗监控的作用范围，全局表示统计所有实例的数据</p>
        </div>
        <div style="border:1px solid #eee;border-radius:8px;padding:15px;margin-bottom:15px;background:#fafafa;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <label style="font-weight:600;">漏斗步骤</label>
            <button type="button" class="btn btn-sm btn-primary" onclick="addFunnelStep()">+ 添加步骤</button>
          </div>
          <div id="funnel-steps-container">
            <div class="funnel-step" data-order="1" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">
              <span style="width:30px;font-weight:bold;color:#666;">1</span>
              <select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">
                <option value="">选择规则...</option>
              </select>
              <input type="number" class="funnel-step-threshold" value="100" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%" disabled>
              <span style="color:#888;font-size:12px;">基准</span>
            </div>
            <div class="funnel-step" data-order="2" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">
              <span style="width:30px;font-weight:bold;color:#666;">2</span>
              <select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">
                <option value="">选择规则...</option>
              </select>
              <input type="number" class="funnel-step-threshold" value="80" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%">
              <span style="color:#888;font-size:12px;">%</span>
            </div>
          </div>
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <!-- Edit Ratio Monitor Modal -->
  <div id="edit-ratio-monitor-modal" class="modal hidden">
    <div class="modal-content" style="max-width:600px;">
      <div class="modal-header">
        <h3>编辑漏斗监控</h3>
        <button class="modal-close" onclick="hideModal('edit-ratio-monitor-modal')">&times;</button>
      </div>
      <form id="edit-ratio-monitor-form">
        <input type="hidden" id="edit-ratio-id">
        <div class="form-row">
          <div class="form-group">
            <label>监控名称 *</label>
            <input type="text" id="edit-ratio-name" required>
          </div>
          <div class="form-group">
            <label>标签 *</label>
            <input type="text" id="edit-ratio-tag" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>默认阈值（%）*</label>
            <input type="number" id="edit-ratio-threshold" required min="0" max="100">
          </div>
          <div class="form-group">
            <label>时间窗口 *</label>
            <select id="edit-ratio-time-window" required>
              <option value="1h">1小时</option>
              <option value="12h">12小时</option>
              <option value="24h">24小时</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>作用范围</label>
          <select id="edit-ratio-worker-scope">
            <option value="global">全局（所有实例）</option>
          </select>
          <p style="color:#888;font-size:12px;margin-top:5px">选择漏斗监控的作用范围，全局表示统计所有实例的数据</p>
        </div>
        <div style="border:1px solid #eee;border-radius:8px;padding:15px;margin-bottom:15px;background:#fafafa;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <label style="font-weight:600;">漏斗步骤</label>
            <button type="button" class="btn btn-sm btn-primary" onclick="addEditFunnelStep()">+ 添加步骤</button>
          </div>
          <div id="edit-funnel-steps-container"></div>
        </div>
        <button type="submit" class="btn btn-primary">保存</button>
      </form>
    </div>
  </div>

  <!-- Create Project Modal -->
  <div id="create-project-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>创建分析项目</h3>
        <button class="modal-close" onclick="hideModal('create-project-modal')">&times;</button>
      </div>
      <form id="create-project-form">
        <input type="hidden" id="create-project-merchant-id">
        <div class="form-group">
          <label>商户域名</label>
          <input type="text" id="create-project-merchant-domain" disabled style="background:#f5f5f5">
        </div>
        <div class="form-group" id="create-project-worker-group">
          <label>Worker 实例选择 *</label>
          <div style="margin-bottom:8px;">
            <label style="display:inline-flex;align-items:center;margin-right:15px;cursor:pointer;">
              <input type="radio" name="worker-mode" value="single" checked onchange="updateWorkerSelectionMode()" style="margin-right:5px;">
              <span>单个实例</span>
            </label>
            <label style="display:inline-flex;align-items:center;margin-right:15px;cursor:pointer;">
              <input type="radio" name="worker-mode" value="multiple" onchange="updateWorkerSelectionMode()" style="margin-right:5px;">
              <span>多个实例</span>
            </label>
            <label style="display:inline-flex;align-items:center;cursor:pointer;">
              <input type="radio" name="worker-mode" value="all" onchange="updateWorkerSelectionMode()" style="margin-right:5px;">
              <span>全部实例</span>
            </label>
          </div>
          <div id="create-project-single-worker" style="display:block;">
            <select id="create-project-worker" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
              <option value="">请选择实例</option>
            </select>
          </div>
          <div id="create-project-multi-worker" style="display:none;max-height:150px;overflow-y:auto;border:1px solid #ddd;border-radius:4px;padding:8px;">
            <!-- Checkboxes will be populated dynamically -->
          </div>
          <p id="create-project-worker-error" style="color:#e74c3c;font-size:12px;margin-top:5px;display:none;">请选择至少一个 Worker 实例</p>
        </div>
        <div class="form-group">
          <label>项目名称 *</label>
          <input type="text" id="create-project-name" required placeholder="请输入项目名称">
          <p id="create-project-name-error" style="color:#e74c3c;font-size:12px;margin-top:5px;display:none;">项目名称不能为空或仅包含空格</p>
        </div>
        <button type="submit" class="btn btn-success">创建项目</button>
      </form>
    </div>
  </div>

  <!-- Merchant Preview Modal -->
  <div id="merchant-preview-modal" class="modal hidden">
    <div class="modal-content" style="max-width:700px;">
      <div class="modal-header">
        <h3>📊 商户营销活动预览</h3>
        <button class="modal-close" onclick="hideModal('merchant-preview-modal')">&times;</button>
      </div>
      <div style="padding:15px 0;">
        <div style="margin-bottom:15px;">
          <p style="margin:0;"><strong>商户域名:</strong> <span id="preview-merchant-domain">-</span></p>
          <p style="margin:5px 0 0 0;color:#666;font-size:13px;">
            共 <strong id="preview-total-campaigns">0</strong> 个营销活动，<strong id="preview-total-emails">0</strong> 封邮件
          </p>
        </div>
        <div id="preview-campaigns-loading" style="text-align:center;padding:20px;color:#666;">
          加载中...
        </div>
        <div id="preview-campaigns-list" style="display:none;max-height:400px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#f8f9fa;position:sticky;top:0;">
                <th style="text-align:left;padding:10px;border-bottom:2px solid #dee2e6;">邮件主题</th>
                <th style="text-align:right;padding:10px;border-bottom:2px solid #dee2e6;width:100px;">邮件数</th>
              </tr>
            </thead>
            <tbody id="preview-campaigns-tbody"></tbody>
          </table>
        </div>
        <div id="preview-campaigns-empty" style="display:none;text-align:center;padding:20px;color:#999;">
          暂无营销活动数据
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:15px;padding-top:15px;border-top:1px solid #eee;">
          <button class="btn btn-secondary" onclick="hideModal('merchant-preview-modal')">关闭</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Delete Merchant Data Modal -->
  <div id="delete-merchant-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>⚠️ 删除商户数据</h3>
        <button class="modal-close" onclick="hideModal('delete-merchant-modal')">&times;</button>
      </div>
      <div style="padding:15px 0;">
        <input type="hidden" id="delete-merchant-id">
        <p style="color:#e74c3c;font-weight:bold;margin-bottom:15px;">此操作不可恢复！</p>
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:15px;margin-bottom:15px;">
          <p style="margin:0 0 10px 0;"><strong>将要删除的数据：</strong></p>
          <ul style="margin:0;padding-left:20px;">
            <li>商户域名: <strong id="delete-merchant-domain">-</strong></li>
            <li>Worker 实例: <strong id="delete-merchant-worker">-</strong></li>
            <li>邮件记录数: <strong id="delete-merchant-emails">-</strong></li>
            <li>营销活动数: <strong id="delete-merchant-campaigns">-</strong></li>
          </ul>
        </div>
        <p style="color:#666;font-size:13px;margin-bottom:15px;">删除后，该商户在此 Worker 下的所有邮件和路径记录将被永久删除。如果该商户在其他 Worker 中仍有数据，商户记录将被保留。</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="hideModal('delete-merchant-modal')">取消</button>
          <button class="btn btn-danger" onclick="confirmDeleteMerchantData()">确认删除</button>
        </div>
      </div>
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
      if (name === 'campaign') loadCampaignAnalytics();
      if (name === 'monitoring') loadMonitoringData();
      if (name === 'settings') loadSettings();
    }

    function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
    function hideModal(id) { document.getElementById(id).classList.add('hidden'); }
    
    // Card collapse functionality
    const cardStates = { 'alerts-card': true, 'rules-card': true, 'status-card': true, 'funnel-card': true };
    function toggleCard(cardId) {
      cardStates[cardId] = !cardStates[cardId];
      const body = document.getElementById(cardId + '-body');
      const icon = document.getElementById(cardId + '-icon');
      if (cardStates[cardId]) {
        body.style.display = 'block';
        icon.textContent = '▼';
      } else {
        body.style.display = 'none';
        icon.textContent = '▶';
      }
    }
    
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
        let onlineStatus = '<span style="color:#999">未配置URL</span>';
        if (w.workerUrl) {
          if (health === undefined) {
            onlineStatus = '<span style="color:#999">点击检测</span>';
          } else {
            onlineStatus = formatHealthStatus(health);
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
          cell.innerHTML = formatHealthStatus(data);
        }
      } catch (e) {
        if (cell) cell.innerHTML = '<span class="status status-disabled">🔴 错误</span>';
      }
    }

    function formatHealthStatus(data) {
      if (!data.online) {
        return '<span class="status status-disabled">🔴 Worker离线</span>';
      }
      // Worker online, check VPS connection
      if (data.vpsConnection) {
        if (data.vpsConnection.success) {
          return '<span class="status status-enabled">🟢 正常 (' + data.vpsConnection.latency + 'ms)</span>';
        } else {
          return '<span class="status status-disabled" title="' + escapeHtml(data.vpsConnection.error || '') + '">🟡 Worker在线，VPS连接失败</span>';
        }
      }
      return '<span class="status status-enabled">🟢 在线 (' + data.latency + 'ms)</span>';
    }

    async function checkAllWorkersHealth() {
      showAlert('正在检测所有 Worker 状态...');
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
      
      // Update logs worker filter
      const logWorkerFilterOptions = '<option value="">全部实例</option><option value="global">全局</option>' +
        workers.map(w => '<option value="' + escapeHtml(w.name) + '">' + escapeHtml(w.name) + '</option>').join('');
      const logWorkerFilter = document.getElementById('log-worker-filter');
      if (logWorkerFilter) logWorkerFilter.innerHTML = logWorkerFilterOptions;
      
      // Update stats worker filter
      const statsWorkerFilter = document.getElementById('stats-worker-filter');
      if (statsWorkerFilter) statsWorkerFilter.innerHTML = logWorkerFilterOptions;
      
      // Update trending rules worker filter
      const trendingWorkerFilter = document.getElementById('trending-worker-filter');
      if (trendingWorkerFilter) trendingWorkerFilter.innerHTML = logWorkerFilterOptions;
      
      // Update campaign worker filter
      const campaignWorkerFilter = document.getElementById('campaign-worker-filter');
      if (campaignWorkerFilter) campaignWorkerFilter.innerHTML = logWorkerFilterOptions;
      
      // Update monitoring worker scope dropdowns
      const monitoringWorkerScopeOptions = '<option value="global">全局（所有实例）</option>' +
        workers.map(w => '<option value="' + escapeHtml(w.name) + '">' + escapeHtml(w.name) + '</option>').join('');
      const monitoringWorkerScope = document.getElementById('monitoring-worker-scope');
      if (monitoringWorkerScope) monitoringWorkerScope.innerHTML = monitoringWorkerScopeOptions;
      const editMonitoringWorkerScope = document.getElementById('edit-monitoring-worker-scope');
      if (editMonitoringWorkerScope) editMonitoringWorkerScope.innerHTML = monitoringWorkerScopeOptions;
      
      // Update ratio monitor worker scope dropdowns
      const ratioWorkerScope = document.getElementById('ratio-worker-scope');
      if (ratioWorkerScope) ratioWorkerScope.innerHTML = monitoringWorkerScopeOptions;
      const editRatioWorkerScope = document.getElementById('edit-ratio-worker-scope');
      if (editRatioWorkerScope) editRatioWorkerScope.innerHTML = monitoringWorkerScopeOptions;
      
      // Update monitoring scope filter
      const monitoringScopeFilterOptions = '<option value="">全部范围</option><option value="global">全局</option>' +
        workers.map(w => '<option value="' + escapeHtml(w.name) + '">' + escapeHtml(w.name) + '</option>').join('');
      const monitoringScopeFilter = document.getElementById('monitoring-scope-filter');
      if (monitoringScopeFilter) monitoringScopeFilter.innerHTML = monitoringScopeFilterOptions;
      
      // Update ratio scope filter
      const ratioScopeFilter = document.getElementById('ratio-scope-filter');
      if (ratioScopeFilter) ratioScopeFilter.innerHTML = monitoringScopeFilterOptions;
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
        currentRules = data.rules || [];
        renderRules(currentRules);
      } catch (e) { showAlert('加载规则失败', 'error'); }
    }

    function renderRules(rules) {
      const tbody = document.getElementById('rules-table');
      if (rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999;padding:30px;">暂无规则</td></tr>';
        return;
      }
      tbody.innerHTML = rules.map(r => {
        const cat = '<span class="category category-' + r.category + '">' + 
          (r.category === 'whitelist' ? '白名单' : r.category === 'blacklist' ? '黑名单' : '动态') + '</span>';
        const status = r.enabled ? '<span class="status status-enabled">启用</span>' : '<span class="status status-disabled">禁用</span>';
        const worker = r.workerId ? (workers.find(w => w.id === r.workerId)?.name || '未知') : '全局';
        const matchType = {sender:'发件人',subject:'主题',domain:'域名'}[r.matchType] || r.matchType;
        const matchMode = {exact:'精确',contains:'包含',startsWith:'开头',endsWith:'结尾',regex:'正则'}[r.matchMode] || r.matchMode;
        const lastHit = r.lastHitAt ? new Date(r.lastHitAt).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
        const tagsHtml = r.tags && r.tags.length > 0 ? r.tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') : '<span class="text-muted">-</span>';
        const patternDisplay = '<span style="word-break:break-all;white-space:normal;">' + escapeHtml(r.pattern) + '</span>';
        return '<tr><td style="white-space:nowrap;">' + cat + '</td><td style="white-space:nowrap;">' + matchType + '</td><td style="white-space:nowrap;">' + matchMode + '</td>' +
          '<td>' + patternDisplay + '</td><td>' + tagsHtml + '</td><td style="white-space:nowrap;">' + escapeHtml(worker) + '</td>' +
          '<td class="text-muted" style="white-space:nowrap;">' + lastHit + '</td><td style="white-space:nowrap;">' + status + '</td>' +
          '<td><div style="display:flex;flex-direction:column;gap:4px;">' +
            '<button class="btn btn-sm btn-primary" onclick=\\'editRule("' + r.id + '")\\'>编辑</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="toggleRule(\\'' + r.id + '\\')">切换</button>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteRule(\\'' + r.id + '\\')">删除</button>' +
          '</div></td></tr>';
      }).join('');
    }

    document.getElementById('add-rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tagsInput = document.getElementById('rule-tags').value.trim();
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : undefined;
      const body = {
        workerId: document.getElementById('rule-worker').value || undefined,
        category: document.getElementById('rule-category').value,
        matchType: document.getElementById('rule-match-type').value,
        matchMode: document.getElementById('rule-match-mode').value,
        pattern: document.getElementById('rule-pattern').value,
        tags: tags
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

    let currentRules = [];
    
    async function editRule(id) {
      const rule = currentRules.find(r => r.id === id);
      if (!rule) {
        // Fetch rule from API if not in cache
        try {
          const res = await fetch('/api/rules/' + id, { headers: getHeaders() });
          if (!res.ok) { showAlert('获取规则失败', 'error'); return; }
          const data = await res.json();
          showEditRuleModal(data);
        } catch (e) { showAlert('获取规则失败', 'error'); }
        return;
      }
      showEditRuleModal(rule);
    }

    function showEditRuleModal(rule) {
      document.getElementById('edit-rule-id').value = rule.id;
      document.getElementById('edit-rule-worker').value = rule.workerId || '';
      document.getElementById('edit-rule-category').value = rule.category;
      document.getElementById('edit-rule-match-type').value = rule.matchType;
      document.getElementById('edit-rule-match-mode').value = rule.matchMode;
      document.getElementById('edit-rule-pattern').value = rule.pattern;
      document.getElementById('edit-rule-tags').value = rule.tags ? rule.tags.join(', ') : '';
      
      // Update worker select options
      const workerSelect = document.getElementById('edit-rule-worker');
      workerSelect.innerHTML = '<option value="">全局规则（适用于所有 Worker）</option>' + 
        workers.map(w => '<option value="' + w.id + '"' + (w.id === rule.workerId ? ' selected' : '') + '>' + escapeHtml(w.name) + '</option>').join('');
      
      showModal('edit-rule-modal');
    }

    document.getElementById('edit-rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-rule-id').value;
      const tagsInput = document.getElementById('edit-rule-tags').value.trim();
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
      const body = {
        workerId: document.getElementById('edit-rule-worker').value || null,
        category: document.getElementById('edit-rule-category').value,
        matchType: document.getElementById('edit-rule-match-type').value,
        matchMode: document.getElementById('edit-rule-match-mode').value,
        pattern: document.getElementById('edit-rule-pattern').value,
        tags: tags
      };
      try {
        const res = await fetch('/api/rules/' + id, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) });
        if (res.ok) {
          hideModal('edit-rule-modal');
          showAlert('规则更新成功');
          loadRules();
        } else {
          const data = await res.json();
          showAlert(data.message || '更新失败', 'error');
        }
      } catch (e) { showAlert('更新失败', 'error'); }
    });

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
      const workerName = document.getElementById('log-worker-filter').value;
      const search = document.getElementById('log-search').value.trim();
      currentSearchTerm = search;
      const pageSize = parseInt(document.getElementById('log-page-size').value) || 50;
      const offset = (logCurrentPage - 1) * pageSize;
      let url = '/api/logs?limit=' + (pageSize + 1) + '&offset=' + offset;
      if (category) url += '&category=' + category;
      if (workerName) url += '&workerName=' + encodeURIComponent(workerName);
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
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999">暂无日志</td></tr>';
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
        const workerName = log.workerName || 'global';
        const workerDisplay = workerName === 'global' ? '<span class="tag" style="background:#e3f2fd;color:#1565c0;">全局</span>' : '<span class="tag">' + escapeHtml(workerName) + '</span>';
        const d = log.details || {};
        const subject = d.subject || '-';
        const from = d.from || '-';
        const to = d.to || '-';
        const rule = d.matchedRule || '-';
        return '<tr>' +
          '<td onclick="event.stopPropagation()"><input type="checkbox" class="log-checkbox" data-id="' + log.id + '" onchange="updateBatchDeleteBtn()"></td>' +
          '<td style="font-size:12px;color:#666;cursor:pointer" onclick="showLogDetail(' + idx + ')">' + time + '</td>' +
          '<td style="cursor:pointer" onclick="showLogDetail(' + idx + ')">' + workerDisplay + '</td>' +
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
      const workerName = log.workerName || 'global';
      const categoryNames = {email_forward:'转发',email_drop:'拦截',admin_action:'管理操作',system:'系统'};
      const content = 
        '<p><strong>时间:</strong> ' + time + '</p>' +
        '<p><strong>Worker 实例:</strong> ' + escapeHtml(workerName === 'global' ? '全局' : workerName) + '</p>' +
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
        const workerName = document.getElementById('stats-worker-filter').value;
        const statsUrl = workerName ? '/api/stats?workerName=' + encodeURIComponent(workerName) : '/api/stats';
        
        const [statsRes, rulesRes, workersRes, watchRes] = await Promise.all([
          fetch(statsUrl, { headers: getHeaders() }),
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
      const workerName = document.getElementById('trending-worker-filter').value;
      try {
        let url = '/api/stats/trending?hours=' + hours + '&limit=5';
        if (workerName) {
          url += '&workerName=' + encodeURIComponent(workerName);
        }
        const res = await fetch(url, { headers: getHeaders() });
        const data = await res.json();
        renderTrendingRules(data.trending || [], workerName);
      } catch (e) { console.error('Error loading trending rules:', e); }
    }

    function renderTrendingRules(rules, filterWorkerName) {
      const tbody = document.getElementById('trending-rules-table');
      if (rules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无拦截记录</td></tr>';
        return;
      }
      tbody.innerHTML = rules.map((r, idx) => {
        const lastSeen = r.lastSeen ? new Date(r.lastSeen).toLocaleString('zh-CN') : '-';
        const rankIcon = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1);
        // Render worker breakdown
        let breakdownHtml = '-';
        if (r.workerBreakdown && r.workerBreakdown.length > 0) {
          breakdownHtml = r.workerBreakdown.map(wb => 
            '<span class="tag" style="margin:2px;">' + escapeHtml(wb.workerName) + ': ' + wb.count + '</span>'
          ).join('');
        }
        return '<tr>' +
          '<td style="text-align:center;font-size:18px;">' + rankIcon + '</td>' +
          '<td>' + escapeHtml(r.pattern) + '</td>' +
          '<td style="font-size:18px;font-weight:bold;color:#e74c3c;text-align:center;">' + r.count + '</td>' +
          '<td style="font-size:12px;">' + breakdownHtml + '</td>' +
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
      loadTelegramConfig();
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

    // Telegram Configuration
    async function loadTelegramConfig() {
      if (!apiToken) return;
      try {
        const res = await fetch('/api/telegram/config', { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data.hasToken) {
            document.getElementById('telegram-bot-token').placeholder = '已配置 (输入新值覆盖)';
          }
          document.getElementById('telegram-chat-id').value = data.chatId || '';
          document.getElementById('telegram-enabled').value = data.enabled ? 'true' : 'false';
        }
      } catch (e) {
        console.error('Failed to load Telegram config', e);
      }
    }

    async function saveTelegramConfig() {
      const botToken = document.getElementById('telegram-bot-token').value;
      const chatId = document.getElementById('telegram-chat-id').value;
      const enabled = document.getElementById('telegram-enabled').value === 'true';
      
      try {
        const body = { chatId, enabled };
        if (botToken) body.botToken = botToken;
        
        const res = await fetch('/api/telegram/config', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(body)
        });
        if (res.ok) {
          showAlert('Telegram 配置已保存');
          document.getElementById('telegram-bot-token').value = '';
          loadTelegramConfig();
        } else {
          const data = await res.json();
          showAlert(data.error || '保存失败', 'error');
        }
      } catch (e) {
        showAlert('保存失败', 'error');
      }
    }

    async function testTelegramConfig() {
      const statusEl = document.getElementById('telegram-status');
      statusEl.innerHTML = '<span style="color:#666;">发送中...</span>';
      try {
        const res = await fetch('/api/telegram/test', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
          statusEl.innerHTML = '<span style="color:#27ae60;">✅ 测试消息发送成功！</span>';
        } else {
          statusEl.innerHTML = '<span style="color:#e74c3c;">❌ 发送失败: ' + escapeHtml(data.error || '未知错误') + '</span>';
        }
      } catch (e) {
        statusEl.innerHTML = '<span style="color:#e74c3c;">❌ 发送失败</span>';
      }
    }

    // Campaign Analytics
    let currentMerchantId = null;
    let merchantsData = [];
    let campaignsData = [];
    let projectsData = [];
    let workerMerchantsData = [];
    let currentProjectId = null;
    let currentProjectWorkerName = null;
    let currentProjectWorkerNames = null;

    async function loadCampaignAnalytics() {
      await loadProjects();
    }

    // Project status labels and colors
    const projectStatusLabels = { active: '进行中', completed: '已完成', archived: '已归档' };
    const projectStatusColors = {
      active: { bg: '#d4edda', text: '#155724', border: '#28a745' },
      completed: { bg: '#cce5ff', text: '#004085', border: '#007bff' },
      archived: { bg: '#e9ecef', text: '#495057', border: '#6c757d' }
    };

    // Current active project detail tab
    let activeProjectTab = 'root';
    let currentProjectRootId = null;

    function onWorkerFilterChange() {
      // Close project detail when switching instance
      closeProjectDetail();
      loadProjects();
      loadMerchantList();
    }

    function refreshCampaignData() {
      loadProjects();
      loadMerchantList();
    }

    async function loadProjects() {
      if (!apiToken) return;
      try {
        const workerName = document.getElementById('campaign-worker-filter')?.value || '';
        const statusFilter = document.getElementById('project-status-filter')?.value || '';
        let url = '/api/campaign/projects';
        const params = [];
        if (workerName) params.push('workerName=' + encodeURIComponent(workerName));
        if (statusFilter) params.push('status=' + encodeURIComponent(statusFilter));
        if (params.length > 0) url += '?' + params.join('&');
        
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        projectsData = data.projects || [];
        renderProjects();
      } catch (e) {
        console.error('Error loading projects:', e);
      }
    }

    function renderProjects() {
      const tbody = document.getElementById('projects-table');
      const emptyDiv = document.getElementById('projects-empty');
      const tableContainer = document.getElementById('projects-table-container');
      
      if (projectsData.length === 0) {
        emptyDiv.style.display = 'block';
        tableContainer.style.display = 'none';
        return;
      }
      
      emptyDiv.style.display = 'none';
      tableContainer.style.display = 'table';
      
      tbody.innerHTML = projectsData.map(p => {
        const status = p.status || 'active';
        const color = projectStatusColors[status] || projectStatusColors.active;
        const statusBadge = '<span style="background:' + color.bg + ';color:' + color.text + ';border:1px solid ' + color.border + ';padding:2px 8px;border-radius:4px;font-size:11px;">' + projectStatusLabels[status] + '</span>';
        const createdAt = new Date(p.createdAt).toLocaleDateString('zh-CN');
        const isSelected = currentProjectId === p.id;
        const rowStyle = isSelected ? 'background:#e3f2fd;' : '';
        
        // Format worker display
        let workerDisplay = p.workerName || '-';
        if (p.workerNames && p.workerNames.length > 1) {
          workerDisplay = p.workerNames.length + '个实例';
        }
        
        return '<tr style="' + rowStyle + '">' +
          '<td><strong style="cursor:pointer;color:#1565c0;" onclick="openProject(\\'' + p.id + '\\')">' + escapeHtml(p.name) + '</strong></td>' +
          '<td>' + escapeHtml(p.merchantDomain || '-') + '</td>' +
          '<td><span style="font-size:12px;color:#666;">' + escapeHtml(workerDisplay) + '</span></td>' +
          '<td>' + statusBadge + '</td>' +
          '<td>' + createdAt + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-primary" onclick="openProject(\\'' + p.id + '\\')">打开</button>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteProject(\\'' + p.id + '\\')">删除</button>' +
          '</td></tr>';
      }).join('');
    }

    // 区域2: 商户列表功能
    function showMerchantEmptyState(state) {
      // state: 'no-worker' | 'loading' | 'empty-data' | 'error' | 'hidden'
      const emptyDiv = document.getElementById('merchants-empty');
      const noWorkerPrompt = document.getElementById('merchants-no-worker-prompt');
      const loadingDiv = document.getElementById('merchants-loading');
      const emptyDataDiv = document.getElementById('merchants-empty-data');
      const errorDiv = document.getElementById('merchants-load-error');
      
      // Hide all states first
      noWorkerPrompt.style.display = 'none';
      loadingDiv.style.display = 'none';
      emptyDataDiv.style.display = 'none';
      errorDiv.style.display = 'none';
      
      if (state === 'hidden') {
        emptyDiv.style.display = 'none';
        return;
      }
      
      emptyDiv.style.display = 'block';
      
      switch (state) {
        case 'no-worker':
          noWorkerPrompt.style.display = 'block';
          break;
        case 'loading':
          loadingDiv.style.display = 'block';
          break;
        case 'empty-data':
          emptyDataDiv.style.display = 'block';
          break;
        case 'error':
          errorDiv.style.display = 'block';
          break;
      }
    }

    async function loadMerchantList() {
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      const tableContainer = document.getElementById('merchants-table-container');
      
      if (!apiToken) return;
      
      showMerchantEmptyState('loading');
      tableContainer.style.display = 'none';
      
      try {
        // If workerName is empty, load all merchants; otherwise load worker-specific merchants
        let url;
        if (workerName) {
          url = '/api/campaign/workers/' + encodeURIComponent(workerName) + '/merchants';
        } else {
          url = '/api/campaign/merchants';
        }
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        workerMerchantsData = data.merchants || [];
        renderMerchantList();
      } catch (e) {
        console.error('Error loading merchants:', e);
        showMerchantEmptyState('error');
        tableContainer.style.display = 'none';
      }
    }

    function renderMerchantList() {
      const tbody = document.getElementById('merchants-table');
      const tableContainer = document.getElementById('merchants-table-container');
      
      if (workerMerchantsData.length === 0) {
        showMerchantEmptyState('empty-data');
        tableContainer.style.display = 'none';
        return;
      }
      
      showMerchantEmptyState('hidden');
      tableContainer.style.display = 'table';
      
      // Sort merchants
      const sortField = document.getElementById('merchant-sort-field')?.value || 'emails';
      const sortOrder = document.getElementById('merchant-sort-order')?.value || 'desc';
      const sortedMerchants = [...workerMerchantsData].sort((a, b) => {
        const aVal = sortField === 'emails' ? a.totalEmails : a.totalCampaigns;
        const bVal = sortField === 'emails' ? b.totalEmails : b.totalCampaigns;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
      
      // Check which merchants have projects
      const merchantsWithProjects = new Set(projectsData.map(p => p.merchantId));
      
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      
      tbody.innerHTML = sortedMerchants.map(m => {
        const hasProject = merchantsWithProjects.has(m.id);
        const projectIndicator = hasProject ? '<span class="project-indicator" title="已有项目"></span>' : '';
        
        return '<tr>' +
          '<td><strong>' + escapeHtml(m.domain) + '</strong></td>' +
          '<td>' + m.totalCampaigns + '</td>' +
          '<td>' + m.totalEmails + '</td>' +
          '<td>' + projectIndicator + (hasProject ? '是' : '-') + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-primary" onclick="showMerchantPreview(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\', ' + m.totalCampaigns + ', ' + m.totalEmails + ')" style="margin-right:5px;">预览</button>' +
            '<button class="btn btn-sm btn-success" onclick="showCreateProjectModal(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\')">创建项目</button>' +
            (workerName ? '<button class="btn btn-sm btn-danger" onclick="showDeleteMerchantModal(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\', ' + m.totalEmails + ', ' + m.totalCampaigns + ')" style="margin-left:5px;">删除数据</button>' : '') +
          '</td></tr>';
      }).join('');
    }

    function sortMerchantList() {
      renderMerchantList();
    }

    // Store available workers for the modal
    let availableWorkers = [];

    function showCreateProjectModal(merchantId, merchantDomain) {
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      
      // Set modal values
      document.getElementById('create-project-merchant-id').value = merchantId;
      document.getElementById('create-project-merchant-domain').value = merchantDomain;
      document.getElementById('create-project-name').value = merchantDomain;
      document.getElementById('create-project-name-error').style.display = 'none';
      document.getElementById('create-project-worker-error').style.display = 'none';
      
      // Populate worker options from the main filter
      const mainFilter = document.getElementById('campaign-worker-filter');
      const workerSelect = document.getElementById('create-project-worker');
      const multiWorkerDiv = document.getElementById('create-project-multi-worker');
      
      availableWorkers = [];
      workerSelect.innerHTML = '<option value="">请选择实例</option>';
      multiWorkerDiv.innerHTML = '';
      
      Array.from(mainFilter.options).forEach(opt => {
        if (opt.value) {
          availableWorkers.push({ value: opt.value, text: opt.text });
          workerSelect.innerHTML += '<option value="' + opt.value + '">' + opt.text + '</option>';
          multiWorkerDiv.innerHTML += '<label style="display:block;padding:4px 0;cursor:pointer;">' +
            '<input type="checkbox" class="multi-worker-checkbox" value="' + opt.value + '" style="margin-right:8px;">' +
            opt.text + '</label>';
        }
      });
      
      // Set default mode based on current filter
      if (workerName) {
        // Pre-select the current worker
        document.querySelector('input[name="worker-mode"][value="single"]').checked = true;
        workerSelect.value = workerName;
      } else {
        document.querySelector('input[name="worker-mode"][value="single"]').checked = true;
      }
      
      updateWorkerSelectionMode();
      showModal('create-project-modal');
    }

    function updateWorkerSelectionMode() {
      const mode = document.querySelector('input[name="worker-mode"]:checked')?.value || 'single';
      const singleDiv = document.getElementById('create-project-single-worker');
      const multiDiv = document.getElementById('create-project-multi-worker');
      
      if (mode === 'single') {
        singleDiv.style.display = 'block';
        multiDiv.style.display = 'none';
      } else if (mode === 'multiple') {
        singleDiv.style.display = 'none';
        multiDiv.style.display = 'block';
        // Uncheck all checkboxes
        document.querySelectorAll('.multi-worker-checkbox').forEach(cb => cb.checked = false);
      } else if (mode === 'all') {
        singleDiv.style.display = 'none';
        multiDiv.style.display = 'block';
        // Check all checkboxes
        document.querySelectorAll('.multi-worker-checkbox').forEach(cb => cb.checked = true);
      }
    }

    function getSelectedWorkers() {
      const mode = document.querySelector('input[name="worker-mode"]:checked')?.value || 'single';
      
      if (mode === 'single') {
        const workerName = document.getElementById('create-project-worker')?.value || '';
        return workerName ? { workerName, workerNames: null } : null;
      } else {
        const checkboxes = document.querySelectorAll('.multi-worker-checkbox:checked');
        const workerNames = Array.from(checkboxes).map(cb => cb.value);
        if (workerNames.length === 0) return null;
        // Use first worker as primary workerName for backward compatibility
        return { workerName: workerNames[0], workerNames };
      }
    }

    // Project name validation function
    function validateProjectName(name) {
      if (!name || typeof name !== 'string') return false;
      return name.trim().length > 0;
    }

    // Handle project creation form submission
    document.getElementById('create-project-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const merchantId = document.getElementById('create-project-merchant-id').value;
      const name = document.getElementById('create-project-name').value;
      const errorEl = document.getElementById('create-project-name-error');
      const workerErrorEl = document.getElementById('create-project-worker-error');
      
      // Validate project name
      if (!validateProjectName(name)) {
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      
      // Get selected workers
      const selectedWorkers = getSelectedWorkers();
      if (!selectedWorkers) {
        if (workerErrorEl) workerErrorEl.style.display = 'block';
        return;
      }
      if (workerErrorEl) workerErrorEl.style.display = 'none';
      
      try {
        const requestBody = { 
          name: name.trim(), 
          merchantId, 
          workerName: selectedWorkers.workerName
        };
        // Only include workerNames if multiple workers selected
        if (selectedWorkers.workerNames && selectedWorkers.workerNames.length > 1) {
          requestBody.workerNames = selectedWorkers.workerNames;
        }
        
        const res = await fetch('/api/campaign/projects', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(requestBody)
        });
        if (res.ok) {
          hideModal('create-project-modal');
          showAlert('项目创建成功');
          const data = await res.json();
          await loadProjects();
          await loadMerchantList();
          // Auto-select the newly created project
          // API returns the project object directly, not wrapped in { project: ... }
          if (data && data.id) {
            openProject(data.id);
          }
        } else {
          const err = await res.json();
          showAlert('创建失败: ' + (err.message || '未知错误'), 'error');
        }
      } catch (e) {
        showAlert('创建失败', 'error');
      }
    });

    // Legacy function for backward compatibility
    async function loadWorkerMerchants() {
      await loadMerchantList();
    }

    function renderWorkerMerchants(workerName) {
      renderMerchantList();
    }

    async function createProject(merchantId, merchantDomain) {
      // This function is now deprecated, use showCreateProjectModal instead
      showCreateProjectModal(merchantId, merchantDomain);
    }

    async function editProject(projectId) {
      const project = projectsData.find(p => p.id === projectId);
      if (!project) return;
      
      const newName = prompt('请输入新的项目名称:', project.name);
      if (newName === null) return;
      
      try {
        const res = await fetch('/api/campaign/projects/' + projectId, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ name: newName })
        });
        if (res.ok) {
          showAlert('项目已更新');
          await loadProjects();
        } else {
          showAlert('更新失败', 'error');
        }
      } catch (e) {
        showAlert('更新失败', 'error');
      }
    }

    async function deleteProject(projectId) {
      if (!confirm('确定要删除此项目吗？此操作不可恢复！')) return;
      
      try {
        const res = await fetch('/api/campaign/projects/' + projectId, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          showAlert('项目已删除');
          // Clear selection if the deleted project was selected
          if (currentProjectId === projectId) {
            closeProjectDetail();
          }
          await loadProjects();
          await loadMerchantList(); // Refresh merchant list to update project indicators
        } else {
          showAlert('删除失败', 'error');
        }
      } catch (e) {
        showAlert('删除失败', 'error');
      }
    }

    // Show merchant preview modal with campaigns list
    async function showMerchantPreview(merchantId, merchantDomain, totalCampaigns, totalEmails) {
      // Set header info
      document.getElementById('preview-merchant-domain').textContent = merchantDomain;
      document.getElementById('preview-total-campaigns').textContent = totalCampaigns;
      document.getElementById('preview-total-emails').textContent = totalEmails;
      
      // Show loading state
      document.getElementById('preview-campaigns-loading').style.display = 'block';
      document.getElementById('preview-campaigns-list').style.display = 'none';
      document.getElementById('preview-campaigns-empty').style.display = 'none';
      
      showModal('merchant-preview-modal');
      
      try {
        const workerName = document.getElementById('campaign-worker-filter')?.value || '';
        let url = '/api/campaign/campaigns?merchantId=' + encodeURIComponent(merchantId) + '&sortBy=totalEmails&sortOrder=desc&limit=50';
        if (workerName) {
          url += '&workerName=' + encodeURIComponent(workerName);
        }
        
        const res = await fetch(url, { headers: getHeaders() });
        
        if (res.ok) {
          const data = await res.json();
          const campaigns = data.campaigns || [];
          
          document.getElementById('preview-campaigns-loading').style.display = 'none';
          
          if (campaigns.length === 0) {
            document.getElementById('preview-campaigns-empty').style.display = 'block';
          } else {
            document.getElementById('preview-campaigns-list').style.display = 'block';
            const tbody = document.getElementById('preview-campaigns-tbody');
            tbody.innerHTML = campaigns.map(c => {
              return '<tr>' +
                '<td style="padding:8px 10px;border-bottom:1px solid #eee;word-break:break-word;">' + escapeHtml(c.subject) + '</td>' +
                '<td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">' + c.totalEmails + '</td>' +
                '</tr>';
            }).join('');
          }
        } else {
          document.getElementById('preview-campaigns-loading').style.display = 'none';
          document.getElementById('preview-campaigns-empty').style.display = 'block';
          document.getElementById('preview-campaigns-empty').textContent = '加载失败';
        }
      } catch (e) {
        console.error('Error loading merchant campaigns:', e);
        document.getElementById('preview-campaigns-loading').style.display = 'none';
        document.getElementById('preview-campaigns-empty').style.display = 'block';
        document.getElementById('preview-campaigns-empty').textContent = '加载失败';
      }
    }

    // Show delete merchant data confirmation modal
    function showDeleteMerchantModal(merchantId, merchantDomain, emailCount, campaignCount) {
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      if (!workerName) {
        showAlert('请先选择实例', 'error');
        return;
      }
      
      // Set modal values
      document.getElementById('delete-merchant-id').value = merchantId;
      document.getElementById('delete-merchant-domain').textContent = merchantDomain;
      document.getElementById('delete-merchant-worker').textContent = workerName;
      document.getElementById('delete-merchant-emails').textContent = emailCount;
      document.getElementById('delete-merchant-campaigns').textContent = campaignCount;
      
      showModal('delete-merchant-modal');
    }

    // Confirm and execute merchant data deletion
    async function confirmDeleteMerchantData() {
      const merchantId = document.getElementById('delete-merchant-id').value;
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      
      if (!merchantId || !workerName) {
        showAlert('参数错误', 'error');
        return;
      }
      
      try {
        const res = await fetch('/api/campaign/merchants/' + encodeURIComponent(merchantId) + '/data?workerName=' + encodeURIComponent(workerName), {
          method: 'DELETE',
          headers: getHeaders()
        });
        
        if (res.ok) {
          const data = await res.json();
          const result = data.result;
          
          hideModal('delete-merchant-modal');
          
          // Show deletion result
          let message = '删除成功！\\n';
          message += '- 删除邮件数: ' + result.emailsDeleted + '\\n';
          message += '- 删除路径数: ' + result.pathsDeleted + '\\n';
          message += '- 影响活动数: ' + result.campaignsAffected;
          if (result.merchantDeleted) {
            message += '\\n- 商户记录已删除（无其他 Worker 数据）';
          }
          
          showAlert(message);
          
          // Refresh merchant list and projects
          await loadMerchantList();
          await loadProjects();
        } else {
          const err = await res.json();
          showAlert('删除失败: ' + (err.message || err.error || '未知错误'), 'error');
        }
      } catch (e) {
        console.error('Error deleting merchant data:', e);
        showAlert('删除失败', 'error');
      }
    }

    async function openProject(projectId) {
      const project = projectsData.find(p => p.id === projectId);
      if (!project) return;
      
      currentProjectId = projectId;
      currentMerchantId = project.merchantId;
      currentProjectRootId = project.rootCampaignId || null;
      currentProjectWorkerName = project.workerName || null;
      // Use workerNames array if available, otherwise fall back to single workerName
      currentProjectWorkerNames = project.workerNames && project.workerNames.length > 0 
        ? project.workerNames 
        : (project.workerName ? [project.workerName] : null);
      
      // Update project detail title
      document.getElementById('project-detail-title').textContent = '项目详情 - ' + project.name;
      
      // Update project info summary
      document.getElementById('project-info-merchant').textContent = project.merchantDomain || '-';
      
      // Display worker list
      let workerDisplay = project.workerName || '-';
      if (project.workerNames && project.workerNames.length > 0) {
        if (project.workerNames.length === 1) {
          workerDisplay = project.workerNames[0];
        } else {
          workerDisplay = project.workerNames.join(', ') + ' (' + project.workerNames.length + '个)';
        }
      }
      document.getElementById('project-info-workers').textContent = workerDisplay;
      
      // Display status
      const statusLabels = { active: '进行中', completed: '已完成', archived: '已归档' };
      document.getElementById('project-info-status').textContent = statusLabels[project.status] || project.status;
      
      // Show project detail section
      document.getElementById('campaign-project-detail-section').style.display = 'block';
      
      // Re-render projects to show selection
      renderProjects();
      
      // Switch to default tab (root) and load data
      switchProjectTab('root');
    }

    function closeProjectDetail() {
      currentProjectId = null;
      currentMerchantId = null;
      currentProjectRootId = null;
      currentProjectWorkerName = null;
      currentProjectWorkerNames = null;
      
      // Hide project detail section
      document.getElementById('campaign-project-detail-section').style.display = 'none';
      
      // Re-render projects to clear selection
      renderProjects();
    }

    function switchProjectTab(tabName) {
      activeProjectTab = tabName;
      
      // Update tab button styles
      document.querySelectorAll('.project-tab').forEach(btn => {
        btn.classList.remove('active');
        btn.style.color = '#666';
        btn.style.borderBottomColor = 'transparent';
      });
      const activeBtn = document.getElementById('tab-' + tabName);
      if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.color = '#4a90d9';
        activeBtn.style.borderBottomColor = '#4a90d9';
      }
      
      // Hide all tab panels
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.style.display = 'none';
      });
      
      // Show selected tab panel
      const activePanel = document.getElementById('tab-content-' + tabName);
      if (activePanel) {
        activePanel.style.display = 'block';
      }
      
      // Load data for the selected tab
      if (tabName === 'root') {
        loadRootCampaigns();
      } else if (tabName === 'campaigns') {
        loadProjectCampaigns();
      } else if (tabName === 'path') {
        loadPathAnalysis();
      }
    }

    async function loadRootCampaigns() {
      if (!currentMerchantId) {
        const emptyDiv = document.getElementById('root-campaigns-empty');
        if (emptyDiv) {
          emptyDiv.style.display = 'block';
          emptyDiv.textContent = '无法加载：请先选择一个项目';
        }
        return;
      }
      
      const emptyDiv = document.getElementById('root-campaigns-empty');
      const tableContainer = document.getElementById('root-campaigns-table-container');
      const currentRootDiv = document.getElementById('root-current');
      
      emptyDiv.style.display = 'block';
      emptyDiv.textContent = '加载中...';
      tableContainer.style.display = 'none';
      
      try {
        // Use project's workerName for instance filtering
        const workerName = currentProjectWorkerName || '';
        const workerParam = workerName ? '?workerName=' + encodeURIComponent(workerName) : '';
        const res = await fetch('/api/campaign/merchants/' + currentMerchantId + '/root-campaigns' + workerParam, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const rootCampaigns = data.rootCampaigns || [];
        
        // Find current root (isConfirmed = true)
        const confirmedRoot = rootCampaigns.find(c => c.isConfirmed);
        if (confirmedRoot) {
          currentProjectRootId = confirmedRoot.campaignId;
          currentRootDiv.style.display = 'block';
          document.getElementById('root-current-name').textContent = confirmedRoot.subject || '未知主题';
        } else {
          currentProjectRootId = null;
          currentRootDiv.style.display = 'none';
        }
        
        if (rootCampaigns.length === 0) {
          emptyDiv.textContent = '该商户暂无 Root 候选活动。请先在"营销活动"标签页中查看活动列表。';
          return;
        }
        
        emptyDiv.style.display = 'none';
        tableContainer.style.display = 'table';
        
        const tbody = document.getElementById('root-campaigns-table');
        tbody.innerHTML = rootCampaigns.map(c => {
          const isRoot = c.isConfirmed;
          const statusBadge = isRoot 
            ? '<span class="root-badge">当前 Root</span>' 
            : (c.isCandidate ? '<span style="color:#666;font-size:11px;">候选: ' + escapeHtml(c.candidateReason || '系统推荐') + '</span>' : '-');
          const actionBtn = isRoot 
            ? '<button class="btn btn-sm btn-secondary" disabled>已选中</button>'
            : '<button class="btn btn-sm btn-primary" onclick="setAsRoot(\\'' + c.campaignId + '\\')">设为 Root</button>';
          
          return '<tr style="' + (isRoot ? 'background:#e8f5e9;' : '') + '">' +
            '<td>' + escapeHtml(c.subject || '未知主题') + '</td>' +
            '<td>' + (c.newUserCount || 0) + '</td>' +
            '<td>' + (c.isConfirmed ? '已确认' : (c.isCandidate ? '候选' : '-')) + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td class="actions">' + actionBtn + '</td></tr>';
        }).join('');
      } catch (e) {
        console.error('Error loading root campaigns:', e);
        emptyDiv.textContent = '加载失败，请重试。';
      }
    }

    async function detectRootCandidatesForProject() {
      if (!currentMerchantId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      try {
        const res = await fetch('/api/campaign/merchants/' + currentMerchantId + '/detect-root-candidates', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        if (res.ok) {
          const data = await res.json();
          showAlert('检测到 ' + data.candidatesDetected + ' 个候选活动');
          loadRootCampaigns();
        } else {
          showAlert('检测失败', 'error');
        }
      } catch (e) {
        console.error('Error detecting root candidates:', e);
        showAlert('检测失败', 'error');
      }
    }

    async function setAsRoot(campaignId) {
      if (!currentMerchantId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      try {
        // First, unset any existing root for this merchant
        // Then set the new root
        const res = await fetch('/api/campaign/campaigns/' + campaignId + '/root', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ isRoot: true })
        });
        
        if (res.ok) {
          currentProjectRootId = campaignId;
          showAlert('Root 设置成功');
          loadRootCampaigns();
        } else {
          const errorData = await res.json().catch(() => ({}));
          showAlert(errorData.message || '设置失败', 'error');
        }
      } catch (e) {
        console.error('Error setting root:', e);
        showAlert('设置失败', 'error');
      }
    }

    async function loadProjectCampaigns() {
      if (!currentMerchantId) return;
      
      const emptyDiv = document.getElementById('campaigns-empty');
      const tableContainer = document.getElementById('campaigns-table-container');
      
      emptyDiv.style.display = 'block';
      emptyDiv.textContent = '加载中...';
      tableContainer.style.display = 'none';
      
      try {
        const valueFilter = document.getElementById('campaign-valuable-filter')?.value || '';
        // Use project's workerName instead of the page filter
        const workerName = currentProjectWorkerName || '';
        let url = '/api/campaign/campaigns?merchantId=' + currentMerchantId;
        if (valueFilter) url += '&tag=' + valueFilter;
        if (workerName) url += '&workerName=' + encodeURIComponent(workerName);
        
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        campaignsData = data.campaigns || [];
        
        if (campaignsData.length === 0) {
          emptyDiv.textContent = '该商户暂无营销活动数据。';
          return;
        }
        
        emptyDiv.style.display = 'none';
        tableContainer.style.display = 'table';
        renderProjectCampaigns();
      } catch (e) {
        console.error('Error loading campaigns:', e);
        emptyDiv.textContent = '加载失败，请重试。';
      }
    }

    function renderProjectCampaigns() {
      const tbody = document.getElementById('campaigns-table');
      const sortField = document.getElementById('campaign-sort-field')?.value || 'emails';
      
      const sortedCampaigns = [...campaignsData].sort((a, b) => {
        if (sortField === 'emails') {
          return (b.totalEmails || b.emailCount || 0) - (a.totalEmails || a.emailCount || 0);
        } else {
          return new Date(b.firstSeenAt || b.firstSeen || 0) - new Date(a.firstSeenAt || a.firstSeen || 0);
        }
      });
      
      tbody.innerHTML = sortedCampaigns.map(c => {
        const tag = c.tag || 0;
        const tagLabels = { 0: '未标记', 1: '有价值', 2: '高价值' };
        const tagClasses = { 0: 'value-tag-0', 1: 'value-tag-1', 2: 'value-tag-2' };
        const tagBadge = '<span class="' + tagClasses[tag] + '" style="padding:2px 8px;border-radius:4px;font-size:11px;">' + tagLabels[tag] + '</span>';
        const firstSeen = (c.firstSeenAt || c.firstSeen) ? new Date(c.firstSeenAt || c.firstSeen).toLocaleDateString('zh-CN') : '-';
        
        return '<tr style="cursor:pointer;" onclick="showCampaignDetail(\\'' + c.id + '\\')">' +
          '<td>' + escapeHtml(c.subject || '未知主题') + '</td>' +
          '<td>' + (c.totalEmails || c.emailCount || 0) + '</td>' +
          '<td>' + (c.uniqueRecipients || c.recipientCount || 0) + '</td>' +
          '<td>' + tagBadge + '</td>' +
          '<td>' + firstSeen + '</td>' +
          '<td class="actions" onclick="event.stopPropagation()">' +
            '<button class="btn btn-sm btn-success" onclick="tagCampaign(\\'' + c.id + '\\', 1)">标记有价值</button>' +
            '<button class="btn btn-sm btn-warning" onclick="tagCampaign(\\'' + c.id + '\\', 2)">标记高价值</button>' +
          '</td></tr>';
      }).join('');
    }

    function sortCampaignList() {
      renderProjectCampaigns();
    }

    async function showCampaignDetail(campaignId) {
      const contentDiv = document.getElementById('campaign-detail-content');
      contentDiv.innerHTML = '<p style="text-align:center;color:#999;">加载中...</p>';
      showModal('campaign-detail-modal');
      
      try {
        const res = await fetch('/api/campaign/campaigns/' + campaignId, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const campaign = await res.json();
        
        const tag = campaign.tag || 0;
        const tagLabels = { 0: '未标记', 1: '有价值', 2: '高价值', 3: '一般营销', 4: '可忽略' };
        const tagClasses = { 0: 'value-tag-0', 1: 'value-tag-1', 2: 'value-tag-2', 3: 'value-tag-0', 4: 'value-tag-0' };
        const firstSeen = campaign.firstSeenAt ? new Date(campaign.firstSeenAt).toLocaleString('zh-CN') : '-';
        const lastSeen = campaign.lastSeenAt ? new Date(campaign.lastSeenAt).toLocaleString('zh-CN') : '-';
        
        let content = '<div style="margin-bottom:16px;">' +
          '<p><strong>邮件主题:</strong></p>' +
          '<p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;">' + escapeHtml(campaign.subject || '未知主题') + '</p>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
          '<div class="stat-card" style="padding:12px;"><div class="stat-value" style="font-size:20px;">' + (campaign.totalEmails || 0) + '</div><div class="stat-label">邮件总数</div></div>' +
          '<div class="stat-card" style="padding:12px;"><div class="stat-value" style="font-size:20px;">' + (campaign.uniqueRecipients || 0) + '</div><div class="stat-label">收件人数</div></div>' +
          '</div>' +
          '<div style="margin-bottom:16px;">' +
          '<p><strong>价值标记:</strong> <span class="' + tagClasses[tag] + '" style="padding:2px 8px;border-radius:4px;font-size:11px;">' + tagLabels[tag] + '</span></p>' +
          '</div>' +
          '<div style="margin-bottom:16px;">' +
          '<p><strong>首次出现:</strong> ' + firstSeen + '</p>' +
          '<p><strong>最后出现:</strong> ' + lastSeen + '</p>' +
          '</div>';
        
        // Show recipient stats if available
        if (campaign.recipientStats && campaign.recipientStats.length > 0) {
          content += '<div style="margin-bottom:16px;">' +
            '<p><strong>收件人统计 (前10):</strong></p>' +
            '<table style="width:100%;font-size:12px;margin-top:8px;">' +
            '<thead><tr><th>收件人</th><th>邮件数</th></tr></thead>' +
            '<tbody>' +
            campaign.recipientStats.slice(0, 10).map(r => 
              '<tr><td>' + escapeHtml(r.recipient || '-') + '</td><td>' + (r.count || 0) + '</td></tr>'
            ).join('') +
            '</tbody></table>' +
            '</div>';
        }
        
        // Tag buttons
        content += '<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid #eee;">' +
          '<button class="btn btn-sm btn-secondary" onclick="tagCampaignFromDetail(\\'' + campaignId + '\\', 0)">清除标记</button>' +
          '<button class="btn btn-sm btn-success" onclick="tagCampaignFromDetail(\\'' + campaignId + '\\', 1)">标记有价值</button>' +
          '<button class="btn btn-sm btn-warning" onclick="tagCampaignFromDetail(\\'' + campaignId + '\\', 2)">标记高价值</button>' +
          '</div>';
        
        contentDiv.innerHTML = content;
      } catch (e) {
        console.error('Error loading campaign detail:', e);
        contentDiv.innerHTML = '<p style="text-align:center;color:#e74c3c;">加载失败，请重试。</p>';
      }
    }

    async function tagCampaignFromDetail(campaignId, tagValue) {
      try {
        const res = await fetch('/api/campaign/campaigns/' + campaignId + '/tag', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ tag: tagValue })
        });
        
        if (res.ok) {
          showAlert('标记成功');
          hideModal('campaign-detail-modal');
          loadProjectCampaigns();
        } else {
          showAlert('标记失败', 'error');
        }
      } catch (e) {
        showAlert('标记失败', 'error');
      }
    }

    async function tagCampaign(campaignId, tagValue) {
      try {
        const res = await fetch('/api/campaign/campaigns/' + campaignId + '/tag', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ tag: tagValue })
        });
        
        if (res.ok) {
          showAlert('标记成功');
          loadProjectCampaigns();
        } else {
          showAlert('标记失败', 'error');
        }
      } catch (e) {
        showAlert('标记失败', 'error');
      }
    }

    async function loadPathAnalysis() {
      const noRootDiv = document.getElementById('path-no-root');
      const analysisContainer = document.getElementById('path-analysis-container');
      const flowContainer = document.getElementById('path-flow-container');
      
      if (!currentProjectRootId) {
        noRootDiv.style.display = 'block';
        analysisContainer.style.display = 'none';
        return;
      }
      
      noRootDiv.style.display = 'none';
      analysisContainer.style.display = 'block';
      flowContainer.innerHTML = '加载中...';
      
      try {
        // Use project's workerNames for multi-worker filtering (Requirements: 4.1, 4.2, 4.3, 4.4, 4.5)
        let url = '/api/campaign/merchants/' + currentMerchantId + '/path-analysis';
        if (currentProjectWorkerNames && currentProjectWorkerNames.length > 0) {
          url += '?workerNames=' + encodeURIComponent(currentProjectWorkerNames.join(','));
        }
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        renderProjectPathAnalysis(data);
      } catch (e) {
        console.error('Error loading path analysis:', e);
        flowContainer.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">加载失败，请重试。</div>';
      }
    }

    function renderProjectPathAnalysis(data) {
      const flowContainer = document.getElementById('path-flow-container');
      
      // Check if data is valid
      if (!data || !data.userStats) {
        flowContainer.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">暂无路径数据。</div>';
        return;
      }
      
      // Helper function to get tag marker based on tag value
      // tag=1: green ★ (valuable), tag=2: gold ★★ (high-value)
      function getTagMarker(tag, isValuable) {
        if (tag === 2) return ' <span style="color:#ffc107;font-weight:500;">★★ 高价值</span>';
        if (tag === 1 || isValuable) return ' <span style="color:#27ae60;font-weight:500;">★ 有价值</span>';
        return '';
      }
      
      // Helper function to get tag marker for tree nodes (shorter version)
      function getTreeTagMarker(tag, isValuable) {
        if (tag === 2) return ' <span style="color:#ffc107;">★★</span>';
        if (tag === 1 || isValuable) return ' <span style="color:#27ae60;">★</span>';
        return '';
      }
      
      // Helper function to get highlight class based on tag
      function getHighlightClass(tag, isValuable) {
        if (tag === 2) return 'highlighted high-value';
        if (tag === 1 || isValuable) return 'highlighted';
        return '';
      }
      
      let html = '';
      
      // User Stats Section
      html += '<div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h4 style="margin:0 0 10px 0;font-size:13px;color:#1565c0;">📊 用户统计</h4>';
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">';
      html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#1565c0;">' + (data.userStats.totalRecipients || 0) + '</div><div style="font-size:11px;color:#666;">总收件人</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#28a745;">' + (data.userStats.newUsers || 0) + '</div><div style="font-size:11px;color:#666;">新用户</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#ff9800;">' + (data.userStats.oldUsers || 0) + '</div><div style="font-size:11px;color:#666;">老用户</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#9c27b0;">' + (data.userStats.newUserPercentage || 0).toFixed(1) + '%</div><div style="font-size:11px;color:#666;">新用户比例</div></div>';
      html += '</div></div>';
      
      // Level Stats Section - Path Nodes (no level limit - show all levels)
      html += '<div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h4 style="margin:0 0 10px 0;font-size:13px;color:#7b1fa2;">📈 活动层级 (基于新用户路径)</h4>';
      
      if (data.levelStats && data.levelStats.length > 0) {
        // Group by level - no limit on number of levels
        const levelGroups = {};
        data.levelStats.forEach(ls => {
          if (!levelGroups[ls.level]) levelGroups[ls.level] = [];
          levelGroups[ls.level].push(ls);
        });
        
        // Sort levels numerically and display all of them
        Object.keys(levelGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(level => {
          html += '<div style="margin-bottom:12px;">';
          html += '<div style="font-size:12px;font-weight:600;color:#7b1fa2;margin-bottom:6px;">第 ' + level + ' 层</div>';
          
          levelGroups[level].forEach(node => {
            const highlightClass = getHighlightClass(node.tag, node.isValuable);
            const percentage = node.coverage ? node.coverage.toFixed(1) + '%' : '-';
            const tagMarker = getTagMarker(node.tag, node.isValuable);
            
            html += '<div class="path-node ' + highlightClass + '">';
            html += '<div class="path-node-title">' + escapeHtml(node.subject || '未知主题');
            if (node.isRoot) html += ' <span style="color:#e65100;">🎯 Root</span>';
            html += '</div>';
            html += '<div class="path-node-stats">';
            html += '收件人: ' + (node.userCount || 0) + ' | ';
            html += '覆盖率: ' + percentage;
            html += tagMarker;
            html += '</div>';
            html += '</div>';
          });
          
          html += '</div>';
        });
      } else {
        html += '<div style="text-align:center;color:#999;padding:20px;">暂无层级数据</div>';
      }
      html += '</div>';
      
      // Transitions Section - Tree View (no depth limit)
      html += '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:15px;">';
      html += '<h4 style="margin:0 0 10px 0;font-size:13px;color:#2e7d32;">🔄 新用户转移路径</h4>';
      
      if (data.transitions && data.transitions.length > 0) {
        // Build tree structure from transitions
        const transitionMap = {};
        const allTargets = new Set();
        
        data.transitions.forEach(t => {
          if (!transitionMap[t.fromCampaignId]) {
            transitionMap[t.fromCampaignId] = {
              subject: t.fromSubject,
              isValuable: t.fromIsValuable,
              tag: t.fromTag,
              children: []
            };
          }
          transitionMap[t.fromCampaignId].children.push({
            campaignId: t.toCampaignId,
            subject: t.toSubject,
            isValuable: t.toIsValuable,
            tag: t.toTag,
            userCount: t.userCount,
            ratio: t.transitionRatio
          });
          allTargets.add(t.toCampaignId);
        });
        
        // Find root nodes (nodes that are not targets of any transition)
        const rootNodes = Object.keys(transitionMap).filter(id => !allTargets.has(id));
        
        // If no clear roots, use nodes with most outgoing transitions
        if (rootNodes.length === 0) {
          const sortedNodes = Object.entries(transitionMap)
            .sort((a, b) => b[1].children.length - a[1].children.length);
          if (sortedNodes.length > 0) rootNodes.push(sortedNodes[0][0]);
        }
        
        // Track visited nodes to prevent infinite loops
        const visited = new Set();
        
        // Render tree recursively - no depth limit
        function renderTreeNode(campaignId, depth) {
          if (!transitionMap[campaignId] || visited.has(campaignId)) return '';
          visited.add(campaignId);
          
          const node = transitionMap[campaignId];
          let nodeHtml = '';
          
          node.children.sort((a, b) => b.userCount - a.userCount).forEach((child, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const prefix = depth > 0 ? '│'.repeat(depth - 1) + (isLast ? '└' : '├') : '';
            const bgColor = child.ratio >= 50 ? '#c8e6c9' : (child.ratio >= 20 ? '#fff9c4' : 'transparent');
            const tagMarker = getTreeTagMarker(child.tag, child.isValuable);
            
            nodeHtml += '<div style="padding:3px 0;font-size:12px;font-family:monospace;background:' + bgColor + ';border-radius:3px;margin:2px 0;">';
            nodeHtml += '<span style="color:#999;">' + prefix + '→ </span>';
            nodeHtml += '<span style="color:#333;">' + escapeHtml(child.subject.substring(0, 35)) + '</span>' + tagMarker;
            nodeHtml += '<span style="color:#2e7d32;font-weight:bold;margin-left:8px;">' + child.userCount + '人</span>';
            nodeHtml += '<span style="color:#666;margin-left:5px;">(' + child.ratio.toFixed(1) + '%)</span>';
            nodeHtml += '</div>';
            
            // Recursively render children - no depth limit
            nodeHtml += renderTreeNode(child.campaignId, depth + 1);
          });
          
          return nodeHtml;
        }
        
        // Render from each root
        rootNodes.forEach(rootId => {
          const rootNode = transitionMap[rootId];
          if (rootNode) {
            const rootTagMarker = getTreeTagMarker(rootNode.tag, rootNode.isValuable);
            html += '<div style="margin-bottom:10px;padding:10px;background:#fff;border-radius:6px;border:1px solid #c8e6c9;">';
            html += '<div style="font-weight:bold;font-size:12px;color:#1b5e20;margin-bottom:6px;">🎯 ' + escapeHtml(rootNode.subject.substring(0, 40)) + rootTagMarker + '</div>';
            visited.clear(); // Clear visited for each root tree
            html += renderTreeNode(rootId, 0);
            html += '</div>';
          }
        });
        
        html += '<p style="color:#888;font-size:10px;margin-top:8px;margin-bottom:0;">💡 绿色背景=主路径(≥50%) | 黄色背景=次级路径(≥20%) | <span style="color:#27ae60;">★</span>=有价值 | <span style="color:#ffc107;">★★</span>=高价值</p>';
      } else {
        html += '<div style="text-align:center;color:#999;padding:20px;">暂无转移数据</div>';
      }
      html += '</div>';
      
      flowContainer.innerHTML = html;
    }

    async function recalculatePathsForProject() {
      if (!currentMerchantId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      // Use currentProjectWorkerNames for multi-worker support (Requirements: 4.6)
      const workerNames = currentProjectWorkerNames || [];
      const confirmMsg = workerNames.length > 0
        ? '确定要重新分析实例 "' + workerNames.join(', ') + '" 的路径数据吗？这将删除现有路径并重新计算。'
        : '确定要重新分析所有实例的路径数据吗？这将删除现有路径并重新计算。';
      
      if (!confirm(confirmMsg)) return;
      
      const flowContainer = document.getElementById('path-flow-container');
      flowContainer.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">正在重新分析路径...</div>';
      
      try {
        const res = await fetch('/api/campaign/merchants/' + currentMerchantId + '/rebuild-paths', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ workerNames: workerNames.length > 0 ? workerNames : undefined })
        });
        
        if (res.ok) {
          const data = await res.json();
          showAlert('路径重建完成: 删除 ' + data.pathsDeleted + ' 条旧路径, 创建 ' + data.pathsCreated + ' 条新路径, 处理 ' + data.recipientsProcessed + ' 个收件人', 'success');
          await loadPathAnalysis();
        } else {
          const error = await res.json();
          showAlert('重建失败: ' + (error.error || '未知错误'), 'error');
          await loadPathAnalysis();
        }
      } catch (e) {
        console.error('Error rebuilding paths:', e);
        showAlert('重建失败', 'error');
        await loadPathAnalysis();
      }
    }

    async function cleanupOldCustomersForProject() {
      if (!currentMerchantId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      // Use currentProjectWorkerNames for multi-worker support (Requirements: 4.6)
      const workerNames = currentProjectWorkerNames || [];
      const confirmMsg = workerNames.length > 0
        ? '确定要清理实例 "' + workerNames.join(', ') + '" 中老客户的路径数据吗？此操作将删除非 Root 起始用户的路径记录。'
        : '确定要清理所有实例中老客户的路径数据吗？此操作将删除非 Root 起始用户的路径记录。';
      
      if (!confirm(confirmMsg)) return;
      
      const flowContainer = document.getElementById('path-flow-container');
      flowContainer.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">正在清理老客户数据...</div>';
      
      try {
        const res = await fetch('/api/campaign/merchants/' + currentMerchantId + '/cleanup-old-customers', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ workerNames: workerNames.length > 0 ? workerNames : undefined })
        });
        
        if (res.ok) {
          const data = await res.json();
          showAlert('清理完成: 删除 ' + data.pathsDeleted + ' 条老客户路径, 影响 ' + data.recipientsAffected + ' 个收件人', 'success');
          await loadPathAnalysis();
        } else {
          const error = await res.json();
          showAlert('清理失败: ' + (error.error || '未知错误'), 'error');
          await loadPathAnalysis();
        }
      } catch (e) {
        console.error('Error cleaning up old customers:', e);
        showAlert('清理失败', 'error');
        await loadPathAnalysis();
      }
    }

    async function loadDataStats() {
      if (!apiToken) return;
      try {
        const workerName = document.getElementById('campaign-worker-filter')?.value || '';
        let url = '/api/campaign/data-stats';
        if (workerName) url += '?workerName=' + encodeURIComponent(workerName);
        const res = await fetch(url, { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('stat-active-data').textContent = data.activeMerchants;
          document.getElementById('stat-pending-data').textContent = data.pendingMerchants;
          document.getElementById('stat-ignored-data').textContent = data.ignoredMerchants;
          document.getElementById('stat-total-paths').textContent = data.totalPaths;
        }
      } catch (e) {
        console.error('Failed to load data stats', e);
      }
    }

    async function cleanupIgnoredData() {
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      const confirmMsg = workerName 
        ? '确定要清理实例 "' + workerName + '" 中已忽略商户的邮件数据吗？此操作不可恢复！'
        : '确定要清理所有已忽略商户的数据吗？此操作不可恢复！';
      if (!confirm(confirmMsg)) return;
      try {
        const res = await fetch('/api/campaign/cleanup-ignored', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ workerName: workerName || undefined })
        });
        if (res.ok) {
          const data = await res.json();
          showAlert('清理完成: 删除 ' + data.merchantsDeleted + ' 个商户, ' + data.campaignsDeleted + ' 个活动, ' + data.emailsDeleted + ' 封邮件, ' + data.pathsDeleted + ' 条路径');
          await loadMerchants();
          await loadDataStats();
        } else {
          showAlert('清理失败', 'error');
        }
      } catch (e) {
        showAlert('清理失败', 'error');
      }
    }

    async function cleanupPendingData() {
      const days = parseInt(document.getElementById('pending-cleanup-days').value) || 30;
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      const confirmMsg = workerName
        ? '确定要清理实例 "' + workerName + '" 中 ' + days + ' 天前的待分析商户邮件数据吗？此操作不可恢复！'
        : '确定要清理 ' + days + ' 天前的待分析商户数据吗？此操作不可恢复！';
      if (!confirm(confirmMsg)) return;
      try {
        const res = await fetch('/api/campaign/cleanup-pending', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ days, workerName: workerName || undefined })
        });
        if (res.ok) {
          const data = await res.json();
          showAlert('清理完成: 删除 ' + data.merchantsDeleted + ' 个商户, ' + data.campaignsDeleted + ' 个活动, ' + data.emailsDeleted + ' 封邮件, ' + data.pathsDeleted + ' 条路径');
          await loadMerchants();
          await loadDataStats();
        } else {
          showAlert('清理失败', 'error');
        }
      } catch (e) {
        showAlert('清理失败', 'error');
      }
    }

    async function loadMerchants() {
      if (!apiToken) return;
      try {
        const statusFilter = document.getElementById('merchant-status-filter')?.value || '';
        const workerName = document.getElementById('campaign-worker-filter')?.value || '';
        let url = '/api/campaign/merchants';
        const params = [];
        if (statusFilter) params.push('analysisStatus=' + encodeURIComponent(statusFilter));
        if (workerName) params.push('workerName=' + encodeURIComponent(workerName));
        if (params.length > 0) url += '?' + params.join('&');
        
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        merchantsData = data.merchants || [];
        renderMerchants();
        updateCampaignStats();
      } catch (e) {
        console.error('Error loading merchants:', e);
      }
    }

    // Merchant status labels and colors
    const statusLabels = { pending: '等待分析', active: '分析中', ignored: '已忽略' };
    const statusColors = {
      pending: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },
      active: { bg: '#d4edda', text: '#155724', border: '#28a745' },
      ignored: { bg: '#f8d7da', text: '#721c24', border: '#dc3545' }
    };

    function renderMerchants() {
      const tbody = document.getElementById('merchants-table');
      const tableContainer = document.getElementById('merchants-table-container');
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      
      // Check if worker is selected first
      if (!workerName) {
        showMerchantEmptyState('no-worker');
        tableContainer.style.display = 'none';
        return;
      }
      
      if (merchantsData.length === 0) {
        showMerchantEmptyState('empty-data');
        tableContainer.style.display = 'none';
        return;
      }
      
      showMerchantEmptyState('hidden');
      tableContainer.style.display = 'table';

      // Check which merchants have projects
      const merchantsWithProjects = new Set(projectsData.map(p => p.merchantId));
      
      tbody.innerHTML = merchantsData.map(m => {
        const hasProject = merchantsWithProjects.has(m.id);
        const projectIndicator = hasProject ? '<span class="project-indicator" title="已有项目"></span>' : '';
        
        return '<tr>' +
          '<td><strong>' + escapeHtml(m.domain) + '</strong></td>' +
          '<td>' + m.totalCampaigns + '</td>' +
          '<td>' + m.totalEmails + '</td>' +
          '<td>' + projectIndicator + (hasProject ? '是' : '-') + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-primary" onclick="showMerchantPreview(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\', ' + m.totalCampaigns + ', ' + m.totalEmails + ')" style="margin-right:5px;">预览</button>' +
            '<button class="btn btn-sm btn-success" onclick="showCreateProjectModal(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\')">创建项目</button>' +
            (workerName ? '<button class="btn btn-sm btn-danger" onclick="showDeleteMerchantModal(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\', ' + m.totalEmails + ', ' + m.totalCampaigns + ')" style="margin-left:5px;">删除数据</button>' : '') +
          '</td></tr>';
      }).join('');
    }

    async function editMerchantName(merchantId, currentName) {
      const newName = prompt('请输入商户显示名称:', currentName || '');
      if (newName === null) return; // 用户取消
      
      try {
        // Get current worker filter to update per-instance display name
        const workerName = document.getElementById('campaign-worker-filter')?.value || 'global';
        const res = await fetch('/api/campaign/merchants/' + merchantId, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ displayName: newName || null, workerName })
        });
        if (res.ok) {
          showAlert('显示名称已更新');
          await loadMerchants();
        } else {
          showAlert('更新失败', 'error');
        }
      } catch (e) {
        showAlert('更新失败', 'error');
      }
    }

    async function setMerchantStatus(merchantId, status) {
      try {
        // Get current worker filter to set status per-instance
        const workerName = document.getElementById('campaign-worker-filter')?.value || 'global';
        const res = await fetch('/api/campaign/merchants/' + merchantId + '/status', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ status, workerName })
        });
        if (res.ok) {
          showAlert('状态已更新');
          await loadMerchants();
        } else {
          showAlert('操作失败', 'error');
        }
      } catch (e) {
        showAlert('操作失败', 'error');
      }
    }

    async function updateCampaignStats() {
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      
      // Display merchant count from loaded data (with null check)
      const statMerchants = document.getElementById('stat-merchants');
      if (statMerchants) statMerchants.textContent = merchantsData.length;
      
      // Get campaign and email counts from data-stats API (which supports worker filtering)
      try {
        let statsUrl = '/api/campaign/data-stats';
        if (workerName) statsUrl += '?workerName=' + encodeURIComponent(workerName);
        const statsRes = await fetch(statsUrl, { headers: getHeaders() });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const statCampaigns = document.getElementById('stat-campaigns');
          const statEmails = document.getElementById('stat-campaign-emails');
          if (statCampaigns) statCampaigns.textContent = statsData.totalCampaigns || 0;
          if (statEmails) statEmails.textContent = statsData.totalEmails || 0;
        }
      } catch (e) {
        // Fallback to merchant data if API fails
        let totalCampaigns = 0;
        let totalEmails = 0;
        merchantsData.forEach(m => {
          totalCampaigns += m.totalCampaigns || 0;
          totalEmails += m.totalEmails || 0;
        });
        const statCampaigns = document.getElementById('stat-campaigns');
        const statEmails = document.getElementById('stat-campaign-emails');
        if (statCampaigns) statCampaigns.textContent = totalCampaigns;
        if (statEmails) statEmails.textContent = totalEmails;
      }
      
      // Get valuable count from campaigns API (which supports worker filtering)
      let valuableCount = 0;
      try {
        let valuableUrl = '/api/campaign/campaigns?isValuable=true&limit=10000';
        if (workerName) valuableUrl += '&workerName=' + encodeURIComponent(workerName);
        const res = await fetch(valuableUrl, { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          valuableCount = (data.campaigns || []).length;
        }
      } catch (e) {}
      const statValuable = document.getElementById('stat-valuable');
      if (statValuable) statValuable.textContent = valuableCount;
    }

    async function showCampaigns(merchantId, domain) {
      currentMerchantId = merchantId;
      document.getElementById('campaigns-title').textContent = '营销活动 - ' + domain;
      document.getElementById('campaigns-section').style.display = 'block';
      document.getElementById('campaign-flow-section').style.display = 'none';
      await loadCampaigns(merchantId);
    }

    function hideCampaigns() {
      document.getElementById('campaigns-section').style.display = 'none';
      currentMerchantId = null;
    }

    async function loadCampaigns(merchantId) {
      if (!apiToken || !merchantId) return;
      const valuable = document.getElementById('campaign-valuable-filter').value;
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      let url = '/api/campaign/campaigns?merchantId=' + merchantId;
      if (valuable) url += '&isValuable=' + valuable;
      if (workerName) url += '&workerName=' + encodeURIComponent(workerName);
      
      try {
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        campaignsData = data.campaigns || [];
        renderCampaigns();
      } catch (e) {
        console.error('Error loading campaigns:', e);
      }
    }

    // Campaign tag labels and colors
    const tagLabels = {
      0: '未标记',
      1: '高价值',
      2: '重要',
      3: '一般',
      4: '可忽略'
    };
    const tagColors = {
      0: { bg: '#f8f9fa', text: '#666', border: '#ddd' },
      1: { bg: '#d4edda', text: '#155724', border: '#28a745' },
      2: { bg: '#cce5ff', text: '#004085', border: '#007bff' },
      3: { bg: '#fff3cd', text: '#856404', border: '#ffc107' },
      4: { bg: '#f8d7da', text: '#721c24', border: '#dc3545' }
    };

    function renderCampaigns() {
      const tbody = document.getElementById('campaigns-table');
      if (campaignsData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">暂无营销活动</td></tr>';
        return;
      }
      
      tbody.innerHTML = campaignsData.map(c => {
        const firstSeen = new Date(c.firstSeenAt).toLocaleDateString('zh-CN');
        const tag = c.tag || 0;
        const color = tagColors[tag] || tagColors[0];
        const tagStatus = '<span style="background:' + color.bg + ';color:' + color.text + ';border:1px solid ' + color.border + ';padding:2px 8px;border-radius:4px;font-size:11px;">' + tagLabels[tag] + '</span>';
        const subjectDisplay = '<span class="text-truncate" title="' + escapeHtml(c.subject) + '">' + escapeHtml(c.subject) + '</span>';
        return '<tr>' +
          '<td>' + subjectDisplay + '</td>' +
          '<td>' + c.totalEmails + '</td>' +
          '<td>' + c.uniqueRecipients + '</td>' +
          '<td>' + tagStatus + '</td>' +
          '<td>' + firstSeen + '</td>' +
          '<td class="actions">' +
            '<select onchange="setCampaignTag(\\'' + c.id + '\\', this.value)" style="padding:4px;border:1px solid #ddd;border-radius:4px;font-size:12px;">' +
              '<option value="0"' + (tag === 0 ? ' selected' : '') + '>未标记</option>' +
              '<option value="1"' + (tag === 1 ? ' selected' : '') + '>高价值</option>' +
              '<option value="2"' + (tag === 2 ? ' selected' : '') + '>重要</option>' +
              '<option value="3"' + (tag === 3 ? ' selected' : '') + '>一般</option>' +
              '<option value="4"' + (tag === 4 ? ' selected' : '') + '>可忽略</option>' +
            '</select>' +
          '</td></tr>';
      }).join('');
    }

    async function setCampaignTag(campaignId, tag) {
      try {
        const res = await fetch('/api/campaign/campaigns/' + campaignId + '/tag', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ tag: parseInt(tag) })
        });
        if (res.ok) {
          showAlert('标签已更新');
          await loadCampaigns(currentMerchantId);
          await updateCampaignStats();
        } else {
          showAlert('操作失败', 'error');
        }
      } catch (e) {
        showAlert('操作失败', 'error');
      }
    }

    // Legacy function for backward compatibility
    async function toggleValuable(campaignId, valuable) {
      await setCampaignTag(campaignId, valuable ? 1 : 0);
    }

    async function showMerchantFlow(merchantId, domain) {
      document.getElementById('flow-title').textContent = '活动路径分析 - ' + domain;
      document.getElementById('campaign-flow-section').style.display = 'block';
      document.getElementById('campaigns-section').style.display = 'none';
      
      try {
        const res = await fetch('/api/campaign/merchants/' + merchantId + '/flow', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        renderFlow(data);
      } catch (e) {
        document.getElementById('flow-container').innerHTML = '<p style="color:#999;text-align:center;">加载失败或暂无数据</p>';
      }
    }

    function hideFlow() {
      document.getElementById('campaign-flow-section').style.display = 'none';
    }

    function renderFlow(flowData) {
      const container = document.getElementById('flow-container');
      if (!flowData.nodes || flowData.nodes.length === 0) {
        container.innerHTML = '<p style="color:#999;text-align:center;">暂无路径数据</p>';
        return;
      }
      
      // Group nodes by level
      const levels = {};
      flowData.nodes.forEach(node => {
        if (!levels[node.level]) levels[node.level] = [];
        levels[node.level].push(node);
      });
      
      let html = '<div style="overflow-x:auto;">';
      html += '<div style="display:flex;gap:20px;padding:20px;min-width:fit-content;">';
      
      Object.keys(levels).sort((a, b) => a - b).forEach(level => {
        html += '<div style="min-width:200px;">';
        html += '<div style="font-weight:bold;margin-bottom:10px;color:#666;">第 ' + level + ' 层</div>';
        levels[level].forEach(node => {
          const bgColor = node.isValuable ? '#d4edda' : '#f8f9fa';
          const borderColor = node.isValuable ? '#28a745' : '#ddd';
          html += '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:6px;padding:10px;margin-bottom:8px;">';
          html += '<div style="font-size:12px;word-break:break-all;" title="' + escapeHtml(node.subject) + '">' + escapeHtml(node.subject.substring(0, 50)) + (node.subject.length > 50 ? '...' : '') + '</div>';
          html += '<div style="font-size:11px;color:#666;margin-top:4px;">' + node.recipientCount + ' 人 (' + node.percentage.toFixed(1) + '%)</div>';
          if (node.isValuable) html += '<div style="font-size:10px;color:#28a745;margin-top:2px;">✓ 有价值</div>';
          html += '</div>';
        });
        html += '</div>';
      });
      
      html += '</div></div>';
      container.innerHTML = html;
    }

    // ============================================
    // Enhanced Analysis Views (活动转移路径分析)
    // ============================================

    async function showTransitions(merchantId, domain) {
      document.getElementById('flow-title').textContent = '活动转移路径 - ' + domain;
      document.getElementById('campaign-flow-section').style.display = 'block';
      document.getElementById('campaigns-section').style.display = 'none';
      
      try {
        const res = await fetch('/api/campaign/merchants/' + merchantId + '/transitions', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        renderTransitions(data);
      } catch (e) {
        document.getElementById('flow-container').innerHTML = '<p style="color:#999;text-align:center;">加载失败或暂无数据</p>';
      }
    }

    function renderTransitions(data) {
      const container = document.getElementById('flow-container');
      if (!data.transitions || data.transitions.length === 0) {
        container.innerHTML = '<p style="color:#999;text-align:center;">暂无转移数据</p>';
        return;
      }
      
      let html = '<div style="margin-bottom:15px;color:#666;">总收件人: ' + data.totalRecipients + '</div>';
      html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
      html += '<thead><tr style="background:#f8f9fa;">';
      html += '<th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">来源活动</th>';
      html += '<th style="padding:8px;text-align:center;border-bottom:2px solid #ddd;">→</th>';
      html += '<th style="padding:8px;text-align:left;border-bottom:2px solid #ddd;">目标活动</th>';
      html += '<th style="padding:8px;text-align:right;border-bottom:2px solid #ddd;">人数</th>';
      html += '<th style="padding:8px;text-align:right;border-bottom:2px solid #ddd;">比例</th>';
      html += '</tr></thead><tbody>';
      
      data.transitions.slice(0, 50).forEach(t => {
        const fromValuable = t.fromIsValuable ? ' <span style="color:#28a745;">✓</span>' : '';
        const toValuable = t.toIsValuable ? ' <span style="color:#28a745;">✓</span>' : '';
        html += '<tr style="border-bottom:1px solid #eee;">';
        html += '<td style="padding:8px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(t.fromSubject) + '">' + escapeHtml(t.fromSubject.substring(0, 40)) + fromValuable + '</td>';
        html += '<td style="padding:8px;text-align:center;color:#999;">→</td>';
        html += '<td style="padding:8px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(t.toSubject) + '">' + escapeHtml(t.toSubject.substring(0, 40)) + toValuable + '</td>';
        html += '<td style="padding:8px;text-align:right;font-weight:bold;">' + t.userCount + '</td>';
        html += '<td style="padding:8px;text-align:right;color:#666;">' + t.transitionRatio.toFixed(1) + '%</td>';
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      if (data.transitions.length > 50) {
        html += '<p style="color:#999;text-align:center;margin-top:10px;">显示前 50 条转移记录</p>';
      }
      container.innerHTML = html;
    }

    async function showValuableAnalysis(merchantId, domain) {
      document.getElementById('flow-title').textContent = '有价值活动分析 - ' + domain;
      document.getElementById('campaign-flow-section').style.display = 'block';
      document.getElementById('campaigns-section').style.display = 'none';
      
      try {
        const res = await fetch('/api/campaign/merchants/' + merchantId + '/valuable-analysis', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        renderValuableAnalysis(data);
      } catch (e) {
        document.getElementById('flow-container').innerHTML = '<p style="color:#999;text-align:center;">加载失败或暂无数据</p>';
      }
    }

    function renderValuableAnalysis(data) {
      const container = document.getElementById('flow-container');
      if (!data.valuableCampaigns || data.valuableCampaigns.length === 0) {
        container.innerHTML = '<p style="color:#999;text-align:center;">暂无有价值活动数据。请先标记一些活动为有价值。</p>';
        return;
      }
      
      let html = '<div style="margin-bottom:15px;color:#666;">有价值活动总数: ' + data.totalValuableCampaigns + '</div>';
      
      data.valuableCampaigns.forEach(vc => {
        html += '<div style="background:#f8f9fa;border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:15px;">';
        html += '<div style="font-weight:bold;margin-bottom:10px;color:#28a745;">✓ ' + escapeHtml(vc.subject) + '</div>';
        html += '<div style="font-size:12px;color:#666;margin-bottom:10px;">层级: ' + vc.level + ' | 收件人: ' + vc.recipientCount + ' (' + vc.percentage.toFixed(1) + '%)</div>';
        
        // Predecessors
        if (vc.commonPredecessors && vc.commonPredecessors.length > 0) {
          html += '<div style="margin-top:10px;"><strong style="font-size:12px;color:#555;">常见前驱活动:</strong>';
          html += '<ul style="margin:5px 0 0 20px;padding:0;font-size:12px;">';
          vc.commonPredecessors.forEach(p => {
            const valuable = p.isValuable ? ' <span style="color:#28a745;">✓</span>' : '';
            html += '<li style="margin-bottom:3px;">' + escapeHtml(p.subject.substring(0, 50)) + valuable + ' (' + p.transitionCount + '人, ' + p.transitionRatio.toFixed(1) + '%)</li>';
          });
          html += '</ul></div>';
        }
        
        // Successors
        if (vc.commonSuccessors && vc.commonSuccessors.length > 0) {
          html += '<div style="margin-top:10px;"><strong style="font-size:12px;color:#555;">常见后续活动:</strong>';
          html += '<ul style="margin:5px 0 0 20px;padding:0;font-size:12px;">';
          vc.commonSuccessors.forEach(s => {
            const valuable = s.isValuable ? ' <span style="color:#28a745;">✓</span>' : '';
            html += '<li style="margin-bottom:3px;">' + escapeHtml(s.subject.substring(0, 50)) + valuable + ' (' + s.transitionCount + '人, ' + s.transitionRatio.toFixed(1) + '%)</li>';
          });
          html += '</ul></div>';
        }
        
        html += '</div>';
      });
      
      container.innerHTML = html;
    }

    // ============================================
    // Path Analysis Views (完整路径分析)
    // ============================================

    async function showPathAnalysis(merchantId, domain) {
      currentMerchantId = merchantId;
      document.getElementById('flow-title').textContent = '完整路径分析 - ' + domain;
      document.getElementById('campaign-flow-section').style.display = 'block';
      document.getElementById('campaigns-section').style.display = 'none';
      document.getElementById('flow-container').innerHTML = '<p style="color:#666;text-align:center;">加载中...</p>';
      
      try {
        const workerName = document.getElementById('campaign-worker-filter')?.value || '';
        let url = '/api/campaign/merchants/' + merchantId + '/path-analysis';
        if (workerName) url += '?workerName=' + encodeURIComponent(workerName);
        const res = await fetch(url, { headers: getHeaders() });
        const data = await res.json();
        if (!res.ok) {
          document.getElementById('flow-container').innerHTML = '<p style="color:#e74c3c;text-align:center;">加载失败: ' + (data.error || res.status) + '</p>';
          return;
        }
        renderPathAnalysis(data, merchantId);
      } catch (e) {
        document.getElementById('flow-container').innerHTML = '<p style="color:#e74c3c;text-align:center;">加载失败: ' + e.message + '</p>';
      }
    }

    function renderPathAnalysis(data, merchantId) {
      const container = document.getElementById('flow-container');
      let html = '';
      
      // Check if data is valid
      if (!data || !data.userStats) {
        container.innerHTML = '<p style="color:#999;text-align:center;">暂无数据</p>';
        return;
      }
      
      // User Stats Section
      html += '<div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h3 style="margin:0 0 10px 0;font-size:14px;color:#1565c0;">📊 用户统计</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">';
      html += '<div style="text-align:center;"><div style="font-size:24px;font-weight:bold;color:#1565c0;">' + (data.userStats.totalRecipients || 0) + '</div><div style="font-size:11px;color:#666;">总收件人</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:24px;font-weight:bold;color:#28a745;">' + (data.userStats.newUsers || 0) + '</div><div style="font-size:11px;color:#666;">新用户</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:24px;font-weight:bold;color:#ff9800;">' + (data.userStats.oldUsers || 0) + '</div><div style="font-size:11px;color:#666;">老用户</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:24px;font-weight:bold;color:#9c27b0;">' + (data.userStats.newUserPercentage || 0).toFixed(1) + '%</div><div style="font-size:11px;color:#666;">新用户比例</div></div>';
      html += '</div></div>';
      
      // Root Campaigns Section
      html += '<div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h3 style="margin:0 0 10px 0;font-size:14px;color:#e65100;">🎯 第一层级活动 (Root Campaign)</h3>';
      if (data.rootCampaigns && data.rootCampaigns.length > 0) {
        html += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
        html += '<tr style="background:#fff8e1;"><th style="padding:6px;text-align:left;">活动主题</th><th style="padding:6px;text-align:center;">状态</th><th style="padding:6px;text-align:right;">新用户数</th></tr>';
        data.rootCampaigns.forEach(rc => {
          const status = rc.isConfirmed ? '<span style="color:#28a745;">✓ 已确认</span>' : '<span style="color:#ff9800;">候选</span>';
          html += '<tr style="border-bottom:1px solid #eee;"><td style="padding:6px;">' + escapeHtml(rc.subject.substring(0, 50)) + '</td><td style="padding:6px;text-align:center;">' + status + '</td><td style="padding:6px;text-align:right;">' + rc.newUserCount + '</td></tr>';
        });
        html += '</table>';
      } else {
        html += '<p style="color:#999;font-size:12px;">暂无第一层级活动。请在活动列表中设置 Root Campaign。</p>';
      }
      html += '</div>';
      
      // Level Stats Section
      html += '<div style="background:#f3e5f5;border:1px solid #ce93d8;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h3 style="margin:0 0 10px 0;font-size:14px;color:#7b1fa2;">📈 活动层级统计 (基于新用户)</h3>';
      if (data.levelStats && data.levelStats.length > 0) {
        // Group by level
        const levelGroups = {};
        data.levelStats.forEach(ls => {
          if (!levelGroups[ls.level]) levelGroups[ls.level] = [];
          levelGroups[ls.level].push(ls);
        });
        
        html += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
        html += '<tr style="background:#e1bee7;"><th style="padding:6px;text-align:center;width:60px;">层级</th><th style="padding:6px;text-align:left;">活动主题</th><th style="padding:6px;text-align:right;width:80px;">人数</th><th style="padding:6px;text-align:right;width:80px;">覆盖率</th></tr>';
        
        Object.keys(levelGroups).sort((a, b) => a - b).forEach(level => {
          const campaigns = levelGroups[level].slice(0, 5);
          campaigns.forEach((ls, idx) => {
            const bgColor = ls.isRoot ? '#fff3e0' : (ls.isValuable ? '#d4edda' : '#fff');
            html += '<tr style="border-bottom:1px solid #eee;background:' + bgColor + ';">';
            if (idx === 0) {
              html += '<td style="padding:6px;text-align:center;font-weight:bold;vertical-align:top;" rowspan="' + campaigns.length + '">第 ' + level + ' 层</td>';
            }
            html += '<td style="padding:6px;">' + escapeHtml(ls.subject.substring(0, 40)) + (ls.isRoot ? ' 🎯' : '') + (ls.isValuable ? ' ⭐' : '') + '</td>';
            html += '<td style="padding:6px;text-align:right;font-weight:bold;">' + ls.userCount + '</td>';
            html += '<td style="padding:6px;text-align:right;color:#666;">' + ls.coverage.toFixed(1) + '%</td>';
            html += '</tr>';
          });
          if (levelGroups[level].length > 5) {
            html += '<tr style="border-bottom:1px solid #eee;"><td></td><td colspan="3" style="padding:6px;color:#999;font-size:11px;">+' + (levelGroups[level].length - 5) + ' 更多活动</td></tr>';
          }
        });
        html += '</table>';
      } else {
        html += '<p style="color:#999;font-size:12px;">暂无层级数据</p>';
      }
      html += '</div>';
      
      // Transitions Section (New Users Only) - Tree View
      html += '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h3 style="margin:0 0 10px 0;font-size:14px;color:#2e7d32;">🔄 新用户转移路径</h3>';
      if (data.transitions && data.transitions.length > 0) {
        // Build tree structure from transitions
        const transitionMap = {};
        const allTargets = new Set();
        
        data.transitions.forEach(t => {
          if (!transitionMap[t.fromCampaignId]) {
            transitionMap[t.fromCampaignId] = {
              subject: t.fromSubject,
              children: []
            };
          }
          transitionMap[t.fromCampaignId].children.push({
            campaignId: t.toCampaignId,
            subject: t.toSubject,
            userCount: t.userCount,
            ratio: t.transitionRatio
          });
          allTargets.add(t.toCampaignId);
        });
        
        // Find root nodes (nodes that are not targets of any transition)
        const rootNodes = Object.keys(transitionMap).filter(id => !allTargets.has(id));
        
        // If no clear roots, use nodes with most outgoing transitions
        if (rootNodes.length === 0) {
          const sortedNodes = Object.entries(transitionMap)
            .sort((a, b) => b[1].children.length - a[1].children.length);
          if (sortedNodes.length > 0) rootNodes.push(sortedNodes[0][0]);
        }
        
        // Render tree recursively
        function renderTreeNode(campaignId, depth, maxDepth) {
          if (depth > maxDepth || !transitionMap[campaignId]) return '';
          const node = transitionMap[campaignId];
          let nodeHtml = '';
          
          node.children.sort((a, b) => b.userCount - a.userCount).slice(0, 5).forEach((child, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const prefix = depth > 0 ? '│'.repeat(depth - 1) + (isLast ? '└' : '├') : '';
            const bgColor = child.ratio >= 50 ? '#c8e6c9' : (child.ratio >= 20 ? '#fff9c4' : 'transparent');
            
            nodeHtml += '<div style="padding:3px 0;font-size:12px;font-family:monospace;background:' + bgColor + ';border-radius:3px;margin:2px 0;">';
            nodeHtml += '<span style="color:#999;">' + prefix + '→ </span>';
            nodeHtml += '<span style="color:#333;">' + escapeHtml(child.subject.substring(0, 35)) + '</span>';
            nodeHtml += '<span style="color:#2e7d32;font-weight:bold;margin-left:8px;">' + child.userCount + '人</span>';
            nodeHtml += '<span style="color:#666;margin-left:5px;">(' + child.ratio.toFixed(1) + '%)</span>';
            nodeHtml += '</div>';
            
            // Recursively render children
            nodeHtml += renderTreeNode(child.campaignId, depth + 1, maxDepth);
          });
          
          if (node.children.length > 5) {
            const prefix = depth > 0 ? '│'.repeat(depth - 1) + '└' : '';
            nodeHtml += '<div style="padding:3px 0;font-size:11px;color:#999;font-family:monospace;">' + prefix + '... +' + (node.children.length - 5) + ' 更多</div>';
          }
          
          return nodeHtml;
        }
        
        // Render from each root
        rootNodes.forEach(rootId => {
          const rootNode = transitionMap[rootId];
          if (rootNode) {
            html += '<div style="margin-bottom:15px;padding:10px;background:#fff;border-radius:6px;border:1px solid #c8e6c9;">';
            html += '<div style="font-weight:bold;font-size:13px;color:#1b5e20;margin-bottom:8px;">🎯 ' + escapeHtml(rootNode.subject.substring(0, 45)) + '</div>';
            html += renderTreeNode(rootId, 0, 4);
            html += '</div>';
          }
        });
        
        html += '<p style="color:#888;font-size:11px;margin-top:10px;">💡 绿色背景=主路径(≥50%) | 黄色背景=次级路径(≥20%)</p>';
      } else {
        html += '<p style="color:#999;font-size:12px;">暂无转移数据</p>';
      }
      html += '</div>';
      
      // Old User Stats Section
      if (data.oldUserStats && data.oldUserStats.length > 0) {
        html += '<div style="background:#fce4ec;border:1px solid #f48fb1;border-radius:8px;padding:15px;margin-bottom:15px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        html += '<h3 style="margin:0;font-size:14px;color:#c2185b;">👤 老用户活动统计 <span style="font-weight:normal;font-size:12px;color:#999;">(' + data.oldUserStats.length + '个活动)</span></h3>';
        html += '<button class="btn btn-sm btn-danger" onclick="cleanupOldUserPaths(\\''+data.merchantId+'\\')">🗑️ 清理老用户路径</button>';
        html += '</div>';
        html += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
        html += '<tr style="background:#f8bbd9;"><th style="padding:6px;text-align:left;">活动主题</th><th style="padding:6px;text-align:right;">老用户数</th><th style="padding:6px;text-align:right;">覆盖率</th></tr>';
        const initialCount = 10;
        data.oldUserStats.forEach((os, idx) => {
          const hidden = idx >= initialCount ? ' class="old-user-hidden" style="display:none;"' : '';
          html += '<tr' + hidden + ' style="border-bottom:1px solid #eee;">';
          html += '<td style="padding:6px;">' + escapeHtml(os.subject.substring(0, 40)) + '</td>';
          html += '<td style="padding:6px;text-align:right;">' + os.oldUserCount + '</td>';
          html += '<td style="padding:6px;text-align:right;">' + os.oldUserCoverage.toFixed(1) + '%</td>';
          html += '</tr>';
        });
        html += '</table>';
        if (data.oldUserStats.length > initialCount) {
          html += '<div style="text-align:center;margin-top:10px;">';
          html += '<button id="old-user-toggle-btn" class="btn btn-sm btn-secondary" onclick="toggleOldUserStats()">显示更多 (' + (data.oldUserStats.length - initialCount) + ')</button>';
          html += '</div>';
        }
        html += '<p style="color:#888;font-size:11px;margin-top:10px;">💡 清理老用户路径可释放存储空间，但会保留老用户活动统计数据</p>';
        html += '</div>';
      }
      
      container.innerHTML = html;
    }

    let oldUserStatsExpanded = false;
    function toggleOldUserStats() {
      oldUserStatsExpanded = !oldUserStatsExpanded;
      const hiddenRows = document.querySelectorAll('.old-user-hidden');
      const btn = document.getElementById('old-user-toggle-btn');
      hiddenRows.forEach(row => {
        row.style.display = oldUserStatsExpanded ? 'table-row' : 'none';
      });
      if (btn) {
        btn.textContent = oldUserStatsExpanded ? '收起' : '显示更多 (' + hiddenRows.length + ')';
      }
    }

    async function cleanupOldUserPaths(merchantId) {
      if (!confirm('确定要清理该商户的老用户路径数据吗？\\n\\n此操作将删除老用户的详细路径记录，但会保留老用户活动统计数据。\\n此操作不可恢复！')) return;
      try {
        const res = await fetch('/api/campaign/merchants/' + merchantId + '/cleanup-old-user-paths', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        const data = await res.json();
        if (res.ok) {
          showAlert('清理完成！删除了 ' + data.pathsDeleted + ' 条路径记录，影响 ' + data.oldUsersAffected + ' 个老用户', 'success');
          // Refresh the path analysis view - use currentMerchantId
          if (currentMerchantId) {
            showPathAnalysis(currentMerchantId, '');
          }
        } else {
          showAlert(data.error || '清理失败', 'error');
        }
      } catch (e) {
        showAlert('清理失败: ' + e.message, 'error');
      }
    }

    // Root Campaign Management
    async function showRootCampaigns(merchantId, domain) {
      document.getElementById('flow-title').textContent = 'Root Campaign 管理 - ' + domain;
      document.getElementById('campaign-flow-section').style.display = 'block';
      document.getElementById('campaigns-section').style.display = 'none';
      
      try {
        const workerName = document.getElementById('campaign-worker-filter')?.value || '';
        const workerParam = workerName ? '?workerName=' + encodeURIComponent(workerName) : '';
        const [rootRes, campaignsRes] = await Promise.all([
          fetch('/api/campaign/merchants/' + merchantId + '/root-campaigns' + workerParam, { headers: getHeaders() }),
          fetch('/api/campaign/campaigns?merchantId=' + merchantId + '&limit=100' + (workerName ? '&workerName=' + encodeURIComponent(workerName) : ''), { headers: getHeaders() })
        ]);
        
        const rootData = await rootRes.json();
        const campaignsData = await campaignsRes.json();
        renderRootCampaignManager(merchantId, rootData, campaignsData);
      } catch (e) {
        document.getElementById('flow-container').innerHTML = '<p style="color:#999;text-align:center;">加载失败</p>';
      }
    }

    function renderRootCampaignManager(merchantId, rootData, campaignsData) {
      const container = document.getElementById('flow-container');
      const rootIds = new Set((rootData.rootCampaigns || []).filter(r => r.isConfirmed).map(r => r.campaignId));
      const candidateIds = new Set((rootData.rootCampaigns || []).filter(r => r.isCandidate && !r.isConfirmed).map(r => r.campaignId));
      
      let html = '<div style="margin-bottom:15px;">';
      html += '<button class="btn btn-primary btn-sm" onclick="detectRootCandidates(\\'' + merchantId + '\\')">🔍 自动检测候选</button>';
      html += '<button class="btn btn-secondary btn-sm" style="margin-left:10px;" onclick="recalculateUsers(\\'' + merchantId + '\\')">🔄 重新计算用户</button>';
      html += '</div>';
      
      html += '<div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h3 style="margin:0 0 10px 0;font-size:14px;color:#e65100;">已确认的 Root Campaign</h3>';
      if (rootIds.size > 0) {
        (rootData.rootCampaigns || []).filter(r => r.isConfirmed).forEach(rc => {
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#fff;border-radius:4px;margin-bottom:5px;">';
          html += '<span style="font-size:12px;">' + escapeHtml(rc.subject.substring(0, 50)) + ' <span style="color:#666;">(' + rc.newUserCount + ' 新用户)</span></span>';
          html += '<button class="btn btn-sm btn-danger" onclick="setRootCampaign(\\'' + rc.campaignId + '\\', false, \\'' + merchantId + '\\')">移除</button>';
          html += '</div>';
        });
      } else {
        html += '<p style="color:#999;font-size:12px;">暂无已确认的 Root Campaign</p>';
      }
      html += '</div>';
      
      html += '<div style="background:#f8f9fa;border:1px solid #ddd;border-radius:8px;padding:15px;">';
      html += '<h3 style="margin:0 0 10px 0;font-size:14px;color:#333;">所有活动</h3>';
      html += '<p style="color:#666;font-size:11px;margin-bottom:10px;">点击"设为 Root"将活动标记为第一层级活动</p>';
      
      (campaignsData.campaigns || []).slice(0, 30).forEach(c => {
        const isRoot = rootIds.has(c.id);
        const isCandidate = candidateIds.has(c.id);
        const bgColor = isRoot ? '#fff3e0' : (isCandidate ? '#fffde7' : '#fff');
        const badge = isRoot ? '<span style="background:#ff9800;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;margin-left:5px;">ROOT</span>' : (isCandidate ? '<span style="background:#ffc107;color:#333;padding:2px 6px;border-radius:3px;font-size:10px;margin-left:5px;">候选</span>' : '');
        
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:' + bgColor + ';border-radius:4px;margin-bottom:5px;border:1px solid #eee;">';
        html += '<span style="font-size:12px;">' + escapeHtml(c.subject.substring(0, 45)) + badge + '</span>';
        if (!isRoot) {
          html += '<button class="btn btn-sm btn-success" onclick="setRootCampaign(\\'' + c.id + '\\', true, \\'' + merchantId + '\\')">设为 Root</button>';
        }
        html += '</div>';
      });
      html += '</div>';
      
      container.innerHTML = html;
    }

    async function setRootCampaign(campaignId, isRoot, merchantId) {
      try {
        const res = await fetch('/api/campaign/campaigns/' + campaignId + '/root', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ isRoot })
        });
        if (res.ok) {
          showAlert(isRoot ? '已设为 Root Campaign' : '已移除 Root 标记');
          showRootCampaigns(merchantId, '');
        } else {
          showAlert('操作失败', 'error');
        }
      } catch (e) {
        showAlert('操作失败', 'error');
      }
    }

    async function detectRootCandidates(merchantId) {
      try {
        const res = await fetch('/api/campaign/merchants/' + merchantId + '/detect-root-candidates', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        if (res.ok) {
          const data = await res.json();
          showAlert('检测到 ' + data.candidatesDetected + ' 个候选活动');
          showRootCampaigns(merchantId, '');
        } else {
          showAlert('检测失败', 'error');
        }
      } catch (e) {
        showAlert('检测失败', 'error');
      }
    }

    async function recalculateUsers(merchantId) {
      try {
        const res = await fetch('/api/campaign/merchants/' + merchantId + '/recalculate-users', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        if (res.ok) {
          const data = await res.json();
          showAlert('重新计算完成: ' + data.userStats.newUsers + ' 新用户, ' + data.userStats.oldUsers + ' 老用户');
        } else {
          showAlert('计算失败', 'error');
        }
      } catch (e) {
        showAlert('计算失败', 'error');
      }
    }

    // ==================== Monitoring Functions ====================
    let monitoringRules = [];

    // Auto-refresh timers
    const autoRefreshTimers = {
      alerts: null,
      status: null,
      funnel: null,
      heartbeat: null
    };

    // Auto-refresh functions
    const autoRefreshFunctions = {
      alerts: () => loadMonitoringAlerts(),
      status: () => loadMonitoringStatus(),
      funnel: () => { loadRatioMonitors(); checkRatioMonitors(); },
      heartbeat: () => triggerHeartbeat(),
      campaign: () => { loadMerchants(); updateCampaignStats(); },
      dataStats: () => loadDataStats(),
      logs: () => loadLogs(),
      stats: () => { loadStats(); loadTrendingRules(); }
    };

    function toggleAutoRefresh(type) {
      const checkbox = document.getElementById(type + '-auto-refresh');
      const intervalSelect = document.getElementById(type + '-refresh-interval');
      
      if (checkbox && checkbox.checked) {
        const interval = parseInt(intervalSelect?.value || '60', 10) * 1000;
        startAutoRefresh(type, interval);
        saveAutoRefreshSettings(type, true, intervalSelect?.value || '60');
      } else {
        stopAutoRefresh(type);
        saveAutoRefreshSettings(type, false, intervalSelect?.value || '60');
      }
    }

    function updateAutoRefreshInterval(type) {
      const checkbox = document.getElementById(type + '-auto-refresh');
      const intervalSelect = document.getElementById(type + '-refresh-interval');
      const interval = parseInt(intervalSelect?.value || '60', 10) * 1000;
      
      if (checkbox && checkbox.checked) {
        stopAutoRefresh(type);
        startAutoRefresh(type, interval);
      }
      saveAutoRefreshSettings(type, checkbox?.checked || false, intervalSelect?.value || '60');
    }

    function saveAutoRefreshSettings(type, enabled, interval) {
      try {
        const settings = JSON.parse(localStorage.getItem('autoRefreshSettings') || '{}');
        settings[type] = { enabled, interval };
        localStorage.setItem('autoRefreshSettings', JSON.stringify(settings));
      } catch (e) {
        console.error('Failed to save auto-refresh settings', e);
      }
    }

    function restoreAutoRefreshSettings() {
      try {
        const settings = JSON.parse(localStorage.getItem('autoRefreshSettings') || '{}');
        Object.keys(settings).forEach(type => {
          const { enabled, interval } = settings[type];
          const checkbox = document.getElementById(type + '-auto-refresh');
          const intervalSelect = document.getElementById(type + '-refresh-interval');
          
          if (checkbox) {
            checkbox.checked = enabled;
          }
          if (intervalSelect) {
            intervalSelect.value = interval;
          }
          if (enabled) {
            startAutoRefresh(type, parseInt(interval, 10) * 1000);
          }
        });
      } catch (e) {
        console.error('Failed to restore auto-refresh settings', e);
      }
    }

    function startAutoRefresh(type, interval) {
      stopAutoRefresh(type);
      const fn = autoRefreshFunctions[type];
      if (fn) {
        autoRefreshTimers[type] = setInterval(fn, interval);
        console.log('[AutoRefresh] Started ' + type + ' with interval ' + (interval/1000) + 's');
      }
    }

    function stopAutoRefresh(type) {
      if (autoRefreshTimers[type]) {
        clearInterval(autoRefreshTimers[type]);
        autoRefreshTimers[type] = null;
        console.log('[AutoRefresh] Stopped ' + type);
      }
    }

    function stopAllAutoRefresh() {
      Object.keys(autoRefreshTimers).forEach(type => stopAutoRefresh(type));
    }

    // Stop auto-refresh when leaving the page
    window.addEventListener('beforeunload', stopAllAutoRefresh);

    async function loadMonitoringData() {
      await Promise.all([loadMonitoringRules(), loadMonitoringStatus(), loadMonitoringAlerts()]);
      await loadRatioMonitors();
    }

    async function loadMonitoringRules() {
      if (!apiToken) return;
      try {
        const tagFilter = document.getElementById('monitoring-tag-filter')?.value || '';
        const scopeFilter = document.getElementById('monitoring-scope-filter')?.value || '';
        let url = '/api/monitoring/rules';
        const params = [];
        if (tagFilter) params.push('tag=' + encodeURIComponent(tagFilter));
        if (scopeFilter) params.push('workerScope=' + encodeURIComponent(scopeFilter));
        if (params.length > 0) url += '?' + params.join('&');
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        monitoringRules = data.rules || [];
        renderMonitoringRules();
        updateMonitoringTagFilter();
      } catch (e) {
        showAlert('加载监控规则失败', 'error');
      }
    }

    function updateMonitoringTagFilter() {
      const select = document.getElementById('monitoring-tag-filter');
      if (!select) return;
      const currentValue = select.value;
      const allTags = new Set();
      monitoringRules.forEach(r => {
        (r.tags || []).forEach(t => allTags.add(t));
      });
      const options = ['<option value="">全部标签</option>'];
      Array.from(allTags).sort().forEach(tag => {
        options.push('<option value="' + escapeHtml(tag) + '"' + (tag === currentValue ? ' selected' : '') + '>' + escapeHtml(tag) + '</option>');
      });
      select.innerHTML = options.join('');
    }

    function renderMonitoringRules() {
      const tbody = document.getElementById('monitoring-rules-table');
      if (monitoringRules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#999">暂无监控规则</td></tr>';
        return;
      }
      const limit = parseInt(document.getElementById('rules-rows-limit')?.value || '20', 10);
      const displayRules = limit > 0 ? monitoringRules.slice(0, limit) : monitoringRules;
      tbody.innerHTML = displayRules.map(r => {
        const enabledStatus = r.enabled ? '<span class="status status-enabled">启用</span>' : '<span class="status status-disabled">禁用</span>';
        const tagsHtml = (r.tags || []).map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('');
        const matchModeText = r.matchMode === 'regex' ? '正则' : '包含';
        const workerScope = r.workerScope || 'global';
        const scopeBadge = workerScope === 'global' 
          ? '<span class="tag" style="background:#e3f2fd;color:#1565c0;">🌐 全局</span>'
          : '<span class="tag" style="background:#fff3e0;color:#e65100;">📍 ' + escapeHtml(workerScope) + '</span>';
        return '<tr>' +
          '<td>' + escapeHtml(r.merchant) + '</td>' +
          '<td><strong>' + escapeHtml(r.name) + '</strong></td>' +
          '<td>' + (tagsHtml || '-') + '</td>' +
          '<td>' + scopeBadge + '</td>' +
          '<td><code style="font-size:11px;">' + escapeHtml(r.subjectPattern) + '</code> <span class="tag">' + matchModeText + '</span></td>' +
          '<td>' + r.expectedIntervalMinutes + ' 分钟</td>' +
          '<td>' + r.deadAfterMinutes + ' 分钟</td>' +
          '<td id="rule-state-' + r.id + '">-</td>' +
          '<td>' + enabledStatus + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-primary" onclick="editMonitoringRule(\\'' + r.id + '\\')">编辑</button>' +
            '<button class="btn btn-sm btn-' + (r.enabled ? 'warning' : 'success') + '" onclick="toggleMonitoringRule(\\'' + r.id + '\\')">' + (r.enabled ? '禁用' : '启用') + '</button>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteMonitoringRule(\\'' + r.id + '\\')">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
      if (limit > 0 && monitoringRules.length > limit) {
        tbody.innerHTML += '<tr><td colspan="10" style="text-align:center;color:#999;font-size:12px;">显示 ' + limit + ' / ' + monitoringRules.length + ' 条</td></tr>';
      }
    }

    let allStatuses = [];
    
    async function loadMonitoringStatus() {
      if (!apiToken) return;
      try {
        const res = await fetch('/api/monitoring/status', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        allStatuses = data.statuses || [];
        updateStatusRuleFilter();
        renderMonitoringStatus(allStatuses);
      } catch (e) {
        console.error('加载监控状态失败', e);
      }
    }
    
    function updateStatusRuleFilter() {
      const select = document.getElementById('status-rule-filter');
      if (!select) return;
      const currentValue = select.value;
      const options = ['<option value="">全部规则</option>'];
      allStatuses.forEach(s => {
        const label = (s.rule?.merchant || '') + ' / ' + (s.rule?.name || '');
        options.push('<option value="' + s.ruleId + '"' + (s.ruleId === currentValue ? ' selected' : '') + '>' + escapeHtml(label) + '</option>');
      });
      select.innerHTML = options.join('');
    }
    
    function filterStatus() {
      renderMonitoringStatus(allStatuses);
    }

    function renderMonitoringStatus(statuses) {
      const tbody = document.getElementById('monitoring-status-table');
      if (statuses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999">暂无状态数据</td></tr>';
        return;
      }
      
      const ruleFilter = document.getElementById('status-rule-filter')?.value || '';
      const limit = parseInt(document.getElementById('status-rows-limit')?.value || '20', 10);
      
      let filtered = statuses;
      if (ruleFilter) {
        filtered = statuses.filter(s => s.ruleId === ruleFilter);
      }
      const displayStatuses = limit > 0 ? filtered.slice(0, limit) : filtered;
      
      tbody.innerHTML = displayStatuses.map(s => {
        const stateIcon = s.state === 'ACTIVE' ? '🟢' : (s.state === 'WEAK' ? '🟡' : '🔴');
        const stateClass = s.state === 'ACTIVE' ? 'status-enabled' : (s.state === 'WEAK' ? 'category-dynamic' : 'status-disabled');
        const lastSeenTime = s.lastSeenAt ? formatDateTime(new Date(s.lastSeenAt)) : '从未';
        const lastSeenAgo = s.lastSeenAt ? ' (' + formatTimeAgo(new Date(s.lastSeenAt)) + ')' : '';
        
        // Update rule state in rules table
        const ruleStateEl = document.getElementById('rule-state-' + s.ruleId);
        if (ruleStateEl) {
          ruleStateEl.innerHTML = '<span class="status ' + stateClass + '">' + stateIcon + ' ' + s.state + '</span>';
        }
        
        return '<tr>' +
          '<td><span class="status ' + stateClass + '">' + stateIcon + ' ' + s.state + '</span></td>' +
          '<td><strong>' + escapeHtml(s.rule?.merchant || '-') + '</strong> / ' + escapeHtml(s.rule?.name || '-') + '</td>' +
          '<td title="' + lastSeenTime + '">' + lastSeenTime + lastSeenAgo + '</td>' +
          '<td>' + s.gapMinutes + ' 分钟</td>' +
          '<td>' + s.count24h + '</td>' +
          '<td>' + s.count12h + '</td>' +
          '<td>' + s.count1h + '</td>' +
        '</tr>';
      }).join('');
      
      if (limit > 0 && filtered.length > limit) {
        tbody.innerHTML += '<tr><td colspan="7" style="text-align:center;color:#999;font-size:12px;">显示 ' + limit + ' / ' + filtered.length + ' 条</td></tr>';
      }
    }

    function formatDateTime(date) {
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }

    function formatTimeAgo(date) {
      const now = new Date();
      const diff = Math.floor((now - date) / 1000 / 60);
      if (diff < 60) return diff + '分钟前';
      if (diff < 1440) return Math.floor(diff / 60) + '小时前';
      return Math.floor(diff / 1440) + '天前';
    }

    let allAlerts = [];
    
    async function loadMonitoringAlerts() {
      if (!apiToken) return;
      try {
        const limit = parseInt(document.getElementById('alert-rows-limit')?.value || '20', 10);
        // Load both signal alerts and ratio alerts
        const [signalRes, ratioRes] = await Promise.all([
          fetch('/api/monitoring/alerts?limit=' + (limit * 2), { headers: getHeaders() }),
          fetch('/api/monitoring/ratio/alerts?limit=' + (limit * 2), { headers: getHeaders() })
        ]);
        
        let signalAlerts = [];
        let ratioAlerts = [];
        
        if (signalRes.ok) {
          const signalData = await signalRes.json();
          signalAlerts = (signalData.alerts || []).map(a => ({ ...a, source: 'signal' }));
        }
        
        if (ratioRes.ok) {
          const ratioData = await ratioRes.json();
          ratioAlerts = (ratioData.alerts || []).map(a => ({ ...a, source: 'ratio' }));
        }
        
        // Merge and sort by createdAt descending
        allAlerts = [...signalAlerts, ...ratioAlerts].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        updateAlertRuleFilter();
        renderMonitoringAlerts(allAlerts);
      } catch (e) {
        console.error('加载告警历史失败', e);
      }
    }
    
    function updateAlertRuleFilter() {
      const select = document.getElementById('alert-rule-filter');
      if (!select) return;
      const currentValue = select.value;
      const ruleMap = new Map();
      
      // Build a lookup map from monitoring rules
      const monitoringRuleMap = new Map();
      monitoringRules.forEach(r => {
        monitoringRuleMap.set(r.id, r.merchant + ' / ' + r.name);
      });
      
      allAlerts.forEach(a => {
        if (a.source === 'signal') {
          // Try to get rule name from monitoring rules, fallback to alert data
          const ruleName = monitoringRuleMap.get(a.ruleId) || (a.rule ? a.rule.merchant + ' / ' + a.rule.name : a.ruleId);
          ruleMap.set(a.ruleId, '[信号] ' + ruleName);
        } else if (a.source === 'ratio') {
          // Extract monitor name from message or use monitorId
          const monitorName = a.message?.match(/\\[.*?\\]\\s*(.+?)\\n/)?.[1] || a.monitorId;
          ruleMap.set(a.monitorId, '[比例] ' + monitorName);
        }
      });
      
      const options = ['<option value="">全部规则</option>'];
      ruleMap.forEach((label, id) => {
        // Truncate long labels
        const displayLabel = label.length > 30 ? label.substring(0, 27) + '...' : label;
        options.push('<option value="' + id + '"' + (id === currentValue ? ' selected' : '') + ' title="' + escapeHtml(label) + '">' + escapeHtml(displayLabel) + '</option>');
      });
      select.innerHTML = options.join('');
    }
    
    function filterAlerts() {
      renderMonitoringAlerts(allAlerts);
    }

    function renderMonitoringAlerts(alerts) {
      const tbody = document.getElementById('monitoring-alerts-table');
      if (alerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#999">暂无告警记录</td></tr>';
        document.getElementById('batch-delete-alerts-btn').style.display = 'none';
        return;
      }
      
      const ruleFilter = document.getElementById('alert-rule-filter')?.value || '';
      const limit = parseInt(document.getElementById('alert-rows-limit')?.value || '20', 10);
      
      let filtered = alerts;
      if (ruleFilter) {
        filtered = alerts.filter(a => (a.source === 'signal' ? a.ruleId : a.monitorId) === ruleFilter);
      }
      const displayAlerts = filtered.slice(0, limit);
      
      tbody.innerHTML = displayAlerts.map(a => {
        let typeIcon, typeText;
        switch (a.alertType) {
          case 'SIGNAL_RECOVERED':
            typeIcon = '✅'; typeText = '信号恢复'; break;
          case 'FREQUENCY_DOWN':
            typeIcon = '⚠️'; typeText = '频率下降'; break;
          case 'SIGNAL_DEAD':
            typeIcon = '🚨'; typeText = '信号消失'; break;
          case 'RATIO_LOW':
            typeIcon = '📉'; typeText = '比例过低'; break;
          case 'RATIO_RECOVERED':
            typeIcon = '📈'; typeText = '比例恢复'; break;
          default:
            typeIcon = '❓'; typeText = a.alertType;
        }
        const sentStatus = a.sentAt ? '<span class="status status-enabled" style="white-space:nowrap;">已发送</span>' : '<span class="status status-disabled" style="white-space:nowrap;">未发送</span>';
        const time = new Date(a.createdAt).toLocaleString('zh-CN');
        
        // Different display for signal vs ratio alerts
        let infoCol, nameCol;
        if (a.source === 'ratio') {
          infoCol = a.currentRatio.toFixed(1) + '%';
          nameCol = escapeHtml(a.message || a.monitorId);
        } else {
          infoCol = a.gapMinutes + ' 分钟';
          nameCol = escapeHtml(a.rule?.name || a.message || a.ruleId);
        }
        
        const checkbox = '<input type="checkbox" class="alert-checkbox" data-id="' + a.id + '" data-source="' + a.source + '" onchange="updateBatchDeleteBtn()">';
        const deleteBtn = '<button class="btn btn-sm btn-danger" onclick="deleteAlert(\\'' + a.id + '\\', \\'' + a.source + '\\')">删除</button>';
        
        return '<tr>' +
          '<td>' + checkbox + '</td>' +
          '<td>' + time + '</td>' +
          '<td>' + typeIcon + ' ' + typeText + '</td>' +
          '<td>' + nameCol + '</td>' +
          '<td>' + a.previousState + ' → ' + a.currentState + '</td>' +
          '<td>' + infoCol + '</td>' +
          '<td>' + sentStatus + '</td>' +
          '<td>' + deleteBtn + '</td>' +
        '</tr>';
      }).join('');
      
      if (filtered.length > limit) {
        tbody.innerHTML += '<tr><td colspan="8" style="text-align:center;color:#999;font-size:12px;">显示 ' + limit + ' / ' + filtered.length + ' 条</td></tr>';
      }
      
      // Reset select all checkbox
      document.getElementById('select-all-alerts').checked = false;
      document.getElementById('batch-delete-alerts-btn').style.display = 'none';
    }
    
    function toggleSelectAllAlerts() {
      const selectAll = document.getElementById('select-all-alerts').checked;
      document.querySelectorAll('.alert-checkbox').forEach(cb => cb.checked = selectAll);
      updateBatchDeleteBtn();
    }
    
    function updateBatchDeleteBtn() {
      const checkedCount = document.querySelectorAll('.alert-checkbox:checked').length;
      const btn = document.getElementById('batch-delete-alerts-btn');
      if (checkedCount > 0) {
        btn.style.display = 'inline-flex';
        btn.textContent = '🗑️ 删除选中 (' + checkedCount + ')';
      } else {
        btn.style.display = 'none';
      }
    }
    
    async function batchDeleteAlerts() {
      const checkboxes = document.querySelectorAll('.alert-checkbox:checked');
      if (checkboxes.length === 0) return;
      
      if (!confirm('确定要删除选中的 ' + checkboxes.length + ' 条告警记录吗？')) return;
      
      let successCount = 0;
      let failCount = 0;
      
      for (const cb of checkboxes) {
        const id = cb.dataset.id;
        const source = cb.dataset.source;
        try {
          const url = source === 'ratio' ? '/api/monitoring/ratio/alerts/' + id : '/api/monitoring/alerts/' + id;
          const res = await fetch(url, {
            method: 'DELETE',
            headers: getHeaders()
          });
          if (res.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          failCount++;
        }
      }
      
      if (failCount === 0) {
        showAlert('成功删除 ' + successCount + ' 条记录');
      } else {
        showAlert('删除完成: 成功 ' + successCount + ' 条, 失败 ' + failCount + ' 条', 'error');
      }
      loadMonitoringAlerts();
    }
    
    async function deleteAlert(id, source) {
      if (!confirm('确定要删除这条告警记录吗？')) return;
      try {
        const url = source === 'ratio' ? '/api/monitoring/ratio/alerts/' + id : '/api/monitoring/alerts/' + id;
        const res = await fetch(url, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          showAlert('删除成功');
          loadMonitoringAlerts();
        } else {
          showAlert('删除失败', 'error');
        }
      } catch (e) {
        showAlert('删除失败', 'error');
      }
    }

    // Add monitoring rule form
    document.getElementById('add-monitoring-rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tagsInput = document.getElementById('monitoring-tags').value;
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
      const intervalValue = document.getElementById('monitoring-interval').value;
      const deadAfterValue = document.getElementById('monitoring-dead-after').value;
      const expectedIntervalMinutes = parseInt(intervalValue, 10);
      const deadAfterMinutes = parseInt(deadAfterValue, 10);
      if (!intervalValue || isNaN(expectedIntervalMinutes) || expectedIntervalMinutes <= 0) {
        showAlert('预期间隔必须是正整数', 'error');
        return;
      }
      if (!deadAfterValue || isNaN(deadAfterMinutes) || deadAfterMinutes <= 0) {
        showAlert('死亡阈值必须是正整数', 'error');
        return;
      }
      const data = {
        merchant: document.getElementById('monitoring-merchant').value,
        name: document.getElementById('monitoring-name').value,
        subjectPattern: document.getElementById('monitoring-pattern').value,
        matchMode: document.getElementById('monitoring-match-mode').value,
        expectedIntervalMinutes: expectedIntervalMinutes,
        deadAfterMinutes: deadAfterMinutes,
        tags: tags,
        workerScope: document.getElementById('monitoring-worker-scope').value,
        enabled: true
      };
      try {
        const res = await fetch('/api/monitoring/rules', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(data)
        });
        if (res.ok) {
          hideModal('add-monitoring-rule-modal');
          document.getElementById('add-monitoring-rule-form').reset();
          showAlert('监控规则创建成功');
          loadMonitoringData();
        } else {
          const err = await res.json();
          showAlert(err.error || '创建失败', 'error');
        }
      } catch (e) {
        showAlert('创建失败', 'error');
      }
    });

    // Edit monitoring rule
    function editMonitoringRule(id) {
      const rule = monitoringRules.find(r => r.id === id);
      if (!rule) return;
      document.getElementById('edit-monitoring-id').value = rule.id;
      document.getElementById('edit-monitoring-merchant').value = rule.merchant;
      document.getElementById('edit-monitoring-name').value = rule.name;
      document.getElementById('edit-monitoring-pattern').value = rule.subjectPattern;
      document.getElementById('edit-monitoring-match-mode').value = rule.matchMode || 'contains';
      document.getElementById('edit-monitoring-interval').value = rule.expectedIntervalMinutes;
      document.getElementById('edit-monitoring-dead-after').value = rule.deadAfterMinutes;
      document.getElementById('edit-monitoring-tags').value = (rule.tags || []).join(', ');
      document.getElementById('edit-monitoring-worker-scope').value = rule.workerScope || 'global';
      showModal('edit-monitoring-rule-modal');
    }

    document.getElementById('edit-monitoring-rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-monitoring-id').value;
      const tagsInput = document.getElementById('edit-monitoring-tags').value;
      const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
      const intervalValue = document.getElementById('edit-monitoring-interval').value;
      const deadAfterValue = document.getElementById('edit-monitoring-dead-after').value;
      const expectedIntervalMinutes = parseInt(intervalValue, 10);
      const deadAfterMinutes = parseInt(deadAfterValue, 10);
      if (!intervalValue || isNaN(expectedIntervalMinutes) || expectedIntervalMinutes <= 0) {
        showAlert('预期间隔必须是正整数', 'error');
        return;
      }
      if (!deadAfterValue || isNaN(deadAfterMinutes) || deadAfterMinutes <= 0) {
        showAlert('死亡阈值必须是正整数', 'error');
        return;
      }
      const data = {
        merchant: document.getElementById('edit-monitoring-merchant').value,
        name: document.getElementById('edit-monitoring-name').value,
        subjectPattern: document.getElementById('edit-monitoring-pattern').value,
        matchMode: document.getElementById('edit-monitoring-match-mode').value,
        expectedIntervalMinutes: expectedIntervalMinutes,
        deadAfterMinutes: deadAfterMinutes,
        tags: tags,
        workerScope: document.getElementById('edit-monitoring-worker-scope').value
      };
      try {
        const res = await fetch('/api/monitoring/rules/' + id, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(data)
        });
        if (res.ok) {
          hideModal('edit-monitoring-rule-modal');
          showAlert('监控规则更新成功');
          loadMonitoringData();
        } else {
          const err = await res.json();
          showAlert(err.error || '更新失败', 'error');
        }
      } catch (e) {
        showAlert('更新失败', 'error');
      }
    });

    async function toggleMonitoringRule(id) {
      try {
        const res = await fetch('/api/monitoring/rules/' + id + '/toggle', {
          method: 'PATCH',
          headers: getHeaders()
        });
        if (res.ok) {
          loadMonitoringData();
        }
      } catch (e) {
        showAlert('操作失败', 'error');
      }
    }

    async function deleteMonitoringRule(id) {
      if (!confirm('确定要删除这个监控规则吗？')) return;
      try {
        const res = await fetch('/api/monitoring/rules/' + id, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          showAlert('删除成功');
          loadMonitoringData();
        }
      } catch (e) {
        showAlert('删除失败', 'error');
      }
    }

    async function triggerHeartbeat() {
      try {
        const res = await fetch('/api/monitoring/heartbeat', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        if (res.ok) {
          const data = await res.json();
          showAlert('心跳检查完成，检查了 ' + data.rulesChecked + ' 条规则，' + data.alertsTriggered + ' 条告警');
          loadMonitoringData();
        } else {
          showAlert('心跳检查失败', 'error');
        }
      } catch (e) {
        showAlert('心跳检查失败', 'error');
      }
    }

    // ==================== Ratio Monitor Functions ====================
    let ratioMonitors = [];
    let ratioStatuses = [];

    async function loadRatioMonitors() {
      if (!apiToken) return;
      try {
        const tagFilter = document.getElementById('ratio-tag-filter')?.value || '';
        const scopeFilter = document.getElementById('ratio-scope-filter')?.value || '';
        let url = '/api/monitoring/ratio';
        const params = [];
        if (tagFilter) params.push('tag=' + encodeURIComponent(tagFilter));
        if (scopeFilter) params.push('workerScope=' + encodeURIComponent(scopeFilter));
        if (params.length > 0) url += '?' + params.join('&');
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        ratioMonitors = data.monitors || [];
        await loadRatioStatus();
        renderRatioMonitors();
        updateRatioTagFilter();
        updateRatioRuleSelects();
      } catch (e) {
        console.error('加载比例监控失败', e);
      }
    }

    async function loadRatioStatus() {
      if (!apiToken) return;
      try {
        const res = await fetch('/api/monitoring/ratio/status', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        ratioStatuses = data.statuses || [];
      } catch (e) {
        console.error('加载比例状态失败', e);
      }
    }

    function updateRatioTagFilter() {
      const select = document.getElementById('ratio-tag-filter');
      if (!select) return;
      const currentValue = select.value;
      const allTags = new Set();
      ratioMonitors.forEach(r => allTags.add(r.tag));
      const options = ['<option value="">全部标签</option>'];
      Array.from(allTags).sort().forEach(tag => {
        options.push('<option value="' + escapeHtml(tag) + '"' + (tag === currentValue ? ' selected' : '') + '>' + escapeHtml(tag) + '</option>');
      });
      select.innerHTML = options.join('');
    }

    function updateRatioRuleSelects() {
      const optionsHtml = getRuleOptionsHtml();
      // Update all funnel step selects
      document.querySelectorAll('.funnel-step-rule').forEach(el => {
        const currentValue = el.value;
        el.innerHTML = optionsHtml;
        if (currentValue) el.value = currentValue;
      });
    }

    function renderRatioMonitors() {
      const container = document.getElementById('ratio-monitors-container');
      if (ratioMonitors.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">暂无漏斗监控</div>';
        return;
      }
      const limit = parseInt(document.getElementById('funnel-rows-limit')?.value || '10', 10);
      const displayMonitors = limit > 0 ? ratioMonitors.slice(0, limit) : ratioMonitors;
      let html = displayMonitors.map(r => {
        const status = ratioStatuses.find(s => s.monitorId === r.id);
        const enabledStatus = r.enabled ? '<span class="status status-enabled">启用</span>' : '<span class="status status-disabled">禁用</span>';
        const timeWindowText = r.timeWindow === '1h' ? '1小时' : (r.timeWindow === '12h' ? '12小时' : '24小时');
        
        // Build funnel visualization
        const funnelSteps = status?.funnelSteps || [];
        let funnelHtml = '<div style="display:flex;flex-direction:column;gap:4px;margin:15px 0;">';
        
        // Get thresholds for each step
        const stepThresholds = [100, r.thresholdPercent]; // Step 1 is base (100%), Step 2 uses main threshold
        (r.steps || []).forEach(s => stepThresholds.push(s.thresholdPercent));
        
        if (funnelSteps.length > 0) {
          const maxCount = Math.max(...funnelSteps.map(s => s.count), 1);
          funnelSteps.forEach((step, idx) => {
            const widthPercent = Math.max(20, (step.count / maxCount) * 100);
            const stepStateIcon = step.state === 'HEALTHY' ? '🟢' : '🔴';
            const bgColor = step.state === 'HEALTHY' ? '#d4edda' : '#f8d7da';
            const borderColor = step.state === 'HEALTHY' ? '#28a745' : '#dc3545';
            const threshold = stepThresholds[idx] || 80;
            
            funnelHtml += '<div style="display:flex;align-items:center;gap:10px;">' +
              '<div style="width:30px;text-align:center;font-weight:bold;color:#666;">' + step.order + '</div>' +
              '<div style="flex:1;position:relative;">' +
                '<div style="width:' + widthPercent + '%;background:' + bgColor + ';border:2px solid ' + borderColor + ';border-radius:4px;padding:8px 12px;transition:width 0.3s;">' +
                  '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                    '<span style="font-weight:500;">' + escapeHtml(step.ruleName) + '</span>' +
                    '<span style="font-size:13px;">' +
                      '<strong>' + step.count + '</strong> 封' +
                      (idx > 0 ? ' | 转化率: <strong>' + step.ratioToPrevious.toFixed(1) + '%</strong>' : '') +
                      ' ' + stepStateIcon +
                    '</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';
            // Add arrow with threshold between steps
            if (idx < funnelSteps.length - 1) {
              const nextThreshold = stepThresholds[idx + 1] || 80;
              const nextStepState = funnelSteps[idx + 1]?.state || 'HEALTHY';
              const thresholdColor = nextStepState === 'HEALTHY' ? '#28a745' : '#dc3545';
              funnelHtml += '<div style="margin-left:30px;padding-left:20px;display:flex;align-items:center;gap:8px;">' +
                '<span style="color:#999;">↓</span>' +
                '<span style="font-size:11px;padding:2px 6px;background:' + (nextStepState === 'HEALTHY' ? '#e8f5e9' : '#ffebee') + ';color:' + thresholdColor + ';border-radius:3px;border:1px solid ' + thresholdColor + ';">阈值: ' + nextThreshold + '%</span>' +
              '</div>';
            }
          });
        } else {
          funnelHtml += '<div style="color:#999;text-align:center;">暂无数据</div>';
        }
        funnelHtml += '</div>';
        
        // Build threshold status badges
        let thresholdBadges = '';
        if (funnelSteps.length > 1) {
          for (let i = 1; i < funnelSteps.length; i++) {
            const stepState = funnelSteps[i].state;
            const threshold = stepThresholds[i] || 80;
            const badgeColor = stepState === 'HEALTHY' ? '#28a745' : '#dc3545';
            const badgeBg = stepState === 'HEALTHY' ? '#e8f5e9' : '#ffebee';
            const badgeIcon = stepState === 'HEALTHY' ? '🟢' : '🔴';
            thresholdBadges += '<span style="font-size:11px;padding:2px 6px;background:' + badgeBg + ';color:' + badgeColor + ';border-radius:3px;border:1px solid ' + badgeColor + ';margin-right:4px;">' + (i) + '→' + (i+1) + ': ' + threshold + '% ' + badgeIcon + '</span>';
          }
        }
        
        const workerScope = r.workerScope || 'global';
        const scopeBadge = workerScope === 'global' 
          ? '<span class="tag" style="background:#e3f2fd;color:#1565c0;">🌐 全局</span>'
          : '<span class="tag" style="background:#fff3e0;color:#e65100;">📍 ' + escapeHtml(workerScope) + '</span>';
        
        return '<div style="border:1px solid #eee;border-radius:8px;padding:15px;margin-bottom:15px;background:#fafafa;">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
              '<strong style="font-size:16px;">' + escapeHtml(r.name) + '</strong>' +
              ' <span class="tag">' + escapeHtml(r.tag) + '</span>' +
              ' ' + scopeBadge +
              ' ' + enabledStatus +
            '</div>' +
            '<div class="actions" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
              '<span style="color:#666;font-size:12px;">时间窗口: ' + timeWindowText + '</span>' +
              thresholdBadges +
              '<button class="btn btn-sm btn-primary" onclick="editRatioMonitor(\\'' + r.id + '\\')">编辑</button>' +
              '<button class="btn btn-sm btn-' + (r.enabled ? 'warning' : 'success') + '" onclick="toggleRatioMonitor(\\'' + r.id + '\\')">' + (r.enabled ? '禁用' : '启用') + '</button>' +
              '<button class="btn btn-sm btn-danger" onclick="deleteRatioMonitor(\\'' + r.id + '\\')">删除</button>' +
            '</div>' +
          '</div>' +
          funnelHtml +
        '</div>';
      }).join('');
      
      if (limit > 0 && ratioMonitors.length > limit) {
        html += '<div style="text-align:center;color:#999;font-size:12px;padding:10px;">显示 ' + limit + ' / ' + ratioMonitors.length + ' 条</div>';
      }
      container.innerHTML = html;
    }

    // Funnel step management
    let funnelStepCounter = 2;
    
    function addFunnelStep() {
      funnelStepCounter++;
      const container = document.getElementById('funnel-steps-container');
      const defaultThreshold = document.getElementById('ratio-threshold').value || 80;
      const stepHtml = '<div class="funnel-step" data-order="' + funnelStepCounter + '" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">' +
        '<span style="width:30px;font-weight:bold;color:#666;">' + funnelStepCounter + '</span>' +
        '<select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">' +
          getRuleOptionsHtml() +
        '</select>' +
        '<input type="number" class="funnel-step-threshold" value="' + defaultThreshold + '" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%">' +
        '<button type="button" class="btn btn-sm btn-danger" onclick="removeFunnelStep(this)" style="padding:4px 8px;">×</button>' +
      '</div>';
      container.insertAdjacentHTML('beforeend', stepHtml);
    }
    
    function removeFunnelStep(btn) {
      btn.closest('.funnel-step').remove();
      renumberFunnelSteps('funnel-steps-container');
    }
    
    function renumberFunnelSteps(containerId) {
      const container = document.getElementById(containerId);
      const steps = container.querySelectorAll('.funnel-step');
      steps.forEach((step, idx) => {
        step.dataset.order = idx + 1;
        step.querySelector('span').textContent = idx + 1;
      });
      if (containerId === 'funnel-steps-container') {
        funnelStepCounter = steps.length;
      } else {
        editFunnelStepCounter = steps.length;
      }
    }
    
    function getRuleOptionsHtml() {
      let html = '<option value="">选择规则...</option>';
      monitoringRules.forEach(r => {
        html += '<option value="' + r.id + '">' + escapeHtml(r.merchant + ' - ' + r.name) + '</option>';
      });
      return html;
    }
    
    function collectFunnelSteps(containerId) {
      const container = document.getElementById(containerId);
      const stepElements = container.querySelectorAll('.funnel-step');
      const steps = [];
      stepElements.forEach((el, idx) => {
        const ruleId = el.querySelector('.funnel-step-rule').value;
        const threshold = parseFloat(el.querySelector('.funnel-step-threshold').value) || 80;
        if (ruleId) {
          steps.push({ ruleId, order: idx + 1, thresholdPercent: threshold });
        }
      });
      return steps;
    }

    // Add ratio monitor form
    document.getElementById('add-ratio-monitor-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const steps = collectFunnelSteps('funnel-steps-container');
      if (steps.length < 2) {
        showAlert('至少需要两个步骤', 'error');
        return;
      }
      const data = {
        name: document.getElementById('ratio-name').value,
        tag: document.getElementById('ratio-tag').value,
        firstRuleId: steps[0].ruleId,
        secondRuleId: steps[1].ruleId,
        steps: steps.slice(2).map((s, idx) => ({ ruleId: s.ruleId, order: idx + 3, thresholdPercent: s.thresholdPercent })),
        thresholdPercent: steps[1].thresholdPercent,
        timeWindow: document.getElementById('ratio-time-window').value,
        workerScope: document.getElementById('ratio-worker-scope').value,
        enabled: true
      };
      try {
        const res = await fetch('/api/monitoring/ratio', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(data)
        });
        if (res.ok) {
          hideModal('add-ratio-monitor-modal');
          document.getElementById('add-ratio-monitor-form').reset();
          resetFunnelSteps();
          showAlert('漏斗监控创建成功');
          loadRatioMonitors();
        } else {
          const err = await res.json();
          showAlert(err.error || '创建失败', 'error');
        }
      } catch (e) {
        showAlert('创建失败', 'error');
      }
    });
    
    function resetFunnelSteps() {
      funnelStepCounter = 2;
      const container = document.getElementById('funnel-steps-container');
      container.innerHTML = '<div class="funnel-step" data-order="1" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">' +
        '<span style="width:30px;font-weight:bold;color:#666;">1</span>' +
        '<select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">' + getRuleOptionsHtml() + '</select>' +
        '<input type="number" class="funnel-step-threshold" value="100" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%" disabled>' +
        '<span style="color:#888;font-size:12px;">基准</span>' +
      '</div>' +
      '<div class="funnel-step" data-order="2" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">' +
        '<span style="width:30px;font-weight:bold;color:#666;">2</span>' +
        '<select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">' + getRuleOptionsHtml() + '</select>' +
        '<input type="number" class="funnel-step-threshold" value="80" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%">' +
        '<span style="color:#888;font-size:12px;">%</span>' +
      '</div>';
    }

    // Edit funnel step management
    let editFunnelStepCounter = 0;
    
    function addEditFunnelStep() {
      editFunnelStepCounter++;
      const container = document.getElementById('edit-funnel-steps-container');
      const defaultThreshold = document.getElementById('edit-ratio-threshold').value || 80;
      const stepHtml = '<div class="funnel-step" data-order="' + editFunnelStepCounter + '" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">' +
        '<span style="width:30px;font-weight:bold;color:#666;">' + editFunnelStepCounter + '</span>' +
        '<select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">' +
          getRuleOptionsHtml() +
        '</select>' +
        '<input type="number" class="funnel-step-threshold" value="' + defaultThreshold + '" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%">' +
        (editFunnelStepCounter > 2 ? '<button type="button" class="btn btn-sm btn-danger" onclick="removeEditFunnelStep(this)" style="padding:4px 8px;">×</button>' : '<span style="color:#888;font-size:12px;">' + (editFunnelStepCounter === 1 ? '基准' : '%') + '</span>') +
      '</div>';
      container.insertAdjacentHTML('beforeend', stepHtml);
    }
    
    function removeEditFunnelStep(btn) {
      btn.closest('.funnel-step').remove();
      renumberFunnelSteps('edit-funnel-steps-container');
    }

    function editRatioMonitor(id) {
      const monitor = ratioMonitors.find(r => r.id === id);
      if (!monitor) return;
      document.getElementById('edit-ratio-id').value = monitor.id;
      document.getElementById('edit-ratio-name').value = monitor.name;
      document.getElementById('edit-ratio-tag').value = monitor.tag;
      document.getElementById('edit-ratio-threshold').value = monitor.thresholdPercent;
      document.getElementById('edit-ratio-time-window').value = monitor.timeWindow;
      document.getElementById('edit-ratio-worker-scope').value = monitor.workerScope || 'global';
      
      // Build steps UI - collect all steps first, then build HTML once
      const container = document.getElementById('edit-funnel-steps-container');
      container.innerHTML = '';
      editFunnelStepCounter = 0;
      
      // Collect all steps data
      const allSteps = [
        { order: 1, ruleId: monitor.firstRuleId, thresholdPercent: 100, isBase: true },
        { order: 2, ruleId: monitor.secondRuleId, thresholdPercent: monitor.thresholdPercent, isBase: false }
      ];
      (monitor.steps || []).forEach((step, idx) => {
        allSteps.push({ order: idx + 3, ruleId: step.ruleId, thresholdPercent: step.thresholdPercent, isBase: false, removable: true });
      });
      
      // Build all HTML at once
      let html = '';
      allSteps.forEach(step => {
        editFunnelStepCounter = step.order;
        if (step.isBase) {
          html += '<div class="funnel-step" data-order="' + step.order + '" data-rule-id="' + step.ruleId + '" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">' +
            '<span style="width:30px;font-weight:bold;color:#666;">' + step.order + '</span>' +
            '<select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">' + getRuleOptionsHtml() + '</select>' +
            '<input type="number" class="funnel-step-threshold" value="100" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%" disabled>' +
            '<span style="color:#888;font-size:12px;">基准</span>' +
          '</div>';
        } else if (step.removable) {
          html += '<div class="funnel-step" data-order="' + step.order + '" data-rule-id="' + step.ruleId + '" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">' +
            '<span style="width:30px;font-weight:bold;color:#666;">' + step.order + '</span>' +
            '<select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">' + getRuleOptionsHtml() + '</select>' +
            '<input type="number" class="funnel-step-threshold" value="' + step.thresholdPercent + '" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%">' +
            '<button type="button" class="btn btn-sm btn-danger" onclick="removeEditFunnelStep(this)" style="padding:4px 8px;">×</button>' +
          '</div>';
        } else {
          html += '<div class="funnel-step" data-order="' + step.order + '" data-rule-id="' + step.ruleId + '" style="display:flex;gap:10px;align-items:center;margin-bottom:8px;padding:8px;background:white;border-radius:4px;border:1px solid #ddd;">' +
            '<span style="width:30px;font-weight:bold;color:#666;">' + step.order + '</span>' +
            '<select class="funnel-step-rule" required style="flex:1;padding:6px;border:1px solid #ddd;border-radius:4px;">' + getRuleOptionsHtml() + '</select>' +
            '<input type="number" class="funnel-step-threshold" value="' + step.thresholdPercent + '" min="0" max="100" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:4px;" placeholder="阈值%">' +
            '<span style="color:#888;font-size:12px;">%</span>' +
          '</div>';
        }
      });
      container.innerHTML = html;
      
      // Now set all select values after DOM is built
      allSteps.forEach(step => {
        const stepEl = container.querySelector('.funnel-step[data-order="' + step.order + '"] .funnel-step-rule');
        if (stepEl) stepEl.value = step.ruleId;
      });
      
      showModal('edit-ratio-monitor-modal');
    }

    document.getElementById('edit-ratio-monitor-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-ratio-id').value;
      const steps = collectFunnelSteps('edit-funnel-steps-container');
      if (steps.length < 2) {
        showAlert('至少需要两个步骤', 'error');
        return;
      }
      const data = {
        name: document.getElementById('edit-ratio-name').value,
        tag: document.getElementById('edit-ratio-tag').value,
        firstRuleId: steps[0].ruleId,
        secondRuleId: steps[1].ruleId,
        steps: steps.slice(2).map((s, idx) => ({ ruleId: s.ruleId, order: idx + 3, thresholdPercent: s.thresholdPercent })),
        thresholdPercent: steps[1].thresholdPercent,
        timeWindow: document.getElementById('edit-ratio-time-window').value,
        workerScope: document.getElementById('edit-ratio-worker-scope').value
      };
      try {
        const res = await fetch('/api/monitoring/ratio/' + id, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(data)
        });
        if (res.ok) {
          hideModal('edit-ratio-monitor-modal');
          showAlert('漏斗监控更新成功');
          loadRatioMonitors();
        } else {
          const err = await res.json();
          showAlert(err.error || '更新失败', 'error');
        }
      } catch (e) {
        showAlert('更新失败', 'error');
      }
    });

    async function toggleRatioMonitor(id) {
      const monitor = ratioMonitors.find(r => r.id === id);
      if (!monitor) return;
      try {
        const res = await fetch('/api/monitoring/ratio/' + id, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ enabled: !monitor.enabled })
        });
        if (res.ok) {
          loadRatioMonitors();
        }
      } catch (e) {
        showAlert('操作失败', 'error');
      }
    }

    async function deleteRatioMonitor(id) {
      if (!confirm('确定要删除这个比例监控吗？')) return;
      try {
        const res = await fetch('/api/monitoring/ratio/' + id, {
          method: 'DELETE',
          headers: getHeaders()
        });
        if (res.ok) {
          showAlert('删除成功');
          loadRatioMonitors();
        }
      } catch (e) {
        showAlert('删除失败', 'error');
      }
    }

    async function checkRatioMonitors() {
      try {
        const res = await fetch('/api/monitoring/ratio/check', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        if (res.ok) {
          const data = await res.json();
          showAlert('比例检查完成，检查了 ' + data.monitorsChecked + ' 个监控，' + data.alertsTriggered + ' 条告警');
          loadRatioMonitors();
        } else {
          showAlert('比例检查失败', 'error');
        }
      } catch (e) {
        showAlert('比例检查失败', 'error');
      }
    }

    // Init
    if (apiToken) {
      document.getElementById('api-status').textContent = 'API Token: 已配置';
      loadWorkers();
    }
    // Restore auto-refresh settings from localStorage
    restoreAutoRefreshSettings();
  </script>
</body>
</html>`;

export async function frontendRoutes(app: FastifyInstance): Promise<void> {
  // Serve admin panel (no auth required, auth is done via API calls)
  app.get('/admin', async (request, reply) => {
    reply.type('text/html').send(HTML_TEMPLATE);
  });
}
