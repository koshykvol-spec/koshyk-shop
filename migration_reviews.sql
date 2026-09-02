-- Міграція: відгуки товарів.
-- Виконати ОДИН РАЗ:
--   npx wrangler d1 execute koshyk-db --file=migration_reviews.sql --remote

CREATE TABLE product_reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    author_name  TEXT NOT NULL,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text         TEXT,
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_product_reviews_product ON product_reviews(product_id);
