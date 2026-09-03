// POST /admin/api/bulk-stock
// { ids: [1,2,3], inStock: true|false }
// Масова зміна наявності для вибраних товарів (з чекбоксів у таблиці /admin/products).

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { ids, inStock } = body;
  if (!Array.isArray(ids) || !ids.length) {
    return json({ ok: false, error: "Не обрано жодного товару" }, 400);
  }

  const placeholders = ids.map(() => "?").join(",");
  await env.koshyk_db
    .prepare(`UPDATE products SET in_stock = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`)
    .bind(inStock ? 1 : 0, ...ids)
    .run();

  return json({ ok: true, updated: ids.length });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
