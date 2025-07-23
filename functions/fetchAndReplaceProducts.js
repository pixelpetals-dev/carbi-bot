import Database from "better-sqlite3";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config({ path: './.env' });

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_TOKEN;
const GRAPHQL_ENDPOINT = `https://${SHOP}/admin/api/2023-10/graphql.json`;

const db = new Database("products.sqlite");

async function fetchAllProducts() {
  const allProducts = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              handle
              title
              bodyHtml
              vendor
              tags
              createdAt
              updatedAt
              onlineStoreUrl
              images(first: 1) {
                edges {
                  node { src }
                }
              }
              variants(first: 1) {
                edges {
                  node {
                    weight
                    weightUnit
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables: { cursor }
      })
    });

    const json = await res.json();
    const data = json.data.products;

    for (const edge of data.edges) {
      const p = edge.node;
      const variant = p.variants.edges[0]?.node || {};
      const image = p.images.edges[0]?.node?.src || "";

      allProducts.push({
        product_id: p.id,
        handle: p.handle,
        title: p.title,
        body_html: p.bodyHtml,
        vendor: p.vendor,
        tags: p.tags.join(", "),
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        url: p.onlineStoreUrl,
        smart_collections: "", // Optional
        img_src: image,
        weight: variant.weight || 0,
        unit: variant.weightUnit || "",
        price: parseFloat(variant.price || "0"),
        total_inventory_qty: variant.inventoryQuantity || 0
      });
    }

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
  }

  return allProducts;
}

function replaceProductsTable(products) {
  const deleteStmt = db.prepare("DELETE FROM products");
  deleteStmt.run();

  const insertStmt = db.prepare(`
    INSERT INTO products (
      product_id, handle, title, body_html, vendor, tags,
      created_at, updated_at, url, smart_collections,
      img_src, weight, unit, price, total_inventory_qty
    ) VALUES (
      @product_id, @handle, @title, @body_html, @vendor, @tags,
      @created_at, @updated_at, @url, @smart_collections,
      @img_src, @weight, @unit, @price, @total_inventory_qty
    )
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insertStmt.run(row);
  });

  insertMany(products);
}

export async function syncShopify() {
  const products = await fetchAllProducts();
  replaceProductsTable(products);
  console.log(`✅ Synced ${products.length} products via GraphQL`);
}

// Run now for testing
// syncShopify();
