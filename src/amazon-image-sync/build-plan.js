const fs = require('fs');
const L = JSON.parse(fs.readFileSync(__dirname + '/listings.json', 'utf8'));
const M = JSON.parse(fs.readFileSync(__dirname + '/sku-map.json', 'utf8'));
const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
const P = JSON.parse(fs.readFileSync(__dirname + '/shopify-products.json', 'utf8'));
const sizes = new Map(JSON.parse(fs.readFileSync(__dirname + '/img-sizes.json', 'utf8')).map(s => [s.u, s]));
const skuEan = new Map(M.skuEan);

const shopBySku = new Map(), eansInShop = new Set();
for (const p of P) for (const v of p.variants.nodes) {
  if (v.sku) shopBySku.set(v.sku.trim(), v.barcode);
  if (v.barcode) eansInShop.add(v.barcode.trim());
}

// handmatig geduid (Amazon-EAN wijkt af of ontbreekt); geverifieerd op kleur + productnaam
const OVERRIDE = {
  '3K-QTWD-92ST': '8721398221373', // Milo weekendtas Cognac
  '39-ARSH-M6G7': '8721398221366', // Milo weekendtas Groen
  '48-O6Z1-0PAK': '8721398221519', // Cleo Glad zwart
  '3R-FF34-BTGH': '8721398221427', // Finn Groen
  '22-4CJC-T2NW': '8721398221489', // Lorne Cognac
};
const SKIP = { '12-FY93-T3B0': 'inactief duplicaat van Niba Cognac (FR/BE)' };

function eanFor(sku) {
  if (OVERRIDE[sku]) return OVERRIDE[sku];
  if (shopBySku.has(sku) && shopBySku.get(sku)) return shopBySku.get(sku).trim();
  const e = skuEan.get(sku);
  return e && eansInShop.has(e) ? e : null;
}

const children = new Map(); // sku -> {markets:[], productType}
for (const [cc, items] of Object.entries(L)) for (const [sku, it] of Object.entries(items)) {
  if (it.attributes?.parentage_level?.[0]?.value === 'parent') continue;
  if (!children.has(sku)) children.set(sku, { markets: [], productType: it.summaries?.[0]?.productType });
  children.get(sku).markets.push(cc);
}

const plan = {}, unresolved = [], skipped = [];
for (const [sku, meta] of children) {
  if (SKIP[sku]) { skipped.push([sku, SKIP[sku]]); continue; }
  const ean = eanFor(sku);
  if (!ean || !vi[ean]) { unresolved.push(sku); continue; }
  const imgs = vi[ean].images.map(i => i.url.split('?')[0]);
  // kleine bestanden achteraan, zodat ze als eerste afvallen bij de limiet van 9
  imgs.sort((a, b) => {
    const sa = sizes.get(a), sb = sizes.get(b);
    const la = sa && Math.max(sa.w, sa.h) < 1000 ? 1 : 0;
    const lb = sb && Math.max(sb.w, sb.h) < 1000 ? 1 : 0;
    return la - lb;
  });
  plan[sku] = { ean, productType: meta.productType, markets: meta.markets,
                product: vi[ean].product, variant: vi[ean].variant,
                main: imgs[0], others: imgs.slice(1, 9), dropped: Math.max(0, imgs.length - 9) };
}
fs.writeFileSync(__dirname + '/amz-plan.json', JSON.stringify(plan, null, 2));

console.log('te bijwerken SKU\'s:', Object.keys(plan).length);
console.log('overgeslagen:', skipped.map(([s, r]) => `${s} (${r})`).join(', ') || 'geen');
console.log('niet te koppelen:', unresolved.join(', ') || 'geen');
const dropped = Object.entries(plan).filter(([, p]) => p.dropped);
console.log('varianten met >9 foto\'s (rest valt af):', dropped.length);
// duplicaten: meerdere SKU's op dezelfde Shopify-variant
const byEan = {};
for (const [s, p] of Object.entries(plan)) (byEan[p.ean] ||= []).push(s);
const dups = Object.entries(byEan).filter(([, v]) => v.length > 1);
console.log('Shopify-varianten met meerdere Amazon-SKU\'s:', dups.length);
dups.forEach(([e, v]) => console.log('  ', e, vi[e].product, '—', vi[e].variant, ':', v.join(' + ')));
console.log('gedekte Shopify-varianten:', new Set(Object.values(plan).map(p => p.ean)).size, 'van 52');
