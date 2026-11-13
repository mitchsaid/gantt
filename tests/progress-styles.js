// Progress in bars: pale unfinished vs darker finished, controls shown only with progress on
const { chromium } = require('playwright');
const out = __dirname;
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  const setup = pal => p.evaluate(pal => {
    localStorage.clear(); state = sampleState(); const d = mondayOf(todayDay());
    const R = (n, s, e, pr, o) => newRow(Object.assign({ level: 0, name: n, start: d + s, end: d + e, progress: pr }, o || {}));
    state.rows = [R('Kickoff', 0, 0, 0, { type: 'milestone' }), R('Review existing artefacts', 0, 4, 0), R('Interview key stakeholders', 5, 12, 100), R('Synthesize interview findings', 13, 20, 40), R('Run strategy workshop', 21, 26, 0), R('Synthesize workshop findings', 27, 34, 70)];
    state.settings.palette = pal === 'pastel' ? PRESETS.find(p => p.id === 'pastel') : suggestPalettes('#f72702')[1];
    Object.assign(state.settings, { taskLabels: 'bars', showTitle: false, progress: true }); sel = null; commit(); refresh();
  }, pal);
  const bars = () => p.evaluate(() => scene.info.filter(n => !n.milestone).map(n => { const rs = scene.items.filter(i => i.t === 'rect' && !i.ui && !i.hit && Math.abs(i.y - (n.cy - n.bh / 2)) < 0.5 && i.x >= n.bx - 0.1 && i.x <= n.bx + n.bw); const labels = [...new Set(scene.items.filter(i => i.t === 'text' && n.row.name.startsWith(i.text.replace('…', '')) && Math.abs(i.y - n.cy) < 12).map(i => i.fill + (i.split ? ' (split)' : '')))]; return n.row.name.slice(0, 20).padEnd(20) + String(n.progress).padStart(4) + '% → ' + rs.map(r => r.fill).join(' + ').padEnd(20) + ' label ' + labels.join(','); }).join('\n   '));
  await setup('red');
  console.log('version', await p.textContent('#version'));
  console.log('controls shown with progress on:', await p.evaluate(() => [...document.querySelectorAll('[data-k="progressStyle"] button')].map(b => b.textContent).join(' / ')), '| hidden when progress off:', await p.evaluate(() => { state.settings.progress = false; syncDesign(); const h = document.querySelector('[data-w="progressStyle"]').hidden; state.settings.progress = true; syncDesign(); return h; }));
  console.log('Pale unfinished (as before):\n   ' + await bars());
  await p.locator('#canvas-wrap').screenshot({ path: `${out}/ps-pale.png` });
  await p.click('[data-k="progressStyle"] [data-v="shade"]');
  console.log('Darker finished:\n   ' + await bars());
  await p.locator('#canvas-wrap').screenshot({ path: `${out}/ps-shade.png` });
  // a dark-label palette keeps its label readable
  await setup('pastel'); await p.click('[data-k="progressStyle"] [data-v="shade"]');
  console.log('Pastel palette, darker finished:\n   ' + await bars());
  console.log('  contrast of the finished part with the dark label:', await p.evaluate(() => { const n = scene.info.find(x => x.row.name === 'Interview key stakeholders'); const r = scene.items.find(i => i.t === 'rect' && !i.ui && !i.hit && Math.abs(i.y - (n.cy - n.bh / 2)) < 0.5 && i.x >= n.bx - 0.1); return contrast(r.fill, '#0b1020').toFixed(1) + ' (≥ 7)'; }));
  await p.locator('#canvas-wrap').screenshot({ path: `${out}/ps-pastel.png` });
  // saved plans, the per-bar "off" state, exports
  console.log('old plans default to:', await p.evaluate(() => sanitize({ rows: [], settings: {} }).settings.progressStyle));
  await p.evaluate(() => { state.rows.find(r => r.name === 'Run strategy workshop').progress = null; refresh(); });
  console.log('a bar with progress off stays plain in either style:', await p.evaluate(() => { const n = scene.info.find(x => x.row.name === 'Run strategy workshop'); return scene.items.filter(i => i.t === 'rect' && !i.ui && !i.hit && Math.abs(i.y - (n.cy - n.bh / 2)) < 0.5 && i.x >= n.bx - 0.1 && i.x <= n.bx + n.bw).length + ' rect'; }));
  await p.click('#btn-export');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('[data-export="pptx"]')]);
  console.log('PPTX export:', dl.suggestedFilename());
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
