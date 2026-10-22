// functions/_lib/catalog-stats.js
// Агрегати каталогу (кількість товарів по категоріях, бренди, мін/макс ціни) раніше
// рахувались на КОЖЕН запит сторінки/API повним скануванням products (~2,5k рядків × кілька
// запитів). Тепер вони живуть одним рядком у catalog_stats_cache і перераховуються
// не частіше ніж раз на STATS_TTL_MS або одразу після імпорту/зміни товарів
// (invalidateCatalogStats). Якщо таблиці ще нема (міграція не застосована) — працює як раніше,
// просто без кешу.

const STATS_TTL_MS = 6 * 60 * 60 * 1000;

export async function getCatalogStats(db) {
  try {
    const row = await db
      .prepare("SELECT value, updated_at FROM catalog_stats_cache WHERE key = 'main'")
      .first();
    if (row && Date.now() - Number(row.updated_at) < STATS_TTL_MS) return JSON.parse(row.value);
  } catch (e) { /* таблиці нема — рахуємо наживо */ }

  const stats = await computeCatalogStats(db);
  try {
    await db
      .prepare(
        "INSERT INTO catalog_stats_cache (key, value, updated_at) VALUES ('main', ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
      )
      .bind(JSON.stringify(stats), Date.now())
      .run();
  } catch (e) { /* не критично */ }
  return stats;
}

export async function invalidateCatalogStats(db) {
  try { await db.prepare("DELETE FROM catalog_stats_cache WHERE key = 'main'").run(); } catch (e) { /* нема таблиці */ }
}

async function computeCatalogStats(db) {
  const [cats, agg, brandRows] = await Promise.all([
    db.prepare("SELECT id, slug, name_uk FROM categories").all(),
    db
      .prepare(
        `SELECT category_id,
                COUNT(*) AS total_count,
                COUNT(CASE WHEN in_stock = 1 THEN 1 END) AS in_stock_count,
                MIN(price) AS price_min, MAX(price) AS price_max,
                MIN(CASE WHEN in_stock = 1 THEN price END) AS stock_min,
                MAX(CASE WHEN in_stock = 1 THEN price END) AS stock_max
         FROM products GROUP BY category_id`
      )
      .all(),
    db
      .prepare(
        "SELECT DISTINCT category_id, brand FROM products WHERE brand IS NOT NULL AND brand != '' ORDER BY brand"
      )
      .all(),
  ]);

  const byCat = new Map((agg.results || []).map((r) => [r.category_id, r]));
  const brands = {};
  (brandRows.results || []).forEach((r) => { (brands[r.category_id] = brands[r.category_id] || []).push(r.brand); });

  let totalInStock = 0, totalAll = 0, minPrice = null, maxPrice = null;
  const categories = (cats.results || []).map((c) => {
    const a = byCat.get(c.id) || {};
    totalInStock += a.in_stock_count || 0;
    totalAll += a.total_count || 0;
    if (a.stock_min != null && (minPrice == null || a.stock_min < minPrice)) minPrice = a.stock_min;
    if (a.stock_max != null && (maxPrice == null || a.stock_max > maxPrice)) maxPrice = a.stock_max;
    return {
      id: c.id, slug: c.slug, name_uk: c.name_uk,
      in_stock_count: a.in_stock_count || 0, total_count: a.total_count || 0,
      price_min: a.price_min == null ? 0 : a.price_min, price_max: a.price_max == null ? 0 : a.price_max,
    };
  });
  categories.sort((x, y) => y.in_stock_count - x.in_stock_count);

  return { categories, brands, totals: { total_in_stock: totalInStock, total_all: totalAll, min_price: minPrice, max_price: maxPrice } };
}
