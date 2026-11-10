'use strict';
/* App: state, rendering, interactions, panels, import and export. */

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE_KEY = 'gantt:v1';

const FONTS = ['Inter', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Poppins', 'Montserrat', 'Work Sans', 'IBM Plex Sans', 'Space Grotesk', 'Lora', 'Source Serif 4', 'Playfair Display', 'Roboto Slab', 'JetBrains Mono'];
const THEMES = [
  { name: 'Indigo & pink', p: '#4f46e5', s: '#ec4899', bg: '#ffffff' },
  { name: 'Blue & teal', p: '#2563eb', s: '#14b8a6', bg: '#ffffff' },
  { name: 'Emerald', p: '#059669', s: null, bg: '#ffffff' },
  { name: 'Orange & rose', p: '#f97316', s: '#e11d48', bg: '#ffffff' },
  { name: 'Slate', p: '#334155', s: null, bg: '#ffffff' },
  { name: 'Violet & sky', p: '#7c3aed', s: '#0ea5e9', bg: '#ffffff' },
  { name: 'Navy & gold', p: '#1e3a5f', s: '#c9971c', bg: '#fbf7ef' },
  { name: 'Midnight', p: '#818cf8', s: '#34d399', bg: '#0f172a' },
];

// ---------------------------------------------------------------- state
function sampleState() {
  const b = mondayOf(todayDay()) - 21;
  const R = (level, name, s, e, progress, assignee, type) => newRow({ level, name, start: b + s, end: b + (e == null ? s : e), progress: progress || 0, assignee: assignee || '', type: type || 'task' });
  const rows = [
    R(0, 'Discovery'),
    R(1, 'Kickoff', 0, null, 0, '', 'milestone'),
    R(1, 'Stakeholder interviews', 0, 9, 100, 'Priya Shah'),
    R(1, 'Audit & research', 2, 11, 100, 'Sam Ortiz'),
    R(0, 'Design'),
    R(1, 'UX & wireframes'),
    R(2, 'Site map & flows', 14, 18, 100, 'Lena Berg'),
    R(2, 'Wireframes', 21, 32, 40, 'Lena Berg'),
    R(1, 'Visual design', 28, 39, 10, 'Marco Diaz'),
    R(1, 'Design sign-off', 39, null, 0, '', 'milestone'),
    R(0, 'Build'),
    R(1, 'Front-end'),
    R(2, 'Component library', 42, 53, 0, 'Alex Kim'),
    R(2, 'Page templates', 49, 60, 0, 'Alex Kim'),
    R(1, 'CMS & integrations', 42, 56, 0, 'Jo Lin'),
    R(1, 'Content migration', 56, 65, 0, 'Sam Ortiz'),
    R(1, 'Client demo', 60, null, 0, '', 'milestone'),
    R(0, 'Launch'),
    R(1, 'QA & accessibility', 63, 71, 0, 'Priya Shah'),
    R(1, 'Training & handover', 70, 74, 0, 'Jo Lin'),
    R(1, 'Go-live', 74, null, 0, '', 'milestone'),
  ];
  const id = n => rows.find(r => r.name === n).id;
  const dep = (a, b) => rows.find(r => r.name === b).deps.push(id(a));
  dep('Audit & research', 'Site map & flows'); dep('Site map & flows', 'Wireframes'); dep('Visual design', 'Design sign-off');
  dep('Design sign-off', 'Component library'); dep('QA & accessibility', 'Go-live');
  rows.forEach(r => { if (!isFinite(r.start)) { r.start = b; r.end = b + 4; } });
  return { settings: Object.assign({}, DEFAULT_SETTINGS, { title: 'Website redesign — project plan' }), rows };
}
function blankState(settings) {
  const S = Object.assign({}, settings || DEFAULT_SETTINGS, { title: 'Project plan', todayDate: null });
  const s = S.rangeMode === 'fixed' && S.rangeStart != null ? S.rangeStart : mondayOf(todayDay());
  return {
    settings: S,
    rows: [0, 1, 2].map(i => newRow({ level: 0, name: 'Task ' + (i + 1), start: s + i * 7, end: s + i * 7 + 4 })),
  };
}
function sanitize(st) {
  if (!st || !Array.isArray(st.rows)) return null;
  st.settings = Object.assign({}, DEFAULT_SETTINGS, st.settings || {});
  const old = st.settings.labels; // earlier versions had one combined setting
  if (old) { st.settings.taskLabels = old === 'left' ? 'left' : 'bars'; st.settings.areaLabels = old === 'lanes' ? 'side' : 'row'; delete st.settings.labels; }
  st.rows = st.rows.filter(r => r && typeof r === 'object').map(r => {
    const row = newRow(r);
    row.start = Number.isFinite(+row.start) ? Math.round(+row.start) : todayDay();
    row.end = Number.isFinite(+row.end) ? Math.max(row.start, Math.round(+row.end)) : row.start;
    row.progress = clamp(+row.progress || 0, 0, 100);
    row.name = String(row.name || ''); row.assignee = String(row.assignee || '');
    row.deps = Array.isArray(row.deps) ? row.deps.map(String) : [];
    row.id = String(row.id);
    row.type = row.type === 'milestone' ? 'milestone' : 'task';
    return row;
  });
  normalizeLevels(st.rows);
  return st;
}
function loadState() {
  try { return sanitize(JSON.parse(localStorage.getItem(STORE_KEY))); } catch (e) { return null; }
}
let state = loadState() || sampleState();
let sel = null;
let scene = null;
let drag = null;
const undoStack = [], redoStack = [];
syncParents();
let lastSnap = JSON.stringify(state);
let commitTimer = null;

function save() { try { localStorage.setItem(STORE_KEY, lastSnap); } catch (e) { /* storage unavailable */ } }
/** areas keep the span of what is inside them, so they have sensible dates if they later become plain tasks */
function syncParents() {
  derive(state.rows).forEach(n => { if (n.hasKids && isFinite(n.start)) { n.row.start = n.start; n.row.end = n.end; } });
}
function commit() {
  clearTimeout(commitTimer);
  syncParents();
  const s = JSON.stringify(state);
  if (s === lastSnap) return;
  undoStack.push(lastSnap);
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
  lastSnap = s;
  save(); syncUndo();
}
function commitSoon() { clearTimeout(commitTimer); commitTimer = setTimeout(commit, 600); }
function timeTravel(from, to) {
  commit();
  if (!from.length) return;
  to.push(lastSnap);
  lastSnap = from.pop();
  state = JSON.parse(lastSnap);
  if (sel && !state.rows.some(r => r.id === sel)) sel = null;
  save(); syncUndo(); ensureFont(); refresh();
}
function syncUndo() { $('#btn-undo').disabled = !undoStack.length; $('#btn-redo').disabled = !redoStack.length; }

// ---------------------------------------------------------------- rendering
const svg = $('#chart');
const n2 = v => Math.round(v * 100) / 100;

let clipSeq = 0;
function sceneToSvg(sc, interactive) {
  let out = '';
  clipSeq = 0;
  for (const it of sc.items) {
    if (!interactive && (it.ui || it.hit)) continue;
    if (it.t === 'rect') {
      if (it.hit) out += `<rect x="${n2(it.x)}" y="${n2(it.y)}" width="${n2(Math.max(0, it.w))}" height="${n2(it.h)}" data-role="${it.role}"${it.id ? ` data-id="${esc(it.id)}"` : ''}${it.id && it.id === sel ? ' class="touchlock"' : ''}/>`;
      else out += `<rect x="${n2(it.x)}" y="${n2(it.y)}" width="${n2(Math.max(0, it.w))}" height="${n2(it.h)}"${it.r ? ` rx="${n2(Math.min(it.r, it.w / 2, it.h / 2))}"` : ''} fill="${it.fill}"${it.opacity != null ? ` opacity="${it.opacity}"` : ''}${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw || 1}"` : ''}/>`;
    } else if (it.t === 'line') {
      out += `<line x1="${n2(it.x1)}" y1="${n2(it.y1)}" x2="${n2(it.x2)}" y2="${n2(it.y2)}" stroke="${it.stroke}" stroke-width="${it.sw}"${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}/>`;
    } else if (it.t === 'text') {
      const tx = fill => `<text x="${n2(it.x)}" y="${n2(it.y)}" font-size="${it.size}" font-weight="${it.weight}" fill="${fill}" text-anchor="${it.anchor}" dominant-baseline="central">${esc(it.text)}</text>`;
      if (it.split == null) out += tx(it.fill);
      else {
        const id = 'c' + (clipSeq++), y = n2(it.y - it.size), h = it.size * 2;
        out += `<clipPath id="${id}a"><rect x="0" y="${y}" width="${n2(it.split)}" height="${h}"/></clipPath><clipPath id="${id}b"><rect x="${n2(it.split)}" y="${y}" width="${sc.w}" height="${h}"/></clipPath><g clip-path="url(#${id}a)">${tx(it.fill)}</g><g clip-path="url(#${id}b)">${tx(it.fill2)}</g>`;
      }
    } else if (it.t === 'diamond') {
      const { cx, cy, r } = it;
      out += `<polygon points="${n2(cx)},${n2(cy - r)} ${n2(cx + r)},${n2(cy)} ${n2(cx)},${n2(cy + r)} ${n2(cx - r)},${n2(cy)}" fill="${it.fill}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="1.5"` : ''} stroke-linejoin="round"/>`;
    } else if (it.t === 'poly') {
      const pts = it.pts.map(p => p.slice());
      const [ex, ey] = pts[pts.length - 1];
      if (it.arrow) pts[pts.length - 1][0] -= 5;
      out += `<polyline points="${pts.map(p => n2(p[0]) + ',' + n2(p[1])).join(' ')}" fill="none" stroke="${it.stroke}" stroke-width="${it.sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (it.arrow) out += `<polygon points="${n2(ex)},${n2(ey)} ${n2(ex - 7)},${n2(ey - 4)} ${n2(ex - 7)},${n2(ey + 4)}" fill="${it.stroke}"/>`;
    }
  }
  return out;
}

function drawScene(sc, scale) {
  const c = document.createElement('canvas');
  c.width = Math.round(sc.w * scale); c.height = Math.round(sc.h * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const rr = (x, y, w, h, r) => {
    r = Math.min(r || 0, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  for (const it of sc.items) {
    if (it.ui || it.hit) continue;
    g.setLineDash([]);
    if (it.t === 'rect') {
      if (it.w <= 0) continue;
      rr(it.x, it.y, it.w, it.h, it.r);
      g.fillStyle = it.fill; g.fill();
      if (it.stroke) { g.strokeStyle = it.stroke; g.lineWidth = it.sw || 1; g.stroke(); }
    } else if (it.t === 'line') {
      g.beginPath(); g.moveTo(it.x1, it.y1); g.lineTo(it.x2, it.y2);
      g.strokeStyle = it.stroke; g.lineWidth = it.sw; if (it.dash) g.setLineDash(it.dash); g.stroke();
    } else if (it.t === 'text') {
      g.font = `${it.weight} ${it.size}px "${sc.font}", system-ui, sans-serif`;
      g.textAlign = it.anchor === 'middle' ? 'center' : it.anchor === 'end' ? 'right' : 'left';
      g.textBaseline = 'middle';
      const ty = it.y + it.size * 0.04;
      if (it.split == null) { g.fillStyle = it.fill; g.fillText(it.text, it.x, ty); }
      else [[0, it.split, it.fill], [it.split, sc.w, it.fill2]].forEach(([a, b, fill]) => {
        g.save(); g.beginPath(); g.rect(a, it.y - it.size, b - a, it.size * 2); g.clip();
        g.fillStyle = fill; g.fillText(it.text, it.x, ty); g.restore();
      });
    } else if (it.t === 'diamond') {
      const { cx, cy, r } = it;
      g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); g.closePath();
      g.fillStyle = it.fill; g.fill();
      if (it.stroke) { g.strokeStyle = it.stroke; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke(); }
    } else if (it.t === 'poly') {
      const pts = it.pts.map(p => p.slice());
      const [ex, ey] = pts[pts.length - 1];
      if (it.arrow) pts[pts.length - 1][0] -= 5;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.strokeStyle = it.stroke; g.lineWidth = it.sw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
      if (it.arrow) { g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - 7, ey - 4); g.lineTo(ex - 7, ey + 4); g.closePath(); g.fillStyle = it.stroke; g.fill(); }
    }
  }
  return c;
}

function renderChart() {
  const o = { sel };
  if (drag && drag.range) o.range = drag.range;
  if (drag && drag.dropY != null) { o.dropY = drag.dropY; o.dropLevel = drag.dropLevel; }
  scene = buildScene(state, o);
  svg.setAttribute('viewBox', `0 0 ${scene.w} ${scene.h}`);
  svg.setAttribute('font-family', `'${scene.font}', system-ui, sans-serif`);
  svg.innerHTML = sceneToSvg(scene, true);
  const wrap = $('#canvas-wrap');
  wrap.classList.toggle('transparent', scene.transparent);
  wrap.classList.toggle('dark', scene.transparent && scene.lightText);
  applyZoom();
}
function refresh() { renderChart(); renderOutline(); syncDesign(); syncPop(); syncAddNote(); }
function syncAddNote() {
  const r = sel && state.rows[rowIndex(sel)];
  $('#chart-add-note').textContent = r ? `Adds after “${r.name || 'Untitled'}”` : state.rows.length ? 'Adds at the end — select a row to add after it' : '';
}

// ---------------------------------------------------------------- fonts
let fontToken = 0;
function ensureFont() {
  const f = state.settings.font;
  let link = $('#chart-font');
  if (!link) { link = document.createElement('link'); link.id = 'chart-font'; link.rel = 'stylesheet'; document.head.appendChild(link); }
  const href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;500;600;700&display=swap';
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  const token = ++fontToken;
  const load = () => Promise.all([500, 700].map(w => document.fonts.load(`${w} 14px "${f}"`))).then(() => { if (token === fontToken) renderChart(); }).catch(() => {});
  link.addEventListener('load', load, { once: true });
  load();
}
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { if (!drag) renderChart(); });

// ---------------------------------------------------------------- row operations
const rowIndex = id => state.rows.findIndex(r => r.id === id);
const nextWorkday = d => (dow(d) >= 5 ? d + (7 - dow(d)) : d);

function select(id, opts) {
  if (sel === id) return;
  sel = id;
  if (pop && pop.kind === 'row' && pop.id !== id) closePop();
  renderChart(); renderOutline(); syncAddNote();
  if (id && !(opts && opts.quiet)) { const el = $(`.orow[data-id="${id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
}
function focusName(id, all) {
  const inp = $(`.orow[data-id="${id}"] .nm`);
  if (!inp) return;
  inp.focus({ preventScroll: false });
  if (all) inp.select();
}
/** the level a block starting at row i would take if dropped before row k while asking for level `want` */
function dropLevelFor(i, k, want) {
  const rows = state.rows, j = blockEnd(rows, i);
  const prev = k >= i && k <= j ? rows[i - 1] : rows[k - 1];
  return clamp(want, 0, prev ? Math.min(2, prev.level + 1) : 0);
}
/** move a row and everything inside it; changing its level re-levels its contents (area -> task -> subtask) */
function moveBlock(i, k, want) {
  const rows = state.rows, j = blockEnd(rows, i);
  const level = dropLevelFor(i, k, want == null ? rows[i].level : want);
  const stay = k >= i && k <= j;
  if (stay && level === rows[i].level) return false;
  const block = rows.splice(i, j - i);
  const at = stay ? i : k > i ? k - (j - i) : k;
  const delta = level - block[0].level;
  block.forEach(r => { r.level = clamp(r.level + delta, 0, 2); });
  rows.splice(at, 0, ...block);
  normalizeLevels(rows);
  return true;
}
function shiftLevel(id, d) {
  const rows = state.rows, i = rowIndex(id);
  if (i < 0) return;
  if (d > 0 && (i === 0 || rows[i].level >= 2 || rows[i - 1].level < rows[i].level)) return;
  if (d < 0 && rows[i].level === 0) return;
  const j = blockEnd(rows, i);
  for (let k = i; k < j; k++) rows[k].level = clamp(rows[k].level + d, 0, 2);
  normalizeLevels(rows);
  commit(); refresh();
}
function deleteRow(id) {
  const rows = state.rows, i = rowIndex(id);
  if (i < 0) return;
  const gone = rows.splice(i, blockEnd(rows, i) - i).map(r => r.id);
  rows.forEach(r => { r.deps = r.deps.filter(d => !gone.includes(d)); });
  normalizeLevels(rows);
  sel = rows.length ? rows[Math.min(i, rows.length - 1)].id : null;
  commit(); refresh();
}
function addRow(kind, afterId, asSibling, onChart) {
  const show = id => (onChart ? editOnChart(id) : focusName(id, true));
  const rows = state.rows;
  const info = derive(rows);
  let i = afterId ? rowIndex(afterId) : -1;
  let at, level, ref;
  if (kind === 'area') {
    ref = info.length ? Math.max(...info.map(n => n.end)) : mondayOf(todayDay()) - 1;
    const s = nextWorkday(ref + 1);
    const area = newRow({ level: 0, name: 'New area' });
    rows.push(area, newRow({ level: 1, name: 'New task', start: s, end: s + 4 }));
    sel = area.id; commit(); refresh(); show(area.id);
    return;
  }
  if (i < 0) { at = rows.length; ref = info.length ? info[info.length - 1] : null; level = ref ? Math.min(ref.level, 1) : 0; }
  else {
    const n = info[i];
    ref = n;
    if (n.hasKids && (n.level === 0 || !asSibling)) { at = blockEnd(rows, i); level = n.level + 1; ref = info[at - 1]; }
    else { at = blockEnd(rows, i); level = n.level; }
  }
  const S0 = state.settings;
  const emptyStart = S0.rangeMode === 'fixed' && S0.rangeStart != null ? S0.rangeStart : mondayOf(todayDay());
  const row = newRow({ level, name: '', type: kind === 'milestone' ? 'milestone' : 'task' });
  if (kind === 'milestone') { row.start = row.end = ref ? ref.end : emptyStart; row.name = 'Milestone'; }
  else { row.start = ref ? nextWorkday(ref.end + 1) : emptyStart; row.end = row.start + 4; row.name = ''; }
  rows.splice(at, 0, row);
  normalizeLevels(rows);
  sel = row.id; commit(); refresh(); show(row.id);
}
/** after adding from the chart, name the new row right where it appeared */
function editOnChart(id) {
  const label = $(`#chart [data-role="row"][data-id="${id}"]`), bar = $(`#chart [data-role="move"][data-id="${id}"]`);
  const el = label || bar;
  if (!el) return;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const rect = el.getBoundingClientRect();
  if (label) editRowName(id, rect);
  else { openPop('row', rect, id); const inp = $('#pop-name'); if (inp) { inp.focus(); inp.select(); } }
}
function duplicateRow(id) {
  const rows = state.rows, i = rowIndex(id);
  if (i < 0) return;
  const j = blockEnd(rows, i);
  const copy = rows.slice(i, j).map(r => Object.assign({}, r, { id: uid(), deps: r.deps.slice() }));
  rows.splice(j, 0, ...copy);
  sel = copy[0].id; commit(); refresh();
}

// ---------------------------------------------------------------- outline panel
const outline = $('#outline');
function fmtRange(n) {
  if (n.milestone) return '◆ ' + shortDate(n.start);
  return shortDate(n.start) + ' – ' + shortDate(n.end);
}
function detailHtml(n, info, rows) {
  const r = n.row;
  let html = '';
  html += `<div class="detail" data-id="${r.id}">`;
  if (n.hasKids) html += `<p class="note">${fmtRange(n)} · ${Math.round(n.progress)}% — dates and progress follow the items inside. Drag its bar to shift everything together.</p>`;
  else {
    html += `<div class="seg" data-f="type"><button data-v="task" class="${n.milestone ? '' : 'on'}">Task</button><button data-v="milestone" class="${n.milestone ? 'on' : ''}">Milestone</button></div>`;
    html += n.milestone
      ? `<label class="field"><span>Date</span><input class="inp" type="date" data-f="start" value="${dayToIso(r.start)}"></label>`
      : `<div class="two"><label class="field"><span>Start</span><input class="inp" type="date" data-f="start" value="${dayToIso(r.start)}"></label><label class="field"><span>End</span><input class="inp" type="date" data-f="end" value="${dayToIso(r.end)}"></label></div>`;
    if (!n.milestone) html += durHtml(r);
    if (!n.milestone) html += `<label class="field"><span>Progress</span><div class="range-row"><input type="range" min="0" max="100" step="5" data-f="progress" value="${r.progress}"><output>${Math.round(r.progress)}%</output></div></label>`;
  }
  if (!(n.level === 0 && n.hasKids)) html += `<label class="field"><span>Assignee</span><input class="inp" data-f="assignee" list="who-list" value="${esc(r.assignee)}" placeholder="Name" autocomplete="off"></label>`;
  if (!n.hasKids) {
    const others = info.filter(o => o.row.id !== r.id && !(o.level === 0 && o.hasKids) && !r.deps.includes(o.row.id));
    html += `<div class="field"><span>Depends on</span>${r.deps.length ? `<div class="dep-chips">${r.deps.map(d => { const o = rows.find(x => x.id === d); return o ? `<span>${esc(o.name || 'Untitled')}<button data-act="dep-rm" data-dep="${d}" aria-label="Remove">✕</button></span>` : ''; }).join('')}</div>` : ''}
      <select class="inp" data-f="dep-add"><option value="">Add a dependency…</option>${others.map(o => `<option value="${o.row.id}">${'  '.repeat(o.level)}${esc(o.row.name || 'Untitled')}</option>`).join('')}</select></div>`;
  }
  html += `<div class="row-actions"><button data-act="outdent" title="Outdent (Shift+Tab)" ${n.level === 0 ? 'disabled' : ''}>← Outdent</button><button data-act="indent" title="Indent (Tab)" ${n.i === 0 || n.level >= 2 || rows[n.i - 1].level < n.level ? 'disabled' : ''}>Indent →</button><button data-act="dup">Duplicate</button><button data-act="del" class="danger">Delete</button></div></div>`;
  return html;
}
function renderOutline() {
  const act = document.activeElement;
  let keep = null;
  if (act && outline.contains(act) && act.closest('[data-id]')) keep = { id: act.closest('[data-id]').dataset.id, f: act.dataset.f || (act.classList.contains('nm') ? 'nm' : null), a: act.selectionStart, b: act.selectionEnd };
  const rows = state.rows, info = derive(rows), S = state.settings;
  const palette = areaPalette(S.primary, S.secondaryOn ? S.secondary : null, Math.max(1, info.filter(n => n.level === 0).length));
  const who = Array.from(new Set(rows.map(r => r.assignee).filter(Boolean)));
  let html = '';
  info.forEach(n => {
    const r = n.row, c = palette[n.rootIdx % palette.length];
    const color = n.level === 2 ? mix(c, '#ffffff', 0.45) : c;
    html += `<div class="orow lvl${n.level}${r.id === sel ? ' sel' : ''}" data-id="${r.id}">
      <span class="grip" title="Drag to reorder">⋮⋮</span><span class="indent" style="width:${n.level * 14}px"></span>
      <span class="dot${n.milestone ? ' ms' : ''}" style="background:${color}"></span>
      <input class="nm" value="${esc(r.name)}" placeholder="${n.milestone ? 'Milestone' : n.hasKids && n.level === 0 ? 'Area name' : 'Task name'}" aria-label="Name" autocomplete="off">
      <span class="dates">${fmtRange(n)}</span></div>`;
    if (r.id === sel) html += detailHtml(n, info, rows);
  });
  html += `<datalist id="who-list">${who.map(w => `<option value="${esc(w)}">`).join('')}</datalist>`;
  outline.innerHTML = html;
  if (keep && keep.f) {
    const el = keep.f === 'nm' ? $(`.orow[data-id="${keep.id}"] .nm`) : $(`.detail[data-id="${keep.id}"] [data-f="${keep.f}"]`);
    if (el) { el.focus({ preventScroll: true }); try { if (keep.a != null) el.setSelectionRange(keep.a, keep.b); } catch (e) { /* not a text field */ } }
  }
}
function updateRowMeta(id) { // light update while typing/dragging, without rebuilding inputs
  const n = derive(state.rows).find(n => n.row.id === id);
  const el = $(`.orow[data-id="${id}"] .dates`);
  if (n && el) el.textContent = fmtRange(n);
}

outline.addEventListener('focusin', e => {
  if (!e.target.classList.contains('nm')) return;
  const row = e.target.closest('.orow'), id = row.dataset.id;
  if (id === sel) return;
  // select without rebuilding the row, so the caret lands where the user clicked
  sel = id;
  renderChart();
  $$('.orow.sel', outline).forEach(el => el.classList.remove('sel'));
  $$('.detail', outline).forEach(el => el.remove());
  row.classList.add('sel');
  const info = derive(state.rows);
  row.insertAdjacentHTML('afterend', detailHtml(info[rowIndex(id)], info, state.rows));
});
outline.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  const host = e.target.closest('[data-id]');
  if (!host) return;
  const id = host.dataset.id;
  if (act) {
    const a = act.dataset.act;
    if (a === 'indent') shiftLevel(id, 1);
    else if (a === 'outdent') shiftLevel(id, -1);
    else if (a === 'del') deleteRow(id);
    else if (a === 'dup') duplicateRow(id);
    else if (a === 'dep-rm') { const r = state.rows[rowIndex(id)]; r.deps = r.deps.filter(d => d !== act.dataset.dep); commit(); refresh(); }
    return;
  }
  const segBtn = e.target.closest('.seg[data-f="type"] button');
  if (segBtn) {
    const r = state.rows[rowIndex(id)];
    if (r.type !== segBtn.dataset.v) {
      r.type = segBtn.dataset.v;
      r.end = r.type === 'milestone' ? r.start : r.start + 4;
      commit(); refresh();
    }
    return;
  }
  if (host.classList.contains('orow') && !e.target.closest('input,.grip')) select(id);
});
outline.addEventListener('input', e => {
  const host = e.target.closest('[data-id]');
  if (!host) return;
  const r = state.rows[rowIndex(host.dataset.id)];
  if (!r) return;
  const t = e.target, f = t.dataset.f;
  if (t.classList.contains('nm')) { r.name = t.value; renderChart(); syncPop(); commitSoon(); return; }
  rowInput(r, t);
});
outline.addEventListener('change', e => {
  const host = e.target.closest('[data-id]');
  if (!host) return;
  const r = state.rows[rowIndex(host.dataset.id)];
  if (!r) return;
  rowChange(r, e.target);
});
outline.addEventListener('keydown', e => {
  const t = e.target;
  if (!t.classList.contains('nm')) return;
  const id = t.closest('.orow').dataset.id;
  const i = rowIndex(id);
  if (e.key === 'Enter') { e.preventDefault(); commit(); addRow(state.rows[i].type === 'milestone' ? 'task' : 'task', id, e.shiftKey); }
  else if (e.key === 'Tab') { e.preventDefault(); shiftLevel(id, e.shiftKey ? -1 : 1); }
  else if (e.key === 'Backspace' && t.value === '' && state.rows.length > 1) { e.preventDefault(); const prev = state.rows[i - 1] || state.rows[i + 1]; deleteRow(id); if (prev && rowIndex(prev.id) >= 0) { sel = prev.id; refresh(); focusName(prev.id); } }
  else if (e.key === 'ArrowDown' && state.rows[i + 1]) { e.preventDefault(); focusName(state.rows[i + 1].id); }
  else if (e.key === 'ArrowUp' && state.rows[i - 1]) { e.preventDefault(); focusName(state.rows[i - 1].id); }
});
// drag rows by their grip
outline.addEventListener('pointerdown', e => {
  const grip = e.target.closest('.grip');
  if (!grip || e.button) return;
  e.preventDefault();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const id = grip.closest('.orow').dataset.id;
  const i = rowIndex(id), j = blockEnd(state.rows, i);
  const els = $$('.orow', outline);
  els.slice(i, j).forEach(el => el.classList.add('dragging'));
  const line = document.createElement('div');
  line.className = 'drop-line'; line.hidden = true;
  outline.appendChild(line);
  let k = i, lv = state.rows[i].level;
  const x0 = e.clientX, lv0 = lv;
  const body = outline.closest('.panel-body');
  const move = ev => {
    const y = ev.clientY;
    k = els.length;
    for (let x = 0; x < els.length; x++) { const b = els[x].getBoundingClientRect(); if (y < b.top + b.height / 2) { k = x; break; } }
    const ob = outline.getBoundingClientRect();
    const ref = k < els.length ? els[k].getBoundingClientRect().top : els[els.length - 1].getBoundingClientRect().bottom;
    // dragging sideways changes the level: an area dropped under another becomes a task, its tasks subtasks
    lv = dropLevelFor(i, k, lv0 + Math.round((ev.clientX - x0) / 20));
    const stay = k >= i && k <= j;
    line.hidden = stay && lv === lv0;
    line.style.top = (stay ? els[i].getBoundingClientRect().top : ref) - ob.top - 2 + 'px';
    line.style.left = 28 + lv * 14 + 'px';
    const bb = body.getBoundingClientRect();
    if (y < bb.top + 30) body.scrollTop -= 12; else if (y > bb.bottom - 30) body.scrollTop += 12;
  };
  const up = () => {
    grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
    if (moveBlock(i, k, lv)) { sel = id; commit(); }
    refresh();
  };
  grip.setPointerCapture(e.pointerId);
  grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
});
$$('[data-add]').forEach(b => b.addEventListener('click', () => addRow(b.dataset.add, sel, true, b.dataset.chart != null)));

// ---------------------------------------------------------------- chart interactions
svg.addEventListener('pointerdown', e => {
  if (e.button) return;
  const t = e.target.closest('[data-role]');
  if (!t) { if (sel) select(null); return; }
  const role = t.dataset.role, id = t.dataset.id || null;
  const touch = e.pointerType === 'touch';
  const rect = t.getBoundingClientRect();
  if (touch && id && (id !== sel || role === 'row')) { select(id); if (role !== 'row') openPop('row', rect, id, e.clientX); return; }
  e.preventDefault();
  if (document.activeElement && document.activeElement !== document.body) { commit(); document.activeElement.blur(); }
  try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const box = svg.getBoundingClientRect();
  const n = id ? scene.info.find(x => x.row.id === id) : null;
  drag = { role, id, x: e.clientX, y: e.clientY, k: scene.w / box.width, left: box.left, top: box.top, ppd: scene.ppd, moved: false, rect };
  if (role !== 'row' && role !== 'title' && role !== 'timeline') drag.range = scene.range.slice();
  if (role === 'move') { const i = n.i; drag.block = state.rows.slice(i, blockEnd(state.rows, i)).map(r => ({ r, s: r.start, e: r.end })); }
  else if (role === 'resize-l' || role === 'resize-r') drag.orig = { s: n.row.start, e: n.row.end };
  else if (role === 'progress') { drag.bx = n.bx; drag.bw = n.bw; }
  else if (role === 'today') drag.orig = state.settings.todayDate != null ? state.settings.todayDate : todayDay();
  else if (role === 'row') { drag.i = n.i; drag.lv0 = n.level; }
});
svg.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.x) * drag.k, dy = (e.clientY - drag.y) * drag.k;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  if (drag.role === 'title' || drag.role === 'timeline') return;
  drag.moved = true;
  closePop();
  svg.classList.add('dragging');
  const dd = Math.round(dx / drag.ppd);
  const row = drag.id ? state.rows[rowIndex(drag.id)] : null;
  if (drag.role === 'move') drag.block.forEach(b => { b.r.start = b.s + dd; b.r.end = b.e + dd; });
  else if (drag.role === 'resize-l') row.start = Math.min(drag.orig.s + dd, drag.orig.e);
  else if (drag.role === 'resize-r') row.end = Math.max(drag.orig.e + dd, drag.orig.s);
  else if (drag.role === 'progress') row.progress = clamp(Math.round((((e.clientX - drag.left) * drag.k - drag.bx) / drag.bw) * 20) * 5, 0, 100);
  else if (drag.role === 'today') state.settings.todayDate = drag.orig + dd;
  else if (drag.role === 'row') {
    const y = (e.clientY - drag.top) * drag.k, info = scene.info;
    let k = info.length;
    for (let x = 0; x < info.length; x++) if (y < (info[x].dropCy != null ? info[x].dropCy : info[x].cy)) { k = x; break; }
    drag.k2 = k;
    const j = blockEnd(state.rows, drag.i);
    const stay = k >= drag.i && k <= j;
    drag.dropLevel = dropLevelFor(drag.i, k, drag.lv0 + Math.round(dx / 24));
    const at = stay ? drag.i : k;
    drag.dropY = stay && drag.dropLevel === drag.lv0 ? null : at < info.length ? info[at].y - (info[at].level === 0 && info[at].hasKids && at > 0 ? 5 : 0) : info[info.length - 1].y + scene.rowH;
  }
  if (sel !== drag.id && drag.id) sel = drag.id;
  renderChart();
  if (drag.id) updateRowMeta(drag.id);
});
function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  svg.classList.remove('dragging');
  if (d.moved) {
    if (d.role === 'row' && d.k2 != null) moveBlock(d.i, d.k2, d.dropLevel);
    commit(); refresh();
    if (d.id) { const el = $(`.orow[data-id="${d.id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
  } else if (d.role === 'title') editTitle(d.rect);
  else if (d.role === 'timeline') openPop('timeline', d.rect, null, d.x - 60);
  else if (d.role === 'today') openPop('today', d.rect, null, d.x - 60);
  else if (d.id) {
    // the chart re-renders on selection, so double-clicks are detected here rather than via dblclick
    const now = Date.now(), dbl = lastClick.id === d.id && now - lastClick.t < 450;
    lastClick = { id: d.id, t: now };
    if (sel !== d.id) select(d.id);
    if (d.role === 'row') { if (dbl) editRowName(d.id, d.rect); }
    else { openPop('row', d.rect, d.id, d.x - 60); if (dbl) { const inp = $('#pop-name'); if (inp) inp.select(); } }
  }
}
let lastClick = { id: null, t: 0 };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- design panel
const DESIGN = [
  ['Chart', [
    { k: 'showTitle', type: 'toggle', label: 'Show title' },
    { k: 'title', type: 'text', label: 'Title', sub: true, ph: 'Chart title', when: s => s.showTitle },
    { k: 'width', type: 'seg', label: 'Format', opts: [['wide', 'Slide'], ['compact', 'Report']] },
  ]],
  ['Labels', [
    { k: 'taskLabels', type: 'seg', label: 'Tasks', opts: [['left', 'On the left'], ['bars', 'On the bars']] },
    { k: 'areaLabels', type: 'seg', label: 'Areas', opts: [['row', 'As headings'], ['side', 'At the side']], when: () => derive(state.rows).some(n => n.level === 0 && n.hasKids) },
  ]],
  ['Timeline', [
    { k: 'scale', type: 'seg', label: 'Periods', col: true, opts: [['days', 'Days'], ['weeks', 'Weeks'], ['sprints', 'Sprints'], ['months', 'Months'], ['quarters', 'Qtrs']] },
    { k: 'sprintWeeks', type: 'seg', label: 'A sprint is', num: true, opts: [[1, '1 wk'], [2, '2 wk'], [3, '3 wk'], [4, '4 wk']] },
    { k: 'dateMode', type: 'seg', label: 'Shown as', opts: [['calendar', 'Dates'], ['relative', 'Numbered']] },
    { k: 'datePos', type: 'seg', label: 'Position', opts: [['top', 'Top'], ['bottom', 'Bottom'], ['both', 'Both']] },
    { k: 'rangeMode', type: 'seg', label: 'Overall span', opts: [['auto', 'Fit to tasks'], ['fixed', 'Fixed']] },
    { k: 'rangeStart', type: 'date', label: 'From', sub: true, when: s => s.rangeMode === 'fixed' },
    { k: 'rangeEnd', type: 'date', label: 'To', sub: true, when: s => s.rangeMode === 'fixed' },
    { k: '_fit', type: 'button', label: 'Spread tasks across it', sub: true, act: 'fit', when: s => s.rangeMode === 'fixed' },
  ]],
  ['Show', [
    { k: 'progress', type: 'toggle', label: 'Progress in bars' },
    { k: 'todayLine', type: 'toggle', label: '“We are here” line' },
    { k: 'todayLabel', type: 'text', label: 'Label', sub: true, ph: 'No label', when: s => s.todayLine },
    { k: 'todayDate', type: 'date', label: 'Date', sub: true, when: s => s.todayLine },
    { k: 'deps', type: 'toggle', label: 'Dependency lines' },
    { k: 'assignees', type: 'toggle', label: 'Assignees' },
    { k: 'assigneeLevel', type: 'seg', label: 'For', sub: true, opts: [['tasks', 'Tasks'], ['subtasks', 'Subtasks'], ['all', 'Both']], when: s => s.assignees },
    { k: 'msLines', type: 'toggle', label: 'Milestone guide lines' },
  ]],
  ['Colour', [
    { type: 'themes' },
    { k: 'primary', type: 'color', label: 'Primary' },
    { k: 'secondaryOn', type: 'toggle', label: 'Secondary colour' },
    { k: 'secondary', type: 'color', label: 'Secondary', sub: true, when: s => s.secondaryOn },
    { k: 'bgTransparent', type: 'toggle', label: 'Transparent background' },
    { k: 'bg', type: 'color', label: 'Background', when: s => !s.bgTransparent },
    { k: 'textMode', type: 'seg', label: 'Text', opts: [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']] },
  ]],
  ['Style', [
    { k: 'font', type: 'select', label: 'Font', opts: FONTS.map(f => [f, f]) },
    { k: 'corners', type: 'seg', label: 'Corners', opts: [['square', 'Square'], ['rounded', 'Rounded'], ['pill', 'Pill']] },
    { k: 'density', type: 'seg', label: 'Row height', opts: [['compact', 'Compact'], ['regular', 'Regular'], ['roomy', 'Roomy']] },
    { k: 'grid', type: 'toggle', label: 'Gridlines' },
    { k: 'stripes', type: 'toggle', label: 'Row stripes' },
    { k: 'weekends', type: 'toggle', label: 'Shade weekends', when: s => s.scale === 'days' },
  ]],
];
const designEl = $('#design');
const designCtl = {};
function buildDesign() {
  let html = '';
  DESIGN.forEach(([title, ctls]) => {
    html += `<div class="group"><h3>${title}</h3>`;
    ctls.forEach(c => {
      if (c.k) designCtl[c.k] = c;
      const cls = `ctl${c.sub ? ' sub' : ''}${c.col || c.type === 'themes' ? ' col' : ''}`;
      const lbl = `<span class="lbl">${c.label || ''}</span>`;
      if (c.type === 'themes') html += `<div class="themes">${THEMES.map((t, i) => `<button data-theme="${i}" title="${t.name}" aria-label="${t.name}" style="background:${t.bg}"><i style="background:${t.p}"></i><i style="background:${t.s || mix(t.p, t.bg, 0.5)}"></i></button>`).join('')}</div>`;
      else if (c.type === 'seg') html += `<div class="${cls}" data-w="${c.k}">${lbl}<div class="seg" data-k="${c.k}">${c.opts.map(o => `<button data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
      else if (c.type === 'toggle') html += `<label class="${cls}" data-w="${c.k}">${lbl}<span class="switch"><input type="checkbox" data-k="${c.k}"><i></i></span></label>`;
      else if (c.type === 'color') html += `<div class="${cls}" data-w="${c.k}">${lbl}<span class="color"><input class="inp hex" data-k="${c.k}" data-hex maxlength="7" spellcheck="false" aria-label="${c.label} hex"><input type="color" data-k="${c.k}" aria-label="${c.label}"></span></div>`;
      else if (c.type === 'button') html += `<div class="${cls}" data-w="${c.k}"><button class="btn ghost wide" data-act="${c.act}">${c.label}</button></div>`;
      else if (c.type === 'select') html += `<label class="${cls}" data-w="${c.k}">${lbl}<select class="inp" style="width:170px" data-k="${c.k}">${c.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>`;
      else html += `<label class="${cls}" data-w="${c.k}">${lbl}<input class="inp" style="width:170px" type="${c.type}" data-k="${c.k}" placeholder="${c.ph || ''}"></label>`;
    });
    html += '</div>';
  });
  designEl.innerHTML = html;
}
function syncDesign() {
  const S = state.settings;
  $$('[data-w]', designEl).forEach(w => { const c = designCtl[w.dataset.w]; w.hidden = !!(c.when && !c.when(S)); });
  $$('.seg[data-k]', designEl).forEach(seg => $$('button', seg).forEach(b => b.classList.toggle('on', String(S[seg.dataset.k]) === b.dataset.v)));
  $$('input[data-k], select[data-k]', designEl).forEach(inp => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') inp.checked = !!S[k];
    else if (inp === document.activeElement) return;
    else if (inp.type === 'date') inp.value = dayToIso(S[k] != null ? S[k] : todayDay());
    else inp.value = S[k] == null ? '' : S[k];
  });
}
function setSetting(k, v, soon) {
  const S = state.settings;
  if (k === 'rangeMode' && v === 'fixed' && (S.rangeStart == null || S.rangeEnd == null)) [S.rangeStart, S.rangeEnd] = autoSpan();
  if (k === 'rangeStart' && S.rangeEnd != null && v > S.rangeEnd) S.rangeEnd = v + (S.rangeEnd - S.rangeStart);
  if (k === 'rangeEnd' && S.rangeStart != null && v < S.rangeStart) S.rangeStart = v;
  state.settings[k] = v;
  if (k === 'font') ensureFont();
  renderChart(); syncDesign(); syncPop();
  if (k === 'sprintWeeks') renderOutline();
  if (k === 'primary' || k === 'secondary' || k === 'secondaryOn') renderOutline();
  if (soon) commitSoon(); else commit();
}
designEl.addEventListener('click', e => {
  const th = e.target.closest('[data-theme]');
  if (th) {
    const t = THEMES[+th.dataset.theme];
    Object.assign(state.settings, { primary: t.p, secondaryOn: !!t.s, bg: t.bg, bgTransparent: false, textMode: 'auto' });
    if (t.s) state.settings.secondary = t.s;
    commit(); refresh();
    return;
  }
  if (e.target.closest('[data-act="fit"]')) { fitPlan(); return; }
  const b = e.target.closest('.seg[data-k] button');
  if (b) { const k = b.parentNode.dataset.k; setSetting(k, designCtl[k].num ? +b.dataset.v : b.dataset.v); }
});
designEl.addEventListener('input', e => {
  const t = e.target, k = t.dataset.k;
  if (!k) return;
  if (t.type === 'checkbox') setSetting(k, t.checked);
  else if (t.type === 'color') setSetting(k, t.value, true);
  else if (t.dataset.hex != null) { let v = t.value.trim(); if (v && v[0] !== '#') v = '#' + v; if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) setSetting(k, rgbToHex(hexToRgb(v)), true); }
  else if (t.type === 'date') { const d = isoToDay(t.value); if (d != null) setSetting(k, k === 'todayDate' && d === todayDay() ? null : d, true); }
  else if (t.tagName === 'SELECT') setSetting(k, t.value);
  else setSetting(k, t.value, true);
});
designEl.addEventListener('change', () => { commit(); syncDesign(); });

// ---------------------------------------------------------------- import
const modal = $('#import-modal');
let pending = null; // { rows } or { state }
function previewImport(rows, note) {
  const box = $('#imp-preview');
  pending = rows && rows.length ? { rows } : null;
  $('#imp-go').disabled = !pending;
  if (!pending) { box.innerHTML = note ? `<div class="sum">${esc(note)}</div>` : ''; return; }
  const info = derive(rows);
  const areas = info.filter(n => n.level === 0 && n.hasKids).length, ms = info.filter(n => n.milestone).length;
  const tasks = info.length - areas - ms;
  const parts = [areas && `${areas} area${areas > 1 ? 's' : ''}`, `${tasks} task${tasks === 1 ? '' : 's'}`, ms && `${ms} milestone${ms > 1 ? 's' : ''}`].filter(Boolean);
  box.innerHTML = `<div class="sum">${note ? esc(note) + ' — ' : ''}Found ${parts.join(', ')}</div>` + info.map(n => `<div class="pr l${n.level}"><span>${n.milestone ? '◆ ' : ''}${esc(n.row.name)}</span><span>${esc(n.row.assignee)}</span><span>${fmtRange(n)}</span></div>`).join('');
}
let impTimer = null;
$('#imp-text').addEventListener('input', () => {
  clearTimeout(impTimer);
  impTimer = setTimeout(() => { let rows = []; try { rows = parseImport($('#imp-text').value); } catch (e) { console.error(e); } previewImport(rows); }, 150);
});
$('#imp-text').addEventListener('keydown', e => { // allow typing tabs for indentation
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const t = e.target, a = t.selectionStart;
  t.setRangeText('\t', a, t.selectionEnd, 'end');
  t.dispatchEvent(new Event('input'));
});
$('#imp-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (/\.json$/i.test(file.name)) {
      const st = sanitize(JSON.parse(await file.text()));
      if (!st) throw new Error('Not a project file');
      pending = { state: st };
      $('#imp-preview').innerHTML = `<div class="sum">Project file “${esc(file.name)}” — ${st.rows.length} rows. Importing replaces the current plan and its styling.</div>`;
      $('#imp-go').disabled = false;
    } else if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) {
      await loadScript('vendor/xlsx.full.min.js');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
      $('#imp-text').value = '';
      previewImport(parseImport(grid), file.name);
      if (!pending) previewImport(null, 'No tasks found in ' + file.name);
    } else {
      $('#imp-text').value = await file.text();
      previewImport(parseImport($('#imp-text').value), file.name);
    }
  } catch (err) { console.error(err); previewImport(null, 'Could not read that file'); }
});
$('#imp-go').addEventListener('click', () => {
  if (!pending) return;
  if (pending.state) state = pending.state;
  else if ($('#imp-replace').checked) state.rows = pending.rows;
  else state.rows = state.rows.concat(pending.rows);
  normalizeLevels(state.rows);
  const S = state.settings;
  const spread = pending.rows && pending.rows.dated === false && $('#imp-replace').checked && S.rangeMode === 'fixed' && S.rangeStart != null && S.rangeEnd != null;
  if (spread) fitRows(state.rows, S.rangeStart, S.rangeEnd);
  sel = null; pending = null;
  commit(); ensureFont(); refresh(); closeModal();
  toast(spread ? 'Imported and spread across your timeline' : 'Imported — drag the bars to fine-tune dates');
});
function openModal() { modal.hidden = false; $('#imp-text').value = ''; previewImport(null); setTimeout(() => $('#imp-text').focus(), 30); }
function closeModal() { modal.hidden = true; }
$('#btn-import').addEventListener('click', openModal);
modal.addEventListener('pointerdown', e => { if (e.target === modal) closeModal(); });
$$('[data-close-modal]').forEach(b => b.addEventListener('click', closeModal));

// ---------------------------------------------------------------- export
const loaded = {};
function loadScript(src) {
  if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Failed to load ' + src)); }; document.head.appendChild(s); });
  return loaded[src];
}
const fileBase = () => (state.settings.title || 'gantt').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'gantt';
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportScene() {
  commit();
  const f = state.settings.font;
  try { await Promise.all([400, 500, 600, 700].map(w => document.fonts.load(`${w} 14px "${f}"`))); } catch (e) { /* offline: fall back */ }
  return buildScene(state, {});
}
const canvasBlob = c => new Promise(res => c.toBlob(res, 'image/png'));

async function exportPng() { const sc = await exportScene(); download(await canvasBlob(drawScene(sc, 3)), fileBase() + '.png'); toast('PNG downloaded'); }
async function exportCopy() {
  if (!navigator.clipboard || !window.ClipboardItem) { toast('Copying images isn’t supported in this browser — use PNG instead'); return; }
  // build synchronously so the clipboard write stays inside the user gesture
  const blob = canvasBlob(drawScene(buildScene(state, {}), 2));
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Chart copied — paste it into your slide'); }
  catch (e) { console.error(e); toast('Couldn’t copy — try the PNG export instead'); }
}
async function exportPdf() {
  const sc = await exportScene();
  await loadScript('vendor/jspdf.umd.min.js');
  const w = sc.w * 0.75, h = sc.h * 0.75;
  const doc = new window.jspdf.jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h], compress: true });
  doc.addImage(drawScene(sc, 3), 'PNG', 0, 0, w, h, undefined, 'FAST');
  doc.save(fileBase() + '.pdf');
  toast('PDF downloaded');
}
async function exportPptx() {
  const sc = await exportScene();
  await loadScript('vendor/pptxgen.bundle.js');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = state.settings.title || 'Gantt chart';
  const SW = 13.333, SH = 7.5, m = 0.3;
  const slide = pptx.addSlide();
  const hx = c => c.replace('#', '').toUpperCase();
  if (!sc.transparent) slide.background = { color: hx(state.settings.bg) };
  else if (sc.lightText) slide.background = { color: '111827' };
  const k = Math.min((SW - 2 * m) / sc.w, (SH - 2 * m) / sc.h);
  const ox = (SW - sc.w * k) / 2, oy = (SH - sc.h * k) / 2;
  const PX = v => ox + v * k, PY = v => oy + v * k, pt = v => v * k * 72;
  const seg = (a, b, it, arrow) => slide.addShape(pptx.ShapeType.line, {
    x: PX(Math.min(a[0], b[0])), y: PY(Math.min(a[1], b[1])), w: Math.abs(b[0] - a[0]) * k, h: Math.abs(b[1] - a[1]) * k,
    flipH: b[0] < a[0], flipV: b[1] < a[1],
    line: Object.assign({ color: hx(it.stroke), width: Math.max(0.5, pt(it.sw)) }, it.dash ? { dashType: 'dash' } : {}, arrow ? { endArrowType: 'triangle' } : {}),
  });
  for (const it of sc.items) {
    if (it.ui || it.hit || it.role === 'bg') continue;
    if (it.t === 'rect') {
      if (it.w <= 0) continue;
      const r = Math.min(it.r || 0, it.w / 2, it.h / 2);
      const o = { x: PX(it.x), y: PY(it.y), w: it.w * k, h: it.h * k, fill: { color: hx(it.fill) } };
      if (it.stroke) o.line = { color: hx(it.stroke), width: pt(it.sw || 1) };
      if (r > 0.5) o.rectRadius = r * k;
      slide.addShape(r > 0.5 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, o);
    } else if (it.t === 'line') seg([it.x1, it.y1], [it.x2, it.y2], it, false);
    else if (it.t === 'diamond') slide.addShape(pptx.ShapeType.diamond, { x: PX(it.cx - it.r), y: PY(it.cy - it.r), w: 2 * it.r * k, h: 2 * it.r * k, fill: { color: hx(it.fill) } });
    else if (it.t === 'poly') for (let i = 1; i < it.pts.length; i++) seg(it.pts[i - 1], it.pts[i], it, it.arrow && i === it.pts.length - 1);
    else if (it.t === 'text') {
      const tw = measureText(it.text, it.size, it.weight, sc.font) * 1.18 + 8;
      const x = it.anchor === 'middle' ? it.x - tw / 2 : it.anchor === 'end' ? it.x - tw : it.x;
      slide.addText(it.text, {
        x: PX(x), y: PY(it.y - it.size), w: tw * k, h: it.size * 2 * k, margin: 0, wrap: false, fit: 'none',
        fontFace: sc.font, fontSize: Math.round(pt(it.size) * 10) / 10, bold: it.weight >= 600, color: hx(it.major || it.fill),
        align: it.anchor === 'middle' ? 'center' : it.anchor === 'end' ? 'right' : 'left', valign: 'middle',
      });
    }
  }
  await pptx.writeFile({ fileName: fileBase() + '.pptx' });
  toast('PowerPoint downloaded — every bar is an editable shape');
}
function exportJson() { commit(); download(new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }), fileBase() + '.json'); toast('Project file saved'); }

const exportMenu = $('#export-menu');
$('#btn-export').addEventListener('click', e => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; });
document.addEventListener('click', e => { if (!exportMenu.hidden && !exportMenu.contains(e.target)) exportMenu.hidden = true; });
exportMenu.addEventListener('click', e => {
  const b = e.target.closest('[data-export]');
  if (!b) return;
  exportMenu.hidden = true;
  const fn = { png: exportPng, copy: exportCopy, pdf: exportPdf, pptx: exportPptx, json: exportJson }[b.dataset.export];
  Promise.resolve().then(fn).catch(err => { console.error(err); toast('Export failed — ' + (err && err.message ? err.message : 'please try again')); });
});

// ---------------------------------------------------------------- misc UI
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
$('#btn-undo').addEventListener('click', () => timeTravel(undoStack, redoStack));
$('#btn-redo').addEventListener('click', () => timeTravel(redoStack, undoStack));
$('#btn-new').addEventListener('click', () => {
  commit();
  state = blankState(state.settings);
  sel = null;
  commit(); refresh();
  toast('New plan started — Undo brings the old one back');
});
function syncTabs() { $$('[data-sheet]').forEach(b => b.classList.toggle('on', $('#' + b.dataset.sheet).classList.contains('open'))); }
function openSheet(id) { $$('.panel').forEach(p => p.classList.toggle('open', p.id === id && !p.classList.contains('open'))); syncTabs(); }
function closeSheets() { $$('.panel').forEach(p => p.classList.remove('open')); syncTabs(); }
$$('[data-sheet]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.sheet)));
$$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
$('#stage').addEventListener('pointerdown', e => { if (!e.composedPath().includes(svg) && !e.target.closest('.chart-add')) { closeSheets(); if (sel) select(null); } });

document.addEventListener('keydown', e => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') {
    if (!modal.hidden) closeModal();
    else if (pop) closePop();
    else if (!exportMenu.hidden) exportMenu.hidden = true;
    else if (inField) e.target.blur();
    else if (sel) select(null);
    return;
  }
  if (!modal.hidden) return;
  if (mod && e.key.toLowerCase() === 'z' && !(inField && e.target.type !== 'checkbox' && e.target.type !== 'range')) { e.preventDefault(); if (e.shiftKey) timeTravel(redoStack, undoStack); else timeTravel(undoStack, redoStack); }
  else if (mod && e.key.toLowerCase() === 'y' && !inField) { e.preventDefault(); timeTravel(redoStack, undoStack); }
  else if (!inField && sel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteRow(sel); }
  else if (!inField && sel && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    // nudge the selected item (and anything inside it) by a day; Shift = a week
    e.preventDefault();
    const i = rowIndex(sel), d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 7 : 1);
    state.rows.slice(i, blockEnd(state.rows, i)).forEach(r => { r.start += d; r.end += d; });
    refresh(); commitSoon();
  }
});
window.addEventListener('beforeunload', commit);

// ---------------------------------------------------------------- durations & timeline
const UI_KEY = 'gantt:ui';
const ui = Object.assign({ durUnit: 'weeks', hidePlan: false, hideDesign: false }, (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } })());
const saveUi = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* storage unavailable */ } };
const DUR_UNITS = [['days', 'days'], ['weeks', 'weeks'], ['sprints', 'sprints'], ['months', 'months']];

/** number + unit that describes a span, preferring the unit the user last picked */
function spanUnits(start, end) {
  const sw = state.settings.sprintWeeks;
  for (const u of [ui.durUnit, 'weeks', 'months']) { const n = durationIn(start, end, u, sw); if (n != null) return [n, u]; }
  return [end - start + 1, 'days'];
}
function durControl(start, end, fn, fu) {
  const [n, u] = spanUnits(start, end);
  return `<div class="dur"><input class="inp" type="number" min="1" step="1" inputmode="numeric" data-f="${fn}" value="${n}" aria-label="Length"><select class="inp" data-f="${fu}" aria-label="Unit">${DUR_UNITS.map(o => `<option value="${o[0]}"${o[0] === u ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
}
const durHtml = r => `<div class="field"><span>Duration</span>${durControl(r.start, r.end, 'dur-n', 'dur-u')}</div>`;
/** read the number + unit pair next to a field and turn it into an end date */
function durFromFields(t, start, fn, fu) {
  const box = t.closest('.dur');
  const unit = $(`[data-f="${fu}"]`, box).value;
  ui.durUnit = unit; saveUi();
  return durationEnd(start, +$(`[data-f="${fn}"]`, box).value || 1, unit, state.settings.sprintWeeks);
}

function rowInput(r, t) {
  const f = t.dataset.f;
  if (f === 'name') { r.name = t.value; renderChart(); renderOutline(); commitSoon(); }
  else if (f === 'assignee') { r.assignee = t.value; renderChart(); commitSoon(); }
  else if (f === 'progress') { r.progress = +t.value; t.nextElementSibling.textContent = t.value + '%'; if (!state.settings.progress) { state.settings.progress = true; syncDesign(); } renderChart(); commitSoon(); }
}
function rowChange(r, t) {
  const f = t.dataset.f;
  if (f === 'start' || f === 'end') {
    const d = isoToDay(t.value);
    if (d == null) return;
    if (f === 'start') { const len = r.end - r.start; r.start = d; r.end = r.type === 'milestone' ? d : d + len; }
    else { r.end = d; if (r.end < r.start) r.start = r.end; }
    commit(); refresh();
  } else if (f === 'dur-n' || f === 'dur-u') {
    r.end = durFromFields(t, r.start, 'dur-n', 'dur-u');
    commit(); refresh();
  } else if (f === 'dep-add' && t.value) {
    r.deps.push(t.value);
    if (!state.settings.deps) state.settings.deps = true;
    commit(); refresh();
  } else commit();
}
/** the span the plan currently occupies (used when switching to a fixed timeline) */
function autoSpan() {
  const info = derive(state.rows);
  if (!info.length) { const s = mondayOf(todayDay()); return [s, s + 12 * 7 - 1]; }
  return [Math.min(...info.map(n => n.start)), Math.max(...info.map(n => n.end))];
}
function fitPlan() {
  const S = state.settings;
  if (S.rangeMode !== 'fixed' || S.rangeStart == null || !state.rows.length) return;
  fitRows(state.rows, S.rangeStart, S.rangeEnd);
  commit(); refresh();
  toast('Tasks spread across the timeline — Undo to revert');
}

// ---------------------------------------------------------------- popover: edit things where they are
const popEl = document.createElement('div');
popEl.className = 'pop'; popEl.hidden = true;
document.body.appendChild(popEl);
let pop = null;
function popHtml() {
  const S = state.settings;
  const date = (label, f, v) => `<label class="field"><span>${label}</span><input class="inp" type="date" data-f="${f}" value="${dayToIso(v)}"></label>`;
  if (pop.kind === 'row') {
    const n = derive(state.rows).find(x => x.row.id === pop.id);
    if (!n) return '';
    const r = n.row;
    let h = `<input class="inp pop-name" id="pop-name" data-f="name" value="${esc(r.name)}" placeholder="Name" autocomplete="off" aria-label="Name">`;
    if (n.hasKids) h += `<p class="note">${fmtRange(n)} — spans the items inside it. Drag the bar to shift them all.</p>`;
    else if (n.milestone) h += date('Date', 'start', r.start);
    else h += `<div class="two">${date('Start', 'start', r.start)}${date('End', 'end', r.end)}</div>${durHtml(r)}`;
    return h;
  }
  if (pop.kind === 'today') return `<h4>“We are here” line</h4>${date('Date', 'todayDate', S.todayDate != null ? S.todayDate : todayDay())}<label class="field"><span>Label</span><input class="inp" data-f="todayLabel" value="${esc(S.todayLabel)}" placeholder="No label"></label>`;
  const fixed = S.rangeMode === 'fixed' && S.rangeStart != null;
  const [a, b] = fixed ? [S.rangeStart, S.rangeEnd] : autoSpan();
  return `<h4>Overall timeline</h4>
    <div class="seg" data-f="rangeMode"><button data-v="auto" class="${fixed ? '' : 'on'}">Fit to tasks</button><button data-v="fixed" class="${fixed ? 'on' : ''}">Fixed</button></div>
    <div class="two">${date('From', 'rangeStart', a)}${date('To', 'rangeEnd', b)}</div>
    <div class="field"><span>Length</span>${durControl(a, b, 'len-n', 'len-u')}</div>
    <button class="btn ghost wide" data-act="fit"${fixed && state.rows.length ? '' : ' disabled'}>Spread tasks across it</button>`;
}
function openPop(kind, rect, id, x) {
  pop = { kind, id: id || null };
  popEl.innerHTML = popHtml();
  popEl.hidden = false;
  const w = popEl.offsetWidth, h = popEl.offsetHeight;
  let top = rect.bottom + 8;
  if (kind === 'today') top = rect.top + 30;
  if (top + h > innerHeight - 8) top = Math.max(8, rect.top - h - 8);
  popEl.style.top = top + 'px';
  popEl.style.left = clamp(x != null ? Math.max(x, rect.left) : rect.left, 8, Math.max(8, innerWidth - w - 8)) + 'px';
}
function closePop() { if (!pop) return; pop = null; popEl.hidden = true; popEl.innerHTML = ''; }
function syncPop() {
  if (!pop) return;
  const html = popHtml();
  if (!html) { closePop(); return; }
  const act = document.activeElement;
  if (!popEl.contains(act)) { popEl.innerHTML = html; return; }
  // keep the field being typed in; refresh the others from a fresh copy
  const fresh = document.createElement('div');
  fresh.innerHTML = html;
  $$('[data-f]', popEl).forEach(el => {
    const src = $(`[data-f="${el.dataset.f}"]`, fresh);
    if (!src || el === act) return;
    if (el.classList.contains('seg')) el.innerHTML = src.innerHTML; else el.value = src.value;
  });
  const fit = $('[data-act="fit"]', popEl), fit2 = $('[data-act="fit"]', fresh);
  if (fit && fit2) fit.disabled = fit2.disabled;
}
document.addEventListener('pointerdown', e => { if (pop && !popEl.contains(e.target)) closePop(); }, true);
popEl.addEventListener('input', e => {
  const t = e.target, f = t.dataset.f;
  if (!pop || !f) return;
  if (pop.kind === 'row') { const r = state.rows[rowIndex(pop.id)]; if (r) rowInput(r, t); }
  else if (f === 'todayLabel') setSetting('todayLabel', t.value, true);
});
popEl.addEventListener('change', e => {
  const t = e.target, f = t.dataset.f;
  if (!pop || !f) return;
  if (pop.kind === 'row') { const r = state.rows[rowIndex(pop.id)]; if (r) rowChange(r, t); return; }
  const S = state.settings;
  if (f === 'todayDate') { const d = isoToDay(t.value); if (d != null) setSetting('todayDate', d === todayDay() ? null : d); }
  else if (f === 'rangeStart' || f === 'rangeEnd' || f === 'len-n' || f === 'len-u') {
    if (S.rangeMode !== 'fixed' || S.rangeStart == null) { [S.rangeStart, S.rangeEnd] = autoSpan(); S.rangeMode = 'fixed'; }
    if (f[0] === 'l') setSetting('rangeEnd', durFromFields(t, S.rangeStart, 'len-n', 'len-u'));
    else { const d = isoToDay(t.value); if (d != null) setSetting(f, d); }
  } else commit();
});
popEl.addEventListener('click', e => {
  if (e.target.closest('[data-act="fit"]')) { fitPlan(); return; }
  const b = e.target.closest('.seg[data-f="rangeMode"] button');
  if (b) setSetting('rangeMode', b.dataset.v);
});
popEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.target.blur(); if (e.target.dataset.f === 'name') closePop(); } });

// ---------------------------------------------------------------- inline text editing on the chart
function inlineEdit(rect, value, fontPx, weight, onInput) {
  closePop();
  const inp = document.createElement('input');
  inp.className = 'inline-edit';
  inp.value = value;
  Object.assign(inp.style, { left: rect.left + 'px', top: rect.top + 'px', width: Math.max(rect.width, 180) + 'px', height: rect.height + 'px', fontSize: fontPx + 'px', fontWeight: weight, fontFamily: `'${state.settings.font}', system-ui, sans-serif` });
  document.body.appendChild(inp);
  let done = false;
  const finish = revert => {
    if (done) return;
    done = true;
    if (revert) onInput(value);
    inp.remove(); commit(); refresh();
  };
  inp.addEventListener('input', () => onInput(inp.value));
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(false); else if (e.key === 'Escape') { e.stopPropagation(); finish(true); } });
  inp.addEventListener('blur', () => finish(false));
  inp.focus(); inp.select();
}
function editTitle(rect) {
  const s = svg.getBoundingClientRect().width / scene.w;
  inlineEdit({ left: rect.left, top: rect.top, width: Math.max(rect.width + 80, 420 * s), height: rect.height }, state.settings.title, Math.max(13, 30 * s), 700, v => { state.settings.title = v; renderChart(); syncDesign(); });
}
function editRowName(id, rect) {
  const n = scene.info.find(x => x.row.id === id);
  if (!n) return;
  const box = svg.getBoundingClientRect(), s = box.width / scene.w, indent = box.left + (n.lx || 0) * s - 7 - rect.left;
  const group = n.level === 0 && n.hasKids;
  inlineEdit({ left: rect.left + indent, top: rect.top + 2, width: rect.width - indent + 40, height: rect.height - 4 }, n.row.name, Math.max(12, (group ? scene.fs + 1 : n.level === 2 ? scene.fs - 1 : scene.fs) * s), group ? 700 : 500, v => { n.row.name = v; renderChart(); renderOutline(); });
}

// ---------------------------------------------------------------- zoom (ctrl/⌘ + wheel, trackpad pinch, buttons)
const stage = $('#stage'), wrapEl = $('#chart-col');
let zoom = 1;
function applyZoom() {
  wrapEl.style.width = zoom * 100 + '%';
  wrapEl.style.maxWidth = (state.settings.width === 'compact' ? 960 : 1280) * zoom + 'px';
  $('#zoom-val').textContent = Math.round(zoom * 100) + '%';
}
function setZoom(z, cx, cy) {
  z = clamp(z, 0.4, 6);
  if (Math.abs(z - zoom) < 0.001) return;
  closePop();
  const sb = stage.getBoundingClientRect();
  if (cx == null) { cx = sb.left + sb.width / 2; cy = sb.top + sb.height / 2; }
  const a = wrapEl.getBoundingClientRect();
  const fx = (cx - a.left) / a.width, fy = (cy - a.top) / a.height;
  zoom = z;
  applyZoom();
  const b = wrapEl.getBoundingClientRect();
  stage.scrollLeft += b.left + fx * b.width - cx;
  stage.scrollTop += b.top + fy * b.height - cy;
}
stage.addEventListener('wheel', e => {
  if (!e.ctrlKey && !e.metaKey) return; // plain scrolling pans
  e.preventDefault();
  const d = clamp(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, -30, 30);
  setZoom(zoom * Math.exp(-d * 0.008), e.clientX, e.clientY);
}, { passive: false });
let gestureZoom = 1;
stage.addEventListener('gesturestart', e => { e.preventDefault(); gestureZoom = zoom; });
stage.addEventListener('gesturechange', e => { e.preventDefault(); setZoom(gestureZoom * e.scale, e.clientX, e.clientY); });
$('#zoom-in').addEventListener('click', () => setZoom(zoom * 1.25));
$('#zoom-out').addEventListener('click', () => setZoom(zoom / 1.25));
$('#zoom-val').addEventListener('click', () => setZoom(1));

// ---------------------------------------------------------------- collapsible panels
function syncPanels() {
  $('#panel-plan').classList.toggle('collapsed', !!ui.hidePlan);
  $('#panel-design').classList.toggle('collapsed', !!ui.hideDesign);
}
$$('.panel').forEach(p => {
  const key = p.id === 'panel-plan' ? 'hidePlan' : 'hideDesign';
  const toggle = () => { ui[key] = !ui[key]; saveUi(); syncPanels(); };
  $('.collapse-btn', p).addEventListener('click', e => { e.stopPropagation(); toggle(); });
  p.addEventListener('click', () => { if (p.classList.contains('collapsed') && matchMedia('(min-width: 861px)').matches) toggle(); });
});
syncPanels();

// ---------------------------------------------------------------- go
buildDesign();
syncUndo();
ensureFont();
refresh();
