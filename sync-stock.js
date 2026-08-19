#!/usr/bin/env node

/**
 * Losse entrypoint voor de voorraadsync (Shopify -> Bol.com).
 * Doet hetzelfde als `node index.js stock`.
 */

process.argv[2] = 'stock';
require('./index.js');
