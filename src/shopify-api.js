const axios = require('axios');

/**
 * Wacht een aantal milliseconden
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ShopifyApi {
  constructor(shop, clientId, clientSecret) {
    this.shop = shop;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.apiVersion = '2024-10';
    this.endpoint = `https://${shop}.myshopify.com/admin/api/${this.apiVersion}/graphql.json`;
  }

  /**
   * Authenticate met Shopify OAuth2 client credentials flow
   */
  async authenticate() {
    // Check of we al een geldig token hebben (token is 24 uur geldig, we refreshen 1 uur eerder)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `https://${this.shop}.myshopify.com/admin/oauth/access_token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Token is 24 uur geldig, we refreshen 1 uur eerder
      const expiresIn = response.data.expires_in || 86400; // 24 uur in seconden
      this.tokenExpiry = Date.now() + (expiresIn - 3600) * 1000;

      console.log('[Shopify] Authenticatie succesvol');
      return this.accessToken;
    } catch (error) {
      console.error('[Shopify] Authenticatie mislukt:', error.response?.data || error.message);
      throw new Error('Shopify authenticatie mislukt');
    }
  }

  /**
   * Voer een GraphQL query uit
   *
   * Bij THROTTLED (rate limit) wordt automatisch opnieuw geprobeerd.
   */
  async graphql(query, variables = {}, retries = 3) {
    await this.authenticate();

    let attempt = 0;

    while (true) {
      try {
        const response = await axios.post(
          this.endpoint,
          { query, variables },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': this.accessToken
            }
          }
        );

        if (response.data.errors) {
          const throttled = response.data.errors.some(e => e.extensions?.code === 'THROTTLED');

          if (throttled && attempt < retries) {
            attempt++;
            const waitMs = attempt * 2000;
            console.warn(`[Shopify] Rate limit bereikt, poging ${attempt}/${retries} over ${waitMs}ms`);
            await sleep(waitMs);
            continue;
          }

          console.error('[Shopify] GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
          throw new Error(`GraphQL errors: ${response.data.errors.map(e => e.message).join(', ')}`);
        }

        return response.data.data;
      } catch (error) {
        const status = error.response?.status;

        if ((status === 429 || (status >= 500 && status < 600)) && attempt < retries) {
          attempt++;
          const waitMs = attempt * 2000;
          console.warn(`[Shopify] HTTP ${status}, poging ${attempt}/${retries} over ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }

        if (error.response) {
          console.error('[Shopify] API error:', error.response.data || error.message);
        }
        throw error;
      }
    }
  }

  /**
   * Zoek klant op voornaam en achternaam
   */
  async findCustomer(firstName, lastName) {
    const query = `
      query searchCustomer($query: String!) {
        customers(first: 10, query: $query) {
          nodes {
            id
            firstName
            lastName
            addresses {
              id
              address1
              address2
              city
              zip
              country
              countryCodeV2
            }
          }
        }
      }
    `;

    const searchQuery = `first_name:${firstName} AND last_name:${lastName}`;
    const data = await this.graphql(query, { query: searchQuery });

    if (data.customers.nodes.length > 0) {
      console.log(`[Shopify] Klant gevonden: ${firstName} ${lastName}`);
      return data.customers.nodes[0];
    }

    console.log(`[Shopify] Klant niet gevonden: ${firstName} ${lastName}`);
    return null;
  }

  /**
   * Maak een nieuwe klant aan
   */
  async createCustomer(customerData) {
    const mutation = `
      mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer {
            id
            firstName
            lastName
            addresses {
              id
              address1
              city
              zip
              country
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const input = {
      firstName: customerData.firstName,
      lastName: customerData.lastName,
      addresses: [{
        address1: customerData.address1,
        address2: customerData.address2 || null,
        city: customerData.city,
        zip: customerData.zip,
        countryCode: customerData.countryCode
      }]
    };

    const data = await this.graphql(mutation, { input });

    if (data.customerCreate.userErrors.length > 0) {
      const errors = data.customerCreate.userErrors;
      console.error('[Shopify] Klant aanmaken mislukt:', errors);
      throw new Error(`Klant aanmaken mislukt: ${errors.map(e => e.message).join(', ')}`);
    }

    console.log(`[Shopify] Klant aangemaakt: ${customerData.firstName} ${customerData.lastName}`);
    return data.customerCreate.customer;
  }

  /**
   * Zoek product variant op EAN/barcode
   */
  async findProductByBarcode(barcode) {
    const query = `
      query findProductByBarcode($query: String!) {
        productVariants(first: 1, query: $query) {
          nodes {
            id
            price
            barcode
            sku
            title
            product {
              id
              title
            }
          }
        }
      }
    `;

    // Zoek op barcode
    const data = await this.graphql(query, { query: `barcode:${barcode}` });

    if (data.productVariants.nodes.length > 0) {
      const variant = data.productVariants.nodes[0];
      console.log(`[Shopify] Product gevonden voor EAN ${barcode}: ${variant.product.title}`);
      return variant;
    }

    console.log(`[Shopify] Geen product gevonden voor EAN: ${barcode}`);
    return null;
  }

  /**
   * Maak een draft order aan
   */
  async createDraftOrder(draftOrderInput) {
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            totalPrice
            customer {
              id
              firstName
              lastName
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql(mutation, { input: draftOrderInput });

    if (data.draftOrderCreate.userErrors.length > 0) {
      const errors = data.draftOrderCreate.userErrors;
      console.error('[Shopify] Draft order aanmaken mislukt:', errors);
      throw new Error(`Draft order aanmaken mislukt: ${errors.map(e => e.message).join(', ')}`);
    }

    const draftOrder = data.draftOrderCreate.draftOrder;
    console.log(`[Shopify] Draft order aangemaakt: ${draftOrder.name}`);
    return draftOrder;
  }

  /**
   * Zet draft order om naar echte order
   */
  async completeDraftOrder(draftOrderId) {
    const mutation = `
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id) {
          draftOrder {
            id
            order {
              id
              name
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql(mutation, { id: draftOrderId });

    if (data.draftOrderComplete.userErrors.length > 0) {
      const errors = data.draftOrderComplete.userErrors;
      console.error('[Shopify] Draft order voltooien mislukt:', errors);
      throw new Error(`Draft order voltooien mislukt: ${errors.map(e => e.message).join(', ')}`);
    }

    const order = data.draftOrderComplete.draftOrder.order;
    console.log(`[Shopify] Draft omgezet naar order: ${order.name}`);
    return order;
  }

  /**
   * Markeer order als betaald
   */
  async markOrderAsPaid(orderId) {
    const mutation = `
      mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          order {
            id
            name
            displayFinancialStatus
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql(mutation, { input: { id: orderId } });

    if (data.orderMarkAsPaid.userErrors.length > 0) {
      const errors = data.orderMarkAsPaid.userErrors;
      console.error('[Shopify] Order als betaald markeren mislukt:', errors);
      throw new Error(`Order als betaald markeren mislukt: ${errors.map(e => e.message).join(', ')}`);
    }

    const order = data.orderMarkAsPaid.order;
    console.log(`[Shopify] Order ${order.name} gemarkeerd als betaald`);
    return order;
  }

  /**
   * Check of een Bol order al bestaat in Shopify (via metafield marketplace_bestelnummer)
   */
  async orderExistsByBolId(bolOrderId) {
    const query = `
      query findOrderByMetafield($query: String!) {
        orders(first: 5, query: $query) {
          nodes {
            id
            name
            metafield(namespace: "custom", key: "marketplace_bestelnummer") {
              value
            }
          }
        }
      }
    `;

    // Zoek op metafield met bol order ID
    const searchQuery = `metafields.custom.marketplace_bestelnummer:"${bolOrderId}"`;
    const data = await this.graphql(query, { query: searchQuery });

    // Verifieer exacte match op metafield waarde (Shopify search kan false positives geven)
    for (const order of data.orders.nodes) {
      if (order.metafield && order.metafield.value === bolOrderId) {
        console.log(`[Shopify] Order voor Bol ${bolOrderId} bestaat al: ${order.name}`);
        return true;
      }
    }

    if (data.orders.nodes.length > 0) {
      console.log(`[Shopify] Zoekresultaten gevonden maar geen exacte match voor ${bolOrderId}, wordt als nieuw behandeld`);
    }

    return false;
  }

  /**
   * Haal alle varianten met een barcode (EAN) en hun beschikbare voorraad op.
   *
   * Zonder locationId wordt de totale voorraad over alle locaties gebruikt,
   * met locationId de beschikbare voorraad op die ene locatie.
   *
   * @returns {Map<string, object>} barcode -> { available, variantId, title, tracked, status }
   */
  async getVariantsForStock({ locationId = null, pageSize = 100 } = {}) {
    const inventoryLevelFields = locationId
      ? `
          inventoryLevel(locationId: $locationId) {
            quantities(names: ["available"]) {
              name
              quantity
            }
          }`
      : '';

    const query = `
      query stockVariants($cursor: String${locationId ? ', $locationId: ID!' : ''}) {
        productVariants(first: ${pageSize}, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            barcode
            sku
            title
            inventoryQuantity
            inventoryItem {
              id
              tracked${inventoryLevelFields}
            }
            product {
              id
              title
              status
            }
          }
        }
      }
    `;

    const byBarcode = new Map();
    let cursor = null;
    let page = 0;
    let total = 0;

    do {
      const variables = { cursor };
      if (locationId) variables.locationId = locationId;

      const data = await this.graphql(query, variables);
      const connection = data.productVariants;
      page++;

      for (const variant of connection.nodes) {
        total++;

        const barcode = (variant.barcode || '').trim();
        if (!barcode) continue;

        let available;
        if (locationId) {
          const level = variant.inventoryItem?.inventoryLevel;
          const quantity = level?.quantities?.find(q => q.name === 'available');
          // Product niet voorradig op deze locatie -> 0
          available = quantity ? quantity.quantity : 0;
        } else {
          available = variant.inventoryQuantity ?? 0;
        }

        const entry = {
          variantId: variant.id,
          sku: variant.sku,
          title: variant.product?.title || variant.title,
          productStatus: variant.product?.status,
          tracked: variant.inventoryItem?.tracked !== false,
          available
        };

        // Meerdere varianten met dezelfde EAN: tel de voorraad bij elkaar op
        const existing = byBarcode.get(barcode);
        if (existing) {
          existing.available += available;
        } else {
          byBarcode.set(barcode, entry);
        }
      }

      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;

      // Kleine pauze om de rate limit te ontzien
      if (cursor) await sleep(200);
    } while (cursor);

    console.log(`[Shopify] ${total} variant(en) opgehaald in ${page} pagina('s), ${byBarcode.size} met barcode`);
    return byBarcode;
  }

  /**
   * Zoek Shopify orders die naar Bol.com gemeld moeten worden:
   * orders met de bol-tag die (deels) zijn afgehandeld en nog niet gemeld zijn.
   */
  async findOrdersToShip({ bolTag = 'bol', shippedTag = 'bol-verzonden', sinceIso = null, maxOrders = 250 } = {}) {
    const query = `
      query ordersToShip($cursor: String, $search: String!) {
        orders(first: 25, after: $cursor, query: $search, sortKey: UPDATED_AT) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            name
            note
            updatedAt
            displayFulfillmentStatus
            metafield(namespace: "custom", key: "marketplace_bestelnummer") {
              value
            }
          }
        }
      }
    `;

    const filters = [
      `tag:'${bolTag}'`,
      `-tag:'${shippedTag}'`,
      '(fulfillment_status:shipped OR fulfillment_status:partial)'
    ];

    if (sinceIso) {
      filters.push(`updated_at:>='${sinceIso}'`);
    }

    const search = filters.join(' AND ');
    const orders = [];
    let cursor = null;

    do {
      const data = await this.graphql(query, { cursor, search });
      const connection = data.orders;

      orders.push(...connection.nodes);

      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
      if (cursor) await sleep(200);
    } while (cursor && orders.length < maxOrders);

    console.log(`[Shopify] ${orders.length} afgehandelde bol-order(s) gevonden om te melden`);
    return orders;
  }

  /**
   * Haal de fulfillments van een order op, inclusief trackinggegevens en
   * de regels per product (met barcode/EAN voor matching op productniveau).
   */
  async getOrderFulfillments(orderId) {
    const query = `
      query orderFulfillments($id: ID!) {
        order(id: $id) {
          id
          name
          fulfillments(first: 10) {
            id
            status
            createdAt
            trackingInfo(first: 5) {
              number
              company
              url
            }
            fulfillmentLineItems(first: 50) {
              nodes {
                id
                quantity
                lineItem {
                  id
                  name
                  sku
                  variant {
                    id
                    barcode
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql(query, { id: orderId });
    return data.order?.fulfillments || [];
  }

  /**
   * Voeg tags toe aan een order
   */
  async addOrderTags(orderId, tags) {
    const mutation = `
      mutation addTags($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const data = await this.graphql(mutation, { id: orderId, tags });

    if (data.tagsAdd.userErrors.length > 0) {
      const errors = data.tagsAdd.userErrors;
      console.error('[Shopify] Tag toevoegen mislukt:', errors);
      throw new Error(`Tag toevoegen mislukt: ${errors.map(e => e.message).join(', ')}`);
    }

    return true;
  }
}

module.exports = ShopifyApi;
