// Site Repair Log — static front end. Reads/writes the Sheet through the Apps Script
// Web App (Code.gs); falls back to localStorage when APPS_SCRIPT_URL is blank.

const LOCAL_KEY = 'site-repair-log-v1'; // all *.github.io sites share an origin, keep this unique
const PALETTE = ['#5b6bd6', '#2f9e6e', '#c9932e', '#2fa3b8', '#8c5bd6', '#d6693f', '#c2477a', '#6f8a2e', '#4a7fb0', '#9a6b4a'];
const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2, '': 3 };
const CLOSED = new Set(['Done', "Won't Do"]);

const connected = () => !!APPS_SCRIPT_URL;
const state = {
  sites: [], items: [], meta: META,
  syncedAt: null, syncing: false, error: null,
  filters: { q: '', site: '', status: 'open', type: '', priority: '', sort: 'priority' },
  showDone: {},
};

// ---------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------
async function apiGet(action) {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=${action}&t=${Date.now()}`);
  if (!res.ok) throw new Error('Request failed');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function apiPost(action, payload) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error('Request failed');
  const data = await res.json();
  if (data.error || data.ok === false) throw new Error(data.error || 'Sheet rejected the change');
  return data;
}

function saveLocal() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ sites: state.sites, items: state.items })); } catch {}
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)); } catch { return null; }
}

async function load({ quiet = false } = {}) {
  if (!connected()) {
    const local = loadLocal();
    state.sites = local?.sites || SEED_SITES.map(s => ({ ...s }));
    state.items = local?.items || SEED_ITEMS.map(i => ({ ...i }));
    render();
    return;
  }
  state.syncing = true; renderSync();
  try {
    const data = await apiGet('all');
    state.sites = data.sites;
    state.items = data.items;
    if (data.meta) state.meta = data.meta;
    state.syncedAt = new Date();
    state.error = null;
    saveLocal();
  } catch (err) {
    state.error = err.message;
    if (!state.items.length) {
      const local = loadLocal();
      state.sites = local?.sites || SEED_SITES;
      state.items = local?.items || SEED_ITEMS;
    }
    if (!quiet) toast("Couldn't reach the Sheet — showing the last saved copy");
  } finally {
    state.syncing = false;
  }
  render();
}

// Apply a change locally right away, then write it to the Sheet. If the write
// fails, reload from the Sheet so the page never drifts from the source of truth.
async function mutate(applyLocal, action, payload, okMsg) {
  applyLocal();
  saveLocal();
  render();
  if (!connected()) { if (okMsg) toast(okMsg); return null; }
  state.syncing = true; renderSync();
  try {
    const result = await apiPost(action, payload);
    state.syncedAt = new Date(); state.error = null;
    if (okMsg) toast(okMsg + ' · saved to Sheet');
    return result;
  } catch (err) {
    state.error = err.message;
    toast(`Sheet didn't save that (${err.message}) — reloading`);
    await load({ quiet: true });
    return null;
  } finally {
    state.syncing = false; renderSync();
  }
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------
const todayStr = () => new Date().toLocaleDateString('en-CA');
const newId = () => 'R' + Math.random().toString(36).slice(2, 9).toUpperCase();

function addItem(item) {
  const full = { id: newId(), details: '', type: 'Idea', priority: 'Medium', status: 'To Do', created: todayStr(), updated: todayStr(), ...item };
  return mutate(() => state.items.push(full), 'addItem', { item: full }, 'Added');
}

function updateItem(id, fields, msg = 'Updated') {
  return mutate(() => {
    const it = state.items.find(i => i.id === id);
    if (it) Object.assign(it, fields, { updated: todayStr() });
  }, 'updateItem', { id, fields }, msg);
}

function deleteItem(id) {
  return mutate(() => { state.items = state.items.filter(i => i.id !== id); }, 'deleteItem', { id }, 'Deleted');
}

function addSite(site) {
  const full = { url: '', notes: '', order: state.sites.length + 1, ...site };
  return mutate(() => state.sites.push(full), 'addSite', { site: full }, 'Site added');
}

function updateSite(name, fields) {
  return mutate(() => {
    const s = state.sites.find(x => x.name === name);
    if (!s) return;
    if (fields.name && fields.name !== name) state.items.forEach(i => { if (i.site === name) i.site = fields.name; });
    Object.assign(s, fields);
  }, 'updateSite', { name, fields }, 'Site saved');
}

function deleteSite(name, deleteItems) {
  return mutate(() => {
    state.sites = state.sites.filter(s => s.name !== name);
    if (deleteItems) state.items = state.items.filter(i => i.site !== name);
  }, 'deleteSite', { name, deleteItems }, 'Site deleted');
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const isOpen = i => !CLOSED.has(i.status);

function siteColor(name) {
  const idx = state.sites.findIndex(s => s.name === name);
  if (idx >= 0) return PALETTE[idx % PALETTE.length];
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function allSiteNames() {
  const names = state.sites.map(s => s.name);
  state.items.forEach(i => { if (i.site && !names.includes(i.site)) names.push(i.site); });
  return names;
}

function sortItems(list, mode = 'priority') {
  const statusRank = s => Math.max(0, state.meta.statuses.indexOf(s));
  return [...list].sort((a, b) => {
    if (mode === 'updated') return (b.updated || '').localeCompare(a.updated || '');
    if (mode === 'site') return a.site.localeCompare(b.site) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (mode === 'status') return statusRank(a.status) - statusRank(b.status);
    return (CLOSED.has(a.status) - CLOSED.has(b.status))
      || (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)
      || (a.status === 'In Progress' ? -1 : 0) - (b.status === 'In Progress' ? -1 : 0)
      || (b.updated || '').localeCompare(a.updated || '');
  });
}

function relTime(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const options = (list, sel, blank) =>
  (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  list.map(v => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

// ---------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------
function render() {
  renderSync();
  renderStats();
  renderQuickAdd();
  const [, view, arg] = location.hash.split('/');
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.dataset.view === (view || 'board')));
  if (view === 'site' && arg) renderSite(decodeURIComponent(arg));
  else if (view === 'list') renderList();
  else renderBoard();
  notifyRepairWorkroom();
}

function renderSync() {
  const pill = $('#syncPill');
  pill.className = 'sync-pill ' + (!connected() ? 'offline' : state.error ? 'error' : state.syncing ? 'busy' : 'ok');
  $('#syncText').textContent = !connected() ? 'Offline · this browser only'
    : state.syncing ? 'Syncing…'
    : state.error ? 'Sheet unreachable · retry'
    : `Synced with Sheet · ${relTime(state.syncedAt)}`;
}

function renderStats() {
  const open = state.items.filter(isOpen);
  const stat = (n, label, filter) => `<a class="stat" href="#/list" data-filter='${JSON.stringify(filter)}'><b>${n}</b><span>${label}</span></a>`;
  $('#stats').innerHTML =
    stat(open.length, 'Open', { status: 'open' }) +
    stat(open.filter(i => i.priority === 'High').length, 'High Priority', { status: 'open', priority: 'High' }) +
    stat(state.items.filter(i => i.status === 'In Progress').length, 'In Progress', { status: 'In Progress' }) +
    stat(state.items.filter(i => i.status === 'Done').length, 'Done', { status: 'Done' });
}

function renderQuickAdd() {
  const siteSel = $('#qaSite');
  const current = siteSel.value || (location.hash.startsWith('#/site/') ? decodeURIComponent(location.hash.split('/')[2]) : '');
  siteSel.innerHTML = options(allSiteNames(), current, 'Site…');
  const typeSel = $('#qaType');
  if (!typeSel.options.length) typeSel.innerHTML = options(state.meta.types, 'Idea');
}

function itemRow(i, { showSite = false } = {}) {
  const done = CLOSED.has(i.status);
  return `
    <li class="item ${done ? 'is-done' : ''}" data-id="${esc(i.id)}">
      <button class="check" data-act="toggle" aria-label="${done ? 'Reopen' : 'Mark done'}" title="${done ? 'Reopen' : 'Mark done'}">${done ? '✓' : ''}</button>
      <div class="item-body" data-act="edit">
        <div class="item-title">${esc(i.title)}</div>
        ${i.details ? `<div class="item-details">${esc(i.details)}</div>` : ''}
        <div class="item-meta">
          ${showSite ? `<span class="site-tag" style="--c:${siteColor(i.site)}">${esc(i.site || 'No site')}</span>` : ''}
          ${i.type ? `<span class="tag type-${slug(i.type)}">${esc(i.type)}</span>` : ''}
          ${i.priority === 'High' ? '<span class="tag prio-high">High</span>' : i.priority === 'Low' ? '<span class="tag prio-low">Low</span>' : ''}
          ${i.status !== 'To Do' && !done ? `<span class="tag status-${slug(i.status)}">${esc(i.status)}</span>` : ''}
          ${i.status === "Won't Do" ? `<span class="tag">Won't Do</span>` : ''}
        </div>
      </div>
    </li>`;
}

function renderBoard() {
  const cards = allSiteNames().map(name => {
    const site = state.sites.find(s => s.name === name) || { name, url: '' };
    const items = state.items.filter(i => i.site === name);
    const open = sortItems(items.filter(isOpen));
    const closed = items.filter(i => !isOpen(i));
    const showDone = state.showDone[name];
    return `
      <article class="site-card card" style="--c:${siteColor(name)}">
        <header>
          <a class="site-name" href="#/site/${encodeURIComponent(name)}">${esc(name)}</a>
          ${site.url ? `<a class="site-url" href="${esc(site.url)}" target="_blank" rel="noopener" title="Open site">↗</a>` : ''}
          <span class="count">${open.length}</span>
        </header>
        <ul class="items">${open.map(i => itemRow(i)).join('') || '<li class="empty">Nothing open</li>'}
          ${showDone ? closed.map(i => itemRow(i)).join('') : ''}</ul>
        <footer>
          <button class="link" data-act="inline-add" data-site="${esc(name)}">+ Add</button>
          ${closed.length ? `<button class="link muted" data-act="toggle-done" data-site="${esc(name)}">${showDone ? 'Hide' : 'Show'} done (${closed.length})</button>` : ''}
        </footer>
      </article>`;
  }).join('');
  $('#view').innerHTML = `<div class="board">${cards}
    <button class="site-card card new-site" data-act="new-site"><span>+</span>New Site</button></div>`;
}

function renderList() {
  const f = state.filters;
  const q = f.q.trim().toLowerCase();
  const list = sortItems(state.items.filter(i =>
    (!f.site || i.site === f.site) &&
    (!f.type || i.type === f.type) &&
    (!f.priority || i.priority === f.priority) &&
    (f.status === '' ? true : f.status === 'open' ? isOpen(i) : i.status === f.status) &&
    (!q || `${i.title} ${i.details} ${i.site}`.toLowerCase().includes(q))
  ), f.sort);

  $('#view').innerHTML = `
    <div class="filters">
      <input type="search" id="fQ" placeholder="Search" value="${esc(f.q)}">
      <select id="fSite">${options(allSiteNames(), f.site, 'All sites')}</select>
      <select id="fStatus"><option value="open"${f.status === 'open' ? ' selected' : ''}>Open</option>${options(state.meta.statuses, f.status, 'Any status')}</select>
      <select id="fType">${options(state.meta.types, f.type, 'Any type')}</select>
      <select id="fPriority">${options(state.meta.priorities, f.priority, 'Any priority')}</select>
      <select id="fSort">${[['priority', 'Sort: Priority'], ['updated', 'Sort: Recently Updated'], ['site', 'Sort: Site'], ['status', 'Sort: Status']]
        .map(([v, l]) => `<option value="${v}"${f.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <p class="result-count">${list.length} item${list.length === 1 ? '' : 's'}</p>
    <ul class="items card list-card">${list.map(i => itemRow(i, { showSite: true })).join('') || '<li class="empty">No items match</li>'}</ul>`;

  const bind = (id, key, ev = 'change') => $(id).addEventListener(ev, e => {
    f[key] = e.target.value;
    if (key === 'q') { clearTimeout(bind.t); bind.t = setTimeout(() => { renderList(); const el = $('#fQ'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 180); }
    else renderList();
  });
  bind('#fQ', 'q', 'input'); bind('#fSite', 'site'); bind('#fStatus', 'status');
  bind('#fType', 'type'); bind('#fPriority', 'priority'); bind('#fSort', 'sort');
}

function renderSite(name) {
  const site = state.sites.find(s => s.name === name);
  const items = state.items.filter(i => i.site === name);
  if (!site && !items.length) { location.hash = '#/board'; return; }
  const cols = state.meta.statuses.map(st => {
    const list = sortItems(items.filter(i => i.status === st));
    return `<div class="status-col"><h3>${esc(st)} <span>${list.length}</span></h3>
      <ul class="items">${list.map(i => itemRow(i)).join('') || '<li class="empty">—</li>'}</ul></div>`;
  }).join('');
  $('#view').innerHTML = `
    <a class="back" href="#/board">← All sites</a>
    <div class="site-head card" style="--c:${siteColor(name)}">
      <div>
        <h2>${esc(name)}</h2>
        ${site?.url ? `<a class="site-link" href="${esc(site.url)}" target="_blank" rel="noopener">${esc(site.url.replace(/^https?:\/\//, ''))} ↗</a>`
          : '<span class="muted">No link yet</span>'}
        ${site?.notes ? `<p class="site-notes">${esc(site.notes)}</p>` : ''}
      </div>
      <div class="site-head-actions">
        <button class="btn" data-act="inline-add" data-site="${esc(name)}">+ Add Item</button>
        ${site ? `<button class="btn ghost" data-act="edit-site" data-site="${esc(name)}">Edit Site</button>` : ''}
      </div>
    </div>
    <div class="status-cols">${cols}</div>`;
}

// ---------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------
function openModal(html, onSubmit) {
  const dlg = $('#modal'), form = $('#modalForm');
  form.innerHTML = html;
  form.onsubmit = e => {
    const btn = e.submitter;
    if (btn?.value === 'cancel') return;
    e.preventDefault();
    if (onSubmit(new FormData(form), btn?.value) !== false) dlg.close();
  };
  dlg.showModal();
  form.querySelector('[autofocus]')?.focus();
}

function itemModal(item, presetSite) {
  const isNew = !item;
  const i = item || { site: presetSite || '', title: '', details: '', type: 'Idea', priority: 'Medium', status: 'To Do' };
  openModal(`
    <h2>${isNew ? 'New Item' : 'Edit Item'}</h2>
    <label>Item<textarea name="title" rows="2" required autofocus>${esc(i.title)}</textarea></label>
    <label>Details / flow notes<textarea name="details" rows="4" placeholder="Steps, what it should do instead, links…">${esc(i.details)}</textarea></label>
    <div class="grid2">
      <label>Site<select name="site" required>${options(allSiteNames(), i.site, 'Choose…')}</select></label>
      <label>Type<select name="type">${options(state.meta.types, i.type)}</select></label>
      <label>Priority<select name="priority">${options(state.meta.priorities, i.priority)}</select></label>
      <label>Status<select name="status">${options(state.meta.statuses, i.status)}</select></label>
    </div>
    ${!isNew && i.created ? `<p class="muted small">Logged ${esc(i.created)}${i.updated && i.updated !== i.created ? ` · updated ${esc(i.updated)}` : ''} · ${esc(i.id)}</p>` : ''}
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}
      <span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="save">${isNew ? 'Add' : 'Save'}</button>
    </div>`, (fd, action) => {
    if (action === 'delete') {
      if (!confirm('Delete this item? It will also be removed from the Sheet.')) return false;
      deleteItem(i.id); return;
    }
    const fields = Object.fromEntries(['title', 'details', 'site', 'type', 'priority', 'status'].map(k => [k, String(fd.get(k) || '').trim()]));
    if (isNew) addItem(fields);
    else {
      const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v !== (i[k] || '')));
      if (Object.keys(changed).length) updateItem(i.id, changed, 'Saved');
    }
  });
}

function siteModal(site) {
  const isNew = !site;
  const s = site || { name: '', url: '', notes: '' };
  const count = isNew ? 0 : state.items.filter(i => i.site === s.name).length;
  openModal(`
    <h2>${isNew ? 'New Site' : 'Edit Site'}</h2>
    <label>Name<input name="name" value="${esc(s.name)}" required autofocus></label>
    <label>Link<input name="url" type="url" value="${esc(s.url)}" placeholder="https://…"></label>
    <label>Notes<textarea name="notes" rows="3">${esc(s.notes)}</textarea></label>
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete Site</button>'}
      <span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn primary" value="save">${isNew ? 'Add Site' : 'Save'}</button>
    </div>`, (fd, action) => {
    if (action === 'delete') {
      if (!confirm(`Delete "${s.name}" from the Sites tab?`)) return false;
      const delItems = count > 0 && confirm(`Also delete its ${count} logged item${count === 1 ? '' : 's'}? (Cancel keeps them.)`);
      deleteSite(s.name, delItems);
      location.hash = '#/board';
      return;
    }
    const fields = { name: String(fd.get('name')).trim(), url: String(fd.get('url')).trim(), notes: String(fd.get('notes')).trim() };
    if (isNew) {
      if (state.sites.some(x => x.name.toLowerCase() === fields.name.toLowerCase())) { toast('That site already exists'); return false; }
      addSite(fields);
    } else {
      updateSite(s.name, fields);
      if (fields.name !== s.name && location.hash.startsWith('#/site/')) location.hash = '#/site/' + encodeURIComponent(fields.name);
    }
  });
}

// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------
document.addEventListener('click', e => {
  const stat = e.target.closest('.stat');
  if (stat) { Object.assign(state.filters, { site: '', type: '', priority: '', q: '' }, JSON.parse(stat.dataset.filter)); if (location.hash === '#/list') render(); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const li = el.closest('.item');
  const item = li && state.items.find(i => i.id === li.dataset.id);
  switch (el.dataset.act) {
    case 'toggle': updateItem(item.id, { status: CLOSED.has(item.status) ? 'To Do' : 'Done' }, CLOSED.has(item.status) ? 'Reopened' : 'Marked done'); break;
    case 'edit': itemModal(item); break;
    case 'inline-add': itemModal(null, el.dataset.site); break;
    case 'toggle-done': state.showDone[el.dataset.site] = !state.showDone[el.dataset.site]; render(); break;
    case 'new-site': siteModal(null); break;
    case 'edit-site': siteModal(state.sites.find(s => s.name === el.dataset.site)); break;
  }
});

$('#quickAdd').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#qaTitle').value.trim();
  const site = $('#qaSite').value;
  if (!title || !site) return;
  addItem({ site, title, type: $('#qaType').value });
  $('#qaTitle').value = '';
  $('#qaTitle').focus();
});

$('#syncPill').addEventListener('click', () => load());
$('#sheetLink').href = SHEET_URL;
window.addEventListener('hashchange', render);

// Pick up edits made directly in the Sheet: on focus, and every 60s while visible.
let lastPull = Date.now();
function pullIfIdle() {
  if (!connected() || $('#modal').open || state.syncing || document.hidden) return;
  if (Date.now() - lastPull < 15000) return;
  lastPull = Date.now();
  load({ quiet: true });
}
window.addEventListener('focus', pullIfIdle);
document.addEventListener('visibilitychange', pullIfIdle);
setInterval(() => { renderSync(); if (Date.now() - lastPull >= 60000) pullIfIdle(); }, 20000);


// ---------------------------------------------------------------------
// Life Hub bridge (source id `repair`)
// Stars live in localStorage; complete marks Done via updateItem.
// ---------------------------------------------------------------------
const WORKROOM_ORIGIN = 'https://frontier-work-room.randymcfarland1227.workers.dev';
const REPAIR_ORIGIN_URL = 'https://randymcfarland1227-wq.github.io/site-repair-log/#/board';
const REPAIR_STAR_KEY = 'site-repair-log.lifeHubStars';

function readRepairStars() {
  try { return new Set(JSON.parse(localStorage.getItem(REPAIR_STAR_KEY) || '[]')); } catch { return new Set(); }
}
function writeRepairStars(set) {
  try { localStorage.setItem(REPAIR_STAR_KEY, JSON.stringify([...set])); } catch {}
}
function isRepairStarred(id) { return readRepairStars().has(String(id)); }
function setRepairStarred(id, starred) {
  const set = readRepairStars();
  if (starred) set.add(String(id)); else set.delete(String(id));
  writeRepairStars(set);
}

function repairWorkroomSnapshot() {
  const open = state.items.filter(isOpen);
  const inProgress = state.items.filter(i => i.status === 'In Progress');
  const done = state.items.filter(i => i.status === 'Done');
  const tasks = open.map(i => ({
    id: String(i.id),
    title: i.title,
    detail: [i.site, i.type, i.details].filter(Boolean).join(' · ') || undefined,
    status: i.status === 'In Progress' ? 'open' : (i.status === 'Idea' ? 'open' : 'open'),
    starred: isRepairStarred(i.id),
    originUrl: REPAIR_ORIGIN_URL,
  }));
  const featured = open.filter(i => isRepairStarred(i.id)).map(i => ({
    id: String(i.id),
    title: i.title,
    detail: i.details || i.type || '',
    meta: [i.site, i.priority].filter(Boolean).join(' · '),
    originUrl: REPAIR_ORIGIN_URL,
    completable: true,
  }));
  return {
    source: 'repair',
    metrics: { open: open.length, inProgress: inProgress.length, done: done.length },
    featured,
    tasks,
    refreshedAt: (state.syncedAt && state.syncedAt.toISOString) ? state.syncedAt.toISOString() : new Date().toISOString(),
  };
}

function notifyRepairWorkroom() {
  const message = { type: 'randys-workroom:snapshot', payload: repairWorkroomSnapshot() };
  try { if (window.opener && !window.opener.closed) window.opener.postMessage(message, WORKROOM_ORIGIN); } catch {}
  try { if (window.parent !== window) window.parent.postMessage(message, WORKROOM_ORIGIN); } catch {}
}

async function completeRepairWorkroomItem(id) {
  const item = state.items.find(i => String(i.id) === String(id));
  if (!item) return;
  if (!CLOSED.has(item.status)) {
    await updateItem(item.id, { status: 'Done' }, 'Marked done');
  }
  setRepairStarred(id, false);
  notifyRepairWorkroom();
}

function starRepairWorkroomItem(id, starred) {
  const next = typeof starred === 'boolean' ? starred : !isRepairStarred(id);
  setRepairStarred(id, next);
  render();
}

window.addEventListener('message', event => {
  if (event.origin !== WORKROOM_ORIGIN) return;
  const type = event.data?.type;
  if (type === 'randys-workroom:request') {
    event.source?.postMessage({ type: 'randys-workroom:snapshot', payload: repairWorkroomSnapshot() }, event.origin);
    return;
  }
  const payload = event.data?.payload || {};
  if (payload.source && payload.source !== 'repair') return;
  if (type === 'randys-workroom:complete') completeRepairWorkroomItem(payload.id);
  if (type === 'randys-workroom:star') starRepairWorkroomItem(payload.id, payload.starred);
});

if (!location.hash) history.replaceState(null, '', '#/board');
load();
