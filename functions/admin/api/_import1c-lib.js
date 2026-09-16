// functions/admin/api/_import1c-lib.js
// Спільна логіка для import1c-validate.js (dryrun, нічого не пише) і
// import1c-commit.js (реальний запис). Обидва викликають buildDiff() —
// це гарантує, що прогноз і факт рахуються ОДНИМ кодом і не розходяться.

export const CATEGORY_MAP = {
  "КАНЦТОВАРИ": "kanctovary",
  "ГОСПОДАРЧІ ТОВАРИ": "gospodarchi",
  "ІГРАШКИ": "igrashky",
  "ОДЯГ": "odyah",
  "ХІМІЯ": "himiya",
  "БІЖУТЕРІЯ": "bizhuteriya",
  "ВЗУТТЯ": "vzuttya",
};

export function normalizeCategory(raw) {
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

export function makeSlug(name, sku) {
  let slug = transliterate(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-+$/g, "");
  const skuSuffix = sku.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `${slug}-${skuSuffix}`;
}

/**
 * Рахує повний diff файлу 1С проти поточного D1, без жодного запису.
 * commit.js потім або виконує statements (реальний імпорт), або їх ігнорує (dry).
 *
 * @param {Array}  data  розпарсений products.json
 * @param {D1Database} db  env.koshyk_db
 * @returns {Promise<{ok:true, report:object, statements:Array}> | {ok:false, error:string}}
 */
export async function buildDiff(data, db) {
  if (!Array.isArray(data)) {
    return { ok: false, error: "Очікується масив товарів у корені JSON" };
  }

  const { results: categories } = await db.prepare("SELECT id, slug FROM categories").all();
  const categoryIdBySlug = {};
  categories.forEach((c) => { categoryIdBySlug[c.slug] = c.id; });

  // Стан ДО будь-яких змін — і для preview, і для commit це те саме джерело правди
  const { results: existingRows } = await db
    .prepare("SELECT id, sku, name, price, category_id, brand, in_stock FROM products")
    .all();
  const existingBySku = {};
  const skuOccurrences = {};
  existingRows.forEach((r) => {
    existingBySku[r.sku] = r;
    (skuOccurrences[r.sku] = skuOccurrences[r.sku] || []).push(r);
  });
  const categorySlugById = {};
  categories.forEach((c) => { categorySlugById[c.id] = c.slug; });

  const fileSkus = new Set();
  const seenInFile = new Set();

  const statements = [];
  let updated = 0;
  let added = 0;
  let skippedInvalid = 0;
  const skippedSamples = [];
  const unmatchedCategoriesSet = new Set();
  const duplicateSkusInFile = [];

  const createdList = [];
  const backInStock = [];
  const wentUnavailableInFile = [];
  const priceChanges = [];
  const moved = [];

  for (const item of data) {
    const sku = item.sku;
    const name = item.n;
    const price = item.p;
    const rawCategory = item.c;
    const categorySlug = normalizeCategory(rawCategory);
    const brand = item.b || null;
    const updatedAt = item.updated_at || null;
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

    if (sku) {
      if (seenInFile.has(sku)) duplicateSkusInFile.push(sku);
      seenInFile.add(sku);
    }
    fileSkus.add(sku);

    const existing = existingBySku[sku];
    if (existing) {
      if (existing.in_stock === 0 && inStockValue === 1) {
        backInStock.push({ sku, name });
      }
      if (inStockValue === 0 && item.inStock === false) {
        wentUnavailableInFile.push({ sku, name, alreadyInactive: existing.in_stock === 0 });
      }
      if (Number(existing.price) !== Number(price)) {
        priceChanges.push({ sku, name, old: Number(existing.price), neu: Number(price) });
      }
      const oldCatSlug = categorySlugById[existing.category_id] || null;
      if (oldCatSlug !== categorySlug || (existing.brand || null) !== brand) {
        moved.push({ sku, name, oldC: oldCatSlug || "—", newC: categorySlug, oldB: existing.brand || "—", newB: brand || "—" });
      }
      statements.push({
        sql: `UPDATE products SET name = ?, name_lower = ?, price = ?, brand = ?, category_id = ?, in_stock = ?,
              source_updated_at = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [name, name.toLowerCase(), price, brand, categoryId, inStockValue, updatedAt, existing.id],
      });
      updated++;
    } else {
      const skuSourceMatch = sku.match(/^([А-ЯA-Z]+)-/);
      const skuSource = skuSourceMatch ? skuSourceMatch[1] : null;
      const slug = makeSlug(name, sku);
      statements.push({
        sql: `INSERT INTO products (sku, sku_source, sku_lower, name, name_lower, slug, price, category_id, brand,
              in_stock, has_real_photo, source_updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        args: [sku, skuSource, sku.toLowerCase(), name, name.toLowerCase(), slug, price, categoryId, brand, inStockValue, updatedAt],
      });
      createdList.push({ sku, name, category: categorySlug });
      added++;
      if (inStockValue === 0 && item.inStock === false) {
        wentUnavailableInFile.push({ sku, name, alreadyInactive: false });
      }
    }
  }

  const disappeared = existingRows
    .filter((r) => !fileSkus.has(r.sku))
    .map((r) => ({ sku: r.sku, name: r.name, alreadyInactive: r.in_stock === 0 }));
  const disappearedNewCount = disappeared.filter((r) => !r.alreadyInactive).length;
  const wentUnavailableNewCount = wentUnavailableInFile.filter((r) => !r.alreadyInactive).length;

  // Оцінка "немає в наявності" після імпорту — рахується без запису в БД:
  // усе, що зникло з файлу (фаза 1 занулить) + усе, що в файлі явно inStock:false
  const inFileZeroCount = data.reduce((acc, item) => {
    if (!item || !item.sku) return acc;
    return acc + (item.inStock === false ? 1 : 0);
  }, 0);

  const dupSkus = Object.entries(skuOccurrences)
    .filter(([, rows]) => rows.length > 1)
    .map(([sku, rows]) => ({ sku, names: rows.map((r) => r.name) }));

  const cap = (arr, n) => ({ total: arr.length, sample: arr.slice(0, n) });

  return {
    ok: true,
    statements,
    report: {
      total: data.length,
      updated,
      added,
      skippedInvalid,
      skippedSamples,
      unmatchedCategories: Array.from(unmatchedCategoriesSet),
      duplicateSkusInFile: Array.from(new Set(duplicateSkusInFile)),
      markedOutOfStock: disappeared.length + inFileZeroCount,
      created: cap(createdList, 300),
      backInStock: cap(backInStock, 300),
      priceChanges: cap(priceChanges, 300),
      moved: cap(moved, 200),
      disappeared: cap(disappeared, 300),
      disappearedNewCount,
      wentUnavailableInFile: cap(wentUnavailableInFile, 300),
      wentUnavailableNewCount,
      dupSkus: cap(dupSkus, 50),
    },
  };
}
