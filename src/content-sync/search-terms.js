// Zoekwoordenonderzoek via bol's eigen insights: zoekvolume per term + gerelateerde termen.
// Start met seeds (NL + FR), breidt één niveau uit via gerelateerde termen. Hervatbaar.
const fs = require('fs');
const { auth } = require('../image-sync/bol');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = __dirname + '/search-terms.json';
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const SEEDS_NL = [
  'leren rugzak','leren rugzak dames','leren rugzak heren','rugzak leer','laptop rugzak leer','leren laptoprugzak','rugzak dames','rugzak heren','laptoptas','leren laptoptas','laptoptas 15.6 inch','laptoptas 17 inch','laptoptas dames','laptoptas heren',
  'leren tas','leren tas dames','leren tas heren','leren schoudertas','schoudertas dames leer','schoudertas','crossbody tas','crossbody tas dames','crossbody tas leer','leren handtas','handtas dames','handtas leer','leren shopper','shopper tas',
  'weekendtas','weekendtas leer','weekendtas heren','weekendtas dames','reistas leer','duffel bag','leren tas heren schouder',
  'leren portemonnee','portemonnee heren leer','portemonnee dames leer','leren kaarthouder','kaarthouder leer','pasjeshouder leer','creditcardhouder',
  'toilettas leer','toilettas heren','leren toilettas','leren riem','leren riem heren','leren riem dames','riem heren leer',
  'plantaardig gelooid leer','volnerf leer','handgemaakte leren tas','vegetable tanned leather','suede tas','suede rugzak','cognac leren tas','zwarte leren rugzak','groene leren tas','beocca',
];
const SEEDS_FR = [
  'sac à dos cuir','sac à dos en cuir','sac à dos cuir femme','sac à dos cuir homme','sac à dos ordinateur cuir','sac ordinateur cuir','sacoche ordinateur cuir','sacoche cuir homme','sac à dos femme','sac à dos homme',
  'sac en cuir','sac cuir femme','sac cuir homme','sac bandoulière cuir','sac bandoulière femme','sac à main cuir','sac à main cuir femme','sac besace cuir','sac cabas cuir',
  'sac week-end cuir','sac weekend cuir','sac de voyage cuir','sac de voyage homme','sac 48h cuir',
  'portefeuille cuir','portefeuille cuir homme','portefeuille cuir femme','porte-cartes cuir','porte carte cuir','porte-monnaie cuir',
  'trousse de toilette cuir','trousse de toilette homme','ceinture cuir','ceinture cuir homme','ceinture cuir femme',
  'cuir tannage végétal','cuir pleine fleur','sac cuir fait main','sac en daim','sac à dos daim',
];
async function get(term) {
  for (let a = 0; a < 8; a++) {
    const t = await auth();
    const u = `https://api.bol.com/retailer/insights/search-terms?search-term=${encodeURIComponent(term)}&period=MONTH&number-of-periods=12&related-search-terms=true`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.retailer.v10+json' } });
    const txt = await r.text();
    if (r.status === 429) { await sleep(5000 * (a + 1)); continue; }
    if (!r.ok) return { error: r.status + ' ' + txt.slice(0, 200) };
    return JSON.parse(txt);
  }
  return { error: 'rate-limited' };
}
(async () => {
  const queue = [...SEEDS_NL.map(t => ({ t, lang: 'nl', depth: 0 })), ...SEEDS_FR.map(t => ({ t, lang: 'fr', depth: 0 }))];
  const seen = new Set(Object.keys(out).map(k => k.toLowerCase()));
  let n = 0;
  while (queue.length) {
    const { t, lang, depth } = queue.shift();
    const key = t.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const j = await get(t);
    const st = j.searchTerms;
    out[key] = { lang, depth, total: st ? st.total : null, countries: st ? st.countries : null,
      periods: st ? st.periods : null, related: st && st.relatedSearchTerms ? st.relatedSearchTerms : [], error: j.error };
    n++;
    console.log(`${String(st ? st.total : '-').padStart(7)}  ${t}  (${lang}, d${depth})  rel:${out[key].related.length}`);
    if (depth < 1 && st && st.relatedSearchTerms) {
      for (const r of st.relatedSearchTerms.slice(0, 15)) if (r.total >= 100) queue.push({ t: r.searchTerm, lang, depth: depth + 1 });
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    await sleep(2500);
  }
  console.log('klaar, termen:', Object.keys(out).length);
})().catch(e => { console.error(e); process.exit(1); });
