require('dotenv').config();

const BolApi = require('./src/bol-api');
const ShopifyApi = require('./src/shopify-api');
const { syncOrders } = require('./src/sync');

/**
 * Valideer dat alle vereiste environment variables zijn ingesteld
 */
function validateEnvironment() {
  const required = [
    'BOL_CLIENT_ID',
    'BOL_CLIENT_SECRET',
    'SHOPIFY_SHOP',
    'SHOPIFY_ACCESS_TOKEN'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('Ontbrekende environment variables:');
    missing.forEach(key => console.error(`  - ${key}`));
    console.error('\nKopieer .env.example naar .env en vul de waarden in.');
    process.exit(1);
  }
}

/**
 * Main functie
 */
async function main() {
  console.log('Bol.com → Shopify Sync');
  console.log('Versie 1.0.0\n');

  // Valideer environment
  validateEnvironment();

  // Initialiseer API clients
  const bolApi = new BolApi(
    process.env.BOL_CLIENT_ID,
    process.env.BOL_CLIENT_SECRET
  );

  const shopifyApi = new ShopifyApi(
    process.env.SHOPIFY_SHOP,
    process.env.SHOPIFY_ACCESS_TOKEN
  );

  try {
    // Start synchronisatie
    const result = await syncOrders(bolApi, shopifyApi);

    // Exit code gebaseerd op resultaat
    if (result.errors > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('\nFatale fout:', error.message);
    process.exit(1);
  }
}

// Start de applicatie
main();
