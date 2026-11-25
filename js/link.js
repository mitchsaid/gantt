// ---------------------------------------------------------------- share links
// The whole plan travels in the link's hash and is never sent to a server. One format for people and AI (documented in llms.txt):
//
//   #plan=<the plan as JSON>&style=<design settings that differ from the defaults>
//
// The plan part is JSON written "quote-light": ' instead of " and _ instead of a space, so it needs almost no percent-encoding
// and stays readable. The reader is lenient because AIs write these links by hand: it also takes standard JSON (raw or
// percent-encoded), base64url JSON, names instead of ids in "after", and a missing style part (then the defaults apply, and
// owners, progress and dependency arrows switch on when the plan uses them).
// Only settings that differ from DEFAULT_SETTINGS travel, so changing a default changes how existing links look.
// Loaded before app.js; it uses app.js's sanitize / newRow / uid only when called.

const LINK_DATE_KEYS = ['todayDate', 'rangeStart', 'rangeEnd'];
const LINK_PLAN_KEYS = ['title', 'projectStatus']; // these travel in the plan part
const LINK_ALWAYS = ['dateOrder']; // its default depends on the browser, so it always travels

// ---- writing
function lightStr(s, bare) { // a string inside a quote-light value
  let o = '';
  for (const ch of String(s)) {
    if (ch === ' ') o += '_';
    else if (ch === '_') o += '%5F';
    else if (ch === "'") o += '%5C%27'; // \' — an apostrophe that isn't a quote
    else if (bare && (ch === ',' || ch === ':')) o += encodeURIComponent(ch);
    else if (/[A-Za-z0-9\-.~!$*+;=:@/?,]/.test(ch)) o += ch;
    else o += encodeURIComponent(ch).replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  }
  return o;
}
function lightJson(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') return "'" + lightStr(v) + "'";
  if (Array.isArray(v)) return '[' + v.map(lightJson).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).map(k => "'" + lightStr(k) + "':" + lightJson(v[k])).join(',') + '}';
}
/** the plan part: nested items with real dates; ids only on items something waits for */
function linkPlanObject(st) {
  const info = derive(st.rows), waitedOn = new Set(), num = new Map();
  st.rows.forEach(r => (r.deps || []).forEach(d => waitedOn.add(d)));
  st.rows.forEach(r => { if (waitedOn.has(r.id)) num.set(r.id, num.size + 1); });
  const top = [], stack = [];
  st.rows.forEach((r, i) => {
    const n = info[i], o = {};
    if (num.has(r.id)) o.id = num.get(r.id);
    o.name = r.name;
    if (r.type === 'milestone') o.milestone = true;
    if (!n.hasKids) { if (r.type === 'milestone') o.date = dayToIso(r.start); else { o.start = dayToIso(r.start); o.end = dayToIso(r.end); } }
    if (r.keepTask) o.keepTask = true;
    if (r.assignee) o.owner = r.assignee;
    if (r.progress === null) o.progress = null; else if (r.progress) o.progress = r.progress;
    if (r.status) o.status = r.status;
    if (r.key) o.key = true;
    if (r.blocked) o.blocked = r.blockedNote || true; else if (r.blockedNote) o.blockedNote = r.blockedNote;
    if (r.note) o.note = r.note;
    if (r.noteOff) o.noteOff = true;
    if (r.changeNote) o.changeNote = r.changeNote;
    if (r.baseline) o.baseline = [dayToIso(r.baseline.s), dayToIso(r.baseline.e)];
    if (r.color != null) o.color = r.color;
    if (r.msAlign != null) o.msAlign = r.msAlign;
    if (r.newLine) o.newLine = true;
    const after = (r.deps || []).map(d => num.get(d)).filter(Boolean);
    if (after.length) o.after = after;
    while (stack.length > r.level) stack.pop();
    if (stack.length) (stack[stack.length - 1].items = stack[stack.length - 1].items || []).push(o); else top.push(o);
    stack.push(o);
  });
  const p = { title: st.settings.title };
  if (st.settings.projectStatus) p.status = st.settings.projectStatus;
  p.items = top;
  return p;
}
const samePreset = pal => PRESETS.find(x => pal && x.id === pal.id && JSON.stringify(x) === JSON.stringify(pal));
/** the style part: key:value pairs, only what differs from the defaults */
function linkStyle(settings) {
  const out = [];
  Object.keys(settings).forEach(k => {
    const v = settings[k];
    if (LINK_PLAN_KEYS.includes(k) || v === undefined) return;
    if (!LINK_ALWAYS.includes(k) && JSON.stringify(v) === JSON.stringify(DEFAULT_SETTINGS[k])) return;
    let t;
    if (k === 'palette' && samePreset(v)) t = v.id;
    else if (LINK_DATE_KEYS.includes(k) && typeof v === 'number') t = dayToIso(v);
    else if (k === 'daysOff') t = lightJson(v.map(r => ({ from: dayToIso(r.from), to: dayToIso(r.to), label: r.label })));
    else if (typeof v === 'string') t = lightStr(v, true);
    else if (v === null || typeof v !== 'object') t = String(v);
    else t = lightJson(v);
    out.push(k + ':' + t);
  });
  return out.join(',');
}
/** the part after the # */
function planToLink(st) {
  const style = linkStyle(st.settings);
  return 'plan=' + lightJson(linkPlanObject(st)) + (style ? '&style=' + style : '');
}

// ---- reading
/** percent-decode into characters that remember whether they were encoded (an encoded _ is an underscore, not a space) */
function pctChars(s) {
  const out = [];
  for (let i = 0; i < s.length;) {
    if (s[i] === '%') {
      let j = i;
      while (/^%[0-9A-Fa-f]{2}$/.test(s.slice(j, j + 3))) j += 3;
      let dec = null;
      if (j > i) { try { dec = decodeURIComponent(s.slice(i, j)); } catch (e) { /* a broken sequence */ } }
      if (dec != null) { for (const c of dec) out.push([c, true]); i = j; continue; }
      out.push(['%', false]); i++; continue;
    }
    const c = String.fromCodePoint(s.codePointAt(i));
    out.push([c, false]); i += c.length;
  }
  return out;
}
/** quote-light JSON, standard JSON (raw or percent-encoded) or base64url JSON → a value; throws when none of them parse */
function parseLooseJson(text) {
  text = String(text).trim();
  if (/^[A-Za-z0-9_-]{16,}$/.test(text)) { try { return JSON.parse(new TextDecoder().decode(unb64u(text))); } catch (e) { /* not base64 */ } }
  const cs = pctChars(text);
  const first = cs.find(([c]) => c === "'" || c === '"');
  const q = first ? first[0] : '"';
  let json = '', i = cs.findIndex(([c]) => c === '{' || c === '[');
  if (i < 0) throw new Error('no JSON');
  for (; i < cs.length; i++) {
    const [c] = cs[i];
    if (c === q) { // a string
      let body = '';
      for (i++; i < cs.length && cs[i][0] !== q; i++) {
        const [d, enc] = cs[i];
        if (d === '\\' && i + 1 < cs.length) { i++; body += q === '"' ? '\\' + cs[i][0] : cs[i][0]; continue; }
        body += q === "'" && d === '_' && !enc ? ' ' : d;
      }
      json += q === '"' ? '"' + body.replace(/[\u0000-\u001f]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')) + '"' : JSON.stringify(body);
    } else if (!/\s/.test(c)) json += c;
  }
  try { return JSON.parse(json); } catch (e) { /* trailing junk from the chat, such as a closing bracket of a Markdown link */ }
  const end = Math.max(json.lastIndexOf('}'), json.lastIndexOf(']'));
  for (let e = end; e > 0; e = Math.max(json.lastIndexOf('}', e - 1), json.lastIndexOf(']', e - 1))) { try { return JSON.parse(json.slice(0, e + 1)); } catch (err) { /* shorter */ } }
  throw new Error('unreadable JSON');
}
const lightDecode = s => pctChars(s).map(([c, enc]) => (c === '_' && !enc ? ' ' : c)).join('');
function splitTop(s) { // commas outside brackets and quotes
  const parts = []; let depth = 0, quote = null, cur = '';
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth <= 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}
function parseStyle(s) {
  const out = {};
  splitTop(s).forEach(pair => {
    const c = pair.indexOf(':');
    if (c < 1) return;
    const k = lightDecode(pair.slice(0, c)).trim(), raw = pair.slice(c + 1), def = DEFAULT_SETTINGS[k];
    if (LINK_PLAN_KEYS.includes(k)) return;
    try {
      let v;
      if (/^\s*(\{|\[|%7B|%5B)/i.test(raw)) v = parseLooseJson(raw);
      else if (/^(true|false|null)$/.test(raw)) v = JSON.parse(raw);
      else if (k === 'palette') v = PRESETS.find(p => p.id === lightDecode(raw));
      else if (LINK_DATE_KEYS.includes(k)) v = isoToDay(raw);
      else if (typeof def === 'number' || (def == null && /^-?\d+(\.\d+)?$/.test(raw))) v = +raw;
      else v = lightDecode(raw);
      if (k === 'daysOff' && Array.isArray(v)) v = v.map(r => ({ from: isoToDay(r.from), to: isoToDay(r.to), label: r.label }));
      if (v !== undefined && !(typeof v === 'number' && !Number.isFinite(v))) out[k] = v;
    } catch (e) { /* one bad setting doesn't spoil the link */ }
  });
  return out;
}
/** the plan object (and parsed style, if the link had one) → a sanitized state */
function linkPlanToState(o, style) {
  if (!o || typeof o !== 'object') return null;
  const list = Array.isArray(o.items) ? o.items : Array.isArray(o) ? o : null;
  if (!list) return null;
  const rows = [], pending = [], base = mondayOf(todayDay());
  const day = v => { const d = isoToDay(typeof v === 'string' ? v.trim() : ''); return d != null && plausibleDay(d) ? d : null; };
  const text = (v, n) => (typeof v === 'string' && v.trim() ? v.slice(0, n) : undefined);
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
    const row = newRow({ level: Math.min(level, 2), name: String(it.name == null ? it.title || '' : it.name).slice(0, 200), type: ms ? 'milestone' : 'task', start, end: ms ? start : end, assignee: String(it.owner || it.assignee || '').slice(0, 60) });
    if (it.progress === null) row.progress = null;
    else if (it.progress != null) { const pr = +String(it.progress).replace('%', ''); if (Number.isFinite(pr)) row.progress = clamp(Math.round(pr), 0, 100); }
    if (typeof it.status === 'string') row.status = it.status.toLowerCase();
    if (it.key === true) row.key = true;
    if (it.blocked) { row.blocked = true; if (typeof it.blocked === 'string') row.blockedNote = it.blocked; }
    if (text(it.blockedNote, 140)) row.blockedNote = it.blockedNote;
    if (text(it.note, 120)) row.note = it.note;
    if (it.noteOff === true) row.noteOff = true;
    if (text(it.changeNote, 140)) row.changeNote = it.changeNote;
    if (Array.isArray(it.baseline) && day(it.baseline[0]) != null) row.baseline = { s: day(it.baseline[0]), e: day(it.baseline[1]) != null ? day(it.baseline[1]) : day(it.baseline[0]) };
    if (it.color != null) row.color = it.color;
    if (typeof it.msAlign === 'string') row.msAlign = it.msAlign;
    if (it.keepTask === true && level === 0) row.keepTask = true;
    if (it.newLine === true) row.newLine = true;
    const after = it.after == null ? [] : Array.isArray(it.after) ? it.after : [it.after];
    rows.push(row); pending.push([row, it.id == null ? null : String(it.id), after.map(a => String(a).trim()).filter(Boolean)]);
    walk(kids, level + 1);
  });
  walk(list, 0);
  if (!rows.length) return null;
  const byId = new Map(), byName = new Map();
  pending.forEach(([r, id]) => { if (id != null && !byId.has(id)) byId.set(id, r.id); const k = r.name.trim().toLowerCase(); if (k && !byName.has(k)) byName.set(k, r.id); });
  pending.forEach(([r, , after]) => { r.deps = [...new Set(after.map(a => byId.get(a) || byName.get(a.toLowerCase())).filter(id => id && id !== r.id))]; });
  const settings = Object.assign({}, DEFAULT_SETTINGS, style || {}, { title: String(o.title == null ? 'Project plan' : o.title).slice(0, 120) });
  if (typeof o.status === 'string') settings.projectStatus = o.status.toLowerCase();
  if (!style) { // a plan an AI wrote from scratch: show what it filled in
    const has = f => rows.some(f);
    Object.assign(settings, { assignees: has(r => r.assignee), progress: has(r => r.progress > 0), deps: has(r => r.deps.length) });
  }
  if (o.today === true) settings.todayLine = true;
  if (['days', 'weeks', 'months', 'quarters', 'sprints'].includes(o.scale)) settings.scale = o.scale;
  return sanitize({ settings, rows });
}
/** the part after the # → a state, or null; throws on unreadable JSON */
function linkToState(hash) {
  const h = String(hash).replace(/^#/, '');
  const m = /(?:^|&)plan=/.exec(h);
  if (!m) return null;
  let style = null, plan = h.slice(m.index + m[0].length);
  const before = h.slice(0, m.index), sb = /(?:^|&)style=(.*)$/s.exec(before);
  if (sb) style = sb[1];
  const sa = plan.lastIndexOf('&style=');
  if (sa >= 0) { style = plan.slice(sa + 7); plan = plan.slice(0, sa); }
  return linkPlanToState(parseLooseJson(plan), style != null ? parseStyle(style) : null);
}
