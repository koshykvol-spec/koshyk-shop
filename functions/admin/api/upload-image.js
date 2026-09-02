// POST /admin/api/upload-image?productId=123&filename=photo.jpg
// Тіло запиту — сирі байти файлу (стиснутого на клієнті перед відправкою).
// Клієнт відповідає за компресію (canvas), сервер тільки зберігає в R2
// і реєструє запис у product_images.

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  const filename = url.searchParams.get("filename") || "photo.jpg";

  if (!productId) {
    return json({ ok: false, error: "Відсутній productId" }, 400);
  }

  const product = await env.koshyk_db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) {
    return json({ ok: false, error: "Товар не знайдено" }, 404);
  }

  const ext = (filename.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const uuid = crypto.randomUUID();
  const r2Key = `products/${productId}/${uuid}.${ext}`;

  const contentType = request.headers.get("Content-Type") || "image/jpeg";
  const bytes = await request.arrayBuffer();

  if (bytes.byteLength === 0) {
    return json({ ok: false, error: "Порожній файл" }, 400);
  }
  // М'яке обмеження — клієнт стискає перед відправкою, це підстраховка
  // від надто великих файлів, що не пройшли компресію.
  if (bytes.byteLength > 4 * 1024 * 1024) {
    return json({ ok: false, error: "Файл завеликий (>4МБ) навіть після стиснення" }, 400);
  }

  await env.koshyk_img.put(r2Key, bytes, { httpMetadata: { contentType } });

  // Чи є в товару вже якесь фото? Якщо ні — це автоматично стає головним.
  const existingCount = await env.koshyk_db
    .prepare("SELECT COUNT(*) as cnt FROM product_images WHERE product_id = ?")
    .bind(productId)
    .first();
  const isFirst = !existingCount || existingCount.cnt === 0;

  const insertResult = await env.koshyk_db
    .prepare("INSERT INTO product_images (product_id, r2_key, is_primary) VALUES (?, ?, ?)")
    .bind(productId, r2Key, isFirst ? 1 : 0)
    .run();

  if (isFirst) {
    await env.koshyk_db
      .prepare("UPDATE products SET image_url = ?, has_real_photo = 1 WHERE id = ?")
      .bind(`/img/${r2Key}`, productId)
      .run();
  }

  return json({
    ok: true,
    imageId: insertResult.meta.last_row_id,
    url: `/img/${r2Key}`,
    isPrimary: !!isFirst,
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
