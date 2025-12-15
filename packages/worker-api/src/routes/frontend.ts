import { Hono } from 'hono';
import type { Bindings } from '../index.js';

const frontendRouter = new Hono<{ Bindings: Bindings }>();

// Serve the frontend HTML
frontendRouter.get('/', (c) => {
  return c.html(getHtmlContent());
});

function getHtmlContent(): string {
  // HTML content is built as a string to avoid TypeScript JSX parsing issues
  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; line-height: 1.6; }
    .app { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { font-size: 24px; margin-bottom: 10px; }
    .nav { display: flex; gap: 10px; flex-wrap: wrap; }
    .nav-btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: all 0.2s; background: rgba(255,255,255,0.2); color: white; }
    .nav-btn:hover { background: rgba(255,255,255,0.3); }
    .nav-btn.active { background: white; color: #667eea; }
    .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; flex-wrap: wrap; gap: 10px; }
    .card-title { font-size: 18px; font-weight: 600; }
    .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5a6fd6; }
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
    .form-input, .form-select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
    .form-input:focus, .form-select:focus { outline: none; border-color: #667eea; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-whitelist { background: #d4edda; color: #155724; }
    .badge-blacklist { background: #f8d7da; color: #721c24; }
    .badge-dynamic { background: #fff3cd; color: #856404; }
    .toggle { position: relative; width: 50px; height: 26px; cursor: pointer; display: inline-block; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; border-radius: 26px; transition: 0.3s; }
    .toggle-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: 0.3s; }
    .toggle input:checked + .toggle-slider { background-color: #667eea; }
    .toggle input:checked + .toggle-slider:before { transform: translateX(24px); }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .modal { background: white; border-radius: 8px; padding: 20px; width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #666; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
    .tabs { display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 2px solid #eee; }
    .tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 14px; color: #666; border-bottom: 2px solid transparent; margin-bottom: -2px; }
    .tab:hover { color: #667eea; }
    .tab.active { color: #667eea; border-bottom-color: #667eea; }
    .loading { text-align: center; padding: 40px; color: #666; }
    .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px; margin-bottom: 15px; }
    .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; margin-bottom: 15px; }
    .empty { text-align: center; padding: 40px; color: #666; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #667eea; }
    .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
  `;

  return '<!DOCTYPE html>' +
    '<html lang="zh-CN">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>邮件过滤管理</title>' +
    '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></' + 'script>' +
    '<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></' + 'script>' +
    '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></' + 'script>' +
    '<style>' + styles + '</style>' +
    '</head>' +
    '<body>' +
    '<div id="root"></div>' +
    '<script type="text/babel">' + getFullAppScript() + '</' + 'script>' +
    '</body>' +
    '</html>';
}


function getAppScript(): string {
  return `
const { useState, useEffect, useCallback } = React;

const api = {
  async get(url) { const res = await fetch(url); if (!res.ok) throw new Error(await res.text()); return res.json(); },
  async post(url, data) { const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
  async put(url, data) { const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
  async patch(url) { const res = await fetch(url, { method: 'PATCH' }); if (!res.ok) throw new Error(await res.text()); return res.json(); },
  async del(url) { const res = await fetch(url, { method: 'DELETE' }); if (!res.ok) throw new Error(await res.text()); return res.json(); }
};

const labels = {
  category: { whitelist: '白名单', blacklist: '黑名单', dynamic: '动态名单' },
  matchType: { sender_name: '发件人名称', subject: '邮件主题', sender_email: '发件邮箱' },
  matchMode: { regex: '正则匹配', contains: '包含匹配' }
};

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

function RuleForm({ rule, onSave, onCancel }) {
  const [form, setForm] = useState(rule || { category: 'blacklist', matchType: 'subject', matchMode: 'contains', pattern: '', enabled: true });
  const [error, setError] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.pattern.trim()) { setError('匹配模式不能为空'); return; }
    if (form.matchMode === 'regex') { try { new RegExp(form.pattern); } catch { setError('无效的正则表达式'); return; } }
    onSave(form);
  };

  return React.createElement('form', { onSubmit: handleSubmit },
    error && React.createElement('div', { className: 'error' }, error),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '规则分类'),
      React.createElement('select', { className: 'form-select', value: form.category, onChange: e => setForm({...form, category: e.target.value}) },
        React.createElement('option', { value: 'whitelist' }, '白名单'),
        React.createElement('option', { value: 'blacklist' }, '黑名单'),
        React.createElement('option', { value: 'dynamic' }, '动态名单')
      )
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '匹配字段'),
      React.createElement('select', { className: 'form-select', value: form.matchType, onChange: e => setForm({...form, matchType: e.target.value}) },
        React.createElement('option', { value: 'sender_name' }, '发件人名称'),
        React.createElement('option', { value: 'subject' }, '邮件主题'),
        React.createElement('option', { value: 'sender_email' }, '发件邮箱')
      )
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '匹配方式'),
      React.createElement('select', { className: 'form-select', value: form.matchMode, onChange: e => setForm({...form, matchMode: e.target.value}) },
        React.createElement('option', { value: 'contains' }, '包含匹配'),
        React.createElement('option', { value: 'regex' }, '正则匹配')
      )
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '匹配模式'),
      React.createElement('input', { type: 'text', className: 'form-input', value: form.pattern, onChange: e => setForm({...form, pattern: e.target.value}), placeholder: form.matchMode === 'regex' ? '输入正则表达式...' : '输入要匹配的文本...' })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'toggle' },
        React.createElement('input', { type: 'checkbox', checked: form.enabled, onChange: e => setForm({...form, enabled: e.target.checked}) }),
        React.createElement('span', { className: 'toggle-slider' })
      ),
      React.createElement('span', { style: { marginLeft: '10px' } }, form.enabled ? '启用' : '禁用')
    ),
    React.createElement('div', { className: 'modal-footer' },
      React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: onCancel }, '取消'),
      React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, rule ? '更新' : '创建')
    )
  );
}
`;
}


function getRulesPageScript(): string {
  return `
function RulesPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const d = await api.get('/api/rules'); setRules(d.data || []); }
    catch (e) { setError('加载规则失败: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = tab === 'all' ? rules : rules.filter(r => r.category === tab);
  const counts = { all: rules.length, whitelist: rules.filter(r => r.category === 'whitelist').length, blacklist: rules.filter(r => r.category === 'blacklist').length, dynamic: rules.filter(r => r.category === 'dynamic').length };

  const handleSave = async (form) => {
    try {
      if (editRule) await api.put('/api/rules/' + editRule.id, form);
      else await api.post('/api/rules', form);
      setShowForm(false); setEditRule(null); load();
    } catch (e) { alert('保存失败: ' + e.message); }
  };

  const handleToggle = async (r) => {
    try { await api.patch('/api/rules/' + r.id + '/toggle'); load(); }
    catch (e) { alert('切换状态失败: ' + e.message); }
  };

  const handleDel = async () => {
    if (!delConfirm) return;
    try { await api.del('/api/rules/' + delConfirm.id); setDelConfirm(null); load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  const tabs = ['all', 'whitelist', 'blacklist', 'dynamic'];
  const tabLabels = { all: '全部', whitelist: '白名单', blacklist: '黑名单', dynamic: '动态名单' };

  return React.createElement('div', null,
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h2', { className: 'card-title' }, '过滤规则管理'),
        React.createElement('div', { style: { display: 'flex', gap: '10px' } },
          React.createElement('button', { className: 'btn btn-secondary', onClick: load }, '刷新'),
          React.createElement('button', { className: 'btn btn-primary', onClick: () => { setEditRule(null); setShowForm(true); } }, '添加规则')
        )
      ),
      React.createElement('div', { className: 'tabs' },
        tabs.map(t => React.createElement('button', { key: t, className: 'tab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, tabLabels[t] + ' (' + counts[t] + ')'))
      ),
      error && React.createElement('div', { className: 'error' }, error),
      loading ? React.createElement('div', { className: 'loading' }, '加载中...') :
      filtered.length === 0 ? React.createElement('div', { className: 'empty' }, '暂无规则') :
      React.createElement('table', { className: 'table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, '分类'),
            React.createElement('th', null, '匹配字段'),
            React.createElement('th', null, '匹配方式'),
            React.createElement('th', null, '匹配模式'),
            React.createElement('th', null, '状态'),
            React.createElement('th', null, '操作')
          )
        ),
        React.createElement('tbody', null,
          filtered.map(r => React.createElement('tr', { key: r.id },
            React.createElement('td', null, React.createElement('span', { className: 'badge badge-' + r.category }, labels.category[r.category])),
            React.createElement('td', null, labels.matchType[r.matchType]),
            React.createElement('td', null, labels.matchMode[r.matchMode]),
            React.createElement('td', { style: { maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.pattern),
            React.createElement('td', null,
              React.createElement('label', { className: 'toggle' },
                React.createElement('input', { type: 'checkbox', checked: r.enabled, onChange: () => handleToggle(r) }),
                React.createElement('span', { className: 'toggle-slider' })
              )
            ),
            React.createElement('td', null,
              React.createElement('div', { style: { display: 'flex', gap: '5px' } },
                React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: () => { setEditRule(r); setShowForm(true); } }, '编辑'),
                React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: () => setDelConfirm(r) }, '删除')
              )
            )
          ))
        )
      )
    ),
    React.createElement(Modal, { isOpen: showForm, onClose: () => { setShowForm(false); setEditRule(null); }, title: editRule ? '编辑规则' : '添加规则' },
      React.createElement(RuleForm, { rule: editRule, onSave: handleSave, onCancel: () => { setShowForm(false); setEditRule(null); } })
    ),
    React.createElement(ConfirmDialog, { isOpen: !!delConfirm, onClose: () => setDelConfirm(null), onConfirm: handleDel, title: '确认删除', message: '确定要删除规则 "' + (delConfirm ? delConfirm.pattern : '') + '" 吗？相关统计数据也将被删除。' })
  );
}
`;
}


function getStatsPageScript(): string {
  return `
function StatsPage() {
  const [ruleStats, setRuleStats] = useState([]);
  const [watchStats, setWatchStats] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [rd, rsd, wsd] = await Promise.all([api.get('/api/rules'), api.get('/api/stats/rules'), api.get('/api/stats/watch')]);
      setRules(rd.data || []); setRuleStats(rsd.data || []); setWatchStats(wsd.data || []);
    } catch (e) { setError('加载统计数据失败: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getRule = (id) => rules.find(r => r.id === id);
  const total = ruleStats.reduce((s, x) => s + (x.totalProcessed || 0), 0);
  const deleted = ruleStats.reduce((s, x) => s + (x.deletedCount || 0), 0);
  const errors = ruleStats.reduce((s, x) => s + (x.errorCount || 0), 0);

  return React.createElement('div', null,
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h2', { className: 'card-title' }, '规则命中统计'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: load }, '刷新')
      ),
      error && React.createElement('div', { className: 'error' }, error),
      React.createElement('div', { className: 'stats-grid' },
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, total),
          React.createElement('div', { className: 'stat-label' }, '总处理数')
        ),
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, deleted),
          React.createElement('div', { className: 'stat-label' }, '删除数')
        ),
        React.createElement('div', { className: 'stat-card' },
          React.createElement('div', { className: 'stat-value' }, errors),
          React.createElement('div', { className: 'stat-label' }, '错误数')
        )
      ),
      loading ? React.createElement('div', { className: 'loading' }, '加载中...') :
      ruleStats.length === 0 ? React.createElement('div', { className: 'empty' }, '暂无统计数据') :
      React.createElement('table', { className: 'table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, '规则分类'),
            React.createElement('th', null, '匹配模式'),
            React.createElement('th', null, '总处理数'),
            React.createElement('th', null, '删除数'),
            React.createElement('th', null, '错误数'),
            React.createElement('th', null, '最后更新')
          )
        ),
        React.createElement('tbody', null,
          ruleStats.map(s => {
            const r = getRule(s.ruleId);
            return React.createElement('tr', { key: s.ruleId },
              React.createElement('td', null, r ? React.createElement('span', { className: 'badge badge-' + r.category }, labels.category[r.category]) : '-'),
              React.createElement('td', { style: { maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r ? r.pattern : s.ruleId),
              React.createElement('td', null, s.totalProcessed || 0),
              React.createElement('td', null, s.deletedCount || 0),
              React.createElement('td', null, s.errorCount || 0),
              React.createElement('td', null, s.lastUpdated ? new Date(s.lastUpdated).toLocaleString() : '-')
            );
          })
        )
      )
    ),
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h2', { className: 'card-title' }, '重点关注统计')
      ),
      loading ? React.createElement('div', { className: 'loading' }, '加载中...') :
      watchStats.length === 0 ? React.createElement('div', { className: 'empty' }, '暂无重点关注统计') :
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
          watchStats.map(s => React.createElement('tr', { key: s.watchId },
            React.createElement('td', null, s.subjectPattern),
            React.createElement('td', null, s.totalCount || 0),
            React.createElement('td', null, s.last24hCount || 0),
            React.createElement('td', null, s.last1hCount || 0),
            React.createElement('td', null,
              React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
                (s.recipients || []).slice(0, 5).map((r, i) => React.createElement('span', { key: i, style: { background: '#e9ecef', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' } }, r)),
                (s.recipients || []).length > 5 && React.createElement('span', { style: { background: '#e9ecef', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' } }, '+' + (s.recipients.length - 5))
              )
            )
          ))
        )
      )
    )
  );
}
`;
}


function getDynamicConfigPageScript(): string {
  return `
function DynamicConfigPage() {
  const [config, setConfig] = useState({ enabled: true, timeWindowMinutes: 60, thresholdCount: 50, expirationHours: 48 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const d = await api.get('/api/dynamic/config'); if (d.data) setConfig(d.data); }
    catch (e) { setError('加载配置失败: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try { await api.put('/api/dynamic/config', config); setSuccess('配置保存成功'); setTimeout(() => setSuccess(''), 3000); }
    catch (e) { setError('保存配置失败: ' + e.message); }
    finally { setSaving(false); }
  };

  if (loading) return React.createElement('div', { className: 'card' }, React.createElement('div', { className: 'loading' }, '加载中...'));

  return React.createElement('div', { className: 'card' },
    React.createElement('div', { className: 'card-header' },
      React.createElement('h2', { className: 'card-title' }, '动态规则配置'),
      React.createElement('button', { className: 'btn btn-secondary', onClick: load }, '刷新')
    ),
    error && React.createElement('div', { className: 'error' }, error),
    success && React.createElement('div', { className: 'success' }, success),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '启用动态规则'),
      React.createElement('label', { className: 'toggle' },
        React.createElement('input', { type: 'checkbox', checked: config.enabled, onChange: e => setConfig({...config, enabled: e.target.checked}) }),
        React.createElement('span', { className: 'toggle-slider' })
      ),
      React.createElement('p', { style: { color: '#666', fontSize: '12px', marginTop: '5px' } }, '启用后，系统将自动检测异常营销邮件并生成动态过滤规则')
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '检测时间窗口（分钟）'),
      React.createElement('input', { type: 'number', className: 'form-input', value: config.timeWindowMinutes, onChange: e => setConfig({...config, timeWindowMinutes: parseInt(e.target.value) || 60}), min: 1, max: 1440 }),
      React.createElement('p', { style: { color: '#666', fontSize: '12px', marginTop: '5px' } }, '在此时间窗口内检测相同主题的邮件数量')
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '触发阈值（封）'),
      React.createElement('input', { type: 'number', className: 'form-input', value: config.thresholdCount, onChange: e => setConfig({...config, thresholdCount: parseInt(e.target.value) || 50}), min: 1, max: 1000 }),
      React.createElement('p', { style: { color: '#666', fontSize: '12px', marginTop: '5px' } }, '当相同主题邮件数量超过此阈值时，自动创建动态规则')
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '规则过期时间（小时）'),
      React.createElement('input', { type: 'number', className: 'form-input', value: config.expirationHours, onChange: e => setConfig({...config, expirationHours: parseInt(e.target.value) || 48}), min: 1, max: 720 }),
      React.createElement('p', { style: { color: '#666', fontSize: '12px', marginTop: '5px' } }, '动态规则在此时间内没有命中邮件将被自动删除')
    ),
    React.createElement('div', { style: { marginTop: '20px' } },
      React.createElement('button', { className: 'btn btn-primary', onClick: handleSave, disabled: saving }, saving ? '保存中...' : '保存配置')
    )
  );
}
`;
}


function getWatchPageScript(): string {
  return `
function WatchPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [delConfirm, setDelConfirm] = useState(null);
  const [form, setForm] = useState({ subjectPattern: '', matchMode: 'contains' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const d = await api.get('/api/watch'); setItems(d.data || []); }
    catch (e) { setError('加载重点关注列表失败: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.subjectPattern.trim()) { alert('主题模式不能为空'); return; }
    try { await api.post('/api/watch', form); setShowForm(false); setForm({ subjectPattern: '', matchMode: 'contains' }); load(); }
    catch (e) { alert('添加失败: ' + e.message); }
  };

  const handleDel = async () => {
    if (!delConfirm) return;
    try { await api.del('/api/watch/' + delConfirm.id); setDelConfirm(null); load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  return React.createElement('div', { className: 'card' },
    React.createElement('div', { className: 'card-header' },
      React.createElement('h2', { className: 'card-title' }, '重点关注管理'),
      React.createElement('div', { style: { display: 'flex', gap: '10px' } },
        React.createElement('button', { className: 'btn btn-secondary', onClick: load }, '刷新'),
        React.createElement('button', { className: 'btn btn-primary', onClick: () => setShowForm(true) }, '添加关注')
      )
    ),
    error && React.createElement('div', { className: 'error' }, error),
    loading ? React.createElement('div', { className: 'loading' }, '加载中...') :
    items.length === 0 ? React.createElement('div', { className: 'empty' }, '暂无重点关注项') :
    React.createElement('table', { className: 'table' },
      React.createElement('thead', null,
        React.createElement('tr', null,
          React.createElement('th', null, '主题模式'),
          React.createElement('th', null, '匹配方式'),
          React.createElement('th', null, '创建时间'),
          React.createElement('th', null, '操作')
        )
      ),
      React.createElement('tbody', null,
        items.map(i => React.createElement('tr', { key: i.id },
          React.createElement('td', null, i.subjectPattern),
          React.createElement('td', null, labels.matchMode[i.matchMode]),
          React.createElement('td', null, new Date(i.createdAt).toLocaleString()),
          React.createElement('td', null,
            React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: () => setDelConfirm(i) }, '删除')
          )
        ))
      )
    ),
    React.createElement(Modal, { isOpen: showForm, onClose: () => setShowForm(false), title: '添加重点关注' },
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, '主题模式'),
        React.createElement('input', { type: 'text', className: 'form-input', value: form.subjectPattern, onChange: e => setForm({...form, subjectPattern: e.target.value}), placeholder: '输入要关注的邮件主题...' })
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, '匹配方式'),
        React.createElement('select', { className: 'form-select', value: form.matchMode, onChange: e => setForm({...form, matchMode: e.target.value}) },
          React.createElement('option', { value: 'contains' }, '包含匹配'),
          React.createElement('option', { value: 'regex' }, '正则匹配')
        )
      ),
      React.createElement('div', { className: 'modal-footer' },
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => setShowForm(false) }, '取消'),
        React.createElement('button', { className: 'btn btn-primary', onClick: handleAdd }, '添加')
      )
    ),
    React.createElement(ConfirmDialog, { isOpen: !!delConfirm, onClose: () => setDelConfirm(null), onConfirm: handleDel, title: '确认删除', message: '确定要删除重点关注 "' + (delConfirm ? delConfirm.subjectPattern : '') + '" 吗？' })
  );
}
`;
}


function getForwardConfigPageScript(): string {
  return `
function ForwardRuleForm({ rule, onSave, onCancel }) {
  const [form, setForm] = useState(rule || { recipientPattern: '', matchMode: 'contains', forwardTo: '', enabled: true });
  const [error, setError] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.recipientPattern.trim()) { setError('收件人模式不能为空'); return; }
    if (!form.forwardTo.trim()) { setError('转发地址不能为空'); return; }
    if (!form.forwardTo.includes('@')) { setError('请输入有效的邮箱地址'); return; }
    if (form.matchMode === 'regex') { try { new RegExp(form.recipientPattern); } catch { setError('无效的正则表达式'); return; } }
    onSave(form);
  };

  return React.createElement('form', { onSubmit: handleSubmit },
    error && React.createElement('div', { className: 'error' }, error),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '收件人模式'),
      React.createElement('input', { type: 'text', className: 'form-input', value: form.recipientPattern, onChange: e => setForm({...form, recipientPattern: e.target.value}), placeholder: '例如：@mydomain.com 或 user@example.com' })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '匹配方式'),
      React.createElement('select', { className: 'form-select', value: form.matchMode, onChange: e => setForm({...form, matchMode: e.target.value}) },
        React.createElement('option', { value: 'exact' }, '精确匹配'),
        React.createElement('option', { value: 'contains' }, '包含匹配'),
        React.createElement('option', { value: 'regex' }, '正则匹配')
      )
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, '转发到'),
      React.createElement('input', { type: 'email', className: 'form-input', value: form.forwardTo, onChange: e => setForm({...form, forwardTo: e.target.value}), placeholder: '转发目标邮箱地址' })
    ),
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'toggle' },
        React.createElement('input', { type: 'checkbox', checked: form.enabled, onChange: e => setForm({...form, enabled: e.target.checked}) }),
        React.createElement('span', { className: 'toggle-slider' })
      ),
      React.createElement('span', { style: { marginLeft: '10px' } }, form.enabled ? '启用' : '禁用')
    ),
    React.createElement('div', { className: 'modal-footer' },
      React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: onCancel }, '取消'),
      React.createElement('button', { type: 'submit', className: 'btn btn-primary' }, rule ? '更新' : '创建')
    )
  );
}

function ForwardConfigPage() {
  const [config, setConfig] = useState({ enabled: false, defaultForwardTo: '', forwardRules: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const d = await api.get('/api/forward/config'); if (d.data) setConfig(d.data); }
    catch (e) { setError('加载配置失败: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveConfig = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.put('/api/forward/config', { enabled: config.enabled, defaultForwardTo: config.defaultForwardTo });
      setSuccess('配置保存成功'); setTimeout(() => setSuccess(''), 3000);
    } catch (e) { setError('保存配置失败: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleSaveRule = async (form) => {
    try {
      if (editRule) await api.put('/api/forward/rules/' + editRule.id, form);
      else await api.post('/api/forward/rules', form);
      setShowForm(false); setEditRule(null); load();
    } catch (e) { alert('保存失败: ' + e.message); }
  };

  const handleDelRule = async () => {
    if (!delConfirm) return;
    try { await api.del('/api/forward/rules/' + delConfirm.id); setDelConfirm(null); load(); }
    catch (e) { alert('删除失败: ' + e.message); }
  };

  const matchModeLabels = { exact: '精确匹配', contains: '包含匹配', regex: '正则匹配' };

  if (loading) return React.createElement('div', { className: 'card' }, React.createElement('div', { className: 'loading' }, '加载中...'));

  return React.createElement('div', null,
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h2', { className: 'card-title' }, '邮件转发配置'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: load }, '刷新')
      ),
      error && React.createElement('div', { className: 'error' }, error),
      success && React.createElement('div', { className: 'success' }, success),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, '启用邮件转发'),
        React.createElement('label', { className: 'toggle' },
          React.createElement('input', { type: 'checkbox', checked: config.enabled, onChange: e => setConfig({...config, enabled: e.target.checked}) }),
          React.createElement('span', { className: 'toggle-slider' })
        ),
        React.createElement('p', { style: { color: '#666', fontSize: '12px', marginTop: '5px' } }, '启用后，通过过滤的邮件将被转发到指定地址')
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, '默认转发地址'),
        React.createElement('input', { type: 'email', className: 'form-input', value: config.defaultForwardTo, onChange: e => setConfig({...config, defaultForwardTo: e.target.value}), placeholder: '所有通过过滤的邮件默认转发到此地址' }),
        React.createElement('p', { style: { color: '#666', fontSize: '12px', marginTop: '5px' } }, '如果没有匹配到自定义转发规则，将使用此默认地址')
      ),
      React.createElement('div', { style: { marginTop: '20px' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: handleSaveConfig, disabled: saving }, saving ? '保存中...' : '保存配置')
      )
    ),
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-header' },
        React.createElement('h2', { className: 'card-title' }, '自定义转发规则'),
        React.createElement('button', { className: 'btn btn-primary', onClick: () => { setEditRule(null); setShowForm(true); } }, '添加规则')
      ),
      React.createElement('p', { style: { color: '#666', fontSize: '14px', marginBottom: '15px' } }, '根据收件人地址匹配不同的转发目标，优先级高于默认转发地址'),
      config.forwardRules.length === 0 ? React.createElement('div', { className: 'empty' }, '暂无自定义转发规则') :
      React.createElement('table', { className: 'table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, '收件人模式'),
            React.createElement('th', null, '匹配方式'),
            React.createElement('th', null, '转发到'),
            React.createElement('th', null, '状态'),
            React.createElement('th', null, '操作')
          )
        ),
        React.createElement('tbody', null,
          config.forwardRules.map(r => React.createElement('tr', { key: r.id },
            React.createElement('td', { style: { maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.recipientPattern),
            React.createElement('td', null, matchModeLabels[r.matchMode]),
            React.createElement('td', null, r.forwardTo),
            React.createElement('td', null, React.createElement('span', { className: 'badge badge-' + (r.enabled ? 'whitelist' : 'blacklist') }, r.enabled ? '启用' : '禁用')),
            React.createElement('td', null,
              React.createElement('div', { style: { display: 'flex', gap: '5px' } },
                React.createElement('button', { className: 'btn btn-sm btn-secondary', onClick: () => { setEditRule(r); setShowForm(true); } }, '编辑'),
                React.createElement('button', { className: 'btn btn-sm btn-danger', onClick: () => setDelConfirm(r) }, '删除')
              )
            )
          ))
        )
      )
    ),
    React.createElement(Modal, { isOpen: showForm, onClose: () => { setShowForm(false); setEditRule(null); }, title: editRule ? '编辑转发规则' : '添加转发规则' },
      React.createElement(ForwardRuleForm, { rule: editRule, onSave: handleSaveRule, onCancel: () => { setShowForm(false); setEditRule(null); } })
    ),
    React.createElement(ConfirmDialog, { isOpen: !!delConfirm, onClose: () => setDelConfirm(null), onConfirm: handleDelRule, title: '确认删除', message: '确定要删除转发规则 "' + (delConfirm ? delConfirm.recipientPattern : '') + '" 吗？' })
  );
}
`;
}


function getMainAppScript(): string {
  return `
function App() {
  const [page, setPage] = useState('rules');
  
  const renderPage = () => {
    switch (page) {
      case 'rules': return React.createElement(RulesPage);
      case 'stats': return React.createElement(StatsPage);
      case 'watch': return React.createElement(WatchPage);
      case 'dynamic': return React.createElement(DynamicConfigPage);
      case 'forward': return React.createElement(ForwardConfigPage);
      default: return React.createElement(RulesPage);
    }
  };

  const navItems = [
    { key: 'rules', label: '规则管理' },
    { key: 'stats', label: '统计数据' },
    { key: 'watch', label: '重点关注' },
    { key: 'dynamic', label: '动态配置' },
    { key: 'forward', label: '转发配置' }
  ];

  return React.createElement('div', { className: 'app' },
    React.createElement('div', { className: 'header' },
      React.createElement('h1', null, '📧 邮件过滤管理'),
      React.createElement('nav', { className: 'nav' },
        navItems.map(item => React.createElement('button', {
          key: item.key,
          className: 'nav-btn' + (page === item.key ? ' active' : ''),
          onClick: () => setPage(item.key)
        }, item.label))
      )
    ),
    renderPage()
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
`;
}

// Combine all scripts
function getFullAppScript(): string {
  return getAppScript() + getRulesPageScript() + getStatsPageScript() + getDynamicConfigPageScript() + getWatchPageScript() + getForwardConfigPageScript() + getMainAppScript();
}

export { frontendRouter };
