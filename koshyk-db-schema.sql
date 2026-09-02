-- ============================================================
-- Схема бази даних D1 для kosyk.pp.ua ("Ощадний Кошик")
-- За аналогією з AGRO3 (agronom.pp.ua), адаптовано під асортимент:
-- КАНЦТОВАРИ, ГОСПОДАРЧІ ТОВАРИ, ІГРАШКИ, ОДЯГ, ХІМІЯ, БІЖУТЕРІЯ, ВЗУТТЯ
-- SQLite-діалект (сумісний з Cloudflare D1)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Категорії
-- ------------------------------------------------------------
CREATE TABLE categories (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT NOT NULL UNIQUE,      -- 'kanctovary', 'gospodarchi-tovary', ...
    name_uk       TEXT NOT NULL,             -- 'Канцтовари'
    parent_id     INTEGER REFERENCES categories(id),
    sort_order    INTEGER DEFAULT 0,
    icon          TEXT,                      -- назва іконки/emoji для UI
    is_active     INTEGER DEFAULT 1,         -- 0/1
    created_at    TEXT DEFAULT (datetime('now'))
);

-- Стартові 7 категорій з вивантаження
INSERT INTO categories (slug, name_uk, sort_order) VALUES
    ('kanctovary',        'Канцтовари',        1),
    ('gospodarchi',       'Господарчі товари', 2),
    ('igrashky',          'Іграшки',           3),
    ('odyah',             'Одяг',              4),
    ('himiya',            'Хімія',             5),
    ('bizhuteriya',       'Біжутерія',         6),
    ('vzuttya',           'Взуття',            7);

-- ------------------------------------------------------------
-- 2. Товари (основна таблиця, аналог products у AGRO3)
-- ------------------------------------------------------------
CREATE TABLE products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sku           TEXT NOT NULL UNIQUE,      -- '00-00001338', 'РТ-00012105', 'KO-...'
    sku_source    TEXT,                      -- '00' | 'РТ' | 'KO' — джерело 1С-вивантаження, для трасування дублів/розбіжностей
    name          TEXT NOT NULL,
    slug          TEXT UNIQUE,               -- для SEO-URL, генерується з name+sku
    price         REAL NOT NULL,
    category_id   INTEGER NOT NULL REFERENCES categories(id),
    brand         TEXT,                      -- може бути порожній ('b' у вивантаженні)
    in_stock      INTEGER DEFAULT 1,
    image_url     TEXT,                      -- заповнюється пізніше; поки NULL -> плейсхолдер за категорією на фронті
    has_real_photo INTEGER DEFAULT 0,        -- прапорець: 0 = показуємо плейсхолдер категорії, 1 = реальне фото
    source_updated_at TEXT,                  -- updated_at з 1С-вивантаження
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_in_stock ON products(in_stock);
CREATE INDEX idx_products_sku_source ON products(sku_source);

-- ------------------------------------------------------------
-- 3. Розширені атрибути товару (аналог product_content у AGRO3)
-- Гнучке JSON-поле — критично для ОДЯГ/ВЗУТТЯ, де розмір і стать
-- "зашиті" в назву товару неструктуровано (напр. "Майка для хлопчика 60 (104-110)")
-- ------------------------------------------------------------
CREATE TABLE product_content (
    product_id      INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    description     TEXT,                    -- розгорнутий опис (заповнюється поступово, як у AGRO3)
    attributes_json TEXT,                    -- JSON: {"size": "56 (92-98)", "gender": "хлопчик", "age_group": "дитячий"} тощо
    divisible       INTEGER DEFAULT 0,       -- на випадок вагового/поштучного продажу (напр. канцтовари вроздріб)
    division_step   REAL DEFAULT 1,
    meta_title      TEXT,
    meta_description TEXT,
    seo_updated_at  TEXT
);

-- ------------------------------------------------------------
-- 4. Замовлення
-- ------------------------------------------------------------
CREATE TABLE orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number    TEXT NOT NULL UNIQUE,    -- людський номер замовлення
    customer_name   TEXT,
    customer_phone  TEXT,
    customer_note   TEXT,
    delivery_method TEXT,                    -- 'pickup' | 'nova_poshta' | ...
    delivery_address TEXT,
    status          TEXT DEFAULT 'new',      -- new, confirmed, shipped, done, cancelled
    total_amount    REAL NOT NULL,
    telegram_sent   INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products(id),
    sku          TEXT NOT NULL,               -- знімок sku на момент замовлення
    name         TEXT NOT NULL,               -- знімок назви на момент замовлення
    price        REAL NOT NULL,               -- знімок ціни на момент замовлення
    quantity     REAL NOT NULL DEFAULT 1
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ------------------------------------------------------------
-- 5. Налаштування сайту (ключі API, конфіг — як у AGRO3 site_settings)
-- ------------------------------------------------------------
CREATE TABLE site_settings (
    key          TEXT PRIMARY KEY,
    value        TEXT,
    updated_at   TEXT DEFAULT (datetime('now'))
);

-- Приклади ключів (заповнюються при налаштуванні):
-- 'telegram_bot_token', 'telegram_chat_id', 'store_phone', 'store_address'

-- ------------------------------------------------------------
-- 6. Лог пошукових запитів (аналітика, як у AGRO3 search_logs)
-- ------------------------------------------------------------
CREATE TABLE search_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    query        TEXT NOT NULL,
    results_count INTEGER,
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_search_logs_query ON search_logs(query);
CREATE INDEX idx_search_logs_created ON search_logs(created_at);

-- ------------------------------------------------------------
-- 7. Синоніми пошуку (для folding кирилиці, як у AGRO3)
-- ------------------------------------------------------------
CREATE TABLE search_synonyms (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    term         TEXT NOT NULL,               -- напр. 'гумка'
    synonym      TEXT NOT NULL,                -- напр. 'резинка для волосся'
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_search_synonyms_term ON search_synonyms(term);

-- ------------------------------------------------------------
-- 8. Плейсхолдери зображень по категоріях (тимчасове рішення,
-- поки немає реальних фото товарів)
-- ------------------------------------------------------------
CREATE TABLE category_placeholders (
    category_id  INTEGER PRIMARY KEY REFERENCES categories(id),
    placeholder_image_url TEXT NOT NULL
);
