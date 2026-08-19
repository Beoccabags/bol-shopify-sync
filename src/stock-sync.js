/**
 * Voorraadsynchronisatie Shopify -> Bol.com
 *
 * Haalt alle offers op via de Bol.com offer export, matcht ze op EAN met de
 * barcodes in Shopify en werkt de voorraad bij waar die afwijkt.
 */

const BOL_MAX_STOCK = 999;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Lees de instellingen uit de environment
 */
function readConfig(env = process.env) {
  return {
    // Veiligheidsmarge: dit aantal wordt van de Shopify voorraad afgetrokken
    buffer: parseInt(env.BOL_STOCK_BUFFER || '0', 10),
    // Maximum dat naar Bol.com gestuurd wordt (Bol staat maximaal 999 toe)
    max: Math.min(parseInt(env.BOL_STOCK_MAX || String(BOL_MAX_STOCK), 10), BOL_MAX_STOCK),
    // Alleen loggen, niets versturen
    dryRun: env.BOL_STOCK_DRY_RUN === 'true',
    // Wie beheert de voorraad: true = Shopify is leidend
    managedByRetailer: env.BOL_STOCK_MANAGED_BY_RETAILER !== 'false',
    // Offers waarvan de EAN niet in Shopify staat op 0 zetten
    missingToZero: env.BOL_STOCK_MISSING_TO_ZERO === 'true',
    // Pauze tussen voorraad-updates (rate limit)
    delayMs: parseInt(env.BOL_STOCK_DELAY_MS || '250', 10),
    // Optionele Shopify locatie (gid://shopify/Location/123)
    locationId: env.SHOPIFY_LOCATION_ID || null
  };
}

/**
 * Bepaal de voorraad die naar Bol.com gestuurd moet worden
 */
function calculateStock(available, config) {
  const withBuffer = available - config.buffer;
  return Math.max(0, Math.min(config.max, Math.floor(withBuffer)));
}

/**
 * Synchroniseer de voorraad van Shopify naar Bol.com
 */
async function syncStock(bolApi, shopifyApi, env = process.env) {
  const config = readConfig(env);

  console.log('='.repeat(50));
  console.log('[Voorraad] Start voorraadsync', new Date().toISOString());
  console.log(`[Voorraad] Buffer: ${config.buffer}, max: ${config.max}, dry-run: ${config.dryRun}`);
  if (config.locationId) {
    console.log(`[Voorraad] Locatie: ${config.locationId}`);
  }
  console.log('='.repeat(50));

  // 1. Alle offers van Bol.com ophalen
  const offers = await bolApi.getOfferExport();

  // Alleen offers die wij zelf verzenden; FBB-voorraad ligt bij Bol.com
  const fbrOffers = offers.filter(offer => (offer.fulfilmentType || '').toUpperCase() !== 'FBB');
  console.log(`[Voorraad] ${fbrOffers.length} FBR offer(s) van de ${offers.length} in totaal`);

  // 2. Shopify voorraad ophalen
  const shopifyStock = await shopifyApi.getVariantsForStock({ locationId: config.locationId });

  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  let errors = 0;

  // 3. Per offer vergelijken en bijwerken
  for (const offer of fbrOffers) {
    const ean = (offer.ean || '').trim();
    const offerId = (offer.offerId || '').trim();

    if (!ean || !offerId) {
      console.warn('[Voorraad] Offer zonder EAN of offerId, overslaan:', JSON.stringify(offer));
      continue;
    }

    const variant = shopifyStock.get(ean);

    if (!variant) {
      notFound++;
      if (!config.missingToZero) {
        console.log(`[Voorraad] EAN ${ean} niet in Shopify gevonden, overslaan`);
        continue;
      }
      console.log(`[Voorraad] EAN ${ean} niet in Shopify gevonden, voorraad naar 0`);
    }

    const available = variant ? variant.available : 0;
    const desired = calculateStock(available, config);
    const current = parseInt(offer.stockAmount, 10);

    if (Number.isFinite(current) && current === desired) {
      unchanged++;
      continue;
    }

    const label = variant ? variant.title : 'onbekend product';
    console.log(`[Voorraad] ${ean} (${label}): ${Number.isFinite(current) ? current : '?'} -> ${desired}`);

    if (config.dryRun) {
      updated++;
      continue;
    }

    try {
      await bolApi.updateOfferStock(offerId, desired, config.managedByRetailer);
      updated++;
    } catch (error) {
      console.error(`[Voorraad] Bijwerken van EAN ${ean} mislukt:`, error.message);
      errors++;
    }

    await sleep(config.delayMs);
  }

  console.log('\n' + '='.repeat(50));
  console.log('[Voorraad] Voorraadsync voltooid');
  console.log(`[Voorraad] Bijgewerkt: ${updated}, ongewijzigd: ${unchanged}, niet in Shopify: ${notFound}, fouten: ${errors}`);
  console.log('='.repeat(50));

  return { updated, unchanged, notFound, errors };
}

module.exports = { syncStock, calculateStock, readConfig };
