// POST /admin/api/import1c-validate
// Тіло: сирий JSON-масив products.json з 1С.
// Перевіряє структуру БЕЗ запису в базу: обов'язкові поля, дублі SKU
// всередині файлу, категорії, яких немає в нашій таблиці categories.

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

export async function onRequestPost(context) {
  const { request } = context;

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

  const seenSkus = new Set();
  const duplicateSkus = [];
  const unmatchedCategoriesSet = new Set();
  const categoryCounts = {};
  let invalidCount = 0;

  for (const item of data) {
    const sku = item.sku;
    const name = item.n;
    const price = item.p;
    const category = item.c;

    if (!sku || !name || price === undefined || price === null) {
      invalidCount++;
      continue;
    }
    if (seenSkus.has(sku)) {
      duplicateSkus.push(sku);
    }
    seenSkus.add(sku);

    if (!normalizeCategory(category)) {
      unmatchedCategoriesSet.add(category);
    } else {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
  }

  return json({
    ok: true,
    total: data.length,
    categoryCounts,
    duplicateSkus,
    unmatchedCategories: Array.from(unmatchedCategoriesSet),
    invalidCount,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
