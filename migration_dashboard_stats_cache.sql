-- migration_dashboard_stats_cache.sql
-- Кеш дашборд-статистики /admin, щоб не рахувати 8 запитів на кожне відкриття дашборду.
CREATE TABLE IF NOT EXISTS admin_stats_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total INTEGER,
  categories_json TEXT,
  missing_description INTEGER,
  missing_photo INTEGER,
  missing_seo INTEGER,
  missing_keywords INTEGER,
  review_queue INTEGER,
  pending_orders INTEGER,
  pending_reviews INTEGER,
  updated_at INTEGER
);
