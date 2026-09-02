// POST /admin/api/product-update
// { id, name, price, brand, imageUrl, hasRealPhoto, description }
//
// name_lower оновлюється разом з name для регістронезалежного пошуку
// (кирилиця не приводиться до нижнього регістру через SQL LOWER()).
// sku тут не редагується, тому sku_lower не чіпаємо.

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { id, name, price, brand, description, metaTitle, metaDescription, keywords } = body;
  if (!id || !name || isNaN(price)) {
    return json({ ok: false, error: "Заповніть назву і коректну ціну" }, 400);
  }

  await env.koshyk_db
    .prepare(
      `UPDATE products SET name = ?, name_lower = ?, price = ?, brand = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(name, name.toLowerCase(), price, brand || null, id)
    .run();

  // product_content могло не існувати (створювалось тільки для одягу/взуття
  // при імпорті) — тут страхуємось upsert-ом.
  await env.koshyk_db
    .prepare(
      `INSERT INTO product_content (product_id, description, meta_title, meta_description, keywords, seo_updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(product_id) DO UPDATE SET
         description = excluded.description,
         meta_title = excluded.meta_title,
         meta_description = excluded.meta_description,
         keywords = excluded.keywords,
         seo_updated_at = datetime('now')`
    )
    .bind(id, description || null, metaTitle || null, metaDescription || null, keywords || null)
    .run();

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
