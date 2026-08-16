const fs = require('fs');
const { auth } = require('./bol');
const st = JSON.parse(fs.readFileSync(__dirname + '/verify-status.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = {};
  for (const [ean, v] of Object.entries(st)) {
    if (!v.entityId) continue;
    let got = null;
    for (let a = 0; a < 6; a++) {
      const t = await auth();
      const r = await fetch(`https://api.bol.com/retailer/content/upload-report/${v.entityId}`, {
        headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.retailer.v10+json' } });
      if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
      const txt = await r.text();
      if (!r.ok) { got = { httpError: r.status, body: txt.slice(0, 150) }; break; }
      got = JSON.parse(txt); break;
    }
    out[ean] = { product: v.product, variant: v.variant, report: got };
    await sleep(800);
  }
  fs.writeFileSync(__dirname + '/upload-reports.json', JSON.stringify(out, null, 2));

  const overall = {}, sub = {};
  let assetsTotal = 0;
  for (const [ean, v] of Object.entries(out)) {
    const rep = v.report || {};
    overall[rep.status || 'GEEN RAPPORT'] = (overall[rep.status || 'GEEN RAPPORT'] || 0) + 1;
    for (const a of rep.assets || []) { assetsTotal++; const k = `${a.status}/${a.subStatus}`; sub[k] = (sub[k] || 0) + 1; }
  }
  console.log('EAN-rapportstatus:', overall);
  console.log('assets totaal:', assetsTotal);
  console.log('asset-status:', sub);
  const problems = Object.entries(out).flatMap(([ean, v]) =>
    (v.report?.assets || []).filter(a => a.status === 'DECLINED' || a.subStatus === 'ERROR')
      .map(a => `${ean} ${v.product} — ${v.variant}: ${a.url.split('/').pop()} [${a.labels}] ${a.subStatus} ${a.subStatusDescription || ''}`));
  if (problems.length) { console.log('\nPROBLEMEN:'); problems.forEach(p => console.log(' ', p)); }
  else console.log('\ngeen afgekeurde afbeeldingen');
})();
