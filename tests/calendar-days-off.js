// Non-working days: shading, legend key, working-day note in the popover
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  console.log('version', await p.textContent('#version'));
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars', keyStrip: true, daysOff: [{ from: toDay(2026, 10, 26), to: toDay(2026, 10, 27), label: 'Thanksgiving' }, { from: toDay(2026, 11, 24), to: toDay(2026, 11, 31), label: 'Winter shutdown' }] }); sel = null; commit(); refresh(); document.activeElement.blur(); });
  console.log('off shading rects:', await p.evaluate(() => scene.items.filter(i => i.t === 'rect' && i.w > 1 && i.h > 300 && !i.hit && i.fill !== state.settings.bg).length));
  console.log('legend has key  :', await p.evaluate(() => scene.items.some(i => i.t === 'text' && i.text === 'Non-working day')));
  console.log('control count   :', await p.evaluate(() => document.querySelectorAll('#off-list').length), '| list rows', await p.evaluate(() => document.querySelectorAll('#off-list > *').length));
  const r = await p.evaluate(() => { const id = state.rows.find(r => r.name === 'Content migration').id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await p.mouse.click(r.x, r.y); await p.waitForTimeout(300);
  console.log('popover note    :', await p.evaluate(() => (document.querySelector('.pop .note.wd') || {}).textContent));
  console.log('workingDays 30 Nov–18 Dec (shutdown 24–31 Dec not in span):', await p.evaluate(() => workingDays(toDay(2026, 10, 30), toDay(2026, 11, 18), state.settings.daysOff)), '| 21–31 Dec:', await p.evaluate(() => workingDays(toDay(2026, 11, 21), toDay(2026, 11, 31), state.settings.daysOff)));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.screenshot({ path: 'cal-1.png', clip: { x: 430, y: 60, width: 1120, height: 940 } });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
