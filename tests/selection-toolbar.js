// The selection toolbar: placement, staying attached on scroll/zoom, and its actions
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.settings.taskLabels = 'bars'; sel = null; commit(); refresh(); });
  console.log('version', await p.textContent('#version'));
  const rect = n => p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; const r = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, n);
  const click = async (n, mod) => { const r = await rect(n); if (mod) await p.keyboard.down('Shift'); await p.mouse.click(r.x + r.w / 2, r.y + r.h / 2); if (mod) await p.keyboard.up('Shift'); await p.waitForTimeout(150); };
  await click('Visual design'); await click('Wireframes', true);
  const bar = () => p.evaluate(() => { const r = document.querySelector('#selbar').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), hidden: document.querySelector('#selbar').hidden }; });
  const sels = () => p.evaluate(() => selIds().map(id => { const r = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.right), Math.round(r.bottom)]; }));
  console.log('selected bars :', JSON.stringify(await sels()));
  console.log('toolbar       :', JSON.stringify(await bar()));
  await p.screenshot({ path: 'sel-1.png', clip: { x: 320, y: 100, width: 920, height: 520 } });
  // selection at the very top of the chart: falls back below
  await p.evaluate(() => { select(null); }); await click('Kickoff'); await p.keyboard.press('Escape'); await p.waitForTimeout(150); await click('Stakeholder interviews', true);
  console.log('top selection :', JSON.stringify(await sels()), '->', JSON.stringify(await bar()));
  // scroll/zoom keeps it attached
  await p.evaluate(() => { document.querySelector('#zoom-in').click(); }); await p.waitForTimeout(250);
  console.log('after zoom    :', JSON.stringify(await sels()), '->', JSON.stringify(await bar()));
  // actions still work
  await p.click('[data-sel="group"]'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
  console.log('after group   : areas', await p.evaluate(() => derive(state.rows).filter(n => n.isArea).length), '| toolbar hidden', (await bar()).hidden);
  await p.click('#btn-undo');
  await p.keyboard.press('Escape'); await click('Visual design'); await p.keyboard.press('Escape'); await click('Wireframes', true); await p.click('[data-sel="clear"]');
  console.log('after clear   : hidden', (await bar()).hidden, '| selection', await p.evaluate(() => selIds().length));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
