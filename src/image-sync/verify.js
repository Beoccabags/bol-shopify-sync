const fs = require('fs');
const { auth } = require('./bol');
const results = JSON.parse(fs.readFileSync(__dirname + '/push-results.json', 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, accept) {
  for (let a = 0; a < 6; a++) {
    const t = await auth();
    const r = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Accept: accept || 'application/vnd.retailer.v10+json' } });
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; }
    return { status: r.status, text: await r.text() };
  }
  return { status: 429, text: 'rate limited' };
}
(async () => {
  const out = {};
  for (const [ean, r] of Object.entries(results)) {
    if (!r.processStatusId) { out[ean] = { ...r, state: 'NIET INGEZONDEN' }; continue; }
    const ps = await get(`https://api.bol.com/shared/process-status/${r.processStatusId}`);
    let j = {}; try { j = JSON.parse(ps.text); } catch {}
    out[ean] = { product: r.product, variant: r.variant, assets: r.assets,
                 state: j.status, entityId: j.entityId, errorMessage: j.errorMessage };
    await sleep(700);
  }
  fs.writeFileSync(__dirname + '/verify-status.json', JSON.stringify(out, null, 2));
  const by = {};
  for (const v of Object.values(out)) (by[v.state] ||= []).push(v);
  for (const [s, list] of Object.entries(by)) console.log(`${s}: ${list.length}`);
  const bad = Object.entries(out).filter(([, v]) => v.state !== 'SUCCESS');
  if (bad.length) { console.log('\nNiet-SUCCESS:'); bad.forEach(([e, v]) => console.log(' ', e, v.product, '—', v.variant, ':', v.state, v.errorMessage || '')); }
  console.log('\nvoorbeeld entityId:', Object.values(out)[0].entityId);
})();
