// Design panel: every control placed once, sections collapse, summaries follow settings, state persists
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(800);
  console.log('version', await p.textContent('#version'));
  const outline = () => p.evaluate(() => [...document.querySelectorAll('#design .group')].map(g => g.querySelector('.gt').textContent + ': ' + [...g.querySelectorAll('.gbody > *')].filter(e => !e.hidden).map(e => e.matches('.ghd') ? '[' + e.textContent + ']' : ((e.querySelector('.lbl') || {}).textContent || e.className || '')).join(' | ')).join('\n'));
  console.log(await outline());
  console.log('every control placed once:', await p.evaluate(() => { const ks = [...document.querySelectorAll('#design [data-w]')].map(e => e.dataset.w); return ks.length + ' controls, duplicates: ' + ks.filter((k, i) => ks.indexOf(k) !== i).length; }));
  await p.screenshot({ path: 'dp-open.png' });
  // collapse
  await p.click('[data-sec-toggle="timeline"]'); await p.click('[data-sec-toggle="colour"]'); await p.click('[data-sec-toggle="text"]');
  console.log('collapsed:', await p.evaluate(() => [...document.querySelectorAll('#design .group.collapsed')].map(g => g.dataset.sec + ' → ' + g.querySelector('.gsum').textContent.trim()).join(' || ')));
  console.log('body hidden:', await p.evaluate(() => getComputedStyle(document.querySelector('#sec-timeline')).display), '| aria', await p.getAttribute('[data-sec-toggle="timeline"]', 'aria-expanded'));
  await p.screenshot({ path: 'dp-collapsed.png' });
  // summaries follow settings
  await p.evaluate(() => { setSetting('scale', 'months'); setSetting('todayLine', true); setSetting('font', 'Poppins'); });
  console.log('after changes:', await p.evaluate(() => [...document.querySelectorAll('#design .group.collapsed')].map(g => g.querySelector('.gsum').textContent.trim()).join(' || ')));
  // persisted across reload
  await p.reload(); await p.waitForTimeout(800);
  console.log('after reload collapsed:', await p.evaluate(() => [...document.querySelectorAll('#design .group.collapsed')].map(g => g.dataset.sec).join(', ')), '| ui', await p.evaluate(() => localStorage.getItem('gantt:ui')));
  // expand again, controls work
  await p.click('[data-sec-toggle="timeline"]');
  await p.click('[data-k="scale"] [data-v="weeks"]'); console.log('scale via panel:', await p.evaluate(() => state.settings.scale));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
