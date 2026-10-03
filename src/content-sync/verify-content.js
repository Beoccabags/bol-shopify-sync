// Stap 1: process-status per inzending (SUCCESS = aangenomen, zegt niets inhoudelijks).
// Stap 2: upload-report per uploadId (= entityId): status per attribuut (PUBLISHED/DECLINED + subStatus).
// Gebruik: node verify-content.js [status|reports]
const fs = require('fs');
const { auth } = require('../image-sync/bol');
const results = JSON.parse(fs.readFileSync(__dirname + '/push-results.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let a = 0; a < 6; a++) {
    const t = await auth();
    const r = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.retailer.v10+json' } });
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
    return { status: r.status, text: await r.text() };
  }
  return { status: 429, text: 'rate limited' };
}
const mode = process.argv[2] || 'status';
(async () => {
  if (mode === 'status') {
    const out = {}; const by = {};
    for (const [ean, v] of Object.entries(results)) {
      for (const lang of ['nl', 'fr']) {
        if (!v[lang] || !v[lang].processStatusId) continue;
        const ps = await get(`https://api.bol.com/shared/process-status/${v[lang].processStatusId}`);
        let j = {}; try { j = JSON.parse(ps.text); } catch {}
        (out[ean] ||= { product: v.product, variant: v.variant })[lang] = { state: j.status, entityId: j.entityId, errorMessage: j.errorMessage };
        by[j.status] = (by[j.status] || 0) + 1;
        if (j.status !== 'SUCCESS') console.log(ean, lang, j.status, j.errorMessage || '');
        await sleep(600);
      }
    }
    fs.writeFileSync(__dirname + '/verify-status.json', JSON.stringify(out, null, 2));
    console.log('process-status:', by);
  } else {
    const st = JSON.parse(fs.readFileSync(__dirname + '/verify-status.json', 'utf8'));
    const out = {}; const attrStat = {}; const declined = []; const overall = {};
    for (const [ean, v] of Object.entries(st)) {
      for (const lang of ['nl', 'fr']) {
        if (!v[lang] || !v[lang].entityId) continue;
        const r = await get(`https://api.bol.com/retailer/content/upload-report/${v[lang].entityId}`);
        let j = {}; try { j = JSON.parse(r.text); } catch { j = { httpError: r.status, body: r.text.slice(0, 200) }; }
        (out[ean] ||= { product: v.product, variant: v.variant })[lang] = j;
        overall[j.status || ('HTTP ' + r.status)] = (overall[j.status || ('HTTP ' + r.status)] || 0) + 1;
        for (const a of j.attributes || []) {
          const k = `${a.id}: ${a.status}/${a.subStatus}`; attrStat[k] = (attrStat[k] || 0) + 1;
          if (a.status === 'DECLINED' && a.subStatus !== 'IDENTICAL_VALUE_AS_BEFORE') declined.push(`${ean} ${lang} ${v.product} — ${v.variant}: ${a.id} ${a.subStatus} ${a.subStatusDescription || ''}`);
        }
        await sleep(700);
      }
    }
    fs.writeFileSync(__dirname + '/upload-reports.json', JSON.stringify(out, null, 2));
    console.log('rapportstatus:', overall);
    console.log('per attribuut:'); Object.entries(attrStat).sort().forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));
    if (declined.length) { console.log('\nAFGEKEURD:'); declined.forEach(d => console.log(' ', d)); } else console.log('\ngeen afgekeurde attributen');
  }
})().catch(e => { console.error(e); process.exit(1); });
