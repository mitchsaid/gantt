// Bulk edits from the selection toolbar: status, assignees (add, remove, clear) and clearing dependencies and blockers
const { chromium } = require('playwright');
const out = process.env.SHOTS || require('os').tmpdir();
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.settings.taskLabels = 'bars'; sel = null; commit(); refresh(); });
  const names = ['Visual design', 'Wireframes', 'Design sign-off'];
  const pick = () => p.evaluate(ns => { const ids = ns.map(n => (state.rows.find(r => r.name === n) || {}).id).filter(Boolean); sel = ids[0]; multi = new Set(ids); renderChart(); renderOutline(); syncSelBar(); }, names);
  const rows = () => p.evaluate(ns => ns.map(n => { const r = state.rows.find(x => x.name === n); return r ? { n, status: r.status || '', who: r.assignee || '', deps: r.deps.length, blocked: !!r.blocked } : null; }).filter(Boolean), names);
  await pick();
  console.log('selected', await p.evaluate(() => selIds().length));
  // status
  await p.click('#selbar [data-sel="status"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: out + '/bulk-status.png', clip: { x: 300, y: 80, width: 1000, height: 560 } });
  const st = await p.evaluate(() => state.settings.statuses[1].id);
  await p.click(`.pop-menu [data-bstatus="${st}"]`); await p.waitForTimeout(150);
  console.log('after status', JSON.stringify(await rows()));
  if (!(await rows()).every(r => r.status === st)) throw new Error('status not applied to all');
  // assignees: add two by typing, then remove one by clicking its check
  await p.click('#selbar [data-sel="who"]'); await p.waitForTimeout(150);
  await p.fill('.pop-menu [data-bwho-in]', 'Ana, Ben'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  await p.screenshot({ path: out + '/bulk-who.png', clip: { x: 300, y: 80, width: 1000, height: 560 } });
  console.log('after add', JSON.stringify(await rows()));
  await p.click('.pop-menu [data-bwho="Ben"]'); await p.waitForTimeout(150);
  const w = await rows();
  console.log('after remove Ben', JSON.stringify(w));
  if (!w.every(r => /Ana/.test(r.who) && !/Ben/.test(r.who))) throw new Error('assignee toggle failed');
  console.log('menu still open', await p.evaluate(() => !document.querySelector('.pop-menu').hidden));
  await p.click('.pop-menu [data-bwho-clear]'); await p.waitForTimeout(150);
  if (!(await rows()).every(r => !r.who)) throw new Error('assignee clear failed');
  // dependencies and blockers
  await p.evaluate(ns => { const all = state.rows.filter(r => ns.includes(r.name)); all.forEach((r, i) => { if (i) r.deps = [all[0].id]; r.blocked = true; }); commit(); refresh(); }, names);
  console.log('before clear', JSON.stringify(await rows()));
  await p.click('#selbar [data-sel="clear"]'); await p.waitForTimeout(150);
  await p.screenshot({ path: out + '/bulk-clear.png', clip: { x: 300, y: 80, width: 1000, height: 560 } });
  await p.click('.pop-menu [data-bclear="deps"]'); await p.waitForTimeout(150);
  const d = await rows(); console.log('after deps', JSON.stringify(d));
  if (d.some(r => r.deps) || !d.every(r => r.blocked)) throw new Error('deps clear wrong');
  await p.click('#selbar [data-sel="clear"]'); await p.waitForTimeout(150);
  await p.click('.pop-menu [data-bclear="block"]'); await p.waitForTimeout(150);
  if ((await rows()).some(r => r.blocked)) throw new Error('blocker clear failed');
  await p.click('#btn-undo'); await p.waitForTimeout(150);
  console.log('undo brings blockers back', (await rows()).every(r => r.blocked));
  // phone: the toolbar still fits
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300); await pick(); await p.waitForTimeout(200);
  const bar = await p.evaluate(() => { const r = document.querySelector('#selbar').getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), right: Math.round(r.right) }; });
  console.log('phone toolbar', JSON.stringify(bar));
  await p.screenshot({ path: out + '/bulk-phone.png' });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
  if (errs.length) process.exit(1);
})();
