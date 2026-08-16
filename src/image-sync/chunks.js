const fs = require('fs');
const { auth } = require('./bol');
const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
const EAN_OVERRIDE = { '8721398221502': '7440853174146' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = fs.existsSync(__dirname + '/ean-chunks.json')
    ? JSON.parse(fs.readFileSync(__dirname + '/ean-chunks.json', 'utf8')) : {};
  for (const shopEan of Object.keys(vi)) {
    const ean = EAN_OVERRIDE[shopEan] || shopEan;
    if (out[ean]) continue;
    for (let a = 0; a < 6; a++) {
      const t = await auth();
      const r = await fetch(`https://api.bol.com/retailer/content/catalog-products/${ean}`, {
        headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.retailer.v10+json', 'Accept-Language': 'nl' },
      });
      if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
      if (!r.ok) { console.log('ERR', ean, r.status); break; }
      const j = await r.json();
      out[ean] = { shopEan, chunkId: j.gpc && j.gpc.chunkId, enrichment: j.enrichment && j.enrichment.status,
                   product: vi[shopEan].product, variant: vi[shopEan].variant };
      break;
    }
    await sleep(1200);
  }
  fs.writeFileSync(__dirname + '/ean-chunks.json', JSON.stringify(out, null, 2));
  const byChunk = {};
  for (const [e, d] of Object.entries(out)) (byChunk[d.chunkId] ||= []).push(`${d.product} — ${d.variant}`);
  console.log('opgehaald:', Object.keys(out).length, 'van', Object.keys(vi).length);
  for (const [c, list] of Object.entries(byChunk)) console.log(`\nchunk ${c}: ${list.length}\n  ` + list.join('\n  '));
})();
