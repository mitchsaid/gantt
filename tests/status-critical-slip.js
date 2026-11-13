// RAG status and roll-up, overall status chip, critical path, finish-vs-baseline chip and legend notes
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  console.log('version', await p.textContent('#version'), '| year default', await p.evaluate(() => state.settings.periodYear));
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars', progress: true, todayLine: true }); sel = null; commit(); refresh(); document.activeElement.blur(); });
  const clickBar = async n => { const r = await p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }, n); await p.mouse.click(r.x, r.y); await p.waitForTimeout(300); };
  // popover status
  await clickBar('Visual design');
  console.log('sections:', await p.evaluate(() => [...document.querySelectorAll('.pop .acc')].map(a => a.querySelector('.acc-t').textContent + '=' + a.querySelector('.acc-s').textContent.trim()).join(' | ')));
  await p.click('[data-acc-toggle="status"]'); await p.click('.pop .status-seg button[data-v="amber"]'); await p.waitForTimeout(300);
  console.log('after At risk:', await p.evaluate(() => state.rows.find(r => r.name === 'Visual design').status + ' | summary ' + document.querySelector('.pop [data-acc="status"] .acc-s').textContent.trim() + ' | on: ' + document.querySelector('.pop .status-seg button.on').textContent.trim() + ' | showStatus ' + state.settings.showStatus));
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
  await p.evaluate(() => { const R = n => state.rows.find(r => r.name === n); R('Front-end').status = 'red'; R('Wireframes').status = 'green'; R('Client demo').status = 'green'; state.settings.projectStatus = 'amber'; commit(); refresh(); });
  console.log('rollup:', await p.evaluate(() => derive(state.rows).filter(n => n.stat).map(n => n.row.name + ':' + n.stat + (n.statRolled ? '*' : '')).join(', ')));
  // baseline + slip + critical path
  await p.evaluate(() => { setBaseline(); const R = n => state.rows.find(r => r.name === n); R('Visual design').end += 6; R('Visual design').changeNote = 'Brand work took longer'; R('Wireframes').start += 2; Object.assign(state.settings, { showChanges: true, deps: true, criticalPath: true }); commit(); refresh(); });
  console.log('chips:', await p.evaluate(() => scene.items.filter(i => i.t === 'text' && /^(Status|Finish)/.test(i.text)).map(i => i.text).join(' || ')));
  console.log('legend:', await p.evaluate(() => scene.items.filter(i => i.t === 'text' && i.weight === 500 && /(Original|Moved|Blocked|On track|At risk|Off track|Critical|Brand work)/.test(i.text)).map(i => i.text).join(' | ')));
  console.log('critical items:', await p.evaluate(() => { const c = scene.items.filter(i => i.t === 'rect' && i.fill === '#b91c1c').length, lines = scene.items.filter(i => i.t === 'poly' && i.stroke === '#b91c1c').length; return c + ' red backdrops (incl. legend key), ' + lines + ' critical links'; }));
  await p.screenshot({ path: 'rag-1.png', clip: { x: 430, y: 60, width: 1120, height: 960 } });
  // block + more keys to force a second key row
  await p.evaluate(() => { state.rows.find(r => r.name === 'Page templates').blocked = true; state.rows.find(r => r.name === 'Page templates').blockedNote = 'Waiting on CMS access'; commit(); refresh(); });
  console.log('key rows:', await p.evaluate(() => new Set(scene.items.filter(i => i.t === 'text' && i.weight === 500 && /^(Original dates|Moved or extended|Blocked|Waiting on a blocked item|On track|At risk|Off track|Critical path)$/.test(i.text)).map(i => Math.round(i.y))).size), '(distinct y)');
  await p.screenshot({ path: 'rag-2.png', clip: { x: 430, y: 60, width: 1120, height: 960 } });
  // export paths don't throw
  const ok = await p.evaluate(async () => { try { return typeof exportPptx === 'function' ? 'pptx fn' : (typeof downloadPptx === 'function' ? 'dl fn' : 'no fn'); } catch (e) { return String(e); } });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
