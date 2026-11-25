// The readable #plan= link an AI writes from llms.txt: the worked example opens, lighter encodings and base64 open, a broken one says so, and the Import dialog points to it
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const txt = fs.readFileSync(path.join(__dirname, '..', 'llms.txt'), 'utf8');
  const example = txt.match(/https:\/\/slideline\.co\/#plan=\S+/g).pop().replace('https://slideline.co/', 'http://localhost:8765/');
  const json = decodeURIComponent(example.split('#plan=')[1]);
  const open = async (url, viewport) => {
    const ctx = await b.newContext({ viewport: viewport || { width: 1400, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(url); await p.waitForTimeout(1100);
    return p;
  };
  const sum = p => p.evaluate(() => JSON.stringify({ title: state.settings.title, rows: state.rows.map(r => '  '.repeat(r.level) + r.name + (r.type === 'milestone' ? ' ◆' : '') + ' ' + dayToIso(r.start) + (r.end !== r.start ? '→' + dayToIso(r.end) : '') + (r.assignee ? ' @' + r.assignee : '') + (r.deps.length ? ' after ' + r.deps.map(d => state.rows.find(x => x.id === d).name).join('+') : '') + (r.key ? ' key' : '')), assignees: state.settings.assignees, deps: state.settings.deps, hash: location.hash, toast: document.querySelector('#toast').textContent }, null, 1));

  console.log('served llms.txt:', await (await open('http://localhost:8765/llms.txt')).evaluate(() => document.body.innerText.slice(0, 11)));
  console.log('example link length', example.length);
  const p = await open(example);
  console.log('worked example:', await sum(p));
  await p.screenshot({ path: 'ai-example.png' });
  if (await p.evaluate(() => state.rows.length) !== 12) throw new Error('worked example did not open whole');

  // the minimum hand encoding (spaces and quotes only), and base64url from an agent that runs code
  const light = await open('http://localhost:8765/#plan=' + json.replace(/%/g, '%25').replace(/ /g, '%20').replace(/"/g, '%22'));
  console.log('light encoding same rows:', await light.evaluate(() => state.rows.length), '| hash cleared', await light.evaluate(() => location.hash === ''));
  const b64 = Buffer.from(json).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const bp = await open('http://localhost:8765/#plan=' + b64);
  console.log('base64url same rows:', await bp.evaluate(() => state.rows.length));

  // lenient: a missing end, days instead of end, deeper nesting, a progress string, an unknown dependency name
  const loose = { title: 'Loose', items: [{ name: 'Phase', items: [{ name: 'A', start: '2027-05-03' }, { name: 'B', start: '2027-05-10', days: 10, progress: '50%', after: ['A', 'Nope'], items: [{ name: 'B1', start: '2027-05-10', end: '2027-05-12', items: [{ name: 'too deep', start: '2027-05-11', end: '2027-05-11' }] }] }] }] };
  const lp = await open('http://localhost:8765/#plan=' + encodeURIComponent(JSON.stringify(loose)));
  console.log('lenient:', await sum(lp), '| progress on', await lp.evaluate(() => state.settings.progress));

  // a cut-off link says what went wrong and leaves the plan alone
  const cut = await open(example.slice(0, 400));
  console.log('cut link:', await cut.evaluate(() => JSON.stringify({ toast: document.querySelector('#toast').textContent, hash: location.hash, title: state.settings.title })));

  // the Import dialog's pointer
  const ip = await open('http://localhost:8765/');
  await ip.click('#btn-import'); await ip.waitForTimeout(300);
  await ip.click('#imp-ai-copy'); await ip.waitForTimeout(200);
  console.log('copied prompt:', await ip.evaluate(() => navigator.clipboard.readText()), '| link', await ip.evaluate(() => document.querySelector('.imp-ai a').href));
  await ip.screenshot({ path: 'ai-import.png' });
  const mp = await open('http://localhost:8765/', { width: 390, height: 800 });
  await mp.evaluate(() => openModal()); await mp.waitForTimeout(300);
  await mp.screenshot({ path: 'ai-import-mobile.png' });

  if (errs.length) { console.log(errs.join('\n')); process.exitCode = 1; }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
