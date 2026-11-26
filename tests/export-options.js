// Export options: picking PNG / Copy image / PDF / PowerPoint opens a sheet of options; transparency lives there, not in Design
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, vp] of [['desk', { width: 1400, height: 900 }], ['mob', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: 2, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    // a plan saved while transparency was a Design setting
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(600);
    await p.evaluate(() => { const st = sampleState(); st.settings.bgTransparent = true; localStorage.clear(); localStorage.setItem(STORE_KEY, JSON.stringify(st)); });
    await p.reload(); await p.waitForTimeout(900);
    console.log(name, 'design panel has transparency switch:', await p.evaluate(() => !!document.querySelector('[data-k="bgTransparent"]')), '| chart transparent on screen:', await p.evaluate(() => scene.transparent));
    const open = async fmt => {
      if (name === 'mob') await p.evaluate(() => document.querySelector('#btn-export').click()); else await p.click('#btn-export');
      await p.click(`[data-export="${fmt}"]`); await p.waitForSelector('.exp-modal');
    };
    await open('png');
    console.log(name, 'png sheet:', await p.evaluate(() => ({ on: document.querySelector('.exp-modal .seg .on').textContent, note: document.querySelector('[data-note="scale"]').textContent, transparent: document.querySelector('[data-o="transparent"]').checked })));
    await p.screenshot({ path: `export-png-${name}.png` });
    await p.click('.exp-modal .seg button[data-v="4"]');
    await p.click('.exp-modal label.exp-row');
    console.log(name, 'after 4× and switch off:', await p.evaluate(() => document.querySelector('[data-note="scale"]').textContent), await p.evaluate(() => document.querySelector('[data-o="transparent"]').checked));
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('#exp-go')]);
    const f = await d.path(); const buf = fs.readFileSync(f);
    console.log(name, 'png size', buf.readUInt32BE(16), 'x', buf.readUInt32BE(20), '| remembered:', await p.evaluate(() => JSON.stringify(ui.exportOpts.png)));
    await open('pdf'); await p.screenshot({ path: `export-pdf-${name}.png` });
    await p.keyboard.press('Escape'); console.log(name, 'escape closes:', await p.evaluate(() => !document.querySelector('.exp-modal')));
    await open('pptx'); console.log(name, 'pptx transparent (migrated):', await p.evaluate(() => document.querySelector('[data-o="transparent"]').checked));
    await p.screenshot({ path: `export-pptx-${name}.png` });
    const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#exp-go')]); console.log(name, 'pptx', d2.suggestedFilename());
    await ctx.close();
  }
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
