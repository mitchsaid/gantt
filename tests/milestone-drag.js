// Dragging a milestone, and how older plans pick up the milestone defaults
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
    // a small plan where milestones are tied to tasks: one on the day a task finishes, one on the day another starts
    state.rows = [newRow({ level: 0, name: 'Design', start: d, end: d + 4 }), newRow({ level: 0, name: 'Sign-off', type: 'milestone', start: d + 4, end: d + 4 }), newRow({ level: 0, name: 'Build', start: d + 7, end: d + 11 }), newRow({ level: 0, name: 'Build starts', type: 'milestone', start: d + 7, end: d + 7 }), newRow({ level: 0, name: 'Launch', type: 'milestone', start: d + 14, end: d + 14 })];
    state.rows[1].deps = [state.rows[0].id]; state.rows[2].deps = [state.rows[1].id];
    Object.assign(state.settings, { taskLabels: 'left', showTitle: false, scale: 'days', msLines: true, deps: true, density: 'roomy' }); sel = null; commit(); refresh();
  });
  console.log('version', await p.textContent('#version'), '| control:', await p.evaluate(() => [...document.querySelectorAll('[data-k="msAlign"] button')].map(b => b.textContent).join(' / ')), '| default:', await p.evaluate(() => state.settings.msAlign));
  const pos = () => p.evaluate(() => { const g = n => scene.info.find(x => x.row.name === n); const dia = n => scene.items.find(i => i.t === 'diamond' && Math.abs(i.cy - g(n).cy) < 2).cx; const d = g('Design'), bl = g('Build'); return { signoff: Math.round(dia('Sign-off') * 10) / 10, designEnd: Math.round((d.bx + d.bw) * 10) / 10, buildStarts: Math.round(dia('Build starts') * 10) / 10, buildStart: Math.round(bl.bx * 10) / 10, cell: Math.round(scene.ppd * 10) / 10 }; });
  for (const a of ['auto', 'start', 'middle', 'end']) {
    await p.click(`[data-k="msAlign"] [data-v="${a}"]`);
    const r = await pos();
    console.log(a.padEnd(7), `Sign-off diamond x=${r.signoff} vs Design bar end ${r.designEnd} (off by ${(r.signoff - r.designEnd).toFixed(1)}px) | "Build starts" x=${r.buildStarts} vs Build bar start ${r.buildStart} (off by ${(r.buildStarts - r.buildStart).toFixed(1)}px) | one day = ${r.cell}px`);
    await p.locator('#canvas-wrap').screenshot({ path: `${out}/ms-${a}.png` });
  }
  // dragging a milestone and the dependency arrows still behave
  await p.click('[data-k="msAlign"] [data-v="end"]');
  const id = await p.evaluate(() => state.rows.find(r => r.name === 'Launch').id);
  const bb = await p.locator(`#chart [data-role="move"][data-id="${id}"]`).boundingBox();
  const s0 = await p.evaluate(i => state.rows.find(r => r.id === i).start, id);
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + bb.width / 2 - 100, bb.y + bb.height / 2, { steps: 6 }); await p.mouse.up();
  console.log('drag milestone left:', await p.evaluate(([i, s0]) => state.rows.find(r => r.id === i).start - s0, [id, s0]), 'days');
  console.log('existing plans now default to:', await p.evaluate(() => sanitize({ rows: [], settings: {} }).settings.msAlign));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
