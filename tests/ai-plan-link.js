// The #plan= links in llms.txt: the worked examples (create, edit) open, standard JSON with the lightest encoding opens, lighter encodings and base64 open, a broken one says so, and the Import dialog points to it
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const txt = fs.readFileSync(path.join(__dirname, '..', 'llms.txt'), 'utf8');
  const links = txt.match(/https:\/\/slideline\.co\/#plan=\{\S+/g).map(u => u.replace('https://slideline.co/', 'http://localhost:8765/'));
  const [example, before, after] = links; // creating, then editing
  const json = JSON.stringify(JSON.parse(txt.split('## Worked example: creating a plan')[1].split('The plan:')[1].split('The link to give back:')[0])); // standard JSON, as some AIs write it
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

  // the editing example: the edit landed and the design came along
  const ep = await open(after);
  console.log('edit example:', await ep.evaluate(() => { const f = state.rows.find(r => r.name === 'Front-end'); return JSON.stringify({ frontEnd: dayToIso(f.end) + ' @' + f.assignee + ' ' + f.progress + '%', font: state.settings.font, palette: state.settings.palette.id, rows: state.rows.length }); }));
  const bp0 = await open(before);
  console.log('before example font:', await bp0.evaluate(() => state.settings.font));

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

  // the note on the homepage for AI tools that read it as text: off screen for people, in the page text, and its example opens
  const home = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const noteLink = home.match(/<div class="ai-note"[\s\S]*?(https:\/\/slideline\.co\/#plan=\S+?)<\/p>/)[1].replace('https://slideline.co/', 'http://localhost:8765/');
  const np = await open(noteLink);
  console.log('note example rows:', await np.evaluate(() => state.rows.map(r => r.name).join(', ')), '| note in page text', await np.evaluate(() => document.body.innerText.includes('Note for AI assistants')), '| on screen', await np.evaluate(() => { const r = document.querySelector('.ai-note').getBoundingClientRect(); return r.right > 0 && r.width > 1; }));
  if (await np.evaluate(() => state.rows.length) !== 4) throw new Error('homepage note example did not open');

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
