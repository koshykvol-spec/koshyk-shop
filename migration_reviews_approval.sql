-- Міграція: черга схвалення відгуків.
-- Новий відгук за замовчуванням approved=0 (очікує модерації) —
-- на сайті показуються лише approved=1.
-- Виконати ОДИН РАЗ:
--   npx wrangler d1 execute koshyk-db --file=migration_reviews_approval.sql --remote

ALTER TABLE product_reviews ADD COLUMN approved INTEGER DEFAULT 0;
