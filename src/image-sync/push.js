const fs = require('fs');
const { auth } = require('./bol');
const plan = JSON.parse(fs.readFileSync(__dirname + '/upload-plan.json', 'utf8'));
const RES = __dirname + '/push-results.json';
const results = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const save = () => fs.writeFileSync(RES, JSON.stringify(results, null, 2));

(async () => {
  const eans = Object.keys(plan).filter(e => !results[e] || !results[e].processStatusId);
  console.log('te pushen:', eans.length);
  for (const ean of eans) {
    const p = plan[ean];
    const body = {
      language: 'nl',
      attributes: [{ id: 'EAN', values: [{ value: ean }] }],
      assets: p.assets.map(a => ({ url: a.url.split('?')[0], labels: a.labels })),
    };
    let ok = false;
    for (let a = 0; a < 6 && !ok; a++) {
      const t = await auth();
      const r = await fetch('https://api.bol.com/retailer/content/products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/vnd.retailer.v10+json', Accept: 'application/vnd.retailer.v10+json' },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      if (r.status === 429) { await sleep(4000 * (a + 1)); continue; }
      if (!r.ok) { results[ean] = { error: r.status + ' ' + txt.slice(0, 200), product: p.product, variant: p.variant }; ok = true; break; }
      const j = JSON.parse(txt);
      results[ean] = { processStatusId: j.processStatusId, assets: p.assets.length, product: p.product, variant: p.variant };
      console.log(`OK  ${ean}  ${p.product} — ${p.variant}  (${p.assets.length} foto's)`);
      ok = true;
    }
    if (!ok) results[ean] = { error: 'rate-limited na 6 pogingen', product: p.product, variant: p.variant };
    save();
    await sleep(1500);
  }
  const errs = Object.entries(results).filter(([, v]) => v.error);
  console.log(`\nIngezonden: ${Object.values(results).filter(v => v.processStatusId).length}/${Object.keys(plan).length}`);
  if (errs.length) { console.log('FOUTEN:'); errs.forEach(([e, v]) => console.log(' ', e, v.product, '—', v.variant, ':', v.error)); }
})();
