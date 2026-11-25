// Phones and tablets: only the chart zooms. Every text field is 16px or larger (below that iOS zooms the whole page into it on
// focus), including the chart's inline name and title editors; the page can't be pinch- or double-tap-zoomed; desktop keeps
// its small fields and its page zoom.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  // every visible text field on the page, with its font size; any under 16px is listed
  const small = p => p.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(e => !['checkbox', 'color', 'range', 'file', 'hidden'].includes(e.type) && e.getClientRects().length)
    .map(e => [e.id || e.className || e.dataset.f || e.tagName, parseFloat(getComputedStyle(e).fontSize)]).filter(x => x[1] < 16).map(x => x.join(' ')));
  const count = p => p.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(e => !['checkbox', 'color', 'range', 'file', 'hidden'].includes(e.type) && e.getClientRects().length).length);
  for (const [name, opts] of [['iPhone 13', devices['iPhone 13']], ['Pixel 7', devices['Pixel 7']], ['iPad Mini landscape', devices['iPad Mini landscape']]]) {
    const ctx = await b.newContext({ ...opts, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push('ERR ' + name + ': ' + e.message));
    await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
    const meta = await p.evaluate(() => ({ vp: document.querySelector('meta[name=viewport]').content, ta: getComputedStyle(document.documentElement).touchAction, stage: getComputedStyle(document.querySelector('#stage')).touchAction }));
    console.log(`${name}: viewport "${meta.vp}" | page touch-action ${meta.ta} | chart ${meta.stage}`);
    const seen = [];
    const check = async where => { const n = await count(p), s = await small(p); seen.push(`${where} ${n} field${n === 1 ? '' : 's'}${s.length ? ' ⚠ UNDER 16px: ' + s.join(', ') : ''}`); };
    // a task's popover, with its date, note and blocker pages
    const id = await p.evaluate(() => scene.info.find(x => !x.isArea && !x.milestone).row.id);
    await p.evaluate(i => { select(i); openPop('row', document.querySelector(`#chart [data-role="move"][data-id="${i}"]`).getBoundingClientRect(), i); }, id); await p.waitForTimeout(300);
    await check('task popover');
    for (const k of ['note', 'block']) { const ok = await p.evaluate(k => { const b = document.querySelector(`.pop [data-acc="${k}"], .pop [data-page="${k}"]`); if (b) b.click(); return !!b; }, k); if (ok) { await p.waitForTimeout(200); await check(k + ' page'); } }
    await p.evaluate(() => closePop()); await p.waitForTimeout(150);
    // the plan and design sheets (or panels)
    if (await p.locator('[data-sheet="panel-plan"]').isVisible()) { await p.tap('[data-sheet="panel-plan"]'); await p.waitForTimeout(350); }
    await check('plan outline');
    if (await p.locator('[data-sheet="panel-design"]').isVisible()) { await p.tap('[data-sheet="panel-design"]'); await p.waitForTimeout(350); }
    await p.evaluate(() => document.querySelectorAll('#panel-design details:not([open]) > summary, #panel-design .ghead').forEach(s => s.click())); await p.waitForTimeout(300);
    await check('design settings');
    await p.keyboard.press('Escape');
    console.log('  ' + seen.join(' | '));
    if (seen.some(x => x.includes('⚠'))) errs.push('ERR ' + name + ': a text field under 16px zooms the page on iOS');
    // the chart's own inline editors, sized from the chart text
    const ed = async fn => { await p.evaluate(fn); await p.waitForTimeout(150); const r = await p.evaluate(() => { const e = document.querySelector('.inline-edit'); if (!e) return null; const s = parseFloat(getComputedStyle(e).fontSize), h = e.getBoundingClientRect().height; e.blur(); return [s, Math.round(h)]; }); await p.waitForTimeout(150); return r; };
    const nm = await ed(() => { const n = scene.info.find(x => !x.isArea && !x.milestone); editRowName(n.row.id, document.querySelector(`#chart [data-role="row"][data-id="${n.row.id}"]`)?.getBoundingClientRect() || { left: 20, top: 200, width: 160, height: 20 }); });
    const tt = await ed(() => { const t = document.querySelector('#chart [data-role="title"]'); if (t) editTitle(t.getBoundingClientRect()); });
    const fmt = r => r ? `${r[0]}px text in a ${r[1]}px box${r[0] < 16 ? ' ⚠ UNDER 16px' : ''}` : 'not found';
    console.log(`  chart name editor ${fmt(nm)} | title editor ${fmt(tt)}`);
    if ([nm, tt].some(r => r && r[0] < 16)) errs.push('ERR ' + name + ': a chart editor under 16px zooms the page on iOS');
    if (name === 'iPhone 13') { await p.evaluate(() => { const n = scene.info.find(x => !x.isArea && !x.milestone); editRowName(n.row.id, document.querySelector(`#chart [data-role="row"][data-id="${n.row.id}"]`)?.getBoundingClientRect() || { left: 20, top: 200, width: 160, height: 20 }); }); await p.waitForTimeout(150); await p.screenshot({ path: 'mobile-name-editor.png' }); }
    await ctx.close();
  }
  // desktop: fields keep their size and only the chart's Ctrl + wheel is taken over
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('ERR desktop: ' + e.message));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(700);
  const d = await p.evaluate(() => { const n = scene.info.find(x => !x.isArea && !x.milestone); editRowName(n.row.id, { left: 20, top: 200, width: 160, height: 20 }); const e = document.querySelector('.inline-edit'); const s = getComputedStyle(e).fontSize; e.blur(); return { search: getComputedStyle(document.querySelector('#design-search')).fontSize, edit: s }; });
  console.log(`desktop: design search ${d.search}, chart name editor ${d.edit} (unchanged)`);
  await b.close();
  errs.forEach(e => console.log(e));
})();
