'use strict';
/* App: state, rendering, interactions, panels, import and export. */

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORE_KEY = 'gantt:v1';

const FONTS = ['Inter', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Poppins', 'Montserrat', 'Work Sans', 'IBM Plex Sans', 'Space Grotesk', 'Lora', 'Source Serif 4', 'Playfair Display', 'Roboto Slab', 'JetBrains Mono'];

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
  const had = validPalette(st.settings && st.settings.palette), old = st.settings || {};
  // plans saved before automatic row height existed move from the old default to it
  if (st.settings && !st.settings.v && (st.settings.density || 'regular') === 'regular') st.settings.density = 'auto';
  st.settings = Object.assign({}, DEFAULT_SETTINGS, st.settings || {});
  st.settings.daysOff = (Array.isArray(st.settings.daysOff) ? st.settings.daysOff : []).filter(r => r && Number.isFinite(+r.from)).slice(0, 60).map(r => { const f = Math.round(+r.from); return { from: f, to: Math.max(f, Number.isFinite(+r.to) ? Math.round(+r.to) : f), label: String(r.label || '').slice(0, 40) }; });
  if (old.overflow === 'wrap') { st.settings.wrapNames = true; st.settings.overflow = 'shrink'; } // wrap used to be one of the choices, and shrank when two lines weren't enough
  if (old.todayLabel === '' && old.markerLabelOn == null) { st.settings.markerLabelOn = false; st.settings.todayLabel = 'Today'; } // an empty label used to mean none
  if (old.canvas == null) st.settings.canvas = old.width === 'compact' ? 'slide43' : 'slide169'; // the old Slide / Report formats
  delete st.settings.width;
  if (!had) { // plans saved with a primary / secondary colour become a palette
    const p = parseColor(old.primary), same = !p || (p === '#4f46e5' && old.secondaryOn !== false && (!old.secondary || old.secondary === '#ec4899'));
    st.settings.palette = same ? PRESETS[0] : { id: 'custom', name: 'Custom', text: 'auto', seed: p, colors: areaPalette(p, old.secondaryOn === false ? null : parseColor(old.secondary), 6) };
  }
  if (!['light', 'dark', 'auto'].includes(st.settings.palette.text)) st.settings.palette = Object.assign({}, st.settings.palette, { text: 'auto' });
  if (st.settings.density === 'regular') st.settings.density = 'auto'; // Regular was a fixed height; the steps are now relative to Auto
  if (old.grid === false && old.gridCells == null) { st.settings.gridCells = false; st.settings.gridMonths = false; } // one Gridlines switch became two
  delete st.settings.grid;
  const oldLabels = st.settings.labels; // earlier versions had one combined setting
  if (oldLabels) { st.settings.taskLabels = oldLabels === 'left' ? 'left' : 'bars'; st.settings.areaLabels = oldLabels === 'lanes' ? 'side' : 'row'; delete st.settings.labels; }
  st.rows = st.rows.filter(r => r && typeof r === 'object').map(r => {
    const row = newRow(r);
    row.start = Number.isFinite(+row.start) ? Math.round(+row.start) : todayDay();
    row.end = Number.isFinite(+row.end) ? Math.max(row.start, Math.round(+row.end)) : row.start;
    row.progress = row.progress == null ? null : clamp(+row.progress || 0, 0, 100); // null: not tracked for this bar
    row.name = String(row.name || ''); row.assignee = String(row.assignee || '');
    if (row.baseline && Number.isFinite(+row.baseline.s) && Number.isFinite(+row.baseline.e)) row.baseline = { s: Math.round(+row.baseline.s), e: Math.round(+row.baseline.e) }; else delete row.baseline;
    if (typeof row.changeNote === 'string' && row.changeNote.trim()) row.changeNote = row.changeNote.slice(0, 140); else delete row.changeNote;
    row.deps = Array.isArray(row.deps) ? row.deps.map(String) : [];
    row.id = String(row.id);
    row.type = row.type === 'milestone' ? 'milestone' : 'task';
    if (row.msAlign != null && !['auto', 'start', 'middle', 'end'].includes(row.msAlign)) delete row.msAlign;
    if (row.color != null) { // a palette slot, or a colour chosen by hand
      const hex = typeof row.color === 'string' ? parseColor(row.color) : null, c = Math.round(+row.color);
      if (hex) row.color = hex; else if (typeof row.color !== 'string' && Number.isFinite(c) && c >= 0) row.color = c; else delete row.color;
    }
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
let multi = new Set(); // with `sel`, the rows picked by shift/ctrl-click
const selIds = () => (multi.size > 1 && multi.has(sel) ? state.rows.filter(r => multi.has(r.id)).map(r => r.id) : sel ? [sel] : []);
let detailId = null; // the row whose details are open in the Plan panel — opened on purpose, never by selecting
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
  multi = new Set();
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
      out += `<line x1="${n2(it.x1)}" y1="${n2(it.y1)}" x2="${n2(it.x2)}" y2="${n2(it.y2)}" stroke="${it.stroke}" stroke-width="${it.sw}"${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}${it.cap ? ` stroke-linecap="${it.cap}"` : ''}/>`;
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
      g.strokeStyle = it.stroke; g.lineWidth = it.sw; if (it.dash) g.setLineDash(it.dash); g.lineCap = it.cap || 'butt'; g.stroke(); g.lineCap = 'butt';
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
  const o = { sel, selSet: selIds() };
  if (drag && drag.range) o.range = drag.range;
  if (drag && drag.dropY != null) { o.dropY = drag.dropY; o.dropLevel = drag.dropLevel; }
  if (drag && drag.toRow != null) o.rowHi = drag.toRowY;
  if (drag && drag.dropBox && drag.dropY != null) o.dropBox = drag.dropBox;
  scene = buildScene(state, o);
  svg.setAttribute('viewBox', `0 0 ${scene.w} ${scene.h}`);
  svg.setAttribute('font-family', `'${scene.font}', system-ui, sans-serif`);
  svg.innerHTML = sceneToSvg(scene, true);
  const wrap = $('#canvas-wrap');
  wrap.classList.toggle('transparent', scene.transparent);
  wrap.classList.toggle('dark', scene.transparent && scene.lightText);
  applyZoom();
  placeSelBar();
  syncQuickStatus();
  const sp = $('#chart-spread');
  if (sp) {
    sp.hidden = !(state.settings.rangeMode === 'fixed' && state.settings.rangeStart != null && state.rows.length);
    const on = !sp.hidden && isSpread();
    sp.setAttribute('aria-pressed', String(on));
    sp.textContent = on ? '↔ Spread across the timeline — click to undo' : '↔ Spread tasks across the timeline';
  }
  const co = $('#chart-out');
  if (co) {
    const out = outsideRows();
    co.hidden = !out.length;
    if (out.length) co.innerHTML = `⚠ ${out.length} ${out.length === 1 ? 'item is' : 'items are'} outside the timeline <button class="link-btn" data-act="pull">Fit them in…</button>`;
  }
  const warn = $('#chart-warn');
  if (warn) { warn.hidden = !(scene.fixedPx && !scene.fits); warn.textContent = '⚠ Doesn’t fit the canvas — see Design → Chart'; }
}
function refresh() { renderChart(); renderOutline(); syncDesign(); syncPop(); syncAddNote(); }
function syncAddNote() {
  const r = sel && state.rows[rowIndex(sel)];
  $('#chart-add-note').textContent = r ? `Adds after “${r.name || 'Untitled'}”` : '';
  syncSelBar();
}

$('#chart-spread').addEventListener('click', toggleSpread);
$('#chart-out').addEventListener('click', e => { if (e.target.closest('[data-act="pull"]')) outsideDialog(); });

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
  if (sel === id && !multi.size) return;
  sel = id; multi = new Set();
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
function dropLevelFor(i, k, want, existingOnly) {
  const rows = state.rows, j = blockEnd(rows, i);
  const stay = k >= i && k <= j;
  const prev = stay ? rows[i - 1] : rows[k - 1], next = stay ? rows[j] : rows[k];
  const max = prev ? Math.min(2, prev.level + 1) : 0;
  let level = clamp(want, 0, max);
  // dropped in front of deeper rows, it joins them as a sibling rather than adopting them
  if (next && next.level > level) level = Math.min(next.level, max);
  if (existingOnly) {
    // never turn a plain row into an area: land only inside something that already holds other items (or the row it is already in)
    let cp = -1;
    for (let q = i - 1; q >= 0; q--) if (rows[q].level < rows[i].level) { cp = q; break; }
    while (level > 0) {
      const pi = dropParentIndex(i, k, level);
      if (pi < 0 || pi === cp || rows.slice(pi + 1, blockEnd(rows, pi)).some((r, q) => pi + 1 + q < i || pi + 1 + q >= j)) break;
      level = rows[pi].level;
    }
  }
  return level;
}
/** move a row and everything inside it; changing its level re-levels its contents (area -> task -> subtask) */
function moveBlock(i, k, want) {
  const rows = state.rows, j = blockEnd(rows, i);
  const level = dropLevelFor(i, k, want == null ? rows[i].level : want);
  const stay = k >= i && k <= j;
  if (stay && level === rows[i].level) return false;
  const leaves = leafTasks(rows);
  const block = rows.splice(i, j - i);
  const at = stay ? i : k > i ? k - (j - i) : k;
  const delta = level - block[0].level;
  block.forEach(r => { r.level = clamp(r.level + delta, 0, 2); });
  rows.splice(at, 0, ...block);
  normalizeLevels(rows);
  keepAsTasks(rows, leaves);
  return true;
}
/** top-level tasks that hold nothing yet: if a move gives one something to hold it stays a task (with subtasks) rather than silently becoming an area */
function leafTasks(rows) { return new Set(derive(rows).filter(n => n.level === 0 && !n.hasKids && !n.milestone).map(n => n.row.id)); }
function keepAsTasks(rows, leaves) {
  rows.forEach((r, i) => {
    if (!leaves.has(r.id) || i + 1 >= rows.length || rows[i + 1].level < 1) return;
    const j = blockEnd(rows, i);
    if (rows.slice(i + 1, j).every(x => x.level === 1)) r.keepTask = true; // deeper than one level can only be an area
  });
}
function canIndent(rows, i) {
  const r = rows[i];
  if (i === 0 || r.level >= 2 || rows[i - 1].level < r.level) return false;
  let q = i - 1; while (q > 0 && rows[q].level > 0) q--;
  if (rows[q].keepTask && (r.level >= 1 || blockEnd(rows, i) > i + 1)) return false; // a task holds only subtasks, one level
  return true;
}
function shiftLevel(id, d) {
  const rows = state.rows, i = rowIndex(id);
  if (i < 0) return;
  if (d > 0 && !canIndent(rows, i)) return;
  if (d < 0 && rows[i].level === 0) return;
  const j = blockEnd(rows, i), leaves = leafTasks(rows);
  for (let k = i; k < j; k++) rows[k].level = clamp(rows[k].level + d, 0, 2);
  normalizeLevels(rows);
  keepAsTasks(rows, leaves);
  commit(); refresh();
}
function deleteRow(id, keepInside) {
  const rows = state.rows, i = rowIndex(id);
  if (i < 0) return;
  const j = blockEnd(rows, i);
  if (keepInside) for (let k = i + 1; k < j; k++) rows[k].level -= 1;
  const gone = rows.splice(i, keepInside ? 1 : j - i).map(r => r.id);
  rows.forEach(r => { r.deps = r.deps.filter(d => !gone.includes(d)); });
  normalizeLevels(rows);
  sel = rows.length ? rows[Math.min(i, rows.length - 1)].id : null;
  commit(); refresh();
}
/** small confirmation dialog: buttons are [label, style, action] */
function dialog(title, text, buttons) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal dialog" role="alertdialog" aria-modal="true"><h2>${esc(title)}</h2><p class="modal-sub">${esc(text)}</p><div class="dialog-btns">${buttons.map((b, i) => `<button class="btn ${b[1]}" data-i="${i}">${esc(b[0])}</button>`).join('')}</div></div>`;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  back.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (b) { close(); const fn = buttons[+b.dataset.i][2]; if (fn) fn(); } else if (e.target === back) close();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  back.querySelector('[data-i]:last-child').focus();
}
/** delete a row; if it holds other items, ask whether those should go too */
function askDelete(id) {
  const n = derive(state.rows)[rowIndex(id)];
  if (!n) return;
  if (!n.hasKids) { deleteRow(id); return; }
  const count = blockEnd(state.rows, n.i) - n.i - 1, area = n.isArea;
  const inside = area ? (count === 1 ? 'task' : 'tasks') : (count === 1 ? 'subtask' : 'subtasks');
  dialog(`Delete “${n.row.name || 'Untitled'}”?`, `This ${area ? 'area' : 'task'} contains ${count} ${count === 1 ? 'item' : 'items'}. You can remove just the ${area ? 'area' : 'task'} and keep what is inside it.`, [
    [`Delete with its ${inside}`, 'danger', () => deleteRow(id)],
    [`Keep the ${inside}`, 'ghost', () => deleteRow(id, true)],
    ['Cancel', 'ghost', null],
  ]);
}
/** switch an item between area, task and milestone */
function setType(id, to, quiet) {
  const rows = state.rows, i = rowIndex(id);
  if (i < 0) return;
  const info = derive(rows), n = info[i], r = n.row, j = blockEnd(rows, i);
  const isArea = n.isArea;
  if (to === 'area') {
    if (isArea) return;
    if (n.level === 0 && n.hasKids) { delete r.keepTask; if (!quiet) { commit(); refresh(); } return; } // a top-level task with subtasks becomes an area as it is
    delete r.keepTask;
    const d = r.level;
    for (let k = i; k < j; k++) rows[k].level -= d; // to the top level, taking its subtasks along
    r.type = 'task';
    // tasks listed after it become its tasks: former siblings do so by position, top-level ones are adopted until the next area
    if (d === 0 && !n.hasKids) for (let k = j; k < rows.length && rows[k].level === 0 && !info[k].hasKids; k++) rows[k].level = 1;
    normalizeLevels(rows);
    if (blockEnd(rows, i) === i + 1) rows.splice(i + 1, 0, newRow({ level: 1, name: 'New task', start: r.start, end: Math.max(r.end, r.start + 4) }));
  } else {
    if (n.hasKids && !isArea && to === 'milestone') return;
    if (isArea) for (let k = i + 1; k < j; k++) rows[k].level -= 1; // its tasks stay, one level up
    const was = r.type;
    r.type = to === 'milestone' ? 'milestone' : 'task';
    if (r.type === 'milestone') r.end = r.start; else if (was === 'milestone' || r.end < r.start) r.end = r.start + 4;
  }
  normalizeLevels(rows);
  if (!quiet) { commit(); refresh(); }
}
/** the selection (or one item) becomes an area, a task or a milestone */
function setTypes(ids, to) {
  const before = JSON.stringify(state.rows.map(r => [r.id, r.level, r.type]));
  ids.forEach(id => setType(id, to, true));
  if (JSON.stringify(state.rows.map(r => [r.id, r.level, r.type])) === before) { toast(to === 'milestone' ? 'An item with subtasks can’t be a milestone — move them out first' : 'Nothing to change'); return; }
  commit(); refresh();
  toast(`${ids.length === 1 ? 'Item' : ids.length + ' items'} made ${to === 'area' ? 'an area' : to === 'task' ? 'a task' : 'a milestone'} — Undo reverts`);
}
/** the Area / Task / Milestone switch, in the Plan panel's details and in the popover on the item */
function typeSegHtml(n) {
  const kind = n.isArea ? 'area' : n.milestone ? 'milestone' : 'task';
  const alt = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '') ? '⌥' : 'Alt';
  return `<div class="seg" data-f="type">${[['area', 'Area', 'A'], ['task', 'Task', 'T'], ['milestone', 'Milestone', 'M']].map(o => `<button data-v="${o[0]}" class="${o[0] === kind ? 'on' : ''}"${o[0] === 'milestone' && n.hasKids && !n.isArea ? ' disabled title="Remove its subtasks first"' : ` title="${o[1]} (${alt}+${o[2]})"`}>${o[1]}</button>`).join('')}</div>`;
}
function addRow(kind, afterId, asSibling, onChart, asChild) {
  const show = id => (onChart ? editOnChart(id) : focusName(id, true));
  const rows = state.rows;
  const info = derive(rows);
  let i = afterId ? rowIndex(afterId) : -1;
  let at, level, ref, childOf = null;
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
    // a top-level item with nothing inside is a task, not an area: giving it a subtask would silently turn it into one, so it gets a sibling instead
    if (asChild && !n.milestone && !n.sub) { // a subtask: inside this item, after what it already holds
      at = blockEnd(rows, i); level = n.level + 1;
      if (n.hasKids) ref = info[at - 1]; else childOf = n; // a task that had no items inside keeps its own dates through its first one
    }
    else if (n.hasKids && (n.isArea || !asSibling)) { at = blockEnd(rows, i); level = n.level + 1; ref = info[at - 1]; }
    else { at = blockEnd(rows, i); level = n.level; }
  }
  const S0 = state.settings;
  const emptyStart = S0.rangeMode === 'fixed' && S0.rangeStart != null ? S0.rangeStart : mondayOf(todayDay());
  const row = newRow({ level, name: '', type: kind === 'milestone' ? 'milestone' : 'task' });
  if (kind === 'milestone') { row.start = row.end = ref ? ref.end : emptyStart; row.name = 'Milestone'; }
  else if (childOf) { row.start = childOf.start; row.end = childOf.end; row.name = ''; }
  else { row.start = ref ? nextWorkday(ref.end + 1) : emptyStart; row.end = row.start + 4; row.name = ''; }
  rows.splice(at, 0, row);
  if (childOf && childOf.level === 0) childOf.row.keepTask = true; // the task stays a task, now holding a subtask
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
  if (state.settings.showChanges) markChanges(info);
  { const S = state.settings; if (S.progress && S.progressSource === 'marker' && S.todayLine) applyDateProgress(info, S.todayDate != null ? S.todayDate : todayDay()); } // percentages shown here follow the marker too
  let html = '';
  html += `<div class="detail" data-id="${r.id}">`;
  const isArea = n.isArea, kind = isArea ? 'area' : n.milestone ? 'milestone' : 'task';
  html += typeSegHtml(n);
  if (n.hasKids) html += `<p class="note">${fmtRange(n)}${n.progress == null ? '' : ' · ' + Math.round(n.progress) + '%'} — dates and progress follow the items inside. Drag its bar to shift everything together.</p>`;
  else {
    html += n.milestone
      ? `<label class="field"><span>Date</span><input class="inp" type="date" min="1990-01-01" max="2100-12-31" data-f="start" value="${dayToIso(r.start)}"></label>`
      : `<div class="two"><label class="field"><span>Start</span><input class="inp" type="date" min="1990-01-01" max="2100-12-31" data-f="start" value="${dayToIso(r.start)}"></label><label class="field"><span>End</span><input class="inp" type="date" min="1990-01-01" max="2100-12-31" data-f="end" value="${dayToIso(r.end)}"></label></div>`;
    if (!n.milestone) html += durHtml(r);
    if (!n.milestone) html += progressHtml(r);
  }
  if (n.milestone) html += msHtml(r);
  html += changeHtml(n);
  html += colorHtml(r);
  html += assigneeHtml(r);
  if (!n.hasKids) {
    const others = info.filter(o => o.row.id !== r.id && !o.isArea && !r.deps.includes(o.row.id));
    html += `<div class="field"><span>Depends on</span>${r.deps.length ? `<div class="dep-chips">${r.deps.map(d => { const o = rows.find(x => x.id === d); return o ? `<span>${esc(o.name || 'Untitled')}<button data-act="dep-rm" data-dep="${d}" aria-label="Remove">✕</button></span>` : ''; }).join('')}</div>` : ''}
      <select class="inp" data-f="dep-add"><option value="">Add a dependency…</option>${others.map(o => `<option value="${o.row.id}">${'  '.repeat(o.level)}${esc(o.row.name || 'Untitled')}</option>`).join('')}</select></div>`;
  }
  html += `<div class="row-actions"><button data-act="outdent" title="Outdent (Shift+Tab)" ${n.level === 0 ? 'disabled' : ''}>← Outdent</button><button data-act="indent" title="Indent (Tab)" ${canIndent(rows, n.i) ? '' : 'disabled'}>Indent →</button><button data-act="dup">Duplicate</button><button data-act="del" class="danger">Delete</button></div></div>`;
  return html;
}
function renderOutline() {
  const act = document.activeElement;
  let keep = null;
  if (act && outline.contains(act) && act.closest('[data-id]')) keep = { id: act.closest('[data-id]').dataset.id, f: act.dataset.f || (act.classList.contains('nm') ? 'nm' : null), a: act.selectionStart, b: act.selectionEnd };
  const rows = state.rows, info = derive(rows), S = state.settings;
  const palette = paletteOf(S).colors;
  if (S.colorBy === 'row' && scene && scene.cidx) info.forEach(n => { if (scene.cidx[n.row.id] != null) n.colorIdx = scene.cidx[n.row.id]; }); // the same colours as the chart
  const who = Array.from(new Set(rows.flatMap(r => splitNames(r.assignee))));
  const picked = new Set(selIds());
  let html = '';
  info.forEach(n => {
    const r = n.row, c = rowBaseColor(info, n, palette);
    const color = n.sub ? mix(c, '#ffffff', 0.45) : c;
    html += `<div class="orow lvl${n.level}${picked.has(r.id) ? ' sel' : ''}" data-id="${r.id}">
      <span class="grip" title="Drag to reorder">⋮⋮</span><span class="indent" style="width:${n.level * 14}px"></span>
      <span class="dot${n.milestone ? ' ms' : ''}" style="background:${color}"></span>
      <input class="nm" value="${esc(r.name)}" placeholder="${n.milestone ? 'Milestone' : n.isArea ? 'Area name' : 'Task name'}" aria-label="Name" autocomplete="off">
      <span class="dates">${fmtRange(n)}</span>
      <button class="more${r.id === detailId ? ' on' : ''}" data-act="toggle" title="${r.id === detailId ? 'Hide details' : 'Edit details'}" aria-label="Edit details" aria-expanded="${r.id === detailId}"><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button></div>`;
    if (r.id === detailId) html += detailHtml(n, info, rows);
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
  if (id === sel && !multi.size) return;
  // select without rebuilding the row, so the caret lands where the user clicked
  sel = id; multi = new Set();
  renderChart();
  $$('.orow.sel', outline).forEach(el => el.classList.remove('sel'));
  row.classList.add('sel');
  syncAddNote();
});
outline.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  const host = e.target.closest('[data-id]');
  if (!host) return;
  const id = host.dataset.id;
  if (act) {
    const a = act.dataset.act;
    if (a === 'toggle') { detailId = detailId === id ? null : id; renderOutline(); const d = $(`.detail[data-id="${id}"]`); if (d && detailId) d.scrollIntoView({ block: 'nearest' }); }
    else if (a === 'progress-clear') setRowProgress(id, null);
    else if (a === 'assignee-del') removeAssignee(id, +act.dataset.i);
    else if (a === 'indent') shiftLevel(id, 1);
    else if (a === 'outdent') shiftLevel(id, -1);
    else if (a === 'del') askDelete(id);
    else if (a === 'dup') duplicateRow(id);
    else if (a === 'dep-rm') { const r = state.rows[rowIndex(id)]; r.deps = r.deps.filter(d => d !== act.dataset.dep); commit(); refresh(); }
    return;
  }
  const ms = e.target.closest('.seg[data-f="ms-align"] button');
  if (ms) { setRowMs(id, ms.dataset.v); return; }
  const sw = e.target.closest('.sw');
  if (sw) { if (sw.dataset.color != null) setRowColor(id, sw.dataset.color); return; }
  const segBtn = e.target.closest('.seg[data-f="type"] button');
  if (segBtn) {
    if (!segBtn.classList.contains('on')) setType(id, segBtn.dataset.v);
    return;
  }
  if (host.classList.contains('orow') && !e.target.closest('input,.grip')) { if (e.shiftKey || e.ctrlKey || e.metaKey) multiSelect(id, e.shiftKey ? 'range' : 'toggle'); else select(id); }
});
// shift / ctrl-click on a row's name picks it instead of editing it
outline.addEventListener('mousedown', e => {
  if (!e.target.classList.contains('nm') || !(e.shiftKey || e.ctrlKey || e.metaKey) || e.button) return;
  e.preventDefault();
  multiSelect(e.target.closest('.orow').dataset.id, e.shiftKey ? 'range' : 'toggle');
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
  if (t.dataset && t.dataset.f === 'assignee-add') { const host = t.closest('[data-id]'); if (host) assigneeKey(e, host.dataset.id); return; }
  if (!t.classList.contains('nm')) return;
  const id = t.closest('.orow').dataset.id;
  const i = rowIndex(id);
  if (e.key === 'Enter') { e.preventDefault(); commit(); addRow(state.rows[i].type === 'milestone' ? 'task' : 'task', id, e.shiftKey); }
  else if (e.key === 'Tab') { e.preventDefault(); shiftLevel(id, e.shiftKey ? -1 : 1); }
  else if (e.key === 'Backspace' && t.value === '' && state.rows.length > 1 && blockEnd(state.rows, i) > i + 1) { e.preventDefault(); askDelete(id); }
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
  // dragging one of several selected rows takes them all
  const picked = selIds(), group = picked.length > 1 && picked.includes(id);
  if (group) { const moving = new Set(selectedBlocks().map(r => r.id)); state.rows.forEach((r, q) => { if (moving.has(r.id)) els[q].classList.add('dragging'); }); }
  else els.slice(i, j).forEach(el => el.classList.add('dragging'));
  let gplan = null;
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
    $$('.orow.drop-into', outline).forEach(el => el.classList.remove('drop-into'));
    if (group) {
      gplan = planGroupMove(k, lv0 + Math.round((ev.clientX - x0) / 20), false);
      lv = gplan.level;
      line.hidden = !gplan.changed;
      line.style.top = ref - ob.top - 2 + 'px';
      line.style.left = 28 + lv * 14 + 'px';
      const gp = gplan.parentId ? rowIndex(gplan.parentId) : -1;
      if (gp >= 0 && gplan.changed && gp !== derive(state.rows)[i].parent) els[gp].classList.add('drop-into');
    } else {
      // dragging sideways changes the level: an area dropped under another becomes a task, its tasks subtasks
      lv = dropLevelFor(i, k, lv0 + Math.round((ev.clientX - x0) / 20));
      const stay = k >= i && k <= j;
      line.hidden = stay && lv === lv0;
      line.style.top = (stay ? els[i].getBoundingClientRect().top : ref) - ob.top - 2 + 'px';
      line.style.left = 28 + lv * 14 + 'px';
      // outline the row it would land inside
      const pi = dropParentIndex(i, k, lv);
      if (pi >= 0 && !line.hidden && pi !== derive(state.rows)[i].parent) els[pi].classList.add('drop-into');
    }
    const bb = body.getBoundingClientRect();
    if (y < bb.top + 30) body.scrollTop -= 12; else if (y > bb.bottom - 30) body.scrollTop += 12;
  };
  const up = () => {
    grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
    if (group) { if (gplan && gplan.changed) { applyGroupMove(gplan); commit(); } }
    else if (moveBlock(i, k, lv)) { sel = id; commit(); }
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
  drag = { role, id, x: e.clientX, y: e.clientY, k: scene.w / box.width, left: box.left, top: box.top, ppd: scene.ppd, moved: false, rect, mod: e.shiftKey ? 'range' : (e.ctrlKey || e.metaKey) ? 'toggle' : null };
  if (role !== 'row' && role !== 'title' && role !== 'timeline') drag.range = scene.range.slice();
  if (role === 'move') {
    const i = n.i; drag.i = i; drag.lv0 = n.level;
    // dragging one of several selected items moves them all
    const picked = selIds(), group = picked.length > 1 && picked.includes(id) ? picked : [id], seen = new Set();
    drag.block = [];
    group.forEach(gid => { const gi = rowIndex(gid); state.rows.slice(gi, blockEnd(state.rows, gi)).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); drag.block.push({ r, s: r.start, e: r.end }); } }); });
    drag.multi = group.length > 1;
  }
  else if (role === 'resize-l' || role === 'resize-r') drag.orig = { s: n.row.start, e: n.row.end };
  else if (role === 'progress') { drag.bx = n.bx; drag.bw = n.bw; }
  else if (role === 'today') drag.orig = state.settings.todayDate != null ? state.settings.todayDate : todayDay();
  else if (role === 'row') { drag.i = n.i; drag.lv0 = n.level; }
});
/** work out where the dragged row (with everything inside it) would land, and show a drop line there */
/** index of the row a block would end up inside if dropped before row k at `level` (-1 = the top level) */
function dropParentIndex(i, k, level) {
  const rows = state.rows, j = blockEnd(rows, i), stay = k >= i && k <= j;
  for (let q = (stay ? i : k) - 1; q >= 0; q--) {
    if (q >= i && q < j) continue; // the dragged rows themselves
    if (rows[q].level < level) return q;
  }
  return -1;
}
/** the level to drop at, from what is under the pointer: over an area's tasks means inside that area */
function pointerLevel(y, fallback) {
  let under = null;
  for (const n of scene.info) if (!n.lane && n.y <= y + 0.5) under = n; // the last row that starts above the pointer
  if (!under) return fallback;
  if (under.isArea && y >= under.cy) return 1; // the lower half of an area's own heading row counts as inside it
  return under.level;
}
/** dragging an area: it can only land between areas, so take the boundary nearest the pointer — never a spot inside another area */
function areaDropIndex(y) {
  const info = scene.info, tops = [];
  info.forEach((n, i) => { if (n.level === 0) tops.push(i); });
  if (!tops.length) return info.length;
  for (let t = 0; t < tops.length; t++) {
    const s = tops[t], e = t + 1 < tops.length ? tops[t + 1] : info.length, blk = info.slice(s, e);
    const y0 = Math.min(...blk.map(n => n.y)), y1 = Math.max(...blk.map(n => n.y + n.h));
    if (y < y0) return s;
    if (y <= y1) return y < (y0 + y1) / 2 ? s : e;
  }
  return info.length;
}
/** where the selected items (each with what is inside it) would land if dropped before row k, at the level `want` asks for */
function planGroupMove(k, want, existingOnly) {
  const rows = state.rows, blocks = selectedBlocks(), inSel = new Set(blocks.map(r => r.id));
  const rest = rows.filter(r => !inSel.has(r.id));
  const pos = rows.slice(0, k).filter(r => !inSel.has(r.id)).length; // the slot among the rows left behind
  const prev = rest[pos - 1], next = rest[pos], idx = new Map(rows.map((r, i) => [r.id, i]));
  const max = prev ? Math.min(2, prev.level + 1) : 0;
  const origParents = new Set(); // what the selection came out of still counts as an existing parent
  let rootEnd = -1;
  blocks.forEach(r => {
    const i = idx.get(r.id);
    if (i < rootEnd) return;
    rootEnd = blockEnd(rows, i);
    for (let q = i - 1; q >= 0; q--) if (rows[q].level < r.level) { origParents.add(rows[q].id); break; }
  });
  const parentOf = lv => { for (let q = pos - 1; q >= 0; q--) if (rest[q].level < lv) return q; return -1; };
  let level = clamp(want, 0, max);
  if (next && next.level > level) level = Math.min(next.level, max); // dropped in front of deeper rows, it joins them rather than adopting them
  if (existingOnly) while (level > 0) { // never turn a plain row into an area
    const p = parentOf(level);
    if (p < 0 || origParents.has(rest[p].id) || blockEnd(rest, p) > p + 1) break;
    level = rest[p].level;
  }
  const pi = level > 0 ? parentOf(level) : -1;
  const levels = new Map();
  let delta = 0; rootEnd = -1; // every selected item lands on that level, taking its contents along
  blocks.forEach(r => {
    const i = idx.get(r.id);
    if (i >= rootEnd) { delta = level - r.level; rootEnd = blockEnd(rows, i); }
    levels.set(r.id, clamp(r.level + delta, 0, 2));
  });
  const order = rest.slice(0, pos).concat(blocks, rest.slice(pos));
  return { order, levels, level, parentId: pi >= 0 ? rest[pi].id : null, changed: order.some((r, i) => r !== rows[i]) || blocks.some(r => levels.get(r.id) !== r.level) };
}
function applyGroupMove(plan) {
  plan.order.forEach(r => { if (plan.levels.has(r.id)) r.level = plan.levels.get(r.id); });
  state.rows = plan.order;
  normalizeLevels(state.rows);
}
/** dragging several selected bars up or down the chart: show where they would all land */
function reorderGroup(y) {
  const info = scene.info;
  const areaSel = selectedBlocks().some(r => { const n = info.find(x => x.row.id === r.id); return n && n.isArea; }); // areas move between areas, never into one
  let k = info.length;
  if (areaSel) k = areaDropIndex(y);
  else for (let x = 0; x < info.length; x++) if (y < (info[x].dropCy != null ? info[x].dropCy : info[x].cy)) { k = x; break; }
  const want = areaSel ? 0 : pointerLevel(y, drag.lv0), plan = planGroupMove(k, want, true);
  drag.k2 = k; drag.gwant = want; drag.dropLevel = plan.level;
  drag.dropY = !plan.changed ? null : k < info.length ? info[k].y - (info[k].isArea && k > 0 ? 5 : 0) : info[info.length - 1].y + info[info.length - 1].h;
  drag.dropBox = null;
  const pi = plan.parentId ? state.rows.findIndex(r => r.id === plan.parentId) : -1;
  if (plan.changed && pi >= 0 && pi !== info[drag.i].parent) {
    const blk = info.slice(pi, blockEnd(state.rows, pi));
    drag.dropBox = { id: plan.parentId, y0: Math.min(...blk.map(n => n.y)), y1: Math.max(...blk.map(n => (n.y + n.h))) };
  }
}
function reorderTarget(dx, y) {
  const info = scene.info;
  const areaDrag = !!(info[drag.i] && info[drag.i].isArea); // an area moves between areas, never into one
  let k = info.length;
  if (areaDrag) k = areaDropIndex(y);
  else for (let x = 0; x < info.length; x++) if (y < (info[x].dropCy != null ? info[x].dropCy : info[x].cy)) { k = x; break; }
  drag.k2 = k;
  const j = blockEnd(state.rows, drag.i);
  const stay = k >= drag.i && k <= j;
  drag.dropLevel = dropLevelFor(drag.i, k, areaDrag ? 0 : pointerLevel(y, drag.lv0), true);
  const at = stay ? drag.i : k;
  drag.dropY = stay && drag.dropLevel === drag.lv0 ? null : at < info.length ? info[at].y - (info[at].isArea && at > 0 ? 5 : 0) : info[info.length - 1].y + info[info.length - 1].h;
  // dropping somewhere new inside an area: outline that area
  const pi = dropParentIndex(drag.i, k, drag.dropLevel);
  drag.dropBox = null;
  if (pi >= 0 && drag.dropY != null && pi !== info[drag.i].parent) {
    const blk = info.slice(pi, blockEnd(state.rows, pi));
    drag.dropBox = { id: state.rows[pi].id, y0: Math.min(...blk.map(n => n.y)), y1: Math.max(...blk.map(n => (n.y + n.h))) };
  }
}
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
  const py = (e.clientY - drag.top) * drag.k;
  if (drag.role === 'move') {
    const pack = state.settings.pack;
    // a mostly-sideways drag moves the item in time; a mostly-vertical one moves it between rows and areas
    if (!pack && drag.mode == null) drag.mode = Math.abs(dy) > Math.abs(dx) ? 'reorder' : 'time';
    if (!pack && drag.mode === 'reorder') { if (drag.multi) reorderGroup(py); else reorderTarget(dx, py); drag.reorder = true; }
    else {
      drag.block.forEach(b => { b.r.start = b.s + dd; b.r.end = b.e + dd; });
      // with tasks in sequence, dragging up or down picks which row the task continues,
      // or — over a row that belongs to another area — moves it into that area
      if (pack && drag.block.length === 1) {
        const me = scene.info.find(n => n.row.id === drag.id);
        const at = scene.info.filter(n => !n.lane && n.vrow !== me.vrow && py >= n.y && py < n.y + n.h);
        // the lines (visual rows) this task's siblings occupy: the lower part of a line, or the gap under it, means "a new line below it"
        const sibs = scene.info.filter(n => !n.lane && !n.hasKids && n.parent === me.parent && n.level === me.level);
        const lines = [];
        sibs.forEach(n => { if (!lines.some(l => l.v === n.vrow)) lines.push({ v: n.vrow, y: n.y, h: n.h }); });
        lines.sort((a, b) => a.y - b.y);
        let nl = null;
        for (let q = 0; q < lines.length && nl == null; q++) {
          const R = lines[q], nx = lines[q + 1];
          if (py >= R.y + R.h * 0.7 && py < R.y + R.h) nl = R;
          else if (nx && py >= R.y + R.h && py < nx.y) nl = R;
        }
        const lastLine = lines[lines.length - 1];
        if (nl == null && lastLine && py >= lastLine.y + lastLine.h && py < lastLine.y + lastLine.h * 2) nl = lastLine; // just below the last line
        const alone = sibs.filter(n => n.vrow === me.vrow).length === 1;
        if (nl && nl.v === me.vrow && alone) nl = null; // already on a line of its own
        drag.newLineAfter = nl ? nl.v : null;
        const over = nl ? null : at.find(n => !n.hasKids && n.parent === me.parent);
        drag.toRow = over ? over.vrow : null; drag.toRowY = over ? over.y : null;
        drag.reorder = !over && !nl && at.length > 0 && at.every(n => n.parent !== me.parent || n.hasKids);
        if (drag.reorder) reorderTarget(dx, py);
        else if (nl) { drag.dropY = nl.y + nl.h; drag.dropLevel = me.level; drag.dropBox = null; }
        else drag.dropY = null;
      }
    }
  }
  else if (drag.role === 'resize-l') row.start = Math.min(drag.orig.s + dd, drag.orig.e);
  else if (drag.role === 'resize-r') row.end = Math.max(drag.orig.e + dd, drag.orig.s);
  else if (drag.role === 'progress') row.progress = clamp(Math.round((((e.clientX - drag.left) * drag.k - drag.bx) / drag.bw) * 20) * 5, 0, 100);
  else if (drag.role === 'today') state.settings.todayDate = drag.orig + dd;
  else if (drag.role === 'row') reorderTarget(dx, py);
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
    if (d.role === 'move' && d.reorder && d.k2 != null) {
      if (d.multi) { const plan = planGroupMove(d.k2, d.gwant, true); if (plan.changed) applyGroupMove(plan); } // several selected bars move together
      else moveBlock(d.i, d.k2, d.dropLevel);
    }
    if (d.role === 'move' && d.toRow != null) {
      // list it straight after the task it should follow on that row (or before the row's first task)
      const me = scene.info.find(n => n.row.id === d.id);
      const mates = scene.info.filter(n => n.vrow === d.toRow && n !== me).sort((a, b) => a.start - b.start);
      const before = mates.filter(n => n.end < me.start).pop();
      me.row.newLine = false; // it joins that line again
      if (mates.length) moveBlock(me.i, before ? before.i + 1 : mates[0].i, mates[0].level);
    } else if (d.role === 'move' && d.newLineAfter != null && d.moved) {
      // a line of its own, listed after everything already on the line it was dropped under (so those keep their place)
      const me = scene.info.find(n => n.row.id === d.id);
      const mates = scene.info.filter(n => n.vrow === d.newLineAfter && n !== me);
      me.row.newLine = true;
      if (mates.length) { const lastMate = mates.reduce((a, b) => (b.i > a.i ? b : a)); moveBlock(me.i, blockEnd(state.rows, lastMate.i), lastMate.level); }
    }
    commit(); refresh();
    if (d.id) { const el = $(`.orow[data-id="${d.id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
  } else if (d.role === 'title') editTitle(d.rect);
  else if (d.role === 'timeline') openPop('timeline', d.rect, null, d.x - 60);
  else if (d.role === 'today') openPop('today', d.rect, null, d.x - 60);
  else if (d.id && d.mod) multiSelect(d.id, d.mod);
  else if (d.id) {
    // the chart re-renders on selection, so double-clicks are detected here rather than via dblclick
    const now = Date.now(), dbl = lastClick.id === d.id && now - lastClick.t < 450;
    lastClick = { id: d.id, t: now };
    if (sel !== d.id) select(d.id);
    const isArea = !!(scene.info.find(n => n.row.id === d.id) || {}).isArea;
    if (d.role === 'row' && !isArea) { if (dbl) editRowName(d.id, d.rect); } // an area's name or heading opens its popover too
    else if (d.role === 'row' && dbl) editRowName(d.id, d.rect);
    else { openPop('row', d.rect, d.id, d.x - 60); if (dbl) { const inp = $('#pop-name'); if (inp) inp.select(); } }
  }
}
let lastClick = { id: null, t: 0 };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

// ---------------------------------------------------------------- design panel
const DESIGN = [
  ['canvas', 'Canvas', [
    { type: 'head', label: 'Title' },
    { k: 'showTitle', type: 'toggle', label: 'Show title' },
    { k: 'title', type: 'text', label: 'Title', sub: true, ph: 'Chart title', when: s => s.showTitle },
    { k: 'titleScale', type: 'seg', label: 'Title size', num: true, opts: [[0.8, 'Small'], [1, 'Regular'], [1.3, 'Large']], when: s => s.showTitle },
    { type: 'head', label: 'Size' },
    { k: 'canvas', type: 'select', label: 'Size', opts: CANVASES.map(c => [c.id, c.name]).concat([['custom', 'Custom size…']]) },
    { k: 'canvasW', type: 'number', label: 'Width (in)', sub: true, min: 3, max: 40, step: 0.1, when: s => s.canvas === 'custom' },
    { k: 'canvasH', type: 'number', label: 'Height (in)', sub: true, min: 2, max: 40, step: 0.1, when: s => s.canvas === 'custom' },
    { k: 'fit', type: 'seg', label: 'Canvas height', opts: [['content', 'Fit content'], ['fixed', 'Fixed']] },
    { k: '_canvasInfo', type: 'info', id: 'canvas-info' },
  ]],
  ['timeline', 'Timeline', [
    { type: 'head', label: 'Scale' },
    { k: 'scale', type: 'seg', label: 'Periods', col: true, opts: [['days', 'Days'], ['weeks', 'Weeks'], ['sprints', 'Sprints'], ['months', 'Months'], ['quarters', 'Qtrs']] },
    { k: 'sprintWeeks', type: 'seg', label: 'A sprint is', num: true, opts: [[1, '1 wk'], [2, '2 wk'], [3, '3 wk'], [4, '4 wk']], when: s => s.scale === 'sprints' },
    { type: 'head', label: 'Span' },
    { k: 'rangeMode', type: 'seg', label: 'Overall span', opts: [['auto', 'Fit to tasks'], ['fixed', 'Fixed']] },
    { k: 'rangeStart', type: 'date', label: 'From', sub: true, when: s => s.rangeMode === 'fixed' },
    { k: 'rangeEnd', type: 'date', label: 'To', sub: true, when: s => s.rangeMode === 'fixed' },
    { k: '_len', type: 'dur', label: 'Or length from start', sub: true, col: true, when: s => s.rangeMode === 'fixed' },
    { k: '_fit', type: 'button', label: 'Spread tasks across it', sub: true, act: 'fit', when: s => s.rangeMode === 'fixed' },
    { k: '_outInfo', type: 'info', id: 'out-info', when: s => outsideRows().length > 0 },
    { k: '_pull', type: 'button', label: 'Fit the items outside it…', sub: true, act: 'pull', when: s => outsideRows().length > 0 },
    { type: 'head', label: 'Header' },
    { k: 'dateMode', type: 'seg', label: 'Shown as', opts: [['calendar', 'Dates'], ['relative', 'Numbered']] },
    { k: 'datePos', type: 'seg', label: 'Position', opts: [['top', 'Top'], ['bottom', 'Bottom'], ['both', 'Both']] },
    { k: 'periodNames', type: 'toggle', label: 'Period names', when: s => s.dateMode !== 'relative' },
    { k: 'dateFormat', type: 'select', label: 'Date format', opts: [['text', 'Day and month (9 Dec)'], ['textY', 'With year (9 Dec 2026)'], ['num', 'Numbers (9/12)'], ['numY', 'Numbers, short year (9/12/26)'], ['numYY', 'Numbers, full year (9/12/2026)'], ['day', 'Day only (9)']] },
    { k: 'dateOrder', type: 'seg', label: 'Order', sub: true, opts: [['dmy', 'Day first'], ['mdy', 'Month first']], when: s => s.dateFormat !== 'day' },
    { k: '_dateEx', type: 'info', id: 'date-ex' },
    { type: 'head', label: 'Gridlines' },
    { k: 'gridCells', type: 'toggle', label: 'Period lines' },
    { k: 'gridMonths', type: 'toggle', label: 'Month lines', when: s => s.dateMode !== 'relative' },
    { k: 'weekends', type: 'toggle', label: 'Shade weekends', when: s => s.scale === 'days' },
    { type: 'head', label: 'Milestones' },
    { k: 'msLines', type: 'toggle', label: 'Milestone guide lines' },
    { k: 'msAlign', type: 'seg', label: 'Milestone sits at', col: true, opts: [['auto', 'Auto'], ['start', 'Day start'], ['middle', 'Middle'], ['end', 'Day end']] },
  ]],
  ['tasks', 'Tasks', [
    { type: 'head', label: 'Rows' },
    { k: 'pack', type: 'seg', label: 'Row layout', bool: true, opts: [['false', 'One per task'], ['true', 'In sequence']] },
    { k: 'density', type: 'seg', label: 'Row height', opts: [['compact', 'Compact'], ['auto', 'Auto'], ['roomy', 'Roomy']] },
    { k: 'corners', type: 'seg', label: 'Corners', opts: [['square', 'Square'], ['rounded', 'Rounded'], ['pill', 'Pill']] },
    { k: 'stripes', type: 'toggle', label: 'Row stripes' },
    { type: 'head', label: 'Names' },
    { k: 'taskLabels', type: 'seg', label: 'Task names', opts: [['left', 'On the left'], ['bars', 'On the bars']] },
    { k: '_packNote', type: 'note', label: 'Task names sit on the bars while Rows is set to “In sequence”, because a row can hold several tasks. Switch Rows to “One per task” to put them on the left.', when: s => s.pack },
    { k: 'areaLabels', type: 'seg', label: 'Area names', opts: [['row', 'As headings'], ['side', 'At the side']], when: () => derive(state.rows).some(n => n.isArea) },
    { k: 'textCase', type: 'seg', label: 'Name case', opts: [['default', 'Default'], ['upper', 'UPPER'], ['title', 'Title Case']] },
    { k: 'overflow', type: 'seg', label: 'Long names', col: true, opts: [['outside', 'Move outside'], ['shrink', 'Shrink'], ['truncate', 'Truncate']] },
    { k: 'wrapNames', type: 'toggle', label: 'Wrap to two lines first' },
    { type: 'head', label: 'Extras' },
    { k: 'assignees', type: 'toggle', label: 'Assignees' },
    { k: 'assigneePos', type: 'seg', label: 'Placed', sub: true, opts: [['under', 'Under'], ['beside', 'Beside'], ['bars', 'On bar']], when: s => s.assignees },
    { k: 'assigneeNames', type: 'toggle', label: 'Show names', sub: true, when: s => s.assignees && s.assigneePos === 'bars' },
    { k: 'assigneeAvatar', type: 'toggle', label: 'Show initials avatar', sub: true, when: s => s.assignees && s.assigneePos !== 'bars' },
    { k: 'assigneeAreas', type: 'toggle', label: 'Include areas', sub: true, when: s => s.assignees },
    { k: 'assigneeLevel', type: 'seg', label: 'For', sub: true, opts: [['tasks', 'Tasks'], ['subtasks', 'Subtasks'], ['all', 'Both']], when: s => s.assignees },
    { k: 'deps', type: 'toggle', label: 'Dependency lines' },
  ]],
  ['progress', 'Progress', [
    { type: 'head', label: 'Date marker' },
    { k: 'todayLine', type: 'toggle', label: 'Date marker' },
    { k: 'todayDate', type: 'date', label: 'Date', sub: true, when: s => s.todayLine },
    { k: 'markerLabelOn', type: 'toggle', label: 'Show label', sub: true, when: s => s.todayLine },
    { k: 'todayLabel', type: 'text', label: 'Label text', sub: true, ph: 'Today', when: s => s.todayLine && s.markerLabelOn !== false },
    { k: 'markerStyle', type: 'seg', label: 'Line', sub: true, opts: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], when: s => s.todayLine },
    { k: 'markerWidth', type: 'seg', label: 'Thickness', sub: true, num: true, opts: [[1, 'Thin'], [2, 'Regular'], [3, 'Bold']], when: s => s.todayLine },
    { k: 'markerColor', type: 'markercolor', label: 'Colour', sub: true, col: true, when: s => s.todayLine },
    { type: 'head', label: 'Progress in bars' },
    { k: 'progressMode', type: 'seg', label: 'Progress in bars', col: true, opts: [['off', 'Off'], ['manual', 'Set per bar'], ['marker', 'Up to date marker']] },
    { k: '_markerNote', type: 'note', label: 'Turn on the date marker (above) to show progress up to it. Until then each bar shows the value set on it.', when: s => s.progress && s.progressSource === 'marker' && !s.todayLine },
    { k: 'progressStyle', type: 'seg', label: 'Progress style', sub: true, col: true, opts: [['pale', 'Pale unfinished'], ['shade', 'Darker finished']], when: s => s.progress },
    { k: '_progNote', type: 'note', label: '“Pale unfinished” tints the part still to do, so bars at 0% look washed out. “Darker finished” keeps every bar in its palette colour, with the same label colour throughout.', when: s => s.progress },
    { type: 'head', label: 'Days left' },
    { k: 'daysLeft', type: 'toggle', label: 'Days left' },
    { k: 'planDaysLeft', type: 'toggle', label: 'Days left for the whole plan' },
    { k: 'daysLeftWeekdays', type: 'toggle', label: 'Count weekdays only', sub: true, when: s => s.daysLeft || s.planDaysLeft },
    { k: 'daysOff', type: 'daysoff', label: 'Non-working days', sub: true, col: true, when: s => s.daysLeft || s.planDaysLeft },
    { k: '_dlNote', type: 'note', label: 'Counted from the date marker’s date (today unless you set one): to the end of each item, and for the whole plan to its last item. Non-working days (holidays, freezes) are never counted. The plan’s count appears beside the marker’s label (top right if the marker is off).', when: s => s.daysLeft || s.planDaysLeft },
    { type: 'head', label: 'Changes from original' },
    { k: 'showChanges', type: 'toggle', label: 'Changes from original' },
    { k: 'changesLegend', type: 'toggle', label: 'Legend and notes', sub: true, when: s => s.showChanges },
    { k: '_baseInfo', type: 'info', id: 'base-info', when: s => s.showChanges },
    { k: '_baseBtn', type: 'button', label: 'Update or remove baseline…', sub: true, act: 'baseline', when: s => s.showChanges },
  ]],
  ['colour', 'Colour', [
    { type: 'palette' },
    { k: 'colorBy', type: 'seg', label: 'Share a colour by', opts: [['group', 'Area'], ['row', 'Row']] },
    { k: '_colorByNote', type: 'note', label: 'Area: an area and everything in it share a colour. Row: each line takes the next colour, and tasks sharing a line (Tasks → Row layout → In sequence) match.', when: s => s.colorBy === 'row' || s.pack },
    { k: 'bgTransparent', type: 'toggle', label: 'Transparent background' },
    { k: 'bg', type: 'color', label: 'Background', when: s => !s.bgTransparent },
    { k: 'textMode', type: 'seg', label: 'Text colour', opts: [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']] },
    { k: 'barText', type: 'seg', label: 'Text on bars', sub: true, opts: [['auto', 'Auto'], ['light', 'White'], ['dark', 'Dark']], when: s => s.pack || s.taskLabels === 'bars' },
  ]],
  ['text', 'Text', [
    { k: 'font', type: 'select', label: 'Font', opts: FONTS.map(f => [f, f]) },
    { k: 'textAuto', type: 'toggle', label: 'Automatic text size' },
    { k: 'textPt', type: 'number', label: 'Text size (pt)', sub: true, min: 5, max: 48, step: 0.5, when: s => !s.textAuto },
    { k: '_textInfo', type: 'info', id: 'text-info' },
  ]],
];
const designEl = $('#design');
const designCtl = {};
function buildDesign() {
  let html = '';
  DESIGN.forEach(([id, title, ctls]) => {
    const open = ui.designOpen[id] !== false;
    html += `<section class="group${open ? '' : ' collapsed'}" data-sec="${id}"><h3><button class="ghead" data-sec-toggle="${id}" aria-expanded="${open}" aria-controls="sec-${id}"><i class="chev" aria-hidden="true"></i><span class="gt">${title}</span><span class="gsum" data-sum="${id}"></span></button></h3><div class="gbody" id="sec-${id}">`;
    ctls.forEach(c => {
      if (c.k) designCtl[c.k] = c;
      if (c.type === 'head') { html += `<h4 class="ghd">${c.label}</h4>`; return; }
      const cls = `ctl${c.sub ? ' sub' : ''}${c.col || c.type === 'themes' ? ' col' : ''}`;
      const lbl = `<span class="lbl">${c.label || ''}</span>`;
      if (c.type === 'palette') html += paletteHtml();
      else if (c.type === 'seg') html += `<div class="${cls}" data-w="${c.k}">${lbl}<div class="seg" data-k="${c.k}">${c.opts.map(o => `<button data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
      else if (c.type === 'toggle') html += `<label class="${cls}" data-w="${c.k}">${lbl}<span class="switch"><input type="checkbox" data-k="${c.k}"><i></i></span></label>`;
      else if (c.type === 'color') html += `<div class="${cls}" data-w="${c.k}">${lbl}<span class="color"><input class="inp hex" data-k="${c.k}" data-hex maxlength="7" spellcheck="false" aria-label="${c.label} hex"><input type="color" data-k="${c.k}" aria-label="${c.label}"></span></div>`;
      else if (c.type === 'dur') html += `<div class="${cls}" data-w="${c.k}">${lbl}${durControl(0, 6, 'len-n', 'len-u')}</div>`;
      else if (c.type === 'info') html += `<p class="ctl-note" id="${c.id}" data-w="${c.k}"></p>`;
      else if (c.type === 'markercolor') html += `<div class="${cls}" data-w="${c.k}">${lbl}<div class="swatches mk-sw"></div></div>`;
      else if (c.type === 'note') html += `<p class="ctl-note" data-w="${c.k}">${c.label}</p>`;
      else if (c.type === 'daysoff') html += `<div class="${cls}" data-w="${c.k}">${lbl}<div class="off-list" id="off-list"></div><div class="off-add"><input class="inp" type="date" min="1990-01-01" max="2100-12-31" id="off-from" aria-label="From"><input class="inp" type="date" min="1990-01-01" max="2100-12-31" id="off-to" aria-label="To (optional)" title="To (optional, for a range)"><input class="inp off-name" id="off-name" placeholder="Label (optional)" maxlength="40" autocomplete="off"><button class="btn ghost" data-act="off-add">Add</button></div></div>`;
      else if (c.type === 'button') html += `<div class="${cls}" data-w="${c.k}"><button class="btn ghost wide" data-act="${c.act}">${c.label}</button></div>`;
      else if (c.type === 'select') html += `<label class="${cls}" data-w="${c.k}">${lbl}<select class="inp" style="width:170px" data-k="${c.k}">${c.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>`;
      else html += `<label class="${cls}" data-w="${c.k}">${lbl}<input class="inp" style="width:170px" type="${c.type}" data-k="${c.k}" placeholder="${c.ph || ''}"${c.type === 'date' ? ' min="1990-01-01" max="2100-12-31"' : ''}${c.type === 'number' ? ` min="${c.min}" max="${c.max}" step="${c.step}" inputmode="decimal"` : ''}></label>`;
    });
    html += '</div></section>';
  });
  designEl.innerHTML = html;
}
/** non-working days (holidays, company freezes): never counted by the days-left annotations */
function syncDaysOff() {
  const list = $('#off-list', designEl);
  if (!list) return;
  const off = state.settings.daysOff || [], sig = JSON.stringify(off);
  if (list.dataset.sig === sig) return;
  list.dataset.sig = sig;
  list.innerHTML = off.map((r, i) => `<span class="off-chip"><span>${r.from === r.to ? shortDate(r.from) : shortDate(r.from) + ' – ' + shortDate(r.to)}${r.label ? ' · ' + esc(r.label) : ''}</span><button class="x-btn" data-act="off-del" data-i="${i}" title="Remove" aria-label="Remove">✕</button></span>`).join('');
}
function daysOffAction(btn) {
  const S = state.settings, off = (S.daysOff || []).slice();
  if (btn.dataset.act === 'off-del') { off.splice(+btn.dataset.i, 1); setSetting('daysOff', off); return; }
  if (btn.dataset.act !== 'off-add') return;
  const f = isoToDay($('#off-from', designEl).value), t = isoToDay($('#off-to', designEl).value);
  if (f == null) { const el = $('#off-from', designEl); el.classList.add('bad'); el.focus(); setTimeout(() => el.classList.remove('bad'), 900); return; }
  const a = Math.min(f, t == null ? f : t), z = Math.max(f, t == null ? f : t);
  off.push({ from: a, to: z, label: $('#off-name', designEl).value.trim().slice(0, 40) });
  off.sort((x, y) => x.from - y.from);
  ['#off-from', '#off-to', '#off-name'].forEach(q => { $(q, designEl).value = ''; });
  setSetting('daysOff', off.slice(0, 60));
}
/** one line per section, shown when it is collapsed */
function designSummary(id, S) {
  const cv = canvasOf(S);
  if (id === 'canvas') return `${cv.name} · ${S.fit === 'fixed' ? 'fixed height' : 'fits content'}`;
  if (id === 'timeline') return [{ days: 'Days', weeks: 'Weeks', sprints: 'Sprints', months: 'Months', quarters: 'Quarters' }[S.scale] || '', S.rangeMode === 'fixed' ? 'fixed span' : 'fits tasks'].filter(Boolean).join(' · ');
  if (id === 'tasks') return [S.pack ? 'in sequence' : '', S.pack || S.taskLabels === 'bars' ? 'names on bars' : 'names left', S.assignees ? 'assignees' : '', S.deps ? 'dependencies' : ''].filter(Boolean).join(' · ');
  if (id === 'progress') return [S.todayLine ? 'date marker' : '', S.progress ? (S.progressSource === 'marker' ? 'progress to marker' : 'progress per bar') : '', S.daysLeft || S.planDaysLeft ? 'days left' : '', S.showChanges ? 'baseline' : ''].filter(Boolean).join(' · ') || 'nothing on';
  if (id === 'colour') return `<span class="gdots">${paletteOf(S).colors.slice(0, 7).map(c => `<i style="background:${c}"></i>`).join('')}</span>${S.bgTransparent ? 'transparent' : ''}`;
  if (id === 'text') return `${S.font}${S.textAuto === false ? ' · ' + S.textPt + ' pt' : ''}`;
  return '';
}
function setSectionOpen(id, open) {
  ui.designOpen[id] = open; saveUi();
  const sec = $(`.group[data-sec="${id}"]`, designEl);
  if (!sec) return;
  sec.classList.toggle('collapsed', !open);
  $('.ghead', sec).setAttribute('aria-expanded', String(open));
}
function syncDesign() {
  const S = state.settings;
  $$('[data-sum]', designEl).forEach(el => { const h = designSummary(el.dataset.sum, S); if (el.innerHTML !== h) el.innerHTML = h; });
  syncPalette();
  syncMarkerColor();
  // the gridline switches are named for what they actually draw at this scale
  const gc = $('[data-w="gridCells"] .lbl', designEl), gm = $('[data-w="gridMonths"] .lbl', designEl);
  if (gc) gc.textContent = { days: 'Day lines', weeks: 'Week lines', sprints: 'Sprint lines', months: 'Month lines', quarters: 'Quarter lines' }[S.scale] || 'Period lines';
  if (gm) gm.textContent = S.scale === 'months' || S.scale === 'quarters' ? 'Year lines' : 'Month lines';
  $$('[data-w]', designEl).forEach(w => { const c = designCtl[w.dataset.w]; w.hidden = !!(c.when && !c.when(S)); });
  $$('.seg[data-k]', designEl).forEach(seg => $$('button', seg).forEach(b => b.classList.toggle('on', String(seg.dataset.k === 'progressMode' ? (!S.progress ? 'off' : S.progressSource === 'marker' ? 'marker' : 'manual') : S[seg.dataset.k]) === b.dataset.v)));
  // in-sequence rows always carry names on the bars: show that, and lock the choice
  const tl = $('[data-w="taskLabels"]', designEl);
  tl.classList.toggle('disabled', !!S.pack);
  if (S.pack) $$('button', tl).forEach(b => b.classList.toggle('on', b.dataset.v === 'bars'));
  // the timeline's length, in the unit it divides into most naturally (weeks, sprints, months…)
  if (S.rangeMode === 'fixed' && S.rangeStart != null && S.rangeEnd != null) {
    const [n, u] = spanUnits(S.rangeStart, S.rangeEnd), ln = $('[data-f="len-n"]', designEl), lu = $('[data-f="len-u"]', designEl);
    if (ln && ln !== document.activeElement) ln.value = n;
    if (lu && lu !== document.activeElement) lu.value = u;
  }
  if (scene) { // sizes in real units, and a warning when a fixed canvas can't hold the plan
    const cv = scene.canvas, f = x => (Math.round(x * 100) / 100).toString();
    const ci = $('#canvas-info'), ti = $('#text-info');
    if (ci) { ci.textContent = scene.fixedPx && !scene.fits ? `⚠ Doesn't fit: the plan needs ${f(scene.needH / PX_PER_IN)} in of ${f(cv.h)} in. Use “Fit content”, remove rows, or pick a taller canvas.` : `${f(cv.w)} × ${f(cv.h)} in${scene.fixedPx ? '' : ' wide — height follows the plan'}`; ci.classList.toggle('warn', !!(scene.fixedPx && !scene.fits)); }
    syncDaysOff();
    const de = $('#date-ex');
    if (de) de.textContent = `Example: ${fmtDate(toDay(2026, 11, 9), { f: S.dateFormat || 'text', o: S.dateOrder || 'dmy' })} — also used for milestone dates, the legend and the panels.`;
    const oi = $('#out-info');
    if (oi) { const out = outsideRows(), early = out.filter(n => n.start < S.rangeStart).length, late = out.filter(n => n.end > S.rangeEnd).length; oi.textContent = `${out.length} ${out.length === 1 ? 'item sits' : 'items sit'} outside the timeline (${early} earlier, ${late} later).`; }
    const bi = $('#base-info');
    if (bi && S.showChanges) { const c = scene.info.filter(n => n.changed && !n.isArea).length; bi.textContent = `${S.baselineDate != null ? 'Baseline from ' + shortDate(S.baselineDate) + ' · ' : ''}${c} ${c === 1 ? 'item has' : 'items have'} changed.`; }
    if (ti) ti.textContent = `Names ${f(scene.fs * 0.75)} pt · dates ${f(scene.hs2 * 0.75)} pt, on a ${f(cv.w)} in wide canvas.`;
  }
  $$('input[data-k], select[data-k]', designEl).forEach(inp => {
    const k = inp.dataset.k;
    if (inp.type === 'checkbox') inp.checked = !!S[k];
    else if (inp === document.activeElement) return;
    else if (inp.type === 'date') inp.value = dayToIso(S[k] != null ? S[k] : todayDay());
    else inp.value = S[k] == null ? '' : S[k];
  });
}
/** if the marker's date was never chosen and today falls outside the timeline, put it mid-way through what is shown, where progress reads sensibly */
function ensureMarkerInView() {
  const S = state.settings;
  if (S.todayDate != null) return; // the user has already chosen a date
  const info = derive(state.rows);
  if (!info.length) return;
  let lo = Math.min(...info.map(n => n.start)), hi = Math.max(...info.map(n => n.end));
  if (S.rangeMode === 'fixed' && S.rangeStart != null && S.rangeEnd != null) { lo = S.rangeStart; hi = S.rangeEnd; }
  const t = todayDay();
  if (t >= lo && t <= hi) return;
  let d = Math.round((lo + hi) / 2);
  d -= Math.max(0, dow(d) - 4); // not on a weekend
  S.todayDate = d;
  toast(`Date marker placed at ${shortDate(d)} — drag it to where the plan really stands`);
}
function setSetting(k, v, soon) {
  const S = state.settings;
  if (k === 'progressMode') { // Off / typed per bar / read off the date marker
    S.progress = v !== 'off';
    if (v !== 'off') S.progressSource = v;
    if (v === 'marker') { // progress up to the marker needs the marker, and somewhere sensible to put it
      if (!S.todayLine) S.markerAuto = true; // remember that progress switched it on, so switching progress off takes it away again
      S.todayLine = true; ensureMarkerInView();
    } else if (S.markerAuto && S.todayLine) { S.todayLine = false; S.markerAuto = false; }
    refresh(); commit();
    return;
  }
  if (k === 'canvas' && v === 'custom') { const c = canvasOf(S); S.canvasW = Math.round(c.w * 100) / 100; S.canvasH = Math.round(c.h * 100) / 100; }
  if (k === 'textAuto' && v === false && scene) S.textPt = Math.round(scene.fs * 0.75 * 2) / 2; // start the override from what Auto was using
  if (k === 'rangeMode' && v === 'fixed' && (S.rangeStart == null || S.rangeEnd == null)) [S.rangeStart, S.rangeEnd] = autoSpan();
  if ((k === 'rangeStart' || k === 'rangeEnd' || k === 'todayDate') && v != null && !plausibleDay(v)) return; // half-typed years are ignored
  if (k === 'rangeStart' && S.rangeEnd != null && v > S.rangeEnd) S.rangeEnd = v + (S.rangeEnd - S.rangeStart); // a later start carries the end along
  if (k === 'rangeEnd' && S.rangeStart != null && v < S.rangeStart) return; // an end can't come before the start: nothing changes (a date being typed passes through such values)
  if (k === 'todayLine') S.markerAuto = false; // the marker is now something the user chose
  if (k === 'showChanges' && v && !hasBaseline()) setBaseline(); // the first time, the baseline is the plan as it stands
  if (k === 'progressSource' && v === 'marker') S.todayLine = true; // progress up to the marker needs the marker
  state.settings[k] = v;
  if (k === 'font') ensureFont();
  renderChart(); syncDesign(); syncPop();
  if (k === 'sprintWeeks' || k === 'dateFormat' || k === 'dateOrder') renderOutline();
  if (soon) commitSoon(); else commit();
}
designEl.addEventListener('click', e => {
  const offAct = e.target.closest('[data-act^="off-"]');
  if (offAct) { daysOffAction(offAct); return; }
  const peBtn = e.target.closest('[data-pe]');
  if (peBtn) { peUi.sel = +peBtn.dataset.pe; syncPalEditor(); return; }
  const peAct = e.target.closest('[data-act^="pe-"]');
  if (peAct && !peAct.disabled) { peAction(peAct); return; }
  const mineBtn = e.target.closest('[data-mine]');
  if (mineBtn) { const m = (ui.myPalettes || [])[+mineBtn.dataset.mine]; if (m) { peUi.sel = 0; peCommit(m.colors.slice()); } return; }
  const gh = e.target.closest('[data-sec-toggle]');
  if (gh) { setSectionOpen(gh.dataset.secToggle, gh.getAttribute('aria-expanded') !== 'true'); return; }
  if (markerColorEvent(e, 'click')) return;
  const pb = e.target.closest('[data-palette]');
  if (pb) { applyPalette(PRESETS[+pb.dataset.palette]); return; }
  const sb = e.target.closest('[data-scheme]');
  if (sb) { const seed = paletteOf(state.settings).seed; if (seed) applyPalette(suggestPalettes(seed)[+sb.dataset.scheme]); return; }
  if (e.target.closest('[data-act="fit"]')) { fitPlan(); return; }
  if (e.target.closest('[data-act="pull"]')) { outsideDialog(); return; }
  if (e.target.closest('[data-act="baseline"]')) { baselineDialog(); return; }
  const b = e.target.closest('.seg[data-k] button');
  if (b) { const k = b.parentNode.dataset.k; setSetting(k, designCtl[k].num ? +b.dataset.v : designCtl[k].bool ? b.dataset.v === 'true' : b.dataset.v); }
});
designEl.addEventListener('input', e => {
  const t = e.target, k = t.dataset.k;
  if (markerColorEvent(e, 'input')) return;
  if (t.dataset.pehex != null) { const hex = parseColor(t.value); if (hex) peEdit(hex); return; }
  if (t.dataset.pecolor != null) { peEdit(t.value); return; }
  if (t.dataset.seed != null || t.dataset.seedpick != null) { const hex = parseColor(t.value); if (hex) applySeed(hex); return; }
  if (!k) return;
  if (t.type === 'checkbox') setSetting(k, t.checked);
  else if (t.type === 'color') setSetting(k, t.value, true);
  else if (t.dataset.hex != null) { let v = t.value.trim(); if (v && v[0] !== '#') v = '#' + v; if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) setSetting(k, rgbToHex(hexToRgb(v)), true); }
  else if (t.type === 'date') { const d = isoToDay(t.value); if (d != null && plausibleDay(d)) setSetting(k, k === 'todayDate' && d === todayDay() ? null : d, true); }
  else if (t.tagName === 'SELECT') setSetting(k, t.value);
  else if (t.type === 'number') { const v = parseFloat(t.value); if (Number.isFinite(v) && v >= +t.min && v <= +t.max) setSetting(k, v, true); }
  else setSetting(k, t.value, true);
});
designEl.addEventListener('change', e => {
  const f = e.target.dataset.f;
  if (f === 'len-n' || f === 'len-u') { // "from the start date, for N days / weeks / sprints / months"
    const S = state.settings;
    if (S.rangeStart != null) setSetting('rangeEnd', durFromFields(e.target, S.rangeStart, 'len-n', 'len-u'));
    return;
  }
  commit(); syncDesign();
});

// ---------------------------------------------------------------- import
const modal = $('#import-modal');
let pending = null; // { rows } or { state }
function previewImport(rows, note) {
  const box = $('#imp-preview');
  pending = rows && rows.length ? { rows } : null;
  $('#imp-go').disabled = !pending;
  if (!pending) { box.innerHTML = note ? `<div class="sum">${esc(note)}</div>` : ''; return; }
  const info = derive(rows);
  const areas = info.filter(n => n.isArea).length, ms = info.filter(n => n.milestone).length;
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
  const cv = sc.canvas;
  pptx.defineLayout({ name: 'CANVAS', width: cv.w, height: cv.h }); // the slide is the canvas, so text keeps its point size
  pptx.layout = 'CANVAS';
  pptx.title = state.settings.title || 'Gantt chart';
  const SW = cv.w, SH = cv.h, m = 0;
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
    line: Object.assign({ color: hx(it.stroke), width: Math.max(0.5, pt(it.sw)) }, it.dash ? { dashType: it.dashType || 'dash' } : {}, arrow ? { endArrowType: 'triangle' } : {}),
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
  else if (!inField && selIds().length && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); askDeleteSel(); }
  else if (!inField && !mod && e.altKey && !e.shiftKey && selIds().length && /^Key[ATM]$/.test(e.code) && (e.target === document.body || (e.target.closest && e.target.closest('#chart')))) { // Alt/⌥ + A / T / M: make the selection an area, a task or a milestone (by key position, as ⌥ changes the letter on a Mac)
    e.preventDefault();
    setTypes(selIds(), { KeyA: 'area', KeyT: 'task', KeyM: 'milestone' }[e.code]);
  }
  else if (!inField && !mod && !e.altKey && e.key === 'Enter' && !state.rows.length && !pop && (e.target === document.body || (e.target.closest && e.target.closest('#chart, .chart-col')))) { // nothing on the chart yet: Enter makes the first task
    e.preventDefault();
    commit(); addRow('task', null, false, true);
  }
  else if (!inField && !mod && !e.altKey && e.key === 'Enter' && selIds().length && (e.target === document.body || (e.target.closest && e.target.closest('#chart')))) { // Enter adds a new item under the selection; Shift+Enter adds a subtask inside it
    e.preventDefault();
    const picked = selIds();
    commit(); addRow('task', picked[picked.length - 1], true, true, e.shiftKey);
  }
  else if (!inField && mod && e.key.toLowerCase() === 'x' && selIds().length && !(window.getSelection && String(window.getSelection()))) { e.preventDefault(); cutSelection(); }
  else if (!inField && mod && e.key.toLowerCase() === 'g' && selIds().length > 1) { e.preventDefault(); commit(); groupIntoNewArea(); }
  else if (!inField && mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAllRows(); }
  else if (!inField && mod && e.key.toLowerCase() === 'd' && selIds().length) { e.preventDefault(); commit(); duplicateSelection(); }
  else if (!inField && sel && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    if (e.shiftKey) { // Shift + → grows the selected task or subtask by a day, Shift + ← shrinks it (never below one day)
      const grow = e.key === 'ArrowRight';
      derive(state.rows).filter(n => selIds().includes(n.row.id) && !n.hasKids && !n.milestone).forEach(n => { n.row.end = grow ? n.row.end + 1 : Math.max(n.row.start, n.row.end - 1); });
    } else { // nudge the selected items (and anything inside them) by a day; Alt = a week
      const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.altKey ? 7 : 1);
      selectedBlocks().forEach(r => { r.start += d; r.end += d; });
    }
    refresh(); commitSoon();
  }
});
window.addEventListener('beforeunload', commit);

// ---------------------------------------------------------------- durations & timeline
const UI_KEY = 'gantt:ui';
const ui = Object.assign({ durUnit: 'weeks', hidePlan: false, hideDesign: false, designOpen: {} }, (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } })());
if (!ui.designOpen || typeof ui.designOpen !== 'object') ui.designOpen = {};
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
  return `<div class="dur"><input class="inp" type="number" min="1" step="1" inputmode="numeric" data-f="${fn}" value="${n}" aria-label="Length"><select class="inp" data-f="${fu}" aria-label="Unit">${DUR_UNITS.map(o => `<option value="${o[0]}"${o[0] === u ? ' selected' : ''}>${o[0] === 'sprints' ? `sprints (${state.settings.sprintWeeks} wk)` : o[1]}</option>`).join('')}</select></div>`;
}
const durHtml = r => `<div class="field"><span>Duration</span>${durControl(r.start, r.end, 'dur-n', 'dur-u')}</div>`;
/** read the number + unit pair next to a field and turn it into an end date */
function durFromFields(t, start, fn, fu) {
  const box = t.closest('.dur');
  const unit = $(`[data-f="${fu}"]`, box).value;
  ui.durUnit = unit; saveUi();
  return durationEnd(start, +$(`[data-f="${fn}"]`, box).value || 1, unit, state.settings.sprintWeeks);
}

/** naming an owner should make the owner visible: switch assignees on, at the level (area / task / subtask) this item is */
function ensureAssigneeShown(r) {
  const S = state.settings, n = derive(state.rows).find(x => x.row.id === r.id);
  if (!n) return;
  const wasOff = !S.assignees;
  let changed = false;
  if (wasOff) { S.assignees = true; changed = true; }
  if (n.isArea) { if (S.assigneeAreas === false) { S.assigneeAreas = true; changed = true; } }
  else if (S.assigneeLevel === 'tasks' && n.sub) { S.assigneeLevel = 'all'; changed = true; }
  else if (S.assigneeLevel === 'subtasks' && !n.sub) { S.assigneeLevel = 'all'; changed = true; }
  if (changed) { syncDesign(); if (wasOff) toast('Assignees are now shown on the chart'); }
}
function rowInput(r, t) {
  const f = t.dataset.f;
  if (f === 'name') { r.name = t.value; renderChart(); renderOutline(); commitSoon(); }
  else if (f === 'changeNote') { r.changeNote = t.value; renderChart(); commitSoon(); }
  else if (f === 'color-custom' || f === 'color-hex') { // a colour from outside the palette
    const hex = parseColor(t.value);
    if (!hex) return;
    r.color = hex; renderChart();
    const box = t.closest('.swatches'), dot = $(`.orow[data-id="${r.id}"] .dot`);
    if (dot) dot.style.background = hex;
    if (box) { // keep the other controls in step without rebuilding the one being used
      $$('.sw', box).forEach(b => b.classList.remove('on'));
      const cs = $('.sw.custom', box); cs.classList.add('on'); cs.style.background = hex;
      if (f === 'color-custom') $('.sw-hex', box).value = hex; else $('input[type="color"]', box).value = hex;
    }
    commitSoon();
  }
  else if (f === 'assignee-add') { if (/[,;]/.test(t.value)) { addAssignees(r.id, t.value); t.value = ''; } } // a comma finishes a name
  else if (f === 'progress') { r.progress = +t.value; t.nextElementSibling.textContent = t.value + '%'; const rr = t.closest('.range-row'); if (rr) { rr.classList.remove('off'); const x = $('.x-btn', rr); if (x) x.disabled = false; } if (!state.settings.progress) { state.settings.progress = true; syncDesign(); } renderChart(); commitSoon(); }
}
function rowChange(r, t) {
  const f = t.dataset.f;
  if (f === 'assignee-add') { if (t.value.trim()) addAssignees(r.id, t.value); t.value = ''; return; }
  if (f === 'start' || f === 'end') {
    const d = isoToDay(t.value);
    if (d == null || !plausibleDay(d)) return; // half-typed years are ignored
    if (f === 'start') { const len = r.end - r.start; r.start = d; r.end = r.type === 'milestone' ? d : d + len; }
    else if (d < r.start) { toast('The end can’t be before the start'); refresh(); return; } // nothing changes; the field goes back to the real end
    else r.end = d;
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
/** items that lie wholly or partly outside a fixed timeline */
function outsideRows() {
  const S = state.settings;
  if (S.rangeMode !== 'fixed' || S.rangeStart == null || S.rangeEnd == null) return [];
  return derive(state.rows).filter(n => !n.hasKids && (n.start < S.rangeStart || n.end > S.rangeEnd));
}
/** move just the items outside the fixed timeline to its nearest edge, keeping each one's length (shortened only if longer than the timeline) */
function pullIn() {
  const S = state.settings, lo = S.rangeStart, hi = S.rangeEnd, out = outsideRows();
  if (!out.length) return;
  out.forEach(n => {
    const r = n.row;
    if (n.milestone) { r.start = r.end = clamp(r.start, lo, hi); return; }
    const dur = r.end - r.start;
    if (dur >= hi - lo) { r.start = lo; r.end = hi; }
    else if (r.start < lo) { r.start = lo; r.end = lo + dur; }
    else { r.end = hi; r.start = hi - dur; }
  });
  commit(); refresh();
  toast(`${out.length} ${out.length === 1 ? 'item' : 'items'} moved inside the timeline — Undo to revert`);
}
function outsideDialog() {
  const n = outsideRows().length;
  if (!n) return;
  dialog(`Fit ${n === 1 ? 'the item' : n + ' items'} inside the timeline?`, 'Items before or after the fixed timeline can be moved to just inside its edges (keeping their length), leaving everything else alone, or every item can be spread across it.', [
    ['Move only those in', 'primary', pullIn],
    ['Spread all across it', 'ghost', fitPlan],
    ['Cancel', 'ghost', null],
  ]);
}
/** remembers the dates from before a spread, so the chart's button can toggle it off again */
let spreadMemo = null;
const datesNow = () => Object.fromEntries(derive(state.rows).filter(n => !n.hasKids).map(n => [n.row.id, [n.row.start, n.row.end]])); // items with nothing inside them: an area's dates follow its contents
const sameDates = (a, b) => !!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => b[k] && b[k][0] === a[k][0] && b[k][1] === a[k][1]);
const isSpread = () => !!spreadMemo && sameDates(spreadMemo.after, datesNow());
function fitPlan() {
  const S = state.settings;
  if (S.rangeMode !== 'fixed' || S.rangeStart == null || !state.rows.length) return;
  const before = datesNow();
  fitRows(state.rows, S.rangeStart, S.rangeEnd);
  spreadMemo = { before, after: datesNow() };
  commit(); refresh();
  toast('Tasks spread across the timeline — click the button again, or Undo, to revert');
}
/** the chart's button: spread across the fixed timeline, and a second click puts the dates back */
function toggleSpread() {
  if (isSpread()) {
    state.rows.forEach(r => { const b = spreadMemo.before[r.id]; if (b) { r.start = b[0]; r.end = b[1]; } });
    spreadMemo = null;
    commit(); refresh();
    toast('Back to the dates from before spreading');
  } else fitPlan();
}

// ---------------------------------------------------------------- popover: edit things where they are
const popEl = document.createElement('div');
popEl.className = 'pop'; popEl.hidden = true;
document.body.appendChild(popEl);
let pop = null;
function popHtml() {
  if (pop.kind === 'paste') return pasteHtml();
  const S = state.settings;
  const date = (label, f, v) => `<label class="field"><span>${label}</span><input class="inp" type="date" min="1990-01-01" max="2100-12-31" data-f="${f}" value="${dayToIso(v)}"></label>`;
  if (pop.kind === 'row') {
    const pinfo = derive(state.rows);
    if (S.showChanges) markChanges(pinfo);
    const n = pinfo.find(x => x.row.id === pop.id);
    if (!n) return '';
    const r = n.row;
    let h = `<input class="inp pop-name" id="pop-name" data-f="name" value="${esc(r.name)}" placeholder="Name" autocomplete="off" aria-label="Name">` + typeSegHtml(n);
    if (n.isArea) { // an area: what is in it, who owns it, its colour, and quick actions
      const inside = blockEnd(state.rows, n.i) - n.i - 1;
      return h + `<p class="note">${fmtRange(n)} · ${inside} ${inside === 1 ? 'item' : 'items'}${S.progress && n.progress != null ? ' · ' + Math.round(n.progress) + '% done' : ''}. Its dates follow what is inside it; drag its bar to shift everything together.</p>`
        + assigneeHtml(r) + colorHtml(r)
        + `<div class="pop-btns"><button class="btn ghost" data-act="area-del">Delete…</button><button class="btn primary" data-act="area-add">+ Task here</button></div>`;
    }
    if (n.hasKids) h += `<p class="note">${fmtRange(n)} — spans the items inside it. Drag the bar to shift them all.</p>`;
    else if (n.milestone) h += date('Date', 'start', r.start);
    else h += `<div class="two">${date('Start', 'start', r.start)}${date('End', 'end', r.end)}</div>${durHtml(r)}`;
    if (!n.hasKids && !n.milestone) h += progressHtml(r);
    h += assigneeHtml(r) + changeHtml(n);
    return h + (n.milestone ? msHtml(r) : '') + colorHtml(r);
  }
  if (pop.kind === 'today') {
    const seg = (f, cur, opts) => `<div class="seg" data-f="${f}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const lab = S.markerLabelOn !== false;
    return `<h4>Date marker</h4>${date('Date', 'todayDate', S.todayDate != null ? S.todayDate : todayDay())}
      <div class="field"><span>Label</span><input class="inp" data-f="todayLabel" value="${esc(S.todayLabel)}" placeholder="Today"${lab ? '' : ' disabled'}></div>
      <label class="check"><input type="checkbox" data-f="markerLabelOn"${lab ? ' checked' : ''}> Show label</label>
      <div class="field"><span>Line</span>${seg('marker-style', S.markerStyle || 'solid', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']])}</div>
      <div class="field"><span>Thickness</span>${seg('marker-width', S.markerWidth || 2, [[1, 'Thin'], [2, 'Regular'], [3, 'Bold']])}</div>
      <div class="field"><span>Colour</span><div class="swatches mk-sw" data-sig="${paletteOf(S).colors.join()}">${markerSwHtml()}</div></div>`;
  }
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
  popEl.classList.toggle('wide', kind === 'paste');
  popEl.hidden = false;
  const w = popEl.offsetWidth, h = popEl.offsetHeight;
  let top = rect.bottom + 8;
  if (kind === 'today') top = rect.top + 30;
  if (top + h > innerHeight - 8) top = Math.max(8, rect.top - h - 8);
  popEl.style.top = top + 'px';
  popEl.style.left = clamp(x != null ? Math.max(x, rect.left) : rect.left, 8, Math.max(8, innerWidth - w - 8)) + 'px';
  if (kind === 'paste') { syncPasteNote(); const ta = $('#pop-paste'); if (ta) ta.focus(); }
}
function closePop() { if (!pop) return; pop = null; popEl.hidden = true; popEl.innerHTML = ''; }
function syncPop() {
  if (!pop) return;
  // a row's popover belongs to the selected row: once the selection moves (paste, duplicate, group…) it must not stay on the old one
  if (pop.kind === 'row' && pop.id !== sel) { closePop(); return; }
  if (pop.kind === 'paste') { if (!popEl.querySelector('textarea')) popEl.innerHTML = popHtml(); syncPasteNote(); return; }
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
  else if (f === 'paste') { pop.text = t.value; syncPasteNote(); }
  else if (markerColorEvent(e, 'input')) { /* handled */ }
  else if (f === 'todayLabel') setSetting('todayLabel', t.value, true);
});
popEl.addEventListener('change', e => {
  const t = e.target, f = t.dataset.f;
  if (!pop || !f) return;
  if (pop.kind === 'row') { const r = state.rows[rowIndex(pop.id)]; if (r) rowChange(r, t); return; }
  const S = state.settings;
  if (f === 'todayDate') { const d = isoToDay(t.value); if (d != null) setSetting('todayDate', d === todayDay() ? null : d); }
  else if (f === 'markerLabelOn') { setSetting('markerLabelOn', t.checked); const ti = $('[data-f="todayLabel"]', popEl); if (ti) ti.disabled = !t.checked; }
  else if (f === 'rangeStart' || f === 'rangeEnd' || f === 'len-n' || f === 'len-u') {
    if (S.rangeMode !== 'fixed' || S.rangeStart == null) { [S.rangeStart, S.rangeEnd] = autoSpan(); S.rangeMode = 'fixed'; }
    if (f[0] === 'l') setSetting('rangeEnd', durFromFields(t, S.rangeStart, 'len-n', 'len-u'));
    else { const d = isoToDay(t.value); if (d != null) setSetting(f, d); }
  } else commit();
});
popEl.addEventListener('click', e => {
  if (pop && pop.kind === 'today') {
    if (markerColorEvent(e, 'click')) return;
    const sb = e.target.closest('.seg[data-f="marker-style"] button, .seg[data-f="marker-width"] button');
    if (sb) { const f = sb.parentNode.dataset.f; setSetting(f === 'marker-style' ? 'markerStyle' : 'markerWidth', f === 'marker-style' ? sb.dataset.v : +sb.dataset.v); return; } // setSetting refreshes the popover (and the Design panel) itself
  }
  const aa = e.target.closest('[data-act="area-add"], [data-act="area-del"]');
  if (aa && pop && pop.kind === 'row') {
    const id = pop.id;
    closePop();
    if (aa.dataset.act === 'area-del') askDelete(id);
    else {
      const i = rowIndex(id);
      let last = blockEnd(state.rows, i) - 1;
      while (last > i && state.rows[last].level > 1) last--; // after the last task, not inside its subtasks
      commit(); addRow('task', state.rows[last].id, true, true);
    }
    return;
  }
  const adel = e.target.closest('[data-act="assignee-del"]');
  if (adel && pop && pop.kind === 'row') { removeAssignee(pop.id, +adel.dataset.i); return; }
  if (e.target.closest('[data-act="progress-clear"]') && pop && pop.kind === 'row') { setRowProgress(pop.id, null); return; }
  const tb = e.target.closest('.seg[data-f="type"] button');
  if (tb && pop && pop.kind === 'row') { if (!tb.classList.contains('on') && !tb.disabled) setTypes([pop.id], tb.dataset.v); return; }
  const ms = e.target.closest('.seg[data-f="ms-align"] button');
  if (ms && pop && pop.kind === 'row') { setRowMs(pop.id, ms.dataset.v); return; }
  const sw = e.target.closest('.sw');
  if (sw && pop && pop.kind === 'row') { if (sw.dataset.color != null) setRowColor(pop.id, sw.dataset.color); return; }
  if (e.target.closest('[data-act="paste-add"]')) { doPasteAdd(); return; }
  if (e.target.closest('[data-act="paste-cancel"]')) { closePop(); return; }
  if (e.target.closest('[data-act="fit"]')) { fitPlan(); return; }
  const b = e.target.closest('.seg[data-f="rangeMode"] button');
  if (b) setSetting('rangeMode', b.dataset.v);
});
popEl.addEventListener('keydown', e => {
  if (e.target.dataset.f === 'paste') {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doPasteAdd(); }
    else if (e.key === 'Tab') { e.preventDefault(); const t = e.target; t.setRangeText('\t', t.selectionStart, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); }
    return;
  }
  if (pop && pop.kind === 'row' && assigneeKey(e, pop.id)) return;
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.target.blur(); if (e.target.dataset.f === 'name') closePop(); }
});

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
  const group = n.isArea;
  inlineEdit({ left: rect.left + indent, top: rect.top + 2, width: rect.width - indent + 40, height: rect.height - 4 }, n.row.name, Math.max(12, (group ? scene.fs + 1 : n.sub ? scene.fs - 1.5 : scene.fs) * s), group ? 700 : 500, v => { n.row.name = v; renderChart(); renderOutline(); });
}

// ---------------------------------------------------------------- zoom (ctrl/⌘ + wheel, trackpad pinch, buttons)
const stage = $('#stage'), wrapEl = $('#chart-col');
let zoom = 1;
function applyZoom() {
  wrapEl.style.width = zoom * 100 + '%';
  wrapEl.style.maxWidth = (scene ? scene.w : 1280) * zoom + 'px';
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

// ---------------------------------------------------------------- resizable panels
const PANEL_LIMITS = { plan: [260, 560], design: [300, 600] };
const panelEl = which => $(which === 'plan' ? '#panel-plan' : '#panel-design');
const panelCss = which => (which === 'plan' ? '--plan-w' : '--design-w');
/** set a panel's width, within its limits and always leaving room for the chart */
function setPanelWidth(which, w) {
  const other = which === 'plan' ? (ui.hideDesign ? 44 : panelEl('design').getBoundingClientRect().width) : (ui.hidePlan ? 44 : panelEl('plan').getBoundingClientRect().width);
  const [lo, hi] = PANEL_LIMITS[which];
  w = Math.round(clamp(w, lo, Math.max(lo, Math.min(hi, innerWidth - other - 420))));
  document.documentElement.style.setProperty(panelCss(which), w + 'px');
  return w;
}
function resetPanelWidth(which) { document.documentElement.style.removeProperty(panelCss(which)); delete ui[which + 'W']; saveUi(); }
$$('.resizer').forEach(h => {
  const which = h.dataset.for;
  h.addEventListener('pointerdown', e => {
    if (e.button) return;
    e.preventDefault();
    const x0 = e.clientX, w0 = panelEl(which).getBoundingClientRect().width;
    h.setPointerCapture(e.pointerId); h.classList.add('active'); document.body.classList.add('resizing');
    const move = ev => setPanelWidth(which, w0 + (which === 'plan' ? ev.clientX - x0 : x0 - ev.clientX));
    const up = () => {
      h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
      h.classList.remove('active'); document.body.classList.remove('resizing');
      ui[which + 'W'] = Math.round(panelEl(which).getBoundingClientRect().width); saveUi();
    };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  });
  h.addEventListener('dblclick', () => resetPanelWidth(which));
  h.addEventListener('keydown', e => { // arrow keys nudge (Shift = bigger steps); Home goes back to the default
    const step = (e.shiftKey ? 48 : 16) * (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) * (which === 'plan' ? 1 : -1);
    if (e.key === 'Home') { e.preventDefault(); resetPanelWidth(which); return; }
    if (!step) return;
    e.preventDefault();
    ui[which + 'W'] = setPanelWidth(which, panelEl(which).getBoundingClientRect().width + step); saveUi();
  });
});
const applyPanelWidths = () => { ['plan', 'design'].forEach(w => { if (ui[w + 'W']) setPanelWidth(w, ui[w + 'W']); }); }; // the saved widths, held within the window
applyPanelWidths();
addEventListener('resize', applyPanelWidths);

// ---------------------------------------------------------------- quick add: paste several items
/** where pasted items go: after the selected row (inside an area when one is selected), or in place of an empty row */
function pastePlace(parsed, afterId, hole) {
  const rows = state.rows, info = derive(rows), nested = parsed.some(r => r.level > 0);
  if (hole) {
    let at = hole.at;
    if (nested) while (at < rows.length && rows[at].level > 0) at++; // areas can only start between blocks
    return { at, level: nested ? 0 : hole.level, ref: info[at - 1] || null };
  }
  const i = afterId ? rowIndex(afterId) : -1;
  if (i < 0) { const ref = info[info.length - 1] || null; return { at: rows.length, level: nested ? 0 : ref ? Math.min(ref.level, 1) : 0, ref }; }
  const n = info[i];
  if (nested) { // keep areas as areas: go after the top-level block the selection is in
    let r0 = i;
    while (rows[r0].level > 0) r0--;
    const at = blockEnd(rows, r0);
    return { at, level: 0, ref: info[at - 1] };
  }
  const at = blockEnd(rows, i);
  return { at, level: n.isArea ? 1 : n.level, ref: info[at - 1] };
}
function insertParsed(parsed, afterId, replaceId, selectAll) {
  const rows = state.rows, ri = replaceId ? rowIndex(replaceId) : -1;
  let hole = null;
  if (ri >= 0) { hole = { at: ri, level: rows[ri].level }; rows.splice(ri, 1); }
  const place = pastePlace(parsed, afterId, hole);
  if (parsed.dated === false) { // undated lists carry on from the row before them
    const S = state.settings;
    const leaf = parsed.filter((r, k) => !(parsed[k + 1] && parsed[k + 1].level > r.level));
    const target = place.ref ? nextWorkday(place.ref.end + 1) : S.rangeMode === 'fixed' && S.rangeStart != null ? S.rangeStart : mondayOf(todayDay());
    const delta = target - Math.min(...leaf.map(r => r.start));
    parsed.forEach(r => { r.start += delta; r.end += delta; });
  }
  parsed.forEach(r => { r.level = clamp(r.level + place.level, 0, 2); });
  rows.splice(place.at, 0, ...parsed);
  normalizeLevels(rows);
  sel = parsed[0].id; multi = selectAll && parsed.length > 1 ? new Set(parsed.map(r => r.id)) : new Set();
  commit(); refresh();
  return parsed.length;
}
// pasting several lines into a name field adds them all
outline.addEventListener('paste', e => {
  const t = e.target;
  if (!t.classList || !t.classList.contains('nm')) return;
  const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
  if (!/[\r\n]/.test(text.trim())) return; // a single line pastes as usual
  const parsed = rowsFromText(text);
  if (parsed.length < 2) return;
  e.preventDefault();
  const id = t.closest('.orow').dataset.id, i = rowIndex(id);
  const empty = !t.value.trim() && blockEnd(state.rows, i) === i + 1;
  commit();
  const n = insertParsed(parsed, id, empty ? id : null);
  toast(`Added ${n} items — Undo reverts them`);
});
function pasteHtml() {
  return `<h4>Add several items</h4>
    <textarea class="inp paste-area" id="pop-paste" data-f="paste" rows="8" spellcheck="false" placeholder="One item per line, or a comma-separated list.&#10;Indent a line to make it a subtask, or write Phase: a, b, c&#10;or Area &gt; Task. Add dates, a duration (2w) or an owner after a comma.">${esc(pop.text || '')}</textarea>
    <p class="note" id="paste-note"></p>
    <div class="pop-btns"><button class="btn ghost" data-act="paste-cancel">Cancel</button><button class="btn primary" data-act="paste-add" disabled>Add</button></div>`;
}
function syncPasteNote() {
  const note = $('#paste-note'), btn = $('[data-act="paste-add"]', popEl);
  if (!note || !btn) return;
  let parsed = [];
  if (pop && pop.text && pop.text.trim()) { try { parsed = parseImport(pop.text); } catch (err) { console.error(err); } }
  const r = sel && state.rows[rowIndex(sel)];
  const where = r ? `after “${r.name || 'Untitled'}”` : 'at the end';
  btn.disabled = !parsed.length;
  btn.textContent = parsed.length > 1 ? `Add ${parsed.length} items` : 'Add';
  note.textContent = parsed.length ? `Will be added ${where}.` : `Added ${where}. Ctrl/⌘+Enter to add.`;
}
function doPasteAdd() {
  if (!pop || pop.kind !== 'paste' || !pop.text || !pop.text.trim()) return;
  let parsed = [];
  try { parsed = parseImport(pop.text); } catch (err) { console.error(err); }
  if (!parsed.length) return;
  closePop();
  const n = insertParsed(parsed, sel, null);
  toast(`Added ${n} item${n === 1 ? '' : 's'} — Undo reverts them`);
}
$$('[data-paste]').forEach(b => b.addEventListener('click', () => { const r = b.getBoundingClientRect(); openPop('paste', r, null, r.left); }));

// ---------------------------------------------------------------- selecting several, copy & paste
/** shift-click selects a range, ctrl/⌘-click adds or removes one */
function multiSelect(id, mode) {
  const cur = selIds();
  if (mode === 'range' && sel && sel !== id && rowIndex(sel) >= 0) {
    const a = rowIndex(sel), b = rowIndex(id), lo = Math.min(a, b), hi = Math.max(a, b);
    multi = new Set(state.rows.slice(lo, hi + 1).map(r => r.id)); // the anchor stays where it was
  } else {
    const set = new Set(cur);
    if (set.has(id)) { set.delete(id); if (sel === id) sel = [...set].pop() || null; } else { set.add(id); sel = id; }
    multi = set; if (set.size <= 1) multi = new Set();
    if (set.size === 1) sel = [...set][0];
  }
  closePop(); renderChart(); renderOutline(); syncAddNote();
}
function selectAllRows() {
  if (!state.rows.length) return;
  multi = new Set(state.rows.map(r => r.id)); sel = state.rows[0].id;
  closePop(); renderChart(); renderOutline(); syncAddNote();
}
/** the selected rows plus everything inside them, in plan order */
function selectedBlocks() {
  const seen = new Set(), out = [];
  selIds().forEach(id => { const i = rowIndex(id); if (i >= 0) state.rows.slice(i, blockEnd(state.rows, i)).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } }); });
  return out.sort((a, b) => rowIndex(a.id) - rowIndex(b.id));
}
function deleteMany(ids) {
  const rows = state.rows, gone = new Set();
  ids.forEach(id => { const i = rowIndex(id); if (i >= 0) rows.slice(i, blockEnd(rows, i)).forEach(r => gone.add(r.id)); });
  const first = Math.min(...ids.map(rowIndex).filter(i => i >= 0));
  state.rows = rows.filter(r => !gone.has(r.id));
  state.rows.forEach(r => { r.deps = r.deps.filter(d => !gone.has(d)); });
  normalizeLevels(state.rows);
  multi = new Set();
  sel = state.rows.length ? state.rows[Math.min(first, state.rows.length - 1)].id : null;
  commit(); refresh();
}
function askDeleteSel() {
  const ids = selIds();
  if (ids.length === 1) { askDelete(ids[0]); return; }
  const n = selectedBlocks().length;
  dialog(`Delete ${ids.length} items?`, n > ids.length ? `Together with what is inside them, that removes ${n} rows.` : 'They will be removed from the plan.', [
    ['Delete', 'danger', () => deleteMany(ids)], ['Cancel', 'ghost', null],
  ]);
}
// what gets copied is plain indented text — one item per line, tab-separated — so it also pastes into a doc or spreadsheet,
// and back into this tool (or the paste box) with dates, owners, progress and milestones intact
let clip = null; // the last thing copied inside the app, kept so a paste restores everything exactly (links between items too)
function clipText(rows) {
  const min = Math.min(...rows.map(r => r.level));
  const kids = new Set(derive(state.rows).filter(n => n.hasKids).map(n => n.row.id));
  const flat = s => String(s).replace(/[\t\r\n]+/g, ' ');
  return rows.map(r => {
    const cells = [flat(r.name)], group = kids.has(r.id);
    if (!group) { cells.push(dayToIso(r.start)); cells.push(r.type === 'milestone' ? 'Milestone' : dayToIso(r.end)); }
    if (r.assignee) cells.push(flat(r.assignee));
    if (!group && r.type !== 'milestone' && r.progress > 0) cells.push(Math.round(r.progress) + '%');
    return '\t'.repeat(r.level - min) + cells.join('\t');
  }).join('\n');
}
function cloneRows(src) {
  const min = Math.min(...src.map(r => r.level)), map = {};
  const rows = src.map(r => { const c = Object.assign({}, r, { id: uid(), level: r.level - min, deps: r.deps.slice() }); map[r.id] = c.id; return c; });
  rows.forEach(c => { c.deps = c.deps.map(d => map[d] || d).filter(d => rows.some(x => x.id === d) || rowIndex(d) >= 0); });
  rows.dated = true;
  return rows;
}
function rowsFromText(text) {
  if (clip && clip.text === text) return cloneRows(clip.rows);
  let parsed = [];
  try { parsed = parseImport(text); } catch (err) { console.error(err); }
  return parsed;
}
const inTextField = () => { const a = document.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
function copySelection(e, cut) {
  if (inTextField() || !modal.hidden) return;
  if (window.getSelection && String(window.getSelection())) return; // the user is copying page text
  const rows = selectedBlocks();
  if (!rows.length) return;
  e.preventDefault();
  const text = clipText(rows);
  e.clipboardData.setData('text/plain', text);
  clip = { text, rows: JSON.parse(JSON.stringify(rows)) };
  if (cut) { const ids = selIds(); commit(); deleteMany(ids); toast(`Cut ${rows.length} item${rows.length === 1 ? '' : 's'} — paste to place ${rows.length === 1 ? 'it' : 'them'}`); }
  else toast(`Copied ${rows.length} item${rows.length === 1 ? '' : 's'}`);
}
document.addEventListener('copy', e => copySelection(e, false));
document.addEventListener('cut', e => copySelection(e, true));
document.addEventListener('paste', e => {
  if (inTextField() || !modal.hidden) return;
  const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
  if (!text.trim()) return;
  const parsed = rowsFromText(text);
  if (!parsed.length) return;
  e.preventDefault();
  const ids = selIds();
  commit();
  const n = insertParsed(parsed, ids.length ? ids[ids.length - 1] : null, null, true);
  toast(`Pasted ${n} item${n === 1 ? '' : 's'} — Undo reverts ${n === 1 ? 'it' : 'them'}`);
});
// browsers don't send a cut event without a text selection, so Ctrl/⌘+X is handled from the keyboard
function cutSelection() {
  const rows = selectedBlocks();
  if (!rows.length) return;
  const text = clipText(rows), ids = selIds();
  clip = { text, rows: JSON.parse(JSON.stringify(rows)) };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => { /* the in-app copy still works */ });
  commit(); deleteMany(ids);
  toast(`Cut ${rows.length} item${rows.length === 1 ? '' : 's'} — paste to place ${rows.length === 1 ? 'it' : 'them'}`);
}
function duplicateSelection() {
  const rows = selectedBlocks();
  if (!rows.length) return;
  const ids = selIds(), n = insertParsed(cloneRows(JSON.parse(JSON.stringify(rows))), ids[ids.length - 1], null, true);
  toast(`Duplicated ${n} item${n === 1 ? '' : 's'}`);
}

// ---------------------------------------------------------------- colour: palettes and per-item colours
const strip = cols => `<span class="strip">${cols.slice(0, 6).map(c => `<i style="background:${c}"></i>`).join('')}</span>`;
function paletteHtml() {
  return `<div class="seed-block"><span class="lbl">Paste a colour to build a palette</span>
    <div class="color seed-row"><input class="inp hex seed-in" data-seed placeholder="#4f46e5" spellcheck="false" autocomplete="off" aria-label="Colour"><input type="color" data-seedpick value="#4f46e5" aria-label="Pick a colour"></div></div>
    <div class="sugg" id="sugg" hidden></div>
    <span class="lbl">Ready-made palettes</span>
    <div class="pal-grid">${PRESETS.map((p, i) => `<button class="pal" data-palette="${i}" title="${esc(p.name)}">${strip(p.colors)}<span class="pn">${esc(p.name)}</span></button>`).join('')}</div>
    <div class="pe" id="pe"></div>`;
}
// ---------------------------------------------------------------- your own palette
// Any number of colours (up to 16), starting from whichever palette is showing. Colours are kept exactly as chosen, and each bar picks
// whichever label colour reads best on it. Palettes can be saved by name and reused.
const peUi = { sel: 0, inplace: false };
const peColors = () => paletteOf(state.settings).colors;
function peCommit(colors, soon) {
  state.settings.palette = { id: 'custom', name: 'Custom', text: 'auto', colors };
  renderChart(); renderOutline(); syncDesign(); syncPop();
  if (soon) commitSoon(); else commit();
}
const peSig = () => peColors().join(',') + '|' + peUi.sel + '|' + (ui.myPalettes || []).map(m => m.name + m.colors.join('')).join(';');
function peHtml() {
  const cols = peColors(), sel = peUi.sel, mine = ui.myPalettes || [], ms = cols.length >= 3 ? cols.length - 1 : -1;
  const here = cols.join(',');
  return `<span class="lbl">Your palette</span>
    <p class="ctl-note">Starts from the palette above. Edit a colour, add more or remove some. Items take the colours in order, then repeat${ms >= 0 ? '; milestones use the last one (◆)' : ''}.</p>
    <div class="pe-row">${cols.map((c, i) => `<button class="pe-sw${i === sel ? ' on' : ''}${i === ms ? ' ms' : ''}" data-pe="${i}" style="--c:${c}" title="Colour ${i + 1}${i === ms ? ' — used for milestones' : ''}" aria-label="Colour ${i + 1}, ${c}"></button>`).join('')}${cols.length < 16 ? '<button class="pe-add" data-act="pe-add" title="Add a colour" aria-label="Add a colour">+</button>' : ''}</div>
    <div class="color pe-sel"><input class="inp hex" data-pehex maxlength="7" spellcheck="false" value="${cols[sel]}" aria-label="Hex colour"><input type="color" data-pecolor value="${cols[sel]}" aria-label="Pick a colour">
      <button class="x-btn" data-act="pe-left" title="Move earlier"${sel === 0 ? ' disabled' : ''}>◀</button><button class="x-btn" data-act="pe-right" title="Move later"${sel === cols.length - 1 ? ' disabled' : ''}>▶</button><button class="x-btn" data-act="pe-del" title="Remove this colour"${cols.length < 2 ? ' disabled' : ''}>✕</button></div>
    <div class="pe-save"><input class="inp" data-pename placeholder="Name it to save this palette" maxlength="24" autocomplete="off"><button class="btn ghost" data-act="pe-save">Save</button></div>
    ${mine.length ? `<span class="lbl">Your saved palettes</span><div class="pal-grid">${mine.map((m, i) => `<span class="pal-wrap"><button class="pal${m.colors.join(',') === here ? ' on' : ''}" data-mine="${i}" title="${esc(m.name)}">${strip(m.colors)}<span class="pn">${esc(m.name)}</span></button><button class="x-btn pal-x" data-act="pe-forget" data-i="${i}" title="Delete “${esc(m.name)}”" aria-label="Delete ${esc(m.name)}">✕</button></span>`).join('')}</div>` : ''}`;
}
function syncPalEditor() {
  const box = $('#pe', designEl);
  if (!box) return;
  const cols = peColors();
  peUi.sel = clamp(peUi.sel, 0, cols.length - 1);
  if (peUi.inplace) { // typing a colour: update what is shown without rebuilding (which would drop the cursor)
    $$('.pe-sw', box).forEach((b, i) => { if (cols[i]) b.style.setProperty('--c', cols[i]); });
    const pc = $('[data-pecolor]', box), ph = $('[data-pehex]', box);
    if (pc) pc.value = cols[peUi.sel];
    if (ph && ph !== document.activeElement) ph.value = cols[peUi.sel];
    box.dataset.sig = peSig();
    return;
  }
  const sig = peSig();
  if (box.dataset.sig === sig) return;
  box.innerHTML = peHtml();
  box.dataset.sig = sig;
}
function peEdit(hex) {
  const cols = peColors().slice();
  cols[peUi.sel] = hex;
  peUi.inplace = true;
  try { peCommit(cols, true); } finally { peUi.inplace = false; }
}
function peAction(btn) {
  const a = btn.dataset.act, cols = peColors().slice(), i = peUi.sel;
  if (a === 'pe-add' && cols.length < 16) {
    const [L, C, H] = toOklch(cols[cols.length - 1]);
    cols.push(okHex(L, C, H + 50 * D2R)); peUi.sel = cols.length - 1; peCommit(cols);
  } else if (a === 'pe-del' && cols.length > 1) { cols.splice(i, 1); peUi.sel = Math.min(i, cols.length - 1); peCommit(cols); }
  else if (a === 'pe-left' && i > 0) { [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; peUi.sel = i - 1; peCommit(cols); }
  else if (a === 'pe-right' && i < cols.length - 1) { [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; peUi.sel = i + 1; peCommit(cols); }
  else if (a === 'pe-save') {
    const inp = $('[data-pename]', designEl), name = (inp ? inp.value : '').trim();
    if (!name) { if (inp) { inp.focus(); inp.classList.add('bad'); setTimeout(() => inp.classList.remove('bad'), 900); } return; }
    ui.myPalettes = (ui.myPalettes || []).filter(m => m.name.toLowerCase() !== name.toLowerCase());
    ui.myPalettes.unshift({ name, colors: cols });
    ui.myPalettes = ui.myPalettes.slice(0, 12); saveUi();
    syncPalEditor();
    const again = $('[data-pename]', designEl); if (again) again.value = '';
  } else if (a === 'pe-forget') { (ui.myPalettes || []).splice(+btn.dataset.i, 1); saveUi(); syncPalEditor(); }
}
function syncPalette() {
  const pal = paletteOf(state.settings);
  syncPalEditor();
  $$('[data-palette]', designEl).forEach(b => b.classList.toggle('on', PRESETS[+b.dataset.palette].id === pal.id));
  const inp = $('[data-seed]', designEl), pick = $('[data-seedpick]', designEl), sg = $('#sugg', designEl);
  if (!inp || !sg) return;
  if (inp !== document.activeElement) inp.value = pal.seed || '';
  if (!pal.seed) { sg.hidden = true; return; }
  if (pick) pick.value = pal.seed;
  const sig = pal.seed + '|' + pal.id;
  if (sg.dataset.sig !== sig) { // rebuilt only when the colour or the choice changes
    sg.innerHTML = `<span class="lbl">Matching palettes</span><div class="pal-grid">${suggestPalettes(pal.seed).map((p, i) => `<button class="pal${p.id === pal.id ? ' on' : ''}" data-scheme="${i}">${strip(p.colors)}<span class="pn">${esc(p.name)}</span></button>`).join('')}</div>`;
    sg.dataset.sig = sig;
  }
  sg.hidden = false;
}
function applyPalette(p) {
  state.settings.palette = p;
  renderChart(); renderOutline(); syncDesign(); syncPop();
  commit();
}
/** a pasted or picked colour: apply the best-matching palette straight away (keeping the scheme if one was already chosen) */
function applySeed(hex) {
  const cur = paletteOf(state.settings), key = cur.seed && String(cur.id).startsWith('seed-') ? cur.id : null;
  if (cur.seed === hex && key) return;
  const list = suggestPalettes(hex);
  state.settings.palette = list.find(p => p.id === key) || list[0];
  renderChart(); renderOutline(); syncDesign(); syncPop();
  commitSoon();
}
/** the Assignee field, with a ✕ that clears it */
function assigneeHtmlOld(r) {
  return `<div class="field"><span>Assignee</span><div class="clearable"><input class="inp" data-f="assignee" list="who-list" value="${esc(r.assignee)}" placeholder="Name" autocomplete="off"><button class="x-btn" data-act="assignee-clear" title="Clear assignee" aria-label="Clear assignee"${r.assignee ? '' : ' hidden'}>✕</button></div></div>`;
}
/** assignees as removable chips plus a box to add more (names are stored comma-separated) */
const chipsHtml = names => names.map((n, i) => `<span class="chip"><span>${esc(n)}</span><button class="chip-x" data-act="assignee-del" data-i="${i}" title="Remove ${esc(n)}" aria-label="Remove ${esc(n)}">✕</button></span>`).join('');
function assigneeHtml(r) {
  const names = splitNames(r.assignee);
  return `<div class="field"><span>Assignees</span><div class="chips" data-chips>${chipsHtml(names)}<input class="chip-in" data-f="assignee-add" list="who-list" placeholder="${names.length ? 'Add another' : 'Name'}" autocomplete="off" aria-label="Add an assignee"></div></div>`;
}
function setAssignees(id, names, keepFocus) {
  const r = state.rows[rowIndex(id)];
  if (!r) return;
  r.assignee = names.join(', ');
  if (names.length) ensureAssigneeShown(r);
  renderChart(); renderOutline(); commitSoon();
  const boxes = [];
  if (pop && pop.kind === 'row' && pop.id === id) boxes.push(...$$('[data-chips]', popEl));
  const d = $(`.detail[data-id="${id}"] [data-chips]`);
  if (d) boxes.push(d);
  boxes.forEach(box => { // update the chips in place (the popover is not rebuilt while you are typing in it)
    $$('.chip', box).forEach(c => c.remove());
    const inp = $('.chip-in', box);
    inp.insertAdjacentHTML('beforebegin', chipsHtml(names));
    inp.placeholder = names.length ? 'Add another' : 'Name';
    if (keepFocus) inp.focus();
  });
}
function addAssignees(id, text) {
  const r = state.rows[rowIndex(id)];
  if (r) setAssignees(id, splitNames((r.assignee ? r.assignee + ', ' : '') + text), true);
}
function removeAssignee(id, i) {
  const r = state.rows[rowIndex(id)];
  if (!r) return;
  const names = splitNames(r.assignee);
  names.splice(i, 1);
  setAssignees(id, names, true);
}
/** Backspace in an empty assignee box removes the last name */
function assigneeKey(e, id) {
  const t = e.target;
  if (!t.dataset || t.dataset.f !== 'assignee-add') return false;
  if (e.key === 'Backspace' && !t.value) { const r = state.rows[rowIndex(id)]; const n = r ? splitNames(r.assignee) : []; if (n.length) { e.preventDefault(); removeAssignee(id, n.length - 1); } return true; }
  if (e.key === 'Enter') { e.preventDefault(); if (t.value.trim()) { addAssignees(id, t.value); t.value = ''; } return true; }
  return false;
}
function clearAssignee(id) {
  const r = state.rows[rowIndex(id)];
  if (!r) return;
  r.assignee = '';
  commit(); refresh();
  $$('.clearable').forEach(c => { const i = $('input', c), b = $('.x-btn', c); if (b) b.hidden = !i.value; }); // a focused popover isn't rebuilt
  const inp = $('.pop [data-f="assignee"]') || $(`.detail[data-id="${id}"] [data-f="assignee"]`);
  if (inp) inp.focus(); // ready to type another name
}
/** the baseline: every item's dates when it was taken. Later edits move the plan, not the baseline, and the chart shows the difference. */
const hasBaseline = () => state.rows.some(r => r.baseline);
function setBaseline() {
  derive(state.rows).forEach(n => { n.row.baseline = { s: n.start, e: n.milestone ? n.start : n.end }; delete n.row.changeNote; });
  state.settings.baselineDate = todayDay();
}
function baselineDialog() {
  dialog('Update the baseline?', 'Changes are measured from the baseline dates. Use today’s dates as the new baseline to start tracking from here, or remove it. Either way the reasons you wrote are cleared.', [
    ['Use current dates', 'primary', () => { setBaseline(); commit(); refresh(); }],
    ['Remove baseline', 'danger', () => { state.rows.forEach(r => { delete r.baseline; delete r.changeNote; }); state.settings.showChanges = false; commit(); refresh(); }],
    ['Cancel', 'ghost', null],
  ]);
}
/** for an item that differs from its baseline: how, and a field for why (shown as a numbered note in the legend) */
function changeHtml(n) {
  if (!state.settings.showChanges || !n.changed || n.isArea) return '';
  const ds = n.start - n.bs, de = n.end - n.be, pl = k => `${Math.abs(k)} day${Math.abs(k) === 1 ? '' : 's'}`, dir = k => (k > 0 ? 'later' : 'earlier');
  const parts = n.milestone ? [`moved ${pl(ds)} ${dir(ds)}`] : [ds ? `starts ${pl(ds)} ${dir(ds)}` : '', de ? `ends ${pl(de)} ${dir(de)}` : ''].filter(Boolean);
  const was = n.milestone ? shortDate(n.bs) : `${shortDate(n.bs)} – ${shortDate(n.be)}`;
  return `<div class="field"><span>Changed from original</span><p class="note">Was ${was}: ${parts.join(', ')}.</p><input class="inp" data-f="changeNote" value="${esc(n.row.changeNote || '')}" placeholder="Why? Shown in the legend" maxlength="140" autocomplete="off"></div>`;
}
/** progress for one bar: a slider, and a way to switch progress off for just this bar */
function progressHtml(r) {
  if (state.settings.progress && state.settings.progressSource === 'marker' && state.settings.todayLine) return `<div class="field"><span>Progress</span><p class="note">Follows the date marker, so it moves when the marker does. Change this under Design → Tasks → Progress from.</p></div>`;
  const off = r.progress == null;
  return `<div class="field"><span>Progress</span><div class="range-row${off ? ' off' : ''}"><input type="range" min="0" max="100" step="5" data-f="progress" value="${off ? 0 : r.progress}"><output>${off ? 'Off' : Math.round(r.progress) + '%'}</output><button class="x-btn" data-act="progress-clear" title="Don’t show progress on this bar" aria-label="Don’t show progress on this bar"${off ? ' disabled' : ''}>✕</button></div></div>`;
}
function setRowProgress(id, v) {
  const r = state.rows[rowIndex(id)];
  if (!r) return;
  r.progress = v;
  commit(); refresh();
  if (v == null) offerProgressReset();
  if (pop && pop.kind === 'row' && pop.id === id) { // a focused popover isn't rebuilt, so bring its progress row up to date
    const rr = $('.range-row', popEl);
    if (rr) { rr.classList.toggle('off', v == null); $('input', rr).value = v == null ? 0 : v; $('output', rr).textContent = v == null ? 'Off' : Math.round(v) + '%'; $('.x-btn', rr).disabled = v == null; }
  }
}
/** progress is a chart-wide layer, so clearing the last bar that uses it offers to switch it off everywhere */
function progressInUse() { return derive(state.rows).some(n => !n.hasKids && !n.milestone && n.row.progress > 0); }
function offerProgressReset() {
  if (!state.settings.progress || state.settings.progressSource === 'marker' || progressInUse()) return;
  dialog('Turn progress off everywhere?', 'No bar shows any progress now. You can switch progress off for the whole chart, so existing and new bars go back to plain colours, or keep it on to start tracking again.', [
    ['Turn off everywhere', 'primary', () => {
      state.rows.forEach(r => { if (r.progress == null) r.progress = 0; }); // so switching it on again later starts every bar fresh
      setSetting('progress', false);
      renderOutline();
      if (pop && pop.kind === 'row') syncPop();
    }],
    ['Keep progress on', 'ghost', null],
  ]);
}
/** where this one milestone sits within its day (otherwise it follows the chart's setting) */
function msHtml(r) {
  const cur = r.msAlign || '';
  return `<div class="field"><span>Sits in its day at</span><div class="seg" data-f="ms-align">${[['', 'Default', 'Follow the chart’s setting'], ['auto', 'Auto', 'End of the day if a task finishes then, start if one begins then'], ['start', 'Start', 'Start of the day'], ['middle', 'Mid', 'Middle of the day'], ['end', 'End', 'End of the day']].map(([v, l, t]) => `<button data-v="${v}" title="${t}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
}
function setRowMs(id, v) {
  const r = state.rows[rowIndex(id)];
  if (!r) return;
  if (v) r.msAlign = v; else delete r.msAlign;
  commit(); refresh();
  if (pop && pop.kind === 'row') $$('.seg[data-f="ms-align"] button', popEl).forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
// ---------------------------------------------------------------- the date marker's colour
/** swatches for the marker: Auto, the palette, or any colour — the same kind of choice a bar gets */
function markerSwHtml() {
  const S = state.settings, cols = paletteOf(S).colors, v = S.markerColor, custom = typeof v === 'string';
  return `<button class="sw auto${v == null ? ' on' : ''}" data-mk="auto" title="Automatic — the palette’s accent">Auto</button>${cols.map((c, i) => `<button class="sw${v === i ? ' on' : ''}" data-mk="${i}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}<label class="sw custom${custom ? ' on' : ''}" title="Any colour"${custom ? ` style="background:${v}"` : ''}><input type="color" data-f="mk-custom" value="${custom ? v : cols[0]}" aria-label="Pick any colour"></label><input class="inp sw-hex" data-f="mk-hex" placeholder="#hex" value="${custom ? v : ''}" maxlength="22" spellcheck="false" autocomplete="off" aria-label="Colour as hex">`;
}
/** bring every marker-colour control (Design panel, popover) up to date — in place, so a control being clicked or typed in is never replaced */
function syncMarkerColor() {
  const S = state.settings, cols = paletteOf(S).colors, v = S.markerColor, custom = typeof v === 'string', sig = cols.join();
  $$('.mk-sw').forEach(box => {
    if (box.dataset.sig !== sig) { box.innerHTML = markerSwHtml(); box.dataset.sig = sig; return; } // built again only when the palette changed
    $$('.sw', box).forEach(b => b.classList.toggle('on', b.dataset.mk != null ? (b.dataset.mk === 'auto' ? v == null : v === +b.dataset.mk) : custom));
    const cs = $('.sw.custom', box), pk = $('input[type="color"]', box), hx = $('.sw-hex', box);
    if (cs) cs.style.background = custom ? v : '';
    if (pk && pk !== document.activeElement) pk.value = custom ? v : cols[0];
    if (hx && hx !== document.activeElement) hx.value = custom ? v : '';
  });
}
function setMarkerColor(v, soon) {
  state.settings.markerColor = v;
  renderChart(); syncMarkerColor();
  if (soon) commitSoon(); else commit();
}
/** clicks and typing in the marker-colour controls, wherever they are */
function markerColorEvent(e, type) {
  const t = e.target;
  if (type === 'click') { const b = t.closest('[data-mk]'); if (b) { setMarkerColor(b.dataset.mk === 'auto' ? null : +b.dataset.mk); return true; } }
  else if (t.dataset && (t.dataset.f === 'mk-custom' || t.dataset.f === 'mk-hex')) {
    const hex = parseColor(t.value);
    if (hex) { setMarkerColor(hex, true); if (t.dataset.f === 'mk-custom') { const h = $('.sw-hex', t.closest('.mk-sw')); if (h) h.value = hex; } else { const c = $('input[type="color"]', t.closest('.mk-sw')); if (c) c.value = hex; } }
    return true;
  }
  return false;
}
function colorHtml(r) {
  const cols = paletteOf(state.settings).colors;
  const custom = typeof r.color === 'string';
  return `<div class="field"><span>Colour</span><div class="swatches"><button class="sw auto${r.color == null ? ' on' : ''}" data-color="auto" title="Automatic — follows its area">Auto</button>${cols.map((c, i) => `<button class="sw${r.color === i ? ' on' : ''}" data-color="${i}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}<label class="sw custom${custom ? ' on' : ''}" title="Any colour"${custom ? ` style="background:${r.color}"` : ''}><input type="color" data-f="color-custom" value="${custom ? r.color : cols[0]}" aria-label="Pick any colour"></label><input class="inp sw-hex" data-f="color-hex" placeholder="#hex" value="${custom ? r.color : ''}" maxlength="22" spellcheck="false" autocomplete="off" aria-label="Colour as hex"></div></div>`;
}
/** colour one item (and what is inside it) from the palette, without touching anything else */
function setRowColor(id, v) {
  const r = state.rows[rowIndex(id)];
  if (!r) return;
  if (v === 'auto') delete r.color; else r.color = +v;
  commit(); refresh();
  if (pop && pop.kind === 'row') $$('.sw', popEl).forEach(b => b.classList.toggle('on', b.dataset.color === String(v)));
}

/** put the selected items (with what is inside them) into a brand-new area, placed just above the area the first of them was in */
function groupIntoNewArea() {
  const ids = selIds();
  if (ids.length < 2) return;
  const rows = state.rows, blocks = selectedBlocks(), inSel = new Set(blocks.map(r => r.id));
  const idx = new Map(rows.map((r, i) => [r.id, i]));
  let at = idx.get(blocks[0].id);
  while (at > 0 && rows[at].level > 0) at--; // the top-level block the first item sits in
  const pos = rows.slice(0, at).filter(r => !inSel.has(r.id)).length; // where that lands once the selection is lifted out
  // each selected item becomes a task of the new area, and its contents move with it
  let rootEnd = -1, delta = 0;
  blocks.forEach(r => {
    const i = idx.get(r.id);
    if (i >= rootEnd) { delta = 1 - r.level; rootEnd = blockEnd(rows, i); }
    r.level = clamp(r.level + delta, 0, 2);
  });
  const area = newRow({ level: 0, name: 'New area', start: Math.min(...blocks.map(r => r.start)), end: Math.max(...blocks.map(r => r.end)) });
  state.rows = rows.filter(r => !inSel.has(r.id));
  state.rows.splice(pos, 0, area, ...blocks);
  normalizeLevels(state.rows);
  sel = area.id; multi = new Set();
  commit(); refresh();
  editOnChart(area.id); // name it right where it appeared
  toast(`${blocks.length === ids.length ? ids.length : ids.length + ' items'} moved into a new area — Undo reverts`);
}
function syncSelBar() {
  const n = selIds().length, bar = $('#selbar');
  if (!bar) return;
  bar.hidden = n < 2;
  if (n >= 2) { $('#selbar-count').textContent = `${n} selected`; placeSelBar(); }
}
/** quick toggles beside the chart: progress on/off, and a baseline (set it, see that one exists, show or hide its changes) */
function syncQuickStatus() {
  const S = state.settings, prog = $('#qs-progress'), base = $('#qs-base');
  if (!prog || !base) return;
  prog.setAttribute('aria-pressed', String(!!S.progress));
  const has = hasBaseline(), on = !!S.showChanges && has;
  base.setAttribute('aria-pressed', String(on));
  base.classList.toggle('none', !has);
  const changed = on && scene ? scene.info.filter(n => n.changed && !n.isArea).length : 0;
  $('#qs-base-text').textContent = has ? `Baseline${S.baselineDate != null ? ' · ' + shortDate(S.baselineDate) : ''}` : 'Set baseline';
  const cnt = $('#qs-base-count');
  cnt.hidden = !changed; cnt.textContent = changed;
  base.title = has ? (on ? 'Baseline shown — click to hide its changes' : 'A baseline exists — click to show changes from it') : 'Save the dates as they are now, to see what changes later';
  $('#qs-base-menu').hidden = !has;
}
$('#qs-progress').addEventListener('click', () => setSetting('progressMode', state.settings.progress ? 'off' : state.settings.progressSource === 'marker' ? 'marker' : 'manual'));
$('#qs-base').addEventListener('click', () => {
  const S = state.settings;
  if (!hasBaseline()) { setBaseline(); S.showChanges = true; commit(); refresh(); toast('Baseline saved — changes from here on show against it'); }
  else setSetting('showChanges', !S.showChanges);
});
$('#qs-base-menu').addEventListener('click', baselineDialog);
/** the selection's toolbar floats just above the selected bars (below them if there is no room), kept within view */
function placeSelBar() {
  const bar = $('#selbar');
  if (!bar || bar.hidden) return;
  const host = bar.offsetParent;
  if (!host) return;
  const hr = host.getBoundingClientRect();
  let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
  selIds().forEach(id => $$(`#chart [data-role="move"][data-id="${id}"]`).forEach(el => {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); left = Math.min(left, r.left); right = Math.max(right, r.right);
  }));
  const w = bar.offsetWidth, h = bar.offsetHeight;
  if (!isFinite(top)) { bar.style.left = Math.round((hr.width - w) / 2) + 'px'; bar.style.top = '14px'; return; }
  const x = clamp((left + right) / 2 - hr.left - w / 2, 10, Math.max(10, hr.width - w - 10));
  let y = top - hr.top - h - 12, below = false;
  if (y < 10) { y = bottom - hr.top + 12; below = true; }
  y = clamp(y, 10, Math.max(10, hr.height - h - 10));
  bar.style.left = Math.round(x) + 'px';
  bar.style.top = Math.round(y) + 'px';
  bar.classList.toggle('below', below);
  bar.style.setProperty('--cx', Math.round(clamp((left + right) / 2 - hr.left - x, 18, w - 18)) + 'px'); // a small pointer toward the selection
}
let selBarRaf = 0;
const queueSelBar = () => { if (!selBarRaf) selBarRaf = requestAnimationFrame(() => { selBarRaf = 0; placeSelBar(); }); };
$('#stage').addEventListener('scroll', queueSelBar, { passive: true });
window.addEventListener('resize', queueSelBar);
$('#selbar').addEventListener('click', e => {
  const b = e.target.closest('[data-sel]');
  if (!b) return;
  if (b.dataset.sel === 'group') { commit(); groupIntoNewArea(); }
  else if (b.dataset.sel === 'clear') select(null);
});

// ---------------------------------------------------------------- go
{ // the tips card: ⌘ on a Mac, and it remembers whether it was left open
  const tips = $('#tips');
  if (tips) {
    const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    $$('[data-mod]', tips).forEach(k => { k.textContent = mac ? '⌘' : 'Ctrl'; });
    $$('[data-alt]', tips).forEach(k => { k.textContent = mac ? '⌥' : 'Alt'; });
    if (ui.tipsOpen === false) tips.open = false;
    tips.addEventListener('toggle', () => { ui.tipsOpen = tips.open; saveUi(); });
  }
}
$('#version').textContent = APP_VERSION;
buildDesign();
syncUndo();
ensureFont();
refresh();
