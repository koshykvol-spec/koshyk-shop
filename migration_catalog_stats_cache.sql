-- Кеш агрегатів каталогу (див. functions/_lib/catalog-stats.js) + індекси для листингу категорій.
CREATE TABLE IF NOT EXISTS catalog_stats_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Листинг категорії: WHERE category_id=? ORDER BY name/price LIMIT 24 — читає ~24 рядки замість всієї категорії.
CREATE INDEX IF NOT EXISTS idx_products_cat_name ON products(category_id, name);
CREATE INDEX IF NOT EXISTS idx_products_cat_price ON products(category_id, price);
