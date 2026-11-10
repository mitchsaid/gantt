'use strict';
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

// ---------------------------------------------------------------- model
const DEFAULT_SETTINGS = {
  title: 'Project plan', showTitle: true, width: 'wide',
  taskLabels: 'left', areaLabels: 'row', scale: 'weeks', sprintWeeks: 2, datePos: 'top', dateMode: 'calendar',
  deps: false, assignees: false, assigneeLevel: 'tasks',
  progress: false, todayLine: false, todayDate: null, todayLabel: 'We are here', msLines: true,
  rangeMode: 'auto', rangeStart: null, rangeEnd: null,
  primary: '#4f46e5', secondaryOn: true, secondary: '#ec4899', bg: '#ffffff', bgTransparent: false, textMode: 'auto',
  font: 'Inter', corners: 'rounded', density: 'auto', v: 2, grid: true, stripes: false, weekends: true,
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
  const info = rows.map((row, i) => ({ row, i, level: row.level, kids: [], parent: -1, root: i, start: row.start, end: row.end, progress: row.progress || 0 }));
  const stack = [];
  let rootCount = -1;
  info.forEach(n => {
    while (stack.length && stack[stack.length - 1].level >= n.level) stack.pop();
    if (stack.length) { n.parent = stack[stack.length - 1].i; stack[stack.length - 1].kids.push(n.i); }
    if (n.level === 0) rootCount++;
    n.rootIdx = Math.max(0, rootCount);
    stack.push(n);
  });
  for (let i = info.length - 1; i >= 0; i--) {
    const n = info[i];
    n.hasKids = n.kids.length > 0;
    n.milestone = !n.hasKids && n.row.type === 'milestone';
    if (n.milestone) { n.end = n.start; n.progress = 0; }
    if (n.hasKids) {
      let s = Infinity, e = -Infinity, w = 0, pw = 0;
      n.kids.forEach(k => {
        const c = info[k];
        s = Math.min(s, c.start); e = Math.max(e, c.end);
        if (!c.milestone) { const d = c.weight || (c.end - c.start + 1); w += d; pw += d * c.progress; }
      });
      n.start = s; n.end = e; n.weight = w; n.progress = w ? pw / w : 0;
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
  const W = S.width === 'compact' ? 960 : 1280;
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
  const nRoots = info.filter(n => n.level === 0).length;
  const palette = areaPalette(S.primary, S.secondaryOn ? S.secondary : null, Math.max(1, nRoots));
  const accent = S.secondaryOn ? S.secondary : text;

  // metrics
  let rowH = { compact: 30, regular: 38, roomy: 48 }[S.density];
  if (!rowH) {
    // auto: size rows so the chart fills a slide (16:9) — few items get tall bars, long plans stay compact
    const grp = n => n.level === 0 && n.hasKids;
    const side = S.areaLabels === 'side' && info.some(grp);
    let nRows = 0, gaps = 0;
    info.forEach((n, i) => {
      if (i > 0 && (grp(n) || (side && n.level === 0 && info[i - 1].level > 0))) gaps += side ? 18 : 10;
      if (!(side && grp(n))) nRows++;
    });
    const hh = (S.dateMode === 'relative' ? 1 : 2) * 26 + 8;
    const fixedH = 2 * pad + (S.showTitle && S.title ? 56 : 0) + (S.todayLine ? 26 : 0) + (S.datePos !== 'bottom' ? hh : 0) + (S.datePos !== 'top' ? hh - 8 : 0) + 12 + gaps;
    rowH = clamp(Math.floor((W * (S.width === 'compact' ? 0.5 : 9 / 16) - fixedH) / Math.max(1, nRows)), 32, 68);
  }
  const fs = Math.round((rowH <= 38 ? 12.5 + (rowH - 30) * 0.1875 : Math.min(17, 14 + (rowH - 38) * 0.1)) * 2) / 2;
  const barH = Math.round(rowH * 0.64), subH = Math.round(rowH * 0.46);
  const radius = h => (S.corners === 'square' ? 2 : S.corners === 'pill' ? h / 2 : Math.min(7, h / 2));
  const isGroup = n => n.level === 0 && n.hasKids;
  const left = S.taskLabels === 'left'; // task names in a column on the left, otherwise on the bars
  const lanes = S.areaLabels === 'side' && info.some(isGroup); // areas named down the side, spanning their rows

  // label columns: areas (when at the side), then tasks (when on the left)
  let labelW = 0, laneW = 0;
  const indentOf = n => (lanes ? Math.max(0, n.level - 1) : n.level) * 16;
  if (lanes) {
    info.forEach(n => { if (isGroup(n)) laneW = Math.max(laneW, M(n.row.name || 'Untitled', fs + 1, 700)); });
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
    const tt = fitText(S.title, W - 2 * pad, 30, 700, font);
    items.push({ t: 'text', x: pad, y: y + 16, text: tt, size: 30, weight: 700, fill: text, anchor: 'start' });
    items.push({ t: 'rect', x: pad - 6, y: y - 6, w: M(tt, 30, 700) + 12, h: 44, hit: true, role: 'title' });
    y += 30 + 26;
  }
  const lane = S.todayLine ? 26 : 0;
  const laneY = y;
  y += lane;
  const relative = S.dateMode === 'relative';
  const tierH = 26;
  const tiers = relative ? 1 : 2;
  const headH = tiers * tierH + 8;
  const showTop = S.datePos !== 'bottom', showBottom = S.datePos !== 'top';
  const headTopY = y;
  if (showTop) y += headH;
  const bodyY = y;
  y += 6;
  info.forEach((n, i) => {
    if (i > 0 && (isGroup(n) || (lanes && n.level === 0 && info[i - 1].level > 0))) { y += lanes ? 18 : 10; n.sep = lanes; }
    n.y = y; n.cy = y + rowH / 2; n.h = rowH;
    if (lanes && isGroup(n)) { n.lane = true; return; } // no row of its own: its label spans the rows inside it
    y += rowH;
  });
  if (lanes) info.forEach(n => {
    if (!n.lane) return;
    n.h = info[blockEnd(rows, n.i) - 1].y + rowH - n.y;
    n.cy = n.y + n.h / 2; n.dropCy = n.y - 4;
  });
  y += 6;
  const bodyEnd = y;
  const headBotY = y;
  if (showBottom) y += headH;
  const H = Math.round(y + pad - (showBottom ? 8 : 0));

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
  if (opts.range) { rs = opts.range[0]; re = opts.range[1]; cells = unitCells(S.scale, S.sprintWeeks, rs, re - 1, anchor, relative); rs = Math.min(rs, cells[0][0]); re = Math.max(re, cells[cells.length - 1][1]); }
  else {
    let a = dMin, b = dMax;
    // a fixed timeline is kept as set; it only grows if an item is placed outside it
    if (fixed) { a = Math.min(a, S.rangeStart); b = Math.max(b, S.rangeEnd); }
    else if (S.todayLine) { a = Math.min(a, todayD); b = Math.max(b, todayD); }
    setRange(a, b);
  }
  let ppd = (x1 - x0) / (re - rs);
  const X = d => x0 + (d - rs) * ppd;

  // what goes to the right of each bar (labels that don't fit, owners)
  const showAssignee = n => S.assignees && n.row.assignee && !isGroup(n) && (S.assigneeLevel === 'all' || (S.assigneeLevel === 'subtasks' ? n.level === 2 : n.level < 2));
  const plan = () => {
    let over = 0;
    info.forEach(n => {
      const size = n.level === 2 ? fs - 1 : fs;
      const h = n.level === 2 ? subH : barH;
      const bx = X(n.start), bw = Math.max(X(n.end + 1) - bx, 4);
      n.bx = bx; n.bw = bw; n.bh = h; n.inside = false; n.tail = [];
      let tx = n.milestone ? X(n.start + 0.5) + h * 0.5 + 8 : bx + bw + 8;
      const name = n.row.name || 'Untitled';
      if (n.lane) { n.tailEnd = bx; return; }
      if (isGroup(n)) { n.tailEnd = left ? bx + bw : Math.max(bx + bw, bx + M(name, fs + 1, 700)); over = Math.max(over, n.tailEnd - x1); return; }
      if (!left) {
        const w = M(name, size, n.milestone ? 600 : 500);
        if (!n.milestone && w + 18 <= bw) n.inside = true;
        else { n.tail.push({ k: 'name', x: tx, w }); tx += w + 12; }
      } else if (n.milestone && !relative) {
        const t = shortDate(n.start), w = M(t, size - 1.5, 500);
        n.tail.push({ k: 'date', x: tx, w, text: t }); tx += w + 12;
      }
      if (showAssignee(n)) {
        const w = M(n.row.assignee, size - 1.5, 500);
        n.tail.push({ k: 'who', x: tx, w: w + 24 }); tx += w + 24 + 10;
      }
      n.tailEnd = n.tail.length ? tx - 10 : bx + bw;
      n.tailStart = n.milestone ? X(n.start + 0.5) - h * 0.52 - 4 : bx;
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
  if (S.stripes) info.filter(n => !n.lane).forEach((n, i) => { if (i % 2 === 0) items.push({ t: 'rect', x: pad - 8, y: n.y, w: W - 2 * pad + 16, h: rowH, r: 4, fill: stripe }); });
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
  const cellW = (cells[0][1] - cells[0][0]) * ppd;
  if (S.grid) {
    const every = cellW < 7 ? Math.ceil(7 / cellW) : 1;
    const weekly = S.scale === 'days' && cellW < 16;
    cells.forEach((c, i) => { if (i > 0 && (weekly ? dow(c[0]) === 0 : i % every === 0)) items.push({ t: 'line', x1: X(c[0]), y1: bodyY, x2: X(c[0]), y2: bodyEnd, stroke: grid, sw: 1 }); });
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
    if (S.scale === 'days') return [String(d)];
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
    if (!relative) segs.forEach(sg => {
      const w = X(sg.e) - X(sg.s) - 10;
      const label = M(sg.label, 12.5, 700) <= w ? sg.label : M(sg.short, 12.5, 700) <= w ? sg.short : '';
      if (label) items.push({ t: 'text', x: X(sg.s) + (sg.real && sg.s > rs ? 6 : 0), y: segY, text: label, size: 12.5, weight: 700, fill: text, anchor: 'start' });
    });
    const variants = cells.map((c, i) => unitLabel(c, i - firstCell));
    let vi = 0;
    const nVar = variants[0].length;
    const maxW = v => Math.max(...variants.map(l => M(l[Math.min(v, l.length - 1)], 11.5, 500)));
    while (vi < nVar - 1 && maxW(vi) + 8 > cellW) vi++;
    const every = Math.max(1, Math.ceil((maxW(vi) + 8) / cellW));
    cells.forEach((c, i) => {
      if (every > 1 && (S.scale === 'days' && !relative ? dow(c[0]) !== 0 && every <= 7 : (i - firstCell) % every !== 0)) return;
      if (i < firstCell && (relative || S.scale === 'sprints')) return;
      const cx = every > 1 ? X(c[0]) + 3 : (X(c[0]) + X(c[1])) / 2;
      items.push({ t: 'text', x: cx, y: unitY, text: variants[i][Math.min(vi, variants[i].length - 1)], size: 11.5, weight: 500, fill: muted, anchor: every > 1 ? 'start' : 'middle' });
    });
  };
  if (showTop) drawHeader(headTopY, false);
  if (showBottom) drawHeader(headBotY, true);

  // ---- selection highlight & drop indicator (interactive only)
  if (opts.sel) {
    const n = info.find(n => n.row.id === opts.sel);
    if (n) items.push({ t: 'rect', x: pad - 10, y: n.y, w: W - 2 * pad + 20, h: n.h, r: 6, fill: S.primary, opacity: 0.09, ui: true });
  }

  // ---- milestone guide lines
  if (S.msLines) info.forEach(n => {
    if (n.milestone) items.push({ t: 'line', x1: X(n.start + 0.5), y1: bodyY, x2: X(n.start + 0.5), y2: bodyEnd, stroke: faint, sw: 1, dash: [3, 4] });
  });

  // ---- dependency lines
  if (S.deps) {
    const byId = {};
    info.forEach(n => { byId[n.row.id] = n; });
    const edge = (n, side) => (n.milestone ? X(n.start + 0.5) + (side * n.bh) / 2 : side > 0 ? n.bx + n.bw : n.bx);
    info.forEach(n => (n.row.deps || []).forEach(pid => {
      const p = byId[pid];
      if (!p || p === n) return;
      // leave from the underside of the predecessor so the line stays clear of labels beside it
      const down = n.cy >= p.cy;
      const sx = p.milestone ? X(p.start + 0.5) : Math.max(p.bx + p.bw - 10, p.bx + p.bw / 2);
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

  // ---- rows
  info.forEach(n => {
    const row = n.row, id = row.id;
    const base = palette[n.rootIdx % palette.length];
    const name = row.name || 'Untitled';
    const size = n.level === 2 ? fs - 1 : fs;
    const group = isGroup(n);
    if (n.sep) items.push({ t: 'line', x1: pad, y1: n.y - 9, x2: x1, y2: n.y - 9, stroke: gridStrong, sw: 1 });
    if (n.lane) {
      n.lx = pad;
      items.push({ t: 'text', x: pad, y: n.cy, text: fitText(name, laneW - 22, fs + 1, 700, font), size: fs + 1, weight: 700, fill: mix(base, text, 0.25), anchor: 'start' });
      items.push({ t: 'rect', x: pad + laneW - 12, y: n.y + 3, w: 3, h: n.h - 6, r: S.corners === 'square' ? 0 : 1.5, fill: base });
      items.push({ t: 'rect', x: pad - 10, y: n.y, w: laneW - 4, h: n.h, hit: true, id, role: 'row' });
      return;
    }
    if (left) {
      const lx = pad + laneW + indentOf(n);
      n.lx = lx;
      const weight = group ? 700 : 500;
      const lsize = group ? fs + 1 : size;
      items.push({ t: 'text', x: lx, y: n.cy, text: fitText(name, x0 - 14 - lx, lsize, weight, font), size: lsize, weight, fill: group ? mix(base, text, 0.25) : n.level === 2 ? muted : text, anchor: 'start' });
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
      items.push({ t: 'rect', x: n.bx, y: n.y + 2, w: Math.max(n.bw, left ? 0 : n.tailEnd - n.bx), h: rowH - 4, hit: true, id, role: 'move' });
      return;
    }
    const full = n.level === 2 ? mix(base, surface, 0.42) : base;
    const soft = n.level === 2 ? mix(base, surface, 0.8) : mix(base, surface, 0.62);
    const h = n.bh, by = n.cy - h / 2, r = radius(h);
    if (n.milestone) {
      const cx = X(n.start + 0.5), rr = h * 0.52;
      items.push({ t: 'diamond', cx, cy: n.cy, r: rr, fill: mix(base, text, 0.3), stroke: surface });
      items.push({ t: 'rect', x: Math.min(n.tailStart, cx - rr - 4), y: n.y, w: Math.max(n.tailEnd, cx + rr) + 4 - Math.min(n.tailStart, cx - rr - 4), h: rowH, hit: true, id, role: 'move' });
    } else {
      const prog = S.progress ? clamp(n.progress, 0, 100) / 100 : 1;
      const pw = prog * n.bw;
      if (S.progress) items.push({ t: 'rect', x: n.bx, y: by, w: n.bw, h, r, fill: soft });
      if (pw > 0.5) items.push({ t: 'rect', x: n.bx, y: by, w: Math.min(n.bw, Math.max(pw, Math.min(2 * r, n.bw))), h, r, fill: full });
      if (n.inside) {
        const tw = M(name, size, 500);
        const on = c => { if (onColor(c) === '#ffffff') return '#ffffff'; const tint = mix(base, '#0b1020', 0.72); return contrast(c, tint) >= 7 ? tint : '#0b1020'; };
        const it = { t: 'text', x: n.bx + 9, y: n.cy, text: name, size, weight: 500, fill: on(full), anchor: 'start' };
        // a label that straddles the progress edge is drawn in two colours, split at that edge
        if (S.progress && pw < 9 + tw + 2 && on(soft) !== on(full)) {
          if (pw <= 9) it.fill = on(soft);
          else { it.split = n.bx + pw; it.fill2 = on(soft); it.major = pw >= 9 + tw * 0.5 ? it.fill : it.fill2; }
        }
        items.push(it);
      }
      items.push({ t: 'rect', x: n.bx, y: n.y + 2, w: n.bw, h: rowH - 4, hit: true, id, role: 'move' });
      if (!n.hasKids) {
        if (S.progress) {
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
        const d = 18;
        items.push({ t: 'rect', x: t.x, y: n.cy - d / 2, w: d, h: d, r: d / 2, fill: mix(base, surface, 0.78) });
        items.push({ t: 'text', x: t.x + d / 2, y: n.cy, text: initials(row.assignee).slice(0, 2), size: 8, weight: 700, fill: mix(base, text, 0.5), anchor: 'middle' });
        items.push({ t: 'text', x: t.x + d + 6, y: n.cy, text: row.assignee, size: size - 1.5, weight: 500, fill: muted, anchor: 'start' });
      }
    });
  });

  // ---- "we are here" line
  if (S.todayLine && todayD >= rs && todayD <= re) {
    const tx = X(todayD + 0.5);
    const label = S.todayLabel || '';
    const lw = label ? M(label, 11, 700) + 18 : 0;
    const px = clamp(tx - lw / 2, pad, W - pad - lw);
    items.push({ t: 'line', x1: tx, y1: laneY + (label ? 20 : 4), x2: tx, y2: bodyEnd, stroke: accent, sw: 2 });
    if (label) {
      items.push({ t: 'rect', x: px, y: laneY, w: lw, h: 20, r: S.corners === 'square' ? 3 : 10, fill: accent });
      items.push({ t: 'text', x: px + lw / 2, y: laneY + 10, text: label, size: 11, weight: 700, fill: onColor(accent), anchor: 'middle' });
    } else items.push({ t: 'diamond', cx: tx, cy: laneY + 6, r: 5, fill: accent });
    items.push({ t: 'rect', x: Math.min(px, tx - 7), y: laneY, w: Math.max(lw, 14), h: 22, hit: true, role: 'today' });
    items.push({ t: 'rect', x: tx - 6, y: laneY + 20, w: 12, h: bodyEnd - laneY - 20, hit: true, role: 'today' });
  }

  if (opts.dropY != null) { const dx = pad - 10 + (opts.dropLevel || 0) * 16; items.push({ t: 'rect', x: dx, y: opts.dropY - 1.5, w: W - pad + 10 - dx, h: 3, r: 1.5, fill: S.primary, ui: true }); }

  return { w: W, h: H, items, ppd, range: [rs, re], info, rowH, font, transparent: S.bgTransparent, lightText, pad, x0, fs, fixed };
}

if (typeof module !== 'undefined') module.exports = { parseImport, parseDate, derive, normalizeLevels, areaPalette, dayToIso, toDay };
