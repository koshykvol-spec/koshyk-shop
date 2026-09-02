// POST /admin/api/delete-image — { imageId }
// Видаляє файл з R2 і запис з product_images. Якщо видалене фото було
// головним — автоматично призначає головним наступне за списком
// (або очищає products.image_url, якщо фото не лишилось).

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { imageId } = body;
  if (!imageId) {
    return json({ ok: false, error: "Відсутній imageId" }, 400);
  }

  const image = await env.koshyk_db
    .prepare("SELECT id, product_id, r2_key, is_primary FROM product_images WHERE id = ?")
    .bind(imageId)
    .first();

  if (!image) {
    return json({ ok: false, error: "Зображення не знайдено" }, 404);
  }

  await env.koshyk_img.delete(image.r2_key);
  await env.koshyk_db.prepare("DELETE FROM product_images WHERE id = ?").bind(imageId).run();

  if (image.is_primary) {
    const next = await env.koshyk_db
      .prepare("SELECT id, r2_key FROM product_images WHERE product_id = ? ORDER BY sort_order, id LIMIT 1")
      .bind(image.product_id)
      .first();

    if (next) {
      await env.koshyk_db.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?").bind(next.id).run();
      await env.koshyk_db
        .prepare("UPDATE products SET image_url = ? WHERE id = ?")
        .bind(`/img/${next.r2_key}`, image.product_id)
        .run();
    } else {
      await env.koshyk_db
        .prepare("UPDATE products SET image_url = NULL, has_real_photo = 0 WHERE id = ?")
        .bind(image.product_id)
        .run();
    }
  }

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
