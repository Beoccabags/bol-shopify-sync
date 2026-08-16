const fs = require('fs');
const { kfl, sleep } = require('./kfl');
const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
const offers = JSON.parse(fs.readFileSync(__dirname + '/offer-eans.json', 'utf8'));
const U = JSON.parse(fs.readFileSync(__dirname + '/units.json', 'utf8'));
(async () => {
  const [sf, locale] = process.argv.slice(2);
  const eans = [...new Set(Object.values(offers).map(o => o.ean))].filter(e => vi[e]);
  const out = {}; const tally = {};
  for (const ean of eans) {
    const r = await kfl('GET', `/product-data/status/${ean}`, { query: `storefront=${sf}&locale=${locale}` });
    const d = r.json?.data || {};
    out[ean] = { update_status: d.update_status, ready: d.product_ready, reason: d.update_fail_reason,
                 id_product: d.id_product, product: vi[ean].product, variant: vi[ean].variant };
    const k = `${d.update_status}/${d.product_ready ? 'ready' : 'niet-ready'}`;
    tally[k] = (tally[k] || 0) + 1;
    if (d.update_status !== 'SUCCESS') console.log(`  ${d.update_status} ${ean} ${vi[ean].product} — ${vi[ean].variant}: ${d.update_fail_reason || ''}`);
    await sleep(900);
  }
  fs.writeFileSync(`${__dirname}/kfl-status-${locale}.json`, JSON.stringify(out, null, 2));
  console.log(`${locale}:`, JSON.stringify(tally));
})();
