// Exec view (areas collapsed, milestone strip, read-only chart), the automatic headline, and the share link round trip
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); sel = null; commit(); refresh(); document.activeElement.blur(); });
  const shot = n => p.screenshot({ path: n, clip: { x: 300, y: 50, width: 900, height: 620 } });

  // headline: plain plan, then against a baseline, then with a status
  const head = () => p.evaluate(() => scene.title);
  await p.evaluate(() => setSetting('titleAuto', true));
  console.log('headline plain   :', await head());
  await p.evaluate(() => { setBaseline(); state.settings.showChanges = true; commit(); refresh(); });
  console.log('headline baseline:', await head());
  await p.evaluate(() => { const R = n => state.rows.find(r => r.name === n); ['Component library', 'Page templates', 'CMS & integrations', 'Content migration', 'Client demo', 'QA & accessibility', 'Training & handover', 'Go-live'].forEach(n => { R(n).start += 14; R(n).end += 14; }); commit(); refresh(); });
  console.log('headline slipped :', await head());
  await p.evaluate(() => { state.rows.forEach(r => { delete r.baseline; }); state.settings.showChanges = false; state.settings.projectStatus = 'amber'; state.rows.find(r => r.name === 'Front-end').status = 'red'; commit(); refresh(); });
  console.log('headline status  :', await head());
  await shot('headline.png');

  // exec view: one bar per area, milestones in the strip, nothing to drag
  const sum = () => p.evaluate(() => JSON.stringify({ exec: !!scene.exec, rows: scene.info.map(n => n.row.name), diamonds: scene.items.filter(i => i.t === 'diamond').length, hits: [...new Set(scene.items.filter(i => i.hit).map(i => i.role))], planRows: state.rows.length, note: document.querySelector('#chart-add-note').textContent }));
  console.log('full view:', await sum());
  await p.click('#qs-exec'); await p.waitForTimeout(300);
  console.log('exec view:', await sum());
  console.log('exec status dots:', await p.evaluate(() => scene.info.map(n => n.row.name + '=' + (n.stat || '-')).join(', ')));
  await shot('exec.png');
  await p.evaluate(() => { state.rows.find(r => r.name === 'Go-live').key = true; state.rows.find(r => r.name === 'Design sign-off').key = true; commit(); refresh(); });
  console.log('exec view, two key milestones:', await p.evaluate(() => scene.items.filter(i => i.t === 'diamond').length + ' diamonds'));
  for (const fmt of ['png', 'pptx']) {
    const dl = p.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await p.click('#btn-export'); await p.click(`[data-export="${fmt}"]`);
    const d = await dl; console.log('exec export', fmt, d ? d.suggestedFilename() : 'NO DOWNLOAD — Error: export failed'); await p.waitForTimeout(400);
  }

  // typing over the headline on the chart turns it back into an ordinary title
  const t = await p.evaluate(() => { const e = document.querySelector('#chart [data-role="title"]').getBoundingClientRect(); return { x: e.x + 30, y: e.y + e.height / 2 }; });
  await p.mouse.click(t.x, t.y); await p.waitForTimeout(300);
  await p.keyboard.press('Control+A'); await p.keyboard.type('My own title'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('after typing a title:', await p.evaluate(() => JSON.stringify({ auto: state.settings.titleAuto, title: state.settings.title, shown: scene.title })));
  await p.evaluate(() => setSetting('titleAuto', true));

  // share link: copy, open in a fresh browser profile, compare
  await p.click('#btn-share'); await p.waitForTimeout(600);
  const url = await p.evaluate(() => navigator.clipboard.readText());
  console.log('link length:', url.length, url.slice(0, 40) + '…', '| toast:', await p.evaluate(() => document.querySelector('#toast').textContent));
  const want = await p.evaluate(() => JSON.stringify(packPlan(state)));
  const ctx2 = await b.newContext({ viewport: { width: 1500, height: 1000 } });
  const q = await ctx2.newPage(); q.on('pageerror', e => errs.push('ERR ' + e.message));
  await q.goto(url); await q.waitForTimeout(1200);
  console.log('fresh browser: same plan', await q.evaluate(w => JSON.stringify(packPlan(state)) === w, want), '| hash cleared', await q.evaluate(() => location.hash === ''), '| saved', await q.evaluate(() => !!localStorage.getItem('gantt:v1')), '| exec', await q.evaluate(() => !!scene.exec), '| deps kept', await q.evaluate(() => state.rows.filter(r => r.deps.length).length));
  // a browser that already holds a different plan is asked first
  await q.evaluate(() => { state = sampleState(); commit(); refresh(); });
  await q.goto('about:blank'); await q.goto(url); await q.waitForTimeout(1200);
  console.log('existing plan: dialog', await q.evaluate(() => [...document.querySelectorAll('.dialog .btn')].map(x => x.textContent).join(' / ')), '| still mine', await q.evaluate(() => state.settings.title));
  await q.click('.dialog .btn.primary'); await q.waitForTimeout(400);
  console.log('after Open: same plan', await q.evaluate(w => JSON.stringify(packPlan(state)) === w, want), '| undo available', await q.evaluate(() => !document.querySelector('#btn-undo').disabled));
  await q.goto('about:blank'); await q.goto('http://localhost:8765/#p=zNOTAPLAN'); await q.waitForTimeout(900);
  console.log('damaged link:', await q.evaluate(() => document.querySelector('#toast').textContent));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
