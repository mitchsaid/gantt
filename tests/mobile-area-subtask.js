// Every item's actions are reachable without a keyboard: on a phone, tapping an area's (or any item's) name on the chart opens
// its popover, so an area can be deleted; popovers and the Plan panel's details offer “+ Subtask” and “+ Task below”.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
  const at = name => p.evaluate(nm => { const n = scene.info.find(x => x.row.name === nm); const box = svg.getBoundingClientRect(), s = box.width / scene.w; return { name: [box.left + (n.lx + 20) * s, box.top + n.cy * s], bar: [box.left + (n.bx + Math.min(n.bw / 2, 20)) * s, box.top + n.cy * s] }; }, name);
  let pt = await at('Design');
  await p.touchscreen.tap(...pt.name); await p.waitForTimeout(350);
  console.log('tap an area name → popover:', await p.evaluate(() => !!pop && pop.kind), '| Delete… shown:', await p.isVisible('.pop [data-act="area-del"]'));
  await p.tap('.pop [data-act="area-del"]'); await p.waitForTimeout(300);
  const dlg = await p.$$eval('.modal-back:not([hidden]) button, .dialog button', bs => bs.map(x => x.textContent.trim()));
  console.log('delete dialog buttons:', dlg.join(' | ') || '(none)');
  await p.screenshot({ path: 'area-delete.png' });
  const del = await p.$('.modal-back:not([hidden]) button.danger, .dialog button.danger');
  if (del) { await del.tap(); await p.waitForTimeout(300); }
  console.log('area gone:', await p.evaluate(() => !state.rows.some(r => r.name === 'Design')));
  // a task: + Subtask in its popover
  pt = await at('Stakeholder interviews');
  await p.touchscreen.tap(...pt.name); await p.waitForTimeout(350);
  console.log('task popover add buttons:', (await p.$$eval('.pop .pop-adds button', bs => bs.map(x => x.textContent))).join(' | '));
  await p.screenshot({ path: 'task-pop-adds.png' });
  await p.tap('.pop [data-act="sub-add"]'); await p.waitForTimeout(400);
  console.log('subtask added:', await p.evaluate(() => { const i = state.rows.findIndex(r => r.name === 'Stakeholder interviews'); const nx = state.rows[i + 1]; return nx.level === state.rows[i].level + 1 && nx.id === sel; }));
  await p.keyboard.press('Escape');
  await ctx.close();
  // desktop: the Plan panel's details and the popover offer the same buttons
  const d = await b.newPage({ viewport: { width: 1440, height: 900 } });
  d.on('pageerror', e => errs.push('ERR desktop ' + e.message));
  await d.goto('http://localhost:8765/'); await d.evaluate(() => localStorage.clear()); await d.reload(); await d.waitForTimeout(600);
  const id = await d.evaluate(() => state.rows.find(r => r.name === 'Audit & research').id);
  await d.click(`.orow[data-id="${id}"] .more`); await d.waitForTimeout(200);
  console.log('details buttons:', (await d.$$eval('.detail .pop-adds button', bs => bs.map(x => x.textContent))).join(' | '));
  await d.click('.detail [data-act="next-add"]'); await d.waitForTimeout(300);
  console.log('task below added:', await d.evaluate(i => { const k = state.rows.findIndex(r => r.id === i); return state.rows[k + 1].level === state.rows[k].level && state.rows[k + 1].id === sel; }, id));
  await d.keyboard.press('Escape');
  const bar = await d.evaluate(() => { const n = scene.info.find(x => x.row.name === 'Visual design'); const box = svg.getBoundingClientRect(), s = box.width / scene.w; return [box.left + (n.bx + n.bw / 2) * s, box.top + n.cy * s]; });
  await d.mouse.click(...bar); await d.waitForTimeout(300);
  await d.screenshot({ path: 'desktop-pop-adds.png' });
  console.log('desktop popover add buttons:', (await d.$$eval('.pop .pop-adds button', bs => bs.map(x => x.textContent))).join(' | '));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
