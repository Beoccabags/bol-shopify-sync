#!/usr/bin/env node
require('dotenv').config();

const BolApi = require('./src/bol-api');
const ShopifyApi = require('./src/shopify-api');
const StockSync = require('./src/stock-sync');

/**
 * Valideer dat alle vereiste environment variables zijn ingesteld
 */
function validateEnvironment() {
  const required = [
    'BOL_CLIENT_ID',
    'BOL_CLIENT_SECRET',
    'SHOPIFY_SHOP',
    'SHOPIFY_CLIENT_ID',
    'SHOPIFY_CLIENT_SECRET'
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
  console.log('Shopify → Bol.com Stock Sync');
  console.log('============================\n');

  // Valideer environment
  validateEnvironment();

  // Initialiseer API clients
  const bolApi = new BolApi(
    process.env.BOL_CLIENT_ID,
    process.env.BOL_CLIENT_SECRET
  );

  const shopifyApi = new ShopifyApi(
    process.env.SHOPIFY_SHOP,
    process.env.SHOPIFY_CLIENT_ID,
    process.env.SHOPIFY_CLIENT_SECRET
  );

  try {
    // Start synchronisatie
    const stockSync = new StockSync(bolApi, shopifyApi);
    const result = await stockSync.sync();

    console.log('\nSync voltooid!');

    // Exit code gebaseerd op resultaat
    if (result.errors > 0) {
      console.log(`Let op: ${result.errors} fouten opgetreden tijdens sync.`);
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('\nFatale fout:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Start de applicatie
main();
