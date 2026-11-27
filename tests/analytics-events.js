// GoatCounter events: the script is not loaded off the live site, major actions are counted by fixed names only, and no plan text leaks into them
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  await ctx.addInitScript(() => { window.__gc = []; window.goatcounter = { count: o => window.__gc.push(o) }; });
  const txt = fs.readFileSync(path.join(__dirname, '..', 'llms.txt'), 'utf8');
  const example = txt.match(/https:\/\/slideline\.co\/#plan=\S+/g).pop().replace('https://slideline.co/', 'http://localhost:8765/');
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto(example); await p.waitForTimeout(1100);
  console.log('count.js tag on localhost:', await p.evaluate(() => !!document.querySelector('script[data-goatcounter]')));
  await p.click('#btn-new'); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelector('[data-add="task"]').click()); await p.waitForTimeout(150);
  await p.keyboard.type('Secret task name'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelector('[data-add="milestone"]').click()); await p.waitForTimeout(150);
  await p.click('#btn-share'); await p.waitForTimeout(300);
  await p.click('#btn-export'); await p.click('[data-export="png"]'); await p.click('#exp-go'); await p.waitForTimeout(800);
  await p.click('#btn-export'); await p.click('[data-export="link"]'); await p.waitForTimeout(300);
  await p.click('#btn-import'); await p.waitForTimeout(100);
  await p.evaluate(() => document.querySelector('#imp-ai-copy').click()); await p.waitForTimeout(100);
  await p.fill('#imp-text', 'Design\n\tWireframes 2 weeks'); await p.waitForTimeout(400);
  await p.click('#imp-go'); await p.waitForTimeout(200);
  const calls = await p.evaluate(() => window.__gc);
  console.log('events:', calls.map(c => c.path).join(', '));
  if (calls.some(c => !c.event || c.path !== c.title || !/^[a-z0-9-]+$/.test(c.path))) throw new Error('an event carries something other than a fixed name: ' + JSON.stringify(calls));
  for (const want of ['open-ai-plan-link', 'new-chart', 'add-task', 'add-milestone', 'share-link', 'export-png', 'copy-ai-prompt', 'import-paste'])
    if (!calls.some(c => c.path === want)) throw new Error('missing event ' + want);
  if (calls.filter(c => c.path === 'share-link').length !== 2) throw new Error('share link from the button and the Export menu should each count once');
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
