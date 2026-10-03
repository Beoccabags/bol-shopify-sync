// Bouwt content-plan.json: per EAN een NL- en FR-upload (Name, Description, Colour + gerichte attribuutcorrecties).
// Valideert tegen bol's regels: alleen p/b/br/h3/li/ol/ul/strong, titel <= 250, beschrijving <= 3000,
// geen 'actie'/'aanbieding', geen uitroeptekens, geen em-dashes.
const fs = require('fs');
const copy = require('./copy');
const facts = JSON.parse(fs.readFileSync(__dirname + '/facts.json', 'utf8'));
const cur = JSON.parse(fs.readFileSync(__dirname + '/bol-content-current.json', 'utf8'));
const KG = 'unece.unit.KGM', CM = 'unece.unit.CMT';
const val = (...vs) => vs.map(v => (typeof v === 'object' ? v : { value: String(v) }));

// Gerichte correcties per EAN (NL-taalupload). Bron per regel in commentaar.
const FIX = {
  '7440853174146': { Gender: val('Unisex') },                                   // Cleo suède stond op Vrouwen, glad op Unisex; Shopify: dames & heren
  '8721398221076': { 'Product Weight': val({ value: '1.1', unitId: KG }), 'Water Resistance': val('Niet waterbestendig') }, // Bryce zwart: 1100 i.p.v. 1.1, en afwijkend van cognac
  '8721398221427': { 'Product Weight': val({ value: '0.7', unitId: KG }), Material: val('Leer', 'Canvas') }, // Finn groen: 700.0; leer + canvas (foto)
  '8721398221434': { Material: val('Leer', 'Canvas') },
  '8721398221021': { 'Compatible Laptop Size': val('15.6 inch') },             // Mavis: Shopify 15,6 inch
  '8721398221014': { 'Compatible Laptop Size': val('15.6 inch') },
  '8721398221496': { 'Compatible Laptop Size': val('15.6 inch') },
  '8721398221366': { 'Size Hand Luggage': val('Handbagage 40 t/m 56 cm') },  // Milo 55 cm, Shopify: handbagage
  '8721398221373': { 'Size Hand Luggage': val('Handbagage 40 t/m 56 cm') },
  '8721398221397': { 'Options for Bags': val('Verstelbare schouderriem') },   // Ivy: Shopify verstelbare schouderband
  '8721398221403': { 'Options for Bags': val('Verstelbare schouderriem') },
  '8721398221335': { 'Options for Bags': val('Afneembare schouderriem', 'Verstelbare schouderriem') }, // Maia: twee banden, lange verstelbaar
  '8721398221342': { 'Options for Bags': val('Afneembare schouderriem', 'Verstelbare schouderriem') },
  '8721398221359': { 'Options for Bags': val('Afneembare schouderriem', 'Verstelbare schouderriem') },
  '8721398221045': { 'Options for Bags': val('Afneembare schouderriem', 'Verstelbare schouderriem') }, // Lua: idem
  '8721398221069': { 'Options for Bags': val('Afneembare schouderriem', 'Verstelbare schouderriem') },
  '8721398221052': { 'Options for Bags': val('Afneembare schouderriem', 'Verstelbare schouderriem') },
  '8721398221304': { 'Options for Bags': val('Verstelbare schouderriem'), 'Locking Mechanism': val('Magneetsluiting') }, // Fei: Shopify magneet + YKK rits
  '8721398221311': { 'Options for Bags': val('Verstelbare schouderriem'), 'Locking Mechanism': val('Magneetsluiting') },
  '8721398221328': { 'Options for Bags': val('Verstelbare schouderriem'), 'Locking Mechanism': val('Magneetsluiting') },
  '8721398221267': { Material: val('Leer'), 'Locking Mechanism': val('Magneetsluiting') },  // Mira zwart: glad leer, Shopify magneet + YKK rits
  '8721398221243': { Material: val('Leer'), 'Locking Mechanism': val('Magneetsluiting') },  // Mira donkerbruin
  '8721398221250': { 'Locking Mechanism': val('Magneetsluiting') },                          // Mira suède
  '8721398221229': { 'Number of Compartments': val('7') },                     // Mason: Shopify 7 vakken
  '8721398221236': { 'Number of Compartments': val('7') },
  '8721398221205': { Hangable: val('Y') },                                     // Miles: Shopify ophanglus
  '8721398221212': { Hangable: val('Y') },
  '8721398221113': { 'Colour Hardware': val('Goudkleurig'), 'Product Width': val({ value: '3.5', unitId: CM }) }, // Oden: messing gesp, ca. 3,5 cm breed
  '8721398221137': { 'Colour Hardware': val('Goudkleurig'), 'Product Width': val({ value: '3.5', unitId: CM }) },
  '8721398221120': { 'Colour Hardware': val('Goudkleurig'), 'Product Width': val({ value: '3.5', unitId: CM }) },
  '8721398221083': { 'Colour Hardware': val('Goudkleurig'), 'Product Width': val({ value: '3.5', unitId: CM }) },
  '8721398221106': { 'Colour Hardware': val('Goudkleurig'), 'Product Width': val({ value: '3.5', unitId: CM }) },
  '8721398221090': { 'Colour Hardware': val('Goudkleurig'), 'Product Width': val({ value: '3.5', unitId: CM }) },
};

const ALLOWED = new Set(['p', 'b', 'br', 'h3', 'li', 'ol', 'ul', 'strong']);
function check(label, title, desc) {
  const errs = [];
  if (title.length > 250) errs.push(`titel ${title.length} > 250`);
  if (desc.length > 3000) errs.push(`beschrijving ${desc.length} > 3000`);
  for (const t of desc.matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)) if (!ALLOWED.has(t[1].toLowerCase())) errs.push('tag ' + t[1]);
  for (const s of [title, desc]) {
    if (/[!—]/.test(s)) errs.push('uitroepteken/em-dash');
    if (/\b(actie|aanbieding|promo|promotion)\b/i.test(s)) errs.push('verboden woord');
  }
  if (errs.length) console.log('FOUT', label, errs.join('; '));
  return errs;
}
function oldAttr(c, lang, k) { const a = (c[lang].attributes || []).find(x => x.id === k); return a ? a.values.map(v => v.value).join('; ') : null; }

const plan = {}; let n = 0, bad = 0;
for (const F of facts) {
  if (F.status !== 'ACTIVE') continue;
  const C = copy[F.handle];
  if (!C) { console.log('GEEN COPY voor', F.handle); continue; }
  for (const v of F.variants) {
    const ean = v.bolEan; if (!ean || !cur[ean]) continue;
    const colourKey = v.variant.includes(' / ') ? v.variant.split(' / ')[0] : v.variant;
    const size = v.variant.includes(' / ') ? v.variant.split(' / ')[1].replace('cm', ' cm') : null;
    const col = C.colours[colourKey]; if (!col) { console.log('GEEN KLEUR', F.handle, v.variant); continue; }
    const ctx = { ...col, size };
    const out = {};
    for (const lang of ['nl', 'fr']) {
      const title = C[lang].title(ctx), desc = C[lang].desc(ctx);
      if (check(`${ean} ${lang}`, title, desc).length) bad++;
      const attrs = [
        { id: 'EAN', values: val(ean) },
        { id: 'Name', values: val(title) },
        { id: 'Description', values: val(desc) },
        { id: 'Colour', values: val(col[lang]) },
      ];
      if (lang === 'nl' && FIX[ean]) for (const [id, values] of Object.entries(FIX[ean])) attrs.push({ id, values });
      out[lang] = { language: lang, attributes: attrs };
    }
    plan[ean] = {
      product: F.title, handle: F.handle, variant: v.variant, chunk: v.bolChunk,
      old: { nl: { title: oldAttr(cur[ean], 'nl', 'Title'), desc: oldAttr(cur[ean], 'nl', 'Description'), colour: oldAttr(cur[ean], 'nl', 'Colour') },
             fr: { title: oldAttr(cur[ean], 'fr', 'Title'), desc: oldAttr(cur[ean], 'fr', 'Description'), colour: oldAttr(cur[ean], 'fr', 'Colour') } },
      oldFix: FIX[ean] ? Object.fromEntries(Object.keys(FIX[ean]).map(k => [k, oldAttr(cur[ean], 'nl', k)])) : {},
      ...out,
    };
    n++;
  }
}
fs.writeFileSync(__dirname + '/content-plan.json', JSON.stringify(plan, null, 2));
console.log(`plan: ${n} EANs, ${bad} met fouten`);
for (const [e, p] of Object.entries(plan)) {
  const tn = p.nl.attributes[1].values[0].value, tf = p.fr.attributes[1].values[0].value;
  const dn = p.nl.attributes[2].values[0].value.length, df = p.fr.attributes[2].values[0].value.length;
  console.log(`${e} ${p.variant.padEnd(14)} NL ${tn.length}/${dn}  FR ${tf.length}/${df}  ${Object.keys(FIX[e] || {}).join(',')}`);
}
