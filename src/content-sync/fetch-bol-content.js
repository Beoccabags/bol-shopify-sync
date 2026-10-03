// Haalt per EAN de huidige bol-content op in NL en FR (backup + uitgangspunt).
const fs = require('fs');
const { auth } = require('../image-sync/bol');
const sp = JSON.parse(fs.readFileSync(__dirname + '/../image-sync/shopify-products.json', 'utf8'));
const EAN_OVERRIDE = { '8721398221502': '7440853174146' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = __dirname + '/bol-content-current.json';
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
(async () => {
  const items = [];
  for (const p of sp) for (const v of p.variants.nodes) if (v.barcode) items.push({ product: p.title, variant: v.title, shopEan: v.barcode, ean: EAN_OVERRIDE[v.barcode] || v.barcode });
  for (const it of items) {
    out[it.ean] ||= { shopEan: it.shopEan, product: it.product, variant: it.variant };
    for (const lang of ['nl', 'fr']) {
      if (out[it.ean][lang]) continue;
      for (let a = 0; a < 8; a++) {
        const t = await auth();
        const r = await fetch(`https://api.bol.com/retailer/content/catalog-products/${it.ean}`, {
          headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.retailer.v10+json', 'Accept-Language': lang },
        });
        const txt = await r.text();
        if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
        if (!r.ok) { out[it.ean][lang] = { error: r.status + ' ' + txt.slice(0, 300) }; console.log('ERR', it.ean, lang, r.status); break; }
        out[it.ean][lang] = JSON.parse(txt);
        break;
      }
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
      await sleep(1200);
    }
    console.log('OK', it.ean, it.product, '—', it.variant);
  }
  console.log('klaar:', Object.keys(out).length, 'EANs');
})().catch(e => { console.error(e); process.exit(1); });
