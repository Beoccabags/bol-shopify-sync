/**
 * Converteer Bol.com shipment details naar Shopify adres formaat
 */
function convertAddress(shipmentDetails) {
  if (!shipmentDetails) return null;

  // Combineer huisnummer en extensie
  let address1 = shipmentDetails.streetName || '';
  if (shipmentDetails.houseNumber) {
    address1 += ` ${shipmentDetails.houseNumber}`;
  }
  if (shipmentDetails.houseNumberExtension) {
    address1 += shipmentDetails.houseNumberExtension;
  }

  return {
    firstName: shipmentDetails.firstName || '',
    lastName: shipmentDetails.surname || '',
    address1: address1.trim(),
    address2: shipmentDetails.extraAddressInformation || null,
    city: shipmentDetails.city || '',
    zip: shipmentDetails.zipCode || '',
    countryCode: shipmentDetails.countryCode || 'NL'
  };
}

/**
 * Zoek of maak klant aan in Shopify
 */
async function findOrCreateCustomer(shopifyApi, shipmentDetails) {
  const firstName = shipmentDetails.firstName;
  const lastName = shipmentDetails.surname;

  // Probeer eerst bestaande klant te vinden
  const existingCustomer = await shopifyApi.findCustomer(firstName, lastName);
  if (existingCustomer) {
    return existingCustomer;
  }

  // Maak nieuwe klant aan
  const addressData = convertAddress(shipmentDetails);
  const newCustomer = await shopifyApi.createCustomer({
    firstName,
    lastName,
    email: shipmentDetails.email || null,
    address1: addressData.address1,
    address2: addressData.address2,
    city: addressData.city,
    zip: addressData.zip,
    countryCode: addressData.countryCode
  });

  return newCustomer;
}

/**
 * Verwerk een enkele Bol.com order
 */
async function processOrder(bolApi, shopifyApi, order) {
  const orderId = order.orderId;
  console.log(`\n[Sync] Verwerken van order: ${orderId}`);

  // Haal volledige order details op
  const orderDetails = await bolApi.getOrderDetails(orderId);

  // Controleer of er shipment details zijn
  if (!orderDetails.shipmentDetails) {
    console.error(`[Sync] Order ${orderId} heeft geen verzendgegevens, overslaan`);
    return null;
  }

  // Verwerk order items
  const lineItems = [];
  let totalDiscount = 0;
  let totalPrijsverschil = 0;

  for (const item of orderDetails.orderItems || []) {
    // Bol.com API v10: EAN zit in product.ean, prijs in unitPrice of offerPrice
    const ean = item.product?.ean || item.ean;
    const bolPrice = parseFloat(item.unitPrice || item.offerPrice || 0);
    const quantity = item.quantity || 1;

    console.log(`[Sync] Verwerken item: EAN ${ean}, prijs €${bolPrice}, aantal ${quantity}`);

    // Skip items zonder EAN
    if (!ean) {
      console.log('[Sync] Item heeft geen EAN, structuur:', JSON.stringify(item, null, 2));
      continue;
    }

    // Zoek product op EAN
    const variant = await shopifyApi.findProductByBarcode(ean);

    if (!variant) {
      console.error(`[Sync] Product met EAN ${ean} niet gevonden in Shopify, item overslaan`);
      continue;
    }

    const shopifyPrice = parseFloat(variant.price);
    const priceDifference = (bolPrice - shopifyPrice) * quantity;

    // Voeg product toe aan line items
    lineItems.push({
      variantId: variant.id,
      quantity: quantity
    });

    console.log(`[Sync] Shopify prijs: €${shopifyPrice}, Bol prijs: €${bolPrice}, verschil: €${priceDifference.toFixed(2)}`);

    // Afhandeling prijsverschil
    if (priceDifference > 0.01) {
      // Bol duurder dan Shopify: tel prijsverschil op
      totalPrijsverschil += priceDifference;
      console.log(`[Sync] Bol duurder: +€${priceDifference.toFixed(2)}`);
    } else if (priceDifference < -0.01) {
      // Bol goedkoper dan Shopify: tel korting op
      totalDiscount += Math.abs(priceDifference);
      console.log(`[Sync] Bol goedkoper: korting €${Math.abs(priceDifference).toFixed(2)}`);
    }
  }

  // Controleer of er items zijn om te verwerken
  if (lineItems.length === 0) {
    console.error(`[Sync] Geen geldige items voor order ${orderId}, overslaan`);
    return null;
  }

  // Voeg prijsverschil toe als custom line item (indien Bol duurder)
  if (totalPrijsverschil > 0.01) {
    console.log(`[Sync] Prijsverschil toevoegen als custom item: €${totalPrijsverschil.toFixed(2)}`);
    lineItems.push({
      title: 'Bol.com prijsverschil',
      quantity: 1,
      originalUnitPrice: Math.round(totalPrijsverschil * 100) / 100,
      requiresShipping: false,
      taxable: true
    });
  }

  // Bouw draft order input (zonder customerId om e-mails te voorkomen)
  const shippingAddress = convertAddress(orderDetails.shipmentDetails);

  const draftOrderInput = {
    // Geen customerId - voorkomt dat Shopify e-mails stuurt
    lineItems: lineItems,
    tags: ['bol', `bol-${orderId}`],
    shippingAddress: {
      firstName: shippingAddress.firstName,
      lastName: shippingAddress.lastName,
      address1: shippingAddress.address1,
      address2: shippingAddress.address2,
      city: shippingAddress.city,
      zip: shippingAddress.zip,
      countryCode: shippingAddress.countryCode
    },
    billingAddress: {
      firstName: shippingAddress.firstName,
      lastName: shippingAddress.lastName,
      address1: shippingAddress.address1,
      address2: shippingAddress.address2,
      city: shippingAddress.city,
      zip: shippingAddress.zip,
      countryCode: shippingAddress.countryCode
    },
    metafields: [{
      namespace: 'custom',
      key: 'marketplace_bestelnummer',
      value: orderId,
      type: 'single_line_text_field'
    }]
  };

  // Voeg korting toe indien van toepassing
  if (totalDiscount > 0.01) {
    draftOrderInput.appliedDiscount = {
      title: 'korting bol',
      description: 'Prijsverschil Bol.com',
      valueType: 'FIXED_AMOUNT',
      value: Math.round(totalDiscount * 100) / 100
    };
  }

  // Maak draft order aan
  const draftOrder = await shopifyApi.createDraftOrder(draftOrderInput);

  // Zet draft om naar echte order
  const shopifyOrder = await shopifyApi.completeDraftOrder(draftOrder.id);

  // Markeer als betaald
  await shopifyApi.markOrderAsPaid(shopifyOrder.id);

  console.log(`[Sync] Order ${orderId} succesvol verwerkt als ${shopifyOrder.name} (betaald)`);
  return shopifyOrder;
}

/**
 * Hoofdfunctie: synchroniseer alle open Bol.com orders naar Shopify
 */
async function syncOrders(bolApi, shopifyApi) {
  console.log('='.repeat(50));
  console.log('[Sync] Start synchronisatie', new Date().toISOString());
  console.log('='.repeat(50));

  // Haal open orders op van Bol.com
  const orders = await bolApi.getOpenOrders();

  if (orders.length === 0) {
    console.log('[Sync] Geen orders om te verwerken');
    return { processed: 0, skipped: 0, errors: 0 };
  }

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Verwerk elke order
  for (const order of orders) {
    const orderId = order.orderId;

    // Check of order al bestaat in Shopify
    const exists = await shopifyApi.orderExistsByBolId(orderId);
    if (exists) {
      console.log(`[Sync] Order ${orderId} bestaat al in Shopify, overslaan`);
      skipped++;
      continue;
    }

    try {
      const result = await processOrder(bolApi, shopifyApi, order);

      if (result) {
        processed++;
      } else {
        errors++;
      }
    } catch (error) {
      console.error(`[Sync] Fout bij verwerken order ${orderId}:`, error.message);
      errors++;
    }

    // Kleine pauze om rate limits te respecteren
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(50));
  console.log('[Sync] Synchronisatie voltooid');
  console.log(`[Sync] Verwerkt: ${processed}, Overgeslagen: ${skipped}, Fouten: ${errors}`);
  console.log('='.repeat(50));

  return { processed, skipped, errors };
}

module.exports = { syncOrders };
