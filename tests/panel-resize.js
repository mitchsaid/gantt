// Default layout at 1600px and dragging the Plan / Design panel edges (limits, persistence)
const { chromium } = require('playwright');
const out = __dirname;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(800);
  const w = () => p.evaluate(() => ({ plan: Math.round(document.querySelector('#panel-plan').getBoundingClientRect().width), design: Math.round(document.querySelector('#panel-design').getBoundingClientRect().width), chart: Math.round(document.querySelector('#stage').getBoundingClientRect().width) }));
  console.log('version', await p.textContent('#version'));
  console.log('defaults (1600px window):', JSON.stringify(await w()), '| handles:', await p.locator('.resizer').count());
  const wrapped = () => p.evaluate(() => { const o = []; document.querySelectorAll('#design .lbl, #design .seg button, #design h3').forEach(e => { if (e.closest('[hidden]')) return; const cs = getComputedStyle(e); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4; if (e.getBoundingClientRect().height > lh * 1.6) o.push(e.textContent.trim()); }); return o.length ? o.join(', ') : 'none'; });
  console.log('Design labels wrapping at the new default:', await wrapped());
  // drag the Plan handle right
  let hb = await p.locator('#panel-plan .resizer').boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + 300); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2 + 90, hb.y + 300, { steps: 8 });
  console.log('while dragging Plan +90 :', JSON.stringify(await w()), '| cursor class:', await p.evaluate(() => document.body.classList.contains('resizing')));
  await p.mouse.up();
  console.log('after                   :', JSON.stringify(await w()), '| saved:', await p.evaluate(() => JSON.parse(localStorage.getItem('gantt:ui')).planW));
  // drag the Design handle left
  hb = await p.locator('#panel-design .resizer').boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + 300); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2 - 70, hb.y + 300, { steps: 8 }); await p.mouse.up();
  console.log('Design −70 (wider)      :', JSON.stringify(await w()));
  await p.screenshot({ path: `${out}/rz-wide.png` });
  // limits: drag far both ways
  hb = await p.locator('#panel-plan .resizer').boundingBox();
  await p.mouse.move(hb.x + 5, hb.y + 300); await p.mouse.down(); await p.mouse.move(hb.x + 900, hb.y + 300, { steps: 6 }); await p.mouse.up();
  console.log('Plan dragged far right  :', JSON.stringify(await w()), '(capped; chart keeps ≥ 420px)');
  hb = await p.locator('#panel-plan .resizer').boundingBox();
  await p.mouse.move(hb.x + 5, hb.y + 300); await p.mouse.down(); await p.mouse.move(hb.x - 900, hb.y + 300, { steps: 6 }); await p.mouse.up();
  console.log('Plan dragged far left   :', JSON.stringify(await w()), '(floor)');
  // persistence
  await p.reload(); await p.waitForTimeout(800);
  console.log('after reload            :', JSON.stringify(await w()));
  // keyboard and reset
  await p.locator('#panel-design .resizer').focus(); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Shift+ArrowLeft');
  console.log('Design ← then Shift+←   :', JSON.stringify(await w()), '(+16 then +48)');
  await p.locator('#panel-design .resizer').dblclick();
  await p.locator('#panel-plan .resizer').focus(); await p.keyboard.press('Home');
  console.log('reset (dbl-click / Home):', JSON.stringify(await w()), '| saved:', await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('gantt:ui')))));
  // collapsed panels hide their handle; the chart stays usable
  await p.click('#panel-plan .collapse-btn');
  console.log('collapsed plan          :', JSON.stringify(await w()), '| handle visible:', await p.evaluate(() => getComputedStyle(document.querySelector('#panel-plan .resizer')).display !== 'none'));
  await p.click('#panel-plan');
  // narrower window and a phone
  await p.setViewportSize({ width: 1100, height: 800 }); await p.waitForTimeout(300);
  console.log('1100px window           :', JSON.stringify(await w()), '(smaller defaults)');
  await p.setViewportSize({ width: 800, height: 800 }); await p.waitForTimeout(300);
  console.log('800px (mobile layout)   : handles shown:', await p.evaluate(() => [...document.querySelectorAll('.resizer')].some(e => getComputedStyle(e).display !== 'none')));
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const mp = await m.newPage(); await mp.goto('http://localhost:8765/'); await mp.waitForTimeout(600);
  console.log('phone                   : handles shown:', await mp.evaluate(() => [...document.querySelectorAll('.resizer')].some(e => getComputedStyle(e).display !== 'none')));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
