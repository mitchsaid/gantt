'use strict';
// Shown in the top bar so it is obvious which build is loaded. Bump with every release, together with the ?v= in index.html.
const APP_VERSION = 'v42 · 11 Nov';
/* Core: dates, colours, import parsing and chart layout. No DOM side effects. */

// ---------------------------------------------------------------- dates
const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const toDay = (y, m, d) => Math.round(Date.UTC(y, m, d) / DAY_MS);
const dayToDate = n => new Date(n * DAY_MS);
const dayToIso = n => dayToDate(n).toISOString().slice(0, 10);
const isoToDay = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? toDay(+m[1], +m[2] - 1, +m[3]) : null; };
const todayDay = () => { const d = new Date(); return toDay(d.getFullYear(), d.getMonth(), d.getDate()); };
const dow = n => (dayToDate(n).getUTCDay() + 6) % 7; // 0 = Monday
const mondayOf = n => n - dow(n);
const ymd = n => { const d = dayToDate(n); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
const shortDate = n => { const [, m, d] = ymd(n); return d + ' ' + MONTHS[m]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------------------------------------------------------------- colour
function hexToRgb(h) {
  h = String(h || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = rgb => '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t));
}
function luminance(h) {
  const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** readable text colour for a fill: white where it reads well, otherwise dark — whichever contrasts more */
const onColor = h => { const w = contrast(h, '#ffffff'); return w >= 4.5 || w >= contrast(h, '#111827') ? '#ffffff' : '#111827'; };

// ---------------------------------------------------------------- durations
function addMonths(d, n) {
  const [y, m, dd] = ymd(d);
  const first = toDay(y, m + n, 1);
  const [ty, tm] = ymd(first);
  return toDay(ty, tm, Math.min(dd, ymd(toDay(ty, tm + 1, 0))[2]));
}
/** last day of a task that starts on `start` and runs n days / weeks / sprints / months (working weeks end on Friday) */
function durationEnd(start, n, unit, sprintWeeks) {
  n = Math.max(1, Math.round(n) || 1);
  if (unit === 'days') return start + n - 1;
  let e = unit === 'months' ? addMonths(start, n) - 1 : start + n * 7 * (unit === 'sprints' ? sprintWeeks : 1) - 1;
  if (dow(start) < 5 && dow(e) >= 5) e -= dow(e) - 4;
  return Math.max(e, start);
}
/** how many whole units a span is, or null if it is not a whole number of them */
function durationIn(start, end, unit, sprintWeeks) {
  const len = end - start + 1;
  if (unit === 'days') return len;
  const g = Math.round(len / (unit === 'months' ? 30.4 : 7 * (unit === 'sprints' ? sprintWeeks : 1)));
  for (const c of [g, g + 1, g - 1]) if (c >= 1 && durationEnd(start, c, unit, sprintWeeks) === end) return c;
  return null;
}
/** stretch or squeeze every item so the plan exactly fills [a, b] */
function fitRows(rows, a, b) {
  const info = derive(rows).filter(n => !n.hasKids);
  if (!info.length || b < a) return;
  const lo = Math.min(...info.map(n => n.start)), hi = Math.max(...info.map(n => n.end)) + 1;
  const f = (b + 1 - a) / Math.max(1, hi - lo);
  info.forEach(n => {
    const r = n.row;
    if (n.milestone) { r.start = r.end = clamp(a + Math.round((r.start + 1 - lo) * f) - 1, a, b); return; }
    const s = a + Math.round((r.start - lo) * f);
    r.start = s; r.end = Math.max(s, a + Math.round((r.end + 1 - lo) * f) - 1);
  });
}

function toOklch(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function fromOklch([L, C, H]) {
  const A = C * Math.cos(H), B = C * Math.sin(H);
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgbToHex(lin.map(v => { v = clamp(v, 0, 1); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }));
}
/** n colours for the top-level areas, derived from a primary and optional secondary colour. */
function areaPalette(primary, secondary, n) {
  const p = toOklch(primary);
  const out = [];
  if (secondary) {
    const s = toOklch(secondary);
    let dh = s[2] - p[2];
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    // a near-grey endpoint has no meaningful hue: borrow the other one's
    if (p[1] < 0.02 || s[1] < 0.02) dh = 0;
    const h0 = p[1] < 0.02 ? s[2] : p[2];
    for (let i = 0; i < n; i++) {
      const t = n <= 1 ? 0 : i / (n - 1);
      out.push(fromOklch([p[0] + (s[0] - p[0]) * t, p[1] + (s[1] - p[1]) * t, h0 + dh * t]));
    }
  } else {
    const dir = p[0] > 0.72 ? -1 : 1;
    const step = n <= 1 ? 0 : Math.min(0.075, 0.26 / (n - 1));
    for (let i = 0; i < n; i++) out.push(i === 0 ? rgbToHex(hexToRgb(primary)) : fromOklch([clamp(p[0] + dir * step * i, 0.2, 0.92), p[1] * (1 - 0.07 * i), p[2]]));
  }
  return out;
}

// ---------------------------------------------------------------- palettes
// A palette is a short list of colours that areas take in turn. Every colour in it is kept dark enough for white labels
// (or, for pastel palettes, light enough for near-black labels), so a chart never mixes label colours.
const TEXT_LIGHT = '#ffffff', TEXT_DARK = '#0b1020';
const LIGHT_MIN = 4.8, DARK_MIN = 9; // minimum label contrast the palettes are built to

function oklabLin(L, C, H) {
  const A = C * Math.cos(H), B = C * Math.sin(H);
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
/** a colour from lightness / chroma / hue, easing the chroma off until it fits on screen */
function okHex(L, C, H) {
  let c = Math.max(0, C);
  while (c > 0 && oklabLin(L, c, H).some(v => v < -0.001 || v > 1.001)) c -= 0.004;
  return fromOklch([L, Math.max(0, c), H]);
}
/** the lightest (for white labels) or darkest (for dark labels) a colour of this hue and chroma may be */
function toneLimit(C, H, mode) {
  let lo = 0.04, hi = 0.99;
  const ok = L => (mode === 'light' ? contrast(okHex(L, C, H), TEXT_LIGHT) >= LIGHT_MIN : contrast(okHex(L, C, H), TEXT_DARK) >= DARK_MIN);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (mode === 'light') { if (ok(mid)) lo = mid; else hi = mid; } else if (ok(mid)) hi = mid; else lo = mid;
  }
  return mode === 'light' ? lo : hi;
}
/** nudge each colour so its label is readable, and keep the set close in tone so contrast stays even */
function fixPalette(hexes, mode, keepFirst, loose) {
  return hexes.map((hex, i) => {
    const [L, C, H] = toOklch(hex), lim = toneLimit(C, H, mode);
    const first = (keepFirst && i === 0) || loose; // `loose` palettes (shades of one hue) keep their own range of darkness
    const L2 = mode === 'light' ? (first ? Math.min(L, lim) : clamp(L, lim - 0.1, lim)) : first ? Math.max(L, lim) : clamp(L, lim, Math.min(0.95, lim + 0.14));
    return okHex(L2, C, H);
  });
}
/** light labels unless the colour is so pale that darkening it enough would change it too much */
function pickMode(L, C, H) { return L - toneLimit(C, H, 'light') <= 0.2 ? 'light' : 'dark'; }
/** a lighter tint of a colour that still passes `min` contrast with the given label colour (used for subtask bars) */
function lightenFor(hex, label, min) {
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (contrast(mix(hex, '#ffffff', mid), label) >= min) lo = mid; else hi = mid; }
  return mix(hex, '#ffffff', lo);
}
const D2R = Math.PI / 180;

const SCHEMES = [
  ['generic', 'Generic gradient', 'generic'],
  ['gradient', 'Matching gradient', [0, 40, 80, 120, 160, 200]],
  ['analogous', 'Analogous', [0, 28, -28, 56, -56]],
  ['mono', 'Shades', null],
  ['complement', 'Complementary', [0, 180, 18, 198, -18]],
  ['triad', 'Triadic', [0, 120, 240, 30, 150, 270]],
];
/** the colour you chose, easing through the hue wheel (the short way round) into a deep slate blue — the classic "generic" gradient */
function genericGradient(L, C, H, mode) {
  const He = 250 * D2R, Le = mode === 'light' ? 0.4 : 0.86, Ce = 0.045;
  const dh = ((((He - H) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; // signed shortest turn, in (-π, π]
  const lim = toneLimit(Math.max(C, 0.05), H, mode), L1 = mode === 'light' ? Math.min(L, lim) : Math.max(L, lim);
  // colours already near the slate end would just darken; give them a bulge of hue on the way (toward the other side of the wheel)
  const swing = C < 0.04 ? 0 : Math.max(0, 80 - Math.abs(dh) / D2R) * 1.1 * D2R * (dh > 0 ? -1 : 1); // (greys stay grey)
  return [0, 1, 2, 3, 4, 5].map(i => { const t = i / 5; return okHex(L1 + (Le - L1) * t, C + (Ce - C) * Math.pow(t, 1.6), H + dh * t + swing * Math.sin(Math.PI * t)); }); // chroma holds, then fades at the end
}
/** a handful of matching palettes built from one colour; the first is the one to apply by default */
function suggestPalettes(seed) {
  seed = parseColor(seed) || '#4f46e5';
  let [L, C, H] = toOklch(seed);
  if (C < 0.02) H = 260 * D2R; // greys have no hue: lean blue
  const Cb = clamp(Math.max(C, 0.09), 0.09, 0.2), mode = pickMode(L, C, H);
  return SCHEMES.map(([key, name, hues]) => {
    let colors;
    if (hues === 'generic') colors = fixPalette(genericGradient(L, C, H, mode), mode, true, true);
    else if (!hues) { // shades: your colour first, then lighter and darker versions of it, arranged so neighbouring bars differ as much as possible
      const lim = toneLimit(C, H, mode), L1 = mode === 'light' ? Math.min(L, lim) : Math.max(L, lim);
      const upLimit = mode === 'light' ? lim : 0.9, downLimit = mode === 'light' ? 0.32 : lim; // lighter / darker, while labels stay readable
      const roomUp = Math.max(0, upLimit - L1), roomDown = Math.max(0, L1 - downLimit), room = roomUp + roomDown || 1;
      const spread = Math.min(room, 0.3), upSpan = spread * roomUp / room, downSpan = spread - upSpan;
      let nUp = Math.round(5 * roomUp / room);
      if (upSpan < 0.025) nUp = 0; else if (downSpan < 0.025) nUp = 5;
      const nDown = 5 - nUp, toBlue = ((((250 * D2R - H) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const drift = C < 0.03 ? 0 : clamp(toBlue, -14 * D2R, 14 * D2R); // shades turn a touch bluer as they deepen, warmer as they lighten
      const levels = [L1];
      for (let k = 1; k <= nUp; k++) levels.push(L1 + upSpan * k / nUp);
      for (let k = 1; k <= nDown; k++) levels.push(L1 - downSpan * k / nDown);
      colors = fixPalette(levels.map(l => okHex(l, C, H + drift * clamp((L1 - l) / 0.3, -1, 1))), mode, true, true);
      // the order that keeps the smallest gap between neighbours as large as possible (your colour stays first)
      const lab = hex => { const [a, c, h] = toOklch(hex); return [a, c * Math.cos(h), c * Math.sin(h)]; };
      const dist = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
      let best = null, bestMin = -1;
      const rest = colors.slice(1);
      const walk = (order, left) => {
        if (!left.length) { const seq = [colors[0], ...order]; let m = Infinity; for (let q = 1; q < seq.length; q++) m = Math.min(m, dist(seq[q - 1], seq[q])); if (m > bestMin) { bestMin = m; best = seq; } return; }
        left.forEach((c, q) => walk(order.concat(c), left.filter((_, w) => w !== q)));
      };
      walk([], rest);
      colors = best;
    } else colors = fixPalette(hues.map(d => okHex(L, Cb, H + d * D2R)), mode, true);
    colors[0] = fixPalette([seed], mode, true)[0]; // the colour you pasted stays first, only nudged if its label would be hard to read
    return { id: 'seed-' + key, name, text: mode, seed, colors };
  });
}
function parseColor(s) {
  s = String(s == null ? '' : s).trim().toLowerCase();
  let m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map(c => c + c).join(''); return '#' + h.slice(0, 6); }
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(s);
  return m && [m[1], m[2], m[3]].every(v => +v <= 255) ? rgbToHex([+m[1], +m[2], +m[3]]) : null;
}
const validPalette = p => !!(p && Array.isArray(p.colors) && p.colors.length > 0 && p.colors.length <= 16 && p.colors.every(c => /^#[0-9a-f]{6}$/i.test(c)));

const vivid = [250, 305, 350, 40, 95, 150, 200].map(h => okHex(0.55, 0.16, h * D2R));
const PRESETS = [
  { id: 'indigo', name: 'Indigo bloom', text: 'light', colors: ['#4f46e5', '#7c3aed', '#a855f7', '#d946ef', '#ec4899'] },
  { id: 'ocean', name: 'Ocean', text: 'light', colors: ['#1d4ed8', '#0369a1', '#0e7490', '#0f766e', '#4f46e5'] },
  { id: 'forest', name: 'Forest', text: 'light', colors: ['#15803d', '#3f6212', '#0f766e', '#4d7c0f', '#166534'] },
  { id: 'sunset', name: 'Sunset', text: 'light', colors: ['#c2410c', '#dc2626', '#e11d48', '#be185d', '#a21caf'] },
  { id: 'berry', name: 'Berry', text: 'light', colors: ['#7e22ce', '#a21caf', '#be185d', '#6d28d9', '#9d174d'] },
  { id: 'earth', name: 'Earth', text: 'light', colors: ['#92400e', '#4d7c0f', '#a16207', '#0f766e', '#9f1239'] },
  { id: 'corporate', name: 'Corporate', text: 'light', colors: ['#1e3a8a', '#0f766e', '#374151', '#7c2d12', '#4338ca'] },
  { id: 'slate', name: 'Slate', text: 'light', loose: true, colors: ['#1e293b', '#334155', '#475569', '#64748b', '#0f172a'] },
  { id: 'vivid', name: 'Vivid', text: 'light', colors: vivid },
  { id: 'pastel', name: 'Pastel', text: 'dark', colors: ['#c4b5fd', '#fbcfe8', '#a7f3d0', '#fde68a', '#bae6fd'] },
  { id: 'candy', name: 'Candy', text: 'dark', colors: ['#fda4af', '#fdba74', '#fde047', '#86efac', '#7dd3fc', '#c4b5fd'] },
].map(p => Object.assign({}, p, { colors: fixPalette(p.colors, p.text, false, p.loose) }));
const paletteOf = S => (validPalette(S && S.palette) ? S.palette : PRESETS[0]);
/** which palette slot a row uses: its own choice, else its parent's, else its area's turn */
function colorIndexOf(info, n) { // a palette slot (number) or, if set by hand, any colour (a '#rrggbb' string)
  for (let q = n; q; q = q.parent >= 0 ? info[q.parent] : null) if (q.row.color != null) return q.row.color;
  return null; // nothing chosen by hand: the palette decides
}
/**
 * The colour a row is drawn in. Bars and areas take the palette in order, starting from its first colour — a milestone never
 * uses up a turn. Every milestone shares one colour, the last in the palette (so bars cycle through the others).
 */
function rowBaseColor(info, n, palette) {
  const c = colorIndexOf(info, n);
  if (typeof c === 'string') return c;
  if (c != null) return palette[c % palette.length];
  if (n.milestone) return palette[palette.length - 1];
  const bars = palette.length >= 3 ? palette.length - 1 : palette.length;
  return palette[n.rootIdx % bars];
}

// ---------------------------------------------------------------- canvas
// The chart is drawn at 96 px per inch, so sizes are real: a 16px label is 12pt on the slide or page it ends up on.
const PX_PER_IN = 96;
const CANVASES = [
  { id: 'slide169', name: 'Slide 16:9', w: 13.333, h: 7.5 },
  { id: 'slide43', name: 'Slide 4:3', w: 10, h: 7.5 },
  { id: 'a4l', name: 'A4 landscape', w: 11.693, h: 8.268 },
  { id: 'a4p', name: 'A4 portrait', w: 8.268, h: 11.693 },
  { id: 'letterl', name: 'Letter landscape', w: 11, h: 8.5 },
  { id: 'letterp', name: 'Letter portrait', w: 8.5, h: 11 },
  { id: 'square', name: 'Square', w: 8, h: 8 },
];
function canvasOf(S) {
  const c = CANVASES.find(c => c.id === S.canvas);
  if (c) return { id: c.id, name: c.name, w: c.w, h: c.h };
  return { id: 'custom', name: 'Custom', w: clamp(+S.canvasW || 13.333, 3, 40), h: clamp(+S.canvasH || 7.5, 2, 40) };
}

// ---------------------------------------------------------------- model
const DEFAULT_SETTINGS = {
  title: 'Project plan', showTitle: true, canvas: 'slide169', canvasW: 13.333, canvasH: 7.5, fit: 'content', textAuto: true, textPt: 12, titleScale: 1, overflow: 'outside', wrapNames: false, msAlign: 'auto',
  taskLabels: 'left', areaLabels: 'row', barText: 'auto', pack: false, scale: 'weeks', sprintWeeks: 2, datePos: 'top', dateMode: 'calendar',
  deps: false, assignees: false, assigneeLevel: 'tasks', assigneeAreas: true, assigneePos: 'under',
  progress: false, todayLine: false, todayDate: null, todayLabel: 'Today', markerLabelOn: true, markerStyle: 'solid', markerWidth: 2, markerColor: null, msLines: true,
  rangeMode: 'auto', rangeStart: null, rangeEnd: null, periodNames: true,
  palette: PRESETS[0], bg: '#ffffff', bgTransparent: false, textMode: 'auto',
  font: 'Inter', corners: 'rounded', density: 'auto', v: 2, gridCells: true, gridMonths: true, assigneeAvatar: true, progressStyle: 'pale', stripes: false, weekends: true,
};

function newRow(p) {
  return Object.assign({ id: uid(), level: 1, name: '', type: 'task', start: todayDay(), end: todayDay() + 4, progress: 0, assignee: '', deps: [] }, p);
}

/** Make levels valid: first row is level 0, no row is more than one level deeper than the one above. */
function normalizeLevels(rows) {
  let prev = -1;
  for (const r of rows) {
    r.level = clamp(Math.round(r.level) || 0, 0, Math.min(2, prev + 1));
    prev = r.level;
  }
  return rows;
}

/** Per-row derived info: children, rolled-up dates and progress, top-level index. */
function derive(rows) {
  const info = rows.map((row, i) => ({ row, i, level: row.level, kids: [], parent: -1, root: i, start: row.start, end: row.end, progress: row.progress == null ? null : row.progress || 0 })); // null = progress isn't tracked for this bar
  const stack = [];
  let rootCount = -1;
  info.forEach(n => {
    while (stack.length && stack[stack.length - 1].level >= n.level) stack.pop();
    if (stack.length) { n.parent = stack[stack.length - 1].i; stack[stack.length - 1].kids.push(n.i); }
    const isMilestone = n.row.type === 'milestone' && !(info[n.i + 1] && info[n.i + 1].level > n.level);
    if (n.level === 0 && !isMilestone) rootCount++; // a top-level milestone doesn't take a turn in the palette
    n.rootIdx = Math.max(0, rootCount);
    stack.push(n);
  });
  for (let i = info.length - 1; i >= 0; i--) {
    const n = info[i];
    n.hasKids = n.kids.length > 0;
    n.milestone = !n.hasKids && n.row.type === 'milestone';
    if (n.milestone) { n.end = n.start; n.progress = null; }
    if (n.hasKids) {
      let s = Infinity, e = -Infinity, w = 0, pw = 0;
      n.kids.forEach(k => {
        const c = info[k];
        s = Math.min(s, c.start); e = Math.max(e, c.end);
        if (!c.milestone && c.progress != null) { const d = c.weight || (c.end - c.start + 1); w += d; pw += d * c.progress; }
      });
      n.start = s; n.end = e; n.weight = w; n.progress = w ? pw / w : null;
    }
    if (n.end < n.start) n.end = n.start;
  }
  return info;
}
/** index range [i, j) of a row and all its descendants */
function blockEnd(rows, i) {
  let j = i + 1;
  while (j < rows.length && rows[j].level > rows[i].level) j++;
  return j;
}

// ---------------------------------------------------------------- import parsing
const MONTH_KEYS = MONTHS.map(m => m.toLowerCase());
function monthIndex(s) { return MONTH_KEYS.indexOf(String(s).slice(0, 3).toLowerCase()); }
function fixYear(y) { y = +y; return y < 100 ? 2000 + y : y; }

function parseDate(s, dmy) {
  s = String(s == null ? '' : s).trim();
  if (!s || s.length > 30) return null;
  const cy = new Date().getFullYear();
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s))) return validDay(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})(?: .*)?$/.exec(s)) || (m = /^(\d{1,2})(\/)(\d{1,2})$/.exec(s))) {
    const a = +m[1], b = +m[3], y = m[4] ? fixYear(m[4]) : cy;
    return (dmy || a > 12) && b <= 12 ? validDay(y, b, a) : validDay(y, a, b);
  }
  if ((m = /^(?:[A-Za-z]{3,9},? )?(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9})\.?,?(?:[ -](\d{2}|\d{4}))?$/.exec(s)) && monthIndex(m[2]) >= 0) return validDay(m[3] ? fixYear(m[3]) : cy, monthIndex(m[2]) + 1, +m[1]);
  if ((m = /^(?:[A-Za-z]{3,9},? )?([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(s)) && monthIndex(m[1]) >= 0) return validDay(m[3] ? +m[3] : cy, monthIndex(m[1]) + 1, +m[2]);
  return null;
}
function validDay(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return toDay(y, m - 1, d);
}
function parseDuration(s) {
  const m = /^(\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?|mo|mos|months?)$/i.exec(String(s).trim());
  if (!m) return null;
  const u = m[2][0].toLowerCase();
  return Math.max(1, Math.round(+m[1] * (u === 'd' ? 1 : u === 'w' ? 7 : 30)));
}
function parsePercent(s) {
  const m = /^(\d{1,3}(?:\.\d+)?)\s*%$/.exec(String(s).trim());
  return m ? clamp(Math.round(+m[1]), 0, 100) : null;
}
function splitCsv(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && !cur.trim()) q = true;
    else if (c === d) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const HEADER_PATTERNS = [
  ['subtask', /^sub[- ]?(task|item)s?( name)?$/i],
  ['area', /^(area|phase|group|category|stage|workstream|work stream|epic|section|track|theme)s?( name)?$/i],
  ['name', /^(task|tasks|name|title|activity|activities|item|description|deliverable|work ?item|task ?name|summary|what)$/i],
  ['start', /^(start|starts|begin|from|kick-?off)( date| on)?$|^date$/i],
  ['end', /^(end|ends|finish|due|until|to|deadline|complete by)( date| on)?$/i],
  ['duration', /^(duration|days|length|effort|estimate)( \(?(days|d|weeks)\)?)?$/i],
  ['assignee', /^(assignee|assigned( to)?|owner|who|resource|responsible|lead|person|team)s?$/i],
  ['progress', /^(progress|%|% ?(complete|done)|percent( complete)?|complete|completion|done)$/i],
  ['type', /^(type|kind|milestone\??)$/i],
  ['wbs', /^(wbs|#|no\.?|outline( number)?)$/i],
  ['level', /^(level|indent|depth|outline level)$/i],
  ['deps', /^(depends( on)?|dependenc(y|ies)|predecessors?|after|blocked by)$/i],
];
function headerKey(cell) {
  const c = String(cell || '').trim();
  for (const [k, re] of HEADER_PATTERNS) if (re.test(c)) return k;
  return null;
}
const MILESTONE_RE = /\b(milestone|kick[- ]?off|go[- ]?live|sign[- ]?off|deadline|demo day)\b/i;
const BULLET_RE = /^([-*+•◦▪▫‣⁃·–—○●■□➤➔→✓✔☐☑]|\(?\d+(?:\.\d+)*[.)]|\d+(?:\.\d+)+|\(?[a-zA-Z][.)])\s+/;

/** Turn pasted text into lines of { w: indent width, cells: [...] , hints }. */
function textToLines(text) {
  let raw = String(text).replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  // markdown tables
  if (raw.filter(l => /^\s*\|.*\|\s*$/.test(l)).length >= raw.length * 0.6) {
    raw = raw.filter(l => !/^\s*\|?[\s:|-]+\|?\s*$/.test(l)).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim()).join('\t'));
  }
  const inner = l => l.replace(/^\s+/, '');
  let delim = null, always = true;
  const typed = c => parseDate(c) != null || parseDuration(c) != null || parsePercent(c) != null;
  if (raw.some(l => inner(l).includes('\t'))) delim = '\t';
  else {
    for (const d of [',', ';', '|']) {
      const withD = raw.filter(l => inner(l).includes(d));
      if (!withD.length) continue;
      const header = splitCsv(inner(raw[0]), d).filter(headerKey).length >= 2;
      if (header || withD.some(l => splitCsv(inner(l), d).slice(1).some(typed))) { delim = d; always = header || withD.length >= raw.length * 0.8; break; }
    }
  }
  return raw.map(l => {
    const lead = /^[\t  ]*/.exec(l)[0];
    let w = 0;
    for (const ch of lead) w += ch === '\t' ? 4 : 1;
    let body = l.slice(lead.length);
    const o = { w, cells: [], bullet: null, numDepth: null, head: null, done: false, colon: false };
    let m;
    if ((m = /^(#{1,6})\s+/.exec(body))) { o.head = m[1].length; body = body.slice(m[0].length); }
    else if ((m = BULLET_RE.exec(body))) {
      const tok = m[1];
      // "1.5 weeks" or "A. Smith" style false positives are rare; a date-like token is not a bullet
      if (!(delim && parseDate(tok) != null)) {
        body = body.slice(m[0].length);
        if (/^\(?\d/.test(tok)) { o.bullet = '#'; o.numDepth = tok.replace(/[().]+$/g, '').replace(/^\(/, '').split('.').length - 1; }
        else if (/^\(?[a-zA-Z]/.test(tok)) o.bullet = 'a';
        else o.bullet = tok;
      }
    }
    if ((m = /^\[([ xX]?)\]\s+/.exec(body))) { o.done = /x/i.test(m[1]); body = body.slice(m[0].length); if (!o.bullet) o.bullet = '-'; }
    if (/^[☑✓✔]$/.test(o.bullet || '')) o.done = true;
    body = body.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
    o.cells = delim ? splitCsv(body, delim) : [body.trim()];
    // a stray comma in a plain task name is not a column break
    if (delim && !always && !o.cells.slice(1).some(typed)) o.cells = [body.trim()];
    if (/:$/.test(o.cells[0]) && o.cells.length === 1) { o.colon = true; o.cells[0] = o.cells[0].replace(/\s*:$/, ''); }
    return o;
  }).filter(o => o.cells.some(c => c));
}

/** Assign hierarchy levels to free-form lines using every hint we have. */
function assignLevels(lines) {
  const anyIndent = lines.some(l => l.w !== lines[0].w);
  const multiNum = lines.some(l => l.numDepth > 0);
  const anyHead = lines.some(l => l.head);
  const minHead = Math.min(...lines.filter(l => l.head).map(l => l.head), 9);
  const glyphs = [];
  lines.forEach(l => { if (l.bullet && l.bullet !== '#' && !glyphs.includes(l.bullet)) glyphs.push(l.bullet); });
  const mixedBullets = !anyIndent && !multiNum && lines.some(l => l.bullet) && lines.some(l => !l.bullet && !l.head);
  const stack = [];
  let headBase = 0, lastNum = 0;
  lines.forEach(l => {
    let lv;
    if (l.head) { lv = l.head - minHead; headBase = lv + 1; stack.length = 0; l.level = lv; return; }
    if (multiNum && l.numDepth != null) { lv = l.numDepth; lastNum = lv; }
    else if (multiNum) lv = lastNum + 1;
    else if (anyIndent) {
      while (stack.length && stack[stack.length - 1] > l.w) stack.pop();
      if (!stack.length || stack[stack.length - 1] < l.w) stack.push(l.w);
      lv = stack.length - 1;
    } else if (mixedBullets) lv = l.bullet ? 1 + Math.max(0, glyphs.indexOf(l.bullet)) : 0;
    else if (glyphs.length > 1) lv = glyphs.indexOf(l.bullet);
    else lv = 0;
    l.level = (anyHead ? headBase : 0) + Math.max(0, lv);
  });
  // "Heading:" lines with no other structure become parents of what follows
  if (!anyIndent && !multiNum && !anyHead && !mixedBullets && glyphs.length < 2 && lines.some(l => l.colon)) {
    let seen = false;
    lines.forEach(l => { if (l.colon) { l.level = 0; seen = true; } else l.level = seen ? 1 : 0; });
  }
}

/**
 * Parse pasted text or a sheet (array of row arrays) into chart rows.
 * Detects indentation (tabs, spaces, bullets, numbering, headings, leading empty cells),
 * column separators, header rows, dates, durations, percentages and owners.
 */
function parseImport(input) {
  let lines;
  if (Array.isArray(input)) {
    lines = input.map(r => {
      const cells = (r || []).map(c => String(c == null ? '' : c).trim());
      let lead = 0;
      while (lead < cells.length && !cells[lead]) lead++;
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      return { w: lead * 4, lead, all: cells, cells: cells.slice(lead), bullet: null, numDepth: null, head: null };
    }).filter(l => l.cells.length);
  } else {
    lines = textToLines(input);
    lines.forEach(l => { l.all = l.cells; });
  }
  if (!lines.length) return [];

  // day/month order
  let dmy = !/^en-(US|CA|PH)/.test((typeof navigator !== 'undefined' && navigator.language) || 'en-GB'), decided = false;
  lines.forEach(l => l.all.forEach(c => {
    const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/.exec(c);
    if (m && !decided) { if (+m[1] > 12) { dmy = true; decided = true; } else if (+m[2] > 12) { dmy = false; decided = true; } }
  }));

  const items = [];
  const first = lines[0];
  const keys = (first.all || []).map(headerKey);
  const isHeader = keys.filter(Boolean).length >= 2 || (keys.filter(Boolean).length === 1 && first.all.length === 1 && lines.length > 1 && false);

  if (isHeader) {
    const col = {};
    keys.forEach((k, i) => { if (k && col[k] == null) col[k] = i; });
    if (col.name == null) { // first unmapped column is the name
      const i = keys.findIndex(k => !k);
      if (i >= 0) col.name = i; else if (col.subtask != null) { col.name = col.subtask; delete col.subtask; }
    }
    const hier = [col.area, col.name, col.subtask].filter(c => c != null);
    const cur = [];
    lines.slice(1).forEach(l => {
      const get = k => (col[k] == null ? '' : (l.all[col[k]] || '').trim());
      const present = hier.map(c => (l.all[c] || '').trim());
      let deepest = -1;
      present.forEach((v, i) => { if (v) deepest = i; });
      if (deepest < 0) return;
      let base = 0;
      const nameRaw = present[deepest];
      // extra nesting hints inside a single name column
      let extra = 0;
      if (col.level != null && get('level') !== '') extra = Math.max(0, (parseInt(get('level'), 10) || 1) - 1);
      else if (col.wbs != null && /^\d+(\.\d+)*\.?$/.test(get('wbs'))) extra = get('wbs').replace(/\.$/, '').split('.').length - 1;
      else if (hier.length === 1) extra = Math.floor(((/^[\s ]*/.exec(l.all[col.name] || '')[0].length) + (l.lead && col.name === 0 ? 0 : 0)) / 2);
      present.forEach((v, i) => {
        if (!v || i >= deepest) return;
        if (cur[i] !== v) { items.push({ level: i, name: v }); cur[i] = v; cur.length = i + 1; }
      });
      base = deepest + (deepest === hier.length - 1 || hier.length === 1 ? extra : 0);
      cur[deepest] = nameRaw; cur.length = deepest + 1;
      const it = { level: base, name: nameRaw.trim() };
      const s = parseDate(get('start'), dmy), e = parseDate(get('end'), dmy);
      if (s != null) it.start = s;
      if (e != null) it.end = e;
      const du = parseDuration(get('duration')) || (/^\d+(\.\d+)?$/.test(get('duration')) ? Math.max(1, Math.round(+get('duration'))) : null);
      if (du) it.dur = du;
      const pr = get('progress');
      if (pr !== '') { const p = parsePercent(pr); const n = parseFloat(pr); it.progress = p != null ? p : isNaN(n) ? (/^(done|complete|yes)/i.test(pr) ? 100 : 0) : clamp(Math.round(n <= 1 && /\./.test(pr) ? n * 100 : n), 0, 100); }
      if (get('assignee')) it.assignee = get('assignee');
      if (/milestone|^(yes|y|true|x)$/i.test(get('type'))) it.milestone = true;
      items.push(it);
    });
  } else {
    assignLevels(lines);
    lines.forEach(l => {
      const it = { level: l.level, name: '' };
      const dates = [];
      l.cells.forEach(c => {
        if (!c) return;
        const d = parseDate(c, dmy), p = parsePercent(c), du = parseDuration(c);
        // "3 Mar - 14 Mar" style ranges in one cell
        const rng = d == null ? /^(.+?)\s*(?:–|—|->|→| - | to )\s*(.+)$/.exec(c) : null;
        const r1 = rng && parseDate(rng[1], dmy), r2 = rng && parseDate(rng[2], dmy);
        if (d != null) dates.push(d);
        else if (r1 != null && r2 != null) dates.push(r1, r2);
        else if (p != null) it.progress = p;
        else if (du != null && it.name) it.dur = du;
        else if (/^milestone$/i.test(c)) it.milestone = true;
        else if (!it.name) it.name = c;
        else if (!it.assignee && c.length <= 40) it.assignee = c;
      });
      if (!it.name) return;
      // trailing "(Owner)" / "@owner" / inline "- 5d"
      let m;
      if (!it.assignee && (m = /\s+@([\w.-]+(?: [A-Z][\w.-]*)?)$/.exec(it.name))) { it.assignee = m[1]; it.name = it.name.slice(0, m.index); }
      if (!it.dur && (m = /\s*[-–(,]\s*(\d+(?:\.\d+)?\s*(?:d|days?|w|wks?|weeks?|months?))\)?$/i.exec(it.name))) { it.dur = parseDuration(m[1]); it.name = it.name.slice(0, m.index); }
      if (l.done) it.progress = 100;
      if (dates.length) it.start = dates[0];
      if (dates.length > 1) it.end = dates[1];
      items.push(it);
    });
  }
  return scheduleItems(items);
}

/** Fill in missing dates so an undated list still becomes a sensible waterfall. */
function scheduleItems(items) {
  if (!items.length) return [];
  const minLevel = Math.min(...items.map(i => i.level));
  items.forEach(i => { i.level -= minLevel; });
  normalizeLevels(items);
  const anyRange = items.some(i => i.start != null && i.end != null);
  const known = items.filter(i => i.start != null).map(i => i.start);
  let cursor = known.length ? Math.min(...known) : mondayOf(todayDay());
  const nextWorkday = d => (dow(d) >= 5 ? d + (7 - dow(d)) : d);
  const rows = items.map((it, idx) => {
    const hasKids = idx + 1 < items.length && items[idx + 1].level > it.level;
    const r = newRow({ level: it.level, name: it.name, assignee: it.assignee || '', progress: it.progress || 0 });
    if (hasKids) return r;
    let ms = !!it.milestone;
    if (!ms && it.end == null && !it.dur && MILESTONE_RE.test(it.name)) ms = true;
    if (!ms && it.start != null && it.end == null && !it.dur && anyRange) ms = true;
    if (ms) {
      r.type = 'milestone';
      r.start = r.end = it.start != null ? it.start : it.end != null ? it.end : Math.max(cursor - 1, 0);
      if (it.start == null && idx === 0) r.start = r.end = cursor;
      return r;
    }
    let s = it.start, e = it.end;
    if (s == null && e != null) s = e - (it.dur || 5) + 1;
    if (s == null) s = nextWorkday(cursor);
    if (e == null) e = it.dur ? s + it.dur - 1 : s + (4 - Math.min(dow(s), 4));
    if (e < s) [s, e] = [e, s];
    r.start = s; r.end = e;
    cursor = Math.max(cursor, e + 1);
    return r;
  });
  rows.dated = known.length > 0 || items.some(i => i.end != null);
  return rows;
}

// ---------------------------------------------------------------- text measuring
let _mctx = null;
function measureText(text, size, weight, font) {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  _mctx.font = `${weight} ${size}px "${font}", system-ui, sans-serif`;
  return _mctx.measureText(text).width;
}
function fitText(text, maxW, size, weight, font) {
  if (measureText(text, size, weight, font) <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measureText(text.slice(0, mid).trimEnd() + '…', size, weight, font) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo ? text.slice(0, lo).trimEnd() + '…' : '';
}
const initials = name => name.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

// ---------------------------------------------------------------- time scale
function unitCells(scale, sprintWeeks, a, b, anchor, rel) {
  // returns { start (aligned), cells: [[s, e), ...] } covering [a, b]
  const cells = [];
  if (scale === 'months' || scale === 'quarters') {
    const step = scale === 'months' ? 1 : 3;
    let [y, m, d] = ymd(rel && anchor != null ? Math.min(anchor, a) : a);
    if (rel) d = Math.min(d, 28); else { d = 1; m -= m % step; }
    let s = toDay(y, m, d);
    while (s <= b) { m += step; const e = toDay(y, m, d); cells.push([s, e]); s = e; }
  } else {
    const len = scale === 'days' ? 1 : scale === 'weeks' ? 7 : 7 * sprintWeeks;
    let s = scale === 'days' ? a : mondayOf(a);
    if (scale === 'sprints' && anchor != null) { const base = mondayOf(anchor); s = base + Math.floor((a - base) / len) * len; }
    while (s <= b) { cells.push([s, s + len]); s += len; }
  }
  return cells;
}

// ---------------------------------------------------------------- scene
/**
 * Build a renderer-independent list of drawing primitives for the chart.
 * Items: rect | line | text | diamond | poly. Items flagged ui/hit are only for the interactive view.
 */
function buildScene(state, opts) {
  opts = opts || {};
  const S = state.settings, rows = state.rows, font = S.font;
  const info = derive(rows);
  // visual rows: normally one per item; when packing, sibling tasks that don't overlap in time share a row
  const pack = !!S.pack;
  let vrows = 0, run = null;
  // rough days-per-pixel, so a short bar or a milestone keeps enough of the row free for its name
  const spanDays = info.length ? Math.max(...info.map(n => n.end)) - Math.min(...info.map(n => n.start)) + 1 : 1;
  const dpp = spanDays / (canvasOf(S).w * PX_PER_IN * 0.8);
  const holdsUntil = n => { const need = ((n.row.name || 'Untitled').length * 8.8 + 34) * dpp; return n.milestone ? n.end + need : Math.max(n.end, n.start + need); };
  info.forEach(n => {
    n.fit = null;
    const mark = tr => { tr.end = n.milestone ? holdsUntil(n) : n.end; tr.hold = holdsUntil(n); };
    if (pack && !n.hasKids && run && run.parent === n.parent && run.level === n.level) {
      // first choice: continue the row of the task listed just before it; otherwise the first row with room
      let t = run.tr[run.last].end < n.start ? run.last : run.tr.findIndex(x => x.hold < n.start);
      if (t < 0) { t = run.tr.length; run.tr.push({ row: vrows++ }); }
      mark(run.tr[t]); n.vrow = run.tr[t].row; run.last = t;
    } else {
      n.vrow = vrows++;
      run = pack && !n.hasKids ? { parent: n.parent, level: n.level, tr: [{ row: n.vrow }], last: 0 } : null;
      if (run) mark(run.tr[0]);
    }
  });
  const cv = canvasOf(S), W = Math.round(cv.w * PX_PER_IN);
  const fixedPx = S.fit === 'fixed' ? Math.round(cv.h * PX_PER_IN) : null; // a fixed canvas keeps its height; the rows are sized to fill it
  const pad = 40;
  const items = [];
  const M = (t, size, weight) => measureText(t, size, weight, font);

  // colours
  const lightText = S.textMode === 'light' || (S.textMode === 'auto' && !S.bgTransparent && luminance(S.bg) < 0.22);
  const surface = S.bgTransparent ? (lightText ? '#111827' : '#ffffff') : S.bg;
  const text = lightText ? '#f8fafc' : '#0f172a';
  const muted = mix(text, surface, 0.42);
  const faint = mix(text, surface, 0.62);
  const grid = mix(text, surface, 0.9), gridStrong = mix(text, surface, 0.8), stripe = mix(text, surface, 0.96);
  const pal = paletteOf(S), palette = pal.colors;
  const baseOf = n => rowBaseColor(info, n, palette);
  const hi = palette[0]; // the colour used for selection and drop highlights
  const accent = mix(palette[Math.min(1, palette.length - 1)], text, 0.12); // the date marker's automatic colour

  // metrics — sizes are px at 96 per inch, so text is in true points on the output
  const textPt = !S.textAuto && +S.textPt > 0 ? clamp(+S.textPt, 5, 48) : null;
  const fsOf = rh => (textPt ? Math.round(textPt * 96 / 72 * 2) / 2 : Math.round(clamp(rh * 0.42, 14.5, 20) * 2) / 2);
  const tierOf = f => Math.round(26 * f / 14);
  const avOn = S.assigneeAvatar !== false; // the little initials circle beside an owner's name
  const subLineOf = f => (S.assignees && S.assigneePos !== 'beside' && info.some(n => n.row.assignee) ? Math.round((avOn ? 18 : 14) * f / 14) : 0); // owners under the bars take a line of their own
  const titleOf = f => Math.round(30 * f / 14 * (+S.titleScale || 1));
  let rowH = 0;
  { // the baseline (Auto): size rows so the chart fills its canvas — few items get tall bars, long plans stay compact
    const grp = n => n.level === 0 && n.hasKids;
    const side = S.areaLabels === 'side' && info.some(grp);
    let gaps = 0;
    const used = new Set();
    info.forEach((n, i) => {
      if (i > 0 && (grp(n) || (side && n.level === 0 && info[i - 1].level > 0))) gaps += side ? 18 : 10;
      if (!(side && grp(n))) used.add(n.vrow);
    });
    const targetH = Math.round(cv.h * PX_PER_IN), maxRow = fixedPx ? 90 : 68, minRow = fixedPx ? 26 : 38;
    const tiers0 = S.dateMode !== 'relative' && S.periodNames !== false ? 2 : 1;
    let f = textPt ? fsOf(0) : 16; // the text size, header and owner lines all depend on the row height, so settle them together
    for (let it = 0; it < 4; it++) {
      const hh = tiers0 * tierOf(f) + 8;
      const fixedH = 2 * pad + (S.showTitle && S.title ? titleOf(f) + 26 : 0) + (S.todayLine ? Math.round(26 * f / 14) : 0) + (S.datePos !== 'bottom' ? hh : 0) + (S.datePos !== 'top' ? hh - 8 : 0) + 12 + gaps;
      rowH = clamp(Math.floor((targetH - fixedH) / Math.max(1, used.size)) - subLineOf(f), minRow, maxRow);
      f = fsOf(rowH);
    }
  }
  // Compact and Roomy are steps either side of that baseline, so they always sit in order around Auto whatever the plan or canvas
  rowH = Math.max(rowH, Math.ceil(fsOf(rowH) * 2.4)); // the baseline always fits its text — even on a canvas that can't hold the plan
  rowH = Math.round(clamp(rowH * ({ compact: 0.78, roomy: 1.3 }[S.density] || 1), 26, 120));
  const fs = fsOf(rowH);
  const kk = fs / 14; // whatever was sized for 14px text scales with it
  const subLine = subLineOf(fs), dd = Math.round(18 * kk), dU = Math.round(16 * kk), tlh = Math.round(20 * kk), hs1 = 13.5 * kk, hs2 = 12.5 * kk;
  rowH = Math.max(rowH, Math.ceil(fs * 2.2)); // and no row is too tight for its text
  const barH = Math.round(rowH * 0.64), subH = Math.round(rowH * 0.46);
  const msCap = Math.round(38 * 0.64); // milestone diamonds stop growing at their size in a regular row
  const barMid = rowH / 2; // bars sit in the top part of the row; the owner line, if any, goes beneath
  rowH += subLine;
  const radius = h => (S.corners === 'square' ? 2 : S.corners === 'pill' ? h / 2 : Math.min(7, h / 2));
  // room between a bar's edge and the name inside it: it grows with the text, and with how round the ends are (a pill's curve eats into the space)
  const padFor = h => Math.round(Math.max(10, fs * 0.62) + (S.corners === 'pill' ? radius(h) * 0.45 : S.corners === 'rounded' ? radius(h) * 0.25 : 0));
  const isGroup = n => n.level === 0 && n.hasKids;
  const left = S.taskLabels === 'left' && !pack; // task names in a column on the left, otherwise on the bars
  const lanes = S.areaLabels === 'side' && info.some(isGroup); // areas named down the side, spanning their rows

  // label columns: areas (when at the side), then tasks (when on the left)
  let labelW = 0, laneW = 0;
  const indentOf = n => (lanes ? Math.max(0, n.level - 1) : n.level) * 16;
  if (lanes) {
    info.forEach(n => { if (isGroup(n)) laneW = Math.max(laneW, M(n.row.name || 'Untitled', fs + 1, 700), S.assignees && S.assigneeAreas !== false && n.row.assignee ? M(n.row.assignee, fs - 1.5, 500) + (avOn ? Math.round(16 * kk) + 6 : 0) : 0); });
    laneW = clamp(laneW, 70, W * 0.2) + 28;
  }
  if (left) {
    info.forEach(n => { if (!(lanes && isGroup(n))) labelW = Math.max(labelW, indentOf(n) + M(n.row.name || 'Untitled', isGroup(n) ? fs + 1 : n.level === 2 ? fs - 1 : fs, isGroup(n) ? 700 : 500)); });
    labelW = clamp(labelW, 110, W * 0.27) + 22;
  }
  const x0 = pad + laneW + labelW, x1 = W - pad;

  // vertical layout
  let y = pad;
  if (S.showTitle && S.title) {
    const tsz = titleOf(fs);
    const tt = fitText(S.title, W - 2 * pad, tsz, 700, font);
    items.push({ t: 'text', x: pad, y: y + tsz * 0.53, text: tt, size: tsz, weight: 700, fill: text, anchor: 'start' });
    items.push({ t: 'rect', x: pad - 6, y: y - 6, w: M(tt, tsz, 700) + 12, h: tsz * 1.45, hit: true, role: 'title' });
    y += tsz + 26;
  }
  const lane = S.todayLine ? Math.round(26 * kk) : 0;
  const laneY = y;
  y += lane;
  const relative = S.dateMode === 'relative';
  const tierH = tierOf(fs);
  const showSegs = !relative && S.periodNames !== false; // the “December 2026” tier above the period labels
  const tiers = showSegs ? 2 : 1;
  const headH = tiers * tierH + 8;
  const showTop = S.datePos !== 'bottom', showBottom = S.datePos !== 'top';
  const headTopY = y;
  if (showTop) y += headH;
  const bodyY = y;
  y += 6;
  const rowY = {};
  info.forEach((n, i) => {
    n.h = rowH;
    if (rowY[n.vrow] != null) { n.y = rowY[n.vrow]; n.cy = n.y + barMid; return; } // shares a row with an earlier task
    if (i > 0 && (isGroup(n) || (lanes && n.level === 0 && info[i - 1].level > 0))) { y += lanes ? 18 : 10; n.sep = lanes; }
    n.y = rowY[n.vrow] = y; n.cy = y + barMid;
    if (lanes && isGroup(n)) { n.lane = true; return; } // no row of its own: its label spans the rows inside it
    y += rowH;
  });
  if (lanes) info.forEach(n => {
    if (!n.lane) return;
    n.h = Math.max(...info.slice(n.i + 1, blockEnd(rows, n.i)).map(c => c.y)) + rowH - n.y;
    n.cy = n.y + n.h / 2; n.dropCy = n.y - 4;
  });
  y += 6;
  const bodyEnd = y;
  const headBotY = y;
  if (showBottom) y += headH;
  const Hc = Math.round(y + pad - (showBottom ? 8 : 0)); // what the content needs
  const H = fixedPx ? Math.max(Hc, fixedPx) : Hc;

  // time range
  const todayD = S.todayDate != null ? S.todayDate : todayDay();
  let dMin = Infinity, dMax = -Infinity;
  info.forEach(n => { dMin = Math.min(dMin, n.start); dMax = Math.max(dMax, n.end); });
  if (!isFinite(dMin)) { dMin = mondayOf(todayDay()); dMax = dMin + 27; }
  const fixed = S.rangeMode === 'fixed' && S.rangeStart != null && S.rangeEnd != null && S.rangeEnd >= S.rangeStart;
  if (fixed && !info.length) { dMin = S.rangeStart; dMax = S.rangeEnd; }
  const anchor = fixed ? Math.min(S.rangeStart, dMin) : dMin;
  let rs, re, cells;
  const setRange = (a, b) => {
    cells = unitCells(S.scale, S.sprintWeeks, a, b, anchor, relative);
    rs = cells[0][0]; re = cells[cells.length - 1][1];
  };
  const clip = (a, b) => { rs = a; re = b; cells = cells.filter(c => c[1] > a && c[0] < b); cells[0][0] = a; cells[cells.length - 1][1] = b; };
  if (opts.range) { cells = unitCells(S.scale, S.sprintWeeks, opts.range[0], opts.range[1] - 1, anchor, relative); clip(opts.range[0], opts.range[1]); }
  else {
    let a = dMin, b = dMax;
    // a fixed timeline is kept as set; it only grows if an item is placed outside it
    if (fixed) { a = Math.min(a, S.rangeStart); b = Math.max(b, S.rangeEnd); }
    else if (S.todayLine) { a = Math.min(a, todayD); b = Math.max(b, todayD); }
    setRange(a, b);
    if (fixed) clip(a, b + 1);
  }
  let ppd = (x1 - x0) / (re - rs);
  const X = d => x0 + (d - rs) * ppd;
  // where a milestone sits within its day: the start of the day lines up with a bar that starts then, the end with a bar that finishes then
  // Auto: the end of the day if a task finishes then (a completion), else the start if one begins then (a kick-off), else the middle
  info.forEach(n => {
    if (!n.milestone) return;
    const fixedOff = { start: 0, middle: 0.5, end: 1 }[n.row.msAlign || S.msAlign]; // a milestone's own choice beats the chart's
    if (fixedOff != null) { n.msOff = fixedOff; return; }
    let ends = false, starts = false;
    info.forEach(o => { if (o !== n && !o.milestone && !o.hasKids) { if (o.end === n.start) ends = true; if (o.start === n.start) starts = true; } });
    n.msOff = ends ? 1 : starts ? 0 : 0.5;
  });
  const msX = n => X(n.start + n.msOff);

  // long names: what happens when a name doesn't fit its space (Design → Long names)
  const overflow = S.overflow === 'wrap' ? 'shrink' : (S.overflow || 'outside'); // what to do when a name still doesn't fit ("wrap" was once a choice here)
  const wrapOn = !!S.wrapNames || S.overflow === 'wrap';
  /** greedy two-line split at one size; `full` says whether both lines fit without cutting anything */
  const wrapAt = (name, maxW, sz, weight) => {
    const words = name.trim().split(/\s+/);
    if (words.length < 2) return null; // a single word can't be wrapped
    let l1 = '', wi = 0;
    while (wi < words.length) { const t = l1 ? l1 + ' ' + words[wi] : words[wi]; if (l1 && M(t, sz, weight) > maxW) break; l1 = t; wi++; }
    const rest = words.slice(wi).join(' ');
    return { l1, rest, full: !rest ? M(l1, sz, weight) <= maxW : M(l1, sz, weight) <= maxW && M(rest, sz, weight) <= maxW };
  };
  const twoLines = (w, maxW, sz, weight) => (w.rest ? [fitText(w.l1, maxW, sz, weight, font), fitText(w.rest, maxW, sz, weight, font)] : [fitText(w.l1, maxW, sz, weight, font)]);
  /** how a name sits in a space of width maxW: wrapped first if that's switched on, then shrunk / shortened as chosen. `full` = nothing was cut. */
  const labelFit = (name, maxW, size, weight, canWrap) => {
    if (M(name, size, weight) <= maxW) return { lines: [name], size, full: true };
    let w = null, ws = size;
    if (wrapOn && canWrap) { // two lines, in slightly smaller type so they fit the height
      ws = Math.round(size * 0.88 * 2) / 2;
      w = wrapAt(name, maxW, ws, weight);
      if (w && w.full) return { lines: twoLines(w, maxW, ws, weight), size: ws, full: true };
    }
    const min = Math.max(8, size * 0.62);
    if (overflow === 'shrink') { // smaller type, down to a floor, then shortened
      let s = w ? ws : size;
      while (s > min) {
        if (w) { const t = wrapAt(name, maxW, s, weight); if (t && t.full) return { lines: twoLines(t, maxW, s, weight), size: s, full: true }; } else if (M(name, s, weight) <= maxW) break;
        s -= 0.5;
      }
      s = Math.max(s, min);
      if (w) { const t = wrapAt(name, maxW, s, weight); return { lines: twoLines(t, maxW, s, weight), size: s, full: false }; }
      return { lines: [fitText(name, maxW, s, weight, font)], size: s, full: M(name, s, weight) <= maxW };
    }
    // truncate — and "move outside", which has nowhere to go here (bars decide that for themselves from `full`)
    return w ? { lines: twoLines(w, maxW, ws, weight), size: ws, full: false } : { lines: [fitText(name, maxW, size, weight, font)], size, full: false };
  };

  // what goes to the right of each bar (labels that don't fit, owners)
  const showAssignee = n => S.assignees && n.row.assignee && (isGroup(n) ? S.assigneeAreas !== false : (S.assigneeLevel === 'all' || (S.assigneeLevel === 'subtasks' ? n.level === 2 : n.level < 2)));
  const plan = () => {
    let over = 0;
    const room = {};
    if (pack) {
      const byRow = {};
      info.forEach(n => { (byRow[n.vrow] = byRow[n.vrow] || []).push(n); });
      Object.values(byRow).forEach(list => list.sort((a, b) => a.start - b.start).forEach((n, k) => {
        const nx = list[k + 1];
        room[n.row.id] = nx ? (nx.milestone ? msX(nx) - Math.min(barH, msCap) * 0.52 : X(nx.start)) - 8 : Infinity;
      }));
    }
    info.forEach(n => {
      const lim = pack ? room[n.row.id] : Infinity;
      n.fit = null; n.who = null; n.areaWho = null; n.lines = null; n.shrink = null;
      const size = n.level === 2 ? fs - 1 : fs;
      const h = n.milestone ? Math.min(n.level === 2 ? subH : barH, msCap) : n.level === 2 ? subH : barH;
      const bx = X(n.start), bw = Math.max(X(n.end + 1) - bx, 4);
      n.bx = bx; n.bw = bw; n.bh = h; n.inside = false; n.tail = [];
      let tx = n.milestone ? msX(n) + h * 0.5 + 8 : bx + bw + 8;
      const name = n.row.name || 'Untitled';
      if (n.lane) { n.tailEnd = bx; return; }
      if (isGroup(n)) {
        n.tailEnd = left ? bx + bw : Math.max(bx + bw, bx + M(name, fs + 1, 700));
        if (showAssignee(n)) {
          const who = n.row.assignee, cs = fs - 1.5;
          if (!left) { // heading above its line: the owner follows the name
            const x = bx + M(name, fs + 1, 700) + 14;
            n.areaWho = { x, text: who, size: cs };
            n.tailEnd = Math.max(n.tailEnd, x + (avOn ? dd + 6 : 0) + M(who, cs, 500));
          } else if (subLine) { // under its summary bar, like a task
            const ws = Math.max(10, fs - 2.5);
            n.who = { x: bx + 2, text: who, size: ws, area: true };
            n.tailEnd = Math.max(n.tailEnd, bx + 2 + (avOn ? dU + 6 : 0) + M(who, ws, 500));
          } else {
            n.areaWho = { x: bx + bw + 8, text: who, size: cs };
            n.tailEnd = bx + bw + 8 + (avOn ? dd + 6 : 0) + M(who, cs, 500);
          }
        }
        over = Math.max(over, n.tailEnd - x1);
        return;
      }
      if (!left) {
        const w = M(name, size, n.milestone ? 600 : 500);
        const ip = padFor(h); n.ip = ip;
        // keep the name on the bar (wrapped, shrunk or shortened) — or, if "move outside" is chosen and it can't be shown whole, put it beside the bar
        const lf = !n.milestone && w + 2 * ip > bw && (overflow !== 'outside' || wrapOn) ? labelFit(name, Math.max(0, bw - 2 * ip), size, 500, h >= size * 2 + 4) : null;
        if (!n.milestone && w + 2 * ip <= bw) n.inside = true;
        else if (lf && (overflow !== 'outside' || lf.full)) {
          n.inside = true;
          n.lines = lf.lines; n.shrink = lf.size !== size ? lf.size : null;
        } else if (n.milestone || tx + w <= lim) { n.tail.push({ k: 'name', x: tx, w }); tx += w + 12; }
        else { n.inside = true; n.fit = Math.max(0, bw - 1.6 * ip); } // no room beside it: shorten the name to fit the bar
      } else if (n.milestone && !relative) {
        const t = shortDate(n.start), w = M(t, size - 1.5, 500);
        n.tail.push({ k: 'date', x: tx, w, text: t }); tx += w + 12;
      }
      n.who = null;
      if (subLine && showAssignee(n)) {
        const ws = Math.max(10, size - 2.5), wx = n.milestone ? msX(n) - h * 0.5 : bx + 2;
        const av = avOn ? dU + 6 : 0, maxW = Math.min(pack ? lim - wx : Infinity, fixed ? x1 - wx : Infinity) - av;
        const t = isFinite(maxW) ? fitText(n.row.assignee, Math.max(0, maxW), ws, 500, font) : n.row.assignee;
        if (t) { n.who = { x: wx, text: t, size: ws }; over = Math.max(over, wx + av + M(t, ws, 500) - x1); }
      }
      if (!subLine && showAssignee(n) && tx + M(n.row.assignee, size - 1.5, 500) + (avOn ? dd + 6 : 0) <= lim) {
        const w = M(n.row.assignee, size - 1.5, 500);
        n.tail.push({ k: 'who', x: tx, w: w + (avOn ? dd + 6 : 0) }); tx += w + (avOn ? dd + 6 : 0) + 10;
      }
      n.tailEnd = n.tail.length ? tx - 10 : bx + bw;
      n.tailStart = n.milestone ? msX(n) - h * 0.52 - 4 : bx;
      if (fixed && n.tail.length && n.tailEnd > x1) { // no room on a fixed timeline: put the text before the bar instead
        const shift = n.tailStart - 6 - (n.tailEnd - n.tail[0].x) - n.tail[0].x;
        n.tail.forEach(t => { t.x += shift; });
        n.tailStart = n.tail[0].x - 2; n.tailEnd = bx + bw;
      }
      over = Math.max(over, n.tailEnd - x1);
    });
    return over;
  };
  let over = plan();
  for (let k = 0; k < 4 && over > 1 && !opts.range && !fixed; k++) {
    setRange(rs, re - 1 + Math.ceil((over + 4) / ppd));
    ppd = (x1 - x0) / (re - rs);
    over = plan();
  }

  // ---- background
  if (!S.bgTransparent) items.unshift({ t: 'rect', x: 0, y: 0, w: W, h: H, r: 0, fill: S.bg, role: 'bg' });

  // ---- stripes, weekends, grid
  if (S.stripes) info.filter((n, i) => !n.lane && info.findIndex(o => o.vrow === n.vrow) === i).forEach((n, i) => { if (i % 2 === 0) items.push({ t: 'rect', x: pad - 8, y: n.y, w: W - 2 * pad + 16, h: rowH, r: 4, fill: stripe }); });
  if (S.weekends && S.scale === 'days' && ppd >= 3) {
    for (let d = rs; d < re; d++) if (dow(d) === 5) items.push({ t: 'rect', x: X(d), y: bodyY, w: Math.min(2, re - d) * ppd, h: bodyEnd - bodyY, r: 0, fill: stripe });
  }
  // top tier segments
  const segs = [];
  if (!relative) {
    let [yy, mm] = ymd(rs);
    const byYear = S.scale === 'months' || S.scale === 'quarters';
    let s = byYear ? toDay(yy, 0, 1) : toDay(yy, mm, 1);
    while (s < re) {
      if (byYear) yy++; else mm++;
      const e = byYear ? toDay(yy, 0, 1) : toDay(yy, mm, 1);
      const [sy, sm] = ymd(s);
      segs.push({ s: Math.max(s, rs), e: Math.min(e, re), label: byYear ? String(sy) : MONTHS_FULL[sm] + ' ' + sy, short: byYear ? String(sy) : MONTHS[sm], real: s >= rs });
      s = e;
    }
  }
  const cellW = Math.max(...cells.map(c => c[1] - c[0])) * ppd;
  if (S.gridCells !== false) { // a line at each period (day, week, sprint…)
    const every = cellW < 7 ? Math.ceil(7 / cellW) : 1;
    const weekly = S.scale === 'days' && cellW < 16;
    cells.forEach((c, i) => { if (i > 0 && (weekly ? dow(c[0]) === 0 : i % every === 0)) items.push({ t: 'line', x1: X(c[0]), y1: bodyY, x2: X(c[0]), y2: bodyEnd, stroke: grid, sw: 1 }); });
  }
  if (S.gridMonths !== false) { // a stronger line where each month (or year, on a monthly scale) begins
    segs.forEach(sg => { if (sg.real && sg.s > rs) items.push({ t: 'line', x1: X(sg.s), y1: bodyY, x2: X(sg.s), y2: bodyEnd, stroke: gridStrong, sw: 1 }); });
  }

  // ---- headers
  const unitLabel = (c, i) => {
    const [, m, d] = ymd(c[0]);
    if (relative) {
      const n = i + 1;
      const long = { days: 'Day ', weeks: 'Week ', sprints: 'Sprint ', months: 'Month ', quarters: 'Quarter ' }[S.scale] + n;
      const short = { days: 'D', weeks: 'W', sprints: 'S', months: 'M', quarters: 'Q' }[S.scale] + n;
      return [long, short, String(n)];
    }
    if (S.scale === 'days') return showSegs ? [String(d)] : [d + ' ' + MONTHS[m], String(d)];
    if (S.scale === 'weeks') return [d + ' ' + MONTHS[m], String(d)];
    if (S.scale === 'sprints') return ['Sprint ' + (i + 1), 'S' + (i + 1), String(i + 1)];
    if (S.scale === 'months') return [MONTHS[m], MONTHS[m][0]];
    return ['Q' + (m / 3 + 1)];
  };
  // sprint/relative numbering starts at the cell containing the first task
  const firstCell = Math.max(0, cells.findIndex(c => c[1] > anchor));
  const drawHeader = (top, atBottom) => {
    const unitY = atBottom ? top + 8 + tierH / 2 : top + (tiers - 1) * tierH + tierH / 2;
    const segY = atBottom ? top + 8 + tierH + tierH / 2 : top + tierH / 2;
    const lineY = atBottom ? top : top + headH - 1;
    items.push({ t: 'line', x1: x0, y1: lineY, x2: x1, y2: lineY, stroke: gridStrong, sw: 1 });
    items.push({ t: 'rect', x: x0, y: top, w: x1 - x0, h: headH, hit: true, role: 'timeline' });
    if (showSegs) segs.forEach(sg => {
      const w = X(sg.e) - X(sg.s) - 10;
      const label = M(sg.label, hs1, 700) <= w ? sg.label : M(sg.short, hs1, 700) <= w ? sg.short : '';
      if (label) items.push({ t: 'text', x: X(sg.s) + (sg.real && sg.s > rs ? 6 : 0), y: segY, text: label, size: hs1, weight: 700, fill: text, anchor: 'start' });
    });
    const variants = cells.map((c, i) => unitLabel(c, i - firstCell));
    let vi = 0;
    const nVar = variants[0].length;
    const maxW = v => Math.max(...variants.map(l => M(l[Math.min(v, l.length - 1)], hs2, 500)));
    while (vi < nVar - 1 && maxW(vi) + 8 > cellW) vi++;
    const every = Math.max(1, Math.ceil((maxW(vi) + 8) / cellW));
    cells.forEach((c, i) => {
      if (every > 1 && (S.scale === 'days' && !relative ? dow(c[0]) !== 0 && every <= 7 : (i - firstCell) % every !== 0)) return;
      if (i < firstCell && (relative || S.scale === 'sprints')) return;
      const label = variants[i][Math.min(vi, variants[i].length - 1)];
      if (every === 1 && X(c[1]) - X(c[0]) < M(label, hs2, 500) + 4) return; // a clipped period at the edge with no room
      const cx = every > 1 ? X(c[0]) + 3 : (X(c[0]) + X(c[1])) / 2;
      items.push({ t: 'text', x: cx, y: unitY, text: variants[i][Math.min(vi, variants[i].length - 1)], size: hs2, weight: 500, fill: muted, anchor: every > 1 ? 'start' : 'middle' });
    });
  };
  if (showTop) drawHeader(headTopY, false);
  if (showBottom) drawHeader(headBotY, true);

  // ---- selection highlight & drop indicator (interactive only)
  if (opts.rowHi != null) items.push({ t: 'rect', x: pad - 10, y: opts.rowHi, w: W - 2 * pad + 20, h: rowH, r: 6, fill: hi, opacity: 0.2, ui: true });
  if (opts.dropBox) { // while dragging: outline the area (or task) the item would land inside, so “into” can't be mistaken for “above”
    const pn = info.find(n => n.row.id === opts.dropBox.id);
    if (pn) {
      const c = baseOf(pn), { y0, y1 } = opts.dropBox;
      const label = fitText('Into ' + (pn.row.name || 'Untitled'), 260, 12, 700, font), lw = M(label, 12, 700) + 20;
      items.push({ t: 'rect', x: pad - 10, y: y0 - 4, w: W - 2 * pad + 20, h: y1 - y0 + 8, r: 8, fill: c, opacity: 0.08, ui: true });
      items.push({ t: 'rect', x: pad - 10, y: y0 - 4, w: W - 2 * pad + 20, h: y1 - y0 + 8, r: 8, fill: 'none', stroke: c, sw: 2, ui: true });
      items.push({ t: 'rect', x: x1 + 10 - lw - 8, y: y0 - 2, w: lw, h: 21, r: 10.5, fill: c, ui: true });
      items.push({ t: 'text', x: x1 + 10 - lw / 2 - 8, y: y0 + 8.5, text: label, size: 12, weight: 700, fill: onColor(c), anchor: 'middle', ui: true });
    }
  }
  (opts.selSet && opts.selSet.length ? opts.selSet : opts.sel ? [opts.sel] : []).forEach(sid => {
    const n = info.find(n => n.row.id === sid);
    if (n) items.push({ t: 'rect', x: pad - 10, y: n.y, w: W - 2 * pad + 20, h: n.h, r: 6, fill: hi, opacity: 0.09, ui: true });
  });

  // ---- milestone guide lines
  if (S.msLines) info.forEach(n => {
    if (n.milestone) items.push({ t: 'line', x1: msX(n), y1: bodyY, x2: msX(n), y2: bodyEnd, stroke: faint, sw: 1, dash: [3, 4] });
  });

  // ---- dependency lines
  if (S.deps) {
    const byId = {};
    info.forEach(n => { byId[n.row.id] = n; });
    const edge = (n, side) => (n.milestone ? msX(n) + (side * n.bh) / 2 : side > 0 ? n.bx + n.bw : n.bx);
    info.forEach(n => (n.row.deps || []).forEach(pid => {
      const p = byId[pid];
      if (!p || p === n) return;
      // leave from the underside of the predecessor so the line stays clear of labels beside it
      const down = n.cy >= p.cy;
      const sx = p.milestone ? msX(p) : Math.max(p.bx + p.bw - 10, p.bx + p.bw / 2);
      const ex = edge(n, -1) - 2;
      const pts = [[sx, p.cy + (down ? 1 : -1) * (p.bh / 2 - 1)]];
      if (n.cy === p.cy) { pts[0] = [edge(p, 1), p.cy]; }
      else if (ex - sx >= 10) pts.push([sx, n.cy]);
      else {
        const my = down ? n.y : n.y + rowH;
        pts.push([sx, my], [ex - 10, my], [ex - 10, n.cy]);
      }
      pts.push([ex, n.cy]);
      items.push({ t: 'poly', pts, stroke: muted, sw: 1.5, arrow: true });
    }));
  }

  // an owner under a bar: a gap, then (optionally) the initials circle and the name
  const drawWho = (w, bottom, base) => {
    const cy = bottom + Math.round(6 * kk) + (avOn ? dU : w.size) / 2;
    if (avOn) {
      items.push({ t: 'rect', x: w.x, y: cy - dU / 2, w: dU, h: dU, r: dU / 2, fill: mix(base, surface, 0.78) });
      items.push({ t: 'text', x: w.x + dU / 2, y: cy, text: initials(w.full || w.text).slice(0, 2), size: 7 * kk, weight: 700, fill: mix(base, text, 0.5), anchor: 'middle' });
    }
    items.push({ t: 'text', x: w.x + (avOn ? dU + 6 : 0), y: cy, text: w.text, size: w.size, weight: 500, fill: muted, anchor: 'start' });
  };

  // ---- rows
  info.forEach(n => {
    const row = n.row, id = row.id;
    const base = baseOf(n);
    const name = row.name || 'Untitled';
    const size = n.level === 2 ? fs - 1 : fs;
    const group = isGroup(n);
    if (n.sep) items.push({ t: 'line', x1: pad, y1: n.y - 9, x2: x1, y2: n.y - 9, stroke: gridStrong, sw: 1 });
    if (n.lane) {
      n.lx = pad;
      const ow = showAssignee(n) ? row.assignee : '';
      const lf = labelFit(name, laneW - 22, fs + 1, 700, true), nl = lf.lines.length, off = ow ? -8 * kk : 0;
      lf.lines.forEach((ln, li) => ln && items.push({ t: 'text', x: pad, y: n.cy + off + (li - (nl - 1) / 2) * lf.size * 1.15, text: ln, size: lf.size, weight: 700, fill: mix(base, text, 0.25), anchor: 'start' }));
      if (ow) {
        const oy = n.cy + (9 + (nl - 1) * lf.size * 0.6) * kk, d = dU, av = avOn ? d + 6 : 0;
        if (avOn) {
          items.push({ t: 'rect', x: pad, y: oy - d / 2, w: d, h: d, r: d / 2, fill: mix(base, surface, 0.78) });
          items.push({ t: 'text', x: pad + d / 2, y: oy, text: initials(ow).slice(0, 2), size: 7.5 * kk, weight: 700, fill: mix(base, text, 0.5), anchor: 'middle' });
        }
        items.push({ t: 'text', x: pad + av, y: oy, text: fitText(ow, laneW - 22 - av, fs - 1.5, 500, font), size: fs - 1.5, weight: 500, fill: muted, anchor: 'start' });
      }
      items.push({ t: 'rect', x: pad + laneW - 12, y: n.y + 3, w: 3, h: n.h - 6, r: S.corners === 'square' ? 0 : 1.5, fill: base });
      items.push({ t: 'rect', x: pad - 10, y: n.y, w: laneW - 4, h: n.h, hit: true, id, role: 'row' });
      return;
    }
    if (left) {
      const lx = pad + laneW + indentOf(n);
      n.lx = lx;
      const weight = group ? 700 : 500;
      const lsize = group ? fs + 1 : size;
      const lf = labelFit(name, x0 - 14 - lx, lsize, weight, barMid * 2 >= lsize * 2 + 4);
      lf.lines.forEach((ln, li) => ln && items.push({ t: 'text', x: lx, y: n.cy + (li - (lf.lines.length - 1) / 2) * lf.size * 1.15, text: ln, size: lf.size, weight, fill: group ? mix(base, text, 0.25) : n.level === 2 ? muted : text, anchor: 'start' }));
      items.push({ t: 'rect', x: pad + laneW - (lanes ? 4 : 10), y: n.y, w: x0 - pad - laneW - (lanes ? 6 : 0), h: rowH, hit: true, id, role: 'row' });
    }
    if (group) {
      const strong = mix(base, text, 0.2);
      if (left) {
        const h = Math.max(8, Math.round(rowH * 0.24));
        items.push({ t: 'rect', x: n.bx, y: n.cy - h / 2, w: n.bw, h, r: Math.min(radius(h), h / 2), fill: strong });
      } else {
        items.push({ t: 'text', x: n.bx, y: n.cy - 4, text: name, size: fs + 1, weight: 700, fill: strong, anchor: 'start' });
        items.push({ t: 'rect', x: n.bx, y: n.y + rowH - 7, w: n.bw, h: 4, r: S.corners === 'square' ? 0 : 2, fill: strong });
      }
      if (n.areaWho) {
        const a = n.areaWho, d = dd, ay = left ? n.cy : n.cy - 4;
        if (avOn) {
          items.push({ t: 'rect', x: a.x, y: ay - d / 2, w: d, h: d, r: d / 2, fill: mix(base, surface, 0.78) });
          items.push({ t: 'text', x: a.x + d / 2, y: ay, text: initials(a.text).slice(0, 2), size: 8 * kk, weight: 700, fill: mix(base, text, 0.5), anchor: 'middle' });
        }
        items.push({ t: 'text', x: a.x + (avOn ? d + 6 : 0), y: ay, text: a.text, size: a.size, weight: 500, fill: muted, anchor: 'start' });
      }
      items.push({ t: 'rect', x: n.bx, y: n.y + 2, w: Math.max(n.bw, left ? 0 : n.tailEnd - n.bx), h: rowH - 4, hit: true, id, role: 'move' });
      if (n.who) drawWho(Object.assign({ full: row.assignee }, n.who), n.cy + Math.max(8, Math.round(rowH * 0.24)) / 2, base);
      return;
    }
    // subtask bars are a lighter tint, but never so light that the label colour has to change
    const subFill = pal.text === 'light' ? lightenFor(base, TEXT_LIGHT, 4.5) : pal.text === 'dark' ? mix(base, '#ffffff', 0.35) : mix(base, surface, 0.42);
    const full = n.level === 2 ? subFill : base;
    const soft = n.level === 2 ? mix(base, surface, 0.8) : mix(base, surface, 0.62);
    const h = n.bh, by = n.cy - h / 2, r = radius(h);
    if (n.milestone) {
      const cx = msX(n), rr = h * 0.52;
      // the milestone's own palette colour, deepened only if it would be too faint against the background (3:1, the minimum for a graphic)
      let mark = base, mt = 0;
      while (contrast(mark, surface) < 3 && mt < 0.9) { mt += 0.1; mark = mix(base, text, mt); }
      items.push({ t: 'diamond', cx, cy: n.cy, r: rr, fill: mark, stroke: surface });
      items.push({ t: 'rect', x: Math.min(n.tailStart, cx - rr - 4), y: n.y, w: Math.max(n.tailEnd, cx + rr) + 4 - Math.min(n.tailStart, cx - rr - 4), h: rowH, hit: true, id, role: 'move' });
    } else {
      const tracked = S.progress && n.progress != null; // bars with progress switched off stay plain
      const prog = tracked ? clamp(n.progress, 0, 100) / 100 : 1;
      const inset = n.bw > 10 ? 1.5 : 0; // a sliver of space each side, so bars that meet still read as separate
      const gx = n.bx + inset, gw = n.bw - 2 * inset;
      const pw = prog * gw;
      // "Darker finished": every bar keeps its palette colour (and its label colour); the finished part is a deeper shade of it
      const shaded = tracked && S.progressStyle === 'shade';
      let deep = full;
      if (shaded) {
        const lightLabel = S.barText === 'light' || (S.barText !== 'dark' && pal.text !== 'dark');
        let sh = 0.26;
        if (!lightLabel) while (sh > 0 && contrast(mix(full, '#0b1020', sh), '#0b1020') < 7) sh -= 0.04; // darker must not cost a dark label its contrast
        deep = mix(full, '#0b1020', Math.max(sh, 0));
      }
      if (tracked) items.push({ t: 'rect', x: gx, y: by, w: gw, h, r, fill: shaded ? full : soft });
      if (pw > 0.5) items.push({ t: 'rect', x: gx, y: by, w: Math.min(gw, Math.max(pw, Math.min(2 * r, gw))), h, r, fill: shaded ? deep : full });
      const lsz = n.shrink || size;
      const on = c => { if (onColor(c) === '#ffffff') return '#ffffff'; const tint = mix(base, '#0b1020', 0.72); return contrast(c, tint) >= 7 ? tint : '#0b1020'; };
      // the user's choice applies to the bar colour itself; the pale 'remaining' part of a progress bar stays automatic
      let onFull = S.barText === 'light' ? '#ffffff' : S.barText === 'dark' ? '#0b1020' : pal.text === 'light' ? '#ffffff' : pal.text === 'dark' ? '#0b1020' : on(full);
      // a colour chosen by hand may not suit the palette's label colour: switch to whichever reads better
      if (typeof colorIndexOf(info, n) === 'string' && S.barText !== 'light' && S.barText !== 'dark' && contrast(full, onFull) < 4.5) onFull = contrast(full, '#ffffff') >= contrast(full, '#0b1020') ? '#ffffff' : '#0b1020';
      if (n.inside && n.lines && n.lines.length > 1) {
        n.lines.forEach((ln, li) => ln && items.push({ t: 'text', x: n.bx + (n.ip || 10), y: n.cy + (li - (n.lines.length - 1) / 2) * lsz * 1.15, text: ln, size: lsz, weight: 500, fill: onFull, anchor: 'start' }));
      } else {
        const shown = n.lines ? n.lines[0] : n.fit != null ? fitText(name, n.fit, lsz, 500, font) : name;
        if (n.inside && shown) {
          const tw = M(shown, lsz, 500);
          const it = { t: 'text', x: n.bx + (n.fit != null ? 0.8 : 1) * (n.ip || 10), y: n.cy, text: shown, size: lsz, weight: 500, fill: onFull, anchor: 'start' };
          // a label that straddles the progress edge is drawn in two colours, split at that edge
          if (tracked && !shaded && pw < (n.ip || 10) + tw + 2 && on(soft) !== onFull) {
            if (pw <= (n.ip || 10)) it.fill = on(soft);
            else { it.split = n.bx + pw; it.fill2 = on(soft); it.major = pw >= (n.ip || 10) + tw * 0.5 ? it.fill : it.fill2; }
          }
          items.push(it);
        }
      }
      items.push({ t: 'rect', x: n.bx, y: n.y + 2, w: n.bw, h: rowH - 4, hit: true, id, role: 'move' });
      if (!n.hasKids) {
        if (tracked) {
          items.push({ t: 'rect', x: n.bx + pw - 8, y: n.y + 2, w: 16, h: rowH - 4, hit: true, id, role: 'progress' });
          if (opts.sel === id) items.push({ t: 'rect', x: n.bx + pw - 3, y: by - 3, w: 6, h: h + 6, r: 3, fill: '#ffffff', stroke: mix(base, '#000000', 0.35), sw: 1.5, ui: true, pass: true });
        }
        items.push({ t: 'rect', x: n.bx - 4, y: n.y + 2, w: Math.min(9, n.bw / 3 + 4), h: rowH - 4, hit: true, id, role: 'resize-l' });
        items.push({ t: 'rect', x: n.bx + n.bw - Math.min(5, n.bw / 3), y: n.y + 2, w: Math.min(9, n.bw / 3 + 4), h: rowH - 4, hit: true, id, role: 'resize-r' });
      }
    }
    n.tail.forEach(t => {
      if (t.k === 'name') items.push({ t: 'text', x: t.x, y: n.cy, text: name, size, weight: n.milestone ? 600 : 500, fill: text, anchor: 'start' });
      else if (t.k === 'date') items.push({ t: 'text', x: t.x, y: n.cy, text: t.text, size: size - 1.5, weight: 500, fill: muted, anchor: 'start' });
      else {
        const d = dd;
        if (avOn) {
          items.push({ t: 'rect', x: t.x, y: n.cy - d / 2, w: d, h: d, r: d / 2, fill: mix(base, surface, 0.78) });
          items.push({ t: 'text', x: t.x + d / 2, y: n.cy, text: initials(row.assignee).slice(0, 2), size: 8 * kk, weight: 700, fill: mix(base, text, 0.5), anchor: 'middle' });
        }
        items.push({ t: 'text', x: t.x + (avOn ? d + 6 : 0), y: n.cy, text: row.assignee, size: size - 1.5, weight: 500, fill: muted, anchor: 'start' });
      }
    });
    if (n.who) drawWho(Object.assign({ full: row.assignee }, n.who), n.cy + n.bh / 2, base);
  });

  // ---- the date marker: a line (and optional label) at a chosen date — today, a status date, a deadline…
  if (S.todayLine && todayD >= rs && todayD <= re) {
    const tx = X(todayD + 0.5);
    const label = S.markerLabelOn !== false ? (S.todayLabel || '') : '';
    const mcol = S.markerColor == null ? accent : typeof S.markerColor === 'string' ? S.markerColor : palette[S.markerColor % palette.length];
    const mw = { 1: 1.5, 2: 2, 3: 3.5 }[S.markerWidth] || 2;
    const mdash = S.markerStyle === 'dashed' ? [mw * 3.5 + 3, mw * 2 + 3] : S.markerStyle === 'dotted' ? [0.01, mw * 2.2 + 2.5] : null; // dots are zero-length dashes with round caps
    const lw = label ? M(label, 11 * kk, 700) + 18 : 0;
    const px = clamp(tx - lw / 2, pad, W - pad - lw);
    items.push({ t: 'line', x1: tx, y1: laneY + (label ? tlh : 4), x2: tx, y2: bodyEnd, stroke: mcol, sw: mw, dash: mdash, cap: S.markerStyle === 'dotted' ? 'round' : undefined, dashType: S.markerStyle === 'dotted' ? 'sysDot' : undefined });
    if (label) {
      items.push({ t: 'rect', x: px, y: laneY, w: lw, h: tlh, r: S.corners === 'square' ? 3 : tlh / 2, fill: mcol });
      items.push({ t: 'text', x: px + lw / 2, y: laneY + tlh / 2, text: label, size: 11 * kk, weight: 700, fill: onColor(mcol), anchor: 'middle' });
    } else items.push({ t: 'diamond', cx: tx, cy: laneY + 6, r: 5, fill: mcol });
    items.push({ t: 'rect', x: Math.min(px, tx - 7), y: laneY, w: Math.max(lw, 14), h: tlh + 2, hit: true, role: 'today' });
    items.push({ t: 'rect', x: tx - 6, y: laneY + tlh, w: 12, h: bodyEnd - laneY - tlh, hit: true, role: 'today' });
  }

  if (opts.dropY != null) { const dx = pad - 10 + (opts.dropLevel || 0) * 16; items.push({ t: 'rect', x: dx, y: opts.dropY - 1.5, w: W - pad + 10 - dx, h: 3, r: 1.5, fill: hi, ui: true }); }

  return { w: W, h: H, items, ppd, range: [rs, re], info, rowH, font, transparent: S.bgTransparent, lightText, pad, x0, fs, fixed, canvas: cv, fixedPx, needH: Hc, fits: !fixedPx || Hc <= fixedPx + 1, hs2 };
}

if (typeof module !== 'undefined') module.exports = { parseImport, parseDate, derive, normalizeLevels, areaPalette, suggestPalettes, PRESETS, parseColor, dayToIso, toDay };
