const fs = require('fs');
const { sp, MP, SELLER, sleep } = require('./sp');
const plan = JSON.parse(fs.readFileSync(__dirname + '/amz-plan.json', 'utf8'));
const L = JSON.parse(fs.readFileSync(__dirname + '/listings.json', 'utf8'));

function patches(sku, cc) {
  const p = plan[sku], mpid = MP[cc];
  const cur = L[cc]?.[sku]?.attributes || {};
  const out = [{ op: 'replace', path: '/attributes/main_product_image_locator', value: [{ media_location: p.main, marketplace_id: mpid }] }];
  for (let i = 1; i <= 8; i++) {
    const key = `other_product_image_locator_${i}`, url = p.others[i - 1];
    if (url) out.push({ op: 'replace', path: `/attributes/${key}`, value: [{ media_location: url, marketplace_id: mpid }] });
    else if (cur[key]) out.push({ op: 'delete', path: `/attributes/${key}`, value: [{ marketplace_id: mpid }] });
  }
  return out;
}
const send = (sku, cc, preview) => sp('PATCH', `/listings/2021-08-01/items/${SELLER}/${encodeURIComponent(sku)}`, {
  query: { marketplaceIds: MP[cc], issueLocale: 'en_US', ...(preview ? { mode: 'VALIDATION_PREVIEW' } : {}) },
  body: { productType: plan[sku].productType, patches: patches(sku, cc) },
});

(async () => {
  const cc = process.argv[2];
  const file = `${__dirname}/applied-${cc}.json`;
  const res = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const skus = Object.keys(plan).filter(s => plan[s].markets.includes(cc) && !res[s]?.live);
  console.log(`${cc}: ${skus.length} te doen`);
  for (const sku of skus) {
    const pv = await send(sku, cc, true);
    const pvErr = (pv.json?.issues || []).filter(i => i.severity === 'ERROR');
    if (pv.json?.status !== 'VALID' || pvErr.length) {
      res[sku] = { preview: pv.json?.status || `HTTP${pv.status}`, live: null,
                   errors: pvErr.map(e => `${e.code}: ${e.message}`.slice(0, 200)) || [pv.text?.slice(0, 200)] };
      console.log(`  PREVIEW-FOUT ${sku} ${plan[sku].product} — ${plan[sku].variant}`);
      pvErr.slice(0, 2).forEach(e => console.log(`      ${e.code}: ${e.message.slice(0, 140)}`));
      fs.writeFileSync(file, JSON.stringify(res, null, 2)); await sleep(500); continue;
    }
    const lv = await send(sku, cc, false);
    const lvErr = (lv.json?.issues || []).filter(i => i.severity === 'ERROR');
    res[sku] = { preview: 'VALID', live: lv.json?.status || `HTTP${lv.status}`,
                 submissionId: lv.json?.submissionId, errors: lvErr.map(e => `${e.code}: ${e.message}`.slice(0, 200)) };
    if (lv.json?.status !== 'ACCEPTED') console.log(`  LIVE-FOUT ${sku} -> ${lv.json?.status || lv.status}`);
    fs.writeFileSync(file, JSON.stringify(res, null, 2));
    await sleep(500);
  }
  const ok = Object.values(res).filter(r => r.live === 'ACCEPTED').length;
  console.log(`${cc}: ACCEPTED ${ok}/${Object.keys(res).length}`);
})();
