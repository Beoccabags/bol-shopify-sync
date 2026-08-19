const fs = require('fs');
const path = require('path');

const TRACKER_FILE = path.join(__dirname, '..', 'processed-orders.json');

/**
 * Laad lijst van al verwerkte order IDs
 */
function loadProcessedOrders() {
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      const data = fs.readFileSync(TRACKER_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Tracker] Fout bij laden processed orders:', error.message);
  }
  return { orders: [], lastUpdated: null };
}

/**
 * Sla lijst van verwerkte orders op
 */
function saveProcessedOrders(processedData) {
  try {
    processedData.lastUpdated = new Date().toISOString();
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(processedData, null, 2), 'utf8');
  } catch (error) {
    console.error('[Tracker] Fout bij opslaan processed orders:', error.message);
  }
}

/**
 * Check of een order al is verwerkt
 */
function isOrderProcessed(orderId) {
  const data = loadProcessedOrders();
  return data.orders.includes(orderId);
}

/**
 * Markeer order als verwerkt
 */
function markOrderAsProcessed(orderId) {
  const data = loadProcessedOrders();
  if (!data.orders.includes(orderId)) {
    data.orders.push(orderId);
    saveProcessedOrders(data);
    console.log(`[Tracker] Order ${orderId} gemarkeerd als verwerkt`);
  }
}

/**
 * Verwijder order uit processed lijst (voor testing/herverwerking)
 */
function unmarkOrder(orderId) {
  const data = loadProcessedOrders();
  data.orders = data.orders.filter(id => id !== orderId);
  saveProcessedOrders(data);
  console.log(`[Tracker] Order ${orderId} verwijderd uit processed lijst`);
}

/**
 * Toon statistieken
 */
function getStats() {
  const data = loadProcessedOrders();
  return {
    totalProcessed: data.orders.length,
    lastUpdated: data.lastUpdated,
    orders: data.orders
  };
}

module.exports = {
  isOrderProcessed,
  markOrderAsProcessed,
  unmarkOrder,
  getStats,
  loadProcessedOrders
};
