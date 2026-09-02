-- Міграція: множинні зображення товару.
-- Раніше products.image_url зберігав лише одне посилання — тепер це
-- "кешоване" посилання на ГОЛОВНЕ фото, а повний список живе тут.
-- Виконати ОДИН РАЗ:
--   npx wrangler d1 execute koshyk-db --file=migration_product_images.sql --remote

CREATE TABLE product_images (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    r2_key       TEXT NOT NULL,          -- ключ у R2-бакеті koshyk-img
    is_primary   INTEGER DEFAULT 0,      -- 0/1 — яке фото показувати як головне
    sort_order   INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_product_images_product ON product_images(product_id);
