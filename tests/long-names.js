// Long names: overflow settings (wrap / shrink / truncate), left labels, plans saved before the setting existed
const { chromium } = require('playwright');
const out = __dirname;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => {
    localStorage.clear(); state = sampleState(); const d = mondayOf(todayDay());
    state.rows = [
      newRow({ level: 0, name: 'Quarterly stakeholder alignment workshops', start: d, end: d + 2 }),
      newRow({ level: 0, name: 'Contract negotiation and legal review cycle', start: d + 4, end: d + 12 }),
      newRow({ level: 0, name: 'Contract negotiation and legal review cycle', start: d + 14, end: d + 28 }),
      newRow({ level: 0, name: 'Extraordinarylongunbreakableidentifier', start: d + 30, end: d + 33 })];
    Object.assign(state.settings, { taskLabels: 'bars', showTitle: false }); sel = null; commit(); refresh();
  });
  const show = () => p.evaluate(() => scene.info.map(n => { const ts = scene.items.filter(i => i.t === 'text' && Math.abs(i.y - n.cy) < 30 && i.size > 9 && i.x > n.bx - 5 && i.weight === 500 && i.fill !== undefined).map(i => i.text); return `${n.inside ? 'IN ' : 'OUT'}${n.lines ? n.lines.length + 'L' : '  '}${n.shrink ? '@' + n.shrink : ''}`.padEnd(10) + '“' + ts.join(' / ') + '”'; }).join('\n   '));
  console.log('version', await p.textContent('#version'));
  console.log('controls  :', await p.evaluate(() => [document.querySelector('[data-w="wrapNames"] .lbl').textContent, document.querySelector('[data-w="overflow"] .lbl').textContent, [...document.querySelectorAll('[data-k="overflow"] button')].map(b => b.textContent).join('/')].join(' | ')));
  const combos = [[false, 'outside'], [false, 'shrink'], [false, 'truncate'], [true, 'outside'], [true, 'shrink'], [true, 'truncate']];
  for (const [wrap, ov] of combos) {
    await p.evaluate(([w, o]) => { Object.assign(state.settings, { wrapNames: w, overflow: o }); commit(); refresh(); }, [wrap, ov]);
    console.log(`wrap ${wrap ? 'ON ' : 'off'} + ${ov}:\n   ` + await show());
    await p.locator('#canvas-wrap').screenshot({ path: `${out}/wr-${wrap ? 'on' : 'off'}-${ov}.png` });
  }
  // toggling through the UI
  await p.evaluate(() => { Object.assign(state.settings, { wrapNames: false, overflow: 'outside' }); refresh(); });
  await p.click('[data-w="wrapNames"] .switch'); await p.click('[data-k="overflow"] [data-v="shrink"]');
  console.log('via UI    :', await p.evaluate(() => state.settings.wrapNames + ' / ' + state.settings.overflow));
  // left labels
  await p.evaluate(() => { Object.assign(state.settings, { taskLabels: 'left', wrapNames: true, overflow: 'truncate' }); refresh(); });
  console.log('left, wrap + truncate:', await p.evaluate(() => scene.items.filter(i => i.t === 'text' && i.x < 120 && i.weight === 500 && i.size > 10).map(i => i.text + '@' + i.size).join(' | ')));
  await p.locator('#canvas-wrap').screenshot({ path: `${out}/wr-left.png` });
  // old saved plans
  console.log('migrate old "wrap":', await p.evaluate(() => { const s = sanitize({ rows: [], settings: { overflow: 'wrap' } }).settings; return s.wrapNames + ' / ' + s.overflow; }), '| others:', await p.evaluate(() => ['outside', 'shrink', 'truncate'].map(o => { const s = sanitize({ rows: [], settings: { overflow: o } }).settings; return s.wrapNames + '/' + s.overflow; }).join(', ')));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
