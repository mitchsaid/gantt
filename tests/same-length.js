// Multi-select and the 'Same length' action
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(800);
  console.log('version', await p.textContent('#version'));
  await p.evaluate(() => { localStorage.clear(); state = sampleState(); state.settings.taskLabels = 'bars'; sel = null; commit(); refresh(); });
  const lens = names => p.evaluate(names => names.map(n => { const r = state.rows.find(r => r.name === n); return n + '=' + (r.end - r.start + 1) + 'd'; }).join('  '), names);
  const names = ['Stakeholder interviews', 'Audit & research', 'UX & wireframes', 'Visual design', 'Front-end', 'CMS & integrations'];
  console.log('before                :', await lens(['Stakeholder interviews', 'Audit & research', 'Visual design', 'CMS & integrations']));
  // select four leaf tasks
  await p.evaluate(() => { const ids = ['Stakeholder interviews', 'Audit & research', 'Visual design', 'CMS & integrations'].map(n => state.rows.find(r => r.name === n).id); select(ids[0]); ids.slice(1).forEach(id => multiSelect(id, 'toggle')); document.activeElement && document.activeElement.blur(); });
  console.log('toolbar               :', await p.evaluate(() => [...document.querySelectorAll('#selbar button')].map(b => b.textContent.trim()).join(' | ')));
  await p.click('[data-sel="even"]'); await p.waitForTimeout(200);
  console.log('after Same length     :', await lens(['Stakeholder interviews', 'Audit & research', 'Visual design', 'CMS & integrations']), '| toast:', await p.evaluate(() => (document.querySelector('.toast') || {}).textContent));
  console.log('starts untouched      :', await p.evaluate(() => state.rows.find(r => r.name === 'Visual design').start === toDay(2026, 10, 16)));
  await p.click('#btn-undo'); console.log('undo                  :', await lens(['Stakeholder interviews', 'Audit & research', 'Visual design', 'CMS & integrations']));
  // select all, then even them out (areas contribute the tasks inside them; milestones are left alone)
  await p.keyboard.press('Control+KeyA'); await p.waitForTimeout(200);
  await p.click('[data-sel="even"]'); await p.waitForTimeout(200);
  console.log('Ctrl+A, Same length   :', await p.evaluate(() => { const d = derive(state.rows).filter(n => !n.hasKids && !n.milestone).map(n => n.row.end - n.row.start + 1); return [...new Set(d)].join(',') + ' (distinct lengths) across ' + d.length + ' tasks; milestones unchanged: ' + derive(state.rows).filter(n => n.milestone).every(n => n.row.start === n.row.end); }), '|', await p.evaluate(() => (document.querySelector('.toast') || {}).textContent));
  // one task selected: toolbar not shown
  await p.evaluate(() => { select(state.rows.find(r => r.name === 'Visual design').id); }); console.log('single selection      : toolbar hidden =', await p.evaluate(() => document.querySelector('#selbar').hidden));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
