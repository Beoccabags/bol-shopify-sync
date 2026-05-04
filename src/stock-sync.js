/**
 * Shopify → Bol.com Stock Sync
 *
 * Synchroniseert voorraadniveaus van Shopify naar Bol.com
 * Matcht producten op EAN/barcode
 */

const fs = require('fs');
const path = require('path');

class StockSync {
  constructor(bolApi, shopifyApi, options = {}) {
    this.bolApi = bolApi;
    this.shopifyApi = shopifyApi;
    this.options = options;
    this.mappingFile = options.mappingFile || path.join(__dirname, '../data/bol-offers.csv');
  }

  /**
   * Haal alle producten met voorraad uit Shopify
   */
  async getShopifyInventory() {
    const query = `
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            variants(first: 100) {
              nodes {
                id
                sku
                barcode
                title
                inventoryQuantity
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    `;

    let allVariants = [];
    let cursor = null;
    let hasNextPage = true;

    console.log('[Shopify] Producten ophalen...');

    while (hasNextPage) {
      const data = await this.shopifyApi.graphql(query, { cursor });

      for (const product of data.products.nodes) {
        for (const variant of product.variants.nodes) {
          // Alleen varianten met een barcode/EAN
          if (variant.barcode) {
            allVariants.push({
              productTitle: product.title,
              variantTitle: variant.title,
              sku: variant.sku,
              ean: variant.barcode,
              stock: variant.inventoryQuantity || 0
            });
          }
        }
      }

      hasNextPage = data.products.pageInfo.hasNextPage;
      cursor = data.products.pageInfo.endCursor;
    }

    console.log(`[Shopify] ${allVariants.length} varianten met EAN gevonden`);
    return allVariants;
  }

  /**
   * Laad Bol offers uit lokaal CSV bestand
   * CSV kan geëxporteerd worden vanuit Bol.com Verkopersaccount > Aanbod > Exporteer
   */
  loadBolOffersFromFile() {
    if (!fs.existsSync(this.mappingFile)) {
      return null;
    }

    console.log(`[Bol.com] Offers laden uit ${this.mappingFile}...`);
    const csvData = fs.readFileSync(this.mappingFile, 'utf-8');
    return this.parseCsv(csvData);
  }

  /**
   * Start een offers export via de API (backup methode)
   */
  async getBolOffersFromApi() {
    console.log('[Bol.com] Offers export aanvragen via API...');

    try {
      // Start de export
      const exportResponse = await this.bolApi.request('POST', '/offers/export', {
        format: 'CSV'
      });

      const processStatusId = exportResponse.processStatusId;
      console.log(`[Bol.com] Export gestart, process ID: ${processStatusId}`);

      // Poll voor status tot export klaar is
      let reportId = null;
      let attempts = 0;
      const maxAttempts = 60;

      while (!reportId && attempts < maxAttempts) {
        await this.sleep(5000);
        attempts++;

        try {
          const status = await this.bolApi.request('GET', `/process-status/${processStatusId}`);
          console.log(`[Bol.com] Export status: ${status.status} (poging ${attempts}/${maxAttempts})`);

          if (status.status === 'SUCCESS') {
            if (status.links) {
              for (const link of status.links) {
                if (link.rel === 'self' && link.href.includes('/offers/export/')) {
                  reportId = link.href.split('/offers/export/')[1];
                  break;
                }
              }
            }
            if (!reportId && status.entityId) {
              reportId = status.entityId;
            }
            break;
          } else if (status.status === 'FAILURE') {
            throw new Error(`Bol.com export mislukt: ${status.errorMessage || 'Onbekende fout'}`);
          }
        } catch (error) {
          if (error.response?.status !== 404) {
            throw error;
          }
        }
      }

      if (!reportId) {
        throw new Error('Bol.com export timeout');
      }

      console.log(`[Bol.com] Export downloaden...`);
      const csvData = await this.bolApi.requestRaw('GET', `/offers/export/${reportId}`);

      return this.parseCsv(csvData);
    } catch (error) {
      console.error('[Bol.com] API export niet beschikbaar:', error.message);
      return null;
    }
  }

  /**
   * Haal een offer op via EAN (zoekt in bestaande offers van de retailer)
   */
  async getOfferByEan(ean) {
    try {
      // Probeer het offer te vinden via de offers endpoint met EAN filter
      const response = await this.bolApi.request('GET', `/offers?ean=${ean}`);
      if (response && response.offers && response.offers.length > 0) {
        return response.offers[0];
      }
    } catch (error) {
      // Specifieke endpoint niet beschikbaar, probeer alternatief
    }

    // Alternatief: probeer via product content endpoint
    try {
      const response = await this.bolApi.request('GET', `/content/products/${ean}`);
      if (response && response.offerId) {
        return {
          ean: ean,
          offerId: response.offerId,
          stock: response.stock?.amount || 0
        };
      }
    } catch (error) {
      // Geen product gevonden voor deze EAN
    }

    return null;
  }

  /**
   * Bouw offers mapping door per EAN te zoeken (langzaam maar werkt zonder export permissies)
   */
  async buildOffersMappingByEan(shopifyInventory) {
    console.log('[Bol.com] Offers ophalen per EAN (kan even duren)...');

    const offers = [];
    let found = 0;
    let notFound = 0;

    for (let i = 0; i < shopifyInventory.length; i++) {
      const item = shopifyInventory[i];

      // Progress indicator
      if ((i + 1) % 10 === 0 || i === shopifyInventory.length - 1) {
        console.log(`[Bol.com] Verwerkt: ${i + 1}/${shopifyInventory.length}`);
      }

      const offer = await this.getOfferByEan(item.ean);

      if (offer) {
        offers.push(offer);
        found++;
      } else {
        notFound++;
      }

      // Rate limiting
      await this.sleep(200);
    }

    console.log(`[Bol.com] ${found} offers gevonden, ${notFound} niet gevonden op Bol.com`);
    return offers;
  }

  /**
   * Haal Bol offers op (eerst lokaal bestand, dan API export, dan per-EAN)
   */
  async getBolOffers(shopifyInventory = null) {
    // Probeer eerst lokaal bestand
    let offers = this.loadBolOffersFromFile();

    if (offers && offers.length > 0) {
      console.log(`[Bol.com] ${offers.length} offers geladen uit lokaal bestand`);
      return offers;
    }

    // Als geen lokaal bestand, probeer API export
    console.log('[Bol.com] Geen lokaal bestand gevonden, probeer API export...');
    offers = await this.getBolOffersFromApi();

    if (offers && offers.length > 0) {
      this.saveOffersToFile(offers);
      return offers;
    }

    // Als API export niet werkt en we hebben shopify inventory, probeer per-EAN
    if (shopifyInventory && shopifyInventory.length > 0) {
      console.log('[Bol.com] API export niet beschikbaar, probeer per-EAN lookup...');
      offers = await this.buildOffersMappingByEan(shopifyInventory);

      if (offers && offers.length > 0) {
        this.saveOffersToFile(offers);
        return offers;
      }
    }

    throw new Error(
      `Geen Bol.com offers beschikbaar.\n\n` +
      `Oplossing: Download je offers handmatig:\n` +
      `1. Ga naar Bol.com Verkopersaccount > Aanbod\n` +
      `2. Klik op "Exporteer" om een CSV te downloaden\n` +
      `3. Sla het bestand op als: ${this.mappingFile}\n\n` +
      `Het CSV bestand moet minimaal de kolommen "ean" en "offerId" bevatten.`
    );
  }

  /**
   * Sla offers op naar lokaal bestand
   */
  saveOffersToFile(offers) {
    const dir = path.dirname(this.mappingFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const header = 'ean;offerId;stock;title';
    const lines = offers.map(o => `${o.ean};${o.offerId};${o.stock};${o.title || ''}`);
    const csv = [header, ...lines].join('\n');

    fs.writeFileSync(this.mappingFile, csv);
    console.log(`[Bol.com] Offers opgeslagen naar ${this.mappingFile}`);
  }

  /**
   * Parse CSV naar offers array
   */
  parseCsv(csvData) {
    const lines = csvData.split('\n');
    if (lines.length < 2) return [];

    // Parse header (ondersteunt zowel ; als , als separator)
    const separator = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].split(separator).map(h => h.trim().replace(/"/g, '').toLowerCase());

    // Vind relevante kolom indices (ondersteun meerdere naamvarianten)
    const eanIndex = header.findIndex(h => ['ean', 'ean code', 'eancode'].includes(h));
    const offerIdIndex = header.findIndex(h => ['offerid', 'offer-id', 'offer_id', 'offer id', 'aanbodid'].includes(h));
    const stockIndex = header.findIndex(h => ['stock', 'correctedstock', 'voorraad', 'quantity'].includes(h));
    const titleIndex = header.findIndex(h => ['title', 'producttitle', 'product title', 'titel', 'producttitel'].includes(h));

    if (eanIndex === -1) {
      console.error('[Bol.com] CSV header:', header);
      throw new Error('Kon EAN kolom niet vinden in CSV. Verwacht: "ean", "ean code" of "eancode"');
    }

    if (offerIdIndex === -1) {
      console.error('[Bol.com] CSV header:', header);
      throw new Error('Kon OfferId kolom niet vinden in CSV. Verwacht: "offerId", "offer-id" of "aanbodid"');
    }

    const offers = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(separator).map(v => v.trim().replace(/"/g, ''));

      const offer = {
        ean: values[eanIndex],
        offerId: values[offerIdIndex],
        stock: stockIndex !== -1 ? parseInt(values[stockIndex]) || 0 : 0,
        title: titleIndex !== -1 ? values[titleIndex] : ''
      };

      if (offer.ean && offer.offerId) {
        offers.push(offer);
      }
    }

    return offers;
  }

  /**
   * Update voorraad voor een Bol offer
   */
  async updateBolStock(offerId, ean, newStock) {
    try {
      await this.bolApi.request('PUT', `/offers/${offerId}/stock`, {
        amount: newStock,
        managedByRetailer: true
      });
      return true;
    } catch (error) {
      console.error(`[Bol.com] Stock update mislukt voor offer ${offerId} (EAN: ${ean}):`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Synchroniseer voorraad van Shopify naar Bol.com
   */
  async sync() {
    console.log('\n=== Shopify → Bol.com Stock Sync ===\n');

    const stats = {
      matched: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      notFoundOnBol: 0
    };

    // Haal data op van beide platforms
    const shopifyInventory = await this.getShopifyInventory();
    const bolOffers = await this.getBolOffers(shopifyInventory);

    // Maak een lookup map van EAN naar Bol offer
    const bolByEan = new Map();
    for (const offer of bolOffers) {
      if (offer.ean) {
        bolByEan.set(offer.ean, offer);
      }
    }

    console.log('\n[Sync] Voorraad vergelijken en updaten...\n');

    // Loop door alle Shopify producten en update Bol.com
    for (const shopifyItem of shopifyInventory) {
      const bolOffer = bolByEan.get(shopifyItem.ean);

      if (!bolOffer) {
        stats.notFoundOnBol++;
        continue;
      }

      stats.matched++;

      const currentBolStock = bolOffer.stock ?? 0;

      if (currentBolStock === shopifyItem.stock) {
        stats.unchanged++;
        console.log(`  ✓ ${shopifyItem.ean} - ${shopifyItem.productTitle}: ${shopifyItem.stock} (ongewijzigd)`);
        continue;
      }

      console.log(`  ↻ ${shopifyItem.ean} - ${shopifyItem.productTitle}: ${currentBolStock} → ${shopifyItem.stock}`);

      const success = await this.updateBolStock(bolOffer.offerId, shopifyItem.ean, shopifyItem.stock);

      if (success) {
        stats.updated++;
        // Update lokale cache
        bolOffer.stock = shopifyItem.stock;
      } else {
        stats.errors++;
      }

      // Rate limiting
      await this.sleep(300);
    }

    // Update het lokale bestand met nieuwe voorraadniveaus
    if (stats.updated > 0) {
      this.saveOffersToFile(bolOffers);
    }

    // Rapporteer producten op Bol die niet in Shopify zitten
    const bolEans = new Set(bolOffers.map(o => o.ean).filter(Boolean));
    const shopifyEans = new Set(shopifyInventory.map(i => i.ean));
    const onlyOnBol = [...bolEans].filter(ean => !shopifyEans.has(ean));

    if (onlyOnBol.length > 0) {
      console.log(`\n[Waarschuwing] ${onlyOnBol.length} Bol offers hebben geen match in Shopify:`);
      for (const ean of onlyOnBol.slice(0, 10)) {
        const offer = bolOffers.find(o => o.ean === ean);
        console.log(`  - EAN ${ean}: ${offer?.title || 'Onbekend'}`);
      }
      if (onlyOnBol.length > 10) {
        console.log(`  ... en ${onlyOnBol.length - 10} meer`);
      }
    }

    // Print samenvatting
    console.log('\n=== Samenvatting ===');
    console.log(`Shopify producten met EAN: ${shopifyInventory.length}`);
    console.log(`Bol.com offers: ${bolOffers.length}`);
    console.log(`Gematcht: ${stats.matched}`);
    console.log(`Bijgewerkt: ${stats.updated}`);
    console.log(`Ongewijzigd: ${stats.unchanged}`);
    console.log(`Fouten: ${stats.errors}`);
    console.log(`Niet gevonden op Bol: ${stats.notFoundOnBol}`);

    return stats;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = StockSync;
