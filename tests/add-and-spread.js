// Adding tasks (length, position), the 'Spread tasks' button and its undo
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  console.log('version', await p.textContent('#version'));
  // adding tasks behaves as it did before: each follows the previous one's end, five days long
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.rows = []; sel = null; commit(); refresh(); });
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Enter'); await p.keyboard.type('One'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('Escape');
  for (const n of ['Two', 'Three', 'Four']) { await p.click('[data-add="task"][data-chart]'); await p.waitForTimeout(250); await p.keyboard.type(n); await p.keyboard.press('Enter'); await p.waitForTimeout(150); await p.keyboard.press('Escape'); }
  console.log('adding tasks     :', await p.evaluate(() => state.rows.map((r, i, a) => r.name + ' ' + dayToIso(r.start).slice(5) + '..' + dayToIso(r.end).slice(5) + ' (' + (r.end - r.start + 1) + 'd' + (i ? ', gap ' + (r.start - a[i - 1].end - 1) : '') + ')').join(' | ')));
  // with a fixed timeline: still no stretching on add
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.rows = state.rows.slice(0, 3); Object.assign(state.settings, { rangeMode: 'fixed', rangeStart: state.rows[0].start, rangeEnd: state.rows[0].start + 60 }); sel = null; commit(); refresh(); });
  for (let i = 0; i < 3; i++) { await p.click('[data-add="task"][data-chart]'); await p.waitForTimeout(250); await p.keyboard.press('Escape'); }
  console.log('fixed timeline   :', await p.evaluate(() => state.rows.slice(3).map(r => (r.end - r.start + 1) + 'd').join(', ')), '(each five days)');
  // the chart button toggles
  const btn = () => p.evaluate(() => { const e = document.querySelector('#chart-spread'); return e.hidden ? 'hidden' : e.getAttribute('aria-pressed') + ' | ' + e.textContent.trim(); });
  const dates = () => p.evaluate(() => JSON.stringify(derive(state.rows).filter(n => !n.hasKids).map(n => [n.row.start, n.row.end])));
  const d0 = await dates(); console.log('button before    :', await btn());
  await p.click('#chart-spread'); await p.waitForTimeout(250); const d1 = await dates(); console.log('after 1st click  :', await btn(), '| dates changed', d1 !== d0);
  await p.click('#chart-spread'); await p.waitForTimeout(250); console.log('after 2nd click  :', await btn(), '| back to original', (await dates()) === d0);
  await p.click('#chart-spread'); await p.waitForTimeout(250); console.log('3rd click spreads again:', (await dates()) === d1);
  // editing something after a spread resets the toggle (button spreads again instead of restoring)
  await p.evaluate(() => { state.rows[0].end += 2; commit(); refresh(); }); console.log('after an edit    :', await btn());
  // Design panel button and undo still work
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { rangeMode: 'fixed', rangeStart: toDay(2026, 10, 9), rangeEnd: toDay(2026, 11, 18) }); sel = null; commit(); refresh(); });
  const e0 = await dates(); await p.click('#design [data-act="fit"]'); await p.waitForTimeout(250); console.log('design button    :', await btn(), '| changed', (await dates()) !== e0);
  await p.click('#chart-spread'); await p.waitForTimeout(250); console.log('chart button undoes the design button\'s spread:', (await dates()) === e0);
  await p.click('#chart-spread'); await p.click('#btn-undo'); console.log('Ctrl+Z path      :', (await dates()) === e0);
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
