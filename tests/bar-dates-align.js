// Names on bars: left / centred / right alignment, dates under the name, and that the PNG export draws the same scene
const { chromium } = require('playwright');
const os = require('os'), path = require('path'), fs = require('fs');
(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-dates-'));
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); Object.assign(state.settings, { taskLabels: 'bars', progress: true }); sel = null; commit(); refresh(); });
  console.log('version', await p.textContent('#version'));
  console.log('controls:', await p.evaluate(() => ['barAlign', 'barDates'].map(k => { const e = document.querySelector(`#design [data-w="${k}"]`); return k + (e ? (e.hidden ? '(hidden)' : '') : '(missing)'); }).join(', ')));
  const look = () => p.evaluate(() => {
    const n = scene.info.find(n => !n.sub && !n.isArea && !n.milestone && n.inside && !n.hasKids);
    const t = scene.items.filter(i => i.t === 'text' && i.x >= n.bx - 1 && i.x <= n.bx + n.bw + 1 && Math.abs(i.y - n.cy) < n.bh / 2);
    const withDates = scene.info.filter(n => n.dates).length, besides = scene.info.filter(n => n.tail.some(t => t.k === 'date')).length;
    return `${n.row.name}: bar ${Math.round(n.bx)}–${Math.round(n.bx + n.bw)} h ${n.bh} | ` + t.map(i => `"${i.text}" ${i.anchor} x${Math.round(i.x)} y${Math.round(i.y - n.cy)}`).join(', ') + ` | dates on bar ${withDates}, beside ${besides}`;
  });
  for (const a of ['left', 'center', 'right']) { await p.evaluate(a => setSetting('barAlign', a), a); console.log(a.padEnd(7), await look()); }
  await p.evaluate(() => setSetting('barDates', true));
  for (const a of ['left', 'center', 'right']) {
    await p.evaluate(a => setSetting('barAlign', a), a); console.log('dates ' + a.padEnd(7), await look());
    await p.locator('#canvas-wrap').screenshot({ path: path.join(out, `dates-${a}.png`) });
  }
  console.log('date colours  ', await p.evaluate(() => { const n = scene.info.find(n => n.dates); const t = scene.items.filter(i => i.t === 'text' && (i.text === n.dates.text || i.text === scene.info.find(m => m === n).row.name)); return t.map(i => `"${i.text}" ${i.fill}${i.fill2 ? '/' + i.fill2 : ''}`).join(', '); }));
  await p.evaluate(() => setSetting('barDateKind', 'duration')); console.log('duration     ', await look());
  await p.locator('#canvas-wrap').screenshot({ path: path.join(out, 'duration.png') });
  await p.evaluate(() => setSetting('barDateKind', 'dates'));
  await p.evaluate(() => setSetting('dateMode', 'relative')); console.log('relative     ', await look());
  await p.evaluate(() => { setSetting('dateMode', 'calendar'); setSetting('pack', true); }); console.log('in sequence  ', await look());
  await p.locator('#canvas-wrap').screenshot({ path: path.join(out, 'dates-pack.png') });
  const dl = async kind => { await p.click('#btn-export'); const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click(`[data-export="${kind}"]`).then(() => ['png', 'pdf', 'pptx', 'copy'].includes(kind) && p.click('#exp-go'))]); return d.suggestedFilename(); };
  console.log('exports:', await dl('png'), await dl('pptx'));
  console.log('stored after reload:', await p.evaluate(() => { const s = sanitize(JSON.parse(localStorage.getItem('gantt:v1'))).settings; return s.barAlign + ' ' + s.barDates; }));
  console.log(errs.join('\n') || 'no errors');
  console.log('screenshots in', out);
  await b.close();
})();
