// Selecting several without a keyboard: Plan → Select (or the select button in an item's popover) turns taps on the chart and on
// Plan rows into add / remove; the selection bars (on the chart, and at the top of the Plan panel) group, even out, duplicate
// and delete; Done or Esc ends it. Desktop keeps Shift / Ctrl-click.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
  const at = name => p.evaluate(nm => { const n = scene.info.find(x => x.row.name === nm); const box = svg.getBoundingClientRect(), s = box.width / scene.w; return [box.left + (n.bx + Math.min(n.bw / 2, 30)) * s, box.top + n.cy * s]; }, name);
  const picked = () => p.evaluate(() => selIds().map(id => state.rows.find(r => r.id === id).name).join(', '));
  const cut = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return 'hidden'; const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth ? 'fits' : 'CUT OFF'; }, sel);
  // from a popover: tap a bar, then its select button
  await p.touchscreen.tap(...await at('Stakeholder interviews')); await p.waitForTimeout(300);
  console.log('popover has a select button:', await p.isVisible('.pop [data-act="pick"]'));
  await p.tap('.pop [data-act="pick"]'); await p.waitForTimeout(250);
  console.log('select mode:', await p.evaluate(() => selecting), '| popover closed:', await p.evaluate(() => !pop), '| bar:', await p.textContent('#selbar .selbar-count'));
  await p.touchscreen.tap(...await at('Audit & research')); await p.waitForTimeout(250);
  await p.touchscreen.tap(...await at('UX & wireframes')); await p.waitForTimeout(250);
  console.log('after two taps:', await picked(), '| bar:', await p.textContent('#selbar .selbar-count'), '| on screen:', await cut('#selbar'));
  await p.screenshot({ path: 'select-chart.png' });
  await p.touchscreen.tap(...await at('UX & wireframes')); await p.waitForTimeout(250);
  console.log('tap again removes it:', await picked());
  await p.tap('#selbar [data-sel="dup"]'); await p.waitForTimeout(300);
  console.log('duplicate →', await p.evaluate(() => state.rows.filter(r => r.name === 'Audit & research').length), 'copies of Audit & research');
  await p.tap('#selbar [data-sel="done"]'); await p.waitForTimeout(250);
  console.log('Done ends it:', await p.evaluate(() => !selecting && !selIds().length));
  // from the Plan sheet
  await p.tap('[data-sheet="panel-plan"]'); await p.waitForTimeout(350);
  await p.tap('#plan-select'); await p.waitForTimeout(250);
  const rowTap = async nm => { const id = await p.evaluate(n => state.rows.find(r => r.name === n).id, nm); await p.tap(`.orow[data-id="${id}"]`, { position: { x: 140, y: 18 } }); await p.waitForTimeout(200); };
  await rowTap('Visual design'); await rowTap('Design sign-off');
  console.log('plan taps:', await picked(), '| plan bar:', await p.textContent('#plan-selbar .selbar-count'), '| fits:', await cut('#plan-selbar'), '| a name field took focus:', await p.evaluate(() => document.activeElement.classList.contains('nm')));
  await p.screenshot({ path: 'select-plan.png' });
  await p.tap('#plan-selbar [data-sel="del"]'); await p.waitForTimeout(250);
  const d = await p.$('.modal-back:not([hidden]) button.danger, .dialog button.danger'); if (d) { await d.tap(); await p.waitForTimeout(250); }
  console.log('deleted:', await p.evaluate(() => !state.rows.some(r => r.name === 'Visual design' || r.name === 'Design sign-off')), '| still selecting:', await p.evaluate(() => selecting));
  await p.tap('#plan-select'); await p.waitForTimeout(200);
  console.log('header button ends it:', await p.evaluate(() => !selecting), '| label:', await p.textContent('#plan-select'));
  await ctx.close();
  // desktop: Esc ends select mode; plain clicks select one again afterwards
  const w = await b.newPage({ viewport: { width: 1440, height: 900 } });
  w.on('pageerror', e => errs.push('ERR desktop ' + e.message));
  await w.goto('http://localhost:8765/'); await w.evaluate(() => localStorage.clear()); await w.reload(); await w.waitForTimeout(600);
  await w.click('#plan-select');
  for (const nm of ['Kickoff', 'Wireframes']) { const id = await w.evaluate(n => state.rows.find(r => r.name === n).id, nm); await w.click(`.orow[data-id="${id}"]`, { position: { x: 120, y: 15 } }); }
  console.log('desktop picks:', await w.evaluate(() => selIds().length), '| chart bar:', await w.evaluate(() => !document.querySelector('#selbar').hidden));
  await w.screenshot({ path: 'select-desktop.png' });
  await w.keyboard.press('Escape');
  console.log('Esc ends it:', await w.evaluate(() => !selecting));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
