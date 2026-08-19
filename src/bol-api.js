const axios = require('axios');

/**
 * Wacht een aantal milliseconden
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class BolApi {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.host = 'https://api.bol.com';
    this.baseUrl = `${this.host}/retailer`;
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
   *
   * @param {string} method   HTTP methode
   * @param {string} endpoint Pad vanaf /retailer, of een absoluut pad (begint met /shared)
   * @param {object} data     Request body
   * @param {object} options  { accept, contentType, responseType, retries }
   */
  async request(method, endpoint, data = null, options = {}) {
    const {
      accept = 'application/vnd.retailer.v10+json',
      contentType = 'application/vnd.retailer.v10+json',
      responseType = 'json',
      retries = 3
    } = options;

    // Endpoints buiten de retailer-namespace (zoals /shared/process-status)
    const url = endpoint.startsWith('/shared')
      ? `${this.host}${endpoint}`
      : `${this.baseUrl}${endpoint}`;

    let attempt = 0;

    while (true) {
      await this.authenticate();

      try {
        const response = await axios({
          method,
          url,
          data,
          responseType,
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': accept,
            'Content-Type': contentType
          }
        });

        return response.data;
      } catch (error) {
        const status = error.response?.status;

        // Rate limit of tijdelijke serverfout: opnieuw proberen
        if ((status === 429 || (status >= 500 && status < 600)) && attempt < retries) {
          attempt++;
          const retryAfter = parseInt(error.response?.headers?.['retry-after'], 10);
          const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 2000;
          console.warn(`[Bol.com] HTTP ${status} op ${endpoint}, poging ${attempt}/${retries} over ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }

        console.error(`[Bol.com] API error (${endpoint}):`, error.response?.data || error.message);
        throw error;
      }
    }
  }

  /**
   * Haal een ruwe (niet-JSON) response op, bijvoorbeeld een CSV-export
   */
  async requestRaw(method, endpoint) {
    return this.request(method, endpoint, null, {
      accept: 'text/csv',
      responseType: 'text'
    });
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

  /**
   * Haal de status van een asynchroon proces op
   * GET /shared/process-status/{process-status-id}
   */
  async getProcessStatus(processStatusId) {
    return this.request('GET', `/shared/process-status/${processStatusId}`);
  }

  /**
   * Wacht tot een asynchroon proces klaar is
   *
   * @returns {object} De laatste process status (status: SUCCESS | FAILURE | TIMEOUT | PENDING)
   */
  async waitForProcess(processStatusId, { timeoutMs = 60000, intervalMs = 2000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let status = null;

    while (Date.now() < deadline) {
      status = await this.getProcessStatus(processStatusId);

      if (status.status !== 'PENDING') {
        return status;
      }

      await sleep(intervalMs);
    }

    console.warn(`[Bol.com] Proces ${processStatusId} nog steeds PENDING na ${timeoutMs}ms`);
    return status;
  }

  /**
   * Vraag een export van alle offers aan en download het CSV-rapport
   *
   * Flow: POST /offers/export -> poll process-status -> GET /offers/export/{report-id}
   *
   * @returns {Array<object>} Offers met o.a. offerId, ean, stockAmount, correctedStock, fulfilmentType
   */
  async getOfferExport({ timeoutMs = 300000 } = {}) {
    console.log('[Bol.com] Offer export aanvragen...');
    const created = await this.request('POST', '/offers/export', { format: 'CSV' });

    const processStatus = await this.waitForProcess(created.processStatusId, {
      timeoutMs,
      intervalMs: 5000
    });

    if (processStatus.status !== 'SUCCESS') {
      throw new Error(
        `Offer export mislukt (status ${processStatus.status}): ${processStatus.errorMessage || 'geen details'}`
      );
    }

    const reportId = processStatus.entityId;
    console.log(`[Bol.com] Offer export klaar, rapport ${reportId} downloaden...`);

    const csv = await this.request('GET', `/offers/export/${reportId}`, null, {
      accept: 'application/vnd.retailer.v10+csv',
      responseType: 'text'
    });

    const offers = parseCsv(csv);
    console.log(`[Bol.com] ${offers.length} offer(s) uit export gelezen`);
    return offers;
  }

  /**
   * Werk de voorraad van een offer bij
   * PUT /offers/{offer-id}/stock
   */
  async updateOfferStock(offerId, amount, managedByRetailer = true) {
    return this.request('PUT', `/offers/${offerId}/stock`, {
      amount,
      managedByRetailer
    });
  }

  /**
   * Meld een zending aan bij Bol.com
   * POST /shipments
   *
   * @param {Array<{orderItemId: string, quantity: number}>} orderItems
   * @param {object} transport  { transporterCode, trackAndTrace }
   * @param {string} shipmentReference  Eigen referentie (max 90 tekens)
   */
  async createShipment(orderItems, transport, shipmentReference = null) {
    const body = { orderItems };

    if (transport) {
      body.transport = transport;
    }

    if (shipmentReference) {
      body.shipmentReference = String(shipmentReference).slice(0, 90);
    }

    const created = await this.request('POST', '/shipments', body);
    return created;
  }
}

/**
 * Minimale CSV parser met ondersteuning voor quotes.
 * De offer export van Bol.com gebruikt komma's als scheidingsteken.
 *
 * @returns {Array<object>} Rijen als objecten met de headers als sleutels
 */
function parseCsv(csv) {
  const text = String(csv).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  // Laatste veld/rij afsluiten
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());

  return rows
    .slice(1)
    .filter(cells => cells.some(cell => cell.trim() !== ''))
    .map(cells => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (cells[index] || '').trim();
      });
      return record;
    });
}

module.exports = BolApi;
module.exports.parseCsv = parseCsv;
