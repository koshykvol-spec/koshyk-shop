// POST /admin/api/brands-preview
// { category, brands: ["Axent", "Old Spice|Old Spise", ...], onlyEmpty }
//
// Формат запису бренду: "Основна назва|аліас1|аліас2".
// Шукаємо будь-який із варіантів, а в результат пишемо основну назву.
//
// Матчинг: для кожного бренду шукаємо його як ОКРЕМЕ слово в назві
// (не підрядок будь-де — інакше "Piano" зловить "Pianoforte" тощо).
// Межа слова визначена вручну (не \b), бо \b в JS не працює коректно
// на межі кирилиця/латиниця — саме такий випадок тут типовий
// ("Бейдж Axent (4501)").

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { category, brands, onlyEmpty } = body;
  if (!Array.isArray(brands) || !brands.length) {
    return json({ ok: false, error: "Відсутній список брендів" }, 400);
  }

  const where = [];
  const bindings = [];
  if (category) {
    where.push("c.slug = ?");
    bindings.push(category);
  }
  if (onlyEmpty) {
    where.push("(p.brand IS NULL OR p.brand = '')");
  }
  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

  const { results: products } = await env.koshyk_db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.brand
       FROM products p JOIN categories c ON c.id = p.category_id
       ${whereClause}`
    )
    .bind(...bindings)
    .all();

  const BOUND = "[^A-Za-zА-Яа-яІіЇїЄєҐґ0-9]";

  const patterns = brands.map((entry) => {
    // "Old Spice|Old Spise" → canonical = "Old Spice", варіанти = обидва
    const variants = String(entry)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const canonical = variants[0];

    const alt = variants
      .map((v) =>
        // необов'язковий пробіл між цифрою і буквою: "4Office" ловить і "4 Office"
        escapeRegex(v).replace(/(\d)([A-Za-z])/g, "$1\\s?$2")
      )
      .join("|");

    return {
      brand: canonical,
      regex: new RegExp(`(^|${BOUND})(?:${alt})(${BOUND}|$)`, "i"),
    };
  });

  const rows = [];
  for (const p of products) {
    for (const { brand, regex } of patterns) {
      if (regex.test(p.name)) {
        rows.push({
          productId: p.id,
          sku: p.sku,
          name: p.name,
          currentBrand: p.brand || "",
          matchedBrand: brand,
          willUpdate: true,
        });
        break; // перший бренд, що збігся — далі не перевіряємо цей товар
      }
    }
  }

  return json({ ok: true, matched: rows.length, scanned: products.length, rows });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
