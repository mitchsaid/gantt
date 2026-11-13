// Task label modes (left / on bars) and that exports match what is on screen
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { assignees: true, assigneePos: 'bars', assigneeLevel: 'all', taskLabels: 'bars' }); sel = null; commit(); refresh(); });
  console.log('version', await p.textContent('#version'));
  console.log('design controls:', await p.evaluate(() => [...document.querySelectorAll('#design [data-w]')].filter(e => ['assigneePos', 'assigneeNames', 'assigneeAvatar', 'assigneeAreas', 'assigneeLevel'].includes(e.dataset.w)).map(e => e.dataset.w + (e.hidden ? '(hidden)' : '')).join(', ')));
  const count = () => p.evaluate(() => { const items = scene.items; const initials = items.filter(i => i.t === 'text' && i.anchor === 'middle' && /^[A-Z]{1,2}$/.test(i.text) && i.weight === 700 && i.y > 100).length; const names = items.filter(i => i.t === 'text' && /Priya Shah|Marco Diaz|Sam Ortiz|Jo Lin|Lena Berg/.test(i.text)).length; const inBar = scene.info.filter(n => n.avD).length; const outside = scene.info.filter(n => n.tail.some(t => t.k === 'who' && t.av)).length; return `avatars-in-bar ${inBar} | avatars-outside ${outside} | name texts ${names} | row h ${scene.info.find(n => !n.sub && !n.isArea && !n.milestone).h}`; });
  console.log('bars, labels on bars:', await count());
  await p.locator('#canvas-wrap').screenshot({ path: 'av-bars.png' });
  await p.evaluate(() => setSetting('assigneeNames', true));
  console.log('+ names             :', await count());
  await p.locator('#canvas-wrap').screenshot({ path: 'av-bars-names.png' });
  await p.evaluate(() => { setSetting('taskLabels', 'left'); setSetting('assigneeNames', false); });
  console.log('labels on the left  :', await count());
  await p.locator('#canvas-wrap').screenshot({ path: 'av-bars-left.png' });
  await p.evaluate(() => { setSetting('assigneePos', 'under'); });
  console.log('under (unchanged)   :', await count());
  await p.evaluate(() => { setSetting('assigneePos', 'beside'); });
  console.log('beside (unchanged)  :', await count());
  // exports
  await p.evaluate(() => { setSetting('assigneePos', 'bars'); setSetting('assigneeNames', true); });
  const dl = async kind => { await p.click('#btn-export'); const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click(`[data-export="${kind}"]`)]); return d.suggestedFilename(); };
  console.log('exports:', await dl('png'), await dl('pdf'), await dl('pptx'));
  // narrow bars fall back outside
  await p.evaluate(() => { state.rows.forEach(r => { if (r.level > 0 && !r.assignee) r.assignee = 'Zed Quinn'; }); setSetting('assigneeNames', false); const r = state.rows.find(r => r.name === 'Site map & flows'); r.end = r.start; commit(); refresh(); });
  console.log('a 1-day bar         :', await p.evaluate(() => { const n = scene.info.find(n => n.row.name === 'Site map & flows'); return `bw ${Math.round(n.bw)} avD ${n.avD} tail ${JSON.stringify(n.tail.map(t => [t.k, t.av, t.nm]))}`; }));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
