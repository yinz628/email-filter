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
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn.danger { color: #cf222e; border-color: #cf222e; }
  .btn.danger:hover { background: #cf222e; color: #fff; }
  .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
  .toolbar .sel-info { color: #666; font-size: 13px; }
  .chk { width: 16px; height: 16px; cursor: pointer; }
  .pager { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 12px; flex-wrap: wrap; font-size: 13px; color: #666; }
  .pager .pg-info { margin: 0 4px; }
  .pager input.pg-input { width: 60px; padding: 4px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; text-align: center; }
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
    <div class="toolbar">
      <input type="checkbox" id="codes-select-all" class="chk" title="全选当前页" onchange="toggleAllCodes(this.checked)">
      <label for="codes-select-all" style="font-size:13px;color:#666">全选</label>
      <button id="codes-bulk-del" class="btn danger" onclick="bulkDeleteCodes()" disabled>批量删除</button>
      <span id="codes-sel-info" class="sel-info">未选中</span>
    </div>
    <table>
      <thead><tr><th></th><th>收件人</th><th>验证码</th><th>链接</th><th>发件人</th><th>主题</th><th>时间</th><th></th></tr></thead>
      <tbody id="codes-tbody"></tbody>
    </table>
  </div>
</div>

<div id="discounts-panel" class="hidden">
  <div class="card">
    <div class="filters">
      <input id="disc-recipient" placeholder="收件邮箱" onkeyup="if(event.key==='Enter')queryDiscounts()">
      <input id="disc-domain" placeholder="商户域名" onkeyup="if(event.key==='Enter')queryDiscounts()">
      <input id="disc-subject" placeholder="主题" onkeyup="if(event.key==='Enter')queryDiscounts()">
      <input id="disc-search" placeholder="搜索" onkeyup="if(event.key==='Enter')queryDiscounts()">
      <input id="disc-date-from" type="date" title="起始日期">
      <input id="disc-date-to" type="date" title="结束日期">
      <button class="btn" onclick="queryDiscounts()">查询</button>
    </div>
    <div class="toolbar">
      <input type="checkbox" id="disc-select-all" class="chk" title="全选当前页" onchange="toggleAllDiscounts(this.checked)">
      <label for="disc-select-all" style="font-size:13px;color:#666">全选</label>
      <button id="disc-bulk-del" class="btn danger" onclick="bulkDeleteDiscounts()" disabled>批量删除</button>
      <button class="btn" onclick="exportDiscounts()">导出 CSV</button>
      <span id="disc-sel-info" class="sel-info">未选中</span>
      <span class="sel-info" style="margin-left:auto">导出包含当前筛选条件下的全部记录</span>
    </div>
    <table>
      <thead><tr><th></th><th>收件人</th><th>折扣码</th><th>折扣值</th><th>链接</th><th>商户</th><th>主题</th><th>时间</th><th></th></tr></thead>
      <tbody id="disc-tbody"></tbody>
    </table>
    <div id="disc-pager" class="pager hidden"></div>
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

// Selection state factory — one instance per tab (codes / discounts).
// Tracks selected row ids (current page only) and keeps the "已选 N 条"
// info text + bulk-delete button in sync.
function makeSelectionUi(infoId, deleteBtnId, selectAllId, chkClass) {
  const selected = new Set();
  function refresh() {
    const n = selected.size;
    const info = document.getElementById(infoId);
    if (info) info.textContent = n ? '已选 ' + n + ' 条' : '未选中';
    const btn = document.getElementById(deleteBtnId);
    if (btn) btn.disabled = n === 0;
  }
  function toggle(id, checked) {
    if (checked) selected.add(id); else selected.delete(id);
    refresh();
  }
  function toggleAll(checked) {
    document.querySelectorAll(chkClass).forEach(el => {
      el.checked = checked;
      const id = Number(el.getAttribute('data-id'));
      if (checked) selected.add(id); else selected.delete(id);
    });
    refresh();
  }
  // Reset on each reload: clear ids + uncheck the "select all" box.
  function reset() {
    selected.clear();
    const selectAll = document.getElementById(selectAllId);
    if (selectAll) selectAll.checked = false;
    refresh();
  }
  return { selected, toggle, toggleAll, reset };
}

const codesSel = makeSelectionUi('codes-sel-info', 'codes-bulk-del', 'codes-select-all', '.codes-chk');
const discSel = makeSelectionUi('disc-sel-info', 'disc-bulk-del', 'disc-select-all', '.disc-chk');

// Thin wrappers — the inline onchange handlers in rendered rows call these.
function toggleCode(id, checked) { codesSel.toggle(id, checked); }
function toggleAllCodes(checked) { codesSel.toggleAll(checked); }
function toggleDisc(id, checked) { discSel.toggle(id, checked); }
function toggleAllDiscounts(checked) { discSel.toggleAll(checked); }

// Discount pagination state.
const DISC_PAGE_SIZE = 50;
let discPage = 1;
let discTotal = 0;

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
  codesSel.reset();
  if (!records.length) { tbody.innerHTML = '<tr><td colspan=8 class="empty">暂无记录</td></tr>'; return; }
  tbody.innerHTML = records.map(r => '<tr>'
    + '<td><input type="checkbox" class="chk codes-chk" data-id="'+r.id+'" onchange="toggleCode('+r.id+', this.checked)"></td>'
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
  const sub = encodeURIComponent(document.getElementById('disc-subject').value);
  const s = encodeURIComponent(document.getElementById('disc-search').value);
  const df = document.getElementById('disc-date-from').value;
  const dt = document.getElementById('disc-date-to').value;
  const offset = (discPage - 1) * DISC_PAGE_SIZE;
  let url = ORIGIN + '/api/discounts?limit=' + DISC_PAGE_SIZE + '&offset=' + offset;
  if (r) url += '&recipient=' + r;
  if (d) url += '&sender_domain=' + d;
  if (sub) url += '&subject=' + sub;
  if (s) url += '&search=' + s;
  if (df) url += '&date_from=' + encodeURIComponent(df + ' 00:00:00');
  if (dt) url += '&date_to=' + encodeURIComponent(dt + ' 23:59:59');
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const data = await res.json();
  const tbody = document.getElementById('disc-tbody');
  const records = data.records || [];
  discTotal = (data.pagination && data.pagination.total) || 0;
  discSel.reset();
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan=9 class="empty">暂无记录</td></tr>';
    renderDiscPager();
    return;
  }
  tbody.innerHTML = records.map(r => '<tr>'
    + '<td><input type="checkbox" class="chk disc-chk" data-id="'+r.id+'" onchange="toggleDisc('+r.id+', this.checked)"></td>'
    + '<td>' + esc(r.recipient) + '</td>'
    + '<td>' + (r.code ? '<span class="code-val" onclick="copy(\\''+esc(r.code)+'\\')">'+esc(r.code)+'</span>' : '-') + '</td>'
    + '<td>' + esc(r.discount_value || '-') + '</td>'
    + '<td class="link-cell">' + (r.link ? '<a href="'+esc(r.link)+'" target="_blank">链接</a>' : '-') + '</td>'
    + '<td>' + esc(r.sender_domain || '-') + '</td>'
    + '<td>' + esc((r.subject||'').slice(0,30)) + '</td>'
    + '<td>' + esc(r.received_at) + '</td>'
    + '<td><button class="btn" onclick="del(\\'discounts\\','+r.id+')">🗑</button></td>'
    + '</tr>').join('');
  renderDiscPager();
}

function renderDiscPager() {
  const pager = document.getElementById('disc-pager');
  if (!pager) return;
  const totalPages = Math.max(1, Math.ceil(discTotal / DISC_PAGE_SIZE));
  if (discTotal === 0) { pager.classList.add('hidden'); return; }
  pager.classList.remove('hidden');
  const from = (discPage - 1) * DISC_PAGE_SIZE + 1;
  const to = Math.min(discPage * DISC_PAGE_SIZE, discTotal);
  pager.innerHTML = ''
    + '<button class="btn" onclick="goDiscPage(1)" ' + (discPage <= 1 ? 'disabled' : '') + '>«</button>'
    + '<button class="btn" onclick="goDiscPage(' + (discPage - 1) + ')" ' + (discPage <= 1 ? 'disabled' : '') + '>上一页</button>'
    + '<span class="pg-info">第 <input class="pg-input" value="' + discPage + '" onkeyup="if(event.key===\\'Enter\\') discGoPageInput(this.value)"> / ' + totalPages + ' 页</span>'
    + '<button class="btn" onclick="goDiscPage(' + (discPage + 1) + ')" ' + (discPage >= totalPages ? 'disabled' : '') + '>下一页</button>'
    + '<button class="btn" onclick="goDiscPage(' + totalPages + ')" ' + (discPage >= totalPages ? 'disabled' : '') + '>»</button>'
    + '<span class="pg-info">' + from + '-' + to + ' / 共 ' + discTotal + ' 条</span>';
}

function goDiscPage(p) {
  const totalPages = Math.max(1, Math.ceil(discTotal / DISC_PAGE_SIZE));
  discPage = Math.min(Math.max(1, p), totalPages);
  loadDiscounts();
}

function discGoPageInput(v) {
  const n = parseInt(v, 10);
  if (!isNaN(n)) goDiscPage(n);
}

// Run a fresh query from page 1 (bound to the 查询 button + Enter in filters).
function queryDiscounts() {
  discPage = 1;
  loadDiscounts();
}

// Shared bulk-delete flow: confirm → POST selected ids → report → reload.
async function bulkDelete(path, label, selection, reload) {
  const ids = Array.from(selection.selected);
  if (!ids.length) return;
  if (!confirm('确认删除选中的 ' + ids.length + ' 条' + label + '？此操作不可撤销。')) return;
  const res = await fetch(ORIGIN + path, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert('批量删除失败: ' + (data.error || res.status)); return; }
  alert('已删除 ' + data.deleted + ' 条（请求 ' + data.requested + ' 条）');
  reload();
}

async function bulkDeleteCodes() {
  await bulkDelete('/api/codes/bulk-delete', '验证码', codesSel, loadCodes);
}

async function bulkDeleteDiscounts() {
  await bulkDelete('/api/discounts/bulk-delete', '折扣码', discSel, loadDiscounts);
}

async function exportDiscounts() {
  const r = encodeURIComponent(document.getElementById('disc-recipient').value);
  const d = encodeURIComponent(document.getElementById('disc-domain').value);
  const sub = encodeURIComponent(document.getElementById('disc-subject').value);
  const s = encodeURIComponent(document.getElementById('disc-search').value);
  const df = document.getElementById('disc-date-from').value;
  const dt = document.getElementById('disc-date-to').value;
  let url = ORIGIN + '/api/discounts/export?';
  const params = [];
  if (r) params.push('recipient=' + r);
  if (d) params.push('sender_domain=' + d);
  if (sub) params.push('subject=' + sub);
  if (s) params.push('search=' + s);
  if (df) params.push('date_from=' + encodeURIComponent(df + ' 00:00:00'));
  if (dt) params.push('date_to=' + encodeURIComponent(dt + ' 23:59:59'));
  url += params.join('&');
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  if (!res.ok) { alert('导出失败: ' + res.status); return; }
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  a.href = objUrl;
  a.download = 'discounts-' + today + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
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
