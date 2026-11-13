// Date formats and order, period names, and dates in the Plan panel
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 }, locale: 'en-GB' })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars', scale: 'weeks' }); sel = null; commit(); refresh(); });
  console.log('version', await p.textContent('#version'), '| order default (en-GB):', await p.evaluate(() => state.settings.dateOrder));
  const head = () => p.evaluate(() => { const hs = scene.items.filter(i => i.t === 'text' && i.weight === 500 && i.y < 130 && i.y > 90); return hs.slice(0, 5).map(i => i.text).join(' ') + ' …'; });
  const ms = () => p.evaluate(() => scene.items.filter(i => i.t === 'text' && /^[\d\/A-Za-z ,]+$/.test(i.text) && i.weight === 500 && i.size < 15 && /\d/.test(i.text) && !/left$/.test(i.text) && i.y > 150).slice(0, 3).map(i => i.text).join(' | '));
  const ctl = () => p.evaluate(() => ({ sel: document.querySelector('[data-k="dateFormat"]').value, order: document.querySelector('[data-w="dateOrder"]').hidden ? 'hidden' : [...document.querySelectorAll('[data-k="dateOrder"] button')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join('/'), ex: document.querySelector('#date-ex').textContent.slice(0, 40) }));
  for (const f of ['text', 'textY', 'num', 'numY', 'numYY', 'day']) {
    await p.selectOption('[data-k="dateFormat"]', f);
    console.log(f.padEnd(6), '| weeks header:', (await head()).padEnd(52), '| milestones:', await ms(), '|', JSON.stringify(await ctl()));
  }
  await p.selectOption('[data-k="dateFormat"]', 'numY'); await p.click('[data-k="dateOrder"] [data-v="mdy"]');
  console.log('month first | header:', await head(), '| milestones:', await ms(), '|', (await ctl()).ex);
  await p.evaluate(() => { setSetting('scale', 'days'); setSetting('periodNames', false); });
  console.log('days scale, no period names:', await head());
  await p.evaluate(() => { setSetting('scale', 'weeks'); setSetting('periodNames', true); setSetting('dateFormat', 'num'); setSetting('dateOrder', 'dmy'); });
  console.log('plan panel dates:', await p.evaluate(() => [...document.querySelectorAll('.orow .dates')].slice(0, 3).map(e => e.textContent).join(' | ')));
  await p.locator('#canvas-wrap').screenshot({ path: 'datefmt.png' });
  // US locale gets month-first by default
  const us = await (await b.newContext({ viewport: { width: 1200, height: 800 }, locale: 'en-US' })).newPage();
  await us.goto('http://localhost:8765/'); await us.waitForTimeout(800); await us.evaluate(() => localStorage.clear()); await us.reload(); await us.waitForTimeout(800);
  console.log('en-US default order:', await us.evaluate(() => state.settings.dateOrder), '| a saved plan keeps its choice:', await us.evaluate(() => { const s = sanitize({ rows: [], settings: { dateOrder: 'dmy' } }); return s.settings.dateOrder; }));
  const dl = async kind => { await p.click('#btn-export'); const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click(`[data-export="${kind}"]`)]); return d.suggestedFilename(); };
  console.log('exports:', await dl('png'), await dl('pptx'));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
