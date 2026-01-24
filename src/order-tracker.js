const fs = require('fs');
const path = require('path');

const PROCESSED_FILE = path.join(__dirname, '../data/processed-orders.json');

/**
 * Laad de lijst met verwerkte orders
 */
function loadProcessedOrders() {
  try {
    if (!fs.existsSync(PROCESSED_FILE)) {
      // Maak het bestand aan als het niet bestaat
      const initialData = { orders: [] };
      fs.writeFileSync(PROCESSED_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    const content = fs.readFileSync(PROCESSED_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[Tracker] Kon processed-orders.json niet laden:', error.message);
    return { orders: [] };
  }
}

/**
 * Check of een order al verwerkt is
 */
function isOrderProcessed(orderId) {
  const data = loadProcessedOrders();
  return data.orders.includes(orderId);
}

/**
 * Markeer een order als verwerkt
 */
function markOrderProcessed(orderId) {
  const data = loadProcessedOrders();

  if (!data.orders.includes(orderId)) {
    data.orders.push(orderId);

    try {
      fs.writeFileSync(PROCESSED_FILE, JSON.stringify(data, null, 2));
      console.log(`[Tracker] Order ${orderId} gemarkeerd als verwerkt`);
    } catch (error) {
      console.error(`[Tracker] Kon order ${orderId} niet markeren:`, error.message);
      throw error;
    }
  }
}

/**
 * Haal statistieken op
 */
function getStats() {
  const data = loadProcessedOrders();
  return {
    totalProcessed: data.orders.length,
    orders: data.orders
  };
}

module.exports = {
  isOrderProcessed,
  markOrderProcessed,
  getStats
};
