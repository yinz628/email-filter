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
    .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
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
    .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; vertical-align: middle; }
    th { background: #f8f9fa; font-weight: 600; color: #555; position: sticky; top: 0; }
    td { color: #333; }
    tr:hover { background: #f8f9fa; }
    tr.clickable-row { cursor: pointer; }
    tr.clickable-row:hover { background: #e3f2fd; }
    .status { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .status-enabled { background: #d4edda; color: #155724; }
    .status-disabled { background: #f8d7da; color: #721c24; }
    .status-warning { background: #fff3cd; color: #856404; }
    .category { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .category-whitelist { background: #d4edda; color: #155724; }
    .category-blacklist { background: #f8d7da; color: #721c24; }
    .category-dynamic { background: #fff3cd; color: #856404; }
    .hidden { display: none !important; }
    .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
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
    
    /* ========== Mobile Responsive Styles ========== */
    @media (max-width: 768px) {
      body { font-size: 13px; }
      .container { padding: 8px; }
      .header { padding: 10px 12px; flex-direction: column; gap: 10px; text-align: center; }
      .header h1 { font-size: 15px; }
      .user-info { flex-wrap: wrap; justify-content: center; gap: 8px; }
      .user-info .username { font-size: 12px; }
      .btn-logout { padding: 4px 10px; font-size: 11px; }
      
      /* Tabs - wrap on mobile so feature tabs are always discoverable */
      .tabs {
        gap: 4px;
        padding: 6px;
        flex-wrap: wrap;
      }
      .tab {
        padding: 6px 10px;
        font-size: 11px;
        white-space: nowrap;
      }
      
      /* Cards */
      .card { padding: 10px; margin-bottom: 10px; }
      .card h2 { font-size: 14px; margin-bottom: 10px; padding-bottom: 6px; }
      
      /* Forms */
      .form-row { grid-template-columns: 1fr; gap: 8px; }
      .form-group { margin-bottom: 10px; }
      .form-group label { font-size: 12px; margin-bottom: 3px; }
      .form-group input, .form-group select { padding: 8px; font-size: 14px; }
      
      /* Buttons */
      .btn { padding: 6px 10px; font-size: 12px; }
      .btn-sm { padding: 4px 8px; font-size: 11px; }
      .actions { flex-wrap: wrap; gap: 4px; }
      
      /* Tables - make scrollable */
      .table-wrapper { 
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }
      table { min-width: 600px; font-size: 12px; }
      th, td { padding: 6px 8px; }
      .text-truncate { max-width: 120px; }
      
      /* Stats */
      .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
      .stat-card { padding: 12px; }
      .stat-value { font-size: 22px; }
      .stat-label { font-size: 11px; }
      
      /* Modals */
      .modal-content { 
        width: 95%; 
        max-width: none; 
        margin: 10px;
        padding: 15px;
        max-height: 90vh;
      }
      .modal-header h3 { font-size: 14px; }
      
      /* Filter bar */
      .filter-bar { flex-direction: column; align-items: stretch; }
      .filter-bar select, .filter-bar input { width: 100%; }
      
      /* Login page */
      .login-container { margin: 40px auto; padding: 15px; }
      .login-card { padding: 20px; }
      .login-card h2 { font-size: 20px; }
      .login-card .logo { font-size: 36px; }
      
      /* Project tabs */
      .project-tab { padding: 8px 12px; font-size: 12px; }
      
      /* Path analysis */
      .path-node { padding: 10px; }
      .path-node-title { font-size: 13px; }
      .path-node-stats { font-size: 11px; }
      
      /* Monitoring page - card header controls */
      .card-header { flex-wrap: wrap; gap: 8px; }
      .card-header > div { flex-wrap: wrap; gap: 6px !important; }
      .card-header select { font-size: 11px; padding: 4px 6px; }
      .card-header label { font-size: 11px; }
      .card-header .btn-sm { font-size: 10px; padding: 4px 6px; }
      
      /* Hide less important columns on mobile */
      .hide-mobile { display: none !important; }
    }
    
    /* Extra small devices */
    @media (max-width: 480px) {
      .container { padding: 6px; }
      .header h1 { font-size: 14px; }
      .tab { padding: 5px 8px; font-size: 10px; }
      .card { padding: 8px; }
      .card h2 { font-size: 13px; }
      .btn { padding: 5px 8px; font-size: 11px; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .stat-value { font-size: 18px; }
      table { min-width: 500px; font-size: 11px; }
      th, td { padding: 5px 6px; }
      .modal-content { padding: 12px; }
    }
    
    /* Touch-friendly improvements */
    @media (hover: none) and (pointer: coarse) {
      .btn, .tab, .project-tab { min-height: 40px; }
      .form-group input, .form-group select { min-height: 44px; }
      tr.clickable-row { min-height: 48px; }
      .modal-close { width: 36px; height: 36px; font-size: 20px; }
    }
    
    /* Project Detail Tabs Styles */
    .project-tab { padding: 10px 20px; border: none; background: transparent; cursor: pointer; font-size: 14px; font-weight: 500; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
    .project-tab:hover { color: #4a90d9; background: #f8f9fa; }
    .project-tab.active { color: #4a90d9; border-bottom-color: #4a90d9; }
    .tab-panel { animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .project-indicator { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #27ae60; margin-right: 6px; }
    .root-badge { background: #4a90d9; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .candidate-badge { background: #ff9800; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; cursor: help; }
    .value-tag-0 { background: #e9ecef; color: #666; }
    .value-tag-1 { background: #d4edda; color: #155724; }
    .value-tag-2 { background: #fff3cd; color: #856404; }
    .value-tag-3 { background: #f8d7da; color: #721c24; }
    .path-node { padding: 12px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 8px; background: #fff; }
    .path-node.highlighted { border-color: #27ae60; background: #e8f5e9; }
    .path-node.highlighted.high-value { border-color: #ffc107; background: #fff8e1; }
    .path-node-title { font-weight: 600; margin-bottom: 4px; }
    .path-node-stats { font-size: 12px; color: #666; }
    .btn-warning { background: #ffc107; color: #212529; border: 1px solid #ffc107; }
    .btn-warning:hover { background: #e0a800; border-color: #d39e00; }
    /* Login page styles */
    .login-container { max-width: 400px; margin: 100px auto; padding: 20px; }
    .login-card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .login-card h2 { text-align: center; margin-bottom: 24px; color: #1a1a2e; font-size: 24px; }
    .login-card .logo { text-align: center; font-size: 48px; margin-bottom: 16px; }
    .login-error { background: #f8d7da; color: #721c24; padding: 10px 14px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; display: none; }
    /* User info in header */
    .user-info { display: flex; align-items: center; gap: 12px; }
    .user-info .username { font-size: 14px; color: rgba(255,255,255,0.9); }
    .user-info .role-badge { background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .btn-logout { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all 0.2s; }
    .btn-logout:hover { background: rgba(255,255,255,0.2); }
    /* Admin tab styles */
    .tab.admin-only { background: #fff3cd; color: #856404; }
    .tab.admin-only.active { background: #ffc107; color: #212529; }
  </style>
</head>
<body>
  <!-- Login Page -->
  <div id="login-page" class="login-container">
    <div class="login-card">
      <div class="logo">📧</div>
      <h2>Email Filter 管理面板</h2>
      <div id="login-error" class="login-error"></div>
      <form id="login-form">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="login-username" required placeholder="输入用户名" autocomplete="username">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="login-password" required placeholder="输入密码" autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%;padding:12px;font-size:14px;">登录</button>
      </form>
      <div style="margin-top:16px;text-align:center;">
        <p style="color:#999;font-size:12px;">或使用 API Token 登录（兼容旧版）</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="showLegacyLogin()" style="margin-top:8px;">使用 API Token</button>
      </div>
      <div id="legacy-login-section" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid #eee;">
        <div class="form-group">
          <label>API Token</label>
          <input type="password" id="login-api-token" placeholder="输入 API Token">
        </div>
        <button type="button" class="btn btn-secondary" style="width:100%;" onclick="loginWithApiToken()">使用 Token 登录</button>
      </div>
    </div>
  </div>

  <!-- Main App (hidden until logged in) -->
  <div id="main-app" class="container hidden">
    <div class="header">
      <h1>📧 Email Filter 管理面板</h1>
      <div class="user-info">
        <span class="username" id="current-username">-</span>
        <span class="role-badge" id="current-role">-</span>
        <button class="btn-logout" onclick="logout()">退出登录</button>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="showTab('workers')">⚙️ Worker 实例</button>
      <button class="tab" onclick="showTab('rules')">📋 过滤规则</button>
      <button class="tab" onclick="showTab('dynamic')">🔄 动态规则</button>
      <button class="tab" onclick="showTab('logs')">📝 日志</button>
      <button class="tab" onclick="showTab('stats')">📊 统计信息</button>
      <button class="tab" onclick="showTab('campaign')">📈 营销分析</button>
      <button class="tab" onclick="showTab('subjects')">📧 邮件主题</button>
      <button class="tab" onclick="showTab('monitoring')">📡 信号监控</button>
      <button class="tab" onclick="showTab('settings')">⚙️ 设置</button>
      <button class="tab admin-only hidden" id="users-tab-btn" onclick="showTab('users')">👥 用户管理</button>
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
        <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th class="hide-mobile">Worker URL</th>
              <th class="hide-mobile">默认转发地址</th>
              <th>在线状态</th>
              <th>启用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="workers-table"></tbody>
        </table>
        </div>
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
        <div style="background:#f8f9fa;border-left:4px solid #007bff;padding:12px 15px;margin-bottom:15px;border-radius:0 4px 4px 0;">
          <p style="color:#333;margin:0 0 8px 0;font-weight:500;">检测逻辑：先数量后时间跨度</p>
          <ol style="color:#666;margin:0;padding-left:20px;font-size:13px;line-height:1.6;">
            <li><strong>数量检测</strong>：系统持续统计时间窗口内同主题邮件的数量</li>
            <li><strong>时间跨度检测</strong>：当数量达到触发阈值时，计算第1封和第N封邮件的时间跨度</li>
            <li><strong>规则创建</strong>：若时间跨度 ≤ 时间跨度阈值，则自动创建黑名单规则拦截该主题</li>
          </ol>
          <p style="color:#888;margin:8px 0 0 0;font-size:12px;">注：只对默认转发的邮件进行检测，已匹配白名单、黑名单或现有动态规则的邮件不参与检测</p>
        </div>
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
            <input type="number" id="dynamic-time-window" min="5" max="120" value="30" placeholder="30">
            <p style="color:#888;font-size:12px;margin-top:5px">检测时间窗口，只统计此时间内的邮件（5-120分钟）</p>
          </div>
          <div class="form-group">
            <label>触发阈值（次数）</label>
            <input type="number" id="dynamic-threshold" min="5" value="30" placeholder="30">
            <p style="color:#888;font-size:12px;margin-top:5px">同主题邮件数量达到此值时触发时间跨度检测（最小5次）</p>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>时间跨度阈值（分钟）</label>
            <input type="number" id="dynamic-time-span-threshold" min="0.5" max="30" step="0.5" value="3" placeholder="3">
            <p style="color:#888;font-size:12px;margin-top:5px">第1封和第N封邮件的时间跨度小于等于此值时创建规则（0.5-30分钟）</p>
          </div>
          <div class="form-group">
            <label>规则过期时间（小时）</label>
            <input type="number" id="dynamic-expiration" min="1" value="48" placeholder="48">
            <p style="color:#888;font-size:12px;margin-top:5px">从未命中的规则，创建后超过此时间将被清理</p>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>最后命中阈值（小时）</label>
            <input type="number" id="dynamic-last-hit-threshold" min="1" value="72" placeholder="72">
            <p style="color:#888;font-size:12px;margin-top:5px">有命中记录的规则，最后命中超过此时间将被清理</p>
          </div>
          <div class="form-group"></div>
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
        <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>规则内容</th>
              <th class="hide-mobile">创建时间</th>
              <th class="hide-mobile">最后命中</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="dynamic-rules-table"></tbody>
        </table>
        </div>
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
              <option value="180">3分钟</option>
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
        <div style="flex:1;overflow-y:auto;overflow-x:auto;">
          <div class="table-wrapper" style="margin:0;">
          <table>
            <thead style="position:sticky;top:0;background:#f8f9fa;">
              <tr>
                <th style="width:40px;"><input type="checkbox" id="log-select-all" onchange="toggleSelectAllLogs()"></th>
                <th style="width:140px;">时间</th>
                <th style="width:80px;" class="hide-mobile">Worker</th>
                <th style="width:70px;">类型</th>
                <th style="width:180px;">主题</th>
                <th style="width:160px;" class="hide-mobile">发件人</th>
                <th style="width:160px;" class="hide-mobile">收件人</th>
                <th class="hide-mobile">命中规则</th>
              </tr>
            </thead>
            <tbody id="logs-table"></tbody>
          </table>
          </div>
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
              <option value="180">3分钟</option>
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
        <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th style="width:50px;">排名</th>
              <th>规则内容</th>
              <th style="width:100px;">拦截次数</th>
              <th style="width:200px;" class="hide-mobile">实例分布</th>
              <th style="width:160px;" class="hide-mobile">最后拦截</th>
            </tr>
          </thead>
          <tbody id="trending-rules-table"></tbody>
        </table>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">监控规则</h2>
          <button class="btn btn-primary" onclick="showModal('add-watch-modal')">+ 添加监控</button>
        </div>
        <p style="color:#666;margin-bottom:15px">监控规则仅统计命中次数，不影响邮件过滤</p>
        <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th class="hide-mobile">匹配字段</th>
              <th class="hide-mobile">匹配模式</th>
              <th>规则内容</th>
              <th>命中次数</th>
              <th class="hide-mobile">最后命中</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="watch-rules-table"></tbody>
        </table>
        </div>
      </div>
    </div>

    <!-- Campaign Analytics Tab -->
    <div id="campaign-tab" class="tab-content hidden">
      <!-- 商户列表区 (Merchant List Card) -->
      <div class="card" id="campaign-merchants-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">🏪 商户列表</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="campaign-worker-filter" onchange="onWorkerFilterChange()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="__all__">全部实例</option>
            </select>
            <select id="merchant-sort-field" onchange="sortMerchantList()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="emails">按邮件数排序</option>
              <option value="campaigns">按活动数排序</option>
            </select>
            <select id="merchant-sort-order" onchange="sortMerchantList()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="desc">降序</option>
              <option value="asc">升序</option>
            </select>
            <button class="btn btn-secondary" onclick="refreshCampaignData()">🔄 刷新</button>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="merchants-auto-refresh" onchange="toggleAutoRefresh('merchants')">
              <span>自动刷新</span>
            </label>
            <select id="merchants-refresh-interval" onchange="updateAutoRefreshInterval('merchants')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;width:70px;">
              <option value="60" selected>1分钟</option>
              <option value="180">3分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
            <button class="btn btn-warning" onclick="showOrphanedWorkersModal()" title="清理已删除实例的数据">🧹 清理过期数据</button>
          </div>
        </div>
        <p style="color:#666;margin-bottom:15px">商户数据按 Worker 实例分组显示。选择"全部实例"查看所有数据，或选择特定实例筛选。</p>
        <div id="merchants-batch-actions" style="display:none;margin-bottom:10px;padding:10px;background:#f8f9fa;border-radius:4px;">
          <span id="merchants-selected-count" style="margin-right:15px;font-weight:500;">已选择 0 项</span>
          <button class="btn btn-sm btn-danger" onclick="showBatchDeleteModal()">🗑️ 批量删除</button>
        </div>
        <div id="merchants-empty" style="text-align:center;padding:40px;">
          <div id="merchants-no-worker-prompt" style="display:none;color:#999;">请选择一个 Worker 实例查看商户数据。</div>
          <div id="merchants-loading" style="display:none;color:#999;">加载中...</div>
          <div id="merchants-empty-data" style="display:none;color:#999;">暂无商户数据。</div>
          <div id="merchants-load-error" style="display:none;color:#e74c3c;">加载商户列表失败。</div>
        </div>
        <div class="table-wrapper">
        <table id="merchants-table-container" style="display:none;">
          <thead>
            <tr>
              <th style="width:40px;"><input type="checkbox" id="merchants-select-all" onchange="toggleSelectAllMerchants(this.checked)" title="全选/取消全选"></th>
              <th>商户域名</th>
              <th id="worker-column-header" class="hide-mobile">Worker 实例</th>
              <th>活动数</th>
              <th>邮件数</th>
              <th class="hide-mobile">已有项目</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="merchants-table"></tbody>
        </table>
        </div>
      </div>

      <!-- 区域3: 项目列表区 (Project List Card) -->
      <div class="card" id="campaign-projects-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;flex-wrap:wrap;gap:10px;">
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
        <div class="table-wrapper">
        <table id="projects-table-container" style="display:none;">
          <thead>
            <tr>
              <th>项目名称</th>
              <th class="hide-mobile">商户域名</th>
              <th class="hide-mobile">Worker</th>
              <th>状态</th>
              <th class="hide-mobile">创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="projects-table"></tbody>
        </table>
        </div>
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
        <div class="project-detail-tabs" style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid #eee;padding-bottom:0;overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <button class="project-tab active" id="tab-root" onclick="switchProjectTab('root')" style="padding:10px 20px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;white-space:nowrap;flex-shrink:0;">
            🎯 Root确认
          </button>
          <button class="project-tab" id="tab-campaigns" onclick="switchProjectTab('campaigns')" style="padding:10px 20px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;white-space:nowrap;flex-shrink:0;">
            📧 营销活动
          </button>
          <button class="project-tab" id="tab-path" onclick="switchProjectTab('path')" style="padding:10px 20px;border:none;background:transparent;cursor:pointer;font-size:14px;font-weight:500;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;white-space:nowrap;flex-shrink:0;">
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
                <option value="3">无价值</option>
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
              <div style="display:flex;gap:8px;align-items:center;">
                <span id="path-last-analysis-time" style="font-size:12px;color:#666;"></span>
                <button class="btn btn-success btn-sm" id="start-analysis-btn" onclick="startProjectAnalysis()">▶️ 开始分析</button>
                <button class="btn btn-primary btn-sm" id="reanalyze-btn" onclick="startProjectReanalysis()" title="清除现有分析数据，重新分析所有新用户路径">🔄 重新分析</button>
                <button class="btn btn-warning btn-sm" onclick="cleanupOldCustomersForProject()">🧹 清理老客户数据</button>
              </div>
            </div>
            
            <!-- 分析进度显示区域 (Requirements 9.1, 9.2, 9.3, 9.4, 9.5) -->
            <div id="analysis-progress-container" style="display:none;margin-bottom:15px;padding:15px;background:#f8f9fa;border:1px solid #ddd;border-radius:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span id="analysis-phase-text" style="font-weight:500;color:#333;">准备中...</span>
                <span id="analysis-progress-percent" style="font-weight:bold;color:#4a90d9;">0%</span>
              </div>
              <div style="background:#e0e0e0;border-radius:4px;height:8px;overflow:hidden;">
                <div id="analysis-progress-bar" style="background:linear-gradient(90deg, #4a90d9, #27ae60);height:100%;width:0%;transition:width 0.3s ease;"></div>
              </div>
              <div id="analysis-progress-details" style="margin-top:8px;font-size:12px;color:#666;"></div>
            </div>
            
            <!-- 分析完成统计 (Requirements 9.4) -->
            <div id="analysis-complete-stats" style="display:none;margin-bottom:15px;padding:15px;background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <span style="font-size:20px;">✅</span>
                <span style="font-weight:500;color:#2e7d32;">分析完成</span>
              </div>
              <div id="analysis-complete-details" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-size:12px;"></div>
            </div>
            
            <!-- 分析错误显示 (Requirements 9.5) -->
            <div id="analysis-error-container" style="display:none;margin-bottom:15px;padding:15px;background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                <span style="font-size:20px;">❌</span>
                <span style="font-weight:500;color:#c62828;">分析失败</span>
              </div>
              <div id="analysis-error-message" style="font-size:12px;color:#c62828;"></div>
              <button class="btn btn-sm btn-primary" onclick="startProjectAnalysis()" style="margin-top:10px;">🔄 重试</button>
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
              <option value="180">3分钟</option>
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
              <option value="60" selected>1分钟</option>
              <option value="180">3分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="loadMonitoringAlerts()">🔄 刷新</button>
            <button class="btn btn-sm btn-danger" id="batch-delete-alerts-btn" onclick="batchDeleteAlerts()" style="display:none;">🗑️ 删除选中</button>
          </div>
        </div>
        <div class="card-body" id="alerts-card-body" style="margin-top:15px;">
          <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style="width:30px;"><input type="checkbox" id="select-all-alerts" onchange="toggleSelectAllAlerts()"></th>
                <th style="width:140px;">时间</th>
                <th class="hide-mobile">类型</th>
                <th style="min-width:250px;">规则</th>
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
              <option value="60" selected>1分钟</option>
              <option value="180">3分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="triggerHeartbeat()">💓 心跳检查</button>
            <button class="btn btn-sm btn-primary" onclick="showModal('add-monitoring-rule-modal')">+ 添加</button>
          </div>
        </div>
        <div class="card-body" id="rules-card-body" style="margin-top:15px;">
          <p style="color:#666;margin-bottom:15px">监控重点邮件信号的健康状态。当信号异常时自动告警。</p>
          <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>商户</th>
                <th>规则名称</th>
                <th class="hide-mobile">标签</th>
                <th class="hide-mobile">作用范围</th>
                <th class="hide-mobile">主题匹配</th>
                <th class="hide-mobile">预期间隔</th>
                <th class="hide-mobile">死亡阈值</th>
                <th>状态</th>
                <th>启用</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="monitoring-rules-table"></tbody>
          </table>
          </div>
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
              <option value="60" selected>1分钟</option>
              <option value="180">3分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="loadMonitoringStatus()">🔄 刷新</button>
          </div>
        </div>
        <div class="card-body" id="status-card-body" style="margin-top:15px;">
          <p style="color:#666;margin-bottom:15px">实时显示所有监控信号的健康状态。状态按 DEAD > WEAK > ACTIVE 排序。</p>
          <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>状态</th>
                <th>商户 / 规则</th>
                <th>最后出现</th>
                <th class="hide-mobile">间隔</th>
                <th class="hide-mobile">24h</th>
                <th class="hide-mobile">12h</th>
                <th class="hide-mobile">1h</th>
              </tr>
            </thead>
            <tbody id="monitoring-status-table"></tbody>
          </table>
          </div>
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
              <option value="60" selected>1分钟</option>
              <option value="180">3分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
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

    <!-- Subjects Tab -->
    <div id="subjects-tab" class="tab-content hidden">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #eee;padding-bottom:10px;">
          <h2 style="margin:0;border:none;padding:0;">📧 邮件主题统计</h2>
          <div style="display:flex;gap:10px;align-items:center;">
            <select id="subjects-worker-filter" onchange="resetSubjectsPageAndLoad()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="">全部实例</option>
            </select>
            <select id="subjects-merchant-filter" onchange="resetSubjectsPageAndLoad()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="">全部商户</option>
            </select>
            <select id="subjects-sort-order" onchange="resetSubjectsPageAndLoad()" style="padding:6px;border:1px solid #ddd;border-radius:4px;">
              <option value="desc">数量降序</option>
              <option value="asc">数量升序</option>
            </select>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="subjects-focus-filter" onchange="resetSubjectsPageAndLoad()">
              <span>仅显示关注</span>
            </label>
            <button class="btn btn-secondary" onclick="loadSubjects()">🔄 刷新</button>
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
              <input type="checkbox" id="subjects-auto-refresh" onchange="toggleAutoRefresh('subjects')">
              <span>自动刷新</span>
            </label>
            <select id="subjects-refresh-interval" onchange="updateAutoRefreshInterval('subjects')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:12px;width:70px;">
              <option value="60" selected>1分钟</option>
              <option value="180">3分钟</option>
              <option value="300">5分钟</option>
              <option value="600">10分钟</option>
            </select>
          </div>
        </div>
        <p style="color:#666;margin-bottom:15px">展示系统处理的所有邮件主题统计。支持按实例和商户域名筛选、数量排序和重点关注标记。</p>
        <div id="subjects-batch-actions" style="display:none;margin-bottom:10px;padding:10px;background:#f8f9fa;border-radius:4px;">
          <span id="subjects-selected-count" style="margin-right:15px;font-weight:500;">已选择 0 项</span>
          <button class="btn btn-sm btn-danger" onclick="batchDeleteSubjects()">🗑️ 批量删除</button>
        </div>
        <div id="subjects-empty" style="text-align:center;color:#999;padding:40px;display:none;">
          暂无邮件主题数据
        </div>
        <div class="table-wrapper">
          <table id="subjects-table-container">
            <thead>
              <tr>
                <th style="width:40px;"><input type="checkbox" id="subjects-select-all" onchange="toggleSelectAllSubjects(this.checked)" title="全选/取消全选"></th>
                <th>邮件主题</th>
                <th>商户域名</th>
                <th>Worker 实例</th>
                <th>邮件数量</th>
                <th>邮件时间</th>
                <th>关注</th>
                <th>忽略</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody id="subjects-table"></tbody>
          </table>
        </div>
        <div id="subjects-pagination" style="display:flex;justify-content:center;align-items:center;gap:10px;padding:15px 0;border-top:1px solid #eee;margin-top:10px;">
          <button class="btn btn-sm btn-secondary" onclick="prevSubjectsPage()" id="subjects-prev-btn" disabled>上一页</button>
          <span id="subjects-page-info" style="color:#666;font-size:13px;">第 1 页</span>
          <button class="btn btn-sm btn-secondary" onclick="nextSubjectsPage()" id="subjects-next-btn">下一页</button>
          <select id="subjects-page-size" onchange="changeSubjectsPageSize()" style="padding:6px;border:1px solid #ddd;border-radius:4px;font-size:13px;margin-left:10px;">
            <option value="20" selected>每页 20 条</option>
            <option value="50">每页 50 条</option>
            <option value="100">每页 100 条</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Settings Tab -->
    <div id="settings-tab" class="tab-content hidden">
      <div class="card">
        <h2>👤 账户信息</h2>
        <div id="account-info" style="margin-bottom:15px;">
          <p><strong>用户名:</strong> <span id="settings-username">-</span></p>
          <p><strong>角色:</strong> <span id="settings-role">-</span></p>
          <p><strong>认证方式:</strong> <span id="settings-auth-type">-</span></p>
        </div>
        <div id="legacy-auth-warning" class="alert alert-error" style="display:none;">
          ⚠️ 您正在使用旧版 API Token 认证。建议使用用户名/密码登录以获得完整功能（如设置同步）。
        </div>
      </div>
      <div class="card" id="user-settings-card">
        <h2>⚙️ 用户设置</h2>
        <p style="color:#666;margin-bottom:15px">这些设置会自动同步到服务器，在任何设备上登录都可以使用。</p>
        <div class="form-group">
          <label>默认 Worker 实例</label>
          <select id="setting-default-worker" onchange="saveUserSetting('defaultWorker', this.value)">
            <option value="">不指定</option>
          </select>
        </div>
        <div class="form-group">
          <label>日志自动刷新</label>
          <select id="setting-logs-auto-refresh" onchange="saveUserSetting('logsAutoRefresh', this.value === 'true')">
            <option value="false">禁用</option>
            <option value="true">启用</option>
          </select>
        </div>
        <div class="form-group">
          <label>统计自动刷新</label>
          <select id="setting-stats-auto-refresh" onchange="saveUserSetting('statsAutoRefresh', this.value === 'true')">
            <option value="false">禁用</option>
            <option value="true">启用</option>
          </select>
        </div>
        <div id="settings-sync-status" style="margin-top:10px;font-size:12px;color:#666;"></div>
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
      <div class="card" id="cleanup-settings-card">
        <h2>🗑️ 数据清理设置</h2>
        <p style="color:#666;margin-bottom:15px">配置各类数据的自动清理策略和保留时间。</p>
        
        <!-- Storage Statistics -->
        <div id="cleanup-stats-section" style="margin-bottom:20px;padding:15px;background:#f8f9fa;border-radius:6px;">
          <h3 style="font-size:14px;margin-bottom:12px;color:#333;">📊 存储统计</h3>
          <div id="cleanup-stats-loading" style="color:#666;font-size:13px;">加载中...</div>
          <div id="cleanup-stats-content" style="display:none;">
            <table style="font-size:13px;">
              <thead>
                <tr>
                  <th style="padding:6px 10px;">数据表</th>
                  <th style="padding:6px 10px;">记录数</th>
                  <th style="padding:6px 10px;">最早记录</th>
                </tr>
              </thead>
              <tbody id="cleanup-stats-table"></tbody>
            </table>
            <div style="margin-top:10px;font-size:12px;color:#666;">
              <span>总记录数: <strong id="cleanup-total-records">-</strong></span>
              <span style="margin-left:15px;">上次清理: <strong id="cleanup-last-time">-</strong></span>
            </div>
          </div>
        </div>
        
        <!-- Retention Settings -->
        <div style="margin-bottom:20px;">
          <h3 style="font-size:14px;margin-bottom:12px;color:#333;">⏱️ 保留时间设置</h3>
          <div class="form-row">
            <div class="form-group">
              <label>系统日志保留天数 (1-365)</label>
              <input type="number" id="cleanup-system-logs-days" min="1" max="365" placeholder="30">
            </div>
            <div class="form-group">
              <label>命中日志保留小时数 (24-168)</label>
              <input type="number" id="cleanup-hit-logs-hours" min="24" max="168" placeholder="72">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>告警保留天数 (7-365)</label>
              <input type="number" id="cleanup-alerts-days" min="7" max="365" placeholder="90">
            </div>
            <div class="form-group">
              <label>心跳日志保留天数 (1-90)</label>
              <input type="number" id="cleanup-heartbeat-days" min="1" max="90" placeholder="30">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>主题追踪保留小时数 (1-72)</label>
              <input type="number" id="cleanup-subject-tracker-hours" min="1" max="72" placeholder="24">
            </div>
            <div class="form-group">
              <label>邮件主题统计保留天数 (1-365)</label>
              <input type="number" id="cleanup-subject-stats-days" min="1" max="365" placeholder="30">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>清理执行时间 (0-23时)</label>
              <select id="cleanup-hour">
                <option value="0">0:00</option>
                <option value="1">1:00</option>
                <option value="2">2:00</option>
                <option value="3">3:00</option>
                <option value="4">4:00</option>
                <option value="5">5:00</option>
                <option value="6">6:00</option>
                <option value="7">7:00</option>
                <option value="8">8:00</option>
                <option value="9">9:00</option>
                <option value="10">10:00</option>
                <option value="11">11:00</option>
                <option value="12">12:00</option>
                <option value="13">13:00</option>
                <option value="14">14:00</option>
                <option value="15">15:00</option>
                <option value="16">16:00</option>
                <option value="17">17:00</option>
                <option value="18">18:00</option>
                <option value="19">19:00</option>
                <option value="20">20:00</option>
                <option value="21">21:00</option>
                <option value="22">22:00</option>
                <option value="23">23:00</option>
              </select>
            </div>
            <div class="form-group">
              <label>自动清理</label>
              <select id="cleanup-auto-enabled">
                <option value="true">启用</option>
                <option value="false">禁用</option>
              </select>
            </div>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="saveCleanupConfig()">保存设置</button>
          <button class="btn btn-warning" onclick="runManualCleanup()" id="cleanup-run-btn">立即清理</button>
          <button class="btn btn-secondary" onclick="runVacuum()" id="vacuum-btn">🗜️ 压缩数据库</button>
          <span id="cleanup-status" style="font-size:13px;"></span>
        </div>
        
        <!-- Cleanup Result -->
        <div id="cleanup-result" style="display:none;margin-top:15px;padding:15px;background:#d4edda;border-radius:6px;">
          <h4 style="font-size:14px;margin-bottom:10px;color:#155724;">✅ 清理完成</h4>
          <div id="cleanup-result-content" style="font-size:13px;color:#155724;"></div>
        </div>
        
        <!-- Vacuum Result -->
        <div id="vacuum-result" style="display:none;margin-top:15px;padding:15px;background:#cce5ff;border-radius:6px;">
          <h4 style="font-size:14px;margin-bottom:10px;color:#004085;">🗜️ 压缩完成</h4>
          <div id="vacuum-result-content" style="font-size:13px;color:#004085;"></div>
        </div>
      </div>
      <div class="card" id="legacy-settings-card" style="display:none;">
        <h2>🔑 API Token 设置（旧版兼容）</h2>
        <p style="color:#666;margin-bottom:15px">如果您需要使用 API Token 认证，可以在这里配置。</p>
        <div class="form-group">
          <label>API Token</label>
          <input type="password" id="api-token" placeholder="输入 API Token">
        </div>
        <button class="btn btn-primary" onclick="saveToken()">保存 Token</button>
      </div>
      <div class="card">
        <h2>💾 数据库备份管理</h2>
        <div id="backup-alert-container"></div>
        <div style="display:flex;gap:20px;margin-bottom:15px;">
          <div style="background:#f8f9fa;padding:15px;border-radius:8px;flex:1;text-align:center;">
            <div style="font-size:24px;font-weight:bold;color:#333;" id="backup-count">0</div>
            <div style="font-size:12px;color:#666;margin-top:5px;">备份数量</div>
          </div>
          <div style="background:#f8f9fa;padding:15px;border-radius:8px;flex:1;text-align:center;">
            <div style="font-size:24px;font-weight:bold;color:#333;" id="backup-total-size">0 B</div>
            <div style="font-size:12px;color:#666;margin-top:5px;">总大小</div>
          </div>
        </div>
        <div style="margin-bottom:15px;display:flex;gap:10px;">
          <button class="btn btn-success" onclick="createBackup()" id="create-backup-btn">+ 创建备份</button>
          <button class="btn btn-warning" onclick="showModal('restore-modal')">📥 恢复数据库</button>
        </div>
        <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>文件名</th>
              <th>大小</th>
              <th class="hide-mobile">创建时间</th>
              <th class="hide-mobile">类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="backups-table"></tbody>
        </table>
        </div>
      </div>
    </div>

    <!-- Users Tab (Admin Only) -->
    <div id="users-tab" class="tab-content hidden">
      <div class="card">
        <h2>👥 用户管理</h2>
        <p style="color:#666;margin-bottom:15px">管理系统用户账户。只有管理员可以访问此页面。</p>
        <button class="btn btn-primary" onclick="showModal('add-user-modal')" style="margin-bottom:15px">+ 添加用户</button>
        <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>角色</th>
              <th class="hide-mobile">创建时间</th>
              <th class="hide-mobile">更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="users-table"></tbody>
        </table>
        </div>
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

  <!-- Batch Delete Merchants Modal -->
  <div id="batch-delete-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>⚠️ 批量删除商户数据</h3>
        <button class="modal-close" onclick="hideModal('batch-delete-modal')">&times;</button>
      </div>
      <div style="padding:15px 0;">
        <p style="color:#e74c3c;font-weight:bold;margin-bottom:15px;">此操作不可恢复！</p>
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:15px;margin-bottom:15px;">
          <p style="margin:0 0 10px 0;"><strong>将要删除的数据：</strong></p>
          <p style="margin:0;">共 <strong id="batch-delete-count">0</strong> 个商户的数据</p>
          <div id="batch-delete-list" style="max-height:200px;overflow-y:auto;margin-top:10px;font-size:13px;"></div>
        </div>
        <p style="color:#666;font-size:13px;margin-bottom:15px;">删除后，所选商户在对应 Worker 下的所有邮件和路径记录将被永久删除。</p>
        <div id="batch-delete-progress" style="display:none;margin-bottom:15px;">
          <div style="background:#e9ecef;border-radius:4px;height:20px;overflow:hidden;">
            <div id="batch-delete-progress-bar" style="background:#007bff;height:100%;width:0%;transition:width 0.3s;"></div>
          </div>
          <p id="batch-delete-status" style="margin-top:5px;font-size:13px;color:#666;">正在删除...</p>
        </div>
        <div id="batch-delete-buttons" style="display:flex;gap:10px;justify-content:flex-end;">
          <button class="btn btn-secondary" onclick="hideModal('batch-delete-modal')">取消</button>
          <button class="btn btn-danger" onclick="confirmBatchDelete()">确认删除</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Orphaned Workers Modal -->
  <div id="orphaned-workers-modal" class="modal hidden">
    <div class="modal-content" style="max-width:600px;">
      <div class="modal-header">
        <h3>🧹 清理过期实例数据</h3>
        <button class="modal-close" onclick="hideModal('orphaned-workers-modal')">&times;</button>
      </div>
      <div style="padding:15px 0;">
        <p style="color:#666;margin-bottom:15px;">以下是数据库中存在但可能已被删除的 Worker 实例。您可以选择清理这些过期数据。</p>
        <div id="orphaned-workers-loading" style="text-align:center;padding:20px;color:#999;">加载中...</div>
        <div id="orphaned-workers-empty" style="display:none;text-align:center;padding:20px;color:#28a745;">✅ 没有发现过期实例数据</div>
        <div id="orphaned-workers-list" style="display:none;max-height:400px;overflow-y:auto;"></div>
        <div id="orphaned-delete-progress" style="display:none;margin-top:15px;">
          <div style="background:#e9ecef;border-radius:4px;height:20px;overflow:hidden;">
            <div id="orphaned-delete-progress-bar" style="background:#ffc107;height:100%;width:0%;transition:width 0.3s;"></div>
          </div>
          <p id="orphaned-delete-status" style="margin-top:5px;font-size:13px;color:#666;">正在删除...</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Add User Modal (Admin Only) -->
  <div id="add-user-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加用户</h3>
        <button class="modal-close" onclick="hideModal('add-user-modal')">&times;</button>
      </div>
      <form id="add-user-form">
        <div class="form-group">
          <label>用户名 *</label>
          <input type="text" id="user-username" required placeholder="至少3个字符" minlength="3">
        </div>
        <div class="form-group">
          <label>密码 *</label>
          <input type="password" id="user-password" required placeholder="至少6个字符" minlength="6">
        </div>
        <div class="form-group">
          <label>角色 *</label>
          <select id="user-role" required>
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <!-- Edit User Modal (Admin Only) -->
  <div id="edit-user-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>编辑用户</h3>
        <button class="modal-close" onclick="hideModal('edit-user-modal')">&times;</button>
      </div>
      <form id="edit-user-form">
        <input type="hidden" id="edit-user-id">
        <div class="form-group">
          <label>用户名</label>
          <input type="text" id="edit-user-username" disabled style="background:#f5f5f5">
        </div>
        <div class="form-group">
          <label>新密码（留空则不修改）</label>
          <input type="password" id="edit-user-password" placeholder="至少6个字符" minlength="6">
        </div>
        <div class="form-group">
          <label>角色 *</label>
          <select id="edit-user-role" required>
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">保存</button>
      </form>
    </div>
  </div>

  <!-- Restore Database Modal -->
  <div id="restore-modal" class="modal hidden">
    <div class="modal-content" style="max-width:500px;">
      <div class="modal-header">
        <h3>📥 恢复数据库</h3>
        <button class="modal-close" onclick="hideModal('restore-modal')">&times;</button>
      </div>
      <div style="color:#e74c3c;font-size:14px;margin:10px 0;">⚠️ 警告：恢复操作将覆盖当前数据库，此操作不可逆！系统会自动创建恢复前备份。</div>
      <form id="restore-form" onsubmit="restoreBackup(event)">
        <div class="form-group">
          <label>选择备份文件 (.db.gz)</label>
          <input type="file" id="restore-file" accept=".gz" required>
        </div>
        <button type="submit" class="btn btn-danger" id="restore-btn">确认恢复</button>
      </form>
    </div>
  </div>

  <!-- Settings Migration Modal -->
  <div id="settings-migration-modal" class="modal hidden">
    <div class="modal-content" style="max-width:500px;">
      <div class="modal-header">
        <h3>📦 发现本地设置</h3>
        <button class="modal-close" onclick="hideModal('settings-migration-modal')">&times;</button>
      </div>
      <div style="padding:15px 0;">
        <div id="migration-detect-phase">
          <p style="color:#666;margin-bottom:15px;">检测到浏览器中存储了旧的本地设置。是否要将这些设置迁移到服务器？</p>
          <div style="background:#e3f2fd;border:1px solid #2196f3;border-radius:6px;padding:15px;margin-bottom:15px;">
            <p style="margin:0 0 10px 0;font-weight:bold;color:#1976d2;">📋 检测到的设置：</p>
            <ul id="migration-settings-list" style="margin:0;padding-left:20px;color:#333;font-size:13px;"></ul>
          </div>
          <p style="color:#666;font-size:13px;margin-bottom:15px;">迁移后，您的设置将保存在服务器上，可以在任何设备上同步使用。</p>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-secondary" onclick="skipMigration()">跳过</button>
            <button class="btn btn-primary" onclick="startMigration()">开始迁移</button>
          </div>
        </div>
        <div id="migration-progress-phase" style="display:none;">
          <p style="color:#666;margin-bottom:15px;">正在迁移设置到服务器...</p>
          <div style="background:#e9ecef;border-radius:4px;height:20px;overflow:hidden;margin-bottom:15px;">
            <div id="migration-progress-bar" style="background:#4caf50;height:100%;width:0%;transition:width 0.3s;"></div>
          </div>
          <p id="migration-status" style="font-size:13px;color:#666;text-align:center;">准备中...</p>
        </div>
        <div id="migration-success-phase" style="display:none;">
          <div style="text-align:center;padding:20px 0;">
            <div style="font-size:48px;margin-bottom:15px;">✅</div>
            <p style="color:#28a745;font-weight:bold;font-size:16px;margin-bottom:15px;">设置迁移成功！</p>
            <p style="color:#666;margin-bottom:20px;">您的设置已保存到服务器。是否清除浏览器中的旧设置？</p>
            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px;margin-bottom:20px;font-size:13px;">
              <strong>提示：</strong>清除本地设置后，您的设置将完全由服务器管理，可在任何设备上同步。
            </div>
            <div style="display:flex;gap:10px;justify-content:center;">
              <button class="btn btn-secondary" onclick="finishMigration(false)">保留本地设置</button>
              <button class="btn btn-primary" onclick="finishMigration(true)">清除本地设置</button>
            </div>
          </div>
        </div>
        <div id="migration-error-phase" style="display:none;">
          <div style="text-align:center;padding:20px 0;">
            <div style="font-size:48px;margin-bottom:15px;">❌</div>
            <p style="color:#e74c3c;font-weight:bold;font-size:16px;margin-bottom:15px;">迁移失败</p>
            <p id="migration-error-message" style="color:#666;margin-bottom:20px;">发生错误，请稍后重试。</p>
            <div style="display:flex;gap:10px;justify-content:center;">
              <button class="btn btn-secondary" onclick="hideModal('settings-migration-modal')">关闭</button>
              <button class="btn btn-primary" onclick="retryMigration()">重试</button>
            </div>
          </div>
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
      // Pause auto-refresh for the old tab before switching
      pauseTabRefresh(currentActiveTab);
      
      document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
      document.getElementById(name + '-tab').classList.remove('hidden');
      event.target.classList.add('active');
      
      // Update current active tab
      currentActiveTab = name;
      
      // Resume auto-refresh for the new tab (if enabled)
      resumeTabRefresh(name);
      
      if (name === 'workers') loadWorkers();
      if (name === 'rules') loadRules();
      if (name === 'dynamic') loadDynamicConfig();
      if (name === 'logs') loadLogs();
      if (name === 'stats') loadStats();
      if (name === 'campaign') loadCampaignAnalytics();
      if (name === 'subjects') loadSubjects();
      if (name === 'monitoring') loadMonitoringData();
      if (name === 'settings') { loadSettings(); loadBackups(); }
      if (name === 'users') loadUsers();
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

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        // Update default worker dropdown in settings
        populateDefaultWorkerDropdown();
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
          // Check if connected to this VPS
          if (data.connectedToMe === false) {
            const workerVps = data.workerVpsUrl ? data.workerVpsUrl.replace('/api/webhook/email', '').replace('https://', '') : '其他VPS';
            return '<span class="status status-warning" title="Worker连接到: ' + escapeHtml(workerVps) + '">🟡 连接到其他VPS</span>';
          }
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
      const logWorkerFilterOptions = '<option value="">全部实例</option>' +
        workers.map(w => '<option value="' + escapeHtml(w.name) + '">' + escapeHtml(w.name) + '</option>').join('');
      const logWorkerFilter = document.getElementById('log-worker-filter');
      if (logWorkerFilter) logWorkerFilter.innerHTML = logWorkerFilterOptions;
      
      // Update stats worker filter
      const statsWorkerFilter = document.getElementById('stats-worker-filter');
      if (statsWorkerFilter) statsWorkerFilter.innerHTML = logWorkerFilterOptions;
      
      // Update trending rules worker filter
      const trendingWorkerFilter = document.getElementById('trending-worker-filter');
      if (trendingWorkerFilter) trendingWorkerFilter.innerHTML = logWorkerFilterOptions;
      
      // Update campaign worker filter (uses __all__ for "全部实例" to distinguish from empty)
      const campaignWorkerFilterOptions = '<option value="__all__">全部实例</option>' +
        workers.map(w => '<option value="' + escapeHtml(w.name) + '">' + escapeHtml(w.name) + '</option>').join('');
      const campaignWorkerFilter = document.getElementById('campaign-worker-filter');
      if (campaignWorkerFilter) campaignWorkerFilter.innerHTML = campaignWorkerFilterOptions;
      
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
        document.getElementById('dynamic-time-window').value = config.timeWindowMinutes || 30;
        document.getElementById('dynamic-threshold').value = config.thresholdCount || 30;
        document.getElementById('dynamic-time-span-threshold').value = config.timeSpanThresholdMinutes || 3;
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
        timeWindowMinutes: parseInt(document.getElementById('dynamic-time-window').value) || 30,
        thresholdCount: parseInt(document.getElementById('dynamic-threshold').value) || 30,
        timeSpanThresholdMinutes: parseFloat(document.getElementById('dynamic-time-span-threshold').value) || 3,
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
    
    // Helper function to extract domain from email address
    function extractDomainFromEmail(email) {
      if (!email || email === '-') return '-';
      const match = email.match(/@(.+)$/);
      return match ? match[1] : email;
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
        
        // For admin_action and system logs, show message in subject column and details summary in other columns
        let subject, from, to, rule;
        if (log.category === 'admin_action' || log.category === 'system') {
          // For system logs (dynamic rule creation), show rule pattern as subject
          if (d.pattern) {
            subject = d.pattern; // Rule pattern (email subject)
          } else {
            subject = log.message || '-';
          }
          
          // Show sender domain in 'from' column
          if (d.senderDomain) {
            from = d.senderDomain;
          } else if (d.action) {
            from = d.action + (d.entityType ? ' (' + d.entityType + ')' : '');
          } else {
            from = '-';
          }
          
          // Show recipient email in 'to' column
          if (d.detectionLatencyMs !== undefined) {
            to = '延迟: ' + d.detectionLatencyMs + 'ms';
          } else if (d.recipientEmail) {
            to = d.recipientEmail;
          } else if (d.entityId) {
            to = 'ID: ' + d.entityId;
          } else if (d.deletedCount !== undefined) {
            to = '删除: ' + d.deletedCount + '条';
          } else {
            to = '-';
          }
          
          // Show log details in 'rule' column
          rule = '详情';
        } else {
          // For email logs, extract domain from sender email
          subject = d.subject || '-';
          from = extractDomainFromEmail(d.from);
          to = d.to || '-';
          rule = d.matchedRule || '-';
        }
        
        return '<tr>' +
          '<td onclick="event.stopPropagation()"><input type="checkbox" class="log-checkbox" data-id="' + log.id + '" onchange="updateLogBatchDeleteBtn()"></td>' +
          '<td style="font-size:12px;color:#666;cursor:pointer" onclick="showLogDetail(' + idx + ')">' + time + '</td>' +
          '<td style="cursor:pointer" onclick="showLogDetail(' + idx + ')">' + workerDisplay + '</td>' +
          '<td style="cursor:pointer" onclick="showLogDetail(' + idx + ')">' + cat + '</td>' +
          '<td style="cursor:pointer" onclick="showLogDetail(' + idx + ')">' + escapeHtml(subject.length > 22 ? subject.substring(0,22) + '...' : subject) + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(from.length > 20 ? from.substring(0,20) + '...' : from) + '</td>' +
          '<td style="font-size:12px;">' + escapeHtml(to.length > 20 ? to.substring(0,20) + '...' : to) + '</td>' +
          '<td style="font-size:12px;color:#888;cursor:pointer" onclick="showLogDetail(' + idx + ')">' + escapeHtml(rule) + '</td>' +
          '</tr>';
      }).join('');
    }
    
    function toggleSelectAllLogs() {
      const selectAll = document.getElementById('log-select-all').checked;
      document.querySelectorAll('.log-checkbox').forEach(cb => cb.checked = selectAll);
      updateLogBatchDeleteBtn();
    }
    
    function updateLogBatchDeleteBtn() {
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
      
      let detailContent = '';
      if (log.category === 'admin_action' || log.category === 'system') {
        // Show admin/system log specific details
        detailContent = '<p><strong>详细信息:</strong></p><div style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:13px;">';
        for (const [key, value] of Object.entries(d)) {
          const displayKey = {
            action: '操作',
            entityType: '实体类型',
            entityId: '实体ID',
            pattern: '规则模式',
            ruleId: '规则ID',
            detectionLatencyMs: '检测延迟(ms)',
            emailsForwardedBeforeBlock: '拦截前转发数',
            firstEmailTime: '首封邮件时间',
            triggerEmailTime: '触发邮件时间',
            deletedCount: '删除数量',
            changes: '变更内容'
          }[key] || key;
          let displayValue = value;
          if (typeof value === 'object') {
            displayValue = JSON.stringify(value, null, 2);
          }
          detailContent += '<p><strong>' + escapeHtml(displayKey) + ':</strong> ' + escapeHtml(String(displayValue)) + '</p>';
        }
        detailContent += '</div>';
      } else {
        // Show email log specific details
        detailContent = 
          '<p><strong>主题:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.subject || '-') + '</p>' +
          '<p><strong>发件人:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.from || '-') + '</p>' +
          '<p><strong>收件人:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.to || '-') + '</p>' +
          '<p><strong>命中规则:</strong></p><p style="background:#f5f5f5;padding:8px;border-radius:4px;word-break:break-all;user-select:all">' + escapeHtml(d.matchedRule || '-') + '</p>';
      }
      
      const content = 
        '<p><strong>时间:</strong> ' + time + '</p>' +
        '<p><strong>Worker 实例:</strong> ' + escapeHtml(workerName === 'global' ? '全局' : workerName) + '</p>' +
        '<p><strong>类型:</strong> ' + (categoryNames[log.category] || log.category) + '</p>' +
        '<p><strong>消息:</strong> ' + escapeHtml(log.message) + '</p>' +
        '<hr style="margin:10px 0;border:none;border-top:1px solid #eee">' +
        detailContent;
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
      loadCleanupConfig();
      // Update settings tab with account info and user settings
      updateSettingsTab();
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

    // ============================================
    // Data Cleanup Settings
    // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3
    // ============================================
    
    const TABLE_NAME_MAP = {
      'system_logs': '系统日志',
      'hit_logs': '命中日志',
      'alerts': '告警记录',
      'heartbeat_logs': '心跳日志',
      'email_subject_tracker': '主题追踪',
      'subject_stats': '邮件主题统计'
    };
    
    /**
     * Load cleanup configuration and statistics
     * Requirements: 1.1, 1.2, 6.1, 6.2
     */
    async function loadCleanupConfig() {
      if (!apiToken) return;
      try {
        // Load configuration
        const configRes = await fetch('/api/admin/cleanup/config', { headers: getHeaders() });
        if (configRes.ok) {
          const data = await configRes.json();
          if (data.success && data.config) {
            const config = data.config;
            document.getElementById('cleanup-system-logs-days').value = config.systemLogsRetentionDays;
            document.getElementById('cleanup-hit-logs-hours').value = config.hitLogsRetentionHours;
            document.getElementById('cleanup-alerts-days').value = config.alertsRetentionDays;
            document.getElementById('cleanup-heartbeat-days').value = config.heartbeatLogsRetentionDays;
            document.getElementById('cleanup-subject-tracker-hours').value = config.subjectTrackerRetentionHours;
            document.getElementById('cleanup-subject-stats-days').value = config.subjectStatsRetentionDays;
            document.getElementById('cleanup-hour').value = config.cleanupHour;
            document.getElementById('cleanup-auto-enabled').value = config.autoCleanupEnabled ? 'true' : 'false';
          }
        }
        
        // Load statistics
        await loadCleanupStats();
      } catch (e) {
        console.error('Failed to load cleanup config', e);
      }
    }
    
    /**
     * Load cleanup statistics
     * Requirements: 6.1, 6.2
     */
    async function loadCleanupStats() {
      if (!apiToken) return;
      const loadingEl = document.getElementById('cleanup-stats-loading');
      const contentEl = document.getElementById('cleanup-stats-content');
      
      try {
        const res = await fetch('/api/admin/cleanup/stats', { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.stats) {
            renderCleanupStats(data.stats);
            loadingEl.style.display = 'none';
            contentEl.style.display = 'block';
          }
        }
      } catch (e) {
        loadingEl.textContent = '加载失败';
        console.error('Failed to load cleanup stats', e);
      }
    }
    
    /**
     * Render cleanup statistics table
     * Requirements: 6.1, 6.2
     */
    function renderCleanupStats(stats) {
      const tbody = document.getElementById('cleanup-stats-table');
      tbody.innerHTML = stats.tables.map(table => {
        const displayName = TABLE_NAME_MAP[table.tableName] || table.tableName;
        const oldestDate = table.oldestRecordDate 
          ? new Date(table.oldestRecordDate).toLocaleDateString('zh-CN') 
          : '-';
        return '<tr>' +
          '<td style="padding:6px 10px;">' + escapeHtml(displayName) + '</td>' +
          '<td style="padding:6px 10px;">' + table.recordCount.toLocaleString() + '</td>' +
          '<td style="padding:6px 10px;">' + oldestDate + '</td>' +
        '</tr>';
      }).join('');
      
      document.getElementById('cleanup-total-records').textContent = stats.totalRecords.toLocaleString();
      document.getElementById('cleanup-last-time').textContent = stats.lastCleanupAt 
        ? new Date(stats.lastCleanupAt).toLocaleString('zh-CN')
        : '从未';
    }
    
    /**
     * Save cleanup configuration
     * Requirements: 1.3, 1.4, 1.5
     */
    async function saveCleanupConfig() {
      if (!apiToken) return;
      
      const config = {
        systemLogsRetentionDays: parseInt(document.getElementById('cleanup-system-logs-days').value, 10),
        hitLogsRetentionHours: parseInt(document.getElementById('cleanup-hit-logs-hours').value, 10),
        alertsRetentionDays: parseInt(document.getElementById('cleanup-alerts-days').value, 10),
        heartbeatLogsRetentionDays: parseInt(document.getElementById('cleanup-heartbeat-days').value, 10),
        subjectTrackerRetentionHours: parseInt(document.getElementById('cleanup-subject-tracker-hours').value, 10),
        subjectStatsRetentionDays: parseInt(document.getElementById('cleanup-subject-stats-days').value, 10),
        cleanupHour: parseInt(document.getElementById('cleanup-hour').value, 10),
        autoCleanupEnabled: document.getElementById('cleanup-auto-enabled').value === 'true'
      };
      
      // Client-side validation
      const errors = [];
      if (config.systemLogsRetentionDays < 1 || config.systemLogsRetentionDays > 365) {
        errors.push('系统日志保留天数必须在 1-365 之间');
      }
      if (config.hitLogsRetentionHours < 24 || config.hitLogsRetentionHours > 168) {
        errors.push('命中日志保留小时数必须在 24-168 之间');
      }
      if (config.alertsRetentionDays < 7 || config.alertsRetentionDays > 365) {
        errors.push('告警保留天数必须在 7-365 之间');
      }
      if (config.heartbeatLogsRetentionDays < 1 || config.heartbeatLogsRetentionDays > 90) {
        errors.push('心跳日志保留天数必须在 1-90 之间');
      }
      if (config.subjectTrackerRetentionHours < 1 || config.subjectTrackerRetentionHours > 72) {
        errors.push('主题追踪保留小时数必须在 1-72 之间');
      }
      if (config.subjectStatsRetentionDays < 1 || config.subjectStatsRetentionDays > 365) {
        errors.push('邮件主题统计保留天数必须在 1-365 之间');
      }
      
      if (errors.length > 0) {
        showAlert(errors.join('；'), 'error');
        return;
      }
      
      try {
        const res = await fetch('/api/admin/cleanup/config', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(config)
        });
        const data = await res.json();
        if (data.success) {
          showAlert('清理设置已保存');
          // Refresh statistics after save
          await loadCleanupStats();
        } else {
          showAlert(data.error || '保存失败', 'error');
        }
      } catch (e) {
        showAlert('保存失败', 'error');
      }
    }
    
    /**
     * Run manual cleanup
     * Requirements: 5.1, 5.2, 5.3
     */
    async function runManualCleanup() {
      if (!apiToken) return;
      
      if (!confirm('确定要立即执行数据清理吗？此操作将删除超过保留期限的数据。')) {
        return;
      }
      
      const statusEl = document.getElementById('cleanup-status');
      const runBtn = document.getElementById('cleanup-run-btn');
      const resultEl = document.getElementById('cleanup-result');
      const resultContentEl = document.getElementById('cleanup-result-content');
      
      // Show progress indicator
      statusEl.innerHTML = '<span style="color:#666;">⏳ 清理中...</span>';
      runBtn.disabled = true;
      resultEl.style.display = 'none';
      
      try {
        const res = await fetch('/api/admin/cleanup/run', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        const data = await res.json();
        
        if (data.success && data.result) {
          const result = data.result;
          // Display cleanup results summary
          resultContentEl.innerHTML = 
            '<div>系统日志: 删除 ' + result.systemLogs.deletedCount + ' 条</div>' +
            '<div>命中日志: 删除 ' + result.hitLogs.deletedCount + ' 条</div>' +
            '<div>告警记录: 删除 ' + result.alerts.deletedCount + ' 条</div>' +
            '<div>心跳日志: 删除 ' + result.heartbeatLogs.deletedCount + ' 条</div>' +
            '<div>主题追踪: 删除 ' + result.subjectTracker.deletedCount + ' 条</div>' +
            '<div>邮件主题统计: 删除 ' + result.subjectStats.deletedCount + ' 条</div>' +
            '<div style="margin-top:8px;font-weight:600;">总计删除 ' + result.totalDeleted + ' 条记录，耗时 ' + result.durationMs + 'ms</div>';
          resultEl.style.display = 'block';
          statusEl.innerHTML = '<span style="color:#27ae60;">✅ 清理完成</span>';
          
          // Refresh statistics after cleanup
          await loadCleanupStats();
        } else {
          statusEl.innerHTML = '<span style="color:#e74c3c;">❌ ' + escapeHtml(data.error || '清理失败') + '</span>';
        }
      } catch (e) {
        statusEl.innerHTML = '<span style="color:#e74c3c;">❌ 清理失败</span>';
      } finally {
        runBtn.disabled = false;
      }
    }

    /**
     * Run database VACUUM to reclaim disk space
     */
    async function runVacuum() {
      if (!apiToken) return;
      
      if (!confirm('确定要压缩数据库吗？此操作会重建数据库文件以释放磁盘空间。\\n\\n注意：对于大型数据库，此操作可能需要较长时间。')) {
        return;
      }
      
      const statusEl = document.getElementById('cleanup-status');
      const vacuumBtn = document.getElementById('vacuum-btn');
      const resultEl = document.getElementById('vacuum-result');
      const resultContentEl = document.getElementById('vacuum-result-content');
      
      // Hide previous results
      resultEl.style.display = 'none';
      document.getElementById('cleanup-result').style.display = 'none';
      
      // Show progress indicator
      statusEl.innerHTML = '<span style="color:#666;">⏳ 压缩中，请稍候...</span>';
      vacuumBtn.disabled = true;
      
      try {
        const res = await fetch('/api/admin/cleanup/vacuum', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        const data = await res.json();
        
        if (data.success && data.result) {
          const result = data.result;
          resultContentEl.innerHTML = 
            '<div>压缩前大小: ' + formatBytes(result.beforeSize) + '</div>' +
            '<div>压缩后大小: ' + formatBytes(result.afterSize) + '</div>' +
            '<div style="margin-top:8px;font-weight:600;">释放空间: ' + result.savedMB + ' MB，耗时 ' + result.durationMs + 'ms</div>';
          resultEl.style.display = 'block';
          statusEl.innerHTML = '<span style="color:#27ae60;">✅ 压缩完成</span>';
          
          // Refresh backup list to show updated sizes (don't await, non-blocking)
          loadBackups().catch(() => {});
        } else {
          statusEl.innerHTML = '<span style="color:#e74c3c;">❌ ' + escapeHtml(data.error || '压缩失败') + '</span>';
        }
      } catch (e) {
        console.error('Vacuum error:', e);
        statusEl.innerHTML = '<span style="color:#e74c3c;">❌ 压缩失败: ' + escapeHtml(e.message || '网络错误') + '</span>';
      } finally {
        vacuumBtn.disabled = false;
      }
    }

    // ============================================
    // User Management (Admin Only)
    // Requirements: 10.1, 10.2, 10.3, 10.4
    // ============================================
    
    let usersData = [];
    
    /**
     * Load all users from the server
     * Requirements: 10.1 - Admin can view user list
     */
    async function loadUsers() {
      if (!apiToken || !currentUser || currentUser.role !== 'admin') return;
      try {
        const res = await fetch('/api/admin/users', { headers: getHeaders() });
        if (!res.ok) {
          if (res.status === 403) {
            showAlert('无权限访问用户管理', 'error');
            return;
          }
          throw new Error('Failed');
        }
        const data = await res.json();
        usersData = data.users || [];
        renderUsers();
      } catch (e) {
        showAlert('加载用户列表失败', 'error');
      }
    }
    
    /**
     * Render users table
     */
    function renderUsers() {
      const tbody = document.getElementById('users-table');
      if (usersData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无用户</td></tr>';
        return;
      }
      tbody.innerHTML = usersData.map(u => {
        const roleBadge = u.role === 'admin' 
          ? '<span class="status" style="background:#fff3cd;color:#856404;">管理员</span>'
          : '<span class="status" style="background:#e9ecef;color:#495057;">普通用户</span>';
        const createdAt = new Date(u.createdAt).toLocaleDateString('zh-CN');
        const updatedAt = new Date(u.updatedAt).toLocaleDateString('zh-CN');
        const isSelf = currentUser && currentUser.userId === u.id;
        const deleteBtn = isSelf 
          ? '<button class="btn btn-sm btn-secondary" disabled title="不能删除自己">删除</button>'
          : '<button class="btn btn-sm btn-danger" onclick="deleteUser(\\'' + u.id + '\\', \\'' + escapeHtml(u.username) + '\\')">删除</button>';
        return '<tr>' +
          '<td><strong>' + escapeHtml(u.username) + '</strong>' + (isSelf ? ' <span style="color:#4a90d9;font-size:11px;">(当前用户)</span>' : '') + '</td>' +
          '<td>' + roleBadge + '</td>' +
          '<td>' + createdAt + '</td>' +
          '<td>' + updatedAt + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-primary" onclick="showEditUserModal(\\'' + u.id + '\\')">编辑</button>' +
            deleteBtn +
          '</td>' +
        '</tr>';
      }).join('');
    }
    
    /**
     * Show edit user modal
     */
    function showEditUserModal(userId) {
      const user = usersData.find(u => u.id === userId);
      if (!user) return;
      
      document.getElementById('edit-user-id').value = user.id;
      document.getElementById('edit-user-username').value = user.username;
      document.getElementById('edit-user-password').value = '';
      document.getElementById('edit-user-role').value = user.role;
      
      showModal('edit-user-modal');
    }
    
    /**
     * Create a new user
     * Requirements: 10.2 - Admin can create users with unique username
     */
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('user-username').value.trim();
      const password = document.getElementById('user-password').value;
      const role = document.getElementById('user-role').value;
      
      if (username.length < 3) {
        showAlert('用户名至少需要3个字符', 'error');
        return;
      }
      if (password.length < 6) {
        showAlert('密码至少需要6个字符', 'error');
        return;
      }
      
      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ username, password, role })
        });
        const data = await res.json();
        if (res.ok) {
          hideModal('add-user-modal');
          document.getElementById('add-user-form').reset();
          showAlert('用户创建成功');
          loadUsers();
        } else {
          showAlert(data.error || '创建失败', 'error');
        }
      } catch (e) {
        showAlert('创建失败', 'error');
      }
    });
    
    /**
     * Update an existing user
     * Requirements: 10.3 - Admin can update user password and role
     */
    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const userId = document.getElementById('edit-user-id').value;
      const password = document.getElementById('edit-user-password').value;
      const role = document.getElementById('edit-user-role').value;
      
      if (password && password.length < 6) {
        showAlert('密码至少需要6个字符', 'error');
        return;
      }
      
      const body = { role };
      if (password) {
        body.password = password;
      }
      
      try {
        const res = await fetch('/api/admin/users/' + userId, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok) {
          hideModal('edit-user-modal');
          showAlert('用户更新成功');
          loadUsers();
        } else {
          showAlert(data.error || '更新失败', 'error');
        }
      } catch (e) {
        showAlert('更新失败', 'error');
      }
    });
    
    /**
     * Delete a user
     * Requirements: 10.4 - Admin can delete users (cascade deletes settings)
     */
    async function deleteUser(userId, username) {
      if (!confirm('确定要删除用户 "' + username + '" 吗？\\n\\n此操作将同时删除该用户的所有设置，且不可恢复！')) return;
      
      try {
        const res = await fetch('/api/admin/users/' + userId, {
          method: 'DELETE',
          headers: getHeaders()
        });
        const data = await res.json();
        if (res.ok) {
          showAlert('用户删除成功');
          loadUsers();
        } else {
          showAlert(data.error || '删除失败', 'error');
        }
      } catch (e) {
        showAlert('删除失败', 'error');
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
        const workerFilterValue = document.getElementById('campaign-worker-filter')?.value || '';
        const statusFilter = document.getElementById('project-status-filter')?.value || '';
        let url = '/api/campaign/projects';
        const params = [];
        // Only pass workerName if a specific worker is selected (not "__all__")
        if (workerFilterValue && workerFilterValue !== '__all__') {
          params.push('workerName=' + encodeURIComponent(workerFilterValue));
        }
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
        
        // Format worker display as colored tags
        let workerDisplay = '-';
        const workers = p.workerNames && p.workerNames.length > 0 ? p.workerNames : (p.workerName ? [p.workerName] : []);
        if (workers.length > 0) {
          if (workers.length <= 2) {
            // Show all worker names as tags
            workerDisplay = workers.map(w => {
              const tagColor = getWorkerTagColor(w);
              return '<span style="background:' + tagColor.bg + ';color:' + tagColor.text + ';border:1px solid ' + tagColor.border + ';padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;margin-right:4px;">' + escapeHtml(w) + '</span>';
            }).join('');
          } else {
            // Show first worker + count for remaining
            const firstWorker = workers[0];
            const tagColor = getWorkerTagColor(firstWorker);
            workerDisplay = '<span style="background:' + tagColor.bg + ';color:' + tagColor.text + ';border:1px solid ' + tagColor.border + ';padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;margin-right:4px;">' + escapeHtml(firstWorker) + '</span>' +
              '<span style="background:#f5f5f5;color:#666;border:1px solid #ddd;padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;">+' + (workers.length - 1) + '个</span>';
          }
        }
        
        return '<tr style="' + rowStyle + '" onclick="openProject(\\'' + p.id + '\\')" class="clickable-row">' +
          '<td><strong style="cursor:pointer;color:#1565c0;">' + escapeHtml(p.name) + '</strong></td>' +
          '<td>' + escapeHtml(p.merchantDomain || '-') + '</td>' +
          '<td>' + workerDisplay + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '<td>' + createdAt + '</td>' +
          '<td class="actions" onclick="event.stopPropagation();">' +
            '<button class="btn btn-sm btn-primary" onclick="openProject(\\'' + p.id + '\\')">打开</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="editProject(\\'' + p.id + '\\')">编辑</button>' +
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
      
      // Safety check - if elements don't exist, return early
      if (!emptyDiv) return;
      
      // Hide all states first (with null checks)
      if (noWorkerPrompt) noWorkerPrompt.style.display = 'none';
      if (loadingDiv) loadingDiv.style.display = 'none';
      if (emptyDataDiv) emptyDataDiv.style.display = 'none';
      if (errorDiv) errorDiv.style.display = 'none';
      
      if (state === 'hidden') {
        emptyDiv.style.display = 'none';
        return;
      }
      
      emptyDiv.style.display = 'block';
      
      switch (state) {
        case 'no-worker':
          if (noWorkerPrompt) noWorkerPrompt.style.display = 'block';
          break;
        case 'loading':
          if (loadingDiv) loadingDiv.style.display = 'block';
          break;
        case 'empty-data':
          if (emptyDataDiv) emptyDataDiv.style.display = 'block';
          break;
        case 'error':
          if (errorDiv) errorDiv.style.display = 'block';
          break;
      }
    }

    async function loadMerchantList() {
      const workerName = document.getElementById('campaign-worker-filter')?.value || '';
      const tableContainer = document.getElementById('merchants-table-container');
      const isAllInstances = workerName === '__all__' || workerName === '';
      
      if (!apiToken) return;
      
      showMerchantEmptyState('loading');
      tableContainer.style.display = 'none';
      
      try {
        // When "全部实例" is selected, use merchants-by-worker API to get all merchant-worker combinations
        // When a specific worker is selected, use the worker-specific API
        let url;
        if (isAllInstances) {
          url = '/api/campaign/merchants-by-worker';
        } else {
          url = '/api/campaign/workers/' + encodeURIComponent(workerName) + '/merchants';
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

    // Worker tag colors for visual distinction
    const workerTagColors = [
      { bg: '#e3f2fd', text: '#1565c0', border: '#90caf9' },
      { bg: '#f3e5f5', text: '#7b1fa2', border: '#ce93d8' },
      { bg: '#e8f5e9', text: '#2e7d32', border: '#a5d6a7' },
      { bg: '#fff3e0', text: '#e65100', border: '#ffcc80' },
      { bg: '#fce4ec', text: '#c2185b', border: '#f48fb1' },
      { bg: '#e0f7fa', text: '#00838f', border: '#80deea' },
      { bg: '#f1f8e9', text: '#558b2f', border: '#c5e1a5' },
      { bg: '#ede7f6', text: '#512da8', border: '#b39ddb' },
    ];
    
    function getWorkerTagColor(workerName) {
      // Generate consistent color based on worker name hash
      let hash = 0;
      for (let i = 0; i < workerName.length; i++) {
        hash = ((hash << 5) - hash) + workerName.charCodeAt(i);
        hash = hash & hash;
      }
      return workerTagColors[Math.abs(hash) % workerTagColors.length];
    }

    function renderMerchantList() {
      const tbody = document.getElementById('merchants-table');
      const tableContainer = document.getElementById('merchants-table-container');
      const workerColumnHeader = document.getElementById('worker-column-header');
      
      if (workerMerchantsData.length === 0) {
        showMerchantEmptyState('empty-data');
        tableContainer.style.display = 'none';
        return;
      }
      
      showMerchantEmptyState('hidden');
      tableContainer.style.display = 'table';
      
      // Check if "全部实例" is selected
      const workerFilter = document.getElementById('campaign-worker-filter')?.value || '';
      const isAllInstances = workerFilter === '__all__' || workerFilter === '';
      
      // Show/hide Worker column header based on filter
      if (workerColumnHeader) {
        workerColumnHeader.style.display = isAllInstances ? '' : 'none';
      }
      
      // Sort merchants
      const sortField = document.getElementById('merchant-sort-field')?.value || 'emails';
      const sortOrder = document.getElementById('merchant-sort-order')?.value || 'desc';
      const sortedMerchants = [...workerMerchantsData].sort((a, b) => {
        const aVal = sortField === 'emails' ? a.totalEmails : a.totalCampaigns;
        const bVal = sortField === 'emails' ? b.totalEmails : b.totalCampaigns;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });
      
      // Check which merchants have projects (per worker)
      // Build a map: merchantId -> Set of workerNames that have projects
      const merchantProjectWorkers = new Map();
      projectsData.forEach(p => {
        if (!merchantProjectWorkers.has(p.merchantId)) {
          merchantProjectWorkers.set(p.merchantId, new Set());
        }
        // Add all workers from workerNames array (for multi-worker projects)
        const workers = p.workerNames && p.workerNames.length > 0 ? p.workerNames : (p.workerName ? [p.workerName] : []);
        workers.forEach(w => merchantProjectWorkers.get(p.merchantId).add(w));
      });
      
      tbody.innerHTML = sortedMerchants.map(m => {
        // Get worker name from merchant data (for merchants-by-worker API) or from filter
        const merchantWorkerName = m.workerName || workerFilter;
        const hasWorkerName = merchantWorkerName && merchantWorkerName !== '__all__';
        
        // Check if this specific merchant+worker combination has a project
        const workerSet = merchantProjectWorkers.get(m.id);
        const hasProject = workerSet && workerSet.has(merchantWorkerName);
        const projectIndicator = hasProject ? '<span class="project-indicator" title="已有项目"></span>' : '';
        
        // Worker tag column (only shown when "全部实例" is selected)
        let workerTagCell = '';
        if (isAllInstances) {
          if (m.workerName) {
            const tagColor = getWorkerTagColor(m.workerName);
            workerTagCell = '<td><span style="background:' + tagColor.bg + ';color:' + tagColor.text + ';border:1px solid ' + tagColor.border + ';padding:2px 8px;border-radius:4px;font-size:11px;white-space:nowrap;">' + escapeHtml(m.workerName) + '</span></td>';
          } else {
            workerTagCell = '<td>-</td>';
          }
        }
        
        // Create unique key for checkbox (merchantId + workerName for batch operations)
        const checkboxKey = hasWorkerName ? m.id + '|' + merchantWorkerName : m.id;
        
        return '<tr>' +
          '<td><input type="checkbox" class="merchant-checkbox" data-merchant-id="' + m.id + '" data-worker-name="' + (hasWorkerName ? escapeHtml(merchantWorkerName) : '') + '" data-domain="' + escapeHtml(m.domain) + '" data-emails="' + m.totalEmails + '" data-campaigns="' + m.totalCampaigns + '" onchange="onMerchantCheckboxChange()" ' + (hasWorkerName ? '' : 'disabled title="请选择特定 Worker 实例以启用批量删除"') + '></td>' +
          '<td><strong>' + escapeHtml(m.domain) + '</strong></td>' +
          workerTagCell +
          '<td>' + m.totalCampaigns + '</td>' +
          '<td>' + m.totalEmails + '</td>' +
          '<td>' + projectIndicator + (hasProject ? '是' : '-') + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-sm btn-primary" onclick="showMerchantPreview(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\', ' + m.totalCampaigns + ', ' + m.totalEmails + (hasWorkerName ? ', \\'' + escapeHtml(merchantWorkerName) + '\\'' : '') + ')" style="margin-right:5px;">预览</button>' +
            '<button class="btn btn-sm btn-success" onclick="showCreateProjectModal(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\'' + (hasWorkerName ? ', \\'' + escapeHtml(merchantWorkerName) + '\\'' : '') + ')">创建项目</button>' +
            (hasWorkerName ? '<button class="btn btn-sm btn-danger" onclick="showDeleteMerchantModal(\\'' + m.id + '\\', \\'' + escapeHtml(m.domain) + '\\', ' + m.totalEmails + ', ' + m.totalCampaigns + ', \\'' + escapeHtml(merchantWorkerName) + '\\')" style="margin-left:5px;">删除数据</button>' : '') +
          '</td></tr>';
      }).join('');
      
      // Reset select all checkbox and batch actions
      const selectAllCheckbox = document.getElementById('merchants-select-all');
      if (selectAllCheckbox) selectAllCheckbox.checked = false;
      updateBatchActionsVisibility();
    }

    function sortMerchantList() {
      renderMerchantList();
    }

    // Store available workers for the modal
    let availableWorkers = [];

    function showCreateProjectModal(merchantId, merchantDomain, merchantWorkerName) {
      // Use passed workerName if available, otherwise fall back to filter value
      const filterValue = document.getElementById('campaign-worker-filter')?.value || '';
      const workerName = merchantWorkerName || (filterValue !== '__all__' ? filterValue : '');
      
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
        // Skip the "__all__" option when populating worker selection
        if (opt.value && opt.value !== '__all__') {
          availableWorkers.push({ value: opt.value, text: opt.text });
          workerSelect.innerHTML += '<option value="' + opt.value + '">' + opt.text + '</option>';
          multiWorkerDiv.innerHTML += '<label style="display:block;padding:4px 0;cursor:pointer;">' +
            '<input type="checkbox" class="multi-worker-checkbox" value="' + opt.value + '" style="margin-right:8px;">' +
            opt.text + '</label>';
        }
      });
      
      // Set default mode based on current filter or passed workerName
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
        
        console.log('Creating project with request body:', requestBody);
        
        const res = await fetch('/api/campaign/projects', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(requestBody)
        });
        
        const data = await res.json();
        console.log('Project creation response:', res.status, data);
        
        if (res.ok) {
          hideModal('create-project-modal');
          showAlert('项目创建成功');
          await loadProjects();
          await loadMerchantList();
          // Auto-select the newly created project
          // API returns the project object directly, not wrapped in { project: ... }
          if (data && data.id) {
            openProject(data.id);
          }
        } else {
          const errorMsg = data.message || data.error || '未知错误';
          console.error('Project creation failed:', errorMsg);
          showAlert('创建失败: ' + errorMsg, 'error');
        }
      } catch (e) {
        console.error('Project creation error:', e);
        showAlert('创建失败: ' + (e.message || '网络错误'), 'error');
      }
    });

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
    async function showMerchantPreview(merchantId, merchantDomain, totalCampaigns, totalEmails, merchantWorkerName) {
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
        // Use passed workerName if available, otherwise fall back to filter value
        const filterValue = document.getElementById('campaign-worker-filter')?.value || '';
        const workerName = merchantWorkerName || (filterValue !== '__all__' ? filterValue : '');
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
    function showDeleteMerchantModal(merchantId, merchantDomain, emailCount, campaignCount, merchantWorkerName) {
      // Use passed workerName if available, otherwise fall back to filter value
      const filterValue = document.getElementById('campaign-worker-filter')?.value || '';
      const workerName = merchantWorkerName || (filterValue !== '__all__' ? filterValue : '');
      
      if (!workerName) {
        showAlert('请先选择实例', 'error');
        return;
      }
      
      // Store the workerName in a hidden field for use in confirmDeleteMerchantData
      document.getElementById('delete-merchant-id').value = merchantId;
      document.getElementById('delete-merchant-id').dataset.workerName = workerName;
      document.getElementById('delete-merchant-domain').textContent = merchantDomain;
      document.getElementById('delete-merchant-worker').textContent = workerName;
      document.getElementById('delete-merchant-emails').textContent = emailCount;
      document.getElementById('delete-merchant-campaigns').textContent = campaignCount;
      
      showModal('delete-merchant-modal');
    }

    // Confirm and execute merchant data deletion
    async function confirmDeleteMerchantData() {
      const merchantIdElement = document.getElementById('delete-merchant-id');
      const merchantId = merchantIdElement.value;
      // Use stored workerName from dataset, fall back to filter value
      const filterValue = document.getElementById('campaign-worker-filter')?.value || '';
      const workerName = merchantIdElement.dataset.workerName || (filterValue !== '__all__' ? filterValue : '');
      
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

    // Batch delete functions
    function toggleSelectAllMerchants(checked) {
      const checkboxes = document.querySelectorAll('.merchant-checkbox:not([disabled])');
      checkboxes.forEach(cb => cb.checked = checked);
      updateBatchActionsVisibility();
    }

    function onMerchantCheckboxChange() {
      updateBatchActionsVisibility();
      // Update select all checkbox state
      const checkboxes = document.querySelectorAll('.merchant-checkbox:not([disabled])');
      const checkedBoxes = document.querySelectorAll('.merchant-checkbox:checked');
      const selectAllCheckbox = document.getElementById('merchants-select-all');
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = checkboxes.length > 0 && checkboxes.length === checkedBoxes.length;
        selectAllCheckbox.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < checkboxes.length;
      }
    }

    function updateBatchActionsVisibility() {
      const checkedBoxes = document.querySelectorAll('.merchant-checkbox:checked');
      const batchActionsDiv = document.getElementById('merchants-batch-actions');
      const selectedCountSpan = document.getElementById('merchants-selected-count');
      
      if (checkedBoxes.length > 0) {
        batchActionsDiv.style.display = 'block';
        selectedCountSpan.textContent = '已选择 ' + checkedBoxes.length + ' 项';
      } else {
        batchActionsDiv.style.display = 'none';
      }
    }

    function getSelectedMerchants() {
      const checkedBoxes = document.querySelectorAll('.merchant-checkbox:checked');
      return Array.from(checkedBoxes).map(cb => ({
        merchantId: cb.dataset.merchantId,
        workerName: cb.dataset.workerName,
        domain: cb.dataset.domain,
        emails: parseInt(cb.dataset.emails) || 0,
        campaigns: parseInt(cb.dataset.campaigns) || 0
      }));
    }

    function showBatchDeleteModal() {
      const selectedMerchants = getSelectedMerchants();
      if (selectedMerchants.length === 0) {
        showAlert('请先选择要删除的商户', 'error');
        return;
      }

      document.getElementById('batch-delete-count').textContent = selectedMerchants.length;
      
      // Build list of merchants to delete
      const listHtml = selectedMerchants.map(m => 
        '<div style="padding:4px 0;border-bottom:1px solid #eee;">' +
          '<strong>' + escapeHtml(m.domain) + '</strong>' +
          ' <span style="color:#666;">(' + m.workerName + ')</span>' +
          ' - ' + m.emails + ' 封邮件, ' + m.campaigns + ' 个活动' +
        '</div>'
      ).join('');
      document.getElementById('batch-delete-list').innerHTML = listHtml;
      
      // Reset progress UI
      document.getElementById('batch-delete-progress').style.display = 'none';
      document.getElementById('batch-delete-buttons').style.display = 'flex';
      document.getElementById('batch-delete-progress-bar').style.width = '0%';
      
      showModal('batch-delete-modal');
    }

    async function confirmBatchDelete() {
      const selectedMerchants = getSelectedMerchants();
      if (selectedMerchants.length === 0) {
        hideModal('batch-delete-modal');
        return;
      }

      // Show progress UI
      document.getElementById('batch-delete-progress').style.display = 'block';
      document.getElementById('batch-delete-buttons').style.display = 'none';
      
      let successCount = 0;
      let failCount = 0;
      let totalEmails = 0;
      let totalPaths = 0;
      
      for (let i = 0; i < selectedMerchants.length; i++) {
        const m = selectedMerchants[i];
        const progress = Math.round(((i + 1) / selectedMerchants.length) * 100);
        document.getElementById('batch-delete-progress-bar').style.width = progress + '%';
        document.getElementById('batch-delete-status').textContent = '正在删除 ' + (i + 1) + '/' + selectedMerchants.length + ': ' + m.domain;
        
        try {
          const res = await fetch('/api/campaign/merchants/' + encodeURIComponent(m.merchantId) + '/data?workerName=' + encodeURIComponent(m.workerName), {
            method: 'DELETE',
            headers: getHeaders()
          });
          
          if (res.ok) {
            const data = await res.json();
            successCount++;
            totalEmails += data.result?.emailsDeleted || 0;
            totalPaths += data.result?.pathsDeleted || 0;
          } else {
            failCount++;
          }
        } catch (e) {
          console.error('Error deleting merchant:', m.domain, e);
          failCount++;
        }
      }
      
      hideModal('batch-delete-modal');
      
      // Show result
      let message = '批量删除完成！\\n';
      message += '- 成功: ' + successCount + ' 个商户\\n';
      if (failCount > 0) {
        message += '- 失败: ' + failCount + ' 个商户\\n';
      }
      message += '- 删除邮件数: ' + totalEmails + '\\n';
      message += '- 删除路径数: ' + totalPaths;
      
      showAlert(message, failCount > 0 ? 'warning' : 'success');
      
      // Refresh data
      await loadMerchantList();
      await loadProjects();
    }

    // Orphaned workers cleanup functions
    async function showOrphanedWorkersModal() {
      showModal('orphaned-workers-modal');
      
      document.getElementById('orphaned-workers-loading').style.display = 'block';
      document.getElementById('orphaned-workers-empty').style.display = 'none';
      document.getElementById('orphaned-workers-list').style.display = 'none';
      document.getElementById('orphaned-delete-progress').style.display = 'none';
      
      try {
        const res = await fetch('/api/campaign/orphaned-workers', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        const orphanedWorkers = data.orphanedWorkers || [];
        
        document.getElementById('orphaned-workers-loading').style.display = 'none';
        
        // Get current active worker names
        const activeWorkerNames = new Set(workers.map(w => w.name));
        
        // Filter to only show workers that are not in the active list
        const realOrphaned = orphanedWorkers.filter(w => !activeWorkerNames.has(w.workerName));
        
        if (realOrphaned.length === 0) {
          document.getElementById('orphaned-workers-empty').style.display = 'block';
          return;
        }
        
        // Build list HTML
        const listHtml = realOrphaned.map(w => 
          '<div style="padding:12px;border:1px solid #ddd;border-radius:6px;margin-bottom:10px;background:#fff;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
              '<div>' +
                '<strong style="color:#dc3545;">' + escapeHtml(w.workerName) + '</strong>' +
                '<span style="color:#999;margin-left:10px;font-size:13px;">(已删除的实例)</span>' +
              '</div>' +
              '<button class="btn btn-sm btn-danger" onclick="deleteOrphanedWorkerData(\\'' + escapeHtml(w.workerName) + '\\')">删除数据</button>' +
            '</div>' +
            '<div style="margin-top:8px;font-size:13px;color:#666;">' +
              '📧 ' + w.emailCount + ' 封邮件 | 🏪 ' + w.merchantCount + ' 个商户' +
            '</div>' +
          '</div>'
        ).join('');
        
        // Also show active workers for reference
        const activeWorkersHtml = orphanedWorkers
          .filter(w => activeWorkerNames.has(w.workerName))
          .map(w => 
            '<div style="padding:12px;border:1px solid #28a745;border-radius:6px;margin-bottom:10px;background:#f8fff8;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<div>' +
                  '<strong style="color:#28a745;">' + escapeHtml(w.workerName) + '</strong>' +
                  '<span style="color:#28a745;margin-left:10px;font-size:13px;">✓ 活跃实例</span>' +
                '</div>' +
              '</div>' +
              '<div style="margin-top:8px;font-size:13px;color:#666;">' +
                '📧 ' + w.emailCount + ' 封邮件 | 🏪 ' + w.merchantCount + ' 个商户' +
              '</div>' +
            '</div>'
          ).join('');
        
        document.getElementById('orphaned-workers-list').innerHTML = 
          (realOrphaned.length > 0 ? '<h4 style="margin:0 0 10px 0;color:#dc3545;">⚠️ 过期实例 (' + realOrphaned.length + ')</h4>' + listHtml : '') +
          (activeWorkersHtml ? '<h4 style="margin:15px 0 10px 0;color:#28a745;">✓ 活跃实例</h4>' + activeWorkersHtml : '');
        document.getElementById('orphaned-workers-list').style.display = 'block';
        
      } catch (e) {
        console.error('Error fetching orphaned workers:', e);
        document.getElementById('orphaned-workers-loading').style.display = 'none';
        document.getElementById('orphaned-workers-list').innerHTML = '<p style="color:#dc3545;">加载失败，请重试</p>';
        document.getElementById('orphaned-workers-list').style.display = 'block';
      }
    }

    async function deleteOrphanedWorkerData(workerName) {
      if (!confirm('确定要删除实例 "' + workerName + '" 的所有数据吗？此操作不可恢复！')) {
        return;
      }
      
      document.getElementById('orphaned-delete-progress').style.display = 'block';
      document.getElementById('orphaned-delete-progress-bar').style.width = '50%';
      document.getElementById('orphaned-delete-status').textContent = '正在删除 ' + workerName + ' 的数据...';
      
      try {
        const res = await fetch('/api/campaign/orphaned-worker-data?workerName=' + encodeURIComponent(workerName), {
          method: 'DELETE',
          headers: getHeaders()
        });
        
        document.getElementById('orphaned-delete-progress-bar').style.width = '100%';
        
        if (res.ok) {
          const data = await res.json();
          const result = data.result;
          
          let message = '删除成功！\\n';
          message += '- 删除邮件数: ' + result.emailsDeleted + '\\n';
          message += '- 删除路径数: ' + result.pathsDeleted + '\\n';
          message += '- 影响商户数: ' + result.merchantsAffected + '\\n';
          message += '- 删除商户数: ' + result.merchantsDeleted;
          
          showAlert(message, 'success');
          
          // Refresh the modal
          setTimeout(() => showOrphanedWorkersModal(), 500);
          
          // Refresh merchant list
          await loadMerchantList();
        } else {
          const err = await res.json();
          showAlert('删除失败: ' + (err.message || err.error || '未知错误'), 'error');
          document.getElementById('orphaned-delete-progress').style.display = 'none';
        }
      } catch (e) {
        console.error('Error deleting orphaned worker data:', e);
        showAlert('删除失败', 'error');
        document.getElementById('orphaned-delete-progress').style.display = 'none';
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
      
      // Clear all tab content to prevent showing stale data from previous project
      clearAllTabContent();
      
      // Show project detail section
      document.getElementById('campaign-project-detail-section').style.display = 'block';
      
      // Re-render projects to show selection
      renderProjects();
      
      // Switch to default tab (root) and load data
      switchProjectTab('root');
    }
    
    // Clear all tab content when switching projects
    function clearAllTabContent() {
      // Clear Root tab
      const rootEmpty = document.getElementById('root-campaigns-empty');
      if (rootEmpty) {
        rootEmpty.style.display = 'block';
        rootEmpty.textContent = '加载中...';
      }
      const rootCurrent = document.getElementById('root-current');
      if (rootCurrent) rootCurrent.style.display = 'none';
      
      // Clear Campaigns tab
      const campaignsTable = document.getElementById('project-campaigns-table');
      if (campaignsTable) campaignsTable.innerHTML = '';
      const campaignsEmpty = document.getElementById('project-campaigns-empty');
      if (campaignsEmpty) {
        campaignsEmpty.style.display = 'block';
        campaignsEmpty.textContent = '加载中...';
      }
      
      // Clear Path Analysis tab - IMPORTANT for project isolation
      const pathNoRoot = document.getElementById('path-no-root');
      if (pathNoRoot) pathNoRoot.style.display = 'none';
      const pathContainer = document.getElementById('path-analysis-container');
      if (pathContainer) pathContainer.style.display = 'none';
      const flowContainer = document.getElementById('path-flow-container');
      if (flowContainer) flowContainer.innerHTML = '加载中...';
      const lastAnalysisTime = document.getElementById('path-last-analysis-time');
      if (lastAnalysisTime) lastAnalysisTime.textContent = '';
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
      // Requirements 2.1, 2.2, 2.3, 2.4: Use project-level API for Root campaign management
      if (!currentProjectId) {
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
        // Fetch all campaigns for this merchant (not filtered by worker)
        // This ensures we can see all root candidates across all workers
        let campaignsUrl = '/api/campaign/campaigns?merchantId=' + currentMerchantId + '&limit=500';
        
        // Use project-level API for root campaigns (Requirements 2.2, 2.5)
        const rootUrl = '/api/campaign/projects/' + currentProjectId + '/root-campaigns';
        
        const [campaignsRes, rootRes] = await Promise.all([
          fetch(campaignsUrl, { headers: getHeaders() }),
          fetch(rootUrl, { headers: getHeaders() })
        ]);
        
        if (!campaignsRes.ok || !rootRes.ok) throw new Error('Failed');
        
        const campaignsData = await campaignsRes.json();
        const rootData = await rootRes.json();
        
        const allCampaigns = campaignsData.campaigns || [];
        const projectRootCampaigns = rootData.rootCampaigns || [];
        
        // Create a map of project root campaign info
        const rootInfoMap = new Map();
        projectRootCampaigns.forEach(r => {
          rootInfoMap.set(r.campaignId, r);
        });
        
        // Merge campaign data with project root info
        const mergedCampaigns = allCampaigns.map(c => {
          const rootInfo = rootInfoMap.get(c.id);
          return {
            campaignId: c.id,
            subject: c.subject,
            totalEmails: c.totalEmails,
            isConfirmed: rootInfo?.isConfirmed || false,
            isCandidate: c.isRootCandidate || false, // Get candidate info from campaigns API
            candidateReason: c.rootCandidateReason || null,
            newUserCount: rootInfo?.newUserCount || 0
          };
        });
        
        // Sort: confirmed first, then candidates, then by email count
        mergedCampaigns.sort((a, b) => {
          if (a.isConfirmed !== b.isConfirmed) return a.isConfirmed ? -1 : 1;
          if (a.isCandidate !== b.isCandidate) return a.isCandidate ? -1 : 1;
          return b.totalEmails - a.totalEmails;
        });
        
        // Find current root (isConfirmed = true)
        const confirmedRoot = mergedCampaigns.find(c => c.isConfirmed);
        if (confirmedRoot) {
          currentProjectRootId = confirmedRoot.campaignId;
          currentRootDiv.style.display = 'block';
          document.getElementById('root-current-name').innerHTML = escapeHtml(confirmedRoot.subject || '未知主题') + 
            ' <button class="btn btn-sm btn-danger" onclick="unsetRoot(\\'' + confirmedRoot.campaignId + '\\')" style="margin-left:10px;">取消选择</button>';
        } else {
          currentProjectRootId = null;
          currentRootDiv.style.display = 'none';
        }
        
        if (mergedCampaigns.length === 0) {
          emptyDiv.textContent = '该商户暂无营销活动数据。';
          return;
        }
        
        emptyDiv.style.display = 'none';
        tableContainer.style.display = 'table';
        
        const tbody = document.getElementById('root-campaigns-table');
        tbody.innerHTML = mergedCampaigns.map(c => {
          const isRoot = c.isConfirmed;
          const isCandidate = c.isCandidate;
          let statusBadge = '';
          if (isRoot) {
            statusBadge = '<span class="root-badge">当前 Root</span>';
          } else if (isCandidate) {
            statusBadge = '<span class="candidate-badge" title="' + escapeHtml(c.candidateReason || '自动检测') + '">候选</span>';
          } else {
            statusBadge = '<span style="color:#999;font-size:11px;">-</span>';
          }
          const actionBtn = isRoot 
            ? '<button class="btn btn-sm btn-danger" onclick="unsetRoot(\\'' + c.campaignId + '\\')">取消选择</button>'
            : '<button class="btn btn-sm btn-primary" onclick="setAsRoot(\\'' + c.campaignId + '\\')">设为 Root</button>';
          
          const rowStyle = isRoot ? 'background:#e8f5e9;' : (isCandidate ? 'background:#fff3e0;' : '');
          return '<tr style="' + rowStyle + '">' +
            '<td>' + escapeHtml(c.subject || '未知主题') + '</td>' +
            '<td>' + (c.totalEmails || 0) + '</td>' +
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
      // Requirements 2.1, 2.4: Use project-level API for setting Root campaign
      if (!currentProjectId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      try {
        // Use project-level API to set root campaign
        const res = await fetch('/api/campaign/projects/' + currentProjectId + '/root-campaigns', {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ campaignId: campaignId, isConfirmed: true })
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

    async function unsetRoot(campaignId) {
      // Requirements 2.4: Use project-level API for removing Root campaign
      if (!currentProjectId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      if (!confirm('确定要取消此活动的 Root 状态吗？')) return;
      
      try {
        // Use project-level API to remove root campaign
        const res = await fetch('/api/campaign/projects/' + currentProjectId + '/root-campaigns/' + campaignId, {
          method: 'DELETE',
          headers: getHeaders()
        });
        
        if (res.ok) {
          currentProjectRootId = null;
          showAlert('Root 已取消');
          loadRootCampaigns();
        } else {
          const errorData = await res.json().catch(() => ({}));
          showAlert(errorData.message || '取消失败', 'error');
        }
      } catch (e) {
        console.error('Error unsetting root:', e);
        showAlert('取消失败', 'error');
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
        
        // Use project-level API for campaigns with project-specific tags
        // This ensures data isolation between projects
        let url = '/api/campaign/projects/' + currentProjectId + '/campaigns';
        
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        campaignsData = data.campaigns || [];
        
        // Apply value filter client-side (since project API returns all campaigns)
        if (valueFilter) {
          const filterTag = parseInt(valueFilter, 10);
          campaignsData = campaignsData.filter(c => c.tag === filterTag);
        }
        
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
        const tagLabels = { 0: '未标记', 1: '有价值', 2: '高价值', 3: '无价值' };
        const tagClasses = { 0: 'value-tag-0', 1: 'value-tag-1', 2: 'value-tag-2', 3: 'value-tag-3' };
        const tagBadge = '<span class="' + tagClasses[tag] + '" style="padding:2px 8px;border-radius:4px;font-size:11px;">' + tagLabels[tag] + '</span>';
        const firstSeen = (c.firstSeenAt || c.firstSeen) ? new Date(c.firstSeenAt || c.firstSeen).toLocaleDateString('zh-CN') : '-';
        
        return '<tr style="cursor:pointer;" onclick="showCampaignDetail(\\'' + c.id + '\\')">' +
          '<td>' + escapeHtml(c.subject || '未知主题') + '</td>' +
          '<td>' + (c.totalEmails || c.emailCount || 0) + '</td>' +
          '<td>' + (c.uniqueRecipients || c.recipientCount || 0) + '</td>' +
          '<td>' + tagBadge + '</td>' +
          '<td>' + firstSeen + '</td>' +
          '<td class="actions" onclick="event.stopPropagation()">' +
            '<button class="btn btn-sm btn-secondary" onclick="tagCampaign(\\'' + c.id + '\\', 0)" style="font-size:11px;">清除</button>' +
            '<button class="btn btn-sm btn-success" onclick="tagCampaign(\\'' + c.id + '\\', 1)" style="font-size:11px;">有价值</button>' +
            '<button class="btn btn-sm btn-warning" onclick="tagCampaign(\\'' + c.id + '\\', 2)" style="font-size:11px;">高价值</button>' +
            '<button class="btn btn-sm btn-danger" onclick="tagCampaign(\\'' + c.id + '\\', 3)" style="font-size:11px;">无价值</button>' +
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
        const tagLabels = { 0: '未标记', 1: '有价值', 2: '高价值', 3: '无价值' };
        const tagClasses = { 0: 'value-tag-0', 1: 'value-tag-1', 2: 'value-tag-2', 3: 'value-tag-3' };
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
          '<button class="btn btn-sm btn-success" onclick="tagCampaignFromDetail(\\'' + campaignId + '\\', 1)">有价值</button>' +
          '<button class="btn btn-sm btn-warning" onclick="tagCampaignFromDetail(\\'' + campaignId + '\\', 2)">高价值</button>' +
          '<button class="btn btn-sm btn-danger" onclick="tagCampaignFromDetail(\\'' + campaignId + '\\', 3)">无价值</button>' +
          '</div>';
        
        contentDiv.innerHTML = content;
      } catch (e) {
        console.error('Error loading campaign detail:', e);
        contentDiv.innerHTML = '<p style="text-align:center;color:#e74c3c;">加载失败，请重试。</p>';
      }
    }

    async function tagCampaignFromDetail(campaignId, tagValue) {
      try {
        // Use project-level API for tag isolation
        const res = await fetch('/api/campaign/projects/' + currentProjectId + '/campaigns/' + campaignId + '/tag', {
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
        // Use project-level API for tag isolation
        const res = await fetch('/api/campaign/projects/' + currentProjectId + '/campaigns/' + campaignId + '/tag', {
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
      // Requirements 4.3, 5.2, 5.3: Use project-level API for path analysis
      const noRootDiv = document.getElementById('path-no-root');
      const analysisContainer = document.getElementById('path-analysis-container');
      const flowContainer = document.getElementById('path-flow-container');
      const lastAnalysisTimeSpan = document.getElementById('path-last-analysis-time');
      
      // Check if project has any root campaigns set
      if (!currentProjectId) {
        noRootDiv.style.display = 'block';
        analysisContainer.style.display = 'none';
        return;
      }
      
      noRootDiv.style.display = 'none';
      analysisContainer.style.display = 'block';
      flowContainer.innerHTML = '加载中...';
      
      try {
        // Use project-level API for path analysis (Requirements: 4.3, 5.2, 5.3)
        const url = '/api/campaign/projects/' + currentProjectId + '/path-analysis';
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        
        // Update last analysis time display (Requirements 6.1, 7.1)
        if (lastAnalysisTimeSpan) {
          if (data.lastAnalysisTime) {
            lastAnalysisTimeSpan.textContent = '上次分析: ' + new Date(data.lastAnalysisTime).toLocaleString('zh-CN');
          } else {
            lastAnalysisTimeSpan.textContent = '尚未分析';
          }
        }
        
        // Check if there are root campaigns, if not show the no-root message
        if (!data.rootCampaigns || data.rootCampaigns.length === 0) {
          noRootDiv.style.display = 'block';
          analysisContainer.style.display = 'none';
          return;
        }
        
        renderProjectPathAnalysis(data);
      } catch (e) {
        console.error('Error loading path analysis:', e);
        flowContainer.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">加载失败，请重试。</div>';
      }
    }

    function renderProjectPathAnalysis(data) {
      // Requirements 4.3, 5.2, 5.3: Render project-level path analysis data
      const flowContainer = document.getElementById('path-flow-container');
      
      // Check if data is valid
      if (!data || !data.userStats) {
        flowContainer.innerHTML = '<div style="text-align:center;color:#999;padding:40px;">暂无路径数据。请先运行分析。</div>';
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
      
      // User Stats Section - Handle both project-level and merchant-level formats
      const totalNewUsers = data.userStats.totalNewUsers || data.userStats.newUsers || 0;
      const totalEvents = data.userStats.totalEvents || 0;
      
      html += '<div style="background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:15px;margin-bottom:15px;">';
      html += '<h4 style="margin:0 0 10px 0;font-size:13px;color:#1565c0;">📊 项目用户统计</h4>';
      html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">';
      html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#28a745;">' + totalNewUsers + '</div><div style="font-size:11px;color:#666;">新用户数</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#1565c0;">' + totalEvents + '</div><div style="font-size:11px;color:#666;">事件总数</div></div>';
      html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#9c27b0;">' + (data.lastAnalysisTime ? new Date(data.lastAnalysisTime).toLocaleString('zh-CN') : '未分析') + '</div><div style="font-size:11px;color:#666;">上次分析</div></div>';
      html += '</div></div>';
      
      // Valuable Stats Section (Requirements 9.3, 9.5)
      if (data.valuableStats) {
        const vs = data.valuableStats;
        html += '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:15px;margin-bottom:15px;">';
        html += '<h4 style="margin:0 0 10px 0;font-size:13px;color:#2e7d32;">⭐ 有价值活动统计</h4>';
        html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">';
        html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#27ae60;">' + (vs.valuableCampaignCount || 0) + '</div><div style="font-size:11px;color:#666;">有价值活动</div></div>';
        html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#ffc107;">' + (vs.highValueCampaignCount || 0) + '</div><div style="font-size:11px;color:#666;">高价值活动</div></div>';
        html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#2e7d32;">' + (vs.valuableUserReach || 0) + '</div><div style="font-size:11px;color:#666;">触达用户数</div></div>';
        html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:bold;color:#1565c0;">' + (vs.valuableConversionRate || 0).toFixed(1) + '%</div><div style="font-size:11px;color:#666;">有价值转化率</div></div>';
        html += '</div></div>';
      }
      
      // Root Campaigns Section
      if (data.rootCampaigns && data.rootCampaigns.length > 0) {
        html += '<div style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:15px;margin-bottom:15px;">';
        html += '<h4 style="margin:0 0 10px 0;font-size:13px;color:#e65100;">🎯 项目 Root 活动</h4>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
        data.rootCampaigns.forEach(rc => {
          const badge = rc.isConfirmed ? '<span style="background:#28a745;color:white;padding:2px 6px;border-radius:3px;font-size:10px;margin-left:5px;">已确认</span>' : '';
          html += '<div style="background:#fff;border:1px solid #ffcc80;border-radius:4px;padding:8px 12px;font-size:12px;">';
          html += escapeHtml(rc.subject.substring(0, 40)) + badge;
          html += '</div>';
        });
        html += '</div></div>';
      }
      
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
        html += '<div style="text-align:center;color:#999;padding:20px;">暂无层级数据。请先运行分析。</div>';
      }
      html += '</div>';
      
      // Transitions Section - Tree View (no depth limit)
      html += '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:15px;">';
      html += '<h4 style="margin:0 0 10px 0;font-size:13px;color:#2e7d32;">🔄 新用户转移路径</h4>';
      
      if (data.transitions && data.transitions.length > 0) {
        // Build tree structure from transitions
        const transitionMap = {};
        const allTargets = new Set();
        
        // First pass: build the transition map
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
            ratio: t.transitionRatio || 0
          });
          allTargets.add(t.toCampaignId);
        });
        
        // Second pass: mark paths leading to valuable campaigns (Requirements 9.2, 9.6)
        // A path is "priority" if it leads to a high-value campaign (tag=2)
        function markPriorityPaths(campaignId, visited = new Set()) {
          if (visited.has(campaignId)) return false;
          visited.add(campaignId);
          
          const node = transitionMap[campaignId];
          if (!node) return false;
          
          let leadsToValuable = false;
          for (const child of node.children) {
            // Check if child is valuable
            if (child.tag === 2 || child.tag === 1 || child.isValuable) {
              child.isPriorityPath = true;
              leadsToValuable = true;
            }
            // Recursively check if child leads to valuable
            if (markPriorityPaths(child.campaignId, new Set(visited))) {
              child.isPriorityPath = true;
              leadsToValuable = true;
            }
          }
          return leadsToValuable;
        }
        
        // Find root nodes (nodes that are not targets of any transition)
        const rootNodes = Object.keys(transitionMap).filter(id => !allTargets.has(id));
        
        // If no clear roots, use nodes with most outgoing transitions
        if (rootNodes.length === 0) {
          const sortedNodes = Object.entries(transitionMap)
            .sort((a, b) => b[1].children.length - a[1].children.length);
          if (sortedNodes.length > 0) rootNodes.push(sortedNodes[0][0]);
        }
        
        // Mark priority paths from each root
        rootNodes.forEach(rootId => markPriorityPaths(rootId));
        
        // Track visited nodes to prevent infinite loops
        const visited = new Set();
        
        // Render tree recursively - no depth limit
        function renderTreeNode(campaignId, depth) {
          if (!transitionMap[campaignId] || visited.has(campaignId)) return '';
          visited.add(campaignId);
          
          const node = transitionMap[campaignId];
          let nodeHtml = '';
          
          // Sort: priority paths first, then by userCount
          node.children.sort((a, b) => {
            // Priority paths first
            if (a.isPriorityPath && !b.isPriorityPath) return -1;
            if (!a.isPriorityPath && b.isPriorityPath) return 1;
            // Then by tag (tag=2 > tag=1 > others)
            const aTagPriority = a.tag === 2 ? 0 : (a.tag === 1 ? 1 : 2);
            const bTagPriority = b.tag === 2 ? 0 : (b.tag === 1 ? 1 : 2);
            if (aTagPriority !== bTagPriority) return aTagPriority - bTagPriority;
            // Finally by userCount
            return b.userCount - a.userCount;
          });
          
          node.children.forEach((child, idx, arr) => {
            const isLast = idx === arr.length - 1;
            const prefix = depth > 0 ? '│'.repeat(depth - 1) + (isLast ? '└' : '├') : '';
            const ratio = child.ratio || 0;
            // Enhanced background color: priority paths get special treatment
            let bgColor = 'transparent';
            if (child.tag === 2) {
              bgColor = '#fff8e1'; // Gold background for high-value
            } else if (child.tag === 1 || child.isValuable) {
              bgColor = '#e8f5e9'; // Green background for valuable
            } else if (child.isPriorityPath) {
              bgColor = '#f3e5f5'; // Purple background for paths leading to valuable
            } else if (ratio >= 50) {
              bgColor = '#c8e6c9';
            } else if (ratio >= 20) {
              bgColor = '#fff9c4';
            }
            const tagMarker = getTreeTagMarker(child.tag, child.isValuable);
            const priorityMarker = child.isPriorityPath && !child.isValuable && child.tag !== 1 && child.tag !== 2 ? ' <span style="color:#9c27b0;font-size:10px;">→⭐</span>' : '';
            
            nodeHtml += '<div style="padding:3px 0;font-size:12px;font-family:monospace;background:' + bgColor + ';border-radius:3px;margin:2px 0;">';
            nodeHtml += '<span style="color:#999;">' + prefix + '→ </span>';
            nodeHtml += '<span style="color:#333;">' + escapeHtml(child.subject.substring(0, 35)) + '</span>' + tagMarker + priorityMarker;
            nodeHtml += '<span style="color:#2e7d32;font-weight:bold;margin-left:8px;">' + child.userCount + '人</span>';
            if (ratio > 0) {
              nodeHtml += '<span style="color:#666;margin-left:5px;">(' + ratio.toFixed(1) + '%)</span>';
            }
            nodeHtml += '</div>';
            
            // Recursively render children - no depth limit
            nodeHtml += renderTreeNode(child.campaignId, depth + 1);
          });
          
          return nodeHtml;
        }
        
        // Calculate total users for each root (sum of all outgoing edges)
        const rootUserCounts = {};
        rootNodes.forEach(rootId => {
          const rootNode = transitionMap[rootId];
          if (rootNode && rootNode.children) {
            rootUserCounts[rootId] = rootNode.children.reduce((sum, child) => sum + (child.userCount || 0), 0);
          }
        });
        
        // Render from each root
        rootNodes.forEach(rootId => {
          const rootNode = transitionMap[rootId];
          if (rootNode) {
            const rootTagMarker = getTreeTagMarker(rootNode.tag, rootNode.isValuable);
            const rootUserCount = rootUserCounts[rootId] || totalNewUsers || 0;
            html += '<div style="margin-bottom:10px;padding:10px;background:#fff;border-radius:6px;border:1px solid #c8e6c9;">';
            html += '<div style="font-weight:bold;font-size:12px;color:#1b5e20;margin-bottom:6px;">🎯 ' + escapeHtml(rootNode.subject.substring(0, 40)) + rootTagMarker;
            html += ' <span style="color:#2e7d32;font-weight:bold;margin-left:8px;">' + rootUserCount + '人</span>';
            html += '</div>';
            visited.clear(); // Clear visited for each root tree
            html += renderTreeNode(rootId, 0);
            html += '</div>';
          }
        });
        
        html += '<p style="color:#888;font-size:10px;margin-top:8px;margin-bottom:0;">💡 <span style="background:#fff8e1;padding:1px 4px;border-radius:2px;">金色</span>=高价值 | <span style="background:#e8f5e9;padding:1px 4px;border-radius:2px;">绿色</span>=有价值 | <span style="background:#f3e5f5;padding:1px 4px;border-radius:2px;">紫色</span>=通往有价值 | <span style="color:#27ae60;">★</span>=有价值 | <span style="color:#ffc107;">★★</span>=高价值 | <span style="color:#9c27b0;">→⭐</span>=优先路径</p>';
      } else {
        html += '<div style="text-align:center;color:#999;padding:20px;">暂无转移数据。请先运行分析。</div>';
      }
      html += '</div>';
      
      flowContainer.innerHTML = html;
    }

    // ============================================
    // Project Analysis Progress Functions (Requirements 9.1-9.5)
    // ============================================
    
    let analysisEventSource = null;
    let isAnalyzing = false;
    
    /**
     * Start project path analysis with SSE progress updates
     * Requirements: 6.1, 7.1, 9.1, 9.2, 9.3, 9.4
     */
    async function startProjectAnalysis() {
      if (!currentProjectId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      if (isAnalyzing) {
        showAlert('分析正在进行中', 'error');
        return;
      }
      
      // Reset UI state
      isAnalyzing = true;
      updateAnalysisButton(true);
      hideAnalysisContainers();
      showAnalysisProgress();
      
      try {
        // Use SSE to receive progress updates
        const url = '/api/campaign/projects/' + currentProjectId + '/analyze';
        
        // Create EventSource for SSE
        analysisEventSource = new EventSource(url + '?token=' + encodeURIComponent(apiToken));
        
        // For POST request with SSE, we need to use fetch with streaming
        const response = await fetch(url, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || 'Analysis failed');
        }
        
        // Read the SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE events
          const lines = buffer.split('\\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const eventType = line.substring(7).trim();
              continue;
            }
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              try {
                const data = JSON.parse(dataStr);
                handleAnalysisEvent(data);
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
        
      } catch (e) {
        console.error('Error starting analysis:', e);
        showAnalysisError(e.message || '分析失败');
      } finally {
        isAnalyzing = false;
        updateAnalysisButton(false);
        if (analysisEventSource) {
          analysisEventSource.close();
          analysisEventSource = null;
        }
      }
    }
    
    /**
     * Handle SSE events from analysis
     */
    function handleAnalysisEvent(data) {
      if (data.phase === 'complete' || data.newUsersAdded !== undefined) {
        // Analysis complete
        showAnalysisComplete(data);
        loadPathAnalysis(); // Reload the path analysis data
      } else if (data.error) {
        // Error occurred
        showAnalysisError(data.error);
      } else if (data.phase) {
        // Progress update
        updateAnalysisProgress(data);
      }
    }

    /**
     * Start project path re-analysis (force full analysis)
     * Clears existing analysis data and re-analyzes all new user paths
     */
    async function startProjectReanalysis() {
      if (!currentProjectId) {
        showAlert('请先选择一个项目', 'error');
        return;
      }
      
      if (isAnalyzing) {
        showAlert('分析正在进行中', 'error');
        return;
      }
      
      // Confirm with user
      if (!confirm('重新分析将清除现有的分析数据（新用户、事件流、路径边），然后重新分析所有数据。\\n\\n确定要继续吗？')) {
        return;
      }
      
      // Reset UI state
      isAnalyzing = true;
      updateAnalysisButton(true);
      updateReanalysisButton(true);
      hideAnalysisContainers();
      showAnalysisProgress();
      
      try {
        // Use SSE to receive progress updates
        const url = '/api/campaign/projects/' + currentProjectId + '/reanalyze';
        
        // For POST request with SSE, we need to use fetch with streaming
        const response = await fetch(url, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({})
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || 'Re-analysis failed');
        }
        
        // Read the SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE events
          const lines = buffer.split('\\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              continue;
            }
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              try {
                const data = JSON.parse(dataStr);
                handleAnalysisEvent(data);
              } catch (e) {
                console.error('Error parsing SSE data:', e);
              }
            }
          }
        }
        
      } catch (e) {
        console.error('Error starting re-analysis:', e);
        showAnalysisError(e.message || '重新分析失败');
      } finally {
        isAnalyzing = false;
        updateAnalysisButton(false);
        updateReanalysisButton(false);
        if (analysisEventSource) {
          analysisEventSource.close();
          analysisEventSource = null;
        }
      }
    }
    
    /**
     * Update re-analysis button state
     */
    function updateReanalysisButton(analyzing) {
      const btn = document.getElementById('reanalyze-btn');
      if (btn) {
        if (analyzing) {
          btn.disabled = true;
          btn.innerHTML = '⏳ 重新分析中...';
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-secondary');
        } else {
          btn.disabled = false;
          btn.innerHTML = '🔄 重新分析';
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-primary');
        }
      }
    }
    
    /**
     * Update analysis button state
     */
    function updateAnalysisButton(analyzing) {
      const btn = document.getElementById('start-analysis-btn');
      if (btn) {
        if (analyzing) {
          btn.disabled = true;
          btn.innerHTML = '⏳ 分析中...';
          btn.classList.remove('btn-success');
          btn.classList.add('btn-secondary');
        } else {
          btn.disabled = false;
          btn.innerHTML = '▶️ 开始分析';
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-success');
        }
      }
    }
    
    /**
     * Hide all analysis status containers
     */
    function hideAnalysisContainers() {
      const progressContainer = document.getElementById('analysis-progress-container');
      const completeStats = document.getElementById('analysis-complete-stats');
      const errorContainer = document.getElementById('analysis-error-container');
      
      if (progressContainer) progressContainer.style.display = 'none';
      if (completeStats) completeStats.style.display = 'none';
      if (errorContainer) errorContainer.style.display = 'none';
    }
    
    /**
     * Show analysis progress container
     * Requirements: 9.1
     */
    function showAnalysisProgress() {
      const container = document.getElementById('analysis-progress-container');
      if (container) {
        container.style.display = 'block';
        updateAnalysisProgress({ phase: 'initializing', progress: 0, message: '准备中...' });
      }
    }
    
    /**
     * Update analysis progress display
     * Requirements: 9.2, 9.3
     */
    function updateAnalysisProgress(data) {
      const phaseText = document.getElementById('analysis-phase-text');
      const progressPercent = document.getElementById('analysis-progress-percent');
      const progressBar = document.getElementById('analysis-progress-bar');
      const progressDetails = document.getElementById('analysis-progress-details');
      
      // Phase labels
      const phaseLabels = {
        'initializing': '🔄 初始化中...',
        'processing_root_emails': '📧 处理 Root 邮件...',
        'building_events': '📝 构建用户事件...',
        'building_paths': '🔀 构建路径边...',
        'complete': '✅ 分析完成'
      };
      
      if (phaseText) {
        phaseText.textContent = data.message || phaseLabels[data.phase] || data.phase;
      }
      
      if (progressPercent) {
        progressPercent.textContent = (data.progress || 0) + '%';
      }
      
      if (progressBar) {
        progressBar.style.width = (data.progress || 0) + '%';
      }
      
      if (progressDetails && data.details) {
        progressDetails.textContent = '已处理: ' + data.details.processed + ' / ' + data.details.total;
      }
    }
    
    /**
     * Show analysis complete stats
     * Requirements: 9.4
     */
    function showAnalysisComplete(data) {
      hideAnalysisContainers();
      
      const container = document.getElementById('analysis-complete-stats');
      const details = document.getElementById('analysis-complete-details');
      
      if (container && details) {
        container.style.display = 'block';
        
        const isIncremental = data.isIncremental ? '增量分析' : '全量分析';
        const duration = data.duration ? (data.duration / 1000).toFixed(1) + '秒' : '-';
        
        details.innerHTML = 
          '<div style="text-align:center;"><div style="font-size:16px;font-weight:bold;color:#2e7d32;">' + (data.newUsersAdded || 0) + '</div><div style="color:#666;">新增用户</div></div>' +
          '<div style="text-align:center;"><div style="font-size:16px;font-weight:bold;color:#1565c0;">' + (data.eventsCreated || 0) + '</div><div style="color:#666;">新增事件</div></div>' +
          '<div style="text-align:center;"><div style="font-size:16px;font-weight:bold;color:#7b1fa2;">' + (data.edgesUpdated || 0) + '</div><div style="color:#666;">更新路径</div></div>' +
          '<div style="text-align:center;"><div style="font-size:16px;font-weight:bold;color:#e65100;">' + duration + '</div><div style="color:#666;">' + isIncremental + '</div></div>';
        
        showAlert('分析完成！新增 ' + (data.newUsersAdded || 0) + ' 个用户，' + (data.eventsCreated || 0) + ' 个事件', 'success');
      }
    }
    
    /**
     * Show analysis error
     * Requirements: 9.5
     */
    function showAnalysisError(message) {
      hideAnalysisContainers();
      
      const container = document.getElementById('analysis-error-container');
      const errorMessage = document.getElementById('analysis-error-message');
      
      if (container && errorMessage) {
        container.style.display = 'block';
        errorMessage.textContent = message || '未知错误';
      }
      
      showAlert('分析失败: ' + (message || '未知错误'), 'error');
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

      // Check which merchants have projects (per worker)
      // Build a map: merchantId -> Set of workerNames that have projects
      const merchantProjectWorkers = new Map();
      projectsData.forEach(p => {
        if (!merchantProjectWorkers.has(p.merchantId)) {
          merchantProjectWorkers.set(p.merchantId, new Set());
        }
        // Add all workers from workerNames array (for multi-worker projects)
        const workers = p.workerNames && p.workerNames.length > 0 ? p.workerNames : (p.workerName ? [p.workerName] : []);
        workers.forEach(w => merchantProjectWorkers.get(p.merchantId).add(w));
      });
      
      tbody.innerHTML = merchantsData.map(m => {
        // Check if this specific merchant+worker combination has a project
        const workerSet = merchantProjectWorkers.get(m.id);
        const hasProject = workerSet && workerSet.has(workerName);
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
      heartbeat: null,
      merchants: null,
      dataStats: null,
      logs: null,
      stats: null,
      subjects: null
    };

    // Auto-refresh functions
    const autoRefreshFunctions = {
      alerts: () => loadMonitoringAlerts(),
      status: () => loadMonitoringStatus(),
      funnel: () => { loadRatioMonitors(); checkRatioMonitors(); },
      heartbeat: () => triggerHeartbeat(),
      merchants: () => { loadMerchantList(); loadProjects(); },
      dataStats: () => loadDataStats(),
      logs: () => loadLogs(),
      stats: () => loadStats(),
      subjects: () => loadSubjects()
    };

    // Tab visibility controller - tracks which tab is currently active
    let currentActiveTab = 'workers';

    // Mapping of tabs to their associated refresh types
    const tabRefreshTypes = {
      'workers': [],
      'rules': [],
      'dynamic': [],
      'logs': ['logs'],
      'stats': ['stats'],
      'campaign': ['merchants', 'dataStats'],
      'subjects': ['subjects'],
      'monitoring': ['alerts', 'status', 'funnel', 'heartbeat'],
      'settings': []
    };

    // Track paused state for each timer type (paused when tab is not active)
    const pausedRefreshState = {};

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
          // Skip restoration for types not in autoRefreshTimers
          if (!autoRefreshTimers.hasOwnProperty(type)) {
            console.log('[AutoRefresh] Skipping restoration for unknown type: ' + type);
            return;
          }
          
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
      if (fn && autoRefreshTimers.hasOwnProperty(type)) {
        autoRefreshTimers[type] = setInterval(fn, interval);
        console.log('[AutoRefresh] Started ' + type + ' with interval ' + (interval/1000) + 's');
      }
    }

    function stopAutoRefresh(type) {
      if (autoRefreshTimers.hasOwnProperty(type) && autoRefreshTimers[type]) {
        clearInterval(autoRefreshTimers[type]);
        autoRefreshTimers[type] = null;
        console.log('[AutoRefresh] Stopped ' + type);
      }
    }

    function stopAllAutoRefresh() {
      Object.keys(autoRefreshTimers).forEach(type => stopAutoRefresh(type));
    }

    // Pause auto-refresh for a specific tab (stores state for later resume)
    function pauseTabRefresh(tabName) {
      const refreshTypes = tabRefreshTypes[tabName] || [];
      refreshTypes.forEach(type => {
        if (autoRefreshTimers[type]) {
          // Store the current interval before stopping
          const checkbox = document.getElementById(type + '-auto-refresh');
          const intervalSelect = document.getElementById(type + '-refresh-interval');
          if (checkbox && checkbox.checked) {
            pausedRefreshState[type] = {
              interval: parseInt(intervalSelect?.value || '60', 10) * 1000
            };
          }
          stopAutoRefresh(type);
          console.log('[AutoRefresh] Paused ' + type + ' (tab: ' + tabName + ')');
        }
      });
    }

    // Resume auto-refresh for a specific tab (if it was previously enabled)
    function resumeTabRefresh(tabName) {
      const refreshTypes = tabRefreshTypes[tabName] || [];
      refreshTypes.forEach(type => {
        const checkbox = document.getElementById(type + '-auto-refresh');
        if (checkbox && checkbox.checked) {
          // Use stored interval if available, otherwise get from UI
          const intervalSelect = document.getElementById(type + '-refresh-interval');
          const interval = pausedRefreshState[type]?.interval || parseInt(intervalSelect?.value || '60', 10) * 1000;
          startAutoRefresh(type, interval);
          console.log('[AutoRefresh] Resumed ' + type + ' (tab: ' + tabName + ')');
          // Clear paused state after resuming
          delete pausedRefreshState[type];
        }
      });
    }

    // Stop auto-refresh when leaving the page
    window.addEventListener('beforeunload', stopAllAutoRefresh);

    // ============================================
    // Subjects Tab Functions
    // ============================================
    
    let subjectsData = [];
    let subjectsPage = 1;
    let subjectsPageSize = 20;
    let subjectsTotalCount = 0;
    let selectedSubjectIds = new Set();

    function resetSubjectsPageAndLoad() {
      subjectsPage = 1;
      loadSubjects();
    }

    async function loadSubjects() {
      if (!apiToken) return;
      try {
        const workerFilter = document.getElementById('subjects-worker-filter')?.value || '';
        const merchantFilter = document.getElementById('subjects-merchant-filter')?.value || '';
        const sortOrder = document.getElementById('subjects-sort-order')?.value || 'desc';
        const focusFilter = document.getElementById('subjects-focus-filter')?.checked || false;
        
        // Changed default sortBy to lastSeenAt (last email time)
        let url = '/api/subjects?sortBy=lastSeenAt&sortOrder=' + sortOrder;
        url += '&limit=' + subjectsPageSize + '&offset=' + ((subjectsPage - 1) * subjectsPageSize);
        if (workerFilter) url += '&workerName=' + encodeURIComponent(workerFilter);
        if (merchantFilter) url += '&merchantDomain=' + encodeURIComponent(merchantFilter);
        if (focusFilter) url += '&isFocused=true';
        
        const res = await fetch(url, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        subjectsData = data.items || [];
        subjectsTotalCount = data.total || 0;
        renderSubjects();
        updateSubjectsWorkerFilter();
        updateSubjectsMerchantFilter();
        updateSubjectsPagination();
      } catch (e) {
        console.error('Error loading subjects:', e);
        showAlert('加载邮件主题失败', 'error');
      }
    }

    function renderSubjects() {
      const tbody = document.getElementById('subjects-table');
      const emptyDiv = document.getElementById('subjects-empty');
      const tableContainer = document.getElementById('subjects-table-container');
      
      if (subjectsData.length === 0) {
        emptyDiv.style.display = 'block';
        tableContainer.style.display = 'none';
        return;
      }
      
      emptyDiv.style.display = 'none';
      tableContainer.style.display = 'table';
      
      tbody.innerHTML = subjectsData.map(s => {
        const isSelected = selectedSubjectIds.has(s.subjectHash);
        // Styling: focused = yellow background, ignored = gray background
        let rowStyle = '';
        if (s.isFocused) {
          rowStyle = 'style="background:#fff8e1;"';
        } else if (s.isIgnored) {
          rowStyle = 'style="background:#f5f5f5;color:#999;"';
        }
        
        const focusIcon = s.isFocused ? '⭐' : '☆';
        const focusTitle = s.isFocused ? '取消关注' : '添加关注';
        
        const ignoreIcon = s.isIgnored ? '🔕' : '🔔';
        const ignoreTitle = s.isIgnored ? '取消忽略' : '忽略';
        const ignoreButtonClass = s.isIgnored ? 'btn-secondary' : 'btn-warning';
        
        // Format email time range
        const firstTime = new Date(s.firstSeenAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const lastTime = new Date(s.lastSeenAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const timeRangeHtml = '<div style="font-size:12px;color:#666;">首: ' + firstTime + '</div><div style="font-size:12px;color:#666;">末: ' + lastTime + '</div>';
        
        // Render worker stats as multi-line
        const workerStatsHtml = (s.workerStats || []).map(ws => 
          '<div style="white-space:nowrap;">' + escapeHtml(ws.workerName) + ' <span style="color:#666;">(' + ws.emailCount + ')</span></div>'
        ).join('');
        
        return '<tr ' + rowStyle + '>' +
          '<td style="vertical-align:middle;"><input type="checkbox" ' + (isSelected ? 'checked' : '') + ' onchange="toggleSubjectSelection(\\'' + escapeHtml(s.subjectHash) + '\\', this.checked)"></td>' +
          '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;" title="' + escapeHtml(s.subject) + '">' + escapeHtml(s.subject) + '</td>' +
          '<td style="vertical-align:middle;">' + escapeHtml(s.merchantDomain) + '</td>' +
          '<td style="vertical-align:middle;">' + workerStatsHtml + '</td>' +
          '<td style="font-weight:bold;vertical-align:middle;">' + s.totalEmailCount + '</td>' +
          '<td style="vertical-align:middle;font-size:12px;">' + timeRangeHtml + '</td>' +
          '<td style="vertical-align:middle;"><button class="btn btn-sm" onclick="toggleSubjectFocus(\\'' + escapeHtml(s.subjectHash) + '\\', ' + !s.isFocused + ')" title="' + focusTitle + '">' + focusIcon + '</button></td>' +
          '<td style="vertical-align:middle;"><button class="btn btn-sm ' + ignoreButtonClass + '" onclick="toggleSubjectIgnore(\\'' + escapeHtml(s.subjectHash) + '\\', ' + !s.isIgnored + ')" title="' + ignoreTitle + '">' + ignoreIcon + '</button></td>' +
          '<td style="vertical-align:middle;white-space:nowrap;">' +
            '<button class="btn btn-sm btn-primary" data-subject="' + escapeHtml(s.subject) + '" data-domain="' + escapeHtml(s.merchantDomain) + '" onclick="addSubjectToRuleFromButton(this)">添加到规则</button> ' +
            '<button class="btn btn-sm btn-danger" onclick="deleteSubject(\\'' + escapeHtml(s.subjectHash) + '\\')">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function updateSubjectsWorkerFilter() {
      const select = document.getElementById('subjects-worker-filter');
      const currentValue = select.value;
      
      // Get unique worker names from current data
      const workerNames = new Set();
      subjectsData.forEach(s => {
        (s.workerStats || []).forEach(ws => workerNames.add(ws.workerName));
      });
      
      // Also use global workers list if available
      if (workers && workers.length > 0) {
        workers.forEach(w => workerNames.add(w.name));
      }
      
      // Build options
      let options = '<option value="">全部实例</option>';
      Array.from(workerNames).sort().forEach(name => {
        const selected = name === currentValue ? ' selected' : '';
        options += '<option value="' + escapeHtml(name) + '"' + selected + '>' + escapeHtml(name) + '</option>';
      });
      
      select.innerHTML = options;
    }

    async function updateSubjectsMerchantFilter() {
      const select = document.getElementById('subjects-merchant-filter');
      if (!select) return;
      
      const currentValue = select.value;
      
      try {
        // Fetch merchant domains from API
        const res = await fetch('/api/subjects/merchant-domains', { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to fetch merchant domains');
        const data = await res.json();
        const domains = data.domains || [];
        
        // Build options
        let options = '<option value="">全部商户</option>';
        domains.forEach(domain => {
          const selected = domain === currentValue ? ' selected' : '';
          options += '<option value="' + escapeHtml(domain) + '"' + selected + '>' + escapeHtml(domain) + '</option>';
        });
        
        select.innerHTML = options;
      } catch (e) {
        console.error('Error loading merchant domains:', e);
      }
    }

    function updateSubjectsPagination() {
      const totalPages = Math.ceil(subjectsTotalCount / subjectsPageSize) || 1;
      document.getElementById('subjects-page-info').textContent = '第 ' + subjectsPage + ' / ' + totalPages + ' 页 (共 ' + subjectsTotalCount + ' 条)';
      document.getElementById('subjects-prev-btn').disabled = subjectsPage <= 1;
      document.getElementById('subjects-next-btn').disabled = subjectsPage >= totalPages;
    }

    function prevSubjectsPage() {
      if (subjectsPage > 1) {
        subjectsPage--;
        loadSubjects();
      }
    }

    function nextSubjectsPage() {
      const totalPages = Math.ceil(subjectsTotalCount / subjectsPageSize) || 1;
      if (subjectsPage < totalPages) {
        subjectsPage++;
        loadSubjects();
      }
    }

    function changeSubjectsPageSize() {
      const select = document.getElementById('subjects-page-size');
      subjectsPageSize = parseInt(select.value, 10);
      subjectsPage = 1; // Reset to first page when changing page size
      loadSubjects();
    }

    function toggleSubjectSelection(subjectHash, checked) {
      if (checked) {
        selectedSubjectIds.add(subjectHash);
      } else {
        selectedSubjectIds.delete(subjectHash);
      }
      updateSubjectsBatchActions();
    }

    function toggleSelectAllSubjects(checked) {
      if (checked) {
        subjectsData.forEach(s => selectedSubjectIds.add(s.subjectHash));
      } else {
        selectedSubjectIds.clear();
      }
      renderSubjects();
      updateSubjectsBatchActions();
    }

    function updateSubjectsBatchActions() {
      const batchActions = document.getElementById('subjects-batch-actions');
      const selectedCount = document.getElementById('subjects-selected-count');
      
      if (selectedSubjectIds.size > 0) {
        batchActions.style.display = 'block';
        selectedCount.textContent = '已选择 ' + selectedSubjectIds.size + ' 项';
      } else {
        batchActions.style.display = 'none';
      }
    }

    async function toggleSubjectFocus(subjectHash, focused) {
      if (!apiToken) return;
      try {
        // Find the subject to get its ID
        const subject = subjectsData.find(s => s.subjectHash === subjectHash);
        if (!subject || !subject.workerStats || subject.workerStats.length === 0) {
          showAlert('无法找到主题记录', 'error');
          return;
        }
        
        // We need to get the actual ID from the first worker stat
        // The API uses the record ID, not the hash
        const res = await fetch('/api/subjects?limit=1000', { headers: getHeaders() });
        const data = await res.json();
        const fullSubject = (data.items || []).find(s => s.subjectHash === subjectHash);
        
        if (!fullSubject) {
          showAlert('无法找到主题记录', 'error');
          return;
        }
        
        // Use the subjectHash as the ID for the focus endpoint
        const focusRes = await fetch('/api/subjects/' + encodeURIComponent(subjectHash) + '/focus', {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ focused })
        });
        
        if (focusRes.ok) {
          showAlert(focused ? '已添加关注' : '已取消关注');
          loadSubjects();
        } else {
          const errData = await focusRes.json();
          showAlert(errData.error || '操作失败', 'error');
        }
      } catch (e) {
        console.error('Error toggling focus:', e);
        showAlert('操作失败', 'error');
      }
    }

    async function toggleSubjectIgnore(subjectHash, ignored) {
      if (!apiToken) return;
      try {
        // Use the subjectHash as the ID for the ignore endpoint
        const ignoreRes = await fetch('/api/subjects/' + encodeURIComponent(subjectHash) + '/ignore', {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ignored })
        });
        
        if (ignoreRes.ok) {
          showAlert(ignored ? '已忽略' : '已取消忽略');
          loadSubjects();
        } else {
          const errData = await ignoreRes.json();
          showAlert(errData.error || '操作失败', 'error');
        }
      } catch (e) {
        console.error('Error toggling ignore:', e);
        showAlert('操作失败', 'error');
      }
    }

    function addSubjectToRuleFromButton(button) {
      const subject = button.getAttribute('data-subject');
      const merchantDomain = button.getAttribute('data-domain');
      addSubjectToRule(subject, merchantDomain);
    }

    function addSubjectToRule(subject, merchantDomain) {
      // Extract base domain for tag
      const baseDomain = extractBaseDomainFromFull(merchantDomain);
      
      // Open add rule modal
      showModal('add-rule-modal');
      
      // Pre-fill form fields
      document.getElementById('rule-match-type').value = 'subject';
      document.getElementById('rule-match-mode').value = 'exact';
      document.getElementById('rule-pattern').value = subject;
      document.getElementById('rule-tags').value = baseDomain;
      document.getElementById('rule-category').value = 'blacklist';
    }

    // Helper function to extract base domain (same logic as backend)
    function extractBaseDomainFromFull(domain) {
      if (!domain || typeof domain !== 'string') {
        return '';
      }
      
      const trimmed = domain.trim().toLowerCase();
      if (!trimmed) {
        return '';
      }
      
      const parts = trimmed.split('.');
      if (parts.length < 2) {
        return trimmed;
      }
      
      // Handle special cases for known TLDs with 2 parts
      const twoPartTLDs = ['co.uk', 'com.br', 'com.au', 'co.jp', 'co.kr', 'com.mx', 'com.ar'];
      const lastTwoParts = parts.slice(-2).join('.');
      
      if (twoPartTLDs.includes(lastTwoParts)) {
        return parts.slice(-3).join('.');
      }
      
      return parts.slice(-2).join('.');
    }

    async function deleteSubject(subjectHash) {
      if (!confirm('确定要删除这个主题的统计记录吗？')) return;
      if (!apiToken) return;
      
      try {
        const res = await fetch('/api/subjects/' + encodeURIComponent(subjectHash), {
          method: 'DELETE',
          headers: getHeaders()
        });
        
        if (res.ok) {
          showAlert('删除成功');
          selectedSubjectIds.delete(subjectHash);
          loadSubjects();
        } else {
          const errData = await res.json();
          showAlert(errData.error || '删除失败', 'error');
        }
      } catch (e) {
        console.error('Error deleting subject:', e);
        showAlert('删除失败', 'error');
      }
    }

    async function batchDeleteSubjects() {
      if (selectedSubjectIds.size === 0) return;
      if (!confirm('确定要删除选中的 ' + selectedSubjectIds.size + ' 个主题统计记录吗？')) return;
      if (!apiToken) return;
      
      try {
        const res = await fetch('/api/subjects/batch-delete', {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: Array.from(selectedSubjectIds) })
        });
        
        if (res.ok) {
          const data = await res.json();
          showAlert('成功删除 ' + data.deletedCount + ' 条记录');
          selectedSubjectIds.clear();
          loadSubjects();
        } else {
          const errData = await res.json();
          showAlert(errData.error || '批量删除失败', 'error');
        }
      } catch (e) {
        console.error('Error batch deleting subjects:', e);
        showAlert('批量删除失败', 'error');
      }
    }

    // ============================================
    // End Subjects Tab Functions
    // ============================================

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
        
        const checkbox = '<input type="checkbox" class="alert-checkbox" data-id="' + a.id + '" data-source="' + a.source + '" onchange="updateAlertBatchDeleteBtn()">';
        const deleteBtn = '<button class="btn btn-sm btn-danger" onclick="deleteAlert(\\'' + a.id + '\\', \\'' + a.source + '\\')">删除</button>';
        
        return '<tr>' +
          '<td>' + checkbox + '</td>' +
          '<td style="white-space:nowrap;font-size:12px;">' + time + '</td>' +
          '<td class="hide-mobile">' + typeIcon + ' ' + typeText + '</td>' +
          '<td title="' + escapeHtml(a.rule?.name || a.message || a.ruleId || a.monitorId) + '">' + nameCol + '</td>' +
          '<td style="white-space:nowrap;font-size:11px;">' + a.previousState + ' → ' + a.currentState + '</td>' +
          '<td style="white-space:nowrap;">' + infoCol + '</td>' +
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
      updateAlertBatchDeleteBtn();
    }
    
    function updateAlertBatchDeleteBtn() {
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

    // ============================================
    // User Settings Functions
    // ============================================
    
    // Cached user settings from server
    let userSettings = {};
    
    /**
     * Load user settings from server
     * Requirements: 8.2 - Load settings from server on login
     */
    async function loadUserSettings() {
      if (!apiToken) return;
      
      try {
        const res = await fetch('/api/user/settings', { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            userSettings = data.settings || {};
            applyUserSettings();
            updateSettingsSyncStatus('设置已从服务器加载');
            console.log('[Settings] Loaded from server:', userSettings);
          }
        }
      } catch (e) {
        console.error('[Settings] Failed to load settings from server:', e);
        updateSettingsSyncStatus('设置加载失败，使用本地缓存', true);
      }
    }
    
    /**
     * Save a single user setting to server
     * Requirements: 8.1 - Save settings to server immediately on change
     */
    async function saveUserSetting(key, value) {
      // Update local cache
      userSettings[key] = value;
      
      // Check if using legacy auth
      const authType = localStorage.getItem('authType');
      if (authType === 'legacy') {
        updateSettingsSyncStatus('旧版认证不支持设置同步', true);
        return;
      }
      
      if (!apiToken) {
        updateSettingsSyncStatus('未登录，设置未保存', true);
        return;
      }
      
      try {
        updateSettingsSyncStatus('正在保存...');
        const res = await fetch('/api/user/settings', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ [key]: value })
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            userSettings = data.settings || userSettings;
            updateSettingsSyncStatus('设置已保存');
            console.log('[Settings] Saved to server:', key, '=', value);
          } else {
            updateSettingsSyncStatus('保存失败: ' + (data.error || '未知错误'), true);
          }
        } else {
          const data = await res.json().catch(() => ({}));
          updateSettingsSyncStatus('保存失败: ' + (data.error || '服务器错误'), true);
        }
      } catch (e) {
        console.error('[Settings] Failed to save setting:', e);
        updateSettingsSyncStatus('保存失败，请检查网络连接', true);
      }
    }
    
    /**
     * Apply loaded user settings to UI
     * Requirements: 8.3 - Apply settings to UI when loaded
     */
    function applyUserSettings() {
      // Apply default worker setting
      if (userSettings.defaultWorker) {
        const workerSelect = document.getElementById('setting-default-worker');
        if (workerSelect) {
          workerSelect.value = userSettings.defaultWorker;
        }
      }
      
      // Apply logs auto-refresh setting (only if not already set in localStorage)
      if (userSettings.logsAutoRefresh !== undefined) {
        const logsSelect = document.getElementById('setting-logs-auto-refresh');
        if (logsSelect) {
          logsSelect.value = userSettings.logsAutoRefresh ? 'true' : 'false';
        }
        // Check if localStorage has a setting for this - localStorage takes priority
        const localSettings = JSON.parse(localStorage.getItem('autoRefreshSettings') || '{}');
        if (!localSettings.logs) {
          // No local setting, apply server setting
          const logsCheckbox = document.getElementById('logs-auto-refresh');
          if (logsCheckbox) {
            logsCheckbox.checked = userSettings.logsAutoRefresh;
            if (userSettings.logsAutoRefresh) {
              const interval = parseInt(document.getElementById('logs-refresh-interval')?.value || '60', 10) * 1000;
              startAutoRefresh('logs', interval);
            } else {
              stopAutoRefresh('logs');
            }
          }
        }
      }
      
      // Apply stats auto-refresh setting (only if not already set in localStorage)
      if (userSettings.statsAutoRefresh !== undefined) {
        const statsSelect = document.getElementById('setting-stats-auto-refresh');
        if (statsSelect) {
          statsSelect.value = userSettings.statsAutoRefresh ? 'true' : 'false';
        }
        // Check if localStorage has a setting for this - localStorage takes priority
        const localSettings = JSON.parse(localStorage.getItem('autoRefreshSettings') || '{}');
        if (!localSettings.stats) {
          // No local setting, apply server setting
          const statsCheckbox = document.getElementById('stats-auto-refresh');
          if (statsCheckbox) {
            statsCheckbox.checked = userSettings.statsAutoRefresh;
            if (userSettings.statsAutoRefresh) {
              const interval = parseInt(document.getElementById('stats-refresh-interval')?.value || '60', 10) * 1000;
              startAutoRefresh('stats', interval);
            } else {
              stopAutoRefresh('stats');
            }
          }
        }
      }
    }
    
    /**
     * Update settings sync status message
     */
    function updateSettingsSyncStatus(message, isError = false) {
      const statusEl = document.getElementById('settings-sync-status');
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = isError ? '#e74c3c' : '#27ae60';
        // Clear message after 3 seconds
        setTimeout(() => {
          if (statusEl.textContent === message) {
            statusEl.textContent = '';
          }
        }, 3000);
      }
    }
    
    /**
     * Update settings tab with account info
     */
    function updateSettingsTab() {
      const authType = localStorage.getItem('authType');
      
      // Update account info
      if (currentUser) {
        document.getElementById('settings-username').textContent = currentUser.username;
        document.getElementById('settings-role').textContent = currentUser.role === 'admin' ? '管理员' : '用户';
        document.getElementById('settings-auth-type').textContent = authType === 'jwt' ? 'JWT 认证' : 'API Token (旧版)';
      }
      
      // Show/hide legacy auth warning
      const legacyWarning = document.getElementById('legacy-auth-warning');
      if (legacyWarning) {
        legacyWarning.style.display = authType === 'legacy' ? 'block' : 'none';
      }
      
      // Show/hide user settings card (only for JWT auth)
      const userSettingsCard = document.getElementById('user-settings-card');
      if (userSettingsCard) {
        userSettingsCard.style.display = authType === 'jwt' ? 'block' : 'none';
      }
      
      // Show/hide legacy settings card
      const legacySettingsCard = document.getElementById('legacy-settings-card');
      if (legacySettingsCard) {
        legacySettingsCard.style.display = authType === 'legacy' ? 'block' : 'none';
      }
      
      // Populate default worker dropdown
      populateDefaultWorkerDropdown();
    }
    
    /**
     * Populate the default worker dropdown in settings
     */
    function populateDefaultWorkerDropdown() {
      const select = document.getElementById('setting-default-worker');
      if (!select) return;
      
      // Keep the first option (不指定)
      select.innerHTML = '<option value="">不指定</option>';
      
      // Add worker options
      workers.forEach(w => {
        const option = document.createElement('option');
        option.value = w.name;
        option.textContent = w.name;
        if (userSettings.defaultWorker === w.name) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }

    // ============================================
    // Settings Migration Functions
    // ============================================
    
    // Keys to check for migration (old localStorage settings)
    const MIGRATION_KEYS = ['autoRefreshSettings'];
    // Key to track if migration has been offered
    const MIGRATION_OFFERED_KEY = 'settingsMigrationOffered';
    // Detected old settings for migration
    let detectedOldSettings = {};
    
    /**
     * Check if there are old localStorage settings to migrate
     * Requirements: 8.2, 8.3 - Detect and migrate old settings on first login
     */
    function checkForSettingsMigration() {
      // Only check for JWT auth (not legacy)
      const authType = localStorage.getItem('authType');
      if (authType !== 'jwt') {
        console.log('[Migration] Skipping migration check for non-JWT auth');
        return;
      }
      
      // Check if migration has already been offered to this user
      const migrationOfferedFor = localStorage.getItem(MIGRATION_OFFERED_KEY);
      if (migrationOfferedFor === currentUser?.id) {
        console.log('[Migration] Migration already offered for this user');
        return;
      }
      
      // Detect old settings
      detectedOldSettings = {};
      let hasOldSettings = false;
      
      MIGRATION_KEYS.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            detectedOldSettings[key] = JSON.parse(value);
            hasOldSettings = true;
          } catch (e) {
            // If not valid JSON, store as string
            detectedOldSettings[key] = value;
            hasOldSettings = true;
          }
        }
      });
      
      if (!hasOldSettings) {
        console.log('[Migration] No old settings found');
        // Mark as offered so we don't check again
        if (currentUser?.id) {
          localStorage.setItem(MIGRATION_OFFERED_KEY, currentUser.id);
        }
        return;
      }
      
      console.log('[Migration] Detected old settings:', detectedOldSettings);
      showMigrationModal();
    }
    
    /**
     * Show the migration modal with detected settings
     */
    function showMigrationModal() {
      // Reset modal phases
      document.getElementById('migration-detect-phase').style.display = 'block';
      document.getElementById('migration-progress-phase').style.display = 'none';
      document.getElementById('migration-success-phase').style.display = 'none';
      document.getElementById('migration-error-phase').style.display = 'none';
      
      // Populate settings list
      const listEl = document.getElementById('migration-settings-list');
      listEl.innerHTML = '';
      
      Object.keys(detectedOldSettings).forEach(key => {
        const li = document.createElement('li');
        const value = detectedOldSettings[key];
        
        if (key === 'autoRefreshSettings') {
          li.textContent = '自动刷新设置';
          if (typeof value === 'object') {
            const details = Object.keys(value).map(type => {
              const setting = value[type];
              return type + ': ' + (setting.enabled ? '开启' : '关闭');
            }).join(', ');
            if (details) {
              li.textContent += ' (' + details + ')';
            }
          }
        } else {
          li.textContent = key;
        }
        
        listEl.appendChild(li);
      });
      
      showModal('settings-migration-modal');
    }
    
    /**
     * Skip migration and mark as offered
     */
    function skipMigration() {
      if (currentUser?.id) {
        localStorage.setItem(MIGRATION_OFFERED_KEY, currentUser.id);
      }
      hideModal('settings-migration-modal');
      showAlert('已跳过设置迁移');
    }
    
    /**
     * Start the migration process
     */
    async function startMigration() {
      // Show progress phase
      document.getElementById('migration-detect-phase').style.display = 'none';
      document.getElementById('migration-progress-phase').style.display = 'block';
      
      const progressBar = document.getElementById('migration-progress-bar');
      const statusEl = document.getElementById('migration-status');
      
      try {
        progressBar.style.width = '20%';
        statusEl.textContent = '正在准备设置数据...';
        
        // Convert old settings to server format
        const settingsToUpload = {};
        
        if (detectedOldSettings.autoRefreshSettings) {
          const autoRefresh = detectedOldSettings.autoRefreshSettings;
          // Convert to server format
          if (autoRefresh.logs) {
            settingsToUpload.logsAutoRefresh = autoRefresh.logs.enabled || false;
            settingsToUpload.logsRefreshInterval = autoRefresh.logs.interval || '60';
          }
          if (autoRefresh.stats) {
            settingsToUpload.statsAutoRefresh = autoRefresh.stats.enabled || false;
            settingsToUpload.statsRefreshInterval = autoRefresh.stats.interval || '60';
          }
        }
        
        progressBar.style.width = '50%';
        statusEl.textContent = '正在上传设置到服务器...';
        
        // Upload settings to server
        const res = await fetch('/api/user/settings', {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(settingsToUpload)
        });
        
        progressBar.style.width = '80%';
        
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '服务器错误');
        }
        
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || '保存失败');
        }
        
        // Update local cache
        userSettings = data.settings || settingsToUpload;
        
        progressBar.style.width = '100%';
        statusEl.textContent = '迁移完成！';
        
        // Mark migration as offered
        if (currentUser?.id) {
          localStorage.setItem(MIGRATION_OFFERED_KEY, currentUser.id);
        }
        
        // Show success phase after a short delay
        setTimeout(() => {
          document.getElementById('migration-progress-phase').style.display = 'none';
          document.getElementById('migration-success-phase').style.display = 'block';
        }, 500);
        
      } catch (e) {
        console.error('[Migration] Failed:', e);
        document.getElementById('migration-progress-phase').style.display = 'none';
        document.getElementById('migration-error-phase').style.display = 'block';
        document.getElementById('migration-error-message').textContent = e.message || '发生错误，请稍后重试。';
      }
    }
    
    /**
     * Finish migration - optionally clear local settings
     */
    function finishMigration(clearLocal) {
      if (clearLocal) {
        // Clear old localStorage settings
        MIGRATION_KEYS.forEach(key => {
          localStorage.removeItem(key);
        });
        console.log('[Migration] Cleared local settings');
        showAlert('本地设置已清除，设置现在由服务器管理', 'success');
      } else {
        showAlert('设置已迁移到服务器，本地设置已保留', 'success');
      }
      
      hideModal('settings-migration-modal');
      
      // Reload settings from server to ensure UI is in sync
      loadUserSettings();
    }
    
    /**
     * Retry migration after error
     */
    function retryMigration() {
      document.getElementById('migration-error-phase').style.display = 'none';
      startMigration();
    }

    // ============================================
    // Authentication Functions
    // ============================================
    
    // Current user info
    let currentUser = null;
    
    /**
     * Show legacy API token login section
     */
    function showLegacyLogin() {
      document.getElementById('legacy-login-section').style.display = 'block';
    }
    
    /**
     * Login with API token (legacy mode)
     */
    async function loginWithApiToken() {
      const token = document.getElementById('login-api-token').value.trim();
      if (!token) {
        showLoginError('请输入 API Token');
        return;
      }
      
      // Store token and verify it works
      apiToken = token;
      localStorage.setItem('apiToken', token);
      localStorage.setItem('authType', 'legacy');
      
      try {
        // Verify token by calling /api/auth/me
        const res = await fetch('/api/auth/me', { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          currentUser = data.user;
          showMainApp();
        } else {
          showLoginError('API Token 无效');
          apiToken = '';
          localStorage.removeItem('apiToken');
          localStorage.removeItem('authType');
        }
      } catch (e) {
        showLoginError('验证失败，请检查网络连接');
        apiToken = '';
        localStorage.removeItem('apiToken');
        localStorage.removeItem('authType');
      }
    }
    
    /**
     * Login with username and password
     */
    async function handleLogin(e) {
      e.preventDefault();
      
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      
      if (!username || !password) {
        showLoginError('请输入用户名和密码');
        return;
      }
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
          // Store JWT token
          apiToken = data.token;
          currentUser = data.user;
          localStorage.setItem('apiToken', data.token);
          localStorage.setItem('authType', 'jwt');
          
          showMainApp();
          
          // Check for settings migration after login (Requirements: 8.2, 8.3)
          // Use setTimeout to allow the main app to render first
          setTimeout(() => {
            checkForSettingsMigration();
          }, 500);
        } else {
          showLoginError(data.error || '登录失败，请检查用户名和密码');
        }
      } catch (e) {
        showLoginError('登录失败，请检查网络连接');
      }
    }
    
    /**
     * Logout current user
     */
    async function logout() {
      try {
        // Call logout API to invalidate token
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: getHeaders()
        });
      } catch (e) {
        // Ignore errors, still clear local state
      }
      
      // Clear local state
      apiToken = '';
      currentUser = null;
      localStorage.removeItem('apiToken');
      localStorage.removeItem('authType');
      
      // Show login page
      showLoginPage();
    }
    
    /**
     * Show login error message
     */
    function showLoginError(message) {
      const errorEl = document.getElementById('login-error');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      setTimeout(() => {
        errorEl.style.display = 'none';
      }, 5000);
    }
    
    /**
     * Show login page, hide main app
     */
    function showLoginPage() {
      document.getElementById('login-page').classList.remove('hidden');
      document.getElementById('main-app').classList.add('hidden');
      
      // Reset login form
      document.getElementById('login-form').reset();
      document.getElementById('login-error').style.display = 'none';
      document.getElementById('legacy-login-section').style.display = 'none';
    }
    
    /**
     * Show main app, hide login page
     */
    function showMainApp() {
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('main-app').classList.remove('hidden');
      
      // Update user info in header
      if (currentUser) {
        document.getElementById('current-username').textContent = currentUser.username;
        document.getElementById('current-role').textContent = currentUser.role === 'admin' ? '管理员' : '用户';
        
        // Show admin-only tabs for admin users
        if (currentUser.role === 'admin') {
          document.getElementById('users-tab-btn').classList.remove('hidden');
        } else {
          document.getElementById('users-tab-btn').classList.add('hidden');
        }
      }
      
      // Load initial data
      loadWorkers();
      
      // Load user settings from server (Requirements: 8.2)
      loadUserSettings();
      
      // Update settings tab with account info
      updateSettingsTab();
    }
    
    /**
     * Check authentication status on page load
     */
    async function checkAuth() {
      if (!apiToken) {
        showLoginPage();
        return;
      }
      
      try {
        const res = await fetch('/api/auth/me', { headers: getHeaders() });
        if (res.ok) {
          const data = await res.json();
          currentUser = data.user;
          showMainApp();
        } else {
          // Token invalid, show login page
          apiToken = '';
          localStorage.removeItem('apiToken');
          localStorage.removeItem('authType');
          showLoginPage();
        }
      } catch (e) {
        // Network error, try to show main app if we have a token
        // This allows offline usage with cached data
        showLoginPage();
      }
    }
    
    // Attach login form submit handler
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // ============================================
    // Backup Management Functions
    // ============================================
    
    function formatBackupSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function showBackupAlert(msg, type = 'success') {
      const container = document.getElementById('backup-alert-container');
      if (!container) return;
      container.innerHTML = '<div class="alert alert-' + type + '">' + msg + '</div>';
      setTimeout(() => container.innerHTML = '', 3000);
    }

    async function loadBackups() {
      try {
        const res = await fetch('/api/admin/backup/list', {
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        const data = await res.json();
        if (data.success) {
          renderBackups(data.backups || []);
          const countEl = document.getElementById('backup-count');
          const sizeEl = document.getElementById('backup-total-size');
          if (countEl) countEl.textContent = data.totalCount || 0;
          if (sizeEl) sizeEl.textContent = formatBackupSize(data.totalSize || 0);
        } else {
          showBackupAlert(data.error || '加载备份列表失败', 'error');
        }
      } catch (e) {
        console.error('Failed to load backups:', e);
        showBackupAlert('加载备份列表失败', 'error');
      }
    }

    function renderBackups(backups) {
      const tbody = document.getElementById('backups-table');
      if (!tbody) return;
      if (backups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无备份</td></tr>';
        return;
      }
      tbody.innerHTML = backups.map(b => {
        const date = new Date(b.createdAt).toLocaleString('zh-CN');
        const typeLabel = b.isPreRestore ? '<span class="status status-inactive">恢复前</span>' : '<span class="status status-active">手动</span>';
        return '<tr>' +
          '<td>' + escapeHtml(b.filename) + '</td>' +
          '<td>' + formatBackupSize(b.size) + '</td>' +
          '<td>' + date + '</td>' +
          '<td>' + typeLabel + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-primary btn-sm" onclick="downloadBackup(\\'' + escapeHtml(b.filename) + '\\')">下载</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteBackup(\\'' + escapeHtml(b.filename) + '\\')">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    async function createBackup() {
      const btn = document.getElementById('create-backup-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '创建中...';
      }
      try {
        const res = await fetch('/api/admin/backup/create', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        const data = await res.json();
        if (data.success) {
          showBackupAlert('备份创建成功: ' + data.backup.filename);
          loadBackups();
        } else {
          showBackupAlert(data.error || '创建备份失败', 'error');
        }
      } catch (e) {
        console.error('Failed to create backup:', e);
        showBackupAlert('创建备份失败', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '+ 创建备份';
        }
      }
    }

    function downloadBackup(filename) {
      window.location.href = '/api/admin/backup/download/' + encodeURIComponent(filename) + '?token=' + encodeURIComponent(apiToken);
    }

    async function deleteBackup(filename) {
      if (!confirm('确定要删除备份 ' + filename + ' 吗？')) return;
      try {
        const res = await fetch('/api/admin/backup/' + encodeURIComponent(filename), {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + apiToken }
        });
        const data = await res.json();
        if (data.success) {
          showBackupAlert('备份删除成功');
          loadBackups();
        } else {
          showBackupAlert(data.error || '删除备份失败', 'error');
        }
      } catch (e) {
        console.error('Failed to delete backup:', e);
        showBackupAlert('删除备份失败', 'error');
      }
    }

    async function restoreBackup(event) {
      event.preventDefault();
      const fileInput = document.getElementById('restore-file');
      const file = fileInput.files[0];
      if (!file) {
        showBackupAlert('请选择备份文件', 'error');
        return;
      }
      if (!confirm('确定要恢复数据库吗？当前数据将被覆盖！')) return;
      
      const btn = document.getElementById('restore-btn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '恢复中...';
      }
      
      try {
        const buffer = await file.arrayBuffer();
        const res = await fetch('/api/admin/backup/restore', {
          method: 'POST',
          headers: { 
            'Authorization': 'Bearer ' + apiToken,
            'Content-Type': 'application/octet-stream'
          },
          body: buffer
        });
        const data = await res.json();
        if (data.success) {
          hideModal('restore-modal');
          fileInput.value = '';
          showBackupAlert('数据库恢复成功！恢复前备份: ' + data.preRestoreBackup);
          loadBackups();
        } else {
          showBackupAlert(data.error || '恢复失败', 'error');
        }
      } catch (e) {
        console.error('Failed to restore backup:', e);
        showBackupAlert('恢复失败', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '确认恢复';
        }
      }
    }
    
    // ============================================
    // Initialization
    // ============================================
    
    // Check authentication on page load
    checkAuth();
    
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
