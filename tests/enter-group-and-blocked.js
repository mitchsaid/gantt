// Enter on several items groups them into an area; blocked items (popover, Alt+B, legend, persistence)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  console.log('version', await p.textContent('#version'));
  const fresh = (extra) => p.evaluate((extra) => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars' }, extra || {}); sel = null; multi = new Set(); commit(); refresh(); document.activeElement.blur(); }, extra);
  const clickBar = async n => { const r = await p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }, n); await p.mouse.click(r.x, r.y); await p.waitForTimeout(300); };
  const nm = id => p.evaluate(id => state.rows.find(r => r.id === id).name, id);
  // ---- Enter with several selected
  await fresh();
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Shift+ArrowDown');
  const before = await p.evaluate(() => state.rows.length);
  await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
  console.log('Enter on 2 items   :', await p.evaluate(b => { const i = state.rows.findIndex(r => r.name === 'New area'); return `rows ${b} -> ${state.rows.length}; ` + state.rows.slice(i - 1, i + 4).map(r => r.level + ':' + r.name).join(' / '); }, before));
  await fresh();
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Shift+ArrowDown');
  const b2 = await p.evaluate(() => state.rows.length);
  await p.keyboard.press('Shift+Enter'); await p.waitForTimeout(300);
  console.log('Shift+Enter on 2   :', await p.evaluate(b => `rows ${b} -> ${state.rows.length}; new line after "${state.rows[3].name}" at level ${state.rows[3].level} (blank name: ${state.rows[3].name === ''})`, b2));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await fresh(); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); const b3 = await p.evaluate(() => state.rows.length); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  console.log('Enter on 1 (as before):', b3, '->', await p.evaluate(() => state.rows.length)); await p.keyboard.press('Escape');
  // ---- blocked
  await fresh({ progress: true, todayLine: true });
  await p.evaluate(() => { state.rows.forEach(r => { r.progress = r.name === 'Wireframes' ? 100 : r.progress; }); commit(); refresh(); });
  await clickBar('Visual design');
  console.log('popover sections   :', await p.evaluate(() => [...document.querySelectorAll('.pop .acc')].map(a => a.querySelector('.acc-t').textContent + '=' + a.querySelector('.acc-s').textContent.trim()).join(' | ')));
  await p.click('[data-acc-toggle="blocked"]'); await p.click('.pop [data-f="blocked"]'); await p.waitForTimeout(250);
  console.log('after ticking      :', await p.evaluate(() => state.rows.find(r => r.name === 'Visual design').blocked), '| note enabled', await p.evaluate(() => !document.querySelector('.pop [data-f="blockedNote"]').disabled), '| focus', await p.evaluate(() => document.activeElement.dataset.f));
  await p.keyboard.type('Waiting on brand guidelines from the client'); await p.waitForTimeout(300);
  console.log('summary / stored   :', await p.evaluate(() => document.querySelector('.pop [data-acc="blocked"] .acc-s').textContent.trim() + ' | ' + state.rows.find(r => r.name === 'Visual design').blockedNote));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  // dependency chain: Design sign-off depends on Visual design (sample), check which items are "waiting"
  const sc = await p.evaluate(() => ({ lines: scene.items.filter(i => i.t === 'line' && i.sw === 1.4).length, light: scene.items.filter(i => i.t === 'line' && i.sw === 1 && i.stroke && i.x2 - i.x1 > 0 && i.x2 - i.x1 < 40).length, badges: scene.items.filter(i => i.t === 'text' && i.text === '!').length, deps: state.rows.filter(r => r.deps.length).map(r => r.name + '<-' + r.deps.map(d => state.rows.find(x => x.id === d).name)).join('; ') }));
  console.log('scene              :', JSON.stringify(sc));
  await p.screenshot({ path: 'blocked-1.png', clip: { x: 0, y: 0, width: 1500, height: 900 } });
  // Alt+B on a multi selection, then single
  await p.evaluate(() => { document.activeElement.blur(); });
  await clickBar('Front-end'); await p.keyboard.press('Escape'); await p.keyboard.press('Alt+KeyB'); await p.waitForTimeout(250);
  console.log('Alt+B on Front-end :', await p.evaluate(() => state.rows.find(r => r.name === 'Front-end').blocked), '| toast', await p.evaluate(() => (document.querySelector('.toast, #toast') || {}).textContent));
  await p.keyboard.press('Alt+KeyB'); await p.waitForTimeout(200); console.log('Alt+B again        :', await p.evaluate(() => state.rows.find(r => r.name === 'Front-end').blocked));
  await p.keyboard.press('Alt+KeyB'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowDown');
  // area
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Build').id); }); await p.keyboard.press('Alt+KeyB'); await p.waitForTimeout(200);
  console.log('Alt+B on an area   :', await p.evaluate(() => state.rows.find(r => r.name === 'Build').blocked), '(areas refuse)');
  // other settings + roundtrip
  await p.evaluate(() => { state.settings.blockedWaiting = false; refresh(); });
  console.log('waiting off        :', await p.evaluate(() => scene.items.filter(i => i.t === 'line' && i.sw === 1 && i.x2 - i.x1 < 40 && i.x2 - i.x1 > 1).length), 'light stripes');
  await p.evaluate(() => { state.settings.blockedWaiting = true; refresh(); commit(); }); await p.reload(); await p.waitForTimeout(800);
  console.log('after reload       :', await p.evaluate(() => state.rows.filter(r => r.blocked).map(r => r.name + (r.blockedNote ? ' ("' + r.blockedNote + '")' : '')).join(', ')));
  // exports don't break
  const ex = await p.evaluate(() => { try { const c = document.createElement('canvas'); return typeof renderToCanvas === 'function' ? 'canvas fn present' : 'n/a'; } catch (e) { return String(e); } });
  await p.screenshot({ path: 'blocked-2.png' });
  await p.evaluate(() => { state.settings.progress = false; state.settings.corners = 'square'; refresh(); }); await p.waitForTimeout(200); await p.screenshot({ path: 'blocked-3.png', clip: { x: 0, y: 60, width: 1500, height: 800 } });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
