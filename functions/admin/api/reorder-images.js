// POST /admin/api/reorder-images
// { productId: 123, order: ["5", "3", "7"] }
// Зберігає новий порядок фото товару (sort_order) після перетягування в галереї.
// Не чіпає is_primary — головне фото лишається тим, яке позначене окремою кнопкою
// "Зробити головним" (галерея завжди показує його першим, незалежно від sort_order).

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { productId, order } = body;
  if (!productId || !Array.isArray(order) || !order.length) {
    return json({ ok: false, error: "Відсутні productId або order" }, 400);
  }

  const stmts = order.map((imageId, index) =>
    env.koshyk_db
      .prepare(`UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?`)
      .bind(index, imageId, productId)
  );
  await env.koshyk_db.batch(stmts);

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
