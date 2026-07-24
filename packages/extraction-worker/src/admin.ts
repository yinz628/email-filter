/**
 * Admin panel HTML for extraction-worker.
 *
 * Served at GET /admin (Bearer auth required).
 * Phase 1 minimal: a functional single-page panel listing verification codes
 * and discount codes with filtering. Polished UI in batch 3.
 */

export function getAdminHtml(workerOrigin: string, _token: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>提取结果面板</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #333; }
  h1 { font-size: 1.4rem; margin: 0 0 16px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
  .tab { padding: 8px 16px; border: 1px solid #ddd; background: #fff; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .tab.active { background: #0969da; color: #fff; border-color: #0969da; }
  .card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; font-weight: 600; }
  .code-val { font-family: monospace; font-size: 15px; font-weight: 600; color: #0969da; cursor: pointer; }
  .filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .filters input { padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
  .btn { padding: 6px 14px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: #fff; font-size: 13px; }
  .btn:hover { background: #f0f0f0; }
  .hidden { display: none; }
  .link-cell a { color: #0969da; word-break: break-all; }
  .empty { text-align: center; color: #999; padding: 30px; }
</style>
</head>
<body>
<h1>🔐 提取结果面板</h1>
<div class="tabs">
  <div class="tab active" onclick="switchTab('codes')">验证码</div>
  <div class="tab" onclick="switchTab('discounts')">折扣码</div>
</div>

<div id="codes-panel">
  <div class="card">
    <div class="filters">
      <input id="codes-recipient" placeholder="收件邮箱" onkeyup="if(event.key==='Enter')loadCodes()">
      <input id="codes-search" placeholder="搜索" onkeyup="if(event.key==='Enter')loadCodes()">
      <button class="btn" onclick="loadCodes()">查询</button>
    </div>
    <table>
      <thead><tr><th>收件人</th><th>验证码</th><th>链接</th><th>发件人</th><th>主题</th><th>时间</th><th></th></tr></thead>
      <tbody id="codes-tbody"></tbody>
    </table>
  </div>
</div>

<div id="discounts-panel" class="hidden">
  <div class="card">
    <div class="filters">
      <input id="disc-recipient" placeholder="收件邮箱" onkeyup="if(event.key==='Enter')loadDiscounts()">
      <input id="disc-domain" placeholder="商户域名" onkeyup="if(event.key==='Enter')loadDiscounts()">
      <input id="disc-search" placeholder="搜索" onkeyup="if(event.key==='Enter')loadDiscounts()">
      <button class="btn" onclick="loadDiscounts()">查询</button>
    </div>
    <table>
      <thead><tr><th>收件人</th><th>折扣码</th><th>折扣值</th><th>链接</th><th>商户</th><th>主题</th><th>时间</th><th></th></tr></thead>
      <tbody id="disc-tbody"></tbody>
    </table>
  </div>
</div>

<script>
const TOKEN = new URLSearchParams(location.search).get('token') || prompt('Enter ADMIN_TOKEN:');
if (TOKEN) localStorage.setItem('ext_token', TOKEN);
const AUTH = 'Bearer ' + (TOKEN || localStorage.getItem('ext_token') || '');
const ORIGIN = '${workerOrigin}';

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', (tab === 'codes' && i === 0) || (tab === 'discounts' && i === 1)));
  document.getElementById('codes-panel').classList.toggle('hidden', tab !== 'codes');
  document.getElementById('discounts-panel').classList.toggle('hidden', tab !== 'discounts');
  if (tab === 'codes') loadCodes(); else loadDiscounts();
}

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function copy(text) { navigator.clipboard.writeText(text).then(() => alert('已复制: ' + text)); }

async function loadCodes() {
  const r = encodeURIComponent(document.getElementById('codes-recipient').value);
  const s = encodeURIComponent(document.getElementById('codes-search').value);
  let url = ORIGIN + '/api/codes?limit=50';
  if (r) url += '&recipient=' + r;
  if (s) url += '&search=' + s;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const data = await res.json();
  const tbody = document.getElementById('codes-tbody');
  const records = data.records || [];
  if (!records.length) { tbody.innerHTML = '<tr><td colspan=7 class="empty">暂无记录</td></tr>'; return; }
  tbody.innerHTML = records.map(r => '<tr>'
    + '<td>' + esc(r.recipient) + '</td>'
    + '<td>' + (r.code ? '<span class="code-val" onclick="copy(\\''+esc(r.code)+'\\')">'+esc(r.code)+'</span>' : '-') + '</td>'
    + '<td class="link-cell">' + (r.link ? '<a href="'+esc(r.link)+'" target="_blank">'+esc(r.link.slice(0,40))+'...</a>' : '-') + '</td>'
    + '<td>' + esc(r.sender) + '</td>'
    + '<td>' + esc((r.subject||'').slice(0,30)) + '</td>'
    + '<td>' + esc(r.received_at) + '</td>'
    + '<td><button class="btn" onclick="del(\\'codes\\','+r.id+')">🗑</button></td>'
    + '</tr>').join('');
}

async function loadDiscounts() {
  const r = encodeURIComponent(document.getElementById('disc-recipient').value);
  const d = encodeURIComponent(document.getElementById('disc-domain').value);
  const s = encodeURIComponent(document.getElementById('disc-search').value);
  let url = ORIGIN + '/api/discounts?limit=50';
  if (r) url += '&recipient=' + r;
  if (d) url += '&sender_domain=' + d;
  if (s) url += '&search=' + s;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const data = await res.json();
  const tbody = document.getElementById('disc-tbody');
  const records = data.records || [];
  if (!records.length) { tbody.innerHTML = '<tr><td colspan=8 class="empty">暂无记录</td></tr>'; return; }
  tbody.innerHTML = records.map(r => '<tr>'
    + '<td>' + esc(r.recipient) + '</td>'
    + '<td>' + (r.code ? '<span class="code-val" onclick="copy(\\''+esc(r.code)+'\\')">'+esc(r.code)+'</span>' : '-') + '</td>'
    + '<td>' + esc(r.discount_value || '-') + '</td>'
    + '<td class="link-cell">' + (r.link ? '<a href="'+esc(r.link)+'" target="_blank">链接</a>' : '-') + '</td>'
    + '<td>' + esc(r.sender_domain || '-') + '</td>'
    + '<td>' + esc((r.subject||'').slice(0,30)) + '</td>'
    + '<td>' + esc(r.received_at) + '</td>'
    + '<td><button class="btn" onclick="del(\\'discounts\\','+r.id+')">🗑</button></td>'
    + '</tr>').join('');
}

async function del(type, id) {
  if (!confirm('确认删除?')) return;
  await fetch(ORIGIN + '/api/' + type + '/' + id, { method: 'DELETE', headers: { Authorization: AUTH } });
  if (type === 'codes') loadCodes(); else loadDiscounts();
}

loadCodes();
</script>
</body>
</html>`;
}
