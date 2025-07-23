import Database from "better-sqlite3";
import xlsx from "xlsx";

const db = new Database("products.sqlite");

// Ensure table has the required columns
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    product_id TEXT PRIMARY KEY,
    handle,
    title TEXT,
    body_html TEXT,
    vendor TEXT,
    tags TEXT,
    created_at TEXT,
    updated_at TEXT,
    url TEXT,
    smart_collections TEXT,
    img_src TEXT,
    weight REAL,
    unit TEXT,
    price REAL,
    total_inventory_qty INTEGER
  );
`);

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO products (
    product_id, handle, title, body_html, vendor, tags, created_at, updated_at, url,
    smart_collections, img_src, weight, unit, price, total_inventory_qty
  ) VALUES (
    @product_id, @title, @handle, @body_html, @vendor, @tags, @created_at, @updated_at, @url, @smart_collections, @img_src, @weight, @unit, @price, @total_inventory_qty
  )
`);

// Read products.xlsx
const workbook = xlsx.readFile("products.xlsx");
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet);

for (const row of rows) {
  insertStmt.run({
    product_id: row.ID?.toString() || "",
    title: row.Handle || "",
    handle: row.Title || "",
    body_html: row["Body HTML"] || "",
    vendor: row.Vendor || "",
    tags: row.Tags || "",
    created_at: row["Created At"] || "",
    updated_at: row["Updated At"] || "",
    url: row.URL || "",

    total_inventory_qty: row["Total Inventory Qty"] || 0,
    smart_collections: row["Smart Collections"] || "",
    img_src: row['Image Src'] || "",
    weight: row['Variant Weight'] || 0,
    unit: row['Variant Weight Unit'] || "",
    price: row['Variant Price'] || "",
    total_inventory_qty: row["Total Inventory Qty"] || 0
  });
}

console.log(`Imported ${rows.length} products from products.xlsx to SQLite.`);