// Haalt de volledige productdata uit Shopify op als feitenbron voor de bol-content:
// beschrijving, metafields (specs), opties, tags, gewicht, prijs per variant.
const { gql } = require('../image-sync/shopify');
const fs = require('fs');
const Q = `query($after: String) {
  products(first: 25, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle status productType vendor tags
      descriptionHtml
      seo { title description }
      options { name values }
      metafields(first: 60) { nodes { namespace key value type } }
      variants(first: 100) { nodes {
        id title sku barcode price
        selectedOptions { name value }
        inventoryItem { measurement { weight { value unit } } }
        metafields(first: 40) { nodes { namespace key value type } }
      } }
    }
  }
}`;
(async () => {
  let after = null, all = [];
  do {
    const d = await gql(Q, { after });
    all.push(...d.products.nodes);
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  fs.writeFileSync(__dirname + '/shopify-full.json', JSON.stringify(all, null, 2));
  console.log('producten:', all.length, '| varianten:', all.reduce((s, p) => s + p.variants.nodes.length, 0));
})().catch(e => { console.error(e.message); process.exit(1); });
