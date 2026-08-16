const fs = require('fs');
const { kfl, sleep } = require('./kfl');
const U = JSON.parse(fs.readFileSync(__dirname + '/units.json', 'utf8'));
const offers = JSON.parse(fs.readFileSync(__dirname + '/offer-eans.json', 'utf8'));
const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
(async () => {
  const sf = process.argv[2];
  const out = {};
  for (const u of U[sf]) {
    const base = u.id_offer.replace(/-[A-Z]{2}$/, '');
    const ean = offers[base]?.ean;
    if (!ean || !vi[ean]) continue;
    const r = await kfl('GET', `/products/${u.id_product}`, { query: `storefront=${sf}` });
    out[ean] = { live: r.json?.data?.main_picture, planned: vi[ean].images[0].url.split('?')[0],
                 product: vi[ean].product, variant: vi[ean].variant };
    await sleep(800);
  }
  fs.writeFileSync(`${__dirname}/kfl-pics-${sf}.json`, JSON.stringify(out, null, 2));
  console.log(`${sf}: ${Object.keys(out).length} producten gelezen`);
})();
