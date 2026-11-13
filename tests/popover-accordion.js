// Item popover: collapsed sections, live summaries, footer never cut off, per-type variants
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(1000);
  console.log('version', await p.textContent('#version'));
  const fresh = () => p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars' }); sel = null; commit(); refresh(); });
  const clickBar = async n => { const r = await p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }, n); await p.mouse.click(r.x, r.y); await p.waitForTimeout(300); };
  const summary = () => p.evaluate(() => [...document.querySelectorAll('.pop .acc')].map(a => a.querySelector('.acc-t').textContent + ' = ' + a.querySelector('.acc-s').textContent.trim() + (a.classList.contains('open') ? ' [open]' : '')).join(' | '));
  const size = () => p.evaluate(() => { const r = document.querySelector('.pop').getBoundingClientRect(); return Math.round(r.height) + 'px tall, ' + Math.round(r.top) + '..' + Math.round(r.bottom); });
  await fresh(); await clickBar('Visual design');
  console.log('task popover   :', await summary(), '\n  size         :', await size());
  console.log('footer fits    :', await p.evaluate(() => { const f = document.querySelector('.pop .pop-foot'), pr = document.querySelector('.pop').getBoundingClientRect(); return [...f.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return b.textContent.trim() + (r.right <= pr.right - 4 ? ' ✓' : ' CUT OFF'); }).join('  '); }));
  await p.screenshot({ path: 'pop-collapsed.png', clip: { x: 300, y: 60, width: 700, height: 620 } });
  // open sections and use what is inside
  await p.click('[data-acc-toggle="assignees"]'); await p.fill('.pop [data-f="assignee-add"]', 'Priya Shah'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  console.log('assignee added :', await p.evaluate(() => state.rows.find(r => r.name === 'Visual design').assignee), '|', await summary());
  await p.click('[data-acc-toggle="deps"]'); const v = await p.evaluate(() => [...document.querySelectorAll('.pop [data-f="dep-add"] option')].find(o => /Wireframes/.test(o.textContent)).value); await p.selectOption('.pop [data-f="dep-add"]', v); await p.waitForTimeout(250);
  console.log('dependency     :', await p.evaluate(() => state.rows.find(r => r.name === 'Visual design').deps.length), '|', await summary());
  await p.click('[data-acc-toggle="progress"]'); await p.fill('.pop [data-f="progress"]', '40'); await p.waitForTimeout(150); console.log('progress 40    :', await p.evaluate(() => state.rows.find(r => r.name === 'Visual design').progress), '|', (await summary()).split('|')[0]);
  await p.click('[data-acc-toggle="colour"]'); await p.click('.pop .sw[data-color="2"]'); await p.waitForTimeout(250); console.log('colour         :', await p.evaluate(() => state.rows.find(r => r.name === 'Visual design').color), '|', (await summary()).split('|').pop());
  console.log('all open size  :', await size(), '| fits window', await p.evaluate(() => document.querySelector('.pop').getBoundingClientRect().bottom <= innerHeight));
  await p.screenshot({ path: 'pop-open.png', clip: { x: 300, y: 0, width: 700, height: 950 } });
  // remembered
  await p.keyboard.press('Escape'); await clickBar('Wireframes'); console.log('another item (sections remembered):', await summary());
  await p.reload(); await p.waitForTimeout(900); await clickBar('Wireframes'); console.log('after reload   :', await summary());
  // collapse them all again
  for (const id of ['assignees', 'deps', 'progress', 'colour']) await p.click(`[data-acc-toggle="${id}"]`); console.log('collapsed again:', await summary());
  // footer actions
  const shape = () => p.evaluate(() => derive(state.rows).filter(n => n.row.name === 'Wireframes').map(n => n.level + ':' + n.row.name).join(''));
  console.log('Indent / Outdent:', await shape()); await p.click('.pop-foot [data-act="indent"]').catch(() => {}); console.log(' after Indent  :', await shape(), '| Outdent enabled', await p.evaluate(() => !document.querySelector('.pop-foot [data-act="outdent"]').disabled));
  await p.click('.pop-foot [data-act="dup"]'); await p.waitForTimeout(250); console.log('Duplicate      :', await p.evaluate(() => state.rows.filter(r => r.name === 'Wireframes').length), 'copies');
  await p.keyboard.press('Escape');
  // milestone, parent, area, changed
  await fresh(); await clickBar('Design sign-off'); console.log('milestone      :', await summary()); await p.keyboard.press('Escape');
  await fresh(); await clickBar('UX & wireframes'); console.log('parent task    :', await summary()); await p.keyboard.press('Escape');
  await fresh(); await p.evaluate(() => { state.settings.areaLabels = 'side'; refresh(); }); { const r = await p.evaluate(() => { const id = state.rows.find(r => r.name === 'Design').id; const e = document.querySelector(`#chart [data-id="${id}"][data-role="row"]`).getBoundingClientRect(); return { x: e.x + 30, y: e.y + e.height / 2 }; }); await p.mouse.click(r.x, r.y); await p.waitForTimeout(300); }
  console.log('area           :', await summary(), '| buttons:', await p.evaluate(() => [...document.querySelectorAll('.pop .pop-btns button')].map(b => b.textContent.trim()).join(' / ')));
  await p.keyboard.press('Escape');
  await fresh(); await p.evaluate(() => { setBaseline(); state.settings.showChanges = true; state.rows.find(r => r.name === 'Visual design').end += 4; commit(); refresh(); }); await clickBar('Visual design'); console.log('changed item   :', await summary());
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
