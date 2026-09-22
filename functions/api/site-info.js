// GET /api/site-info
// Публічний ендпоінт для футера сайту (розділи "Про нас"/"Контакти").
// ВАЖЛИВО: віддає тільки безпечні для публікації ключі з site_settings.
// telegram_bot_token/telegram_chat_id сюди НІКОЛИ не потрапляють —
// явний allowlist, а не "всі ключі мінус секретні", щоб новий secret-
// ключ, доданий пізніше в settings.js, не витік сюди за замовчуванням.
//
// Головна сторінка (functions/index.js) більше НЕ викликає цей
// ендпоінт — вона читає ті самі налаштування напряму з D1 при
// серверному рендері. Ендпоінт лишається як самостійний публічний
// API. Edge-кеш на 60с — налаштування сайту міняються нечасто.

const PUBLIC_KEYS = ["store_phone", "store_address", "about_text", "contacts_text"];

export async function onRequestGet(context) {
  const { env } = context;

  const placeholders = PUBLIC_KEYS.map(() => "?").join(",");
  const { results } = await env.koshyk_db
    .prepare(`SELECT key, value FROM site_settings WHERE key IN (${placeholders})`)
    .bind(...PUBLIC_KEYS)
    .all();

  const values = {};
  results.forEach((r) => { values[r.key] = r.value; });

  return new Response(
    JSON.stringify({
      ok: true,
      storePhone: values.store_phone || null,
      storeAddress: values.store_address || null,
      aboutText: values.about_text || null,
      contactsText: values.contacts_text || null,
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=60",
      },
    }
  );
}
