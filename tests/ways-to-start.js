// Ways to start: the card shows on a first visit and on a new plan, its three choices work and are counted by name, it goes when the plan changes, and closing the first-visit card keeps it gone while a new plan always offers it again
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const shown = p => p.evaluate(() => !document.querySelector('#guide').hidden && document.querySelector('#guide .guide-head b').textContent);
  const events = p => p.evaluate(() => window.__gc.map(c => c.path).filter(n => n.startsWith('guide-')).join(','));
  const fresh = async (vp, mob) => {
    const ctx = await b.newContext({ viewport: vp, isMobile: !!mob, hasTouch: !!mob, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(() => { window.__gc = []; window.goatcounter = { count: o => window.__gc.push(o) }; });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto('http://localhost:8765/'); await p.waitForTimeout(700);
    return p;
  };

  // first visit: shown over the example; a reload before choosing keeps it; editing the plan ends it for good
  let p = await fresh({ width: 1400, height: 900 });
  console.log('first visit:', await shown(p));
  await p.reload(); await p.waitForTimeout(600);
  console.log('after reload, untouched:', await shown(p));
  await p.click('[data-guide="edit"]'); await p.waitForTimeout(250);
  console.log('edit this example → editing:', await p.evaluate(() => !!document.querySelector('.inline-edit, #pop-name')), 'card:', await shown(p), 'events:', await events(p));
  await p.keyboard.type('My first task'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  await p.reload(); await p.waitForTimeout(600);
  console.log('after reload, chosen:', await shown(p));
  if (await shown(p)) throw new Error('first-visit card came back after a choice');

  // new plan: shown; Paste opens Import; Undo / an edit hides it
  await p.click('#btn-new'); await p.waitForTimeout(200);
  console.log('new plan:', await shown(p));
  await p.click('[data-guide="paste"]'); await p.waitForTimeout(200);
  console.log('paste → import open:', await p.evaluate(() => !document.querySelector('#import-modal').hidden), 'card:', await shown(p));
  await p.click('#import-modal [data-close-modal]');
  await p.click('#btn-new'); await p.waitForTimeout(200);
  await p.click('[data-guide="ai"]'); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  console.log('ask an AI → clipboard:', clip, '| card:', await shown(p));
  if (!/slideline\.co\/llms\.txt/.test(clip)) throw new Error('the AI prompt was not copied');
  await p.click('#btn-new'); await p.waitForTimeout(200);
  await p.click('#btn-undo'); await p.waitForTimeout(200);
  console.log('undo the new plan → card:', await shown(p));
  await p.click('#btn-new'); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('[data-add="task"]').click()); await p.waitForTimeout(200);
  console.log('add a task → card:', await shown(p));
  await p.click('#btn-new'); await p.waitForTimeout(200);
  await p.click('[data-guide="dismiss"]'); await p.waitForTimeout(150);
  await p.click('#btn-new'); await p.waitForTimeout(200);
  console.log('after ✕ on a new plan, next new plan:', await shown(p));
  if (!await shown(p)) throw new Error('the new-plan card should come back on the next new plan');
  const ev = await events(p);
  console.log('events:', ev);
  for (const want of ['guide-paste', 'guide-ask-ai', 'guide-dismiss']) if (!ev.includes(want)) throw new Error('missing event ' + want);
  console.log('stored ui:', await p.evaluate(() => { const u = JSON.parse(localStorage.getItem('gantt:ui')); return u.guideFirst; }));

  // someone who already has a plan here never sees the first-visit card; a shared link doesn't show it either
  p = await fresh({ width: 1400, height: 900 });
  await p.evaluate(() => { localStorage.setItem('gantt:v1', JSON.stringify(sampleState())); localStorage.removeItem('gantt:ui'); });
  await p.reload(); await p.waitForTimeout(600);
  console.log('returning user:', await shown(p));
  if (await shown(p)) throw new Error('a returning user saw the first-visit card');
  await p.evaluate(() => localStorage.clear()); await p.goto('http://localhost:8765/#plan=' + encodeURIComponent('{"title":"T","items":[{"name":"A","start":"2027-01-04","end":"2027-01-08"}]}')); await p.reload(); await p.waitForTimeout(700);
  console.log('arriving on a plan link:', await shown(p));
  if (await shown(p)) throw new Error('the card showed over a shared plan');

  // phone: fits the screen, closes
  p = await fresh({ width: 390, height: 844 }, true);
  const box = await p.evaluate(() => { const r = document.querySelector('#guide').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.height)]; });
  console.log('phone card left/right/height:', box.join(' '), 'card:', await shown(p));
  if (box[1] > 390) throw new Error('the card is wider than the phone screen');
  await p.screenshot({ path: 'ways-to-start-phone.png' });
  await p.tap('[data-guide="dismiss"]'); await p.waitForTimeout(150);
  console.log('phone ✕ → card:', await shown(p), 'events:', await events(p));

  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
