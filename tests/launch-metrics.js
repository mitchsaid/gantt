// Launch metrics: plan created / exported-or-shared once per plan with the ?ref= channel, design used once, share links
// marked via=share and told apart from the maker's own opens, the 14-day return
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  await ctx.addInitScript(() => { window.__gc = []; window.goatcounter = { count: o => window.__gc.push(o) }; });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  const events = () => p.evaluate(() => window.__gc.map(c => c.path));
  const count = async n => (await events()).filter(x => x === n).length;
  const must = (ok, msg) => { if (!ok) throw new Error(msg); };
  await p.goto('http://localhost:8765/?ref=li'); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelector('[data-add="task"]').click()); await p.waitForTimeout(150);
  await p.keyboard.type('One'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  await p.evaluate(() => document.querySelector('[data-add="task"]').click()); await p.waitForTimeout(150);
  must(await count('plan-created') === 1 && await count('plan-created-ref-li') === 1, 'plan-created should fire once, tagged li: ' + await events());
  // design
  await p.evaluate(() => document.querySelectorAll('#design [data-palette]')[2].click()); await p.waitForTimeout(100);
  await p.evaluate(() => document.querySelectorAll('#design [data-palette]')[3].click()); await p.waitForTimeout(100);
  must(await count('design-used') === 1, 'design-used once per visit');
  // export: conversion
  await p.click('#btn-export'); await p.click('[data-export="png"]'); await p.click('#exp-go'); await p.waitForTimeout(3800);
  must(await count('plan-exported-or-shared') === 1 && await count('plan-exported-or-shared-ref-li') === 1, 'conversion should fire once, tagged li');
  must(!(await p.isVisible('.fb-card')), 'no feedback card after an export');
  // share: the link is marked, the second delivery of the same plan doesn't count again, and the card doesn't return
  await p.click('#btn-share'); await p.waitForTimeout(3800);
  must(await count('plan-exported-or-shared') === 1, 'conversion counts once per plan');
  const link = await p.evaluate(() => navigator.clipboard.readText());
  must(/#via=share&plan=/.test(link), 'share link should carry via=share: ' + link.slice(0, 60));
  console.log('link starts:', link.slice(link.indexOf('#'), link.indexOf('#') + 30));
  // the maker opening their own link
  await p.goto('about:blank'); await p.goto(link); await p.waitForTimeout(1200);
  must(await count('open-own-share-link') === 1 && await count('open-share-link') === 0 && await count('open-ai-plan-link') === 0, 'own open: ' + await events());
  // someone else opening it (fresh browser, no ref), then exporting: delivered, not created
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx2.addInitScript(() => { window.__gc = []; window.goatcounter = { count: o => window.__gc.push(o) }; });
  const q = await ctx2.newPage(); q.on('pageerror', e => errs.push('ERR ' + e.message));
  await q.goto(link); await q.waitForTimeout(1200);
  let ev = await q.evaluate(() => window.__gc.map(c => c.path));
  must(ev.includes('open-share-link') && !ev.includes('open-own-share-link'), 'recipient open: ' + ev);
  const title = await q.evaluate(() => document.title);
  // the opened plan really is the shared one
  must(await q.evaluate(() => JSON.parse(localStorage.getItem('gantt:v1')).rows.some(r => r.name === 'One')), 'shared plan should open');
  await q.evaluate(() => document.querySelector('[data-add="task"]').click()); await q.waitForTimeout(150);
  ev = await q.evaluate(() => window.__gc.map(c => c.path));
  must(!ev.includes('plan-created'), 'adding to a shared plan is not creating one');
  await q.evaluate(() => shareLink()); await q.waitForTimeout(3800);
  ev = await q.evaluate(() => window.__gc.map(c => c.path));
  must(ev.includes('plan-exported-or-shared-ref-none'), 'recipient conversion tagged none: ' + ev);
  // return within 14 days: pretend the first plan was made 3 days ago, then edit
  await q.evaluate(() => { const m = JSON.parse(localStorage.getItem('gantt:metrics')); m.firstPlanDay = todayDay() - 3; localStorage.setItem('gantt:metrics', JSON.stringify(m)); });
  await q.reload(); await q.waitForTimeout(900);
  await q.evaluate(() => document.querySelector('[data-add="task"]').click()); await q.waitForTimeout(150);
  await q.evaluate(() => document.querySelector('[data-add="task"]').click()); await q.waitForTimeout(150);
  ev = await q.evaluate(() => window.__gc.map(c => c.path));
  must(ev.filter(x => x === 'return-within-14d').length === 1, 'return-within-14d once: ' + ev);
  // an old-style AI link (no via=share) still counts as an AI plan link
  const p3 = await (await b.newContext()).newPage();
  await p3.addInitScript(() => { window.__gc = []; window.goatcounter = { count: o => window.__gc.push(o) }; });
  await p3.goto("http://localhost:8765/#plan={'title':'X','items':[{'name':'A','start':'2026-01-05','end':'2026-01-09'}]}"); await p3.waitForTimeout(1000);
  ev = await p3.evaluate(() => window.__gc.map(c => c.path));
  must(ev.includes('open-ai-plan-link'), 'AI link: ' + ev);
  const all = (await events()).concat(ev);
  must(all.every(x => /^[a-z0-9-]+$/.test(x)), 'fixed names only');
  console.log('ok, title', title);
  console.log(errs.length ? errs.join('\n') : 'no page errors');
  await b.close();
})();
