// Item popover: stacked rows, the status menu and status editor, one + Add, pages with a way back, notes in the legend
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.settings.taskLabels = 'bars'; sel = null; commit(); refresh(); });
  const clickBar = async n => { const r = await p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + Math.min(e.width / 2, 8), y: e.y + e.height / 2 }; }, n); await p.mouse.click(r.x, r.y); await p.waitForTimeout(250); };
  const rows = () => p.evaluate(() => [...document.querySelectorAll('.pop .prow')].map(a => a.querySelector('.pk').textContent + '=' + a.querySelector('.pv').textContent.trim()).join(' | '));
  const width = () => p.evaluate(() => Math.round(document.querySelector('.pop').getBoundingClientRect().width));
  const R = n => p.evaluate(n => state.rows.find(r => r.name === n), n);
  for (const n of ['Wireframes', 'Design sign-off', 'Design']) { await clickBar(n); console.log(n.padEnd(16), ':', await rows(), '| add', await p.evaluate(() => !!document.querySelector('.pop [data-pmenu="add"]'))); await p.keyboard.press('Escape'); }
  await clickBar('Wireframes');
  const w0 = await width();
  await p.click('.pop [data-pmenu="status"]'); await p.waitForTimeout(100);
  console.log('status menu      :', await p.evaluate(() => [...document.querySelectorAll('.pop-menu .mi')].map(b => b.textContent.trim()).join(' / ')));
  await p.click('.pop-menu [data-mstatus="red"]'); await p.waitForTimeout(150);
  console.log('status set       :', (await R('Wireframes')).status, '| width', w0, '->', await width());
  await p.click('.pop [data-pmenu="add"]'); await p.waitForTimeout(100);
  console.log('add menu         :', await p.evaluate(() => [...document.querySelectorAll('.pop-menu .mi')].map(b => b.firstChild.firstChild.textContent).join(' / ')));
  await p.click('.pop-menu [data-madd="note"]'); await p.waitForTimeout(150);
  console.log('note page        :', await p.textContent('.pop .pop-ptitle'), '| focus', await p.evaluate(() => document.activeElement.dataset.f));
  await p.keyboard.type('Waiting on brand guidelines'); await p.waitForTimeout(150);
  console.log('legend           :', await p.evaluate(() => scene.items.filter(i => i.t === 'text' && /brand guidelines/.test(i.text)).map(i => i.text).join(' / ')), '| badge', await p.evaluate(() => scene.info.find(n => n.row.name === 'Wireframes').cmtNo));
  await p.click('.pop [data-f="noteOn"]'); await p.waitForTimeout(150);
  console.log('private note     :', (await R('Wireframes')).noteOff, '| in legend', await p.evaluate(() => scene.items.some(i => i.t === 'text' && /brand guidelines/.test(i.text))));
  await p.click('.pop [data-f="noteOn"]'); await p.waitForTimeout(100);
  await p.keyboard.press('Escape'); await p.waitForTimeout(100); // Esc on a page goes back
  console.log('back to rows     :', await rows());
  await p.click('.pop [data-prow="who"]'); await p.waitForTimeout(100);
  await p.keyboard.type('Sam Ortiz'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  console.log('assignees        :', (await R('Wireframes')).assignee);
  await p.click('.pop [data-pback]'); await p.waitForTimeout(100);
  // statuses editor: rename, add, reorder, remove
  await p.click('.pop [data-pmenu="status"]'); await p.click('.pop-menu [data-mpage="statuses"]'); await p.waitForTimeout(150);
  await p.fill('.pop [data-f="sname-1"]', 'Needs a decision'); await p.waitForTimeout(100);
  await p.click('.pop [data-pact="s-add"]'); await p.keyboard.press('Control+A'); await p.keyboard.type('Blocked'); await p.waitForTimeout(100);
  console.log('blocked hint     :', await p.evaluate(() => !document.querySelector('.pop [data-bhint]').hidden));
  await p.click('.pop [data-pact="s-up"][data-i="3"]'); await p.waitForTimeout(100);
  console.log('statuses         :', await p.evaluate(() => state.settings.statuses.map(s => s.name).join(' > ')));
  await p.click('.pop [data-pact="s-del"][data-i="3"]'); await p.waitForTimeout(100);
  console.log('after remove     :', await p.evaluate(() => state.settings.statuses.map(s => s.name).join(' > ')), '| Wireframes status', (await R('Wireframes')).status || '(cleared)');
  console.log('design options   :', await p.evaluate(() => [...document.querySelectorAll('#design select[data-k="projectStatus"] option')].map(o => o.textContent).join(', ')));
  await p.evaluate(() => { const r = state.rows.find(r => r.name === 'Visual design'); r.status = state.settings.statuses[1].id; commit(); refresh(); });
  console.log('area rolls up    :', await p.evaluate(() => { const n = derive(state.rows).find(n => n.row.name === 'Design'); return STATUS[n.stat][0] + (n.statRolled ? ' (rolled)' : ''); }));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // persistence and share-link round trip
  await p.evaluate(() => { commit(); }); await p.reload(); await p.waitForTimeout(800);
  console.log('after reload     :', await p.evaluate(() => state.settings.statuses.map(s => s.name).join(' > ') + ' | note: ' + state.rows.find(r => r.name === 'Wireframes').note));
  console.log('share round trip :', await p.evaluate(async () => { const st = linkToState('#' + planToLink(state)); return st.settings.statuses.length + ' statuses, note ' + st.rows.find(r => r.name === 'Wireframes').note; }));
  // an empty note is no note
  await clickBar('Visual design'); await p.click('.pop [data-pmenu="add"]'); await p.click('.pop-menu [data-madd="note"]'); await p.waitForTimeout(100); await p.click('.pop [data-pback]'); await p.waitForTimeout(100);
  console.log('empty note gone  :', (await R('Visual design')).note === undefined);
  // + Add Progress turns progress on for that bar only
  await p.click('.pop [data-pmenu="add"]'); await p.click('.pop-menu [data-madd="progress"]'); await p.waitForTimeout(150);
  console.log('progress         :', await p.evaluate(() => state.settings.progress + ' | tracked: ' + state.rows.filter(r => r.progress != null && r.type !== 'milestone').map(r => r.name).join(', ')));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
