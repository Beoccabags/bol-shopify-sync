// Leest .env uit de projectroot. Zet daar:
//   BOL_CLIENT_ID, BOL_CLIENT_SECRET, AMZ_CLIENT_ID, AMZ_CLIENT_SECRET, AMZ_REFRESH_TOKEN,
//   SHOPIFY_SHOP (bv. xxxx.myshopify.com), SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', '..', '.env');
const env = {};
if (fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}
for (const k of Object.keys(process.env)) if (/^(BOL|SHOPIFY|AMZ)_/.test(k)) env[k] = process.env[k];
module.exports = env;
