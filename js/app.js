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
  { // the plan's statuses: names and colours, best to worst
    const seen = new Set(), list = Array.isArray(st.settings.statuses) ? st.settings.statuses : DEFAULT_STATUSES;
    st.settings.statuses = list.filter(x => x && typeof x.id === 'string' && x.id && !seen.has(x.id) && seen.add(x.id)).slice(0, 10)
      .map(x => ({ id: x.id.slice(0, 24), name: String(x.name == null ? 'Status' : x.name).slice(0, 30), color: parseColor(x.color) || '#64748b' }));
    useStatuses(st.settings.statuses);
  }
  if (!STATUS[st.settings.projectStatus]) st.settings.projectStatus = '';
  if (!['left', 'center', 'right'].includes(st.settings.barAlign)) st.settings.barAlign = 'left';
  st.settings.barDates = !!st.settings.barDates;
  if (st.settings.barDateKind !== 'duration') st.settings.barDateKind = 'dates';
  if (st.settings.barDatesPos !== 'beside') st.settings.barDatesPos = 'in';
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
    if (!STATUS[row.status]) delete row.status; // one of the plan's statuses
    if (typeof row.note === 'string' && row.note.trim()) row.note = row.note.slice(0, 120); else delete row.note; // a line of commentary for the legend
    if (row.noteOff === true && row.note) row.noteOff = true; else delete row.noteOff; // kept off the chart
    if (row.key === true) row.key = true; else delete row.key; // a key milestone
    if (row.blocked === true) row.blocked = true; else delete row.blocked; // flagged as blocked, with an optional reason for the legend
    if (typeof row.blockedNote === 'string' && row.blockedNote.trim()) row.blockedNote = row.blockedNote.slice(0, 140); else delete row.blockedNote;
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
      else out += `<rect x="${n2(it.x)}" y="${n2(it.y)}" width="${n2(Math.max(0, it.w))}" height="${n2(it.h)}"${it.r ? ` rx="${n2(Math.min(it.r, it.w / 2, it.h / 2))}"` : ''} fill="${it.fill}"${it.opacity != null ? ` opacity="${it.opacity}"` : ''}${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw || 1}"` : ''}${it.ui ? ' pointer-events="none"' : ''}/>`;
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
      out += `<polygon points="${n2(cx)},${n2(cy - r)} ${n2(cx + r)},${n2(cy)} ${n2(cx)},${n2(cy + r)} ${n2(cx - r)},${n2(cy)}" fill="${it.fill}"${it.stroke ? ` stroke="${it.stroke}" stroke-width="${it.sw || 1.5}"` : ''}${it.opacity != null ? ` opacity="${it.opacity}"` : ''}${it.ui ? ' pointer-events="none"' : ''} stroke-linejoin="round"/>`;
    } else if (it.t === 'poly') {
      const pts = it.pts.map(p => p.slice());
      const [ex, ey] = pts[pts.length - 1];
      if (it.arrow) pts[pts.length - 1][0] -= 4;
      out += `<polyline points="${pts.map(p => n2(p[0]) + ',' + n2(p[1])).join(' ')}" fill="none" stroke="${it.stroke}" stroke-width="${it.sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (it.arrow) out += `<polygon points="${n2(ex)},${n2(ey)} ${n2(ex - 6)},${n2(ey - 3.5)} ${n2(ex - 6)},${n2(ey + 3.5)}" fill="${it.stroke}" stroke="${it.stroke}" stroke-width="1" stroke-linejoin="round"/>`;
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
      if (it.stroke) { g.strokeStyle = it.stroke; g.lineWidth = it.sw || 1.5; g.lineJoin = 'round'; g.stroke(); }
    } else if (it.t === 'poly') {
      const pts = it.pts.map(p => p.slice());
      const [ex, ey] = pts[pts.length - 1];
      if (it.arrow) pts[pts.length - 1][0] -= 4;
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.strokeStyle = it.stroke; g.lineWidth = it.sw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
      if (it.arrow) { g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - 6, ey - 3.5); g.lineTo(ex - 6, ey + 3.5); g.closePath(); g.fillStyle = it.stroke; g.strokeStyle = it.stroke; g.lineWidth = 1; g.lineJoin = 'round'; g.fill(); g.stroke(); }
    }
  }
  return c;
}

const coarse = matchMedia('(pointer: coarse)');
function renderChart() {
  const sw = svg.getBoundingClientRect().width;
  // handles are sized in screen pixels (k = chart units per pixel), and bigger for a finger
  const o = { sel, selSet: selIds(), k: sw > 0 ? (scene ? scene.w : 1280) / sw : 1, touch: coarse.matches };
  if (drag && drag.range) o.range = drag.range;
  if (drag && drag.dropY != null) { o.dropY = drag.dropY; o.dropLevel = drag.dropLevel; }
  if (drag && drag.toRow != null) o.rowHi = drag.toRowY;
  if (drag && drag.dropBox && drag.dropY != null) o.dropBox = drag.dropBox;
  scene = buildScene(state, o);
  svg.setAttribute('viewBox', `0 0 ${scene.w} ${scene.h}`);
  svg.setAttribute('font-family', `'${scene.font}', system-ui, sans-serif`);
  svg.innerHTML = sceneToSvg(scene, true) + '<g id="hov" pointer-events="none"></g>';
  drawHover(); syncLookbar();
  const wrap = $('#canvas-wrap');
  wrap.classList.toggle('transparent', scene.transparent);
  wrap.classList.toggle('dark', scene.transparent && scene.lightText);
  applyZoom();
  placeSelBar();
  syncQuickStatus();
  const sp = $('#chart-spread');
  if (sp) { sp.hidden = !(state.settings.rangeMode === 'fixed' && state.settings.rangeStart != null && state.rows.length); sp.disabled = !!state.settings.execView; $('#chart-spread-sep').hidden = sp.hidden; } // kept in place in exec view, so the toolbar doesn't move
  syncMarkerJump();
  const co = $('#chart-out');
  if (co) {
    const out = outsideRows();
    co.hidden = !out.length;
    if (out.length) co.innerHTML = `⚠ ${out.length} ${out.length === 1 ? 'item is' : 'items are'} outside the timeline <button class="link-btn" data-act="pull">Fit them in…</button>`;
  }
  const warn = $('#chart-warn');
  if (warn) {
    warn.hidden = !(scene.fixedPx && !scene.fits);
    if (!warn.hidden) { const h = fitWarnHtml(); if (warn.innerHTML !== h) warn.innerHTML = h; }
  }
}
/** the plan is taller than its fixed canvas even squeezed: say why, and offer what would make room, gentlest first */
function fitWarnHtml() {
  const S = state.settings, fixes = [];
  const datesIn = S.barDates && (S.pack || S.taskLabels === 'bars') && S.barDatesPos !== 'beside';
  if (S.density === 'roomy') fixes.push(['density', 'Auto row height']);
  if (datesIn) fixes.push(['dates', 'Dates after the bars']);
  if (S.textAuto === false) fixes.push(['text', 'Automatic text size']);
  fixes.push(['fit', 'Height follows the plan']);
  const why = S.density === 'roomy' ? 'Roomy rows don’t fit the canvas' : S.textAuto === false ? `Too tall for the canvas at ${S.textPt} pt text` : 'Too tall for the canvas, even with the smallest rows and text';
  return `⚠ ${why} — try ${fixes.map(([k, l]) => `<button class="link-btn warn-fix" data-fix="${k}">${l}</button>`).join('<span class="warn-or"> or </span>')}`;
}
function refresh() { renderChart(); renderOutline(); syncDesign(); syncPop(); syncAddNote(); }
function syncAddNote() {
  const r = sel && state.rows[rowIndex(sel)];
  $('#chart-add-note').textContent = state.settings.execView ? 'Exec view — edit in the Plan panel, or switch it off to edit here' : r ? `Adds after “${r.name || 'Untitled'}”` : '';
  syncSelBar();
}

$('#chart-spread').addEventListener('click', fitPlan);
$('#chart-out').addEventListener('click', e => { if (e.target.closest('[data-act="pull"]')) outsideDialog(); });
$('#chart-warn').addEventListener('click', e => {
  const b = e.target.closest('[data-fix]');
  if (!b) return;
  const f = b.dataset.fix;
  const [k, v, said] = { density: ['density', 'auto', 'Row height set to Auto'], dates: ['barDatesPos', 'beside', 'Dates moved after the bars'], text: ['textAuto', true, 'Text size set to automatic'], fit: ['fit', 'content', 'The canvas height now follows the plan'] }[f];
  setSetting(k, v);
  toast(`${said}${scene.fixedPx && !scene.fits ? ', but it still doesn’t fit' : ''} — Undo puts it back`);
});

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
/** how long a new task is by default: about a fifth of the timeline, so a short timeline gets short tasks and a long one gets weeks, and never most of it */
function defaultTaskDays() {
  const S = state.settings;
  const fixed = S.rangeMode === 'fixed' && S.rangeStart != null && S.rangeEnd != null;
  let span = 0;
  if (fixed) span = S.rangeEnd - S.rangeStart + 1;
  else { const info = derive(state.rows); if (info.length) span = Math.max(...info.map(n => n.end)) - Math.min(...info.map(n => n.start)) + 1; }
  let d = span / 5;
  d = d < 7 ? Math.round(d) : Math.round(d / 7) * 7; // days on a short timeline, whole weeks on a long one
  d = Math.max(1, Math.min(d, Math.floor(span / 3)));
  return fixed ? d : Math.max(5, d); // with the timeline fitting the tasks there is no fixed span to size against, so five days at least
}
/** a new task shouldn't begin or end on a weekend: the start moves on to Monday; an end on Saturday goes back to Friday and one on Sunday on to Monday (Friday if Monday would leave a fixed timeline), so the length changes by a day at most */
function snapToWorkdays(s, e, hi) {
  const weekend = d => dow(d) >= 5;
  if (weekend(s)) { const mon = nextWorkday(s); if (mon <= e) s = mon; else { s = e = s - (dow(s) - 4); } }
  if (weekend(e)) {
    const mon = nextWorkday(e), fri = e - (dow(e) - 4);
    if (dow(e) === 5) { if (fri >= s) e = fri; } // Saturday: back to Friday
    else e = (hi == null || mon <= hi) ? mon : (fri >= s ? fri : e); // Sunday: on to Monday
  }
  return [s, e];
}
/** Analytics: GoatCounter (cookie-free, no consent banner), loaded only on the live site so local copies, forks and tests send
 *  nothing. It counts page views by path (never the #… part, where share links carry the plan), and track() counts a few major
 *  actions by a fixed name only: never anything from the plan — no names, dates, owners or links. */
const trackQueue = []; // actions taken before the script has loaded (opening a #plan= link happens on arrival)
if (/^(www\.)?slideline\.co$/.test(location.hostname)) {
  const gc = document.createElement('script');
  gc.async = true; gc.src = 'https://gc.zgo.at/count.js'; gc.dataset.goatcounter = 'https://slideline.goatcounter.com/count';
  gc.onload = () => trackQueue.splice(0).forEach(track);
  document.head.appendChild(gc);
}
function track(name) {
  try {
    const gc = window.goatcounter;
    if (gc && typeof gc.count === 'function') gc.count({ path: name, title: name, event: true });
    else if (trackQueue.length < 20) trackQueue.push(name);
  } catch (e) { /* analytics must never break the app */ }
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
    const [s2, e2] = snapToWorkdays(s, s + defaultTaskDays() - 1);
    rows.push(area, newRow({ level: 1, name: 'New task', start: s2, end: e2 }));
    sel = area.id; commit(); refresh(); show(area.id);
    track('add-area');
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
  else { // a new task follows the one before it, is sized to the timeline, and stays inside a fixed one
    const days = defaultTaskDays();
    row.start = ref ? nextWorkday(ref.end + 1) : emptyStart; row.end = row.start + days - 1; row.name = '';
    if (S0.rangeMode === 'fixed' && S0.rangeStart != null && S0.rangeEnd != null && row.end > S0.rangeEnd) { row.end = S0.rangeEnd; row.start = Math.max(S0.rangeStart, row.end - days + 1); }
    [row.start, row.end] = snapToWorkdays(row.start, row.end, S0.rangeMode === 'fixed' && S0.rangeEnd != null ? S0.rangeEnd : null);
  }
  rows.splice(at, 0, row);
  if (childOf && childOf.level === 0) childOf.row.keepTask = true; // the task stays a task, now holding a subtask
  normalizeLevels(rows);
  sel = row.id; commit(); refresh(); show(row.id);
  track(kind === 'milestone' ? 'add-milestone' : 'add-task'); // subtasks count as tasks
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
/** typing on a selected item starts its name afresh with what was typed (in the popover's name box if that is open, else right where the name is drawn) */
function typeToRename(id, ch) {
  let inp = null;
  if (pop && pop.kind === 'row' && pop.id === id) { inp = $('#pop-name'); if (inp) inp.focus(); }
  else { editOnChart(id); inp = $('.inline-edit') || $('#pop-name'); }
  if (!inp) return;
  inp.value = ch;
  inp.setSelectionRange(ch.length, ch.length);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
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
/** buttons that add next to an item, so a subtask is never only a keyboard shortcut away: a task gets “+ Subtask” (inside it)
 *  and “+ Task below”; a subtask, which can't hold anything, “+ Subtask below”; a milestone “+ Task below” */
const canHoldSub = n => !n.milestone && !n.sub && !n.isArea;
function addBtnsHtml(n) {
  const below = n.sub ? '+ Subtask below' : '+ Task below';
  return `<div class="pop-adds">${canHoldSub(n) ? '<button class="chip-btn" data-act="sub-add" title="Add a subtask inside it (Shift+Enter)">+ Subtask</button>' : ''}<button class="chip-btn" data-act="next-add" title="Add an item after it (Enter)">${below}</button></div>`;
}
/** the popover's footer: the add pills, then one quiet row of icon buttons (outdent, indent | select more, duplicate … delete) */
const PF_ICON = {
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6H10M20 12h-7M20 18H10M7 9l-3 3 3 3"/></svg>',
  in: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6H10M20 12h-7M20 18H10M4 9l3 3-3 3"/></svg>',
  pick: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.3 2.8 2.8L16.2 9"/></svg>',
};
function popFootHtml(n, rows) {
  return `<div class="pop-foot">${addBtnsHtml(n)}<div class="pf-bar">`
    + `<button class="pf-ic" data-act="outdent" title="Outdent (Shift+Tab)" aria-label="Outdent" ${n.level === 0 ? 'disabled' : ''}>${PF_ICON.out}</button>`
    + `<button class="pf-ic" data-act="indent" title="Indent (Tab)" aria-label="Indent" ${canIndent(rows, n.i) ? '' : 'disabled'}>${PF_ICON.in}</button><span class="pf-sep"></span>`
    + `<button class="pf-ic pf-pick" data-act="pick" aria-label="Select more" title="Select more: keeps this one selected; then ${tapWord()} other items to add them (with a keyboard: Shift or Ctrl/⌘-click)">${PF_ICON.pick}</button>`
    + `<button class="pf-ic" data-act="dup" title="Duplicate (Ctrl/⌘+D)" aria-label="Duplicate">${SB_ICON.dup}</button><span class="pf-gap"></span>`
    + `<button class="pf-ic danger" data-act="del" title="Delete (Delete key)" aria-label="Delete">${SB_ICON.del}</button></div></div>`;
}
function setRowStatus(ids, v) {
  commit();
  ids.forEach(id => { const r = state.rows[rowIndex(id)]; if (r) { if (v) r.status = v; else delete r.status; } });
  if (v && !state.settings.showStatus) state.settings.showStatus = true;
  commit(); refresh();
}
/** Alt+B: flag the selected tasks as blocked (or clear it when they all are already) */
function toggleBlocked(ids) {
  const info = derive(state.rows), rows = ids.map(id => info.find(n => n.row.id === id)).filter(n => n && !n.isArea).map(n => n.row);
  if (!rows.length) { toast('Areas can’t be blocked — select a task or milestone'); return; }
  const on = !rows.every(r => r.blocked);
  commit();
  rows.forEach(r => { if (on) r.blocked = true; else delete r.blocked; });
  commit(); refresh();
  toast(on ? `${rows.length === 1 ? 'Marked as blocked' : rows.length + ' items marked as blocked'} — Alt+B clears it` : 'Block cleared');
}
function depsHtml(n, info, rows) {
  const r = n.row;
  if (n.hasKids) return '';
  const others = info.filter(o => o.row.id !== r.id && !o.isArea && !r.deps.includes(o.row.id));
  return `<div class="field"><span>Dependencies</span>${r.deps.length ? `<div class="dep-chips">${r.deps.map(d => { const o = rows.find(x => x.id === d); return o ? `<span>${esc(o.name || 'Untitled')}<button data-act="dep-rm" data-dep="${d}" aria-label="Remove">✕</button></span>` : ''; }).join('')}</div>` : ''}
    <select class="inp" data-f="dep-add"><option value="">Add a dependency…</option>${others.map(o => `<option value="${o.row.id}">${'  '.repeat(o.level)}${esc(o.row.name || 'Untitled')}</option>`).join('')}</select></div>`;
}
function rowActionsHtml(n, rows) {
  return (n.isArea ? '' : addBtnsHtml(n)) + `<div class="row-actions"><button data-act="outdent" title="Outdent (Shift+Tab)" ${n.level === 0 ? 'disabled' : ''}>← Outdent</button><button data-act="indent" title="Indent (Tab)" ${canIndent(rows, n.i) ? '' : 'disabled'}>Indent →</button><button data-act="dup">Duplicate</button><button data-act="del" class="danger">Delete</button></div>`;
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
  html += depsHtml(n, info, rows);
  html += rowActionsHtml(n, rows) + '</div>';
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
      <span class="pick" aria-hidden="true"></span><span class="grip" title="Drag to reorder">⋮⋮</span><span class="indent" style="width:${n.level * 14}px"></span>
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
    else if (a === 'sub-add' || a === 'next-add') { commit(); addRow('task', id, true, false, a === 'sub-add'); }
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
  if (host.classList.contains('orow') && !e.target.closest('input,.grip')) { if (e.shiftKey || e.ctrlKey || e.metaKey || selecting) multiSelect(id, e.shiftKey ? 'range' : 'toggle'); else select(id); }
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
  if (e.button || !e.isPrimary || pinch) return; // a second finger is a pinch, not a tap or a drag
  const t = e.target.closest('[data-role]');
  if (!t) { if (sel && !selecting) select(null); return; }
  const role = t.dataset.role, id = t.dataset.id || null;
  const touch = e.pointerType === 'touch';
  const rect = t.getBoundingClientRect();
  // a finger on an item that isn't selected yet: select it when the finger lifts, unless it scrolled or pinched in between
  if (touch && id && (id !== sel || role === 'row')) { touchTap = { id, role, rect, x: e.clientX, y: e.clientY, pid: e.pointerId }; return; }
  e.preventDefault();
  if (document.activeElement && document.activeElement !== document.body) { commit(); document.activeElement.blur(); }
  try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const box = svg.getBoundingClientRect();
  const n = id ? scene.info.find(x => x.row.id === id) : null;
  drag = { touch, role, id, x: e.clientX, y: e.clientY, k: scene.w / box.width, left: box.left, top: box.top, ppd: scene.ppd, moved: false, rect, mod: e.shiftKey ? 'range' : (e.ctrlKey || e.metaKey || selecting) ? 'toggle' : null };
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
    if (d.role === 'row' && !isArea && !d.touch) { if (dbl) editRowName(d.id, d.rect); } // an area's name or heading opens its popover too, and on a touch screen any name does
    else if (d.role === 'row' && dbl) editRowName(d.id, d.rect);
    else { openPop('row', d.rect, d.id, d.x - 60); if (dbl) { const inp = $('#pop-name'); if (inp) inp.select(); } }
  }
}
/** drop a drag without applying it (a second finger came down to pinch): back to the plan as it was when the drag began */
function cancelDrag() {
  const d = drag;
  drag = null;
  svg.classList.remove('dragging');
  if (d && d.moved) { state = JSON.parse(lastSnap); refresh(); }
}
let lastClick = { id: null, t: 0 }, touchTap = null;
svg.addEventListener('pointerup', e => {
  const t = touchTap;
  touchTap = null;
  if (t && t.pid === e.pointerId && !pinch) { if (selecting) multiSelect(t.id, 'toggle'); else { select(t.id); openPop('row', t.rect, t.id, t.x - 60); } } // a name too: on a phone the popover is the only way to its actions
  endDrag();
});
svg.addEventListener('pointermove', e => { if (touchTap && Math.hypot(e.clientX - touchTap.x, e.clientY - touchTap.y) > 10) touchTap = null; });
svg.addEventListener('pointercancel', () => { touchTap = null; endDrag(); }); // the browser took the finger to scroll

// ---------------------------------------------------------------- design panel
// Sections run from the page as a whole (Canvas) through time (Timeline), what sits on it (Tasks, Milestones), how the plan is
// doing (Progress, Status) to the look (Colour, Text). Each control can carry `kw` (extra words the search finds it by), `dep`
// (the control that reveals it, when that isn't the switch just above it) and `why` (said in search results while it is hidden).
const DESIGN = [
  ['canvas', 'Canvas', [
    { type: 'head', label: 'View' },
    { k: 'execView', type: 'toggle', label: 'Exec view', kw: 'executive summary collapse roll up overview areas only' },
    { k: '_execNote', type: 'note', label: 'One bar per area, with its dates, progress and status rolled up, and the milestones in a strip above (the key ones, if any are marked). The plan itself is untouched: edit it in the Plan panel, or switch this off to edit on the chart.', when: s => s.execView },
    { type: 'head', label: 'Size' },
    { k: 'canvas', type: 'select', label: 'Canvas size', kw: 'slide page paper dimensions aspect ratio 16:9 4:3 a4 letter widescreen', opts: CANVASES.map(c => [c.id, c.name]).concat([['custom', 'Custom size…']]) },
    { k: 'canvasW', type: 'number', label: 'Width (in)', sub: true, min: 3, max: 40, step: 0.1, kw: 'inches custom', when: s => s.canvas === 'custom' },
    { k: 'canvasH', type: 'number', label: 'Height (in)', sub: true, min: 2, max: 40, step: 0.1, kw: 'inches custom', when: s => s.canvas === 'custom' },
    { k: 'fit', type: 'seg', label: 'Height', kw: 'canvas height fit content fixed', opts: [['content', 'Fit content'], ['fixed', 'Fixed']] },
    { k: '_canvasInfo', type: 'info', id: 'canvas-info' },
    { type: 'head', label: 'Title' },
    { k: 'showTitle', type: 'toggle', label: 'Show title', kw: 'heading headline' },
    { k: 'titleAuto', type: 'toggle', label: 'Write the headline for me', sub: true, kw: 'automatic auto headline summary', when: s => s.showTitle },
    { k: 'title', type: 'text', label: 'Title', sub: true, ph: 'Chart title', kw: 'heading name', when: s => s.showTitle && !s.titleAuto },
    { k: '_headNote', type: 'note', label: 'The title is written from the plan: where the finish stands (against the baseline or the overall status), then the biggest issue or the next milestone. It updates as the plan changes; type over it on the chart to take it back.', when: s => s.showTitle && s.titleAuto },
    { k: 'titleScale', type: 'seg', label: 'Title size', num: true, dep: 'showTitle', kw: 'heading font big small large', opts: [[0.8, 'Small'], [1, 'Regular'], [1.3, 'Large']], when: s => s.showTitle },
  ]],
  ['timeline', 'Timeline', [
    { type: 'head', label: 'Scale' },
    { k: 'scale', type: 'seg', label: 'Periods', col: true, kw: 'scale zoom granularity units days weeks sprints months quarters', opts: [['days', 'Days'], ['weeks', 'Weeks'], ['sprints', 'Sprints'], ['months', 'Months'], ['quarters', 'Qtrs']] },
    { k: 'sprintWeeks', type: 'seg', label: 'A sprint is', num: true, kw: 'sprint length iteration agile scrum', why: 'Shown on the Sprints scale (Timeline → Periods).', opts: [[1, '1 wk'], [2, '2 wk'], [3, '3 wk'], [4, '4 wk']], when: s => s.scale === 'sprints' },
    { type: 'head', label: 'Span' },
    { k: 'rangeMode', type: 'seg', label: 'Overall span', kw: 'range start end begin finish dates fixed length', opts: [['auto', 'Fit to tasks'], ['fixed', 'Fixed']] },
    { k: 'rangeStart', type: 'date', label: 'From', sub: true, kw: 'start begin', when: s => s.rangeMode === 'fixed' },
    { k: 'rangeEnd', type: 'date', label: 'To', sub: true, kw: 'end finish', when: s => s.rangeMode === 'fixed' },
    { k: '_len', type: 'dur', label: 'Or length from start', sub: true, col: true, kw: 'duration', when: s => s.rangeMode === 'fixed' },
    { k: '_fit', type: 'button', label: 'Spread tasks across it', sub: true, act: 'fit', kw: 'stretch scale distribute', when: s => s.rangeMode === 'fixed' },
    { k: '_outInfo', type: 'info', id: 'out-info', when: s => outsideRows().length > 0 },
    { k: '_pull', type: 'button', label: 'Fit the items outside it…', sub: true, act: 'pull', why: 'Appears when items sit outside a fixed span.', when: s => outsideRows().length > 0 },
    { type: 'head', label: 'Dates' },
    { k: 'dateMode', type: 'seg', label: 'Shown as', kw: 'header calendar relative numbered week 1 day 1', opts: [['calendar', 'Dates'], ['relative', 'Numbered']] },
    { k: 'datePos', type: 'seg', label: 'Position', kw: 'header top bottom both axis', opts: [['top', 'Top'], ['bottom', 'Bottom'], ['both', 'Both']] },
    { k: 'periodNames', type: 'toggle', label: 'Period names', kw: 'header month names labels', why: 'Shown when dates are shown as Dates (Timeline → Shown as).', when: s => s.dateMode !== 'relative' },
    { k: 'periodMonths', type: 'seg', label: 'Month names', sub: true, kw: 'full abbreviated short january jan', opts: [['full', 'Full'], ['short', 'Abbreviated']], when: s => s.dateMode !== 'relative' && s.periodNames !== false && s.scale !== 'months' && s.scale !== 'quarters' },
    { k: 'periodYear', type: 'seg', label: 'Show the year', sub: true, col: true, kw: 'year header', opts: [['always', 'Always'], ['change', 'Only across years'], ['never', 'Never']], when: s => s.dateMode !== 'relative' && s.periodNames !== false && s.scale !== 'months' && s.scale !== 'quarters' },
    { k: 'dateFormat', type: 'select', label: 'Date format', col: true, kw: 'date style dd/mm mm/dd numbers year', opts: [['text', 'Day and month (9 Dec)'], ['textY', 'With year (9 Dec 2026)'], ['num', 'Numbers (9/12)'], ['numY', 'Numbers, short year (9/12/26)'], ['numYY', 'Numbers, full year (9/12/2026)'], ['day', 'Day only (9)']] },
    { k: 'dateOrder', type: 'seg', label: 'Order', sub: true, kw: 'day first month first american us european dd/mm mm/dd', opts: [['dmy', 'Day first'], ['mdy', 'Month first']], when: s => s.dateFormat !== 'day' },
    { k: '_dateEx', type: 'info', id: 'date-ex' },
    { type: 'head', label: 'Gridlines' },
    { k: 'gridCells', type: 'toggle', label: 'Period lines', kw: 'gridlines vertical lines day week sprint month quarter' },
    { k: 'gridMonths', type: 'toggle', label: 'Month lines', kw: 'gridlines vertical lines year', why: 'Shown when dates are shown as Dates (Timeline → Shown as).', when: s => s.dateMode !== 'relative' },
    { type: 'head', label: 'Working days' },
    { k: 'weekends', type: 'toggle', label: 'Shade weekends', kw: 'saturday sunday shading non-working', why: 'Shown on the Days scale (Timeline → Periods).', when: s => s.scale === 'days' },
    { k: 'showDaysOff', type: 'toggle', label: 'Shade non-working days', kw: 'holidays freeze shutdown calendar days off vacation bank holiday' },
    { k: 'daysOff', type: 'daysoff', label: 'Non-working days', sub: true, col: true, kw: 'holidays freeze shutdown calendar days off vacation bank holiday add' },
    { k: '_offNote', type: 'note', label: 'Holidays, freezes, shutdowns: shaded on the chart, left out of working-day counts in the item popover, and never counted in “Days left”.' },
  ]],
  ['tasks', 'Tasks', [
    { type: 'head', label: 'Rows' },
    { k: 'pack', type: 'seg', label: 'Row layout', bool: true, kw: 'sequence pack compact same line one per task swimlane', opts: [['false', 'One per task'], ['true', 'In sequence']] },
    { k: 'density', type: 'seg', label: 'Row height', kw: 'density spacing padding compact roomy tight', opts: [['compact', 'Compact'], ['auto', 'Auto'], ['roomy', 'Roomy']] },
    { k: 'stripes', type: 'toggle', label: 'Row stripes', kw: 'zebra banding alternate shading' },
    { k: 'corners', type: 'seg', label: 'Bar corners', kw: 'rounded radius pill square shape', opts: [['square', 'Square'], ['rounded', 'Rounded'], ['pill', 'Pill']] },
    { type: 'head', label: 'Name position' },
    { k: 'taskLabels', type: 'seg', label: 'Task names', kw: 'labels left side on bars inside', opts: [['left', 'On the left'], ['bars', 'On the bars']] },
    { k: '_packNote', type: 'note', label: 'Task names sit on the bars while Row layout is “In sequence”, because a row can hold several tasks. Switch it to “One per task” to put them on the left.', when: s => s.pack },
    { k: 'barAlign', type: 'seg', label: 'Text on bars', sub: true, kw: 'align alignment centre center right left justify name position', why: 'Shown when names sit on the bars (Tasks → Task names → On the bars).', opts: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], when: s => s.pack || s.taskLabels === 'bars' },
    { k: 'barDates', type: 'toggle', label: 'Dates or duration on the bars', sub: true, kw: 'start end date range show dates duration length days weeks on bars', why: 'Shown when names sit on the bars (Tasks → Task names → On the bars).', when: s => s.pack || s.taskLabels === 'bars' },
    { k: 'barDateKind', type: 'seg', label: 'Show', sub: true, kw: 'dates duration length days weeks start end', why: 'Shown with Tasks → Dates or duration on the bars.', opts: [['dates', 'Dates'], ['duration', 'Duration']], when: s => (s.pack || s.taskLabels === 'bars') && s.barDates },
    { k: 'barDatesPos', type: 'seg', label: 'Where', sub: true, kw: 'dates beside outside after bar under name slim thin two lines', why: 'Shown with Tasks → Dates or duration on the bars.', opts: [['in', 'Under the name'], ['beside', 'After the bar']], when: s => (s.pack || s.taskLabels === 'bars') && s.barDates },
    { k: '_barDurNote', type: 'note', label: 'The timeline counts periods (“Week 1”) rather than dates, so bars show each task’s duration.', when: s => (s.pack || s.taskLabels === 'bars') && s.barDates && s.dateMode === 'relative' && s.barDateKind !== 'duration' },
    { k: 'areaLabels', type: 'seg', label: 'Area names', kw: 'labels headings group phase side', why: 'Appears once the plan has an area.', opts: [['row', 'As headings'], ['side', 'At the side']], when: () => derive(state.rows).some(n => n.isArea) },
    { type: 'head', label: 'Assignees' },
    { k: 'assignees', type: 'toggle', label: 'Show assignees', kw: 'owner people person who responsible team resource' },
    { k: 'assigneePos', type: 'seg', label: 'Placed', sub: true, kw: 'under beside on bar position', opts: [['under', 'Under'], ['beside', 'Beside'], ['bars', 'On bar']], when: s => s.assignees },
    { k: 'assigneeNames', type: 'toggle', label: 'Show names', sub: true, when: s => s.assignees && s.assigneePos === 'bars' },
    { k: 'assigneeAvatar', type: 'toggle', label: 'Show initials avatar', sub: true, kw: 'circle badge', when: s => s.assignees && s.assigneePos !== 'bars' },
    { k: 'assigneeAreas', type: 'toggle', label: 'Include areas', sub: true, when: s => s.assignees },
    { k: 'assigneeLevel', type: 'seg', label: 'For', sub: true, kw: 'tasks subtasks level', opts: [['tasks', 'Tasks'], ['subtasks', 'Subtasks'], ['all', 'Both']], when: s => s.assignees },
    { type: 'head', label: 'Dependencies' },
    { k: 'deps', type: 'toggle', label: 'Dependency lines', kw: 'arrows links connectors predecessors depends on' },
    { k: 'criticalPath', type: 'toggle', label: 'Highlight the critical path', sub: true, kw: 'critical chain longest finish', when: s => s.deps },
    { k: '_critNote', type: 'note', label: 'Traced back from the item that finishes last, through the dependency that finishes latest each time: the chain that decides the end date. Bars get a deep red edge and the links turn thicker.', when: s => s.deps && s.criticalPath },
  ]],
  ['milestones', 'Milestones', [
    { k: 'msAlign', type: 'seg', label: 'Milestone sits at', col: true, kw: 'diamond position align day start middle end', opts: [['auto', 'Auto'], ['start', 'Day start'], ['middle', 'Middle'], ['end', 'Day end']] },
    { k: 'msLines', type: 'toggle', label: 'Guide lines', kw: 'diamond vertical lines milestone lines' },
    { k: 'keyStrip', type: 'toggle', label: 'Key milestones strip', kw: 'diamond highlights important strip above' },
    { k: '_keyNote', type: 'note', label: 'A strip above the chart with the milestones you tick “Key milestone” on (every milestone if none is ticked), on the same time scale.', when: s => s.keyStrip },
  ]],
  ['progress', 'Progress', [
    { type: 'head', label: 'Date marker' },
    { k: 'todayLine', type: 'toggle', label: 'Show the date marker', kw: 'today now line status date as of' },
    { k: 'todayDate', type: 'date', label: 'Date', sub: true, kw: 'today as of', when: s => s.todayLine },
    { k: 'markerLabelOn', type: 'toggle', label: 'Show label', sub: true, when: s => s.todayLine },
    { k: 'todayLabel', type: 'text', label: 'Label text', sub: true, ph: 'Today', when: s => s.todayLine && s.markerLabelOn !== false },
    { k: 'markerStyle', type: 'seg', label: 'Line', sub: true, kw: 'solid dashed dotted style', opts: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], when: s => s.todayLine },
    { k: 'markerWidth', type: 'seg', label: 'Thickness', sub: true, num: true, kw: 'width weight thin bold', opts: [[1, 'Thin'], [2, 'Regular'], [3, 'Bold']], when: s => s.todayLine },
    { k: 'markerColor', type: 'markercolor', label: 'Colour', sub: true, col: true, kw: 'marker colour', when: s => s.todayLine },
    { type: 'head', label: 'Progress in bars' },
    { k: 'progressMode', type: 'seg', label: 'Fill bars', col: true, kw: 'progress percent complete done fill', opts: [['off', 'Off'], ['manual', 'Set per bar'], ['marker', 'Up to date marker']] },
    { k: '_markerNote', type: 'note', label: 'Turn on the date marker (above) to show progress up to it. Until then each bar shows the value set on it.', when: s => s.progress && s.progressSource === 'marker' && !s.todayLine },
    { k: 'progressStyle', type: 'seg', label: 'Style', sub: true, col: true, kw: 'progress pale darker shade', opts: [['pale', 'Pale unfinished'], ['shade', 'Darker finished']], when: s => s.progress },
    { k: '_progNote', type: 'note', label: '“Pale unfinished” tints the part still to do, so bars at 0% look washed out. “Darker finished” keeps every bar in its palette colour, with the same label colour throughout.', when: s => s.progress },
    { type: 'head', label: 'Days left' },
    { k: 'daysLeft', type: 'toggle', label: 'On each item', kw: 'days left remaining countdown' },
    { k: 'planDaysLeft', type: 'toggle', label: 'For the whole plan', kw: 'days left remaining countdown project' },
    { k: 'daysLeftWeekdays', type: 'toggle', label: 'Count weekdays only', sub: true, kw: 'days left working business days', dep: 'daysLeft', when: s => s.daysLeft || s.planDaysLeft },
    { k: '_dlNote', type: 'note', label: 'Counted from the date marker’s date (today unless you set one): to the end of each item, and for the whole plan to its last item. Non-working days (Timeline → Working days) are never counted. The plan’s count appears beside the marker’s label (top right if the marker is off).', when: s => s.daysLeft || s.planDaysLeft },
  ]],
  ['status', 'Status', [
    { type: 'head', label: 'Status dots' },
    { k: 'showStatus', type: 'toggle', label: 'Status dots', kw: 'status rag traffic light health on track at risk' },
    { k: 'projectStatus', type: 'select', label: 'Overall status', sub: true, col: true, kw: 'rag project plan on track at risk off track title green amber red', opts: [['', 'None']], when: s => s.showStatus },
    { k: '_statNote', type: 'note', label: 'Set a status on any item from its popover, where Status → Edit statuses… renames them, recolours them, adds your own and puts them in order from best to worst. Areas show the worst status of what is inside them unless you set one. The overall status sits beside the title.', when: s => s.showStatus },
    { type: 'head', label: 'Notes' },
    { k: 'notesLegend', type: 'toggle', label: 'Notes in the legend', kw: 'comments commentary annotation footnote remarks legend key', why: '' },
    { k: '_notesNote', type: 'note', label: 'Add a note to any task or milestone from its popover (+ Add → Note). It gets a number beside its bar and a line in the legend, numbered with the reasons for changes from the baseline.', when: s => s.notesLegend !== false },
    { type: 'head', label: 'Blocked items' },
    { k: 'blockedWaiting', type: 'toggle', label: 'Show what is waiting on them', kw: 'blocked stuck blockers stripes dependents' },
    { k: 'blockedLegend', type: 'toggle', label: 'Legend and reasons', kw: 'blocked stuck blockers key' },
    { k: '_blockedNote', type: 'note', label: 'Mark an item blocked in its popover (or select it and press Alt+B). It gets striped, with a red “!”; anything that depends on it and isn’t finished gets lighter stripes.' },
    { type: 'head', label: 'Changes from original' },
    { k: 'showChanges', type: 'toggle', label: 'Show changes from the baseline', kw: 'baseline original slip slipped moved variance delay compare' },
    { k: 'changesLegend', type: 'toggle', label: 'Legend and notes', sub: true, kw: 'baseline key', when: s => s.showChanges },
    { k: 'slipChip', type: 'toggle', label: 'Finish vs baseline beside the title', sub: true, kw: 'baseline slip late early', when: s => s.showChanges },
    { k: '_baseInfo', type: 'info', id: 'base-info', when: s => s.showChanges },
    { k: '_baseBtn', type: 'button', label: 'Update or remove baseline…', sub: true, act: 'baseline', kw: 'reset clear snapshot', when: s => s.showChanges },
  ]],
  ['colour', 'Colour', [
    { type: 'head', label: 'Palette' },
    { k: '_palette', type: 'palette', label: 'Palette', kw: 'colour scheme theme swatches brand ready-made presets custom own save' },
    { k: 'colorBy', type: 'seg', label: 'Share a colour by', kw: 'palette area row group', opts: [['group', 'Area'], ['row', 'Row']] },
    { k: '_colorByNote', type: 'note', label: 'Area: an area and everything in it share a colour. Row: each line takes the next colour, and tasks sharing a line (Tasks → Row layout → In sequence) match.', when: s => s.colorBy === 'row' || s.pack },
    { type: 'head', label: 'Background' },
    { k: 'bgTransparent', type: 'toggle', label: 'Transparent background', kw: 'png alpha see-through clear' },
    { k: 'bg', type: 'color', label: 'Background colour', kw: 'fill white canvas', dep: 'bgTransparent', when: s => !s.bgTransparent },
    { type: 'head', label: 'Text colour' },
    { k: 'textMode', type: 'seg', label: 'Text', kw: 'font colour dark light contrast', opts: [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']] },
    { k: 'barText', type: 'seg', label: 'Text on bars', sub: true, kw: 'label colour white dark contrast', why: 'Shown when names sit on the bars (Tasks → Task names, or Row layout “In sequence”).', opts: [['auto', 'Auto'], ['light', 'White'], ['dark', 'Dark']], when: s => s.pack || s.taskLabels === 'bars' },
  ]],
  ['text', 'Text', [
    { type: 'head', label: 'Font' },
    { k: 'font', type: 'select', label: 'Font', kw: 'typeface family', opts: FONTS.map(f => [f, f]) },
    { k: 'textAuto', type: 'toggle', label: 'Automatic text size', kw: 'font size scale' },
    { k: 'textPt', type: 'number', label: 'Text size (pt)', sub: true, min: 5, max: 48, step: 0.5, kw: 'font size points', when: s => !s.textAuto },
    { k: '_textInfo', type: 'info', id: 'text-info' },
    { type: 'head', label: 'Names' },
    { k: 'textCase', type: 'seg', label: 'Name case', kw: 'uppercase capitals capitalise title case caps', opts: [['default', 'As typed'], ['upper', 'UPPER'], ['title', 'Title Case']] },
    { k: 'overflow', type: 'seg', label: 'Long names', col: true, kw: 'overflow truncate ellipsis shrink fit outside', opts: [['outside', 'Move outside'], ['shrink', 'Shrink'], ['truncate', 'Truncate']] },
    { k: 'wrapNames', type: 'toggle', label: 'Wrap to two lines first', kw: 'long names wrap multi-line' },
  ]],
];
const designEl = $('#design');
const designCtl = {};
/** every searchable control, with where it sits: { c, sec, title, head, parent (the control that reveals it), owner (for notes) } */
const designItems = [];
function buildDesign() {
  let html = '';
  designItems.length = 0;
  DESIGN.forEach(([id, title, ctls]) => {
    let head = '', lastTop = null, last = null;
    const open = ui.designOpen[id] !== false;
    html += `<section class="group${open ? '' : ' collapsed'}" data-sec="${id}"><h3><button class="ghead" data-sec-toggle="${id}" aria-expanded="${open}" aria-controls="sec-${id}"><i class="chev" aria-hidden="true"></i><span class="gt">${title}</span><span class="gsum" data-sum="${id}"></span></button></h3><div class="gbody" id="sec-${id}">`;
    ctls.forEach(c => {
      if (c.k) designCtl[c.k] = c;
      if (c.type === 'head') { head = c.label; html += `<h4 class="ghd">${c.label}</h4>`; return; }
      if (c.type === 'note' || c.type === 'info') designItems.push({ c, sec: id, owner: last });
      else {
        const it = { c, sec: id, title, head, parent: c.dep ? designItems.find(x => x.c.k === c.dep) : c.sub ? lastTop : null };
        it.text = searchNorm([title, head, c.label, c.kw, (c.opts || []).map(o => o[1]).join(' ')].join(' '));
        designItems.push(it); last = it;
        if (!c.sub) lastTop = it;
      }
      const cls = `ctl${c.sub ? ' sub' : ''}${c.col || c.type === 'themes' ? ' col' : ''}`;
      const lbl = `<span class="lbl">${c.label || ''}</span>`;
      if (c.type === 'palette') html += `<div class="pal-ctl" data-w="${c.k}">${paletteHtml()}</div>`;
      else if (c.type === 'seg') html += `<div class="${cls}" data-w="${c.k}">${lbl}<div class="seg" data-k="${c.k}">${c.opts.map(o => `<button data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>`;
      else if (c.type === 'toggle') html += `<label class="${cls}" data-w="${c.k}">${lbl}<span class="switch"><input type="checkbox" data-k="${c.k}"><i></i></span></label>`;
      else if (c.type === 'color') html += `<div class="${cls}" data-w="${c.k}">${lbl}<span class="color"><input class="inp hex" data-k="${c.k}" data-hex maxlength="7" spellcheck="false" aria-label="${c.label} hex"><input type="color" data-k="${c.k}" aria-label="${c.label}"></span></div>`;
      else if (c.type === 'dur') html += `<div class="${cls}" data-w="${c.k}">${lbl}${durControl(0, 6, 'len-n', 'len-u')}</div>`;
      else if (c.type === 'info') html += `<p class="ctl-note" id="${c.id}" data-w="${c.k}"></p>`;
      else if (c.type === 'markercolor') html += `<div class="${cls}" data-w="${c.k}">${lbl}<div class="swatches mk-sw"></div></div>`;
      else if (c.type === 'note') html += `<p class="ctl-note" data-w="${c.k}">${c.label}</p>`;
      else if (c.type === 'daysoff') html += `<div class="${cls}" data-w="${c.k}">${lbl}<div class="off-list" id="off-list"></div><div class="off-add"><input class="inp" type="date" min="1990-01-01" max="2100-12-31" id="off-from" aria-label="From"><input class="inp" type="date" min="1990-01-01" max="2100-12-31" id="off-to" aria-label="To (optional)" title="To (optional, for a range)"><input class="inp off-name" id="off-name" placeholder="Label (optional)" maxlength="40" autocomplete="off"><button class="btn ghost" data-act="off-add">Add</button></div></div>`;
      else if (c.type === 'button') html += `<div class="${cls}" data-w="${c.k}"><button class="btn ghost wide" data-act="${c.act}">${c.label}</button></div>`;
      else if (c.type === 'select') html += `<label class="${cls}" data-w="${c.k}">${lbl}<select class="inp"${c.col ? '' : ' style="width:170px"'} data-k="${c.k}">${c.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></label>`;
      else html += `<label class="${cls}" data-w="${c.k}">${lbl}<input class="inp" style="width:170px" type="${c.type}" data-k="${c.k}" placeholder="${c.ph || ''}"${c.type === 'date' ? ' min="1990-01-01" max="2100-12-31"' : ''}${c.type === 'number' ? ` min="${c.min}" max="${c.max}" step="${c.step}" inputmode="decimal"` : ''}></label>`;
    });
    html += '</div></section>';
  });
  html += '<p class="srch-empty" id="srch-empty" hidden></p><div class="reset-row"><button class="link-btn quiet" data-act="reset">Reset to defaults…</button></div>';
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
  if (id === 'tasks') return [S.pack ? 'in sequence' : '', S.pack || S.taskLabels === 'bars' ? 'names on bars' : 'names left', S.assignees ? 'assignees' : '', S.deps ? (S.criticalPath ? 'critical path' : 'dependencies') : ''].filter(Boolean).join(' · ');
  if (id === 'milestones') return [S.keyStrip ? 'key strip' : '', S.msLines ? 'guide lines' : '', S.msAlign && S.msAlign !== 'auto' ? 'at ' + ({ start: 'day start', middle: 'middle', end: 'day end' }[S.msAlign] || S.msAlign) : ''].filter(Boolean).join(' · ') || 'diamonds only';
  if (id === 'progress') return [S.todayLine ? 'date marker' : '', S.progress ? (S.progressSource === 'marker' ? 'progress to marker' : 'progress per bar') : '', S.daysLeft || S.planDaysLeft ? 'days left' : ''].filter(Boolean).join(' · ') || 'nothing on';
  if (id === 'status') return [S.showStatus ? 'status dots' : '', S.blockedWaiting || S.blockedLegend ? 'blocked' : '', S.showChanges ? 'baseline' : ''].filter(Boolean).join(' · ') || 'nothing on';
  if (id === 'colour') return `<span class="gdots">${paletteOf(S).colors.slice(0, 7).map(c => `<i style="background:${c}"></i>`).join('')}</span>${S.bgTransparent ? 'transparent' : ''}`;
  if (id === 'text') return [S.font, S.textAuto === false ? S.textPt + ' pt' : '', { upper: 'UPPER', title: 'Title Case' }[S.textCase] || ''].filter(Boolean).join(' · ');
  return '';
}
function setSectionOpen(id, open) {
  ui.designOpen[id] = open; saveUi();
  const sec = $(`.group[data-sec="${id}"]`, designEl);
  if (!sec) return;
  sec.classList.toggle('collapsed', !open);
  $('.ghead', sec).setAttribute('aria-expanded', String(open));
}
// ---------------------------------------------------------------- design search
// Filters the panel to the controls whose name, section, heading, options or keywords hold every word typed. A match that is
// hidden right now (its switch is off) brings up the control that reveals it, with a line saying what is behind it.
const searchNorm = t => String(t || '').toLowerCase().replace(/colou?r/g, 'color').replace(/[“”"'’()…,./\-]/g, ' ').replace(/\s+/g, ' ');
const designSearch = $('#design-search');
let designQuery = '';
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function markLabel(el, words) {
  const plain = el.textContent;
  const re = new RegExp('(?<![a-z0-9])(' + words.map(w => escRe(w).replace(/color/g, 'colou?r')).join('|') + ')', 'gi');
  const html = esc(plain).replace(re, '<mark>$1</mark>');
  if (html !== esc(plain)) el.innerHTML = html;
}
function applySearch() {
  const S = state.settings, words = searchNorm(designQuery).trim().split(' ').filter(Boolean), on = words.length > 0;
  designEl.classList.toggle('searching', on);
  $$('.srch-hint', designEl).forEach(h => h.remove());
  $$('.unavail', designEl).forEach(w => w.classList.remove('unavail'));
  $$('.lbl', designEl).forEach(l => { if (l.querySelector('mark')) l.textContent = l.textContent; });
  const empty = $('#srch-empty', designEl);
  if (!on) {
    $$('.group, .ghd', designEl).forEach(g => { g.hidden = false; });
    $('.reset-row', designEl).hidden = false;
    empty.hidden = true;
    return;
  }
  const shown = new Set(), hints = new Map(), unavail = new Set();
  const visible = it => !it.c.when || it.c.when(S);
  designItems.forEach(it => {
    if (!it.text || !words.every(w => (' ' + it.text).includes(' ' + w))) return; // words match from their start: “date” finds Date format, not Update
    if (visible(it)) { shown.add(it); return; }
    if (!it.c.why) { // bring up whatever reveals it
      let p = it.parent;
      while (p && !visible(p)) p = p.parent;
      if (p) { shown.add(p); if (!hints.has(p)) hints.set(p, []); hints.get(p).push(it.c.label); return; }
    }
    shown.add(it); unavail.add(it);
  });
  designItems.forEach(it => { if (it.owner && shown.has(it.owner) && !unavail.has(it.owner) && visible(it)) shown.add(it); });
  const byKey = new Map(designItems.map(it => [it.c.k, it]));
  $$('[data-w]', designEl).forEach(w => { const it = byKey.get(w.dataset.w); w.hidden = !(it && shown.has(it)); });
  unavail.forEach(it => {
    const w = $(`[data-w="${it.c.k}"]`, designEl);
    w.classList.add('unavail');
    w.insertAdjacentHTML('afterend', `<p class="srch-hint">${esc(it.c.why)}</p>`);
  });
  hints.forEach((labels, it) => {
    const w = $(`[data-w="${it.c.k}"]`, designEl), off = it.c.type === 'toggle' && !S[it.c.k];
    w.insertAdjacentHTML('afterend', `<p class="srch-hint">${off ? 'Switch this on for' : 'Change this to reach'}: ${labels.map(l => `<b>${esc(l)}</b>`).join(', ')}</p>`);
  });
  // headings and sections with nothing left in them go; the rest show open, without changing which are remembered as open
  let any = false;
  $$('.group', designEl).forEach(g => {
    let head = null, headHas = false, secHas = false;
    const close = () => { if (head) head.hidden = !headHas; };
    [...$('.gbody', g).children].forEach(el => {
      if (el.matches('.ghd')) { close(); head = el; headHas = false; return; }
      if (el.hasAttribute('data-w') && !el.hidden) { headHas = true; secHas = true; }
    });
    close();
    g.hidden = !secHas; any = any || secHas;
  });
  $$('[data-w]:not([hidden]) > .lbl', designEl).forEach(l => markLabel(l, words));
  $('.reset-row', designEl).hidden = !words.every(w => 'reset to defaults'.includes(w));
  empty.hidden = any;
  if (!any) empty.innerHTML = `No settings match “${esc(designQuery.trim())}”. Try a word like <i>date</i>, <i>colour</i>, <i>names</i> or <i>baseline</i>.`;
}
function setDesignQuery(q) {
  designQuery = q;
  if (designSearch.value !== q) designSearch.value = q;
  designSearch.parentNode.classList.toggle('has-q', !!q);
  syncDesign();
  if (q) designEl.scrollTop = 0;
}
designSearch.addEventListener('input', () => setDesignQuery(designSearch.value));
designSearch.addEventListener('keydown', e => {
  if (e.key === 'Escape' && designSearch.value) { e.preventDefault(); e.stopPropagation(); setDesignQuery(''); }
  else if (e.key === 'Enter' || e.key === 'ArrowDown') { // jump into the first result
    const first = $$('[data-w]:not([hidden]):not(.unavail)', designEl).map(w => $('input, select, button', w)).find(Boolean);
    if (first) { e.preventDefault(); first.focus(); }
  }
});
$('.srch-kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';
$('#design-search-clear').addEventListener('click', () => { setDesignQuery(''); designSearch.focus(); });
function focusDesignSearch() {
  if (ui.hideDesign) { ui.hideDesign = false; saveUi(); syncPanels(); }
  const pd = $('#panel-design');
  if (isSheet() && !pd.classList.contains('open')) openSheet('panel-design');
  designSearch.focus(); designSearch.select();
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
  { const ps = $('select[data-k="projectStatus"]', designEl), h = [['', 'None'], ...S.statuses.map(x => [x.id, x.name])].map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join(''); if (ps && ps.dataset.sig !== h) { ps.innerHTML = h; ps.dataset.sig = h; } }
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
    if (ci) { ci.textContent = scene.fixedPx && !scene.fits ? `⚠ Doesn't fit: the plan needs ${f(scene.needH / PX_PER_IN)} in of ${f(cv.h)} in. The options under the chart can make room — or use “Fit content”, remove rows, or pick a taller canvas.` : `${f(cv.w)} × ${f(cv.h)} in${scene.fixedPx ? '' : ' wide — height follows the plan'}`; ci.classList.toggle('warn', !!(scene.fixedPx && !scene.fits)); }
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
  applySearch();
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
    if (v === 'marker') setTimeout(() => scrollToMarker(true), 60); // progress up to the marker: make sure the marker is on screen
    return;
  }
  if (k === 'canvas' && v === 'custom') { const c = canvasOf(S); S.canvasW = Math.round(c.w * 100) / 100; S.canvasH = Math.round(c.h * 100) / 100; }
  if (k === 'textAuto' && v === false && scene) S.textPt = Math.round(scene.fs * 0.75 * 2) / 2; // start the override from what Auto was using
  if (k === 'rangeMode' && v === 'fixed' && (S.rangeStart == null || S.rangeEnd == null)) [S.rangeStart, S.rangeEnd] = autoSpan();
  if ((k === 'rangeStart' || k === 'rangeEnd' || k === 'todayDate') && v != null && !plausibleDay(v)) return; // half-typed years are ignored
  if (k === 'rangeStart' && S.rangeEnd != null && v > S.rangeEnd) S.rangeEnd = v + (S.rangeEnd - S.rangeStart); // a later start carries the end along
  if (k === 'rangeEnd' && S.rangeStart != null && v < S.rangeStart) return; // an end can't come before the start: nothing changes (a date being typed passes through such values)
  if (k === 'todayLine') { S.markerAuto = false; if (v) setTimeout(() => scrollToMarker(true), 80); } // a marker switched on should be where you can see it // the marker is now something the user chose
  if (k === 'showChanges' && v && !hasBaseline()) setBaseline(); // the first time, the baseline is the plan as it stands
  if (k === 'progressSource' && v === 'marker') S.todayLine = true; // progress up to the marker needs the marker
  state.settings[k] = v;
  if (k === 'font') ensureFont();
  renderChart(); syncDesign(); syncPop();
  if (k === 'execView') syncAddNote();
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
  if (gh) { if (designQuery) return; setSectionOpen(gh.dataset.secToggle, gh.getAttribute('aria-expanded') !== 'true'); return; }
  if (markerColorEvent(e, 'click')) return;
  const pb = e.target.closest('[data-palette]');
  if (pb) { applyPalette(PRESETS[+pb.dataset.palette]); return; }
  const sb = e.target.closest('[data-scheme]');
  if (sb) { const seed = paletteOf(state.settings).seed; if (seed) applyPalette(suggestPalettes(seed)[+sb.dataset.scheme]); return; }
  if (e.target.closest('[data-act="fit"]')) { fitPlan(); return; }
  if (e.target.closest('[data-act="pull"]')) { outsideDialog(); return; }
  if (e.target.closest('[data-act="baseline"]')) { baselineDialog(); return; }
  if (e.target.closest('[data-act="reset"]')) { resetDialog(); return; }
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
let impTimer = null, impSrc = 'paste';
$('#imp-text').addEventListener('input', () => {
  impSrc = 'paste';
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
      impSrc = 'spreadsheet';
      await loadScript('vendor/xlsx.full.min.js');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
      $('#imp-text').value = '';
      previewImport(parseImport(grid), file.name);
      if (!pending) previewImport(null, 'No tasks found in ' + file.name);
    } else {
      impSrc = 'text-file';
      $('#imp-text').value = await file.text();
      previewImport(parseImport($('#imp-text').value), file.name);
    }
  } catch (err) { console.error(err); previewImport(null, 'Could not read that file'); }
});
$('#imp-go').addEventListener('click', () => {
  if (!pending) return;
  track('import-' + (pending.state ? 'project-file' : impSrc));
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
function openModal() { impSrc = 'paste'; modal.hidden = false; $('#imp-text').value = ''; previewImport(null); setTimeout(() => $('#imp-text').focus(), 30); }
function closeModal() { modal.hidden = true; }
$('#btn-import').addEventListener('click', openModal);
$('#imp-ai-copy').addEventListener('click', async () => {
  const text = $('#imp-ai-prompt').textContent + ' The plan: ';
  track('copy-ai-prompt');
  try { await navigator.clipboard.writeText(text); toast('Prompt copied — paste it into your AI chat and describe the project'); } catch (e) { toast('Copy this into your AI chat: ' + text); }
});
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

// ---------------------------------------------------------------- share link
// The whole plan travels in the link's hash (#p=…): compressed JSON, never sent to a server. Row fields at their defaults
// are left out, and ids are shortened, to keep the link small.
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const pipeBytes = async (bytes, through) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(through)).arrayBuffer());
function packPlan(st) {
  const ids = new Map(st.rows.map((r, i) => [r.id, i.toString(36)]));
  const r = st.rows.map(row => {
    const o = Object.assign({}, row, { id: ids.get(row.id), deps: (row.deps || []).filter(d => ids.has(d)).map(d => ids.get(d)) });
    if (!o.deps.length) delete o.deps;
    if (o.assignee === '') delete o.assignee;
    if (o.type === 'task') delete o.type;
    if (o.progress === 0) delete o.progress;
    return o;
  });
  return { v: 1, s: st.settings, r }; // every setting travels, so a link keeps its look even if a default changes later
}
function unpackPlan(o) {
  if (!o || !Array.isArray(o.r)) return null;
  const ids = new Map(o.r.filter(r => r && typeof r === 'object').map(r => [String(r.id), uid()]));
  const rows = o.r.filter(r => r && typeof r === 'object').map(r => Object.assign({}, r, { id: ids.get(String(r.id)), deps: (Array.isArray(r.deps) ? r.deps : []).map(d => ids.get(String(d))).filter(Boolean) }));
  return sanitize({ settings: Object.assign({}, DEFAULT_SETTINGS, o.s && typeof o.s === 'object' ? o.s : {}), rows });
}
/** The readable plan an AI writes into a link (#plan=…, documented in llms.txt): nested items with ISO dates, owners and
 *  dependencies by name. Lenient on purpose: an agent's small slips (a missing end, a date-time, deeper nesting) still open. */
function aiPlanToState(o) {
  if (!o || typeof o !== 'object') return null;
  const list = Array.isArray(o.items) ? o.items : Array.isArray(o) ? o : null;
  if (!list) return null;
  const rows = [], named = [], base = mondayOf(todayDay());
  const day = v => { const d = isoToDay(typeof v === 'string' ? v.trim() : ''); return d != null && plausibleDay(d) ? d : null; };
  const walk = (items, level) => items.forEach(it => {
    if (typeof it === 'string') it = { name: it };
    if (!it || typeof it !== 'object') return;
    const kids = Array.isArray(it.items) ? it.items : Array.isArray(it.children) ? it.children : [];
    const ms = it.milestone === true || it.type === 'milestone';
    let start = day(it.start), end = day(it.end);
    const at = day(it.date);
    if (ms && at != null) start = end = at;
    if (start == null) start = end != null ? end : at != null ? at : base;
    const days = Math.round(+it.days);
    if (end == null) end = ms ? start : start + (days > 0 ? days - 1 : 4);
    if (end < start) end = start;
    const row = newRow({ level: Math.min(level, 2), name: String(it.name || it.title || '').slice(0, 200), type: ms ? 'milestone' : 'task', start, end: ms ? start : end, assignee: String(it.owner || it.assignee || '').slice(0, 60) });
    const pr = +String(it.progress == null ? '' : it.progress).replace('%', '');
    if (it.progress != null && Number.isFinite(pr)) row.progress = clamp(Math.round(pr), 0, 100);
    if (typeof it.status === 'string') row.status = it.status.toLowerCase();
    if (typeof it.note === 'string') row.note = it.note;
    if (it.key === true) row.key = true;
    if (it.blocked) { row.blocked = true; if (typeof it.blocked === 'string') row.blockedNote = it.blocked; }
    const after = it.after == null ? [] : Array.isArray(it.after) ? it.after : [it.after];
    rows.push(row); named.push([row, after.map(a => String(a).trim().toLowerCase()).filter(Boolean)]);
    walk(kids, level + 1);
  });
  walk(list, 0);
  if (!rows.length) return null;
  const byName = new Map();
  rows.forEach(r => { const k = r.name.trim().toLowerCase(); if (k && !byName.has(k)) byName.set(k, r.id); });
  named.forEach(([r, after]) => { r.deps = [...new Set(after.map(a => byName.get(a)).filter(id => id && id !== r.id))]; });
  const has = f => rows.some(f);
  const settings = Object.assign({}, DEFAULT_SETTINGS, {
    title: String(o.title || 'Project plan').slice(0, 120),
    assignees: has(r => r.assignee), progress: has(r => r.progress > 0), deps: has(r => r.deps.length),
  });
  if (typeof o.status === 'string') settings.projectStatus = o.status.toLowerCase();
  if (o.today === true) settings.todayLine = true;
  if (['days', 'weeks', 'months', 'quarters'].includes(o.scale)) settings.scale = o.scale;
  return sanitize({ settings, rows });
}
/** #plan= holds that JSON percent-encoded (or left raw, as some chat apps leave it), or base64url-encoded by an agent that runs code */
function aiHashToPlan(v) {
  const tries = [];
  try { tries.push(decodeURIComponent(v)); } catch (e) { /* a stray % */ }
  tries.push(v);
  if (/^[A-Za-z0-9_-]+$/.test(v)) { try { tries.push(new TextDecoder().decode(unb64u(v))); } catch (e) { /* not base64 */ } }
  for (const t of tries) {
    const j = t.trim().replace(/^[^{[]+/, ''); // a stray quote or bracket from the chat
    try { return aiPlanToState(JSON.parse(j)); } catch (e) { /* try the next reading */ }
  }
  return null;
}
async function planToHash(st) {
  const bytes = new TextEncoder().encode(JSON.stringify(packPlan(st)));
  if (typeof CompressionStream === 'function') { try { return 'z' + b64u(await pipeBytes(bytes, new CompressionStream('deflate-raw'))); } catch (e) { /* fall back to plain */ } }
  return 'j' + b64u(bytes);
}
async function hashToPlan(h) {
  const bytes = unb64u(h.slice(1));
  const raw = h[0] === 'z' ? await pipeBytes(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return unpackPlan(JSON.parse(new TextDecoder().decode(raw)));
}
function linkDialog(url) { // when the browser won't let the page write to the clipboard
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal dialog" role="dialog" aria-modal="true"><h2>Copy this link</h2><p class="modal-sub">Anyone who opens it gets this plan as it is now.</p><input class="inp link-box" readonly value="${esc(url)}"><div class="dialog-btns"><button class="btn primary">Done</button></div></div>`;
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('.btn')) back.remove(); });
  document.body.appendChild(back);
  const inp = back.querySelector('input'); inp.focus(); inp.select();
}
async function shareLink() {
  commit();
  const url = location.origin + location.pathname + '#p=' + await planToHash(state);
  track('share-link');
  try { await navigator.clipboard.writeText(url); } catch (e) { linkDialog(url); return; }
  toast(url.length > 8000 ? `Link copied — it is long (${url.length.toLocaleString()} characters) and some apps cut long links; for a plan this size the project file is safer` : 'Link copied — whoever opens it gets this plan as it is now');
}
async function openSharedLink() {
  const m = /^#p=([zj][A-Za-z0-9_-]+)$/.exec(location.hash), ai = /^#plan=(.+)$/s.exec(location.hash);
  if (!m && !ai) return;
  const clear = () => history.replaceState(null, '', location.pathname + location.search);
  let plan = null;
  try { plan = m ? await hashToPlan(m[1]) : aiHashToPlan(ai[1]); } catch (e) { console.warn('shared link', e); }
  if (!plan) { clear(); track(ai ? 'open-ai-plan-link-failed' : 'open-share-link-failed'); toast(ai ? 'That plan link couldn’t be read — ask the AI to check it against slideline.co/llms.txt' : 'That link is incomplete or damaged — ask for it to be sent again'); return; }
  const open = () => {
    commit(); closePop();
    state = plan; sel = null; multi = new Set(); detailId = null;
    commit(); ensureFont(); refresh(); clear();
    track(ai ? 'open-ai-plan-link' : 'open-share-link');
    toast('Shared plan opened — it is now saved in this browser');
  };
  let mine = null;
  try { mine = localStorage.getItem(STORE_KEY); } catch (e) { /* storage unavailable */ }
  if (!mine) { open(); return; } // nothing of the visitor's own to lose
  if (JSON.stringify(packPlan(state)) === JSON.stringify(packPlan(plan))) { clear(); return; }
  dialog('Open the shared plan?', 'This link carries a plan. Opening it replaces the plan saved in this browser.', [
    ['Keep mine', 'ghost', clear],
    ['Save mine as a file, then open', 'ghost', () => { exportJson(); open(); }],
    ['Open shared plan', 'primary', open],
  ]);
}
window.addEventListener('hashchange', openSharedLink);
$('#btn-share').addEventListener('click', () => shareLink().catch(err => { console.error(err); toast('Couldn’t make the link — please try again'); }));

const exportMenu = $('#export-menu');
$('#btn-export').addEventListener('click', e => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; });
document.addEventListener('click', e => { if (!exportMenu.hidden && !exportMenu.contains(e.target)) exportMenu.hidden = true; });
exportMenu.addEventListener('click', e => {
  const b = e.target.closest('[data-export]');
  if (!b) return;
  exportMenu.hidden = true;
  const fn = { png: exportPng, copy: exportCopy, pdf: exportPdf, pptx: exportPptx, json: exportJson, link: shareLink }[b.dataset.export];
  if (b.dataset.export !== 'link') track('export-' + b.dataset.export);
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
/** back to how the tool started: the design always, and (if asked) the plan too */
const freshSettings = () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
function resetDesign() {
  commit();
  const title = state.settings.title;
  state.settings = Object.assign(freshSettings(), { title });
  state.rows.forEach(r => { delete r.color; delete r.msAlign; }); // colours and milestone positions chosen item by item are part of the look
  closePop(); commit(); refresh(); buildDesign(); syncDesign();
  toast('Design reset to defaults — Undo brings it back');
}
function resetDialog() {
  dialog('Reset to defaults?', 'Palette, layout, labels, dates, legend, status, calendar and every other Design choice go back to how they started, along with colours set on single items. Your title and plan (items, dates, notes, owners, progress) are kept.', [
    ['Reset the design', 'primary', resetDesign],
    ['Reset everything', 'danger', () => { commit(); state = blankState(freshSettings()); sel = null; multi = new Set(); closePop(); commit(); refresh(); buildDesign(); syncDesign(); toast('Everything reset — Undo brings the old plan back'); }],
    ['Cancel', 'ghost', null],
  ]);
}
$('#btn-new').addEventListener('click', () => {
  commit();
  state = blankState(state.settings);
  sel = null;
  commit(); refresh();
  track('new-chart');
  toast('New plan started — Undo brings the old one back');
});
function syncTabs() { $$('[data-sheet]').forEach(b => b.classList.toggle('on', $('#' + b.dataset.sheet).classList.contains('open'))); }
function openSheet(id) { $$('.panel').forEach(p => { const on = p.id === id && !p.classList.contains('open'); p.classList.toggle('open', on); if (!on) p.classList.remove('full'); }); syncTabs(); }
function closeSheets() { $$('.panel').forEach(p => p.classList.remove('open', 'full')); syncTabs(); }
// On a phone the panels are bottom sheets: drag the head up for full height, down to shrink or close; a tap toggles the height.
const isSheet = () => matchMedia('(max-width: 860px)').matches;
function setSheetFull(p, full) { p.classList.toggle('full', full); const h = $('.panel-head', p); if (h) h.setAttribute('aria-expanded', String(full)); }
$$('.panel').forEach(p => {
  const head = $('.panel-head', p);
  let drag = null;
  head.addEventListener('pointerdown', e => {
    if (!isSheet() || e.target.closest('button, input') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { y: e.clientY, dy: 0, id: e.pointerId };
    head.setPointerCapture(e.pointerId);
    p.style.transition = 'none';
  });
  head.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = e.clientY - drag.y;
    if (drag.dy > 0) p.style.transform = `translateY(${drag.dy}px)`; // follows the finger down; up is decided on release
  });
  const end = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.dy; drag = null;
    p.style.transition = ''; p.style.transform = '';
    if (Math.abs(dy) < 6) setSheetFull(p, !p.classList.contains('full')); // a tap
    else if (dy < -40) setSheetFull(p, true);
    else if (dy > 70) { if (p.classList.contains('full') && dy < 220) setSheetFull(p, false); else closeSheets(); }
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
});
// typing brings up the keyboard, which would hide a half-height sheet's contents: give the field the whole screen
$$('.panel').forEach(p => p.addEventListener('focusin', e => { if (isSheet() && p.classList.contains('open') && e.target.matches('input:not([type="checkbox"]):not([type="color"]), textarea')) setSheetFull(p, true); }));
$$('[data-sheet]').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.sheet)));
$$('[data-close]').forEach(b => b.addEventListener('click', closeSheets));
$('#stage').addEventListener('pointerdown', e => { if (!e.composedPath().includes(svg) && !e.target.closest('.chart-add, #lookbar')) { closeSheets(); if (sel && !selecting) select(null); } });

document.addEventListener('keydown', e => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape') {
    if (!modal.hidden) closeModal();
    else if (pop) closePop();
    else if (selecting) setSelecting(false);
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
  else if (!inField && !mod && e.altKey && !e.shiftKey && selIds().length && e.code === 'KeyB' && (e.target === document.body || (e.target.closest && e.target.closest('#chart, .chart-col')))) { e.preventDefault(); toggleBlocked(selIds()); } // Alt/⌥ + B: blocked on / off
  else if (!inField && !mod && !e.altKey && !e.isComposing && e.key.length === 1 && e.key !== ' ' && selIds().length === 1 && (e.target === document.body || (e.target.closest && e.target.closest('#chart, .chart-col, .pop')))) { // typing with one item selected renames it
    e.preventDefault();
    typeToRename(selIds()[0], e.key);
  }
  else if (!inField && !mod && !e.altKey && e.key === 'F2' && selIds().length === 1) { e.preventDefault(); editOnChart(selIds()[0]); } // F2: edit the name, keeping what is there
  else if (!inField && !mod && !e.altKey && e.key === 'Enter' && !state.rows.length && !pop && (e.target === document.body || (e.target.closest && e.target.closest('#chart, .chart-col')))) { // nothing on the chart yet: Enter makes the first task
    e.preventDefault();
    commit(); addRow('task', null, false, true);
  }
  else if (!inField && !mod && !e.altKey && e.key === 'Enter' && selIds().length && (e.target === document.body || (e.target.closest && e.target.closest('#chart')))) { // Enter adds a new item under the selection; Shift+Enter adds a subtask inside it
    e.preventDefault();
    const picked = selIds();
    if (picked.length > 1 && !e.shiftKey) { commit(); groupIntoNewArea(); } // several items selected: Enter wraps them in a new area (Shift+Enter adds a line after them instead)
    else { commit(); addRow('task', picked[picked.length - 1], true, true, picked.length > 1 ? false : e.shiftKey); }
  }
  else if (!inField && mod && e.key.toLowerCase() === 'x' && selIds().length && !(window.getSelection && String(window.getSelection()))) { e.preventDefault(); cutSelection(); }
  else if (!inField && mod && e.key.toLowerCase() === 'g' && selIds().length > 1) { e.preventDefault(); commit(); groupIntoNewArea(); }
  else if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); focusDesignSearch(); } // Ctrl/⌘ + K: search the design settings
  else if (!inField && mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAllRows(); }
  else if (!inField && mod && e.key.toLowerCase() === 'd' && selIds().length) { e.preventDefault(); commit(); duplicateSelection(); }
  else if (!inField && !mod && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && state.rows.length && (e.target === document.body || (e.target.closest && e.target.closest('#chart, .chart-col')))) { // ↑ / ↓ move the selection through the rows; Shift extends it
    e.preventDefault();
    stepSelection(e.key === 'ArrowDown' ? 1 : -1, e.shiftKey);
  }
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
const ui = Object.assign({ durUnit: 'weeks', hidePlan: false, hideDesign: false, designOpen: {}, popOpen: {} }, (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } })());
if (!ui.designOpen || typeof ui.designOpen !== 'object') ui.designOpen = {};
if (!ui.popOpen || typeof ui.popOpen !== 'object') ui.popOpen = {};
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
  if (f === 'note') { r.note = t.value.slice(0, 120); const c = $('[data-count]', popEl); if (c) c.textContent = `${r.note.length}/120`; renderChart(); commitSoon(); return; }
  if (f === 'name') { r.name = t.value; renderChart(); renderOutline(); commitSoon(); }
  else if (f === 'changeNote') { r.changeNote = t.value; renderChart(); commitSoon(); }
  else if (f === 'blockedNote') { if (t.value.trim()) r.blockedNote = t.value; else delete r.blockedNote; const accEl = t.closest('.acc'); if (accEl) $('.acc-s', accEl).innerHTML = `<span class="dotc" style="background:#d92d20"></span>${t.value.trim() ? esc(t.value.trim()) : 'Yes'}`; renderChart(); commitSoon(); }
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
  else if (f === 'progress') { r.progress = +t.value; t.nextElementSibling.textContent = t.value + '%'; const accEl = t.closest('.acc'); if (accEl) $('.acc-s', accEl).textContent = t.value + '%'; const rr = t.closest('.range-row'); if (rr) { rr.classList.remove('off'); const x = $('.x-btn', rr); if (x) x.disabled = false; } if (!state.settings.progress) { state.settings.progress = true; syncDesign(); } renderChart(); commitSoon(); }
}
function rowChange(r, t) {
  const f = t.dataset.f;
  if (f === 'noteOn') { if (t.checked) delete r.noteOff; else r.noteOff = true; commit(); refresh(); return; }
  if (f === 'note') { commit(); return; }
  if (f === 'keyms') {
    if (t.checked) r.key = true; else delete r.key;
    if (t.checked && !state.settings.keyStrip) { state.settings.keyStrip = true; syncDesign(); toast('The key milestones strip is now shown above the chart'); }
    commit(); refresh(); return;
  }
  if (f === 'blocked') {
    if (t.checked) r.blocked = true; else delete r.blocked;
    const note = $('[data-f="blockedNote"]', popEl); if (note) { note.disabled = !t.checked; if (t.checked) note.focus(); }
    commit(); refresh(); return;
  }
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
function fitPlan() {
  const S = state.settings;
  if (S.rangeMode !== 'fixed' || S.rangeStart == null || !state.rows.length) return;
  fitRows(state.rows, S.rangeStart, S.rangeEnd);
  commit(); refresh();
  toast('Tasks spread across the timeline — Undo reverts');
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
    if (pop.page) { const pg = rowPageHtml(n, pinfo); if (pg) return pg; pop.page = null; }
    const r = n.row;
    let h = `<input class="inp pop-name" id="pop-name" data-f="name" value="${esc(r.name)}" placeholder="Name" autocomplete="off" aria-label="Name">` + typeSegHtml(n);
    if (n.isArea) { // an area: what is in it, who owns it, and quick actions
      const inside = blockEnd(state.rows, n.i) - n.i - 1;
      return h + `<p class="note">${fmtRange(n)} · ${inside} ${inside === 1 ? 'item' : 'items'}${S.progress && n.progress != null ? ' · ' + Math.round(n.progress) + '% done' : ''}. Its dates follow what is inside it; drag its bar to shift everything together.</p>`
        + propRowsHtml(n)
        + `<div class="pop-btns"><button class="btn ghost" data-act="area-del">Delete…</button><button class="btn primary" data-act="area-add">+ Task here</button></div>`;
    }
    if (n.hasKids) h += `<p class="note">${fmtRange(n)} — spans the items inside it. Drag the bar to shift them all.</p>`;
    else if (n.milestone) h += date('Date', 'start', r.start);
    else h += `<div class="two">${date('Start', 'start', r.start)}${date('End', 'end', r.end)}</div>${durHtml(r)}<p class="note wd">${workingDays(r.start, r.end, S.daysOff)} working days${S.daysOff.length ? ' (weekends and days off left out)' : ' (weekends left out)'}</p>`;
    return h + propRowsHtml(n) + popFootHtml(n, state.rows);
  }
  if (pop.kind === 'today') {
    const seg = (f, cur, opts) => `<div class="seg" data-f="${f}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const lab = S.markerLabelOn !== false;
    return `<h4>Date marker</h4>${date('Date', 'todayDate', S.todayDate != null ? S.todayDate : todayDay())}
      <div class="field"><span>Label</span><input class="inp" data-f="todayLabel" value="${esc(S.todayLabel)}" placeholder="Today"${lab ? '' : ' disabled'}></div>
      <label class="check"><input type="checkbox" data-f="markerLabelOn"${lab ? ' checked' : ''}> Show label</label>
      <div class="field"><span>Line</span>${seg('marker-style', S.markerStyle || 'solid', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']])}</div>
      <div class="field"><span>Thickness</span>${seg('marker-width', S.markerWidth || 2, [[1, 'Thin'], [2, 'Regular'], [3, 'Bold']])}</div>
      <div class="field"><span>Colour</span><div class="swatches mk-sw" data-sig="${paletteOf(S).colors.join()}">${markerSwHtml()}</div></div>
      <button class="link-btn quiet pop-more" data-reveal="progress">More in Design → Progress</button>`;
  }
  const fixed = S.rangeMode === 'fixed' && S.rangeStart != null;
  const [a, b] = fixed ? [S.rangeStart, S.rangeEnd] : autoSpan();
  return `<h4>Overall timeline</h4>
    <div class="seg" data-f="rangeMode"><button data-v="auto" class="${fixed ? '' : 'on'}">Fit to tasks</button><button data-v="fixed" class="${fixed ? 'on' : ''}">Fixed</button></div>
    <div class="two">${date('From', 'rangeStart', a)}${date('To', 'rangeEnd', b)}</div>
    <div class="field"><span>Length</span>${durControl(a, b, 'len-n', 'len-u')}</div>
    <button class="btn ghost wide" data-act="fit"${fixed && state.rows.length ? '' : ' disabled'}>Spread tasks across it</button>
    <p class="note">Periods, where the dates sit and their format are in the toolbar above the chart.</p>`;
}
function openPop(kind, rect, id, x) {
  closeMenu();
  pop = { kind, id: id || null, page: null };
  popEl.innerHTML = popHtml();
  popEl.classList.toggle('wide', kind === 'paste');
  popEl.hidden = false;
  popEl.style.maxHeight = '';
  const w = popEl.offsetWidth, h = popEl.offsetHeight;
  let top = rect.bottom + 8;
  if (kind === 'today') top = rect.top + 30;
  if (top + h > innerHeight - 8) {
    // it belongs under what it describes: scroll inside it when there is a fair amount of room, and only go above when there is hardly any
    const room = innerHeight - 8 - top;
    if (room >= 240) popEl.style.maxHeight = room + 'px';
    else top = Math.max(8, rect.top - h - 8);
  }
  popEl.style.top = top + 'px';
  popEl.style.left = clamp(x != null ? Math.max(x, rect.left) : rect.left, 8, Math.max(8, innerWidth - w - 8)) + 'px';
  if (kind === 'paste') { syncPasteNote(); const ta = $('#pop-paste'); if (ta) ta.focus(); }
  drawHover(); syncLookbar();
}
function closePop() {
  if (!pop) return;
  if (pop.kind === 'row') tidyNote(pop.id);
  pop = null; popEl.hidden = true; popEl.innerHTML = ''; hint = null; hintKey = ''; closeMenu(); drawHover(); syncLookbar();
}
function syncPop() {
  if (!pop) return;
  // a row's popover belongs to the selected row: once the selection moves (paste, duplicate, group…) it must not stay on the old one
  if (pop.kind === 'row' && pop.id !== sel) { closePop(); return; }
  if (pop.kind === 'paste') { if (!popEl.querySelector('textarea')) popEl.innerHTML = popHtml(); syncPasteNote(); return; }
  const html = popHtml();
  if (!html) { closePop(); return; }
  const act = document.activeElement;
  if (!popEl.contains(act) || /^(BUTTON|SELECT)$/.test(act.tagName)) { popEl.innerHTML = html; return; } // nothing being typed in: show the fresh version
  // keep the field being typed in; refresh the others from a fresh copy
  const fresh = document.createElement('div');
  fresh.innerHTML = html;
  $$('[data-f]', popEl).forEach(el => {
    const src = $(`[data-f="${el.dataset.f}"]`, fresh);
    if (!src || el === act) return;
    if (el.classList.contains('seg')) el.innerHTML = src.innerHTML; else el.value = src.value;
  });
  $$('.prow[data-prow]', fresh).forEach(a => { const real = $(`.prow[data-prow="${a.dataset.prow}"] .pv`, popEl); if (real) real.innerHTML = $('.pv', a).innerHTML; }); // the values in each row follow what is being typed
  const fit = $('[data-act="fit"]', popEl), fit2 = $('[data-act="fit"]', fresh);
  if (fit && fit2) fit.disabled = fit2.disabled;
}
document.addEventListener('pointerdown', e => {
  if (!menuEl.hidden && !menuEl.contains(e.target) && !(menuFor && menuFor.contains(e.target))) closeMenu();
  if (pop && !popEl.contains(e.target) && !menuEl.contains(e.target) && !e.target.closest('#lookbar')) closePop(); // the toolbar works on what the popover shows
}, true);
popEl.addEventListener('input', e => {
  const t = e.target, f = t.dataset.f;
  if (!pop || !f) return;
  if (pop.kind === 'row' && statusEditInput(t)) return;
  if (pop.kind === 'row') { const r = state.rows[rowIndex(pop.id)]; if (r) rowInput(r, t); }
  else if (f === 'paste') { pop.text = t.value; syncPasteNote(); }
  else if (markerColorEvent(e, 'input')) { /* handled */ }
  else if (f === 'todayLabel') setSetting('todayLabel', t.value, true);
});
popEl.addEventListener('change', e => {
  const t = e.target, f = t.dataset.f;
  if (!pop || !f) return;
  if (pop.kind === 'row' && /^s(name|color)-/.test(f)) { statusEditChange(t); return; }
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
  const rv = e.target.closest('[data-reveal]');
  if (rv) { revealDesign(rv.dataset.reveal); return; }
  if (pop && pop.kind === 'row' && popRowClick(e)) return;
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
  const addB = e.target.closest('.pop-adds [data-act]');
  if (addB && pop && pop.kind === 'row') { const id = pop.id; closePop(); commit(); addRow('task', id, true, true, addB.dataset.act === 'sub-add'); return; }
  const rowAct = e.target.closest('.row-actions [data-act], .pop-foot [data-act], [data-act="dep-rm"]');
  if (rowAct && pop && pop.kind === 'row' && !rowAct.disabled) {
    const id = pop.id, a = rowAct.dataset.act;
    if (a === 'dep-rm') { const r = state.rows[rowIndex(id)]; r.deps = r.deps.filter(d => d !== rowAct.dataset.dep); commit(); refresh(); }
    else if (a === 'del') { closePop(); askDelete(id); }
    else if (a === 'dup') { closePop(); duplicateRow(id); }
    else if (a === 'pick') setSelecting(true); // keeps this item selected; taps add more
    else if (a === 'indent') shiftLevel(id, 1);
    else if (a === 'outdent') shiftLevel(id, -1);
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
  if (e.key === 'Escape' && pop && pop.kind === 'row' && pop.page && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.stopPropagation(); setPopPage(null); return; } // Esc on a page goes back first
  if (e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.target.blur(); if (e.target.dataset.f === 'name') closePop(); }
});

// ---------------------------------------------------------------- inline text editing on the chart
function inlineEdit(rect, value, fontPx, weight, onInput, opt = {}) {
  closePop();
  const inp = document.createElement('input');
  inp.className = 'inline-edit';
  inp.value = value;
  const place = (r, px) => Object.assign(inp.style, { left: r.left + 'px', top: r.top + 'px', width: Math.max(r.width, 180) + 'px', height: r.height + 'px', fontSize: px + 'px' });
  place(rect, fontPx);
  Object.assign(inp.style, { fontWeight: weight, fontFamily: `'${state.settings.font}', system-ui, sans-serif` });
  document.body.appendChild(inp);
  let done = false, bar = null;
  const close = () => { done = true; inp.remove(); if (bar) bar.remove(); commit(); refresh(); };
  const api = { inp, place: (r, px) => { place(r, px); if (bar && opt.placeBar) opt.placeBar(bar, inp); } };
  api.finish = revert => {
    if (done) return;
    if (revert) (opt.onRevert || (() => onInput(value)))();
    close();
  };
  api.drop = () => { if (!done) close(); }; // ends editing; whatever the caller just set stands
  inp.addEventListener('input', () => { onInput(inp.value); if (opt.onTyped) opt.onTyped(bar); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') api.finish(false); else if (e.key === 'Escape') { e.stopPropagation(); api.finish(true); } });
  inp.addEventListener('blur', () => api.finish(false));
  if (opt.bar) { bar = opt.bar(api); document.body.appendChild(bar); if (opt.placeBar) opt.placeBar(bar, inp); }
  inp.focus(); inp.select();
  return api;
}
const SPARKLE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.3 3.6 3.6 1.3-3.6 1.3L8 11.6 6.7 8 3.1 6.7l3.6-1.3zM12.8 10.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/></svg>';
// The title edits in place, with its options in a small bar underneath: have the headline written from the plan, its size, or hide it.
function editTitle(rect) {
  const S = state.settings, s = svg.getBoundingClientRect().width / scene.w;
  const before = { titleAuto: S.titleAuto, title: S.title };
  const box = r => ({ left: r.left, top: r.top, width: Math.max(r.width + 80, 420 * s), height: r.height });
  const px = r => Math.max(13, r.height / 1.45); // the title's hit area is 1.45 × its type size
  const titleRect = () => { const el = $('#chart [data-role="title"]'); return el && el.getBoundingClientRect(); };
  const syncBar = bar => {
    if (!bar) return;
    $('[data-tt="auto"]', bar).setAttribute('aria-pressed', String(!!S.titleAuto));
    $$('[data-tt="size"]', bar).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === (+S.titleScale || 1))));
  };
  // a headline written from the plan becomes an ordinary title the moment it is typed over
  inlineEdit(box(rect), S.titleAuto ? scene.title : S.title, px(rect), 700, v => { S.titleAuto = false; S.title = v; renderChart(); syncDesign(); }, {
    onRevert: () => { Object.assign(S, before); },
    onTyped: syncBar,
    bar: api => {
      const bar = document.createElement('div');
      bar.className = 'title-bar';
      bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Title options');
      bar.innerHTML = `<button data-tt="auto" data-tip="Write it for me" data-tip-sub="A headline from the plan: where the finish stands, then the biggest issue or the next milestone. It keeps itself up to date; type over it to take it back">${SPARKLE}Write it for me</button>`
        + '<span class="tb-sep"></span><span class="tb-k">Size</span><span class="tb-seg">' + [[0.8, 'S', 'Small'], [1, 'M', 'Regular'], [1.3, 'L', 'Large']].map(([v, t, l]) => `<button data-tt="size" data-v="${v}" data-tip="${l}" aria-label="${l} title">${t}</button>`).join('') + '</span>'
        + '<span class="tb-sep"></span><button data-tt="hide" data-tip="Hide the title" data-tip-sub="Design → Canvas → Show title brings it back">Hide</button>';
      bar.addEventListener('pointerdown', e => e.preventDefault()); // keep typing in the title
      bar.addEventListener('mousedown', e => e.preventDefault());
      bar.addEventListener('click', e => {
        const b = e.target.closest('[data-tt]');
        if (!b) return;
        const t = b.dataset.tt;
        hideQuickTip();
        if (t === 'auto') {
          if (S.titleAuto) { S.titleAuto = false; S.title = api.inp.value; syncBar(bar); renderChart(); syncDesign(); return; } // keep the words, as an ordinary title
          S.titleAuto = true; api.drop(); toast('The headline is written from the plan, and keeps itself up to date'); return;
        }
        if (t === 'hide') { S.showTitle = false; api.drop(); toast('Title hidden — Design → Canvas → Show title brings it back'); return; }
        if (t === 'size') {
          S.titleScale = +b.dataset.v; renderChart(); syncDesign(); syncBar(bar);
          const r = titleRect(); if (r) api.place(box(r), px(r));
        }
      });
      attachTips(bar);
      syncBar(bar);
      return bar;
    },
    placeBar: (bar, inp) => {
      const r = inp.getBoundingClientRect(), w = bar.offsetWidth, h = bar.offsetHeight;
      bar.style.left = clamp(r.left, 8, innerWidth - w - 8) + 'px';
      bar.style.top = (r.bottom + 8 + h > innerHeight - 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
    },
  });
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
let zoom = 1, zoomRender = 0;
// On a phone the chart starts PHONE_CHART_W wide (readable, scrolled sideways) and a pinch can bring it down to the screen's width.
const PHONE_CHART_W = 760;
function fitWidth() { const cs = getComputedStyle(stage); return stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }
const phoneBase = () => Math.max(PHONE_CHART_W, fitWidth());
function applyZoom() {
  if (isSheet()) {
    zoom = Math.max(zoom, Math.min(1, fitWidth() / phoneBase())); // never narrower than the screen (it may have turned)
    wrapEl.style.width = phoneBase() * zoom + 'px';
    wrapEl.style.maxWidth = 'none';
  } else {
    wrapEl.style.width = zoom * 100 + '%';
    wrapEl.style.maxWidth = (scene ? scene.w : 1280) * zoom + 'px';
  }
  $('#zoom-val').textContent = Math.round(zoom * 100) + '%';
  $('.zoombar').classList.toggle('zoomed', Math.abs(zoom - 1) > 0.005);
}
function setZoom(z, cx, cy) {
  z = clamp(z, isSheet() ? Math.min(1, fitWidth() / phoneBase()) : 0.4, 6);
  if (Math.abs(z - zoom) < 0.001) return;
  closePop();
  const sb = stage.getBoundingClientRect();
  if (cx == null) { cx = sb.left + sb.width / 2; cy = sb.top + sb.height / 2; }
  const a = wrapEl.getBoundingClientRect();
  const fx = (cx - a.left) / a.width, fy = (cy - a.top) / a.height;
  zoom = z;
  applyZoom();
  clearTimeout(zoomRender); if (sel) zoomRender = setTimeout(() => { if (!drag) renderChart(); }, 120); // the handles keep their size on screen
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
let gestureZoom = 1, pinch = null;
stage.addEventListener('gesturestart', e => { e.preventDefault(); gestureZoom = zoom; });
stage.addEventListener('gesturechange', e => { e.preventDefault(); if (!pinch) setZoom(gestureZoom * e.scale, e.clientX, e.clientY); }); // Safari; on a touch screen the touch events below do it
// Touch screens: two fingers on the chart zoom the chart (not the page) around the point between them, and pan as they move.
// The stage's touch-action keeps the browser from zooming the page; preventing touchmove does the same on iOS.
const touchMid = t => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
const touchGap = t => Math.max(1, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY));
// Touch events keep going to the element a finger first touched, even once the chart has been redrawn without it, and then never
// reach the stage: so the move and end handlers go on that element.
const touchHeard = new WeakSet();
function onTouchMove(e) {
  if (drag && !pinch && e.touches.length === 1) { if (e.cancelable) e.preventDefault(); return; } // a finger dragging a bar: not a scroll
  if (!pinch || e.touches.length < 2) return;
  e.preventDefault();
  const mid = touchMid(e.touches);
  setZoom(pinch.z * touchGap(e.touches) / pinch.gap, mid[0], mid[1]);
  stage.scrollLeft -= mid[0] - pinch.mid[0]; stage.scrollTop -= mid[1] - pinch.mid[1];
  pinch.mid = mid;
}
const pinchEnd = e => { if (e.touches.length < 2) pinch = null; };
stage.addEventListener('touchstart', e => {
  for (const t of e.changedTouches) {
    const el = t.target;
    if (el && !touchHeard.has(el)) { touchHeard.add(el); el.addEventListener('touchmove', onTouchMove, { passive: false }); el.addEventListener('touchend', pinchEnd); el.addEventListener('touchcancel', pinchEnd); }
  }
  if (e.touches.length !== 2) return;
  touchTap = null; // a pinch selects nothing…
  if (drag) cancelDrag(); // …and the first finger may have started dragging a bar: a pinch means it wasn't meant
  pinch = { gap: touchGap(e.touches), z: zoom, mid: touchMid(e.touches) };
}, { passive: false }); // not passive: the touch's moves must be cancellable
addEventListener('resize', applyZoom);
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
/** move the selection one row up or down (the way the chart is listed); with `extend`, grow or shrink a range from where it started */
function stepSelection(dir, extend) {
  const rows = state.rows, ids = selIds(), idx = ids.map(rowIndex).filter(i => i >= 0).sort((x, y) => x - y);
  const wasPop = pop && pop.kind === 'row';
  let target;
  if (!idx.length) target = dir > 0 ? 0 : rows.length - 1; // nothing selected: start at the top (↓) or the bottom (↑)
  else if (extend) {
    const anchor = rowIndex(sel), lo = idx[0], hi = idx[idx.length - 1];
    const cursor = idx.length < 2 ? anchor : (anchor === lo ? hi : lo);
    target = Math.max(0, Math.min(rows.length - 1, cursor + dir));
  } else target = Math.max(0, Math.min(rows.length - 1, (dir > 0 ? idx[idx.length - 1] : idx[0]) + dir));
  const id = rows[target].id;
  if (extend && idx.length) {
    if (id === sel) { multi = new Set(); closePop(); renderChart(); renderOutline(); syncAddNote(); }
    else multiSelect(id, 'range');
  } else { multi = new Set(); if (sel === id) { closePop(); renderChart(); renderOutline(); syncAddNote(); } else select(id); }
  const el = $(`#chart [data-role="row"][data-id="${id}"]`) || $(`#chart [data-role="move"][data-id="${id}"]`);
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (wasPop && !extend && el) { const bar = $(`#chart [data-role="move"][data-id="${id}"]`) || el, r = bar.getBoundingClientRect(); openPop('row', r, id, r.left); } // an open popover follows you down the list
}
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
  if (state.settings.progress && state.settings.progressSource === 'marker' && state.settings.todayLine) return `<div class="field"><span>Progress</span><p class="note">Follows the date marker, so it moves when the marker does. Change this under Design → Progress → Progress in bars.</p></div>`;
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
/** every selected task (and everything inside selected areas) gets the same length: the average of theirs, each keeping its start */
function evenLengths() {
  const info = derive(state.rows), picked = new Set(selIds()), leaves = new Map();
  info.forEach(n => { if (!picked.has(n.row.id)) return; for (let k = n.i; k < blockEnd(state.rows, n.i); k++) if (!info[k].hasKids && !info[k].milestone) leaves.set(info[k].row.id, info[k]); });
  const items = [...leaves.values()];
  if (items.length < 2) { toast('Select two or more tasks to give them the same length'); return; }
  const len = Math.max(1, Math.round(items.reduce((a, n) => a + (n.row.end - n.row.start + 1), 0) / items.length));
  items.forEach(n => { n.row.end = n.row.start + len - 1; });
  commit(); refresh();
  toast(`${items.length} tasks set to ${len} ${len === 1 ? 'day' : 'days'} each — Undo reverts`);
}
// Select mode: without a keyboard there is no Shift or Ctrl/⌘-click, so a Select button (Plan panel head, or an item's popover)
// turns taps into "add or remove this item", and the selection bars carry what a keyboard would do (duplicate, delete).
let selecting = false;
const tapWord = () => (matchMedia('(hover: hover) and (pointer: fine)').matches ? 'click' : 'tap');
const SB_ICON = {
  dup: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};
function selBarHtml(n, countId, inPanel) { // the Plan panel's copy leaves out Done: the Select button in its head says it
  const many = n >= 2, none = n ? '' : ' disabled';
  const tw = tapWord(), say = !n ? `${tw[0].toUpperCase() + tw.slice(1)} items to select` : n === 1 && selecting && !inPanel ? `1 selected<span class="sb-hint"> — ${tw} more to add</span>` : `${n} selected`;
  return `<span class="selbar-count"${countId ? ` id="${countId}"` : ''}>${say}</span>`
    + `<button class="selbar-btn" data-sel="even"${many ? '' : ' disabled'} title="Give every selected task the same length (the average of their lengths)">Same length</button>`
    + `<button class="selbar-btn primary" data-sel="group"${many ? '' : ' disabled'} title="Group them into a new area (Ctrl/⌘+G)"><span class="sb-long">Add to new area</span><span class="sb-short">Group</span></button>`
    + `<button class="selbar-btn ib" data-sel="dup"${none} title="Duplicate (Ctrl/⌘+D)" aria-label="Duplicate">${SB_ICON.dup}</button>`
    + `<button class="selbar-btn ib danger" data-sel="del"${none} title="Delete (Delete key)" aria-label="Delete">${SB_ICON.del}</button>`
    + (inPanel ? '' : selecting ? '<button class="selbar-btn done" data-sel="done" title="Stop selecting (Esc)">Done</button>' : '<button class="selbar-btn" data-sel="clear" aria-label="Clear selection" title="Clear selection">✕</button>');
}
function syncSelBar() {
  const n = selIds().length, bar = $('#selbar'), pb = $('#plan-selbar');
  if (!bar) return;
  bar.hidden = !(n >= 2 || selecting);
  if (!bar.hidden) { const h = selBarHtml(n, 'selbar-count'); if (bar.innerHTML !== h) bar.innerHTML = h; placeSelBar(); }
  if (pb) { pb.hidden = !selecting; if (selecting) { const h = selBarHtml(n, null, true); if (pb.innerHTML !== h) pb.innerHTML = h; } }
  const pbtn = $('#plan-select');
  if (pbtn) { pbtn.textContent = selecting ? 'Done' : 'Select'; pbtn.setAttribute('aria-pressed', String(selecting)); }
}
function setSelecting(on) {
  if (selecting === on) return;
  selecting = on;
  document.body.classList.toggle('selecting', on);
  closePop();
  if (on) detailId = null;
  else { multi = new Set(); sel = null; }
  renderChart(); renderOutline(); syncAddNote();
}
/** the date marker can be scrolled or zoomed out of view: a small pill at the edge of the canvas says which way, and brings it back */
function markerOffscreen() {
  if (!scene || scene.markerX == null) return 0;
  const r = svg.getBoundingClientRect(), sr = $('#stage').getBoundingClientRect(), x = r.left + scene.markerX * (r.width / scene.w);
  return x < sr.left + 4 ? -1 : x > sr.right - 4 ? 1 : 0;
}
function syncMarkerJump() {
  const b = $('#marker-jump');
  if (!b) return;
  const side = markerOffscreen();
  b.hidden = !side;
  if (side) b.textContent = side < 0 ? '← Date marker' : 'Date marker →';
}
function scrollToMarker(onlyIfHidden) {
  const side = markerOffscreen();
  if (onlyIfHidden && !side) return;
  const r = svg.getBoundingClientRect(), sr = $('#stage').getBoundingClientRect(), x = r.left + scene.markerX * (r.width / scene.w);
  $('#stage').scrollBy({ left: x - (sr.left + sr.width / 2), behavior: 'smooth' });
}
$('#marker-jump').addEventListener('click', () => scrollToMarker(false));
$('#stage').addEventListener('scroll', () => requestAnimationFrame(syncMarkerJump), { passive: true });
window.addEventListener('resize', () => requestAnimationFrame(syncMarkerJump));
/** quick toggles beside the chart: progress on/off, and a baseline (set it, see that one exists, show or hide its changes) */
function syncQuickStatus() {
  const S = state.settings, prog = $('#qs-progress'), base = $('#qs-base');
  if (!prog || !base) return;
  const sp = $('#qs-span-text');
  if (sp) { const t = spanLabel(); if (sp.textContent !== t) sp.textContent = t; $('#qs-span').dataset.tipSub = `The plan's span (${S.rangeMode === 'fixed' ? 'fixed' : 'fits the tasks'}) — click to change its dates, periods or date format`; }
  // each button holds all its labels in one cell and shows one, so it is as wide as its longest and nothing shifts as states change
  const say = (b, k) => $$('[data-l]', b).forEach(l => { l.classList.toggle('on', l.dataset.l === k); });
  prog.setAttribute('aria-pressed', String(!!S.progress)); say(prog, S.progress ? 'on' : 'off');
  $('#qs-exec').setAttribute('aria-pressed', String(!!S.execView)); say($('#qs-exec'), S.execView ? 'on' : 'off');
  const has = hasBaseline(), on = !!S.showChanges && has;
  base.setAttribute('aria-pressed', String(on)); say(base, !has ? 'none' : on ? 'on' : 'off');
  const changed = on && scene ? scene.info.filter(n => n.changed && !n.isArea).length : 0;
  const cnt = $('#qs-base-count');
  cnt.hidden = !changed; cnt.textContent = changed;
  const when = S.baselineDate != null ? ` (set ${shortDate(S.baselineDate)})` : '';
  base.dataset.tip = !has ? 'Set a baseline' : on ? 'Hide the baseline' : 'Show the baseline';
  base.dataset.tipSub = !has ? 'Saves the dates as they are now, so later moves and slips show on the chart'
    : on ? `Moved or longer items keep their original dates${when} under the bar${changed ? ` — ${changed} changed` : ''}` : `Shows what has moved since the baseline${when} was set`;
  $('#qs-base-menu').disabled = !has; // always there, so nothing shifts when a baseline is set
}
$('#qs-progress').addEventListener('click', () => setSetting('progressMode', state.settings.progress ? 'off' : state.settings.progressSource === 'marker' ? 'marker' : 'manual'));
$('#qs-base').addEventListener('click', () => {
  const S = state.settings;
  if (!hasBaseline()) { setBaseline(); S.showChanges = true; commit(); refresh(); toast('Baseline saved — changes from here on show against it'); }
  else setSetting('showChanges', !S.showChanges);
});
$('#qs-base-menu').addEventListener('click', baselineDialog);
attachTips($('.chart-add'), true);
$('#qs-exec').addEventListener('click', () => { closePop(); setSetting('execView', !state.settings.execView); syncAddNote(); });
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
['#selbar', '#plan-selbar'].forEach(q => $(q).addEventListener('click', e => {
  const b = e.target.closest('[data-sel]');
  if (!b || b.disabled) return;
  const a = b.dataset.sel;
  if (a === 'group') { commit(); groupIntoNewArea(); }
  else if (a === 'even') evenLengths();
  else if (a === 'dup') { commit(); duplicateSelection(); }
  else if (a === 'del') askDeleteSel();
  else if (a === 'done') setSelecting(false);
  else if (a === 'clear') select(null);
}));
$('#plan-select').addEventListener('click', () => setSelecting(!selecting));

// ---------------------------------------------------------------- hover: what can be grabbed, and what a setting changes
// A layer on top of the chart (never exported) rings the item under the pointer, with grips on the ends of bars that can be
// resized, and outlines what a hovered setting would change: every task, the date header, the marker… The same layer shows
// the timeline header while its popover is open, so the dates being edited are visibly the ones on the chart.
let hover = null, hoverKey = ''; // the pointer on the chart: { id } or { roles: [...] }
let hint = null, hintKey = '';   // a setting being pointed at (Design panel, Style section, the timeline pill): { kinds }, { roles } or { id }
// the date marker is its own control: pointing at it thickens its line and puts drag arrows either side of its label
function markerHover(m) {
  const k = scene.k || 1, hw = m.sw + 6 * k, hd = m.head, cy = hd.y + hd.h / 2, a = 3.2 * k, g = 5 * k;
  const chev = dir => { const x = dir < 0 ? hd.x - g : hd.x + hd.w + g; return { t: 'poly', pts: [[x - dir * a * 0.2, cy - a], [x + dir * a * 0.8, cy], [x - dir * a * 0.2, cy + a]], stroke: m.col, sw: 1.6 * k, ui: true }; };
  return [
    { t: 'rect', x: m.x - hw / 2, y: m.y1, w: hw, h: Math.max(0, m.y2 - m.y1), r: hw / 2, fill: m.col, opacity: 0.12, ui: true },
    { t: 'rect', x: hd.x - 2.5, y: hd.y - 2.5, w: hd.w + 5, h: hd.h + 5, r: hd.r + 2.5, fill: 'none', stroke: m.col, sw: 1.5, opacity: 0.55, ui: true },
    chev(-1), chev(1),
  ];
}
function hoverLayerHtml() {
  if (!scene || (drag && drag.moved)) return '';
  const items = [], picked = selIds();
  const box = it => [
    { t: 'rect', x: it.x - 3, y: it.y - 3, w: it.w + 6, h: it.h + 6, r: 6, fill: SEL_RING, opacity: 0.07, ui: true },
    { t: 'rect', x: it.x - 3, y: it.y - 3, w: it.w + 6, h: it.h + 6, r: 6, fill: 'none', stroke: SEL_RING, sw: 1.5, opacity: 0.6, ui: true },
  ];
  const popMark = pop && pop.kind === 'timeline' ? { roles: ['timeline'] } : pop && pop.kind === 'today' ? { roles: ['today'] } : null;
  [hover, hint, popMark].filter(Boolean).forEach(h => {
    if (h.id && !picked.includes(h.id)) {
      const n = scene.info.find(x => x.row.id === h.id);
      if (n) items.push({ t: 'rect', x: scene.pad - 10, y: n.y, w: scene.w - 2 * scene.pad + 20, h: n.h, r: 6, fill: SEL_RING, opacity: 0.045, ui: true });
      scene.outlines.filter(o => o.id === h.id).forEach(o => { items.push(...ringItems(o, SEL_RING, 1.5, 0.5)); if (o.resize) items.push(...gripItems(o, SEL_RING, 0.9, scene.k, scene.touch)); });
    }
    if (h.kinds) scene.outlines.filter(o => h.kinds.includes(o.kind)).forEach(o => items.push(...ringItems(o, SEL_RING, 1.5, 0.6)));
    if (h.roles) h.roles.forEach(role => {
      if (role === 'today' && scene.marker) items.push(...markerHover(scene.marker));
      else scene.items.filter(it => it.hit && it.role === role).forEach(it => items.push(...box(it)));
    });
  });
  return sceneToSvg({ items, w: scene.w }, true);
}
function drawHover() {
  const g = $('#hov', svg);
  if (g) { const html = hoverLayerHtml(); if (g.innerHTML !== html) g.innerHTML = html; }
  $$('.orow.hov').forEach(el => { if (!hover || !hover.id || el.dataset.id !== hover.id) el.classList.remove('hov'); });
  if (hover && hover.id) { const el = $(`.orow[data-id="${hover.id}"]`); if (el) el.classList.add('hov'); }
}
function setHint(h) {
  const key = h ? JSON.stringify(h) : '';
  if (key === hintKey) return;
  hintKey = key; hint = h; drawHover();
}
// a short tip for the parts of the chart that are not items: they do something when clicked, which nothing else says
const tip = document.createElement('div');
tip.className = 'chart-tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
document.body.appendChild(tip);
let tipTimer = 0, tipXY = [0, 0];
function tipHtml(role) {
  if (role === 'timeline') return `<b>Click to change the timeline</b><span>${esc(spanLabel())} · ${state.settings.rangeMode === 'fixed' ? 'fixed' : 'fits the tasks'}</span>`;
  if (role === 'title') return '<b>Click to edit the title</b>';
  if (role === 'today') return '<b>Drag to move the date marker</b><span>Click for its date, label and line</span>';
  return '';
}
function placeTip() {
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = clamp(tipXY[0] + 14, 8, innerWidth - w - 8) + 'px';
  tip.style.top = (tipXY[1] + 20 + h > innerHeight - 8 ? tipXY[1] - h - 12 : tipXY[1] + 20) + 'px';
}
function showTip(role) {
  clearTimeout(tipTimer); tip.hidden = true;
  const html = role && !pop ? tipHtml(role) : '';
  if (html) tipTimer = setTimeout(() => { tip.innerHTML = html; tip.hidden = false; placeTip(); }, 300);
}
svg.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' || drag) return;
  tipXY = [e.clientX, e.clientY];
  const t = e.target.closest && e.target.closest('[data-role]'), role = t && t.dataset.role, id = t && t.dataset.id;
  const next = !t || state.settings.execView ? null : id && /^(move|resize-l|resize-r|progress|row)$/.test(role) ? { id } : /^(timeline|title|today)$/.test(role) ? { roles: [role] } : null;
  const key = next ? next.id || next.roles[0] : '';
  if (key === hoverKey) { if (!tip.hidden) placeTip(); return; }
  hoverKey = key; hover = next; drawHover();
  showTip(next && next.roles ? next.roles[0] : null);
});
svg.addEventListener('pointerleave', () => { hoverKey = ''; hover = null; drawHover(); showTip(null); });
svg.addEventListener('pointerdown', () => showTip(null), true);
$('#stage').addEventListener('scroll', () => showTip(null), { passive: true });
// pointing at a row in the Plan panel rings it on the chart
$('#outline').addEventListener('mouseover', e => { const r = e.target.closest('.orow[data-id]'); setHint(r ? { id: r.dataset.id } : null); });
$('#outline').addEventListener('mouseleave', () => setHint(null));

/** the plan's overall span as it stands: fixed, or fitted to the tasks */
function currentSpan() {
  const S = state.settings;
  return S.rangeMode === 'fixed' && S.rangeStart != null && S.rangeEnd != null ? [S.rangeStart, S.rangeEnd] : autoSpan();
}
function spanLabel() {
  const [a, b] = currentSpan(), [n, u] = spanUnits(a, b);
  return `${shortDate(a)} – ${shortDate(b)} · ${n} ${n === 1 ? u.replace(/s$/, '') : u}`;
}
/** open the timeline popover under the date header (or under the pill, in exec view where the header isn't clickable) */
function openTimelinePop() {
  const head = $('#chart [data-role="timeline"]');
  if (head) {
    const st = $('#stage'), sr = st.getBoundingClientRect();
    let r = head.getBoundingClientRect();
    if (r.top < sr.top || r.bottom > sr.bottom) { st.scrollTop += r.top - sr.top - 20; r = head.getBoundingClientRect(); }
    openPop('timeline', r, null, r.left + r.width / 2 - 134);
  } else { const r = $('#qs-span').getBoundingClientRect(); openPop('timeline', { top: r.top, bottom: r.top - 330, left: r.left }, null, r.left); }
}
$('#qs-span').addEventListener('click', () => { if (pop && pop.kind === 'timeline') closePop(); else openTimelinePop(); });
$('#qs-span').addEventListener('mouseenter', () => setHint({ roles: ['timeline'] }));
$('#qs-span').addEventListener('mouseleave', () => setHint(null));

/** open the Design panel at a section, with nothing filtered, and flash it so the eye finds it */
function revealDesign(sec) {
  closePop();
  if (ui.hideDesign) { ui.hideDesign = false; saveUi(); syncPanels(); }
  if (isSheet() && !$('#panel-design').classList.contains('open')) openSheet('panel-design');
  if (designQuery) setDesignQuery('');
  setSectionOpen(sec, true);
  const el = $(`.group[data-sec="${sec}"]`, designEl);
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}
// …and pointing at a setting in the Design panel shows on the chart what it changes
const TITLE_KEYS = ['showTitle', 'titleAuto', 'title', 'projectStatus', 'slipChip'];
const MARKER_KEYS = ['todayLine', 'todayDate', 'markerLabelOn', 'todayLabel', 'markerStyle', 'markerWidth', 'markerColor', 'planDaysLeft'];
function designHint(k) {
  const it = designItems.find(x => x.c.k === k);
  if (!it) return null;
  if (TITLE_KEYS.includes(k)) return { roles: ['title'] };
  if (MARKER_KEYS.includes(k)) return { roles: ['today'] };
  if (k === 'areaLabels' || k === 'colorBy') return { kinds: ['area'] };
  if (k === 'msAlign' || it.sec === 'milestones') return { kinds: ['ms'] };
  if (it.sec === 'timeline') return ['Scale', 'Span', 'Dates'].includes(it.head) ? { roles: ['timeline'] } : null;
  if (it.sec === 'tasks' || k === 'barText' || it.head === 'Progress in bars' || it.head === 'Days left') return { kinds: ['task', 'subtask'] };
  return null;
}
designEl.addEventListener('mouseover', e => { const w = e.target.closest('[data-w]'); setHint(w ? designHint(w.dataset.w) : null); });
designEl.addEventListener('mouseleave', () => setHint(null));

// ---------------------------------------------------------------- the item popover: rows, pages and menus
// What an item IS lives in the popover: its status and assignees always, then whatever else it uses (progress, dependencies, a
// blocker, a note…), added from one + Add, so a new kind of detail later is one more line in that menu. A row opens a short menu
// (status) or a page of its own with a way back. How things LOOK lives in the toolbar above the chart.
const progressByMarker = S => S.progress && S.progressSource === 'marker' && S.todayLine;
const EXTRAS = [
  { k: 'progress', label: 'Progress', desc: 'How much of it is done', can: n => !n.hasKids && !n.milestone && !n.isArea, has: (n, S) => !!S.progress && (progressByMarker(S) || n.row.progress != null) },
  { k: 'deps', label: 'Dependencies', desc: 'Items it starts after', can: n => !n.hasKids && !n.isArea, has: n => n.row.deps.length > 0 },
  { k: 'block', label: 'Blocker', desc: 'What it is waiting on: stripes the bar', can: n => !n.isArea, has: n => !!n.row.blocked },
  { k: 'note', label: 'Note', desc: 'A line of commentary in the legend', can: n => !n.isArea, has: n => n.row.note != null },
  { k: 'key', label: 'Key milestone', desc: 'Shown in the strip above the chart', can: n => n.milestone, has: n => !!n.row.key },
  { k: 'ms', label: 'Position in its day', desc: 'Start, middle or end of its day', can: n => n.milestone, has: n => !!n.row.msAlign },
];
const PAGE_TITLES = { who: 'Assignees', statuses: 'Statuses', change: 'Changed from original', progress: 'Progress', deps: 'Dependencies', block: 'Blocker', note: 'Note', key: 'Key milestone', ms: 'Position in its day' };
const MS_ALIGN_WORDS = { auto: 'Auto', start: 'Start of the day', middle: 'Middle of the day', end: 'End of the day' };
const STATUS_COLOURS = ['#1f9d55', '#d97706', '#d92d20', '#2563eb', '#7c3aed', '#0891b2', '#db2777', '#64748b', '#4d7c0f', '#92400e'];
const avatarsHtml = names => `<span class="pv-avs">${names.slice(0, 3).map(nm => `<i>${esc(initials(nm).slice(0, 2))}</i>`).join('')}</span>`;
function changeSummary(n) {
  const dd = n.start - n.bs, de = n.end - n.be, w = k => `${Math.abs(k)}d ${k > 0 ? 'later' : 'earlier'}`;
  return n.milestone ? w(dd) : de ? `ends ${w(de)}` : `starts ${w(dd)}`;
}
function extraValue(k, n) {
  const r = n.row, S = state.settings;
  if (k === 'progress') return progressByMarker(S) ? 'Follows the marker' : Math.round(r.progress || 0) + '%';
  if (k === 'deps') { const first = state.rows.find(x => x.id === r.deps[0]); return `After ${esc(first ? first.name || 'Untitled' : '…')}${r.deps.length > 1 ? ` +${r.deps.length - 1}` : ''}`; }
  if (k === 'block') return `<span class="dotc" style="background:#d92d20"></span>${r.blockedNote && r.blockedNote.trim() ? esc(r.blockedNote.trim()) : '<span class="pv-empty">Add the reason</span>'}`;
  if (k === 'note') return r.note && r.note.trim() ? `${r.noteOff ? '<span class="pv-empty">Private · </span>' : ''}${esc(r.note.trim())}` : '<span class="pv-empty">Empty</span>';
  if (k === 'key') return S.keyStrip ? 'In the strip' : 'Strip is off';
  if (k === 'ms') return MS_ALIGN_WORDS[r.msAlign] || 'Default';
  return '';
}
const prow = (key, label, value, attrs, down) => `<button class="prow" data-prow="${key}" ${attrs}><span class="pk">${label}</span><span class="pv">${value}</span><i class="pchev${down ? ' down' : ''}" aria-hidden="true"></i></button>`;
/** the stacked rows under the dates: status, assignees, then only what this item uses, and + Add for the rest */
function propRowsHtml(n) {
  const r = n.row, S = state.settings, names = splitNames(r.assignee);
  const stv = n.stat ? `<span class="dotc" style="background:${STATUS[n.stat][1]}"></span>${esc(STATUS[n.stat][0])}${n.statRolled ? '<span class="pv-empty">&nbsp;· from inside</span>' : ''}` : '<span class="pv-empty">Not set</span>';
  let h = '<div class="props">';
  h += prow('status', 'Status', stv, 'data-pmenu="status" aria-haspopup="menu" aria-expanded="false"', true);
  h += prow('who', 'Assignees', names.length ? `${avatarsHtml(names)}${esc(names.join(', '))}` : '<span class="pv-empty">Add people</span>', 'data-ppage="who"');
  if (S.showChanges && n.changed && !n.isArea) h += prow('change', 'Changed', esc(changeSummary(n)), 'data-ppage="change"');
  EXTRAS.forEach(x => { if (x.can(n) && x.has(n, S)) h += prow(x.k, x.label, extraValue(x.k, n), `data-ppage="${x.k}"`); });
  h += '</div>';
  if (EXTRAS.some(x => x.can(n) && !x.has(n, S))) h += '<button class="pop-add" data-pmenu="add" aria-haspopup="menu" aria-expanded="false">+ Add</button>';
  return h;
}
/** one row's own page: a way back, a title, and the controls */
function rowPageHtml(n, pinfo) {
  const r = n.row, k = pop.page, S = state.settings;
  let body = '';
  if (k === 'who') body = assigneeHtml(r);
  else if (k === 'statuses') body = statusEditorHtml();
  else if (k === 'change') body = changeHtml(n);
  else if (k === 'progress') body = progressHtml(r);
  else if (k === 'deps') body = depsHtml(n, pinfo, state.rows) + (r.deps.length ? '<button class="link-btn danger-link" data-pact="deps-clear">Remove all dependencies</button>' : '');
  else if (k === 'block') body = `<input class="inp" data-f="blockedNote" value="${esc(r.blockedNote || '')}" placeholder="What is it waiting on?" maxlength="140" autocomplete="off" aria-label="What it is waiting on"><p class="note">The bar is striped with a red “!”, anything unfinished that depends on it gets lighter stripes, and the reason goes in the legend. <kbd class="kb">Alt B</kbd> switches it on and off.</p><button class="link-btn danger-link" data-pact="unblock">Clear the blocker</button>`;
  else if (k === 'note') body = `<textarea class="inp pop-note" data-f="note" maxlength="120" rows="3" placeholder="A line for the reader, e.g. “Waiting on the client review”" aria-label="Note">${esc(r.note || '')}</textarea><span class="pop-count" data-count>${(r.note || '').length}/120</span><label class="ctl"><span class="lbl">Show in the legend</span><span class="switch"><input type="checkbox" data-f="noteOn"${r.noteOff ? '' : ' checked'}><i></i></span></label><p class="note">${r.noteOff ? 'Kept as a private reminder: not on the chart or in exports.' : S.notesLegend === false ? 'Notes are hidden from the legend right now (Design → Status → Notes).' : 'A number beside its bar, and this line in the legend under the chart.'}</p><button class="link-btn danger-link" data-pact="note-del">Delete note</button>`;
  else if (k === 'key') body = `<p class="note">It sits in the key milestones strip above the chart${S.keyStrip ? '' : ', which is switched off right now (Design → Milestones)'}. If no milestone is key, the strip shows them all.</p><button class="link-btn danger-link" data-pact="unkey">Not a key milestone</button>`;
  else if (k === 'ms') body = msHtml(r);
  if (!body) return '';
  return `<div class="pop-page"><button class="pop-back" data-pback>${esc(r.name || 'Untitled')}</button><h4 class="pop-ptitle">${PAGE_TITLES[k]}</h4>${body}</div>`;
}
/** the plan's statuses: rename, recolour, reorder (best to worst) and add or remove them */
function statusEditorHtml() {
  const L = state.settings.statuses, used = id => state.rows.filter(r => r.status === id).length;
  return `<p class="note">Shared by every item in the plan. Keep them in order from best to worst: an area shows the worst status inside it.</p>
    <div class="st-list">${L.map((x, i) => `<div class="st-row"><label class="st-sw" style="background:${x.color}" title="Change the colour"><input type="color" data-f="scolor-${i}" value="${x.color}" aria-label="Colour of ${esc(x.name)}"></label><input class="inp" data-f="sname-${i}" value="${esc(x.name)}" maxlength="30" autocomplete="off" aria-label="Status name"><button class="st-b" data-pact="s-up" data-i="${i}" title="Move up (better)" aria-label="Move ${esc(x.name)} up"${i ? '' : ' disabled'}>↑</button><button class="st-b" data-pact="s-down" data-i="${i}" title="Move down (worse)" aria-label="Move ${esc(x.name)} down"${i < L.length - 1 ? '' : ' disabled'}>↓</button><button class="st-b" data-pact="s-del" data-i="${i}" title="${used(x.id) ? `Remove (${used(x.id)} ${used(x.id) === 1 ? 'item uses' : 'items use'} it)` : 'Remove'}" aria-label="Remove ${esc(x.name)}">✕</button></div>`).join('')}</div>
    <p class="note warn" data-bhint${L.some(x => /^\s*block/i.test(x.name)) ? '' : ' hidden'}>“Blocked” works better as a Blocker (+ Add → Blocker): it keeps the reason, stripes the bar and goes in the legend.</p>
    ${L.length < 10 ? '<button class="pop-add plain" data-pact="s-add">+ Add a status</button>' : ''}`;
}
function setStatuses(list) {
  const S = state.settings, ids = new Set(list.map(x => x.id));
  S.statuses = list;
  state.rows.forEach(r => { if (r.status && !ids.has(r.status)) delete r.status; });
  if (S.projectStatus && !ids.has(S.projectStatus)) S.projectStatus = '';
  useStatuses(list);
  commit(); refresh();
}
/** typing a status name or picking its colour: live on the chart, without rebuilding the field being typed in */
function statusEditInput(t) {
  const m = /^s(name|color)-(\d+)$/.exec(t.dataset.f || '');
  if (!m) return false;
  const L = state.settings.statuses.map(x => Object.assign({}, x)), x = L[+m[2]];
  if (!x) return true;
  if (m[1] === 'name') x.name = t.value.slice(0, 30);
  else { const hex = parseColor(t.value); if (!hex) return true; x.color = hex; t.parentNode.style.background = hex; }
  state.settings.statuses = L; useStatuses(L);
  renderChart(); syncDesign(); commitSoon();
  const hint = $('[data-bhint]', popEl);
  if (hint) hint.hidden = !L.some(y => /^\s*block/i.test(y.name));
  return true;
}
function statusEditChange(t) {
  if (/^sname-/.test(t.dataset.f) && !t.value.trim()) { t.value = 'Status'; statusEditInput(t); }
  commit();
}
/** move between the main list and a row's page */
function setPopPage(k) {
  if (!pop) return;
  closeMenu();
  const leaving = pop.page;
  pop.page = k || null;
  if (leaving === 'note' && pop.kind === 'row') tidyNote(pop.id);
  popEl.innerHTML = popHtml();
  fitPop();
  if (k) { const f = $('.pop-page textarea, .pop-page input.inp:not([type="color"]):not([data-f^="sname"]), .pop-page .chip-in', popEl); if (f && k !== 'progress') f.focus(); else { const b = $('.pop-back', popEl); if (b) b.focus(); } }
  else { const back = leaving && $(`[data-prow="${leaving === 'statuses' ? 'status' : leaving}"]`, popEl); if (back) back.focus(); }
}
/** a note left empty is no note */
function tidyNote(id) {
  const r = state.rows[rowIndex(id)];
  if (r && r.note != null && !r.note.trim()) { delete r.note; delete r.noteOff; commit(); renderChart(); }
}
/** keep the popover inside the window when its content changes height: it scrolls inside, staying under its item */
function fitPop() {
  if (!pop) return;
  popEl.style.maxHeight = '';
  const pr = popEl.getBoundingClientRect();
  if (pr.top + popEl.scrollHeight > innerHeight - 8) {
    const room = innerHeight - 8 - pr.top;
    if (room >= 240) popEl.style.maxHeight = room + 'px';
    else popEl.style.top = Math.max(8, innerHeight - 8 - Math.min(popEl.scrollHeight, innerHeight - 16)) + 'px';
  }
}
/** add one of the extras to the item in the popover, then open its page */
function addExtra(k) {
  if (!pop || pop.kind !== 'row') return;
  const r = state.rows[rowIndex(pop.id)], S = state.settings;
  if (!r) return;
  commit();
  if (k === 'progress') {
    if (!S.progress) { // progress for this bar alone: the others stay plain until they get theirs
      state.rows.forEach(x => { if (x !== r && !x.progress) x.progress = null; });
      S.progress = true; S.progressSource = 'manual';
      toast('Progress is shown on this bar. Add it to others the same way, or show it on every bar from Progress under the chart');
    }
    if (r.progress == null) r.progress = 0;
  } else if (k === 'block') r.blocked = true;
  else if (k === 'note') { if (r.note == null) r.note = ''; }
  else if (k === 'key') { r.key = true; if (!S.keyStrip) { S.keyStrip = true; toast('The key milestones strip is now shown above the chart'); } }
  commit(); refresh();
  if (k !== 'key') setPopPage(k);
}
function popRowClick(e) {
  const t = e.target, id = pop.id, r = state.rows[rowIndex(id)];
  if (!r) return false;
  const pm = t.closest('[data-pmenu]');
  if (pm) { toggleMenu(pm.dataset.pmenu, pm); return true; }
  const pg = t.closest('[data-ppage]');
  if (pg) { setPopPage(pg.dataset.ppage); return true; }
  if (t.closest('[data-pback]')) { setPopPage(null); return true; }
  if (pop.page === 'progress' && t.closest('[data-act="progress-clear"]')) { setRowProgress(id, null); setPopPage(null); return true; }
  const pa = t.closest('[data-pact]');
  if (!pa || pa.disabled) return false;
  const a = pa.dataset.pact, i = +pa.dataset.i;
  if (a.startsWith('s-')) {
    const L = state.settings.statuses.map(x => Object.assign({}, x));
    if (a === 's-up' && i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]];
    else if (a === 's-down' && i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]];
    else if (a === 's-del') { const used = state.rows.filter(x => x.status === L[i].id).length, gone = L.splice(i, 1)[0]; if (used) toast(`“${gone.name}” cleared from ${used} ${used === 1 ? 'item' : 'items'}. Undo brings it back`); }
    else if (a === 's-add') { const taken = new Set(L.map(x => x.color)); L.push({ id: 's' + uid().slice(0, 8), name: 'New status', color: STATUS_COLOURS.find(c => !taken.has(c)) || '#64748b' }); }
    commit(); setStatuses(L);
    const f = a === 's-add' ? $(`[data-f="sname-${L.length - 1}"]`, popEl) : $(`[data-pact="${a}"][data-i="${a === 's-up' ? i - 1 : a === 's-down' ? i + 1 : i}"]`, popEl);
    if (f) { f.focus(); if (a === 's-add') f.select(); }
    return true;
  }
  commit();
  if (a === 'unblock') { delete r.blocked; delete r.blockedNote; }
  else if (a === 'note-del') { delete r.note; delete r.noteOff; }
  else if (a === 'unkey') delete r.key;
  else if (a === 'deps-clear') r.deps = [];
  commit(); refresh(); setPopPage(null);
  return true;
}

// ---- small menus (status, + Add, a colour): one floating list under the button that opened it
const menuEl = document.createElement('div');
menuEl.className = 'pop-menu'; menuEl.hidden = true; menuEl.setAttribute('role', 'menu');
document.body.appendChild(menuEl);
let menuFor = null, menuKind = null;
function closeMenu() {
  if (menuEl.hidden) return;
  menuEl.hidden = true; menuEl.innerHTML = '';
  if (menuFor) menuFor.setAttribute('aria-expanded', 'false');
  menuFor = null; menuKind = null;
}
function menuHtml(kind) {
  const S = state.settings;
  if (kind === 'status' && pop && pop.kind === 'row') {
    const r = state.rows[rowIndex(pop.id)], cur = r && r.status;
    return `<button class="mi" role="menuitemradio" aria-checked="${!cur}" data-mstatus=""><span class="dotc none"></span>Not set${!cur ? '<b class="ck">✓</b>' : ''}</button>`
      + S.statuses.map(x => `<button class="mi" role="menuitemradio" aria-checked="${cur === x.id}" data-mstatus="${esc(x.id)}"><span class="dotc" style="background:${x.color}"></span>${esc(x.name)}${cur === x.id ? '<b class="ck">✓</b>' : ''}</button>`).join('')
      + '<div class="msep" role="separator"></div><button class="mi" role="menuitem" data-mpage="statuses">Edit statuses…</button>';
  }
  if (kind === 'add' && pop && pop.kind === 'row') {
    const n = derive(state.rows).find(x => x.row.id === pop.id);
    if (!n) return '';
    return EXTRAS.filter(x => x.can(n) && !x.has(n, S)).map(x => `<button class="mi two-line" role="menuitem" data-madd="${x.k}"><span>${x.label}<small>${x.desc}</small></span></button>`).join('');
  }
  if (kind === 'colour') {
    const ids = selIds(), r = ids.length && state.rows[rowIndex(ids[0])];
    if (!r) return '';
    const cols = paletteOf(S).colors, same = ids.every(id => (state.rows[rowIndex(id)] || {}).color === r.color), v = same ? r.color : undefined, custom = typeof v === 'string';
    return `<div class="m-sw"><button class="sw auto${v == null && same ? ' on' : ''}" data-mcolor="auto" title="Automatic: follows its area">Auto</button>${cols.map((c, i) => `<button class="sw${v === i ? ' on' : ''}" data-mcolor="${i}" style="background:${c}" aria-label="Palette colour ${i + 1}"></button>`).join('')}<label class="sw custom${custom ? ' on' : ''}" title="Any colour"${custom ? ` style="background:${v}"` : ''}><input type="color" data-mcustom value="${custom ? v : cols[0]}" aria-label="Any colour"></label></div>`;
  }
  return '';
}
function toggleMenu(kind, anchor) {
  if (menuKind === kind && !menuEl.hidden) { closeMenu(); return; }
  closeMenu();
  const html = menuHtml(kind);
  if (!html) return;
  menuEl.innerHTML = html; menuEl.hidden = false; menuEl.dataset.kind = kind;
  menuFor = anchor; menuKind = kind; anchor.setAttribute('aria-expanded', 'true');
  const ar = anchor.getBoundingClientRect(), w = kind === 'colour' ? Math.max(220, menuEl.offsetWidth) : Math.max(ar.width, 230);
  menuEl.style.width = kind === 'colour' ? '' : w + 'px';
  menuEl.style.left = clamp(ar.left, 8, Math.max(8, innerWidth - w - 8)) + 'px';
  const h = menuEl.offsetHeight;
  menuEl.style.top = (ar.bottom + 4 + h > innerHeight - 8 ? Math.max(8, ar.top - 4 - h) : ar.bottom + 4) + 'px';
  const first = $('.mi[aria-checked="true"], .mi, .sw.on, .sw', menuEl);
  if (first) first.focus({ preventScroll: true });
}
menuEl.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.mstatus != null && pop && pop.kind === 'row') { const v = b.dataset.mstatus, a = menuFor; closeMenu(); setRowStatus([pop.id], v); const row = $('[data-prow="status"]', popEl); if (row) row.focus(); else if (a) a.focus(); return; }
  if (b.dataset.mpage) { closeMenu(); setPopPage(b.dataset.mpage); return; }
  if (b.dataset.madd) { closeMenu(); addExtra(b.dataset.madd); return; }
  if (b.dataset.mcolor != null) {
    const ids = selIds();
    commit();
    ids.forEach(id => { const r = state.rows[rowIndex(id)]; if (r) { if (b.dataset.mcolor === 'auto') delete r.color; else r.color = +b.dataset.mcolor; } });
    closeMenu(); commit(); refresh();
  }
});
menuEl.addEventListener('input', e => {
  if (e.target.dataset.mcustom == null) return;
  const hex = parseColor(e.target.value);
  if (!hex) return;
  selIds().forEach(id => { const r = state.rows[rowIndex(id)]; if (r) r.color = hex; });
  const lab = e.target.closest('.sw'); if (lab) { $$('.sw', menuEl).forEach(s => s.classList.remove('on')); lab.classList.add('on'); lab.style.background = hex; }
  renderChart(); renderOutline(); commitSoon();
});
menuEl.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const a = menuFor; closeMenu(); if (a && document.contains(a)) a.focus(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const bs = $$('button:not([disabled])', menuEl), i = bs.indexOf(document.activeElement);
    if (bs.length) { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); }
  }
});
addEventListener('resize', closeMenu);

// ---------------------------------------------------------------- the look toolbar above the chart
// One row, always the same height so the chart never jumps. The timeline sits first and never moves; after it come the few look
// settings for what is selected (a task, a milestone, an area), for the dates while the timeline is open, or for the whole chart.
// The selection's colour is labelled “This task”; everything else says “All tasks”, and pointing at a button rings what it changes.
const lookbar = $('#lookbar'), lookCtx = $('#lookbar-ctx');
const LB_ICON = {
  nLeft: '<svg viewBox="0 0 16 16"><path d="M1.5 8h4"/><rect x="7.5" y="5.5" width="7" height="5" rx="1.5"/></svg>',
  nBar: '<svg viewBox="0 0 16 16"><rect x="1.5" y="4.5" width="13" height="7" rx="2"/><path d="M4 8h5"/></svg>',
  alL: '<svg viewBox="0 0 16 16"><path d="M3 4h10M3 8h6M3 12h8"/></svg>',
  alC: '<svg viewBox="0 0 16 16"><path d="M3 4h10M5 8h6M4 12h8"/></svg>',
  alR: '<svg viewBox="0 0 16 16"><path d="M3 4h10M7 8h6M5 12h8"/></svg>',
  dates: '<svg viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="10" rx="2"/><path d="M4 6.5h6M4 9.5h4"/></svg>',
  datesAfter: '<svg viewBox="0 0 16 16"><rect x="1.5" y="5" width="8" height="6" rx="1.5"/><path d="M3.5 8h3M11.5 8h3"/></svg>',
  smaller: '<svg viewBox="0 0 16 16"><path d="M2 12l3-8 3 8M3 9.5h4M10.5 9h4"/></svg>',
  larger: '<svg viewBox="0 0 16 16"><path d="M2 12l3-8 3 8M3 9.5h4M10.5 9h4M12.5 7v4"/></svg>',
  cSq: '<svg viewBox="0 0 16 16"><rect x="2" y="4.5" width="12" height="7"/></svg>',
  cRd: '<svg viewBox="0 0 16 16"><rect x="2" y="4.5" width="12" height="7" rx="2"/></svg>',
  cPill: '<svg viewBox="0 0 16 16"><rect x="2" y="4.5" width="12" height="7" rx="3.5"/></svg>',
  guide: '<svg viewBox="0 0 16 16"><path d="M8 1.5v13" stroke-dasharray="2 2"/><path d="M8 5l3 3-3 3-3-3z"/></svg>',
  strip: '<svg viewBox="0 0 16 16"><path d="M2 5h12"/><path d="M5 3.5l1.5 1.5L5 6.5 3.5 5zM11 3.5l1.5 1.5L11 6.5 9.5 5z"/><rect x="2" y="9" width="7" height="3" rx="1"/></svg>',
  more: '<svg viewBox="0 0 16 16"><path d="M6 4l4 4-4 4"/></svg>',
};
const LB_HINTS = { task: { kinds: ['task', 'subtask'] }, ms: { kinds: ['ms'] }, area: { kinds: ['area'] }, timeline: { roles: ['timeline'] } }; // 'all' (font, text size) rings nothing: it would cover the whole chart
function lookContext() {
  if (state.settings.execView) return { kind: 'none' };
  if (pop && pop.kind === 'timeline') return { kind: 'timeline' };
  const ids = selIds(), info = scene ? scene.info : [];
  const ns = ids.map(id => info.find(n => n.row.id === id)).filter(Boolean);
  if (!ns.length) return { kind: 'none' };
  return { kind: ns.every(n => n.isArea) ? 'area' : ns.every(n => n.milestone) ? 'ms' : 'task', ns };
}
// Quick tooltips (mouse only) for controls carrying data-tip (and data-tip-sub): the name and what it does, beside the control.
// Quicker than a browser title, and instant while moving along a row of them. `above` puts them over the control.
const quickTip = document.createElement('div');
quickTip.className = 'chart-tip lb-tip'; quickTip.hidden = true; quickTip.setAttribute('role', 'tooltip');
document.body.appendChild(quickTip);
let qtFor = null, qtTimer = 0, qtWarm = 0;
function hideQuickTip() { clearTimeout(qtTimer); qtFor = null; if (!quickTip.hidden) { quickTip.hidden = true; qtWarm = Date.now(); } }
function showQuickTip(el, above) {
  quickTip.innerHTML = `<b>${esc(el.dataset.tip)}</b>${el.dataset.tipSub ? `<span>${esc(el.dataset.tipSub)}</span>` : ''}`;
  quickTip.hidden = false;
  const r = el.getBoundingClientRect(), w = quickTip.offsetWidth, h = quickTip.offsetHeight;
  const up = above ? r.top - h - 8 >= 8 : r.bottom + 8 + h > innerHeight - 8;
  quickTip.style.left = Math.round(clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8)) + 'px';
  quickTip.style.top = Math.round(up ? r.top - h - 8 : r.bottom + 8) + 'px';
}
function attachTips(root, above) {
  root.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = e.target.closest('[data-tip]');
    if (el === qtFor) return;
    if (!el || !root.contains(el)) { hideQuickTip(); return; }
    clearTimeout(qtTimer); qtFor = el;
    if (!quickTip.hidden || Date.now() - qtWarm < 400) showQuickTip(el, above);
    else qtTimer = setTimeout(() => { if (qtFor === el && el.isConnected) showQuickTip(el, above); }, 350);
  });
  root.addEventListener('pointerleave', hideQuickTip);
  root.addEventListener('pointerdown', hideQuickTip);
  root.addEventListener('scroll', hideQuickTip, { passive: true });
  root.addEventListener('change', hideQuickTip);
}
// what each look-bar control changes, said in its tooltip under the name
const LB_SCOPE = { task: 'Changes every task', ms: 'Changes every milestone', area: 'Changes every area', all: 'Changes all text on the chart', timeline: 'Changes the dates across the top' };
const tipAttr = (main, sub) => ` data-tip="${esc(main)}"${sub ? ` data-tip-sub="${esc(sub)}"` : ''}`;
function lookHtml(c) {
  const S = state.settings;
  // a disabled button never gets the pointer, so its reason stays a plain title
  const ib = (attrs, icon, label, on, hint, dis) => `<button class="lb-ib${on ? ' on' : ''}" ${attrs}${dis ? ` title="${label}"` : tipAttr(label, LB_SCOPE[hint])} aria-label="${label}"${on != null ? ` aria-pressed="${!!on}"` : ''}${hint ? ` data-hint="${hint}"` : ''}${dis ? ' disabled' : ''}>${icon}</button>`;
  const set = (k, v, icon, label, hint, dis) => ib(`data-lb="set" data-k="${k}" data-v="${v}"`, icon, label, String(S[k]) === String(v), hint, dis);
  const seg = (k, opts, hint, label) => `<span class="lb-seg" role="group" aria-label="${label}" data-hint="${hint}"${tipAttr(label, LB_SCOPE[hint])}>${opts.map(([v, l]) => `<button data-lb="set" data-k="${k}" data-v="${v}" class="${String(S[k]) === String(v) ? 'on' : ''}" aria-pressed="${String(S[k]) === String(v)}">${l}</button>`).join('')}</span>`;
  const sep = '<span class="lb-sep" aria-hidden="true"></span>';
  const scope = t => `<span class="lb-scope">${t}</span>`;
  const more = (sec, label) => `<button class="lb-more" data-lb="more" data-sec="${sec}"${tipAttr('Every setting for this', 'Opens it in the Design panel')}>${label || 'More'}${LB_ICON.more}</button>`;
  const auto = S.textAuto !== false, pt = auto && scene ? Math.round(scene.fs * 0.75 * 2) / 2 : S.textPt;
  const size = ib('data-lb="ts" data-v="-0.5"', LB_ICON.smaller, 'Smaller text (all text on the chart)', null, 'all')
    + `<button class="lb-ts" data-lb="ts" data-v="auto" data-hint="all"${auto ? tipAttr(`Text size: automatic (${pt} pt)`, 'Follows the canvas size; − and + set your own') : tipAttr(`Text size: ${pt} pt`, 'Click to go back to the automatic size')}>${auto ? 'Auto' : pt + ' pt'}</button>`
    + ib('data-lb="ts" data-v="0.5"', LB_ICON.larger, 'Larger text (all text on the chart)', null, 'all');
  if (c.kind === 'timeline') {
    return scope('Dates') + seg('scale', [['days', 'Days'], ['weeks', 'Weeks'], ['sprints', 'Sprints'], ['months', 'Months'], ['quarters', 'Qtrs']], 'timeline', 'Periods')
      + sep + `<span class="lb-lbl">At</span>` + seg('datePos', [['top', 'Top'], ['bottom', 'Bottom'], ['both', 'Both']], 'timeline', 'Where the dates sit')
      + sep + `<select class="lb-sel" data-lbk="dateFormat" data-hint="timeline" aria-label="Date format"${tipAttr('Date format', LB_SCOPE.timeline)}>${designCtl.dateFormat.opts.map(o => `<option value="${o[0]}"${S.dateFormat === o[0] ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
      + more('timeline');
  }
  if (c.kind === 'none') {
    const cols = paletteOf(S).colors.slice(0, 6);
    return scope('Whole chart') + `<select class="lb-sel" data-lbk="font" data-hint="all" aria-label="Font"${tipAttr('Font', 'For all text on the chart and in exports')}>${FONTS.map(f => `<option${S.font === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>`
      + sep + size + sep
      + `<button class="lb-pal" data-lb="more" data-sec="colour"${tipAttr('Palette and colours', 'Opens Colour in the Design panel')}><span class="lb-dots">${cols.map(x => `<i style="background:${x}"></i>`).join('')}</span>Palette</button>`
      + more('canvas', 'More in Design');
  }
  const info = derive(state.rows), n0 = info.find(x => x.row.id === c.ns[0].row.id) || c.ns[0];
  const noun = { task: 'task', ms: 'milestone', area: 'area' }[c.kind], many = c.ns.length > 1;
  const colour = `<button class="lb-colour" data-lb="colour" aria-haspopup="menu" aria-expanded="false"${tipAttr(`Colour of ${many ? 'the selected items' : 'this ' + noun}`, 'Pick from the palette, or any colour')}><span class="lb-sw" style="background:${rowBaseColor(info, n0, paletteOf(S).colors)}"></span>${many ? `These ${c.ns.length}` : 'This ' + noun}</button>`;
  let h = colour + sep;
  if (c.kind === 'task') {
    const onBars = S.pack || S.taskLabels === 'bars';
    h += scope('All tasks') + set('taskLabels', 'left', LB_ICON.nLeft, S.pack ? 'Names on the left (not while tasks share rows)' : 'Names to the left of the bars', 'task', S.pack)
      + ib('data-lb="set" data-k="taskLabels" data-v="bars"', LB_ICON.nBar, 'Names on the bars', onBars, 'task');
    if (onBars) h += sep + set('barAlign', 'left', LB_ICON.alL, 'Names on the left of each bar', 'task') + set('barAlign', 'center', LB_ICON.alC, 'Names centred on the bars', 'task') + set('barAlign', 'right', LB_ICON.alR, 'Names on the right of each bar', 'task')
      + ib('data-lb="toggle" data-k="barDates"', LB_ICON.dates, 'Dates or duration on the bars', !!S.barDates, 'task')
      + (S.barDates ? ib(`data-lb="set" data-k="barDatesPos" data-v="${S.barDatesPos === 'beside' ? 'in' : 'beside'}"`, LB_ICON.datesAfter, 'Dates after the bar, on one line (slimmer bars)', S.barDatesPos === 'beside', 'task') : '');
    h += sep + size + sep + set('corners', 'square', LB_ICON.cSq, 'Square corners', 'task') + set('corners', 'rounded', LB_ICON.cRd, 'Rounded corners', 'task') + set('corners', 'pill', LB_ICON.cPill, 'Pill-shaped bars', 'task') + more('tasks');
  } else if (c.kind === 'ms') {
    h += scope('All milestones') + ib('data-lb="toggle" data-k="msLines"', LB_ICON.guide, 'Guide lines down from each milestone', !!S.msLines, 'ms')
      + ib('data-lb="toggle" data-k="keyStrip"', LB_ICON.strip, 'Key milestones strip above the chart', !!S.keyStrip, 'ms') + sep + size + more('milestones');
  } else {
    h += scope('All areas') + seg('areaLabels', [['row', 'As headings'], ['side', 'At the side']], 'area', 'Area names')
      + sep + `<span class="lb-lbl">Colour by</span>` + seg('colorBy', [['group', 'Area'], ['row', 'Row']], 'area', 'Share a colour by') + more('tasks');
  }
  return h;
}
let lookSig = '';
function syncLookbar() {
  if (!lookbar) return;
  const c = lookContext(), tl = $('#qs-span');
  if (tl) tl.setAttribute('aria-pressed', String(c.kind === 'timeline'));
  lookbar.dataset.ctx = c.kind;
  const html = lookHtml(c);
  if (html === lookSig) return;
  lookSig = html;
  if (menuKind === 'colour') closeMenu();
  const had = document.activeElement && lookCtx.contains(document.activeElement) ? document.activeElement : null, key = had && (had.dataset.lb + (had.dataset.k || '') + (had.dataset.v || '') + (had.dataset.lbk || ''));
  lookCtx.innerHTML = html;
  if (lookbar.edge) lookbar.edge();
  if (had) { const again = $$('[data-lb], [data-lbk]', lookCtx).find(b => (b.dataset.lb + (b.dataset.k || '') + (b.dataset.v || '') + (b.dataset.lbk || '')) === key); if (again) again.focus({ preventScroll: true }); } // keyboard focus stays on the button just used
}
if (lookbar) {
  lookbar.addEventListener('click', e => {
    const b = e.target.closest('[data-lb]');
    if (!b || b.disabled) return;
    const S = state.settings, a = b.dataset.lb;
    if (a === 'set') { const k = b.dataset.k, c = designCtl[k]; setSetting(k, c && c.num ? +b.dataset.v : c && c.bool ? b.dataset.v === 'true' : b.dataset.v); }
    else if (a === 'toggle') setSetting(b.dataset.k, !S[b.dataset.k]);
    else if (a === 'ts') {
      if (b.dataset.v === 'auto') { if (S.textAuto === false) setSetting('textAuto', true); }
      else { const from = S.textAuto !== false && scene ? Math.round(scene.fs * 0.75 * 2) / 2 : S.textPt; S.textAuto = false; setSetting('textPt', clamp(from + +b.dataset.v, 5, 48)); }
    } else if (a === 'colour') toggleMenu('colour', b);
    else if (a === 'more') revealDesign(b.dataset.sec);
  });
  lookbar.addEventListener('change', e => { const k = e.target.dataset.lbk; if (k) setSetting(k, e.target.value); });
  lookbar.addEventListener('mouseover', e => { const h = e.target.closest('[data-hint]'); if (!e.target.closest('#qs-span')) setHint(h && LB_HINTS[h.dataset.hint] || null); });
  lookbar.addEventListener('mouseleave', () => setHint(null));
  attachTips(lookbar);
  // when the row is too narrow for everything: a softer “Timeline” label, a fade where more is hidden, and the wheel scrolls it sideways
  const edge = () => { lookbar.classList.toggle('more-right', lookbar.scrollLeft + lookbar.clientWidth < lookbar.scrollWidth - 2); };
  lookbar.addEventListener('scroll', edge, { passive: true });
  lookbar.addEventListener('wheel', e => { if (lookbar.scrollWidth > lookbar.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.ctrlKey) { lookbar.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { lookbar.classList.toggle('narrow', lookbar.clientWidth < 1000); edge(); }).observe(lookbar);
  lookbar.edge = edge;
}

// ---------------------------------------------------------------- go
{ // the tips card: ⌘ on a Mac, and it remembers whether it was left open
  const tips = $('#tips');
  if (tips) {
    const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
    $$('[data-mod]', tips).forEach(k => { k.textContent = mac ? '⌘' : 'Ctrl'; });
    $$('[data-alt]', tips).forEach(k => { k.textContent = mac ? '⌥' : 'Alt'; });
    tips.open = ui.tipsOpen === true; // tucked away unless it was opened on purpose
    tips.addEventListener('toggle', () => { ui.tipsOpen = tips.open; saveUi(); });
  }
}
$('#version-num').textContent = APP_VERSION;
buildDesign();
syncUndo();
ensureFont();
refresh();
openSharedLink();
