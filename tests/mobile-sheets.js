// Phones and tablets: the page never scrolls sideways, the Plan / Design tab bar stays on screen, sheets span the width,
// grow to full height (tap or drag the head, or focus a field), shrink and close when dragged down
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const box = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }, sel);
  for (const [name, opts] of [['iPhone SE', devices['iPhone SE']], ['iPhone 13', devices['iPhone 13']], ['Pixel 7', devices['Pixel 7']], ['iPad Mini', devices['iPad Mini']], ['iPhone 13 landscape', devices['iPhone 13 landscape']]]) {
    const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('ERR ' + name + ': ' + e.message));
    await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
    const m = await p.evaluate(() => ({ vw: visualViewport.width, vh: visualViewport.height, docW: document.documentElement.scrollWidth, sheets: matchMedia('(max-width: 860px)').matches }));
    const tb = await box(p, '.tabbar');
    console.log(`${name}: ${m.vw}×${m.vh} page ${m.docW} wide ${m.docW > m.vw ? '⚠ SCROLLS SIDEWAYS' : 'fits'}` + (m.sheets ? ` | tab bar ${tb && tb[1] + tb[3] <= m.vh ? 'on screen' : '⚠ OFF SCREEN'}` : ' | desktop layout'));
    if (!m.sheets) { await ctx.close(); continue; }
    await p.tap('[data-sheet="panel-plan"]'); await p.waitForTimeout(350);
    const half = await box(p, '#panel-plan');
    console.log(`  plan sheet ${half[2]}×${half[3]} (${half[2] === m.vw ? 'full width' : m.vw >= 600 && half[2] === 620 ? 'phone-width, centred' : '⚠ WRONG WIDTH'})`);
    await p.tap('#panel-plan .panel-head h2'); await p.waitForTimeout(350);
    console.log('  tap head → full:', await p.evaluate(() => document.querySelector('#panel-plan').classList.contains('full')), (await box(p, '#panel-plan'))[3] + 'px tall');
    const drag = async (sel, dy) => { const r = await box(p, sel); const x = r[0] + r[2] / 2, y = r[1] + 12; await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x, y + dy / 2); await p.mouse.move(x, y + dy); await p.mouse.up(); await p.waitForTimeout(350); };
    await drag('#panel-plan .panel-head', 120);
    console.log('  drag down → half:', await p.evaluate(() => { const c = document.querySelector('#panel-plan').classList; return c.contains('open') && !c.contains('full'); }));
    await drag('#panel-plan .panel-head', 150);
    console.log('  drag down again → closed:', await p.evaluate(() => !document.querySelector('#panel-plan').classList.contains('open')));
    await p.tap('[data-sheet="panel-design"]'); await p.waitForTimeout(350);
    await p.tap('#design-search'); await p.waitForTimeout(350);
    console.log('  search focus → full:', await p.evaluate(() => document.querySelector('#panel-design').classList.contains('full')), '| font', await p.evaluate(() => getComputedStyle(document.querySelector('#design-search')).fontSize));
    await p.keyboard.type('date format'); await p.waitForTimeout(200);
    const sel = await box(p, '[data-k="dateFormat"]'), pan = await box(p, '#panel-design');
    console.log('  date format select inside the sheet:', sel[0] >= pan[0] && sel[0] + sel[2] <= pan[0] + pan[2]);
    await p.screenshot({ path: `mobile-${name.replace(/ /g, '-')}.png` });
    // controls never wider than the sheet
    console.log('  controls overflowing the sheet:', await p.evaluate(() => { const w = document.querySelector('#design').getBoundingClientRect().right; document.querySelector('#design-search').value = ''; document.querySelector('#design-search').dispatchEvent(new Event('input')); return [...document.querySelectorAll('#design [data-w]:not([hidden])')].filter(e => e.getBoundingClientRect().right > w + 1).map(e => e.dataset.w).join(', ') || 'none'; }));
    await ctx.close();
  }
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
