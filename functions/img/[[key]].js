// GET /img/*  (catch-all: /img/products/123/abc.jpg тощо)
// Віддає файл з R2-бакета koshyk-img. Бакет не налаштований на
// публічний доступ (custom domain), тому фото проксуються через цю
// функцію. products.image_url зберігає шлях виду /img/{r2_key},
// тож усі місця сайту, що вже читають image_url, працюють без змін.

export async function onRequestGet(context) {
  const { env, params } = context;
  // catch-all [[key]] повертає масив сегментів шляху — з'єднуємо назад у ключ R2
  const key = Array.isArray(params.key) ? params.key.join("/") : params.key;

  const object = await env.koshyk_img.get(key);

  if (!object) {
    return new Response("Зображення не знайдено", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
