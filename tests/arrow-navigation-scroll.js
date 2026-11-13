// Arrow navigation keeps the selected row in view on a long list
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1400, height: 600 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars' }); for (let i = 0; i < 40; i++) state.rows.push({ id: 'x' + i, name: 'Extra ' + i, level: 1, start: state.rows[0].start + i, end: state.rows[0].start + i + 3, deps: [] }); sel = null; multi = new Set(); commit(); refresh(); });
  await p.evaluate(() => document.activeElement.blur());
  const n = await p.evaluate(() => state.rows.length);
  for (let i = 0; i < n; i++) await p.keyboard.press('ArrowDown');
  await p.waitForTimeout(300);
  console.log('selected', await p.evaluate(() => state.rows.find(r => r.id === sel).name), '| in view:', await p.evaluate(() => { const e = document.querySelector(`#chart [data-role="move"][data-id="${sel}"]`).getBoundingClientRect(); return e.top >= 0 && e.bottom <= innerHeight; }));
  for (let i = 0; i < n; i++) await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(300);
  console.log('selected', await p.evaluate(() => state.rows.find(r => r.id === sel).name), '| in view:', await p.evaluate(() => { const e = document.querySelector(`#chart [data-role="move"][data-id="${sel}"]`).getBoundingClientRect(); return e.top >= 0 && e.bottom <= innerHeight; }));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
