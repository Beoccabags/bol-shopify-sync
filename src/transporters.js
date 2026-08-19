/**
 * Vertaling van Shopify verzendmaatschappijen naar Bol.com transporter codes.
 *
 * De officiële codes staan in de Bol.com Retailer API v10 documentatie
 * (Orders and Shipments > Transporters). Let op: PostNL heet bij Bol.com "TNT".
 */

// Volgorde is belangrijk: specifieke varianten eerst
const RULES = [
  [/dhl.*(for\s*you|foryou)/, 'DHLFORYOU'],
  [/dhl.*(same\s*day|sameday)/, 'DHL-SD'],
  [/dhl.*global/, 'DHL-GLOBAL-MAIL'],
  [/dhl.*(germany|deutschland|\bde\b)/, 'DHL_DE'],
  [/dhl/, 'DHL'],
  [/(postnl|post\s*nl).*(brief|letter|brievenbus)/, 'TNT_BRIEF'],
  [/(postnl|post\s*nl).*extra/, 'TNT-EXTRA'],
  [/postnl|post\s*nl/, 'TNT'],
  [/tnt.*express/, 'TNT-EXPRESS'],
  [/tnt.*brief/, 'TNT_BRIEF'],
  [/\btnt\b/, 'TNT'],
  [/dpd.*(be|belg)/, 'DPD-BE'],
  [/dpd/, 'DPD-NL'],
  [/bpost.*brief/, 'BPOST_BRIEF'],
  [/bpost|belgian\s*post/, 'BPOST_BE'],
  [/fedex.*(be|belg)/, 'FEDEX_BE'],
  [/fedex/, 'FEDEX_NL'],
  [/\bups\b/, 'UPS'],
  [/\bgls\b/, 'GLS'],
  [/trunkrs/, 'TRUNKRS'],
  [/budbee|amper/, 'BUDBEE'],
  [/cycloon/, 'CYCLOON'],
  [/dynalogic/, 'DYL'],
  [/parcel\.?\s*nl/, 'PARCEL-NL'],
  [/\bpacks\b/, 'PACKS'],
  [/transmission/, 'TRANSMISSION'],
  [/parts\s*express/, 'PES'],
  [/\btsn\b|transportservice/, 'TSN'],
  [/brief|brievenbus|letter\s*box|mailbox/, 'BRIEFPOST'],
  [/koerier|courier|bezorgafspraak/, 'COURIER']
];

/**
 * Bepaal de Bol.com transporter code
 *
 * @param {string} company        Naam van de vervoerder uit Shopify
 * @param {string} trackingNumber Track & trace code (voor herkenning van PostNL 3S-codes)
 * @param {object} env            Environment (voor BOL_TRANSPORTER_MAP en BOL_DEFAULT_TRANSPORTER)
 */
function resolveTransporterCode(company, trackingNumber = '', env = process.env) {
  const name = String(company || '').trim();
  const fallback = env.BOL_DEFAULT_TRANSPORTER || 'OTHER';

  // Eigen overrides via environment, bijvoorbeeld: {"Mijn Vervoerder":"TNT"}
  if (env.BOL_TRANSPORTER_MAP) {
    try {
      const overrides = JSON.parse(env.BOL_TRANSPORTER_MAP);
      for (const [key, code] of Object.entries(overrides)) {
        if (key.toLowerCase() === name.toLowerCase()) {
          return code;
        }
      }
    } catch (error) {
      console.warn('[Transport] BOL_TRANSPORTER_MAP is geen geldige JSON:', error.message);
    }
  }

  const normalized = name.toLowerCase();

  for (const [pattern, code] of RULES) {
    if (pattern.test(normalized)) {
      return code;
    }
  }

  // PostNL barcodes beginnen met 3S
  if (/^3s/i.test(String(trackingNumber || '').trim())) {
    return 'TNT';
  }

  if (name) {
    console.warn(`[Transport] Onbekende vervoerder "${name}", valt terug op ${fallback}`);
  }

  return fallback;
}

module.exports = { resolveTransporterCode };
