/**
 * Verzendsynchronisatie Shopify -> Bol.com
 *
 * Zodra een Shopify order met de bol-tag wordt afgehandeld met een
 * trackingnummer, wordt de zending bij Bol.com aangemeld. Dat gebeurt op
 * productniveau: bij een bestelling met meerdere artikelen worden alleen de
 * artikelen uit die fulfillment gemeld, gematcht op EAN/barcode.
 */

const { resolveTransporterCode } = require('./transporters');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Lees de instellingen uit de environment
 */
function readConfig(env = process.env) {
  return {
    bolTag: env.SHOPIFY_BOL_TAG || 'bol',
    shippedTag: env.SHOPIFY_SHIPPED_TAG || 'bol-verzonden',
    lookbackDays: parseInt(env.TRACKING_LOOKBACK_DAYS || '14', 10),
    dryRun: env.TRACKING_DRY_RUN === 'true',
    // Ook melden als er geen trackingnummer is ingevuld
    allowWithoutTracking: env.TRACKING_ALLOW_EMPTY === 'true'
  };
}

/**
 * Haal het Bol.com bestelnummer uit de Shopify order
 * (metafield custom.marketplace_bestelnummer, anders de notitie)
 */
function getBolOrderId(order) {
  const fromMetafield = order.metafield?.value?.trim();
  if (fromMetafield) return fromMetafield;

  const fromNote = order.note?.trim();
  if (fromNote && /^[A-Za-z0-9-]+$/.test(fromNote)) return fromNote;

  return null;
}

/**
 * Bouw de lijst met nog openstaande Bol.com orderitems
 */
function buildOpenItems(bolOrder) {
  return (bolOrder.orderItems || [])
    .map(item => ({
      orderItemId: item.orderItemId,
      ean: (item.product?.ean || '').trim(),
      reference: (item.offer?.reference || '').trim(),
      title: item.product?.title || '',
      open: (item.quantity || 0) - (item.quantityShipped || 0) - (item.quantityCancelled || 0)
    }))
    .filter(item => item.open > 0);
}

/**
 * Koppel de regels van één Shopify fulfillment aan Bol.com orderitems.
 *
 * Matcht op EAN (product.ean) én op de interne offerreferentie, omdat de
 * ordersync producten ook op offer.reference matcht.
 *
 * Let op: verlaagt `open` op de gematchte items, zodat meerdere fulfillments
 * van dezelfde order elkaar niet overschrijven.
 *
 * @returns {{ shipItems: Array, unmatched: Array }}
 */
function matchFulfillmentItems(fulfillment, openItems) {
  const shipItems = [];
  const unmatched = [];

  const lines = fulfillment.fulfillmentLineItems?.nodes || [];

  for (const line of lines) {
    const barcode = (line.lineItem?.variant?.barcode || '').trim();
    const name = line.lineItem?.name || line.lineItem?.sku || 'onbekend';

    // Regels zonder variant/barcode (zoals het prijsverschil-artikel) overslaan
    if (!barcode) continue;

    let remaining = line.quantity || 0;

    for (const item of openItems) {
      if (remaining <= 0) break;
      if (item.open <= 0) continue;
      if (item.ean !== barcode && item.reference !== barcode) continue;

      const quantity = Math.min(remaining, item.open);
      shipItems.push({ orderItemId: item.orderItemId, quantity });
      item.open -= quantity;
      remaining -= quantity;
    }

    if (remaining > 0) {
      unmatched.push({ name, barcode, quantity: remaining });
    }
  }

  return { shipItems, unmatched };
}

/**
 * Meld één fulfillment aan bij Bol.com
 */
async function shipFulfillment(bolApi, order, fulfillment, openItems, config, env) {
  const tracking = (fulfillment.trackingInfo || []).find(t => t.number) || {};
  const trackAndTrace = (tracking.number || '').trim();

  if (!trackAndTrace && !config.allowWithoutTracking) {
    console.log(`[Tracking] ${order.name}: fulfillment zonder trackingnummer, overslaan`);
    return { shipped: 0, skipped: true };
  }

  const { shipItems, unmatched } = matchFulfillmentItems(fulfillment, openItems);

  for (const item of unmatched) {
    console.log(
      `[Tracking] ${order.name}: geen open Bol-item voor "${item.name}" (EAN ${item.barcode}, ${item.quantity}x) — waarschijnlijk al gemeld`
    );
  }

  if (shipItems.length === 0) {
    return { shipped: 0, skipped: true };
  }

  const transporterCode = resolveTransporterCode(tracking.company, trackAndTrace, env);
  const totalQuantity = shipItems.reduce((sum, item) => sum + item.quantity, 0);

  console.log(
    `[Tracking] ${order.name}: ${shipItems.length} orderitem(s) / ${totalQuantity} stuk(s) melden via ${transporterCode}` +
    (trackAndTrace ? ` (T&T ${trackAndTrace})` : ' (zonder T&T)')
  );

  if (config.dryRun) {
    return { shipped: shipItems.length, dryRun: true };
  }

  const transport = trackAndTrace
    ? { transporterCode, trackAndTrace }
    : { transporterCode };

  const created = await bolApi.createShipment(shipItems, transport, order.name);

  // Wachten op bevestiging zodat we weten of de melding echt geslaagd is
  if (created?.processStatusId) {
    const status = await bolApi.waitForProcess(created.processStatusId, { timeoutMs: 60000 });

    if (status.status !== 'SUCCESS') {
      throw new Error(
        `Zending melden mislukt (${status.status}): ${status.errorMessage || 'geen details'}`
      );
    }
  }

  console.log(`[Tracking] ${order.name}: zending gemeld bij Bol.com`);
  return { shipped: shipItems.length };
}

/**
 * Verwerk één Shopify order
 */
async function processOrder(bolApi, shopifyApi, order, config, env) {
  const bolOrderId = getBolOrderId(order);

  if (!bolOrderId) {
    console.warn(`[Tracking] ${order.name}: geen Bol.com bestelnummer gevonden, overslaan`);
    return { shipments: 0, complete: false };
  }

  const fulfillments = (await shopifyApi.getOrderFulfillments(order.id))
    .filter(f => f.status !== 'CANCELLED');

  if (fulfillments.length === 0) {
    return { shipments: 0, complete: false };
  }

  let bolOrder;
  try {
    bolOrder = await bolApi.getOrderDetails(bolOrderId);
  } catch (error) {
    console.error(`[Tracking] ${order.name}: Bol order ${bolOrderId} niet gevonden (${error.message})`);
    return { shipments: 0, complete: false };
  }

  const openItems = buildOpenItems(bolOrder);

  if (openItems.length === 0) {
    console.log(`[Tracking] ${order.name}: alle items al verzonden bij Bol.com`);
    return { shipments: 0, complete: true };
  }

  // Oudste fulfillment eerst, zodat deelzendingen in de juiste volgorde matchen
  const ordered = [...fulfillments].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );

  let shipments = 0;

  for (const fulfillment of ordered) {
    const result = await shipFulfillment(bolApi, order, fulfillment, openItems, config, env);

    if (result.shipped > 0) {
      shipments++;
      await sleep(500);
    }
  }

  const complete = openItems.every(item => item.open <= 0);
  return { shipments, complete };
}

/**
 * Hoofdfunctie: meld afgehandelde Shopify orders bij Bol.com
 */
async function syncTracking(bolApi, shopifyApi, env = process.env) {
  const config = readConfig(env);

  console.log('='.repeat(50));
  console.log('[Tracking] Start verzendsync', new Date().toISOString());
  console.log(`[Tracking] Tag: ${config.bolTag}, terugkijken: ${config.lookbackDays} dagen, dry-run: ${config.dryRun}`);
  console.log('='.repeat(50));

  const sinceIso = new Date(Date.now() - config.lookbackDays * 86400000).toISOString();

  const orders = await shopifyApi.findOrdersToShip({
    bolTag: config.bolTag,
    shippedTag: config.shippedTag,
    sinceIso
  });

  let shipped = 0;
  let skipped = 0;
  let errors = 0;

  for (const order of orders) {
    try {
      const result = await processOrder(bolApi, shopifyApi, order, config, env);

      if (result.shipments > 0) {
        shipped += result.shipments;
      } else {
        skipped++;
      }

      // Order volledig gemeld: taggen zodat hij niet opnieuw wordt opgehaald
      if (result.complete && !config.dryRun) {
        await shopifyApi.addOrderTags(order.id, [config.shippedTag]);
        console.log(`[Tracking] ${order.name}: tag "${config.shippedTag}" toegevoegd`);
      }
    } catch (error) {
      console.error(`[Tracking] Fout bij order ${order.name}:`, error.message);
      errors++;
    }

    await sleep(300);
  }

  console.log('\n' + '='.repeat(50));
  console.log('[Tracking] Verzendsync voltooid');
  console.log(`[Tracking] Zendingen gemeld: ${shipped}, orders overgeslagen: ${skipped}, fouten: ${errors}`);
  console.log('='.repeat(50));

  return { shipped, skipped, errors };
}

module.exports = {
  syncTracking,
  matchFulfillmentItems,
  buildOpenItems,
  getBolOrderId,
  readConfig
};
