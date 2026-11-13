// Enter on an empty chart makes a task; Enter / Shift+Enter on a selection; typing renames
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  console.log('version', await p.textContent('#version'));
  // 1. empty chart: Enter makes a task
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.rows = []; sel = null; commit(); refresh(); });
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  console.log('Enter on empty chart:', await p.evaluate(() => state.rows.map(r => r.level + ':' + (r.name || '(new)') + ':' + r.type).join(' | ')), '| editing:', await p.evaluate(() => !!(document.activeElement && (document.activeElement.tagName === 'INPUT'))));
  await p.keyboard.type('First task'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('Escape');
  console.log('after typing a name :', await p.evaluate(() => state.rows.map(r => r.name).join(' | ')));
  // 2. shift + arrows
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); sel = null; commit(); refresh(); });
  const get = n => p.evaluate(n => { const r = state.rows.find(r => r.name === n); return dayToIso(r.start).slice(5) + '..' + dayToIso(r.end).slice(5); }, n);
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Visual design').id); document.activeElement.blur(); });
  console.log('Visual design before:', await get('Visual design'));
  await p.keyboard.press('Shift+ArrowRight'); await p.keyboard.press('Shift+ArrowRight'); console.log('Shift+→ ×2          :', await get('Visual design'));
  await p.keyboard.press('Shift+ArrowLeft'); console.log('Shift+←             :', await get('Visual design'));
  await p.keyboard.press('ArrowRight'); console.log('→ (nudge a day)     :', await get('Visual design'));
  await p.keyboard.press('Alt+ArrowLeft'); console.log('Alt+← (a week)      :', await get('Visual design'));
  // a subtask, a parent and a milestone
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Wireframes').id); }); const w0 = await get('Wireframes'); await p.keyboard.press('Shift+ArrowRight'); console.log('subtask             :', w0, '->', await get('Wireframes'));
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Design sign-off').id); }); const m0 = await get('Design sign-off'); await p.keyboard.press('Shift+ArrowRight'); console.log('milestone (ignored) :', m0, '->', await get('Design sign-off'));
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'UX & wireframes').id); }); const u0 = await get('UX & wireframes'); await p.keyboard.press('Shift+ArrowRight'); console.log('parent task (ignored):', u0, '->', await get('UX & wireframes'));
  // undo is one step per burst
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Visual design').id); }); const v0 = await get('Visual design'); for (let i = 0; i < 3; i++) await p.keyboard.press('Shift+ArrowRight'); await p.waitForTimeout(700); await p.click('#btn-undo'); console.log('undo after 3 presses :', v0, '->', await get('Visual design'));
  // typing in a field must not stretch anything
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Visual design').id); detailId = state.rows.find(r => r.name === 'Visual design').id; renderOutline(); });
  await p.focus('.detail [data-f="name"], .orow.sel .nm').catch(() => {}); const f0 = await get('Visual design'); await p.keyboard.press('Shift+ArrowRight'); console.log('in a text field      :', f0, '->', await get('Visual design'));
  // 3. quick toggles
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.settings.todayLine = true; state.settings.todayDate = toDay(2026, 10, 25); sel = null; commit(); refresh(); });
  const qs = () => p.evaluate(() => ({ progress: document.querySelector('#qs-progress').getAttribute('aria-pressed'), base: document.querySelector('#qs-base-text').textContent, pressed: document.querySelector('#qs-base').getAttribute('aria-pressed'), none: document.querySelector('#qs-base').classList.contains('none'), count: document.querySelector('#qs-base-count').hidden ? '-' : document.querySelector('#qs-base-count').textContent, menu: document.querySelector('#qs-base-menu').hidden ? 'hidden' : 'shown' }));
  console.log('initial chips       :', JSON.stringify(await qs()));
  await p.click('#qs-progress'); console.log('progress on         :', JSON.stringify(await qs()), '| setting', await p.evaluate(() => state.settings.progress + '/' + state.settings.progressSource));
  await p.click('#qs-progress'); console.log('progress off        :', (await qs()).progress);
  await p.click('#qs-base'); console.log('set baseline        :', JSON.stringify(await qs()), '| rows with baseline', await p.evaluate(() => state.rows.filter(r => r.baseline).length), '| showChanges', await p.evaluate(() => state.settings.showChanges));
  await p.evaluate(() => { state.rows.find(r => r.name === 'Visual design').end += 5; state.rows.find(r => r.name === 'Wireframes').start += 3; commit(); refresh(); });
  console.log('after two edits     :', JSON.stringify(await qs()));
  await p.click('#qs-base'); console.log('hide changes        :', JSON.stringify(await qs()));
  await p.click('#qs-base'); console.log('show again          :', JSON.stringify(await qs()));
  await p.click('#qs-base-menu'); console.log('menu dialog         :', await p.evaluate(() => document.querySelector('.dialog h2').textContent)); await p.click('.dialog [data-i="2"]');
  await p.locator('.chart-add').screenshot({ path: 'qs-chips.png' });
  // marker-mode progress stays marker when toggled
  await p.evaluate(() => { setSetting('progressMode', 'marker'); }); await p.click('#qs-progress'); await p.click('#qs-progress'); console.log('marker mode restored:', await p.evaluate(() => state.settings.progressSource));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
