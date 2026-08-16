const fs = require('fs');
const products = JSON.parse(fs.readFileSync(__dirname + '/shopify-products.json', 'utf8'));

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-');

// generieke shots die bij meerdere producten hergebruikt worden
const GENERIC = /(etui|canvas|dustbag|opbergzak|beschermtas)/i;

function buildProductMap(p) {
  const media = p.media.nodes.filter(m => m && m.image);
  const variants = p.variants.nodes;
  const keyOf = m => norm(m.image.url.split('/').pop().split('?')[0]) + ' ' + norm(m.image.altText);

  // 1. expliciete match op variant-naam in bestandsnaam/alt (langste variantnaam wint)
  const colourOf = v => norm(v.title.split('/')[0].trim());
  const vKeys = variants.map(v => ({ v, k: colourOf(v) }))
    .sort((a, b) => b.k.length - a.k.length);
  const explicit = new Map();
  for (const m of media) {
    const key = keyOf(m);
    const hit = vKeys.find(({ k }) => k && key.includes(k));
    if (hit) explicit.set(m.id, hit.v.id);
  }

  // 2. blok-heuristiek: featured image van een variant start zijn blok
  const featIdx = new Map();
  for (const v of variants) {
    if (!v.image) continue;
    const i = media.findIndex(m => m.image.url.split('?')[0] === v.image.url.split('?')[0]);
    if (i >= 0) featIdx.set(i, v.id);
  }
  const starts = [...featIdx.keys()].sort((a, b) => a - b);
  const blockOf = i => {
    let cur = null;
    for (const s of starts) { if (s <= i) cur = featIdx.get(s); else break; }
    return cur;
  };

  // verzamel per kleur, zodat maatvarianten dezelfde foto's delen
  const byColour = new Map();
  media.forEach((m, i) => {
    const vid = explicit.get(m.id) || blockOf(i);
    if (!vid) return;
    const col = colourOf(variants.find(v => v.id === vid));
    if (!byColour.has(col)) byColour.set(col, []);
    byColour.get(col).push({ m, i, generic: GENERIC.test(m.image.url), explicit: explicit.has(m.id) });
  });
  const assign = new Map(variants.map(v => [v.id, (byColour.get(colourOf(v)) || []).slice()]));

  // featured image altijd vooraan, generieke shots achteraan
  for (const v of variants) {
    const list = assign.get(v.id);
    const featUrl = v.image ? v.image.url.split('?')[0] : (list[0] && list[0].m.image.url.split('?')[0]);
    list.sort((a, b) => {
      const af = a.m.image.url.split('?')[0] === featUrl ? 0 : 1;
      const bf = b.m.image.url.split('?')[0] === featUrl ? 0 : 1;
      if (af !== bf) return af - bf;
      if (a.generic !== b.generic) return a.generic ? 1 : -1;
      return a.i - b.i;
    });
  }
  return assign;
}

const out = {};
for (const p of products) {
  const assign = buildProductMap(p);
  for (const v of p.variants.nodes) {
    out[v.barcode] = {
      product: p.title, variant: v.title, sku: v.sku, handle: p.handle,
      images: assign.get(v.id).map(x => ({ url: x.m.image.url, alt: x.m.image.altText, generic: x.generic, explicit: x.explicit })),
    };
  }
}
fs.writeFileSync(__dirname + '/variant-images.json', JSON.stringify(out, null, 2));

for (const [ean, d] of Object.entries(out)) {
  console.log(`\n${ean}  ${d.product} — ${d.variant}  (${d.images.length} afb.)`);
  d.images.forEach((im, i) => console.log(`   ${i}${im.explicit ? '*' : ' '}${im.generic ? 'g' : ' '} ${im.url.split('/').pop().split('?')[0]}`));
}
