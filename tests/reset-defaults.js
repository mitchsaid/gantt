// Reset to defaults: design only, everything, Undo and Cancel
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(900);
  console.log('version', await p.textContent('#version'));
  const mess = () => p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { title: 'My board plan', taskLabels: 'bars', progress: true, todayLine: true, keyStrip: true, criticalPath: true, deps: true, projectStatus: 'red', periodYear: 'always', scale: 'days', corners: 'square', textCase: 'upper' }); state.rows[2].color = 3; state.rows.find(r => r.type === 'milestone').msAlign = 'start'; state.rows[1].status = 'amber'; commit(); refresh(); buildDesign(); syncDesign(); });
  await mess();
  const diff = () => p.evaluate(() => Object.keys(DEFAULT_SETTINGS).filter(k => k !== 'title' && JSON.stringify(state.settings[k]) !== JSON.stringify(DEFAULT_SETTINGS[k])));
  console.log('settings differing before:', (await diff()).join(', '));
  console.log('button present:', await p.evaluate(() => !!document.querySelector('#design [data-act="reset"]')));
  await p.click('#design [data-act="reset"]'); await p.waitForTimeout(250);
  console.log('dialog buttons:', await p.evaluate(() => [...document.querySelectorAll('.dialog-btns button')].map(b => b.textContent).join(' / ')));
  await p.click('.dialog-btns button:has-text("Reset the design")'); await p.waitForTimeout(400);
  console.log('after reset — differing:', JSON.stringify(await diff()), '| title kept:', await p.evaluate(() => state.settings.title), '| rows kept:', await p.evaluate(() => state.rows.length), '| status kept:', await p.evaluate(() => state.rows[1].status), '| row colour/msAlign cleared:', await p.evaluate(() => state.rows[2].color === undefined && !state.rows.some(r => r.msAlign)));
  console.log('controls follow:', await p.evaluate(() => document.querySelector('[data-k="keyStrip"]').checked + ' keyStrip, scale seg on = ' + document.querySelector('[data-k="scale"] button.on').textContent));
  await p.click('#btn-undo'); await p.waitForTimeout(300);
  console.log('undo restores   :', await p.evaluate(() => state.settings.scale + ' / ' + state.settings.keyStrip + ' / ' + state.settings.corners + ' / colour ' + state.rows[2].color));
  await p.click('#design [data-act="reset"]'); await p.waitForTimeout(250); await p.click('.dialog-btns button:has-text("Reset everything")'); await p.waitForTimeout(400);
  console.log('reset everything:', await p.evaluate(() => state.rows.map(r => r.name).join(', ') + ' | title ' + state.settings.title));
  await p.click('#btn-undo'); await p.waitForTimeout(300);
  console.log('undo brings plan back:', await p.evaluate(() => state.rows.length + ' rows, title ' + state.settings.title));
  await p.click('#design [data-act="reset"]'); await p.waitForTimeout(250); await p.click('.dialog-btns button:has-text("Cancel")'); console.log('cancel leaves things:', await p.evaluate(() => state.settings.scale));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
