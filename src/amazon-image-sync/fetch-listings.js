const fs = require('fs');
const { sp, MP, SELLER, sleep } = require('./sp');
(async () => {
  const all = {};
  for (const [cc, mpid] of Object.entries(MP)) {
    const bySku = new Map();
    let token = null, pages = 0;
    do {
      const q = { marketplaceIds: mpid, includedData: 'attributes,summaries,issues', pageSize: '20' };
      if (token) q.pageToken = token;
      const r = await sp('GET', `/listings/2021-08-01/items/${SELLER}`, { query: q });
      if (r.status !== 200) { console.log(cc, 'FOUT', r.status, r.text.slice(0, 200)); break; }
      for (const it of r.json.items || []) bySku.set(it.sku, it);
      token = r.json.pagination && r.json.pagination.nextToken;
      pages++;
      await sleep(700);
    } while (token && pages < 60);
    all[cc] = Object.fromEntries(bySku);
    const withEan = Object.values(all[cc]).filter(i => i.attributes?.externally_assigned_product_identifier).length;
    console.log(`${cc}: ${bySku.size} SKU's (${pages} pagina's), ${withEan} met EAN-attribuut`);
  }
  fs.writeFileSync(__dirname + '/listings.json', JSON.stringify(all, null, 2));
})();
