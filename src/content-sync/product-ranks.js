// Per EAN: op welke zoektermen het product nu impressies/rangen krijgt (SEARCH), NL en FR.
const fs = require('fs');
const { auth } = require('../image-sync/bol');
const sp = JSON.parse(fs.readFileSync(__dirname + '/../image-sync/shopify-products.json', 'utf8'));
const EAN_OVERRIDE = { '8721398221502': '7440853174146' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = __dirname + '/product-ranks.json';
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const DATE = process.argv[2] || '2026-09-30';
(async () => {
  const items = [];
  for (const p of sp) for (const v of p.variants.nodes) if (v.barcode) items.push({ product: p.title, variant: v.title, ean: EAN_OVERRIDE[v.barcode] || v.barcode });
  for (const it of items) {
    out[it.ean] ||= { product: it.product, variant: it.variant };
    for (const lang of ['nl', 'fr']) {
      if (out[it.ean][lang]) continue;
      const ranks = [];
      for (let page = 1; page <= 4; page++) {
        let j = null;
        for (let a = 0; a < 8; a++) {
          const t = await auth();
          const u = `https://api.bol.com/retailer/insights/product-ranks?ean=${it.ean}&date=${DATE}&type=SEARCH&page=${page}`;
          const r = await fetch(u, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.retailer.v10+json', 'Accept-Language': lang } });
          const txt = await r.text();
          if (r.status === 429) { await sleep(5000 * (a + 1)); continue; }
          if (!r.ok) { j = { error: r.status + ' ' + txt.slice(0, 200) }; break; }
          j = JSON.parse(txt); break;
        }
        if (!j || j.error) { out[it.ean][lang] = { error: j ? j.error : 'rate-limited', ranks }; break; }
        ranks.push(...j.ranks);
        await sleep(2500);
        if (!j.hasNextPage) break;
      }
      if (!out[it.ean][lang] || !out[it.ean][lang].error) out[it.ean][lang] = { ranks };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
      console.log(`${it.ean} ${lang} ${it.product} — ${it.variant}: ${ranks.length} termen`);
    }
  }
  console.log('klaar');
})().catch(e => { console.error(e); process.exit(1); });
