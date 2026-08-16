const env = require('./env');
// .env bevat de shopnaam soms zonder suffix ('6eck3a-jt')
const SHOP = /\./.test(env.SHOPIFY_SHOP || '') ? env.SHOPIFY_SHOP : `${env.SHOPIFY_SHOP}.myshopify.com`;
const CLIENT_ID = env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = env.SHOPIFY_CLIENT_SECRET;
let tok = null;
async function token() {
  if (tok) return tok;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
  });
  if (!r.ok) throw new Error('shopify auth ' + r.status + ' ' + await r.text());
  tok = (await r.json()).access_token;
  return tok;
}
async function gql(query, variables) {
  const t = await token();
  const r = await fetch(`https://${SHOP}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': t },
    body: JSON.stringify({ query, variables })
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}
module.exports = { gql };
