const fs = require('fs');
const { kfl, sleep } = require('./kfl');
const vi = JSON.parse(fs.readFileSync(__dirname + '/variant-images.json', 'utf8'));
const offers = JSON.parse(fs.readFileSync(__dirname + '/offer-eans.json', 'utf8'));
const PAIRS = [['de', 'de-DE'], ['at', 'de-AT'], ['cz', 'cs-CZ'], ['sk', 'sk-SK'], ['pl', 'pl-PL'],
               ['nl', 'nl-NL'], ['fr', 'fr-FR'], ['es', 'es-ES'], ['it', 'it-IT']];
const RES = __dirname + '/kfl-results.json';
const res = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : {};
const eans = [...new Set(Object.values(offers).map(o => o.ean))].filter(e => vi[e]);

(async () => {
  console.log(`${eans.length} producten x ${PAIRS.length} talen = ${eans.length * PAIRS.length} calls`);
  for (const [sf, locale] of PAIRS) {
    let ok = 0, fail = 0;
    for (const ean of eans) {
      const key = `${locale}|${ean}`;
      if (res[key]?.status === 200) { ok++; continue; }
      const pics = vi[ean].images.map(i => i.url.split('?')[0]);
      let r;
      for (let a = 0; a < 4; a++) {
        r = await kfl('PATCH', '/product-data/', { query: `storefront=${sf}&locale=${locale}`,
          body: { ean: [ean], attributes: { picture: pics } } });
        if (r.status !== 429 && r.status < 500) break;
        await sleep(3000 * (a + 1));
      }
      res[key] = { status: r.status, pics: pics.length, msg: r.status === 200 ? 'ok' : (r.text || '').slice(0, 160),
                   product: vi[ean].product, variant: vi[ean].variant };
      r.status === 200 ? ok++ : fail++;
      if (r.status !== 200) console.log(`  FOUT ${locale} ${ean} ${vi[ean].product} — ${vi[ean].variant}: ${res[key].msg}`);
      fs.writeFileSync(RES, JSON.stringify(res, null, 2));
      await sleep(1000);
    }
    console.log(`${locale}: ${ok} ok, ${fail} fout`);
  }
  const bad = Object.entries(res).filter(([, v]) => v.status !== 200);
  console.log(`\nTOTAAL ok: ${Object.values(res).filter(v => v.status === 200).length}/${eans.length * PAIRS.length}`);
  if (bad.length) console.log('fouten:', bad.length);
})();
