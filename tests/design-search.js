// Design panel search: filters to matching controls, opens collapsed sections, points at hidden controls, Esc and Ctrl+K
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1100 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(800);
  const results = () => p.evaluate(() => [...document.querySelectorAll('#design .group:not([hidden])')].map(g => g.querySelector('.gt').textContent + ': ' + [...g.querySelectorAll('.gbody > *')].filter(e => !e.hidden && (e.matches('.ghd, .srch-hint') || e.hasAttribute('data-w'))).map(e => e.matches('.ghd') ? '[' + e.textContent + ']' : e.matches('.srch-hint') ? '(' + e.textContent + ')' : ((e.querySelector('.lbl') || e.querySelector('button') || {}).textContent || e.dataset.w) + (e.classList.contains('unavail') ? ' (dimmed)' : '')).join(' | ')).join('\n') + ' || empty: ' + !document.querySelector('#srch-empty').hidden);
  const search = async q => { await p.fill('#design-search', q); await p.waitForTimeout(150); console.log(`\n“${q}” →\n` + await results()); };
  await p.click('[data-sec-toggle="timeline"]'); // collapsed sections still show their matches
  await search('date');
  await p.screenshot({ path: 'ds-date.png' });
  await search('thickness');                       // hidden behind the date marker switch
  await search('weekend');                         // only on the Days scale
  await search('color');                           // American spelling finds Colour
  await search('holiday');
  await search('zzz');
  console.log('marks:', await p.evaluate(() => document.querySelectorAll('#design mark').length));
  // using a result keeps the search
  await search('marker');
  await p.click('[data-w="todayLine"] .switch');
  await p.waitForTimeout(150);
  console.log('marker on:', await p.evaluate(() => state.settings.todayLine), '\n' + await results());
  await p.screenshot({ path: 'ds-marker.png' });
  // Esc clears, sections go back to how they were
  await p.focus('#design-search'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  console.log('after Esc: query', JSON.stringify(await p.inputValue('#design-search')), '| timeline collapsed', await p.evaluate(() => document.querySelector('[data-sec="timeline"]').classList.contains('collapsed')), '| hidden groups', await p.evaluate(() => document.querySelectorAll('#design .group[hidden]').length));
  // Ctrl+K from the chart opens a collapsed panel and focuses the search
  await p.click('#panel-design .collapse-btn'); await p.click('#chart', { position: { x: 5, y: 5 } }).catch(() => {});
  await p.keyboard.press('Control+k'); await p.waitForTimeout(150);
  console.log('Ctrl+K: panel collapsed', await p.evaluate(() => document.querySelector('#panel-design').classList.contains('collapsed')), '| focused', await p.evaluate(() => document.activeElement.id));
  await p.keyboard.type('font'); await p.keyboard.press('Enter');
  console.log('Enter focuses', await p.evaluate(() => document.activeElement.tagName + ' ' + (document.activeElement.dataset.k || '')));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
