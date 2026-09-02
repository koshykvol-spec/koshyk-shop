// POST /admin/api/import1c-commit
// Тіло: сирий JSON-масив products.json з 1С.
//
// Стратегія "немає в наявності" реалізована у два кроки, щоб уникнути
// величезного SQL NOT IN (...) на 2000+ sku:
//   1. Одним UPDATE позначаємо УСІ товари in_stock = 0.
//   2. Кожен товар з файлу піднімає себе назад до in_stock = 1
//      (заразом оновлюючи ціну/назву/бренд, або створюючись як новий).
// Товари, яких у файлі не було, так і лишаються in_stock = 0.
//
// НЕ чіпається при оновленні існуючих товарів: image_url,
// has_real_photo, product_content (опис/SEO/атрибути) — це окрема
// відповідальність (адмінка товарів / масові дії / annotations).
//
// name_lower/sku_lower: окремі lowercase-колонки для регістронезалежного
// пошуку (SQLite LIKE/LOWER() не розпізнають кирилицю). При UPDATE
// існуючого товару sku не змінюється — оновлюємо лише name_lower.
// При INSERT нового товару записуємо обидві колонки.

const CATEGORY_MAP = {
  "КАНЦТОВАРИ": "kanctovary",
  "ГОСПОДАРЧІ ТОВАРИ": "gospodarchi",
  "ІГРАШКИ": "igrashky",
  "ОДЯГ": "odyah",
  "ХІМІЯ": "himiya",
  "БІЖУТЕРІЯ": "bizhuteriya",
  "ВЗУТТЯ": "vzuttya",
};

function normalizeCategory(raw) {
  if (!raw) return null;
  const key = raw.trim().toUpperCase();
  return CATEGORY_MAP[key] || null;
}

const TRANSLIT_MAP = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
  з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", "'": "",
};

function transliterate(text) {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT_MAP ? TRANSLIT_MAP[ch] : ch))
    .join("");
}

function makeSlug(name, sku) {
  let slug = transliterate(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-+$/g, "");
  const skuSuffix = sku.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `${slug}-${skuSuffix}`;
}

const BATCH_SIZE = 50;

export async function onRequestPost(context) {
  const { env, request } = context;

  let data;
  try {
    const text = await request.text();
    data = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "Файл не є коректним JSON" }, 400);
  }
  if (!Array.isArray(data)) {
    return json({ ok: false, error: "Очікується масив товарів у корені JSON" }, 400);
  }

  const { results: categories } = await env.koshyk_db.prepare("SELECT id, slug FROM categories").all();
  const categoryIdBySlug = {};
  categories.forEach((c) => { categoryIdBySlug[c.slug] = c.id; });

  // Крок 1: усі товари тимчасово "немає в наявності"
  await env.koshyk_db.prepare("UPDATE products SET in_stock = 0").run();

  // Крок 2: існуючі SKU — для розрізнення UPDATE/INSERT одним запитом,
  // а не 2000 окремих SELECT
  const { results: existingRows } = await env.koshyk_db.prepare("SELECT id, sku FROM products").all();
  const existingIdBySku = {};
  existingRows.forEach((r) => { existingIdBySku[r.sku] = r.id; });

  const statements = [];
  let updated = 0;
  let added = 0;
  let skippedInvalid = 0;
  const skippedSamples = [];
  const unmatchedCategoriesSet = new Set();

  for (const item of data) {
    const sku = item.sku;
    const name = item.n;
    const price = item.p;
    const rawCategory = item.c;
    const categorySlug = normalizeCategory(rawCategory);
    const brand = item.b || null;
    const updatedAt = item.updated_at || null;
    // ВАЖЛИВО: товар може бути присутній у файлі, але позначений
    // 1С як тимчасово відсутній (inStock: false) — раніше це поле
    // повністю ігнорувалось, і такий товар однаково ставав in_stock=1.
    const inStockValue = item.inStock === false ? 0 : 1;

    if (!sku || !name || price === undefined || price === null || !categorySlug) {
      skippedInvalid++;
      if (rawCategory && !categorySlug) unmatchedCategoriesSet.add(rawCategory);
      if (skippedSamples.length < 15) {
        skippedSamples.push({ sku: sku || "(без sku)", name: name || "(без назви)", category: rawCategory || "(без категорії)" });
      }
      continue;
    }
    const categoryId = categoryIdBySlug[categorySlug];
    if (!categoryId) {
      skippedInvalid++;
      continue;
    }

    const existingId = existingIdBySku[sku];
    if (existingId) {
      statements.push(
        env.koshyk_db
          .prepare(
            `UPDATE products SET name = ?, name_lower = ?, price = ?, brand = ?, in_stock = ?,
             source_updated_at = ?, updated_at = datetime('now') WHERE id = ?`
          )
          .bind(name, name.toLowerCase(), price, brand, inStockValue, updatedAt, existingId)
      );
      updated++;
    } else {
      const skuSourceMatch = sku.match(/^([А-ЯA-Z]+)-/);
      const skuSource = skuSourceMatch ? skuSourceMatch[1] : null;
      const slug = makeSlug(name, sku);
      statements.push(
        env.koshyk_db
          .prepare(
            `INSERT INTO products (sku, sku_source, sku_lower, name, name_lower, slug, price, category_id, brand,
             in_stock, has_real_photo, source_updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
          )
          .bind(sku, skuSource, sku.toLowerCase(), name, name.toLowerCase(), slug, price, categoryId, brand, inStockValue, updatedAt)
      );
      added++;
    }
  }

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await env.koshyk_db.batch(statements.slice(i, i + BATCH_SIZE));
  }

  const outOfStockRow = await env.koshyk_db
    .prepare("SELECT COUNT(*) as cnt FROM products WHERE in_stock = 0")
    .first();

  return json({
    ok: true,
    total: data.length,
    updated,
    added,
    skippedInvalid,
    skippedSamples,
    unmatchedCategories: Array.from(unmatchedCategoriesSet),
    markedOutOfStock: outOfStockRow ? outOfStockRow.cnt : 0,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
