/**
 * Frontend Routes
 * Serves the admin panel React frontend
 * 
 * Requirements: 2.1, 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3, 3.4
 */

import { Hono } from 'hono';
import type { Bindings } from '../index.js';

const frontendRouter = new Hono<{ Bindings: Bindings }>();

// Serve the frontend HTML
frontendRouter.get('/', (c) => {
  return c.html(getHtmlContent());
});

// Serve frontend for all non-API routes (SPA support)
frontendRouter.get('/login', (c) => {
  return c.html(getHtmlContent());
});

frontendRouter.get('/instances', (c) => {
  return c.html(getHtmlContent());
});

frontendRouter.get('/stats', (c) => {
  return c.html(getHtmlContent());
});

function getHtmlContent(): string {
  return '<!DOCTYPE html>' +
    '<html lang="zh-CN">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>邮件过滤管理面板</title>' +
    '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></' + 'script>' +
    '<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></' + 'script>' +
    '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></' + 'script>' +
    '<style>' + getStyles() + '</style>' +
    '</head>' +
    '<body>' +
    '<div id="root"></div>' +
    '<script type="text/babel">' + getFullAppScript() + '</' + 'script>' +
    '</body>' +
    '</html>';
}


function getStyles(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
    .app { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { font-size: 24px; margin-bottom: 10px; }
    .nav { display: flex; gap: 10px; flex-wrap: wrap; }
    .nav-btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: all 0.2s; background: rgba(255,255,255,0.2); color: white; }
    .nav-btn:hover { background: rgba(255,255,255,0.3); }
    .nav-btn.active { background: white; color: #2c3e50; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px; }
    .card-title { font-size: 18px; font-weight: 600; }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .btn-primary { background: #3498db; color: white; }
    .btn-primary:hover { background: #2980b9; }
    .btn-secondary { background: #6c757d; color: white; }
    .btn-secondary:hover { background: #5a6268; }
    .btn-danger { background: #dc3545; color: white; }
    .btn-danger:hover { background: #c82333; }
    .btn-sm { padding: 4px 8px; font-size: 12px; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    .table th { background: #f8f9fa; font-weight: 600; }
    .table tr:hover { background: #f8f9fa; }
    .form-group { margin-bottom: 15px; }
    .form-label { display: block; margin-bottom: 5px; font-weight: 500; }
    .form-input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    .form-input:focus { outline: none; border-color: #3498db; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-active { background: #d4edda; color: #155724; }
    .badge-inactive { background: #fff3cd; color: #856404; }
    .badge-error { background: #f8d7da; color: #721c24; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 8px; padding: 20px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #666; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .loading { text-align: center; padding: 40px; color: #666; }
    .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px; margin-bottom: 15px; }
    .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; margin-bottom: 15px; }
    .empty { text-align: center; padding: 40px; color: #666; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #3498db; }
    .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
    .login-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); }
    .login-card { background: white; padding: 40px; border-radius: 8px; width: 100%; max-width: 400px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .login-title { text-align: center; margin-bottom: 30px; color: #2c3e50; }
    .instance-card { border: 1px solid #eee; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
    .instance-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .instance-name { font-weight: 600; font-size: 16px; }
    .instance-url { color: #666; font-size: 14px; word-break: break-all; }
  `;
}


function getFullAppScript(): string {
  return getBaseScript() + getLoginPageScript() + getInstancesPageScript() + getStatsPageScript() + getAppScript();
}

function getBaseScript(): string {
  return `
const { useState, useEffect, useCallback, createContext, useContext } = React;

// Auth Context
const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

// API helper with auth
const createApi = (token, setToken) => ({
  async get(url) {
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const res = await fetch(url, { headers });
    if (res.status === 401) { setToken(null); localStorage.removeItem('adminToken'); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async post(url, data) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(data) });
    if (res.status === 401) { setToken(null); localStorage.removeItem('adminToken'); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async put(url, data) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(data) });
    if (res.status === 401) { setToken(null); localStorage.removeItem('adminToken'); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async del(url) {
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const res = await fetch(url, { method: 'DELETE', headers });
    if (res.status === 401) { setToken(null); localStorage.removeItem('adminToken'); throw new Error('Unauthorized'); }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
});

function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return React.createElement('div', { className: 'modal-overlay', onClick: onClose },
    React.createElement('div', { className: 'modal', onClick: e => e.stopPropagation() },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h3', null, title),
        React.createElement('button', { className: 'modal-close', onClick: onClose }, '×')
      ),
      children
    )
  );
}

function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }) {
  return React.createElement(Modal, { isOpen, onClose, title },
    React.createElement('p', null, message),
    React.createElement('div', { className: 'modal-footer' },
      React.createElement('button', { className: 'btn btn-secondary', onClick: onClose }, '取消'),
      React.createElement('button', { className: 'btn btn-danger', onClick: onConfirm }, '确认删除')
    )
  );
}

const statusLabels = { active: '正常', inactive: '停用', error: '错误' };
`;
}


function getLoginPageScript(): string {
  return `
function LoginPage({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) { setError('请输入密码'); return; }
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error?.message || '登录失败');
        return;
      }
      
      if (data.data?.token) {
        localStorage.setItem('adminToken', data.data.token);
        onLogin(data.data.token);
      } else {
        setError('登录响应无效');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return React.createElement('div', { className: 'login-container' },
    React.createElement('div', { className: 'login-card' },
      React.createElement('h1', { className: 'login-title' }, '邮件过滤管理面板'),
      error && React.createElement('div', { className: 'error' }, error),
      React.createElement('form', { onSubmit: handleSubmit },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, '管理员密码'),
          React.createElement('input', {
            type: 'password',
            className: 'form-input',
            value: password,
            onChange: e => setPassword(e.target.value),
            placeholder: '请输入密码...',
            autoFocus: true
          })
        ),
        React.createElement('button', {
          type: 'submit',
          className: 'btn btn-primary',
          style: { width: '100%', padding: '12px' },
          disabled: loading
        }, loading ? '登录中...' : '登录')
      )
    )
  );
}
`;
}


function getInstancesPageScript(): string {
  return `
function InstanceForm({ instance, onSave, onCancel }) {
  const [form, setForm] = useState(instance || { name: '', apiUrl: '', apiKey: '' });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('实例名称不能为空'); return; }
    if (!form.apiUrl.trim()) { setError('API地址不能为空'); return; }
    try { new URL(form.apiUrl); } catch { setError('请输入有效的URL地址'); return; }
    onSave(form);
  };

  return React.createElement('form', { onSubmit: handleSubmit },
    error && React.createElement('div', { className: 'error' }, error),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '实例名称'),
      React.createElement('input', { type: 'text', className: 'form-input', value: form.name, onChange: e => setForm({...form, name: e.target.value}), placeholder: '例如：生产环境-1' })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, 'API地址'),
      React.createElement('input', { type: 'text', className: 'form-input', value: form.apiUrl, onChange: e => setForm({...form, apiUrl: e.target.value}), placeholder: 'https://worker.example.com' })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, 'API密钥（可选）'),
      React.createElement('input', { type: 'password', className: 'form-input', value: form.apiKey || '', onChange: e => setForm({...form, apiKey: e.target.value}), placeholder: '用于访问Worker API的密钥' })
    ),
    React.createElement('div', { className: 'modal-footer' },
      React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: onCancel }, '取消'),
      React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, instance ? '更新' : '创建')
    )
  );
}

function InstancesPage() {
  const { api } = useAuth();
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editInstance, setEditInstance] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const d = await api.get('/api/instances'); setInstances(d.data || []); }
    catch (e) { setError('加载实例列表失败: ' + e.message); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editInstance) await api.put('/api/instances/' + editInstance.id, form);
      else await api.post('/api/instances', form);
      setShowForm(false); setEditInstance(null); load();
    } catch (e) { alert('保存失败: ' + e.message); }
  };

  const handleDel = async () => {
    if (!delConfirm) return;
    try { await api.del('/api/instances/' + delConfirm.id); setDelConfirm(null); load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  return React.createElement('div', null,
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h2', { className: 'card-title' }, 'Worker实例管理'),
        React.createElement('div', { style: { display: 'flex', gap: '10px' } },
          React.createElement('button', { className: 'btn btn-secondary', onClick: load }, '刷新'),
          React.createElement('button', { className: 'btn btn-primary', onClick: () => { setEditInstance(null); setShowForm(true); } }, '添加实例')
        )
      ),
      error && React.createElement('div', { className: 'error' }, error),
      loading ? React.createElement('div', { className: 'loading' }, '加载中...') :
      instances.length === 0 ? React.createElement('div', { className: 'empty' }, '暂无Worker实例，点击"添加实例"创建') :
      React.createElement('div', null,
        instances.map(inst => React.createElement('div', { key: inst.id, className: 'instance-card' },
          React.createElement('div', { className: 'instance-header' },
            React.createElement('span', { className: 'instance-name' }, inst.name),
            React.createElement('span', { className: 'badge badge-' + inst.status }, statusLabels[inst.status] || inst.status)
          ),
          React.createElement('a', { 
            href: inst.apiUrl, 
            target: '_blank', 
            rel: 'noopener noreferrer',
            className: 'instance-url',
            style: { color: '#3498db', textDecoration: 'none', cursor: 'pointer' },
            title: '点击访问 Worker 实例管理界面'
          }, inst.apiUrl, React.createElement('span', { style: { marginLeft: '5px', fontSize: '12px' } }, '↗')),
          React.createElement('div', { style: { marginTop: '10px', display: 'flex', gap: '10px' } },
            React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: () => window.open(inst.apiUrl, '_blank') }, '访问'),
            React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: () => { setEditInstance(inst); setShowForm(true); } }, '编辑'),
            React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: () => setDelConfirm(inst) }, '删除')
          )
        ))
      )
    ),
    React.createElement(Modal, { isOpen: showForm, onClose: () => { setShowForm(false); setEditInstance(null); }, title: editInstance ? '编辑实例' : '添加实例' },
      React.createElement(InstanceForm, { instance: editInstance, onSave: handleSave, onCancel: () => { setShowForm(false); setEditInstance(null); } })
    ),
    React.createElement(ConfirmDialog, { isOpen: !!delConfirm, onClose: () => setDelConfirm(null), onConfirm: handleDel, title: '确认删除', message: '确定要删除实例 "' + (delConfirm ? delConfirm.name : '') + '" 吗？' })
  );
}
`;
}


function getStatsPageScript(): string {
  return `
const categoryLabels = { whitelist: '白名单', blacklist: '黑名单', dynamic: '动态名单' };

function StatsPage() {
  const { api } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const d = await api.get('/api/stats'); setStats(d.data || null); }
    catch (e) { setError('加载统计数据失败: ' + e.message); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setLoading(true); setError('');
    try { const d = await api.post('/api/stats/refresh', {}); setStats(d.data || null); }
    catch (e) { setError('刷新统计数据失败: ' + e.message); }
    finally { setLoading(false); }
  };

  if (loading) return React.createElement('div', { className: 'card' }, React.createElement('div', { className: 'loading' }, '加载中...'));

  const instanceStats = stats?.instances || [];
  const totalRules = instanceStats.reduce((s, i) => s + (i.ruleStats?.length || 0), 0);
  const totalProcessed = stats?.totalProcessed || instanceStats.reduce((s, i) => s + (i.ruleStats || []).reduce((rs, r) => rs + (r.totalProcessed || 0), 0), 0);
  const totalDeleted = stats?.totalDeleted || instanceStats.reduce((s, i) => s + (i.ruleStats || []).reduce((rs, r) => rs + (r.deletedCount || 0), 0), 0);
  const totalErrors = stats?.totalErrors || instanceStats.reduce((s, i) => s + (i.ruleStats || []).reduce((rs, r) => rs + (r.errorCount || 0), 0), 0);
  const totalWatchHits = instanceStats.reduce((s, i) => s + (i.watchStats || []).reduce((ws, w) => ws + (w.totalCount || 0), 0), 0);

  return React.createElement('div', null,
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h2', { className: 'card-title' }, '统计仪表盘'),
        React.createElement('button', { className: 'btn btn-primary', onClick: refresh, disabled: loading }, loading ? '刷新中...' : '刷新数据')
      ),
      error && React.createElement('div', { className: 'error' }, error),
      React.createElement('div', { className: 'stats-grid' },
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, instanceStats.length),
          React.createElement('div', { className: 'stat-label' }, 'Worker实例数')
        ),
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, totalRules),
          React.createElement('div', { className: 'stat-label' }, '总规则数')
        ),
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, totalProcessed),
          React.createElement('div', { className: 'stat-label' }, '总处理邮件数')
        ),
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, totalDeleted),
          React.createElement('div', { className: 'stat-label' }, '总删除邮件数')
        ),
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, totalErrors),
          React.createElement('div', { className: 'stat-label' }, '总错误数')
        ),
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, totalWatchHits),
          React.createElement('div', { className: 'stat-label' }, '重点关注命中数')
        )
      )
    ),
    instanceStats.length === 0 ? React.createElement('div', { className: 'card' }, React.createElement('div', { className: 'empty' }, '暂无实例统计数据，请先添加Worker实例')) :
    instanceStats.map(inst => React.createElement('div', { key: inst.instanceId, className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h3', { className: 'card-title' }, inst.instanceName || inst.instanceId),
        inst.error && React.createElement('span', { className: 'badge badge-error' }, '获取失败')
      ),
      inst.error ? React.createElement('div', { className: 'error' }, inst.error) :
      React.createElement('div', null,
        React.createElement('h4', { style: { marginBottom: '10px', fontSize: '14px', color: '#666' } }, '规则命中统计'),
        (!inst.ruleStats || inst.ruleStats.length === 0) ? React.createElement('div', { className: 'empty', style: { padding: '20px' } }, '暂无规则统计') :
        React.createElement('table', { className: 'table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, '分类'),
              React.createElement('th', null, '匹配模式'),
              React.createElement('th', null, '总处理数'),
              React.createElement('th', null, '删除数'),
              React.createElement('th', null, '错误数')
            )
          ),
          React.createElement('tbody', null,
            inst.ruleStats.map(r => React.createElement('tr', { key: r.ruleId },
              React.createElement('td', null, React.createElement('span', { className: 'badge badge-' + (r.category === 'whitelist' ? 'active' : r.category === 'blacklist' ? 'error' : 'inactive') }, categoryLabels[r.category] || r.category)),
              React.createElement('td', { style: { maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: r.pattern }, r.pattern || r.ruleId),
              React.createElement('td', null, r.totalProcessed || 0),
              React.createElement('td', null, r.deletedCount || 0),
              React.createElement('td', null, r.errorCount || 0)
            ))
          )
        ),
        React.createElement('h4', { style: { marginTop: '20px', marginBottom: '10px', fontSize: '14px', color: '#666' } }, '重点关注统计'),
        (!inst.watchStats || inst.watchStats.length === 0) ? React.createElement('div', { className: 'empty', style: { padding: '20px' } }, '暂无重点关注统计') :
        React.createElement('table', { className: 'table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, '主题模式'),
              React.createElement('th', null, '总数量'),
              React.createElement('th', null, '24小时'),
              React.createElement('th', null, '1小时'),
              React.createElement('th', null, '收件邮箱')
            )
          ),
          React.createElement('tbody', null,
            inst.watchStats.map(w => React.createElement('tr', { key: w.watchId },
              React.createElement('td', null, w.subjectPattern),
              React.createElement('td', null, w.totalCount || 0),
              React.createElement('td', null, w.last24hCount || 0),
              React.createElement('td', null, w.last1hCount || 0),
              React.createElement('td', { title: (w.recipients || []).join(', ') }, (w.recipients || []).length > 0 ? ((w.recipients || []).slice(0, 3).join(', ') + ((w.recipients || []).length > 3 ? ' (+' + ((w.recipients || []).length - 3) + ')' : '')) : '-')
            ))
          )
        )
      )
    ))
  );
}
`;
}


function getAppScript(): string {
  return `
function App() {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken'));
  const [page, setPage] = useState('instances');
  const [verifying, setVerifying] = useState(true);

  const api = createApi(token, setToken);

  // Verify token on mount
  useEffect(() => {
    if (!token) { setVerifying(false); return; }
    
    fetch('/api/auth/verify', { headers: { 'Authorization': 'Bearer ' + token } })
      .then(res => res.json())
      .then(data => {
        if (!data.data?.valid) {
          setToken(null);
          localStorage.removeItem('adminToken');
        }
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem('adminToken');
      })
      .finally(() => setVerifying(false));
  }, [token]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } catch {}
    setToken(null);
    localStorage.removeItem('adminToken');
  };

  if (verifying) {
    return React.createElement('div', { className: 'login-container' },
      React.createElement('div', { className: 'loading' }, '验证中...')
    );
  }

  if (!token) {
    return React.createElement(LoginPage, { onLogin: setToken });
  }

  const renderPage = () => {
    switch (page) {
      case 'instances': return React.createElement(InstancesPage);
      case 'stats': return React.createElement(StatsPage);
      default: return React.createElement(InstancesPage);
    }
  };

  return React.createElement(AuthContext.Provider, { value: { token, api } },
    React.createElement('div', { className: 'app' },
      React.createElement('div', { className: 'header' },
        React.createElement('h1', null, '邮件过滤管理面板'),
        React.createElement('div', { className: 'nav' },
          React.createElement('button', { className: 'nav-btn' + (page === 'instances' ? ' active' : ''), onClick: () => setPage('instances') }, 'Worker实例'),
          React.createElement('button', { className: 'nav-btn' + (page === 'stats' ? ' active' : ''), onClick: () => setPage('stats') }, '统计仪表盘'),
          React.createElement('button', { className: 'nav-btn', onClick: handleLogout }, '退出登录')
        )
      ),
      renderPage()
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
`;
}

export { frontendRouter };
