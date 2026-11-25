// A fixed-height canvas: Auto (and Compact) tighten the rows, and automatic text, until a long plan fits; the warning shows
// only when even the tightest rows can't, and offers fixes (dates after the bars, height follows the plan); Roomy is left as
// asked; a plan that already fits keeps its rows.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
  const run = (extra, density, fit) => p.evaluate(([extra, density, fit]) => {
    const st = JSON.parse(JSON.stringify(state));
    if (extra < 0) st.rows = st.rows.slice(0, st.rows.length + extra);
    for (let i = 0; i < extra; i++) st.rows.push({ ...st.rows[2], id: 'x' + i, name: 'Extra ' + i });
    Object.assign(st.settings, { fit: fit || 'fixed', density });
    const s = buildScene(st, {});
    return { row: s.rowH, fs: s.fs, need: s.needH, h: s.fixedPx, fits: s.fits };
  }, [extra, density, fit]);
  const say = (label, r) => console.log(label.padEnd(30), `row ${r.row} · text ${r.fs}px · needs ${r.need} of ${r.h} → ${r.fits ? 'fits' : 'does not fit'}`);
  const sample = await run(0, 'auto'), compact = await run(0, 'compact');
  say('sample, Auto:', sample); say('sample, Compact:', compact); say('sample, Roomy:', await run(0, 'roomy'));
  if (!sample.fits || !compact.fits) throw new Error('the sample plan should fit a 16:9 slide with Auto and Compact');
  if (compact.row > sample.row) throw new Error('Compact should never be taller than Auto');
  if (sample.need < sample.h * 0.95) throw new Error('Auto should fill the canvas, not just fit it');
  const short = await run(-12, 'auto');
  say('short plan, Auto:', short);
  if (short.fs < 14.5) throw new Error('a plan that fits needs no smaller text');
  const long = await run(30, 'auto');
  say('very long plan, Auto:', long);
  if (long.fits || long.fs !== 11) throw new Error('a plan too long for any row height should be at the smallest size and still warn');
  const content = await run(30, 'auto', 'content');
  say('very long plan, Fit content:', { ...content, h: content.need });
  // names with dates under them on the bars: the rows follow the text, so the text has to shrink for the plan to fit
  const two = await p.evaluate(() => {
    const st = JSON.parse(JSON.stringify(state)); st.rows = st.rows.slice(0, 8);
    Object.assign(st.settings, { fit: 'fixed', density: 'auto', taskLabels: 'bars', barDates: true, barDatesPos: 'in' });
    const a = buildScene(st, {}); st.settings.barDatesPos = 'beside'; const b = buildScene(st, {});
    return [{ row: a.rowH, fs: a.fs, need: a.needH, h: a.fixedPx, fits: a.fits }, { row: b.rowH, fs: b.fs, need: b.needH, h: b.fixedPx, fits: b.fits }];
  });
  say('dates under names:', two[0]); say('dates after the bars:', two[1]);
  if (!two[0].fits) throw new Error('dates under the names should still fit, with smaller text');
  if (two[1].row >= two[0].row) throw new Error('dates after the bars should make slimmer rows');
  // too long even squeezed: the warning offers fixes, and one click applies them
  await p.evaluate(() => { const base = state.rows.slice(); for (let i = 0; i < 6; i++) base.forEach(r => state.rows.push({ ...r, id: r.id + 'c' + i })); Object.assign(state.settings, { fit: 'fixed', taskLabels: 'bars', barDates: true, barDatesPos: 'in' }); commit(); refresh(); });
  await p.waitForTimeout(300);
  console.log('very long, dates under names → warning:', await p.evaluate(() => document.querySelector('#chart-warn').hidden ? 'hidden' : document.querySelector('#chart-warn').textContent));
  await p.click('#chart-warn [data-fix="dates"]'); await p.waitForTimeout(200);
  console.log('“Dates after the bars” →', await p.evaluate(() => state.settings.barDatesPos), '| toast:', await p.textContent('#toast'));
  await p.click('#chart-warn [data-fix="fit"]'); await p.waitForTimeout(200);
  console.log('“Height follows the plan” →', await p.evaluate(() => state.settings.fit), '| warning hidden:', await p.evaluate(() => document.querySelector('#chart-warn').hidden));
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(600); // back to the sample
  // the warning under the chart follows the scene
  await p.evaluate(() => { state.settings.fit = 'fixed'; commit(); refresh(); }); await p.waitForTimeout(300);
  console.log('sample on a slide → warning hidden:', await p.evaluate(() => document.querySelector('#chart-warn').hidden));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
  if (errs.length) process.exit(1);
})();
