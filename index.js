require('dotenv').config();

const BolApi = require('./src/bol-api');
const ShopifyApi = require('./src/shopify-api');
const { syncOrders } = require('./src/sync');
const { syncStock } = require('./src/stock-sync');
const { syncTracking } = require('./src/tracking-sync');

const TASKS = ['orders', 'stock', 'tracking', 'all'];

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
 * Bepaal welke taak gedraaid moet worden
 */
function resolveTask() {
  const argument = (process.argv[2] || process.env.SYNC_TASK || 'orders').toLowerCase();

  if (!TASKS.includes(argument)) {
    console.error(`Onbekende taak "${argument}". Kies uit: ${TASKS.join(', ')}`);
    process.exit(1);
  }

  return argument;
}

/**
 * Draait de voorraadsync in de "all" modus maar één keer per dag: alleen in
 * het ingestelde uur. Zo kan alles met één cron-schema (elk kwartier) draaien.
 */
function isStockWindow() {
  const hour = parseInt(process.env.STOCK_SYNC_HOUR || '6', 10);
  const now = new Date();
  return now.getHours() === hour && now.getMinutes() < 15;
}

/**
 * Main functie
 */
async function main() {
  const task = resolveTask();

  console.log('Bol.com <-> Shopify Sync');
  console.log(`Versie 1.1.0 — taak: ${task}\n`);

  validateEnvironment();

  const bolApi = new BolApi(
    process.env.BOL_CLIENT_ID,
    process.env.BOL_CLIENT_SECRET
  );

  const shopifyApi = new ShopifyApi(
    process.env.SHOPIFY_SHOP,
    process.env.SHOPIFY_CLIENT_ID,
    process.env.SHOPIFY_CLIENT_SECRET
  );

  let errors = 0;

  try {
    // Bol.com orders -> Shopify
    if (task === 'orders' || task === 'all') {
      const result = await syncOrders(bolApi, shopifyApi);
      errors += result.errors;
    }

    // Shopify tracking -> Bol.com
    if (task === 'tracking' || task === 'all') {
      const result = await syncTracking(bolApi, shopifyApi);
      errors += result.errors;
    }

    // Shopify voorraad -> Bol.com (in "all" alleen in het ingestelde uur)
    if (task === 'stock' || (task === 'all' && isStockWindow())) {
      const result = await syncStock(bolApi, shopifyApi);
      errors += result.errors;
    }

    process.exit(errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('\nFatale fout:', error.message);
    process.exit(1);
  }
}

// Start de applicatie
main();
