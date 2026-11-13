// PNG, PDF and PPTX export with every executive feature switched on (clipboard copy needs permission in headless Chromium)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); const R = n => state.rows.find(r => r.name === n);
    setBaseline(); R('Visual design').end += 6; R('Visual design').changeNote = 'Brand work took longer'; R('Page templates').blocked = true; R('Page templates').blockedNote = 'Waiting on CMS access';
    R('Front-end').status = 'red'; R('Go-live').key = true; R('Go-live').status = 'amber';
    Object.assign(state.settings, { showChanges: true, deps: true, criticalPath: true, keyStrip: true, projectStatus: 'amber', progress: true, todayLine: true, daysOff: [{ from: toDay(2026, 11, 24), to: toDay(2026, 11, 31), label: 'Shutdown' }] }); commit(); refresh(); });
  for (const fmt of ['png', 'pdf', 'pptx', 'copy']) {
    const dl = fmt === 'copy' ? null : p.waitForEvent('download', { timeout: 20000 }).catch(e => null);
    await p.click('#btn-export').catch(async () => { await p.click('text=Export'); });
    await p.click(`[data-export="${fmt}"]`); const d = dl ? await dl : null;
    console.log(fmt.padEnd(5), d ? 'downloaded ' + d.suggestedFilename() : '(no download expected)'); await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
  }
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
