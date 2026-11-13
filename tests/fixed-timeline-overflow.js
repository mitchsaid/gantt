// Fixed timeline with items outside it: the warning, the dialog and 'Move only those in'
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  const setup = () => p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars', rangeMode: 'fixed', rangeStart: toDay(2026, 10, 9), rangeEnd: toDay(2026, 11, 18) }); sel = null; commit(); refresh(); });
  console.log('version', await p.textContent('#version'));
  const vis = () => p.evaluate(() => ({ notice: document.querySelector('#chart-out').hidden ? 'hidden' : document.querySelector('#chart-out').textContent.trim(), panel: [...document.querySelectorAll('#design [data-w="_outInfo"], #design [data-w="_pull"]')].map(e => e.hidden ? 'hidden' : (e.textContent || '').trim().slice(0, 70)).join(' | ') }));
  const spans = () => p.evaluate(() => { const S = state.settings; return derive(state.rows).filter(n => !n.hasKids).map(n => ({ name: n.row.name, a: n.start - S.rangeStart, z: S.rangeEnd - n.end, dur: n.end - n.start + 1 })).filter(x => x.a < 0 || x.z < 0).length; });
  await setup();
  console.log('fixed, items outside :', JSON.stringify(await vis()), '| outside count', await spans());
  await p.click('#chart-out [data-act="pull"]');
  console.log('dialog               :', await p.evaluate(() => document.querySelector('.dialog h2').textContent), '|', await p.evaluate(() => [...document.querySelectorAll('.dialog button')].map(b => b.textContent).join(' / ')));
  const before = await p.evaluate(() => JSON.stringify(derive(state.rows).filter(n => !n.hasKids).map(n => [n.row.name, n.start, n.end])));
  await p.click('.dialog [data-i="0"]'); await p.waitForTimeout(200);
  console.log('after "Move only"    :', JSON.stringify(await vis()), '| outside count', await spans());
  console.log('lengths kept         :', await p.evaluate(b4 => { const was = Object.fromEntries(JSON.parse(b4).map(([n, s, e]) => [n, e - s])); return derive(state.rows).filter(n => !n.hasKids).every(n => was[n.row.name] === n.end - n.start || n.end - n.start === state.settings.rangeEnd - state.settings.rangeStart); }, before), '| untouched items unchanged:', await p.evaluate(b4 => { const was = Object.fromEntries(JSON.parse(b4).map(([n, s, e]) => [n, [s, e]])); const S = state.settings; return derive(state.rows).filter(n => !n.hasKids).filter(n => was[n.row.name][0] >= S.rangeStart && was[n.row.name][1] <= S.rangeEnd).every(n => n.start === was[n.row.name][0] && n.end === was[n.row.name][1]); }, before));
  await p.click('#btn-undo'); console.log('undo                 :', JSON.stringify(await vis()), '| outside count', await spans());
  // the other choice
  await p.click('#chart-out [data-act="pull"]'); await p.click('.dialog [data-i="1"]'); await p.waitForTimeout(200);
  console.log('after "Spread all"   :', JSON.stringify(await vis()), '| outside count', await spans());
  // design panel route
  await setup(); await p.click('#design [data-act="pull"]'); console.log('design button dialog :', await p.evaluate(() => !!document.querySelector('.dialog'))); await p.click('.dialog [data-i="2"]');
  // not shown when auto or when everything fits
  await p.evaluate(() => { state.settings.rangeMode = 'auto'; refresh(); }); console.log('auto timeline       :', JSON.stringify(await vis()));
  await p.evaluate(() => { Object.assign(state.settings, { rangeMode: 'fixed', rangeStart: toDay(2026, 9, 1), rangeEnd: toDay(2027, 2, 1) }); refresh(); }); console.log('everything fits      :', JSON.stringify(await vis()));
  // a milestone and a very long task
  await setup(); await p.evaluate(() => { const r = state.rows.find(r => r.name === 'Go-live'); r.start = r.end = toDay(2027, 3, 1); const l = state.rows.find(r => r.name === 'Wireframes'); l.start = toDay(2026, 8, 1); l.end = toDay(2027, 4, 1); commit(); refresh(); });
  await p.click('#chart-out [data-act="pull"]'); await p.click('.dialog [data-i="0"]'); await p.waitForTimeout(200);
  console.log('milestone / long task:', await p.evaluate(() => { const S = state.settings, g = state.rows.find(r => r.name === 'Go-live'), w = state.rows.find(r => r.name === 'Wireframes'); return `Go-live ${dayToIso(g.start)} (range end ${dayToIso(S.rangeEnd)}) | Wireframes ${dayToIso(w.start)}..${dayToIso(w.end)}`; }));
  await p.locator('#canvas-wrap').screenshot({ path: 'out-after.png' });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
