// The popover opens under its item and scrolls rather than flipping above, at several window heights
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const vh of [900, 700, 560]) {
    const p = await (await b.newContext({ viewport: { width: 1500, height: vh } })).newPage();
    const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
    await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars' }); sel = null; commit(); refresh(); });
    for (const name of ['Stakeholder interviews', 'Visual design', 'Page templates', 'Training & handover']) {
      const r = await p.evaluate(n => { const id = state.rows.find(r => r.name === n).id; document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).scrollIntoView({ block: 'center' }); const e = document.querySelector(`#chart [data-role="move"][data-id="${id}"]`).getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2, bottom: e.bottom, top: e.top }; }, name);
      await p.mouse.click(r.x, r.y); await p.waitForTimeout(300);
      const m = await p.evaluate(() => { const e = document.querySelector('.pop').getBoundingClientRect(), f = document.querySelector('.pop .pop-foot button.danger').getBoundingClientRect(); return { top: Math.round(e.top), bottom: Math.round(e.bottom), scroll: document.querySelector('.pop').scrollHeight > document.querySelector('.pop').clientHeight, del: f.bottom <= e.bottom + 1 && f.top >= e.top }; });
      console.log(`h=${vh} ${name.padEnd(24)} bar bottom ${Math.round(r.bottom)} → popover ${m.top}..${m.bottom} | ${m.top >= r.bottom ? 'BELOW' : 'above'} | scrolls ${m.scroll} | Delete visible ${m.del}`);
      await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    }
    console.log(errs.join('\n') || 'no errors');
    await p.close();
  }
  await b.close();
})();
