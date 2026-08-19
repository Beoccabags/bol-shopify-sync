const test = require('node:test');
const assert = require('node:assert');

const {
  matchFulfillmentItems,
  buildOpenItems,
  getBolOrderId
} = require('../src/tracking-sync');
const { resolveTransporterCode } = require('../src/transporters');
const { calculateStock } = require('../src/stock-sync');

/** Hulpfunctie: bouw een Shopify fulfillment */
function fulfillment(lines, tracking = { number: '3SABC', company: 'PostNL' }) {
  return {
    id: 'gid://shopify/Fulfillment/1',
    status: 'SUCCESS',
    createdAt: '2026-08-19T10:00:00Z',
    trackingInfo: [tracking],
    fulfillmentLineItems: {
      nodes: lines.map((line, index) => ({
        id: `fli-${index}`,
        quantity: line.quantity,
        lineItem: {
          id: `li-${index}`,
          name: line.name || `Product ${index}`,
          sku: line.sku || null,
          variant: line.barcode === null ? null : { id: `v-${index}`, barcode: line.barcode }
        }
      }))
    }
  };
}

/** Hulpfunctie: bouw een Bol.com order */
function bolOrder(items) {
  return {
    orderId: 'C123',
    orderItems: items.map((item, index) => ({
      orderItemId: item.orderItemId || `oi-${index}`,
      product: { ean: item.ean, title: item.title || `Artikel ${index}` },
      offer: { offerId: `offer-${index}`, reference: item.reference || item.ean },
      quantity: item.quantity,
      quantityShipped: item.quantityShipped || 0,
      quantityCancelled: item.quantityCancelled || 0
    }))
  };
}

test('meerdere artikelen in één fulfillment worden per orderitem gemeld', () => {
  const open = buildOpenItems(bolOrder([
    { ean: '8711111111111', quantity: 1 },
    { ean: '8722222222222', quantity: 2 }
  ]));

  const { shipItems, unmatched } = matchFulfillmentItems(
    fulfillment([
      { barcode: '8711111111111', quantity: 1 },
      { barcode: '8722222222222', quantity: 2 }
    ]),
    open
  );

  assert.deepStrictEqual(shipItems, [
    { orderItemId: 'oi-0', quantity: 1 },
    { orderItemId: 'oi-1', quantity: 2 }
  ]);
  assert.strictEqual(unmatched.length, 0);
});

test('deelzending: tweede fulfillment meldt alleen het resterende artikel', () => {
  const open = buildOpenItems(bolOrder([
    { ean: '8711111111111', quantity: 1 },
    { ean: '8722222222222', quantity: 1 }
  ]));

  const eerste = matchFulfillmentItems(
    fulfillment([{ barcode: '8711111111111', quantity: 1 }]),
    open
  );
  const tweede = matchFulfillmentItems(
    fulfillment([{ barcode: '8722222222222', quantity: 1 }]),
    open
  );

  assert.deepStrictEqual(eerste.shipItems, [{ orderItemId: 'oi-0', quantity: 1 }]);
  assert.deepStrictEqual(tweede.shipItems, [{ orderItemId: 'oi-1', quantity: 1 }]);
  assert.ok(open.every(item => item.open === 0));
});

test('dezelfde fulfillment twee keer verwerken levert geen dubbele melding op', () => {
  const open = buildOpenItems(bolOrder([{ ean: '8711111111111', quantity: 1 }]));
  const shopifyFulfillment = fulfillment([{ barcode: '8711111111111', quantity: 1 }]);

  const eerste = matchFulfillmentItems(shopifyFulfillment, open);
  const tweede = matchFulfillmentItems(shopifyFulfillment, open);

  assert.strictEqual(eerste.shipItems.length, 1);
  assert.strictEqual(tweede.shipItems.length, 0);
});

test('al bij Bol.com verzonden aantallen worden niet opnieuw gemeld', () => {
  const open = buildOpenItems(bolOrder([
    { ean: '8711111111111', quantity: 3, quantityShipped: 2 }
  ]));

  const { shipItems } = matchFulfillmentItems(
    fulfillment([{ barcode: '8711111111111', quantity: 3 }]),
    open
  );

  assert.deepStrictEqual(shipItems, [{ orderItemId: 'oi-0', quantity: 1 }]);
});

test('geannuleerde aantallen tellen niet mee als openstaand', () => {
  const open = buildOpenItems(bolOrder([
    { ean: '8711111111111', quantity: 2, quantityCancelled: 2 }
  ]));

  assert.strictEqual(open.length, 0);
});

test('regels zonder variant (prijsverschil) worden genegeerd', () => {
  const open = buildOpenItems(bolOrder([{ ean: '8711111111111', quantity: 1 }]));

  const { shipItems, unmatched } = matchFulfillmentItems(
    fulfillment([
      { barcode: '8711111111111', quantity: 1 },
      { barcode: null, name: 'Bol.com prijsverschil', quantity: 1 }
    ]),
    open
  );

  assert.deepStrictEqual(shipItems, [{ orderItemId: 'oi-0', quantity: 1 }]);
  assert.strictEqual(unmatched.length, 0);
});

test('matching werkt ook op de interne offerreferentie', () => {
  const open = buildOpenItems(bolOrder([
    { ean: '0000000000000', reference: '8711111111111', quantity: 1 }
  ]));

  const { shipItems } = matchFulfillmentItems(
    fulfillment([{ barcode: '8711111111111', quantity: 1 }]),
    open
  );

  assert.deepStrictEqual(shipItems, [{ orderItemId: 'oi-0', quantity: 1 }]);
});

test('onbekende barcode wordt gerapporteerd als unmatched', () => {
  const open = buildOpenItems(bolOrder([{ ean: '8711111111111', quantity: 1 }]));

  const { shipItems, unmatched } = matchFulfillmentItems(
    fulfillment([{ barcode: '8799999999999', quantity: 1 }]),
    open
  );

  assert.strictEqual(shipItems.length, 0);
  assert.strictEqual(unmatched.length, 1);
  assert.strictEqual(unmatched[0].barcode, '8799999999999');
});

test('bestelnummer komt uit het metafield, anders uit de notitie', () => {
  assert.strictEqual(getBolOrderId({ metafield: { value: 'C123' }, note: 'C999' }), 'C123');
  assert.strictEqual(getBolOrderId({ metafield: null, note: 'C999' }), 'C999');
  assert.strictEqual(getBolOrderId({ metafield: null, note: 'Graag snel leveren!' }), null);
});

test('vervoerders worden vertaald naar Bol.com codes', () => {
  assert.strictEqual(resolveTransporterCode('PostNL', '3SABC', {}), 'TNT');
  assert.strictEqual(resolveTransporterCode('DHL Express', '', {}), 'DHL');
  assert.strictEqual(resolveTransporterCode('DPD Belgium', '', {}), 'DPD-BE');
  assert.strictEqual(resolveTransporterCode('', '3SABC123', {}), 'TNT');
  assert.strictEqual(resolveTransporterCode('Iets Anders', 'X1', {}), 'OTHER');
});

test('voorraadberekening houdt rekening met buffer en maximum', () => {
  const config = { buffer: 2, max: 999 };
  assert.strictEqual(calculateStock(10, config), 8);
  assert.strictEqual(calculateStock(1, config), 0);
  assert.strictEqual(calculateStock(5000, config), 999);
});
