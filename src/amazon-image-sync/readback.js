const fs = require('fs');
const { sp, MP, SELLER, sleep } = require('./sp');
const plan = JSON.parse(fs.readFileSync(__dirname + '/amz-plan.json', 'utf8'));
(async () => {
  const cc = process.argv[2];
  const skus = Object.keys(plan).filter(s => plan[s].markets.includes(cc));
  const out = {};
  for (const sku of skus) {
    const r = await sp('GET', `/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}`,
      { query: { marketplaceIds: MP[cc], includedData: 'attributes' } });
    const a = r.json?.attributes || {};
    const get = k => a[k]?.[0]?.media_location || null;
    out[sku] = { product: plan[sku].product, variant: plan[sku].variant,
      live: [get('main_product_image_locator'), ...Array.from({ length: 8 }, (_, i) => get(`other_product_image_locator_${i + 1}`))].filter(Boolean),
      planned: [plan[sku].main, ...plan[sku].others] };
    await sleep(300);
  }
  fs.writeFileSync(`${__dirname}/readback-${cc}.json`, JSON.stringify(out, null, 2));
  const short = Object.entries(out).filter(([, v]) => v.live.length < v.planned.length);
  console.log(`${cc}: ${Object.keys(out).length} SKU's gelezen; ${short.length} met minder beelden dan gepland`);
  console.log(`totaal live beelden: ${Object.values(out).reduce((s, v) => s + v.live.length, 0)} / gepland ${Object.values(out).reduce((s, v) => s + v.planned.length, 0)}`);
})();
