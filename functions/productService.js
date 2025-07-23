// productService.js  –  v2 ▪ tailored to your schema
//----------------------------------------------------
import Database from "better-sqlite3";

// open the DB once; keep it cached in memory for the life of the node process
const db = new Database("products.sqlite", {
  /* readonly: true  ← flip on if you never write */
});

/* small helper – wrapper around .all() to keep code DRY
   ----------------------------------------------------------------------------- */
function rows(stmt, params = {}) {
  return stmt.all(params); // -> array of plain JS objects
}

/* Core query helpers your server can call
   ----------------------------------------------------------------------------- */
export function allProducts(limit = 5) {
  const st = db.prepare(`
    SELECT
      product_id,
      handle,
      title,
      smart_collections,
      img_src,
      weight,
      unit,
      price            AS price,     -- show selling price
      total_inventory_qty      AS inventory, -- overall stock
      updated_at
    FROM products
    ORDER BY updated_at DESC
    LIMIT @limit
  `);
  return rows(st, { limit });
}

export function productsByCategory(cat, limit = 5) {
  const key = cat.toLowerCase().replace(/s$/, ""); // “endmills” → “endmill”
  const st = db.prepare(`
    SELECT
      product_id,
      handle,
      title,
      price            AS price,
      img_src,
      total_inventory_qty      AS inventory,
      tags,
      smart_collections
    FROM products
    WHERE lower(smart_collections) LIKE '%' || @cat || '%'
       OR lower(tags)               LIKE '%' || @cat || '%'
    LIMIT @limit
  `);
  const firstPass = rows(st, { cat: key, limit });
  if (firstPass.length) return firstPass;

  // fallback look inside the title
  const alt = db.prepare(`
    SELECT 
        product_id,
        handle,
        title,
        price            AS price,
        img_src,
        total_inventory_qty      AS inventory
    FROM products
    WHERE lower(title) LIKE '%' || @key || '%'
    LIMIT @limit
  `);
  return rows(alt, { key, limit });
}
export function normalise(term) {
  return term.toLowerCase().trim().replace(/s$/, "");
}
export function productsByNameLike(q, limit = 5) {
  const st = db.prepare(`
    SELECT
      product_id,
      handle,
      title,
      price            AS price,
      img_src,
      total_inventory_qty      AS inventory
    FROM products
    WHERE REPLACE(REPLACE(LOWER(title), '-', ''), ' ', '') LIKE '%' || @q || '%'
    LIMIT @limit
  `);
  return rows(st, { q, limit });
}

export function productBySKU(sku) {
  const st = db.prepare(`
    SELECT
      *                        -- grab every column: variant_weight, per-location stock, etc.
    FROM products
    WHERE variant_sku = @sku
    LIMIT 1
  `);
  return st.get({ sku });
}

/* (optional)  Fine-grained stock check across your two locations
   -----------------------------------------------------------------
   Sometimes a bot response needs: “2 pcs on 1st floor, 5 pcs on 3rd floor”.
   This helper returns a compact breakdown.
*/
export function stockBreakdownById(id) {
  const st = db.prepare(`
    SELECT
      inventory_available_1st_floor_r3      AS floor1,
      inventory_available_3rd_floor         AS floor3,
      inventory_available_adjust_1st_floor_r3 AS adjFloor1,
      inventory_available_adjust_3rd_floor  AS adjFloor3
    FROM products
    WHERE product_id = @id
    LIMIT 1
  `);
  return st.get({ id });
}

export function productsByAnyField(lookup) {
  return db.prepare(
    `SELECT * FROM products WHERE title LIKE ? OR smart_collections LIKE ? OR tags LIKE ?`
  ).all(`%${lookup}%`, `%${lookup}%`, `%${lookup}%`);
}
export function testBoringBarsQuery() {
  const st = db.prepare(`
    SELECT * FROM products
    WHERE title LIKE '%HOLDERS-Boring-Bars%'
       OR smart_collections LIKE '%HOLDERS-Boring-Bars%'
       OR tags LIKE '%HOLDERS-Boring-Bars%'
  `);
  const results = st.all();
  console.log("Test Query Results:", results);
  return results;
}

export function FilteredProductListQuery(lookup, lookupProductname, lookupProductprice, lookupProductpriceFrom, lookupProductpriceTo) {
  let sql = `
    SELECT
      product_id, handle, title, body_html, vendor, tags, created_at, updated_at, url,
      smart_collections, img_src, weight, unit, price, total_inventory_qty
    FROM products
    WHERE 1=1
  `;
  const params = {};

  // If lookupProductname is provided, use it for filtering (by tag or title)
  if (lookupProductname) {
    sql += " AND (lower(tags) LIKE '%' || @lookupProductname || '%' OR lower(title) LIKE '%' || @lookupProductname || '%')";
    params.lookupProductname = lookupProductname.toLowerCase();
  } else if (lookup) {
    sql += " AND (lower(tags) LIKE '%' || @lookup || '%' OR lower(title) LIKE '%' || @lookup || '%')";
    params.lookup = lookup.toLowerCase();
  }

  // Price filtering logic
  if (lookupProductpriceFrom && lookupProductpriceTo) {
    sql += " AND price >= @priceFrom AND price <= @priceTo";
    params.priceFrom = Number(lookupProductpriceFrom);
    params.priceTo = Number(lookupProductpriceTo);
  } else if (lookupProductpriceFrom) {
    sql += " AND price >= @priceFrom";
    params.priceFrom = Number(lookupProductpriceFrom);
  } else if (lookupProductpriceTo) {
    sql += " AND price <= @priceTo";
    params.priceTo = Number(lookupProductpriceTo);
  } else if (lookupProductprice) {
    sql += " AND price = @price";
    params.price = Number(lookupProductprice);
  }

  sql += " ORDER BY price ASC";

  const st = db.prepare(sql);
  return st.all(params);
}

// New: Run a raw SQL query for product search/filter
export function FilteredProductListQueryFromSQL(sql_query) {
  // Only allow SELECT queries for safety
  if (!/^\s*select\s+/i.test(sql_query)) {
    throw new Error("Only SELECT queries are allowed.");
  }
  // Optionally, add more validation here to prevent dangerous queries
  const st = db.prepare(sql_query);
  return st.all();
}

// testBoringBarsQuery();