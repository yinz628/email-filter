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
