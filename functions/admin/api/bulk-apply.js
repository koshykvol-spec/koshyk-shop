// POST /admin/api/bulk-apply
// { category, missingOnly, templates: { description } }
// Пише лише product_content.description (+ seo_updated_at): meta_title/meta_description/keywords сайт не читає.
//
// Підстановки в шаблонах: {name} {brand} {category} {price} {sku}.
// Порожній {brand} прибирається разом із зайвим пробілом навколо нього.
//
// Виконується батчами через env.koshyk_db.batch() — це один
// мережевий round-trip на батч замість 2030 окремих запитів,
// критично для товарів, яких у категорії "Канцтовари" аж 642.

const BATCH_SIZE = 50;

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { category, missingOnly, templates } = body;
  if (!templates || typeof templates !== "object") {
    return json({ ok: false, error: "Відсутні шаблони" }, 400);
  }
  // Порожній шаблон дав би NULL і стер би наявні описи (особливо без «тільки без опису»).
  if (!String(templates.description || "").trim()) {
    return json({ ok: false, error: "Шаблон опису порожній" }, 400);
  }

  const where = [];
  const bindings = [];
  if (category) {
    where.push("c.slug = ?");
    bindings.push(category);
  }
  if (missingOnly) {
    where.push("(pc.description IS NULL OR pc.description = '')");
  }
  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

  const { results: products } = await env.koshyk_db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.price, p.brand, c.name_uk as category_name
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_content pc ON pc.product_id = p.id
       ${whereClause}`
    )
    .bind(...bindings)
    .all();

  if (!products.length) {
    return json({ ok: true, updated: 0 });
  }

  const statements = products.map((p) => {
    const vars = {
      name: p.name,
      brand: p.brand || "",
      category: p.category_name,
      price: Number(p.price).toFixed(2),
      sku: p.sku,
    };
    const description = fillTemplate(templates.description, vars);

    return env.koshyk_db
      .prepare(
        `INSERT INTO product_content (product_id, description, seo_updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(product_id) DO UPDATE SET
           description = excluded.description,
           seo_updated_at = datetime('now')`
      )
      .bind(p.id, description);
  });

  let updated = 0;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    await env.koshyk_db.batch(chunk);
    updated += chunk.length;
  }

  return json({ ok: true, updated });
}

function fillTemplate(template, vars) {
  if (!template) return null;

  let working = template;

  // Якщо бренду немає — прибираємо всю фразу "від {brand}" разом зі
  // словом "від", а не тільки саму підстановку (інакше лишається
  // граматично зламане "Товар від у категорії...").
  if (!vars.brand) {
    working = working.replace(/\s*від\s*\{brand\}/gi, "");
  }

  let result = working
    .replace(/\{name\}/g, vars.name)
    .replace(/\{brand\}/g, vars.brand)
    .replace(/\{category\}/g, vars.category)
    .replace(/\{price\}/g, vars.price)
    .replace(/\{sku\}/g, vars.sku);

  // залишкове прибирання подвійних пробілів від будь-яких інших
  // випадків порожніх підстановок у довільних шаблонах користувача
  result = result.replace(/\s{2,}/g, " ").trim();
  return result;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
