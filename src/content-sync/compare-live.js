// Haalt na de run de live catalogcontent opnieuw op (bol-content-after.json) en vergelijkt
// Title, Colour en de gecorrigeerde attributen met content-plan.json. DE ECHTE CONTROLE.
const fs = require('fs');
const { auth } = require('../image-sync/bol');
const plan = JSON.parse(fs.readFileSync(__dirname + '/content-plan.json', 'utf8'));
const OUT = __dirname + '/bol-content-after.json';
const after = fs.existsSync(OUT) && !process.argv.includes('--fresh') ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const g = (c, id) => { const a = (c.attributes || []).find(x => x.id === id); return a ? a.values.map(v => v.value).join('; ') : null; };
(async () => {
  for (const ean of Object.keys(plan)) {
    after[ean] ||= {};
    for (const lang of ['nl', 'fr']) {
      if (after[ean][lang]) continue;
      for (let a = 0; a < 8; a++) {
        try {
          const t = await auth();
          const r = await fetch(`https://api.bol.com/retailer/content/catalog-products/${ean}`, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.retailer.v10+json', 'Accept-Language': lang }, signal: AbortSignal.timeout(30000) });
          if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
          after[ean][lang] = r.ok ? await r.json() : { error: r.status }; break;
        } catch (e) { await sleep(3000 * (a + 1)); }
      }
      fs.writeFileSync(OUT, JSON.stringify(after, null, 2));
      await sleep(1200);
    }
  }
  let okTitle = 0, okDesc = 0, okCol = 0, okFix = 0, nFix = 0; const bad = [];
  for (const [ean, p] of Object.entries(plan)) {
    for (const lang of ['nl', 'fr']) {
      const live = after[ean][lang] || {}; const want = id => p[lang].attributes.find(x => x.id === id).values.map(v => v.value).join('; ');
      if (g(live, 'Title') === want('Name')) okTitle++; else bad.push(`${ean} ${lang} TITEL live: ${g(live, 'Title')}`);
      if (g(live, 'Description') === want('Description')) okDesc++; else bad.push(`${ean} ${lang} BESCHRIJVING wijkt af`);
      if ((g(live, 'Colour') || '').toLowerCase() === want('Colour').toLowerCase()) okCol++; else bad.push(`${ean} ${lang} KLEUR live: ${g(live, 'Colour')}`);
    }
    for (const id of Object.keys(p.oldFix)) {
      nFix++; const want = p.nl.attributes.find(x => x.id === id).values.map(v => v.value).join('; ');
      const live = g(after[ean].nl || {}, id);
      if (live !== null && live.replace(/\.0$/, '') === want.replace(/\.0$/, '')) okFix++; else bad.push(`${ean} nl ATTRIBUUT ${id} live: ${live} (gewild: ${want})`);
    }
  }
  const n = Object.keys(plan).length * 2;
  console.log(`titel ${okTitle}/${n}, beschrijving ${okDesc}/${n}, kleur ${okCol}/${n}, attribuutcorrecties ${okFix}/${nFix}`);
  if (bad.length) { console.log('\nAFWIJKINGEN:'); bad.forEach(b => console.log(' ', b)); }
})().catch(e => { console.error(e); process.exit(1); });
