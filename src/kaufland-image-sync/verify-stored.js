const fs = require('fs');
const { kfl, sleep } = require('./kfl');
const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
const offers = JSON.parse(fs.readFileSync(__dirname + '/offer-eans.json', 'utf8'));
const PAIRS = [['de', 'de-DE'], ['at', 'de-AT'], ['cz', 'cs-CZ'], ['sk', 'sk-SK'], ['pl', 'pl-PL'],
               ['nl', 'nl-NL'], ['fr', 'fr-FR'], ['es', 'es-ES'], ['it', 'it-IT']];
const RES = __dirname + '/kfl-stored.json';
const res = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : {};
const eans = [...new Set(Object.values(offers).map(o => o.ean))].filter(e => vi[e]);
(async () => {
  for (const [sf, locale] of PAIRS) {
    let ok = 0, bad = [];
    for (const ean of eans) {
      const key = `${locale}|${ean}`;
      if (res[key]?.match) { ok++; continue; }
      const r = await kfl('GET', `/product-data/${ean}`, { query: `storefront=${sf}&locale=${locale}` });
      const stored = (r.json?.data?.attributes?.picture || []).map(u => u.split('/').pop());
      const want = vi[ean].images.map(i => i.url.split('?')[0].split('/').pop());
      const match = JSON.stringify(stored) === JSON.stringify(want);
      res[key] = { match, stored: stored.length, want: want.length, product: vi[ean].product, variant: vi[ean].variant };
      match ? ok++ : bad.push(`${vi[ean].product} — ${vi[ean].variant} (${stored.length}/${want.length})`);
      fs.writeFileSync(RES, JSON.stringify(res, null, 2));
      await sleep(750);
    }
    console.log(`${locale}: ${ok}/${eans.length} opgeslagen zoals bedoeld${bad.length ? ' | afwijkend: ' + bad.slice(0, 3).join('; ') : ''}`);
  }
  const all = Object.values(res);
  console.log(`\nTOTAAL correct opgeslagen: ${all.filter(v => v.match).length}/${all.length}`);
})();
