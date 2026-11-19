// Phones: two fingers on the chart zoom the chart (never the page), a pinch doesn't select what the fingers land on or drag a bar,
// a one-finger tap still selects; the look bar and the toolbar under the chart stay screen-wide and in view as the chart scrolls.
// Desktop keeps its zoom (buttons, Ctrl + wheel) and a chart that fills the stage.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ ...devices['Pixel 7'], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
  const m = () => p.evaluate(() => { const r = e => { const x = document.querySelector(e).getBoundingClientRect(); return [x.left, x.right, x.top].map(Math.round); }; const s = document.querySelector('#stage'); return { vw: innerWidth, lb: r('#lookbar'), add: r('.chart-add'), stage: r('#stage'), col: r('#chart-col'), zoom: document.querySelector('#zoom-val').textContent, scale: visualViewport.scale, sel, zoombar: getComputedStyle(document.querySelector('.zoombar')).display }; });
  const inView = (box, v) => box[0] >= 0 && box[1] <= v.vw;
  let v = await m();
  console.log(`start: chart ${v.col[1] - v.col[0]}px wide on a ${v.vw}px screen | look bar in view: ${inView(v.lb, v)} | toolbar in view: ${inView(v.add, v)} | zoom control: ${v.zoombar}`);
  await p.evaluate(() => { const s = document.querySelector('#stage'); s.scrollLeft = 250; s.scrollTop = 200; }); await p.waitForTimeout(150);
  v = await m();
  console.log(`scrolled: look bar in view: ${inView(v.lb, v)}, pinned to the top: ${v.lb[2] < v.stage[2] + 12} | toolbar in view: ${inView(v.add, v)}`);
  await p.evaluate(() => { const s = document.querySelector('#stage'); s.scrollLeft = 0; s.scrollTop = 0; });
  const cdp = await ctx.newCDPSession(p);
  const bar = async name => p.evaluate(nm => { const n = scene.info.find(x => x.row.name === nm); const r = document.querySelector(`#chart [data-role="move"][data-id="${n.row.id}"]`).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, name);
  const pinch = async (x, y, from, to) => {
    const pts = d => [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from).slice(0, 1) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * i / 8) }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(250);
  };
  let [bx, by] = await bar('Audit & research');
  await pinch(bx + 30, by, 30, 110);
  v = await m();
  console.log(`pinch out: zoom ${v.zoom}, page scale ${v.scale} | selected by the pinch: ${v.sel ? 'yes ⚠' : 'no'} | zoom control: ${v.zoombar}`);
  await pinch(200, 400, 160, 10);
  v = await m();
  console.log(`pinch in: zoom ${v.zoom} | chart ${v.col[1] - v.col[0]}px, fits the screen: ${v.col[0] >= 0 && v.col[1] <= v.vw}`);
  await p.screenshot({ path: 'mobile-pinched-in.png' });
  // a selected bar: a finger starts dragging it, then a second finger turns it into a pinch — the drag is dropped
  await p.click('#zoom-val'); await p.waitForTimeout(200);
  [bx, by] = await bar('Audit & research');
  await p.touchscreen.tap(bx, by); await p.waitForTimeout(250);
  console.log('tap selects:', await p.evaluate(() => state.rows.find(r => r.id === sel).name), '| popover open:', await p.evaluate(() => !!document.querySelector('.pop:not([hidden])')));
  await p.keyboard.press('Escape');
  const before = await p.evaluate(() => JSON.stringify(state.rows.find(r => r.id === sel)));
  [bx, by] = await bar('Audit & research');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx, y: by, id: 1 }] });
  for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bx + i * 15, y: by, id: 1 }] });
  const moved = await p.evaluate(b4 => JSON.stringify(state.rows.find(r => r.id === sel)) !== b4, before);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx + 60, y: by, id: 1 }, { x: bx + 160, y: by, id: 2 }] });
  for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bx + 60 - i * 10, y: by, id: 1 }, { x: bx + 160 + i * 20, y: by, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(200);
  console.log('one finger drags the bar:', moved, '| a second finger puts it back:', await p.evaluate(b4 => JSON.stringify(state.rows.find(r => r.id === sel)) === b4, before), '| and zooms:', (await m()).zoom);
  // one finger on a bar that isn't selected scrolls the chart and selects nothing
  await p.keyboard.press('Escape'); await p.click('#zoom-val'); await p.evaluate(() => { select(null); document.querySelector('#stage').scrollLeft = 0; }); await p.waitForTimeout(150);
  [bx, by] = await bar('Stakeholder interviews');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bx, y: by, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bx - i * 20, y: by, id: 1 }] }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300);
  console.log('one-finger swipe scrolls the chart:', await p.evaluate(() => document.querySelector('#stage').scrollLeft > 40), '| selected:', await p.evaluate(() => sel ? 'yes ⚠' : 'nothing'));
  await p.evaluate(() => { document.querySelector('#stage').scrollLeft = 300; }); await p.waitForTimeout(100);
  await p.screenshot({ path: 'mobile-look-bar.png' });
  await ctx.close();
  // desktop
  const d = await b.newPage({ viewport: { width: 1440, height: 900 } });
  d.on('pageerror', e => errs.push('ERR desktop ' + e.message));
  await d.goto('http://localhost:8765/'); await d.waitForTimeout(600);
  const dw = () => d.evaluate(() => [Math.round(document.querySelector('#chart-col').getBoundingClientRect().width), document.querySelector('#zoom-val').textContent, getComputedStyle(document.querySelector('.zoombar')).display]);
  console.log('desktop:', JSON.stringify(await dw()));
  await d.click('#zoom-in'); await d.waitForTimeout(100);
  console.log('desktop zoom in:', JSON.stringify(await dw()));
  await d.click('#zoom-val'); await d.waitForTimeout(100);
  console.log('desktop reset:', JSON.stringify(await dw()));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
