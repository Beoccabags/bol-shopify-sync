// Verstuurt content-plan.json naar bol (POST /retailer/content/products), per EAN eerst NL dan FR.
// Hervatbaar: push-results.json bewaart de processStatusId per EAN/taal.
// Gebruik: node push-content.js [--only EAN[,EAN]] [--lang nl|fr]
const fs = require('fs');
const { auth } = require('../image-sync/bol');
const plan = JSON.parse(fs.readFileSync(__dirname + '/content-plan.json', 'utf8'));
const RES = __dirname + '/push-results.json';
const results = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const langs = args.includes('--lang') ? [args[args.indexOf('--lang') + 1]] : ['nl', 'fr'];
(async () => {
  const eans = Object.keys(plan).filter(e => !only || only.includes(e));
  let sent = 0;
  for (const ean of eans) {
    results[ean] ||= { product: plan[ean].product, variant: plan[ean].variant };
    for (const lang of langs) {
      if (results[ean][lang] && results[ean][lang].processStatusId) continue;
      const body = plan[ean][lang];
      let done = false;
      for (let a = 0; a < 6 && !done; a++) {
        let r, txt;
        try {
          const t = await auth();
          r = await fetch('https://api.bol.com/retailer/content/products', {
            method: 'POST',
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/vnd.retailer.v10+json', Accept: 'application/vnd.retailer.v10+json' },
            body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
          });
          txt = await r.text();
        } catch (e) { console.log('netwerkfout, opnieuw:', ean, lang, e.message); await sleep(5000 * (a + 1)); continue; }
        if (r.status === 429) { await sleep(4000 * (a + 1)); continue; }
        if (!r.ok) { results[ean][lang] = { error: r.status + ' ' + txt.slice(0, 300), at: new Date().toISOString() }; console.log('FOUT', ean, lang, r.status, txt.slice(0, 200)); done = true; break; }
        const j = JSON.parse(txt);
        results[ean][lang] = { processStatusId: j.processStatusId, at: new Date().toISOString() };
        console.log(`OK  ${ean} ${lang}  ${plan[ean].product} — ${plan[ean].variant}  ps=${j.processStatusId}`);
        sent++; done = true;
      }
      if (!done) results[ean][lang] = { error: 'rate-limited na 6 pogingen' };
      fs.writeFileSync(RES, JSON.stringify(results, null, 2));
      await sleep(1500);
    }
  }
  const errs = Object.entries(results).flatMap(([e, v]) => ['nl', 'fr'].filter(l => v[l] && v[l].error).map(l => `${e} ${l}: ${v[l].error}`));
  console.log(`\nverstuurd nu: ${sent}; met processStatusId: ${Object.values(results).reduce((s, v) => s + ['nl', 'fr'].filter(l => v[l] && v[l].processStatusId).length, 0)}/${Object.keys(plan).length * 2}`);
  if (errs.length) { console.log('FOUTEN:'); errs.forEach(x => console.log(' ', x)); }
})().catch(e => { console.error(e); process.exit(1); });
