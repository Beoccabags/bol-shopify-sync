// SP-API-client voor Beocca. Sleutels uit .env in de projectroot:
//   AMZ_CLIENT_ID, AMZ_CLIENT_SECRET, AMZ_REFRESH_TOKEN, AMZ_SELLER_ID
const env = require('../image-sync/env');
const HOST = 'https://sellingpartnerapi-eu.amazon.com';
const SELLER = env.AMZ_SELLER_ID || 'AUO5URPED53YR';
// Geverifieerd tegen getMarketplaceParticipations; wijkt af van de tabel in CLAUDE.md
const MP = { DE: 'A1PA6795UKMFR9', FR: 'A13V1IB3VIYZZH', NL: 'A1805IZSGTT6HS', BE: 'AMEN7PMS3EDWL' };
let tok = null, exp = 0;
async function token() {
  if (tok && Date.now() < exp) return tok;
  const r = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.AMZ_REFRESH_TOKEN,
      client_id: env.AMZ_CLIENT_ID, client_secret: env.AMZ_CLIENT_SECRET })
  });
  if (!r.ok) throw new Error('LWA ' + r.status + ' ' + await r.text());
  const j = await r.json();
  tok = j.access_token; exp = Date.now() + (j.expires_in - 60) * 1000;
  return tok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sp(method, path, { body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(query) : '';
  for (let a = 0; a < 6; a++) {
    const t = await token();
    const r = await fetch(HOST + path + qs, { method,
      headers: { 'x-amz-access-token': t, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    if (r.status === 429) { await sleep(2000 * (a + 1)); continue; }
    let j = null; try { j = JSON.parse(txt); } catch {}
    return { status: r.status, json: j, text: txt };
  }
  return { status: 429, json: null, text: 'rate limited' };
}
module.exports = { sp, token, MP, SELLER, sleep };
