const { gql } = require('./shopify');
const fs = require('fs');
const Q = `query($after: String) {
  products(first: 50, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle status
      media(first: 50) { nodes { ... on MediaImage { id image { url altText } } } }
      variants(first: 100) { nodes { id title sku barcode image { url } } }
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
  fs.writeFileSync(__dirname + '/shopify-products.json', JSON.stringify(all, null, 2));
  const vars = all.flatMap(p => p.variants.nodes);
  console.log('producten:', all.length, '| varianten:', vars.length,
    '| met barcode:', vars.filter(v => v.barcode).length,
    '| media totaal:', all.reduce((s, p) => s + p.media.nodes.length, 0));
})().catch(e => { console.error(e.message); process.exit(1); });
