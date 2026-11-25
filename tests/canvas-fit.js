// A fixed-height canvas: Auto (and Compact) tighten the rows, and automatic text, until a long plan fits; the warning shows
// only when even the tightest rows can't; Roomy is left as asked; a plan that already fits keeps its rows.
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
  // the warning under the chart follows the scene
  await p.evaluate(() => { state.settings.fit = 'fixed'; commit(); refresh(); }); await p.waitForTimeout(300);
  console.log('sample on a slide → warning hidden:', await p.evaluate(() => document.querySelector('#chart-warn').hidden));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
  if (errs.length) process.exit(1);
})();
