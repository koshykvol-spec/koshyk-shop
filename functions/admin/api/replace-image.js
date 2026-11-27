// POST /admin/api/replace-image?imageId=123
// Тіло — сирі байти відредагованого фото (image/jpeg | image/webp | image/png), як в upload-image.
// Замінює файл існуючого фото: новий R2-ключ (бо /img/* віддається з immutable-кешем на рік),
// запис product_images зберігає id і позицію; якщо фото головне — оновлюється products.image_url.
// Старий файл видаляється з R2, якщо на нього більше ніхто не посилається.

const EXT = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/png": "png" };

export async function onRequestPost(context) {
  const { env, request } = context;
  const imageId = new URL(request.url).searchParams.get("imageId");
  if (!imageId) return json({ ok: false, error: "Відсутній imageId" }, 400);

  const type = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return json({ ok: false, error: "Підтримуються лише jpg/webp/png" }, 400);

  const image = await env.koshyk_db
    .prepare("SELECT id, product_id, r2_key, is_primary FROM product_images WHERE id = ?")
    .bind(imageId)
    .first();
  if (!image) return json({ ok: false, error: "Зображення не знайдено" }, 404);

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ ok: false, error: "Порожній файл" }, 400);
  if (bytes.byteLength > 4 * 1024 * 1024) return json({ ok: false, error: "Файл завеликий (>4МБ)" }, 400);

  const r2Key = `products/${image.product_id}/${crypto.randomUUID()}.${ext}`;
  await env.koshyk_img.put(r2Key, bytes, { httpMetadata: { contentType: type } });

  await env.koshyk_db.prepare("UPDATE product_images SET r2_key = ? WHERE id = ?").bind(r2Key, image.id).run();
  if (image.is_primary) {
    await env.koshyk_db
      .prepare("UPDATE products SET image_url = ?, has_real_photo = 1 WHERE id = ?")
      .bind(`/img/${r2Key}`, image.product_id)
      .run();
  }

  if (image.r2_key && image.r2_key !== r2Key) {
    const other = await env.koshyk_db
      .prepare("SELECT COUNT(*) AS n FROM product_images WHERE r2_key = ? AND id <> ?")
      .bind(image.r2_key, image.id)
      .first();
    if (!other || (other.n | 0) === 0) {
      try { await env.koshyk_img.delete(image.r2_key); } catch {}
    }
  }

  return json({ ok: true, imageId: image.id, url: `/img/${r2Key}`, isPrimary: !!image.is_primary });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
