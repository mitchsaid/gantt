// Selecting an item and typing renames it, in the popover and on the chart
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  const fresh = o => p.evaluate(o => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, o); sel = null; commit(); refresh(); }, o);
  const name = n => p.evaluate(n => { const r = state.rows.find(r => r.id === n); return r ? r.name : 'gone'; }, n);
  const idOf = n => p.evaluate(n => state.rows.find(r => r.name === n).id, n);
  const clickBar = async n => { const r = await p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }, n); await p.mouse.click(r.x, r.y); await p.waitForTimeout(250); };
  console.log('version', await p.textContent('#version'));
  // 1. click a bar (popover opens) and type
  await fresh({ taskLabels: 'bars' }); let id = await idOf('Visual design'); await clickBar('Visual design');
  await p.keyboard.type('Brand guidelines'); await p.waitForTimeout(200);
  console.log('click, then type (popover):', JSON.stringify(await name(id)), '| focus in', await p.evaluate(() => document.activeElement.id || document.activeElement.className));
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  // 2. selected, popover closed, names on the bars
  await fresh({ taskLabels: 'bars' }); id = await idOf('Visual design'); await p.evaluate(id => { select(id); document.activeElement && document.activeElement.blur(); }, id);
  await p.keyboard.type('Wireframe review'); await p.waitForTimeout(200);
  console.log('selected, names on bars   :', JSON.stringify(await name(id)), '| inline editor open', await p.evaluate(() => !!document.querySelector('.inline-edit')), '| popover', await p.evaluate(() => !document.querySelector('.pop').hidden));
  await p.keyboard.press('Enter'); await p.waitForTimeout(150); console.log('  after Enter             :', JSON.stringify(await name(id)), '| editor closed', await p.evaluate(() => !document.querySelector('.inline-edit')));
  // 3. names on the left
  await fresh({ taskLabels: 'left' }); id = await idOf('Visual design'); await p.evaluate(id => { select(id); document.activeElement && document.activeElement.blur(); }, id);
  await p.keyboard.type('Left label'); await p.keyboard.press('Enter'); await p.waitForTimeout(150); console.log('names on the left         :', JSON.stringify(await name(id)));
  // 4. Escape puts the old name back
  await fresh({ taskLabels: 'left' }); id = await idOf('Visual design'); await p.evaluate(id => { select(id); document.activeElement && document.activeElement.blur(); }, id);
  await p.keyboard.type('Oops'); await p.keyboard.press('Escape'); await p.waitForTimeout(150); console.log('Escape reverts            :', JSON.stringify(await name(id)));
  // 5. an area and a milestone
  for (const n of ['Design', 'Kickoff']) { await fresh({ areaLabels: 'side', taskLabels: 'left' }); id = await idOf(n); await p.evaluate(id => { select(id); document.activeElement && document.activeElement.blur(); }, id); await p.keyboard.type('Renamed ' + n); await p.keyboard.press('Enter'); await p.waitForTimeout(150); console.log(n.padEnd(10) + '                :', JSON.stringify(await name(id))); }
  // 6. F2 edits the existing name
  await fresh({ taskLabels: 'left' }); id = await idOf('Visual design'); await p.evaluate(id => { select(id); document.activeElement && document.activeElement.blur(); }, id);
  await p.keyboard.press('F2'); await p.waitForTimeout(150); console.log('F2                        : editor value', JSON.stringify(await p.evaluate(() => (document.querySelector('.inline-edit') || {}).value)), '(selected text, ready to overtype)'); await p.keyboard.press('Escape');
  // 7. not when several are selected, nothing selected, a modifier is held, or a space starts it
  await fresh({ taskLabels: 'left' }); const names0 = await p.evaluate(() => JSON.stringify(state.rows.map(r => r.name)));
  await p.keyboard.type('zzz'); console.log('nothing selected          :', names0 === await p.evaluate(() => JSON.stringify(state.rows.map(r => r.name))) ? 'ignored' : 'CHANGED');
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Wireframes').id); multiSelect(state.rows.find(r => r.name === 'Site map & flows').id, 'range'); document.activeElement && document.activeElement.blur(); });
  await p.keyboard.type('qqq'); console.log('two selected              :', names0 === await p.evaluate(() => JSON.stringify(state.rows.map(r => r.name))) ? 'ignored' : 'CHANGED');
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Wireframes').id); }); await p.keyboard.press('Alt+KeyM'); await p.keyboard.press('Control+KeyB'); await p.keyboard.press(' '); console.log('Alt+M / Ctrl+B / space    :', await p.evaluate(() => state.rows.find(r => r.name === 'Wireframes') ? 'name unchanged (Alt+M made it a milestone: ' + (derive(state.rows).find(n => n.row.name === 'Wireframes').milestone) + ')' : 'RENAMED'));
  // 8. typing in the Plan panel still works normally
  await fresh({}); await p.evaluate(() => { const id = state.rows.find(r => r.name === 'Visual design').id; select(id); detailId = id; renderOutline(); });
  await p.focus('.orow.sel .nm'); await p.keyboard.type('!'); console.log('typing in a Plan name field:', await p.evaluate(() => state.rows.find(r => r.id === sel).name));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
