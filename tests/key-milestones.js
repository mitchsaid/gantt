// Key milestones strip: ticking a milestone, label lanes on a narrow canvas
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars', todayLine: true }); sel = null; commit(); refresh(); document.activeElement.blur(); });
  const clickBar = async n => { const r = await p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }, n); await p.mouse.click(r.x, r.y); await p.waitForTimeout(300); };
  console.log('milestones:', await p.evaluate(() => state.rows.filter(r => r.type === 'milestone').map(r => r.name).join(', ')));
  await clickBar('Design sign-off');
  console.log('sections:', await p.evaluate(() => [...document.querySelectorAll('.pop .acc')].map(a => a.querySelector('.acc-t').textContent + '=' + a.querySelector('.acc-s').textContent.trim()).join(' | ')));
  await p.click('[data-acc-toggle="keyms"]'); await p.click('.pop [data-f="keyms"]'); await p.waitForTimeout(300);
  console.log('after ticking:', await p.evaluate(() => JSON.stringify({ key: state.rows.find(r => r.name === 'Design sign-off').key, strip: state.settings.keyStrip, texts: scene.items.filter(i => i.t === 'text' && /Design sign-off|KEY/.test(i.text)).map(i => i.text) })));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.evaluate(() => { state.rows.find(r => r.name === 'Go-live').key = true; state.rows.find(r => r.name === 'Client demo').key = true; state.rows.find(r => r.name === 'Kickoff').key = true; state.rows.find(r => r.name === 'Go-live').status = 'amber'; commit(); refresh(); });
  console.log('strip height:', await p.evaluate(() => scene.items.filter(i => i.t === 'diamond' && i.r === 7).length + ' diamonds'));
  await p.screenshot({ path: 'strip-1.png', clip: { x: 430, y: 60, width: 1120, height: 560 } });
  // narrow canvas: labels crowd -> more lanes
  await p.evaluate(() => { state.settings.canvas = 'slide43'; Object.values(state.rows).forEach(r => { if (r.type === 'milestone') r.key = true; }); commit(); refresh(); });
  await p.screenshot({ path: 'strip-2.png', clip: { x: 430, y: 60, width: 1120, height: 560 } });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
