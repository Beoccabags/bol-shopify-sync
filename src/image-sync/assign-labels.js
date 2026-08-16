const fs = require('fs');
const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
const chunks = JSON.parse(fs.readFileSync(__dirname + '/ean-chunks.json', 'utf8'));
const dm = JSON.parse(fs.readFileSync(__dirname + '/datamodel_nl.json', 'utf8'));

const labelsForChunk = {};
for (const c of new Set(Object.values(chunks).map(x => x.chunkId)))
  labelsForChunk[c] = new Set(dm.chunks.find(x => x.id === c).labels.map(l => l.id));

// volgorde telt: eerste match wint
const RULES = [
  [/sfeer|in-?situ|hotel|bureau|vensterbank|eikentafel|gedragen|on-?model/, 'IN SITU'],
  [/detail|messing|gesp|haak|roltop|ring|sluiting|klep/, 'DETAIL'],
  [/vooraanzicht|voorkant|front/, 'FRONT'],
  [/achterkant|achterzijde|back/, 'BACK'],
  [/binnenkant|binnenzijde|inside/, 'INSIDE'],
  [/zijkant|zijaanzicht|schuin|side/, 'SIDE'],
  [/etui|canvas|dustbag|opbergzak|beschermtas/, 'OTHER'],
];
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

const plan = {};
for (const [shopEan, d] of Object.entries(vi)) {
  const entry = Object.entries(chunks).find(([, v]) => v.shopEan === shopEan);
  const bolEan = entry[0], chunkId = entry[1].chunkId;
  const valid = labelsForChunk[chunkId];

  const seen = new Set();
  const assets = [];
  d.images.forEach((im, idx) => {
    const clean = im.url.split('?')[0];
    if (seen.has(clean)) return;
    seen.add(clean);
    const key = norm(clean.split('/').pop()) + ' ' + norm(im.alt);
    let label = idx === 0 ? 'FRONT' : (RULES.find(([re]) => re.test(key)) || [, 'OTHER'])[1];
    if (idx !== 0 && label === 'FRONT') label = 'SIDE';   // maar één FRONT per variant
    if (!valid.has(label)) label = valid.has('OTHER') ? 'OTHER' : [...valid][0];
    assets.push({ url: im.url, labels: [label], file: clean.split('/').pop() });
  });
  plan[bolEan] = { shopEan, chunkId, product: d.product, variant: d.variant, sku: d.sku, handle: d.handle, assets };
}
fs.writeFileSync(__dirname + '/upload-plan.json', JSON.stringify(plan, null, 2));

let tot = 0;
const counts = {};
for (const [ean, p] of Object.entries(plan)) {
  tot += p.assets.length;
  console.log(`\n${ean}  ${p.product} — ${p.variant}`);
  p.assets.forEach(a => { counts[a.labels[0]] = (counts[a.labels[0]] || 0) + 1;
    console.log(`   ${a.labels[0].padEnd(8)} ${a.file}`); });
}
console.log(`\n\nTOTAAL ${Object.keys(plan).length} varianten, ${tot} afbeeldingen`);
console.log('labelverdeling:', counts);
