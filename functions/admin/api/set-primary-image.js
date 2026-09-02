// POST /admin/api/set-primary-image — { productId, imageId }

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { productId, imageId } = body;
  if (!productId || !imageId) {
    return json({ ok: false, error: "Відсутні параметри" }, 400);
  }

  const image = await env.koshyk_db
    .prepare("SELECT r2_key FROM product_images WHERE id = ? AND product_id = ?")
    .bind(imageId, productId)
    .first();

  if (!image) {
    return json({ ok: false, error: "Зображення не знайдено" }, 404);
  }

  await env.koshyk_db
    .prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?")
    .bind(productId)
    .run();
  await env.koshyk_db
    .prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?")
    .bind(imageId)
    .run();
  await env.koshyk_db
    .prepare("UPDATE products SET image_url = ?, has_real_photo = 1 WHERE id = ?")
    .bind(`/img/${image.r2_key}`, productId)
    .run();

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
