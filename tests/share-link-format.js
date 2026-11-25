// The readable share link (#plan=…&style=…): every setting and item field survives a round trip, odd characters in names, lenient reading of AI-written variants, and its length
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    // a comparable view of a plan: everything stored, ids replaced by positions, derived area dates left out
    const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : v;
    const view = st => { const info = derive(st.rows), idx = new Map(st.rows.map((r, i) => [r.id, i]));
      return JSON.stringify(canon({ s: st.settings, r: st.rows.map((r, i) => { const o = Object.assign({}, r, { id: 0, deps: r.deps.map(d => idx.get(d)) }); if (info[i].hasKids) { delete o.start; delete o.end; } return o; }) })); };
    const out = {};
    const trip = st => { const h = planToLink(st); const back = linkToState('#' + h); return { h, same: view(back) === view(st), back }; };

    // 1. the sample plan as it comes
    let st = sampleState(); sanitize(st);
    let t = trip(st); out.sample = { same: t.same, length: ('https://slideline.co/#' + t.h).length, style: t.h.split('&style=')[1] || '' };

    // 2. everything changed: design settings of every kind, and every item field
    st = sampleState(); sanitize(st);
    Object.assign(st.settings, { title: "Ana's Q3 plan — 100% on_track & #1", projectStatus: 'amber', font: 'Playfair Display', canvas: 'custom', canvasW: 11.5, textPt: 14, scale: 'months',
      todayLine: true, todayDate: st.rows[3].start, todayLabel: 'Review, today: go', markerColor: '#ff0066', rangeMode: 'fixed', rangeStart: st.rows[1].start - 7, rangeEnd: st.rows[1].start + 120,
      daysOff: [{ from: st.rows[1].start + 30, to: st.rows[1].start + 34, label: 'Easter (long) weekend' }], assignees: true, progress: true, deps: true, criticalPath: true, dateOrder: 'mdy',
      statuses: [{ id: 'ok', name: 'Fine', color: '#00aa00' }, { id: 'bad', name: "Won't make it", color: '#aa0000' }],
      palette: { id: 'custom', name: 'Mine', text: 'dark', seed: '#123456', colors: ['#123456', '#abcdef', '#fedcba'] } });
    sanitize(st);
    const R = st.rows;
    Object.assign(R[2], { name: 'Stakeholder_interviews (round 2)', status: 'bad', key: true, note: "Priya's notes: 50% done, see #12", noteOff: true, changeNote: 'Moved: client asked', baseline: { s: R[2].start - 3, e: R[2].end - 3 }, color: 2, progress: null, blocked: true, blockedNote: 'Waiting for "legal"' });
    Object.assign(R[3], { color: '#ff8800', newLine: true, assignee: 'José Ñúñez 🚀', blockedNote: 'kept, not blocked' });
    const ms = R.find(x => x.type === 'milestone' && x.level > 0); ms.msAlign = 'end'; ms.key = true;
    R[R.length - 1].deps = [R[2].id, R[3].id];
    R.push(newRow({ level: 0, name: 'Top task with subtasks', keepTask: true, start: R[3].start, end: R[3].end + 3 }), newRow({ level: 1, name: 'Sub one', start: R[3].start, end: R[3].start + 2 }));
    sanitize(st);
    t = trip(st); out.everything = { same: t.same, length: t.h.length };
    if (!t.same) { const a = JSON.parse(view(t.back)), b2 = JSON.parse(view(st)); out.diff = Object.keys(b2.s).filter(k => JSON.stringify(a.s[k]) !== JSON.stringify(b2.s[k])).concat(b2.r.flatMap((row, i) => Object.keys(Object.assign({}, row, a.r[i])).filter(k => JSON.stringify(row[k]) !== JSON.stringify((a.r[i] || {})[k])).map(k => i + '.' + k + ' ' + JSON.stringify(row[k]) + ' vs ' + JSON.stringify((a.r[i] || {})[k])))); }
    out.everythingLink = t.h.slice(0, 260) + ' … ' + t.h.slice(-420);

    // 3. what an AI might send back: standard JSON fully encoded, standard JSON raw, the plan without style, base64, an edit by name, trailing junk
    const plain = JSON.stringify({ title: 'Edit test', items: [{ name: 'Phase', items: [{ id: 'a', name: 'Alpha task', start: '2027-02-01', end: '2027-02-05' }, { name: 'Beta', start: '2027-02-08', days: 5, after: ['a'] }, { name: 'Gamma', start: '2027-02-15', end: '2027-02-19', after: ['beta'] }] }] });
    const rows = s => s ? s.rows.map(r => r.name + (r.deps.length ? '<' + r.deps.length : '')).join('|') : 'FAILED';
    out.ai = {
      encoded: rows(linkToState('#plan=' + encodeURIComponent(plain))),
      raw: rows(linkToState('#plan=' + plain)),
      base64: rows(linkToState('#plan=' + btoa(plain).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))),
      trailingJunk: rows(linkToState('#plan=' + encodeURIComponent(plain) + ')')),
      styleFirst: (() => { const s = linkToState('#style=font:Lora,scale:months&plan=' + plain); return s.settings.font + ' ' + s.settings.scale; })(),
      quoteLightEdit: (() => { const h = planToLink(sampleState()).replace('Kickoff', 'Kick-off_call'); return linkToState('#' + h).rows[1].name; })(),
      cutOff: (() => { try { return rows(linkToState('#plan=' + plain.slice(0, 60))); } catch (e) { return 'throws: ' + e.message; } })(),
      noStyleShowsOwners: linkToState('#plan=' + encodeURIComponent(JSON.stringify({ items: [{ name: 'x', start: '2027-01-01', end: '2027-01-02', owner: 'Ana' }] }))).settings.assignees,
    };
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  if (!r.sample.same || !r.everything.same) throw new Error('round trip lost something: ' + JSON.stringify(r.diff));
  if (Object.values(r.ai).includes('FAILED')) throw new Error('an AI-written variant did not open');

  // the real thing: Share link → open in a fresh browser
  await p.evaluate(() => { state = sampleState(); state.settings.font = 'Lora'; state.rows[2].name = "O'Brien_&_co #2"; commit(); refresh(); });
  await p.click('#btn-share'); await p.waitForTimeout(500);
  const url = await p.evaluate(() => navigator.clipboard.readText());
  console.log('share link', url.length, url.slice(0, 180) + '…');
  const want = await p.evaluate(() => JSON.stringify({ s: state.settings, n: state.rows.map(r => r.name) }));
  const q = await (await b.newContext()).newPage(); q.on('pageerror', e => errs.push('ERR ' + e.message));
  await q.goto(url); await q.waitForTimeout(1200);
  console.log('opened in a fresh browser: same', await q.evaluate(w => JSON.stringify({ s: state.settings, n: state.rows.map(r => r.name) }) === w, want), '| hash cleared', await q.evaluate(() => location.hash === ''));
  if (errs.length) { console.log(errs.join('\n')); process.exitCode = 1; }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
