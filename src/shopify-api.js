const axios = require('axios');

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
   */
  async graphql(query, variables = {}) {
    await this.authenticate();

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
        console.error('[Shopify] GraphQL errors:', JSON.stringify(response.data.errors, null, 2));
        throw new Error(`GraphQL errors: ${response.data.errors.map(e => e.message).join(', ')}`);
      }

      return response.data.data;
    } catch (error) {
      console.error('[Shopify] API error:', error.response?.data || error.message);
      throw error;
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
}

module.exports = ShopifyApi;
