// Editing the title on the chart shows its options underneath: Write it for me (the headline from the plan), a size, and Hide.
// The typing keeps its focus while they are used, and Esc puts the words back as they were. Also: pointing at the date marker
// draws it as a control of its own (no box round its hit area), and the toolbar under the chart keeps its place as states change.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  p.on('pageerror', e => errs.push('ERR ' + e.message));
  await p.goto('http://localhost:8765/'); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(700);
  const title = () => p.evaluate(() => { const r = document.querySelector('#chart [data-role="title"]').getBoundingClientRect(); return [r.left + 20, r.top + r.height / 2]; });
  await p.mouse.click(...await title()); await p.waitForTimeout(300);
  console.log('options shown:', await p.isVisible('.title-bar'), '| size pressed:', await p.evaluate(() => [...document.querySelectorAll('.title-bar [data-tt="size"]')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' ')));
  await p.click('.title-bar [data-v="1.3"]'); await p.waitForTimeout(200);
  console.log('large:', await p.evaluate(() => state.settings.titleScale), '| still typing:', await p.evaluate(() => document.activeElement.className === 'inline-edit'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('Esc closes it:', await p.evaluate(() => !document.querySelector('.title-bar') && !document.querySelector('.inline-edit')));
  await p.mouse.click(...await title()); await p.waitForTimeout(300);
  await p.click('.title-bar [data-tt="auto"]'); await p.waitForTimeout(300);
  console.log('write it for me:', await p.evaluate(() => state.settings.titleAuto + ' | ' + scene.title), '| editing ended:', await p.evaluate(() => !document.querySelector('.inline-edit')));
  await p.mouse.click(...await title()); await p.waitForTimeout(300);
  console.log('pressed while written for you:', await p.getAttribute('.title-bar [data-tt="auto"]', 'aria-pressed'));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  console.log('Esc leaves the headline written for you:', await p.evaluate(() => state.settings.titleAuto));
  await p.mouse.click(...await title()); await p.waitForTimeout(300);
  await p.keyboard.type('Launch plan'); await p.waitForTimeout(100);
  console.log('typing over takes it back:', await p.evaluate(() => state.settings.titleAuto + ' | ' + state.settings.title), '| pressed:', await p.getAttribute('.title-bar [data-tt="auto"]', 'aria-pressed'));
  await p.click('.title-bar [data-tt="hide"]'); await p.waitForTimeout(300);
  console.log('hide:', await p.evaluate(() => state.settings.showTitle + ' | title kept: ' + state.settings.title));
  // the date marker
  await p.evaluate(() => { setSetting('todayLine', true); }); await p.waitForTimeout(300);
  const m = await p.evaluate(() => { const r = document.querySelector('#chart [data-role="today"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 4]; });
  await p.mouse.move(m[0], m[1] + 140); await p.waitForTimeout(300);
  console.log('marker hover: arrows', await p.evaluate(() => document.querySelectorAll('#hov polyline').length), '| no hit-area box:', await p.evaluate(() => ![...document.querySelectorAll('#hov rect')].some(r => r.getAttribute('stroke') === SEL_RING)));
  // the toolbar under the chart stays put
  const pos = () => p.evaluate(() => ['#qs-exec', '#qs-progress', '#qs-base', '#qs-base-menu'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().left)).join(','));
  const p0 = await pos();
  await p.click('#qs-progress'); await p.click('#qs-base'); await p.evaluate(() => { sel = state.rows[2].id; refresh(); });
  const p1 = await pos();
  await p.click('#qs-exec'); const p2 = await pos();
  console.log('toolbar stays put:', p0 === p1 && p1 === p2, '| labels:', await p.evaluate(() => [...document.querySelectorAll('.qs [data-l].on')].map(e => e.textContent).join(' / ')));
  console.log('paste link hidden on a desktop:', !(await p.isVisible('.chart-add .paste-link')));
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
