// Up / Down moves the selection; Shift extends it; the popover follows
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 700 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  console.log('version', await p.textContent('#version'));
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars' }); sel = null; multi = new Set(); commit(); refresh(); });
  const cur = () => p.evaluate(() => selIds().map(id => state.rows.find(r => r.id === id).name).join(' | '));
  const key = k => p.keyboard.press(k).then(() => p.waitForTimeout(120));
  await key('ArrowDown'); console.log('Down, nothing selected :', await cur());
  await key('ArrowDown'); console.log('Down                   :', await cur());
  await key('ArrowDown'); console.log('Down                   :', await cur());
  await key('ArrowUp'); console.log('Up                     :', await cur());
  await key('Shift+ArrowDown'); await key('Shift+ArrowDown'); console.log('Shift+Down x2          :', await cur());
  await key('Shift+ArrowUp'); console.log('Shift+Up (shrinks)     :', await cur());
  await key('Shift+ArrowUp'); await key('Shift+ArrowUp'); console.log('Shift+Up past anchor   :', await cur());
  await key('ArrowDown'); console.log('Down from a range      :', await cur());
  await key('Escape');
  await key('ArrowUp'); console.log('Up, nothing selected   :', await cur(), '(last row)');
  await key('ArrowDown'); console.log('Down at the end stays  :', await cur());
  const n = await p.evaluate(() => state.rows.length);
  for (let i = 0; i < n; i++) await key('ArrowUp'); console.log('Up to the top          :', await cur());
  // popover follows
  await p.evaluate(() => { const id = state.rows[1].id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`); if (e) { const r = e.getBoundingClientRect(); return null; } });
  const bar = await p.evaluate(() => { const id = state.rows.find(r => r.name === 'Wireframes').id; const r = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.click(bar.x, bar.y); await p.waitForTimeout(300);
  console.log('popover open for       :', await p.evaluate(() => pop && pop.kind + ':' + state.rows.find(r => r.id === pop.id).name), '| focus', await p.evaluate(() => document.activeElement.id || document.activeElement.tagName));
  await p.evaluate(() => document.activeElement.blur()); await key('ArrowDown');
  console.log('after Down, popover for:', await p.evaluate(() => pop ? pop.kind + ':' + state.rows.find(r => r.id === pop.id).name : 'closed'), '| selected', await cur());
  // typing in a name field does not navigate
  await p.focus('#pop-name').catch(() => {}); const before = await cur(); await key('ArrowDown'); console.log('arrow inside a field leaves selection:', before === await cur());
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
