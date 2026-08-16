const fs = require('fs');
const { kfl, sleep } = require('./kfl');
const U = JSON.parse(fs.readFileSync(__dirname + '/units.json', 'utf8'));
const cache = fs.existsSync(__dirname + '/offer-eans.json') ? JSON.parse(fs.readFileSync(__dirname + '/offer-eans.json', 'utf8')) : {};
(async () => {
  for (const u of U.de) {
    const base = u.id_offer.replace(/-[A-Z]{2}$/, '');
    if (cache[base]) continue;
    const r = await kfl('GET', `/products/${u.id_product}`, { query: 'storefront=de' });
    if (r.status !== 200) { console.log('FOUT', u.id_offer, r.status); await sleep(1200); continue; }
    cache[base] = { ean: r.json.data.eans?.[0], title: r.json.data.title, id_product_de: u.id_product };
    fs.writeFileSync(__dirname + '/offer-eans.json', JSON.stringify(cache, null, 2));
    await sleep(900);
  }
  const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
  const matched = Object.entries(cache).filter(([, v]) => v.ean && vi[v.ean]);
  console.log('offers met EAN:', Object.keys(cache).length);
  console.log('gekoppeld aan Shopify:', matched.length, '/ 52');
  Object.entries(cache).filter(([, v]) => !v.ean || !vi[v.ean])
    .forEach(([o, v]) => console.log('  GEEN match:', o, '| ean', v.ean, '|', (v.title || '').slice(0, 60)));
  console.log('gedekte Shopify-varianten:', new Set(matched.map(([, v]) => v.ean)).size);
})();
