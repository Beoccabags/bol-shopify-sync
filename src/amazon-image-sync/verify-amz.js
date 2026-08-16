const fs = require('fs');
const { sp, MP, SELLER, sleep } = require('./sp');
const plan = JSON.parse(fs.readFileSync(__dirname + '/amz-plan.json', 'utf8'));

async function readBack(sku, cc) {
  const r = await sp('GET', `/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}`,
    { query: { marketplaceIds: MP[cc], includedData: 'attributes' } });
  if (r.status !== 200) return null;
  const a = r.json.attributes || {};
  const get = k => a[k]?.[0]?.media_location || null;
  return { main: get('main_product_image_locator'),
           others: Array.from({ length: 8 }, (_, i) => get(`other_product_image_locator_${i + 1}`)).filter(Boolean) };
}
(async () => {
  const cc = process.argv[2];
  const skus = Object.keys(plan).filter(s => plan[s].markets.includes(cc));
  const bad = [];
  let ok = 0;
  for (const sku of skus) {
    const live = await readBack(sku, cc);
    const p = plan[sku];
    if (!live) { bad.push([sku, 'niet leesbaar']); continue; }
    const mainOk = live.main === p.main;
    const othersOk = JSON.stringify(live.others) === JSON.stringify(p.others);
    if (mainOk && othersOk) ok++;
    else bad.push([sku, `${mainOk ? '' : 'hoofdbeeld wijkt af; '}${othersOk ? '' : `extra beelden ${live.others.length}/${p.others.length}`}`]);
    await sleep(350);
  }
  console.log(`${cc}: exact zoals gepland ${ok}/${skus.length}`);
  bad.forEach(([s, m]) => console.log(`   ${s.padEnd(16)} ${plan[s].product} — ${plan[s].variant}: ${m}`));
  fs.writeFileSync(`${__dirname}/verified-${cc}.json`, JSON.stringify({ ok, total: skus.length, bad }, null, 2));
})();
