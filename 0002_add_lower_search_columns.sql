-- Міграція: додає колонки для регістронезалежного пошуку
-- (SQLite LOWER() не працює з кирилицею, тому колонки заповнюються з JS)

ALTER TABLE products ADD COLUMN name_lower TEXT;
ALTER TABLE products ADD COLUMN sku_lower TEXT;

CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products(name_lower);
CREATE INDEX IF NOT EXISTS idx_products_sku_lower ON products(sku_lower);
