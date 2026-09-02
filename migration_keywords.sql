-- Міграція: SEO-ключові слова для товару.
-- meta_title/meta_description вже існували в схемі, але не заповнювались.
-- Виконати ОДИН РАЗ:
--   npx wrangler d1 execute koshyk-db --file=migration_keywords.sql --remote

ALTER TABLE product_content ADD COLUMN keywords TEXT;
