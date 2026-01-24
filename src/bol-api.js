const axios = require('axios');

class BolApi {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.baseUrl = 'https://api.bol.com/retailer';
  }

  /**
   * Authenticate met Bol.com OAuth2 client credentials flow
   */
  async authenticate() {
    // Check of we al een geldig token hebben
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const response = await axios.post(
        'https://login.bol.com/token?grant_type=client_credentials',
        null,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      // Token is meestal 5 minuten geldig, we refreshen 30 seconden eerder
      const expiresIn = response.data.expires_in || 300;
      this.tokenExpiry = Date.now() + (expiresIn - 30) * 1000;

      console.log('[Bol.com] Authenticatie succesvol');
      return this.accessToken;
    } catch (error) {
      console.error('[Bol.com] Authenticatie mislukt:', error.response?.data || error.message);
      throw new Error('Bol.com authenticatie mislukt');
    }
  }

  /**
   * Maak een authenticated API request
   */
  async request(method, endpoint, data = null) {
    await this.authenticate();

    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        data,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.retailer.v10+json',
          'Content-Type': 'application/vnd.retailer.v10+json'
        }
      });

      return response.data;
    } catch (error) {
      console.error(`[Bol.com] API error (${endpoint}):`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Haal open FBR orders op
   * FBR = Fulfilled By Retailer (zelf verzenden)
   */
  async getOpenOrders() {
    try {
      const response = await this.request('GET', '/orders?status=OPEN&fulfilment-method=FBR');

      if (!response.orders || response.orders.length === 0) {
        console.log('[Bol.com] Geen open orders gevonden');
        return [];
      }

      console.log(`[Bol.com] ${response.orders.length} open order(s) gevonden`);
      return response.orders;
    } catch (error) {
      // 404 betekent geen orders
      if (error.response?.status === 404) {
        console.log('[Bol.com] Geen open orders gevonden');
        return [];
      }
      throw error;
    }
  }

  /**
   * Haal details van een specifieke order op
   */
  async getOrderDetails(orderId) {
    try {
      const response = await this.request('GET', `/orders/${orderId}`);
      return response;
    } catch (error) {
      console.error(`[Bol.com] Kon order ${orderId} niet ophalen:`, error.message);
      throw error;
    }
  }
}

module.exports = BolApi;
