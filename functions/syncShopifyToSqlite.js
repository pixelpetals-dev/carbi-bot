import Database from "better-sqlite3";
import fetch from "node-fetch";

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP;
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const db = new Database("products.sqlite");

async function fetchAllShopifyProducts() {
  let products = [];
  let url = `https://${SHOPIFY_SHOP}/admin/api/2023-10/products.json?limit=250`;
  let hasNextPage = true;
  while (hasNextPage) {
    const res = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json"
      }
    });
    if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    products = products.concat(data.products);
    const linkHeader = res.headers.get('link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<([^>]+)>; rel="next"/);
      if (match) {
        url = match[1];
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
  }
  return products;
}

function replaceProductsTable(products) {
  const deleteStmt = db.prepare("DELETE FROM products");
  deleteStmt.run();
  const insertStmt = db.prepare(`
    INSERT INTO products (product_id, handle, title, body_html, vendor, tags,  created_at, updated_at, url, smart_collections, img_src, weight, unit, price, total_inventory_qty)
    VALUES (@id, @handle, @title, @body_html, @vendor, @tags,  @created_at, @updated_at, @url, @smart_collections, @img_src, @weight, @unit, @price, @total_inventory_qty)
  `);
  const insertMany = db.transaction((products) => {
    for (const p of products) {
      insertStmt.run({
        id: p.id,
        handle: p.handle,
        title: p.title,
        body_html: p.body_html,
        vendor: p.vendor,
        tags: p.tags,
        created_at: p.created_at,
        updated_at: p.updated_at,
        url: p.url,
        smart_collections: p.smart_collections,
      });
    }
  });
  insertMany(products);
}

export async function syncShopify() {
  const products = await fetchAllShopifyProducts();
  replaceProductsTable(products);
  console.log("Products table updated from Shopify.");
}