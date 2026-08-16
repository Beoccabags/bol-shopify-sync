const fs = require('fs');
const { kfl, sleep } = require('./kfl');
const SF = ['de', 'at', 'cz', 'sk', 'pl', 'nl', 'fr', 'es', 'it'];
(async () => {
  const all = {};
  for (const sf of SF) {
    const units = [];
    for (let off = 0; off < 200; off += 30) {
      const r = await kfl('GET', '/units', { query: `storefront=${sf}&limit=30&offset=${off}` });
      if (r.status !== 200) { console.log(sf, 'FOUT', r.status); break; }
      units.push(...(r.json.data || []));
      if (units.length >= (r.json.pagination?.total || 0)) break;
      await sleep(900);
    }
    all[sf] = units;
    console.log(`${sf}: ${units.length} units`);
    await sleep(900);
  }
  fs.writeFileSync(__dirname + '/units.json', JSON.stringify(all, null, 2));
  const offers = [...new Set(Object.values(all).flat().map(u => u.id_offer))];
  console.log('\nunieke id_offer:', offers.length);
  console.log('voorbeelden:', offers.slice(0, 6).join(', '));
})();
