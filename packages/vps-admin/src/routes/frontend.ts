/**
 * Frontend Routes
 * Serves the admin panel HTML interface
 */

import type { FastifyInstance } from 'fastify';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Filter Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; min-height: 100vh; }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #1a1a2e; color: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; }
    .header h1 { font-size: 24px; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card h2 { font-size: 18px; margin-bottom: 15px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .btn-primary { background: #4a90d9; color: white; }
    .btn-danger { background: #e74c3c; color: white; }
    .btn-success { background: #27ae60; color: white; }
    .btn:hover { opacity: 0.9; }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; font-weight: 500; color: #555; }
    .form-group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    .form-group input:focus { outline: none; border-color: #4a90d9; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8f9fa; font-weight: 600; color: #555; }
    .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
    .status-active { background: #d4edda; color: #155724; }
    .status-inactive { background: #f8d7da; color: #721c24; }
    .login-container { max-width: 400px; margin: 100px auto; }
    .hidden { display: none; }
    .actions { display: flex; gap: 8px; }
    .modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
    .modal-content { background: white; padding: 20px; border-radius: 8px; width: 90%; max-width: 500px; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; }
    .alert { padding: 12px; border-radius: 4px; margin-bottom: 15px; }
    .alert-success { background: #d4edda; color: #155724; }
    .alert-error { background: #f8d7da; color: #721c24; }
    .stats-row { display: flex; gap: 20px; margin-bottom: 15px; }
    .stat-item { background: #f8f9fa; padding: 15px; border-radius: 8px; flex: 1; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #333; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
    .btn-warning { background: #f39c12; color: white; }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .file-input-wrapper { position: relative; overflow: hidden; display: inline-block; }
    .file-input-wrapper input[type=file] { position: absolute; left: 0; top: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
    .warning-text { color: #e74c3c; font-size: 14px; margin: 10px 0; }
  </style>
</head>
<body>
  <div id="login-page" class="login-container">
    <div class="card">
      <h2>管理员登录</h2>
      <div id="login-error" class="alert alert-error hidden"></div>
      <form id="login-form">
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="password" required placeholder="输入管理密码">
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">登录</button>
      </form>
    </div>
  </div>

  <div id="admin-page" class="hidden">
    <div class="container">
      <div class="header">
        <h1>📧 Email Filter 管理面板</h1>
      </div>

      <div class="card">
        <h2>Worker 实例管理</h2>
        <div id="alert-container"></div>
        <button class="btn btn-primary" onclick="showAddWorkerModal()" style="margin-bottom:15px">+ 添加 Worker</button>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>转发地址</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="workers-table"></tbody>
        </table>
      </div>

      <div class="card">
        <h2>💾 数据库备份管理</h2>
        <div id="backup-alert-container"></div>
        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-value" id="backup-count">0</div>
            <div class="stat-label">备份数量</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="backup-total-size">0 B</div>
            <div class="stat-label">总大小</div>
          </div>
        </div>
        <div style="margin-bottom:15px; display:flex; gap:10px;">
          <button class="btn btn-success" onclick="createBackup()" id="create-backup-btn">+ 创建备份</button>
          <button class="btn btn-warning" onclick="showRestoreModal()">📥 恢复数据库</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>文件名</th>
              <th>大小</th>
              <th>创建时间</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="backups-table"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="add-worker-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>添加 Worker 实例</h3>
        <button class="modal-close" onclick="hideModal('add-worker-modal')">&times;</button>
      </div>
      <form id="add-worker-form">
        <div class="form-group">
          <label>Worker 名称 *</label>
          <input type="text" id="worker-name" required placeholder="唯一标识，如 domain1-worker">
        </div>
        <div class="form-group">
          <label>默认转发地址 *</label>
          <input type="email" id="worker-forward" required placeholder="admin@gmail.com">
        </div>
        <div class="form-group">
          <label>域名（可选）</label>
          <input type="text" id="worker-domain" placeholder="example.com">
        </div>
        <button type="submit" class="btn btn-success">创建</button>
      </form>
    </div>
  </div>

  <div id="restore-modal" class="modal hidden">
    <div class="modal-content">
      <div class="modal-header">
        <h3>📥 恢复数据库</h3>
        <button class="modal-close" onclick="hideModal('restore-modal')">&times;</button>
      </div>
      <div class="warning-text">⚠️ 警告：恢复操作将覆盖当前数据库，此操作不可逆！系统会自动创建恢复前备份。</div>
      <form id="restore-form">
        <div class="form-group">
          <label>选择备份文件 (.db.gz)</label>
          <input type="file" id="restore-file" accept=".gz" required>
        </div>
        <button type="submit" class="btn btn-danger" id="restore-btn">确认恢复</button>
      </form>
    </div>
  </div>

  <script>
    const API_BASE = '/api';
    let isLoggedIn = false;

    // Check auth status on load
    async function checkAuth() {
      try {
        const res = await fetch(API_BASE + '/auth/status', { credentials: 'include' });
        const data = await res.json();
        if (data.authenticated) {
          showAdminPage();
          loadWorkers();
          loadBackups();
        }
      } catch (e) {}
    }

    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      try {
        const res = await fetch(API_BASE + '/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
          credentials: 'include'
        });
        if (res.ok) {
          showAdminPage();
          loadWorkers();
          loadBackups();
        } else {
          showError('login-error', '密码错误');
        }
      } catch (e) {
        showError('login-error', '登录失败');
      }
    });

    function showAdminPage() {
      document.getElementById('login-page').classList.add('hidden');
      document.getElementById('admin-page').classList.remove('hidden');
      isLoggedIn = true;
    }

    function showError(id, msg) {
      const el = document.getElementById(id);
      el.textContent = msg;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 3000);
    }

    function showAlert(msg, type = 'success') {
      const container = document.getElementById('alert-container');
      container.innerHTML = '<div class="alert alert-' + type + '">' + msg + '</div>';
      setTimeout(() => container.innerHTML = '', 3000);
    }

    // Load workers
    async function loadWorkers() {
      try {
        const res = await fetch(API_BASE + '/instances', { credentials: 'include' });
        const data = await res.json();
        renderWorkers(data.instances || []);
      } catch (e) {
        showAlert('加载失败', 'error');
      }
    }

    function renderWorkers(workers) {
      const tbody = document.getElementById('workers-table');
      if (workers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无 Worker 实例</td></tr>';
        return;
      }
      tbody.innerHTML = workers.map(w => {
        const status = w.status === 'active' ? 
          '<span class="status status-active">启用</span>' : 
          '<span class="status status-inactive">禁用</span>';
        const date = new Date(w.createdAt).toLocaleDateString('zh-CN');
        return '<tr>' +
          '<td><strong>' + escapeHtml(w.name) + '</strong></td>' +
          '<td>' + escapeHtml(w.apiUrl || w.defaultForwardTo || '-') + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + date + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-primary" onclick="toggleWorker(\\'' + w.id + '\\')">' + (w.status === 'active' ? '禁用' : '启用') + '</button>' +
            '<button class="btn btn-danger" onclick="deleteWorker(\\'' + w.id + '\\')">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Add worker
    function showAddWorkerModal() {
      document.getElementById('add-worker-modal').classList.remove('hidden');
    }

    function hideModal(id) {
      document.getElementById(id).classList.add('hidden');
    }

    document.getElementById('add-worker-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('worker-name').value;
      const apiUrl = document.getElementById('worker-forward').value;
      const apiKey = document.getElementById('worker-domain').value;
      
      try {
        const res = await fetch(API_BASE + '/instances', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, apiUrl, apiKey }),
          credentials: 'include'
        });
        if (res.ok) {
          hideModal('add-worker-modal');
          document.getElementById('add-worker-form').reset();
          showAlert('Worker 创建成功');
          loadWorkers();
        } else {
          const data = await res.json();
          showAlert(data.error || '创建失败', 'error');
        }
      } catch (e) {
        showAlert('创建失败', 'error');
      }
    });

    // Toggle worker
    async function toggleWorker(id) {
      try {
        const res = await fetch(API_BASE + '/instances/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'toggle' }),
          credentials: 'include'
        });
        if (res.ok) {
          loadWorkers();
        }
      } catch (e) {}
    }

    // Delete worker
    async function deleteWorker(id) {
      if (!confirm('确定要删除这个 Worker 吗？')) return;
      try {
        const res = await fetch(API_BASE + '/instances/' + id, {
          method: 'DELETE',
          credentials: 'include'
        });
        if (res.ok) {
          showAlert('删除成功');
          loadWorkers();
        }
      } catch (e) {
        showAlert('删除失败', 'error');
      }
    }

    // Format file size
    function formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Show backup alert
    function showBackupAlert(msg, type = 'success') {
      const container = document.getElementById('backup-alert-container');
      container.innerHTML = '<div class="alert alert-' + type + '">' + msg + '</div>';
      setTimeout(() => container.innerHTML = '', 3000);
    }

    // Load backups
    async function loadBackups() {
      try {
        const res = await fetch(API_BASE + '/backup/list', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
          renderBackups(data.backups || []);
          document.getElementById('backup-count').textContent = data.totalCount || 0;
          document.getElementById('backup-total-size').textContent = formatSize(data.totalSize || 0);
        } else {
          showBackupAlert(data.error || '加载备份列表失败', 'error');
        }
      } catch (e) {
        showBackupAlert('加载备份列表失败', 'error');
      }
    }

    function renderBackups(backups) {
      const tbody = document.getElementById('backups-table');
      if (backups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无备份</td></tr>';
        return;
      }
      tbody.innerHTML = backups.map(b => {
        const date = new Date(b.createdAt).toLocaleString('zh-CN');
        const typeLabel = b.isPreRestore ? '<span class="status status-inactive">恢复前</span>' : '<span class="status status-active">手动</span>';
        return '<tr>' +
          '<td>' + escapeHtml(b.filename) + '</td>' +
          '<td>' + formatSize(b.size) + '</td>' +
          '<td>' + date + '</td>' +
          '<td>' + typeLabel + '</td>' +
          '<td class="actions">' +
            '<button class="btn btn-primary btn-sm" onclick="downloadBackup(\\'' + escapeHtml(b.filename) + '\\')">下载</button>' +
            '<button class="btn btn-danger btn-sm" onclick="deleteBackup(\\'' + escapeHtml(b.filename) + '\\')">删除</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    // Create backup
    async function createBackup() {
      const btn = document.getElementById('create-backup-btn');
      btn.disabled = true;
      btn.textContent = '创建中...';
      try {
        const res = await fetch(API_BASE + '/backup/create', {
          method: 'POST',
          credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
          showBackupAlert('备份创建成功: ' + data.backup.filename);
          loadBackups();
        } else {
          showBackupAlert(data.error || '创建备份失败', 'error');
        }
      } catch (e) {
        showBackupAlert('创建备份失败', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '+ 创建备份';
      }
    }

    // Download backup
    function downloadBackup(filename) {
      window.location.href = API_BASE + '/backup/download/' + encodeURIComponent(filename);
    }

    // Delete backup
    async function deleteBackup(filename) {
      if (!confirm('确定要删除备份 ' + filename + ' 吗？')) return;
      try {
        const res = await fetch(API_BASE + '/backup/' + encodeURIComponent(filename), {
          method: 'DELETE',
          credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
          showBackupAlert('备份删除成功');
          loadBackups();
        } else {
          showBackupAlert(data.error || '删除备份失败', 'error');
        }
      } catch (e) {
        showBackupAlert('删除备份失败', 'error');
      }
    }

    // Show restore modal
    function showRestoreModal() {
      document.getElementById('restore-modal').classList.remove('hidden');
    }

    // Restore form submit
    document.getElementById('restore-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('restore-file');
      const file = fileInput.files[0];
      if (!file) {
        showBackupAlert('请选择备份文件', 'error');
        return;
      }
      if (!confirm('确定要恢复数据库吗？当前数据将被覆盖！')) return;
      
      const btn = document.getElementById('restore-btn');
      btn.disabled = true;
      btn.textContent = '恢复中...';
      
      try {
        const buffer = await file.arrayBuffer();
        const res = await fetch(API_BASE + '/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: buffer,
          credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
          hideModal('restore-modal');
          fileInput.value = '';
          showBackupAlert('数据库恢复成功！恢复前备份: ' + data.preRestoreBackup);
          loadBackups();
          loadWorkers();
        } else {
          showBackupAlert(data.error || '恢复失败', 'error');
        }
      } catch (e) {
        showBackupAlert('恢复失败', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '确认恢复';
      }
    });

    // Init
    checkAuth();
  </script>
</body>
</html>`;

export async function frontendRoutes(app: FastifyInstance): Promise<void> {
  // Serve admin panel
  app.get('/', async (request, reply) => {
    reply.type('text/html').send(HTML_TEMPLATE);
  });
}
