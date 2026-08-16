// Kaufland Seller API v2, HMAC-SHA256 gesigneerd. Sleutels uit .env in de projectroot:
//   KAUFLAND_CLIENT_KEY, KAUFLAND_SECRET   (dit is het BEOCCA-paar, niet dat van EXIT)
const crypto = require('crypto');
const env = require('../image-sync/env');
const KEY = env.KAUFLAND_CLIENT_KEY;
const SECRET = env.KAUFLAND_SECRET;
const BASE = 'https://sellerapi.kaufland.com/v2';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function kfl(method, path, { body, query } = {}) {
  const url = BASE + path + (query ? '?' + query : '');
  const b = body ? JSON.stringify(body) : '';
  const ts = String(Math.floor(Date.now() / 1000));
  // let op: exact deze vier regels, zonder afsluitende newline
  const sig = crypto.createHmac('sha256', SECRET).update([method, url, b, ts].join('\n')).digest('hex');
  const headers = { Accept: 'application/json', 'Shop-Client-Key': KEY, 'Shop-Timestamp': ts, 'Shop-Signature': sig };
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { method, headers, body: body ? b : undefined });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
module.exports = { kfl, sleep };
