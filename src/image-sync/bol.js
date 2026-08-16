const env = require('./env');
let token = null, exp = 0;
async function auth() {
  if (token && Date.now() < exp) return token;
  const cred = Buffer.from(`${env.BOL_CLIENT_ID}:${env.BOL_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://login.bol.com/token?grant_type=client_credentials', {
    method: 'POST', headers: { Authorization: `Basic ${cred}` }
  });
  if (!r.ok) throw new Error('bol auth ' + r.status + ' ' + await r.text());
  const j = await r.json();
  token = j.access_token; exp = Date.now() + (j.expires_in - 30) * 1000;
  return token;
}
async function bol(method, endpoint, { accept, contentType, body } = {}) {
  const t = await auth();
  const headers = { Authorization: `Bearer ${t}`, Accept: accept || 'application/vnd.retailer.v10+json' };
  if (body) headers['Content-Type'] = contentType || 'application/vnd.retailer.v10+json';
  const r = await fetch('https://api.bol.com/retailer' + endpoint, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${endpoint} -> ${r.status}\n${text}`);
  return { status: r.status, text };
}
module.exports = { bol, auth };
