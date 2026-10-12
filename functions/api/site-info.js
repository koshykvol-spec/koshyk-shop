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

// Кеш через Cache API + захист від збоїв D1.
// Pages Function виконується ПЕРЕД CDN-кешем, тому самого Cache-Control недостатньо.
//  - успішна відповідь кешується і (якщо не noStale) ще раз як "запасна копія" на 7 днів;
//  - якщо D1 недоступна (виняток або 5xx) — віддаємо запасну копію (X-Cache: STALE,
//    без кешування), а якщо її немає — чесний 503 + Retry-After;
//  - помилки в кеш не потрапляють.
// opts: keyQuery (ключ кешу враховує query-параметри), ttl (s-maxage, якщо відповідь
// без Cache-Control), noStale (без запасної копії — для пошуку з довільними запитами),
// errorBody/errorType (тіло 503).
async function cached(context, render, opts = {}) {
  const { request } = context;
  if (request.method !== 'GET') return render(context);
  const url = new URL(request.url);
  const cache = caches.default;
  let query = '';
  if (opts.keyQuery) {
    const sp = new URLSearchParams(url.searchParams);
    sp.sort();
    const s = sp.toString();
    query = s ? '?' + s : '';
  }
  const key = new Request(url.origin + url.pathname + query);
  const staleKey = new Request(url.origin + '/__stale' + url.pathname + query);

  const hit = await cache.match(key);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('X-Cache', 'HIT');
    return r;
  }

  let res = null;
  try { res = await render(context); } catch (e) { res = null; }
  const failed = !res || res.status >= 500;

  if (!failed) {
    const store = res.status === 200;
    if (store) {
      if (opts.ttl && !res.headers.has('cache-control')) {
        res.headers.set('cache-control', 'public, max-age=0, s-maxage=' + opts.ttl);
      }
      context.waitUntil(cache.put(key, res.clone()));
      if (!opts.noStale) {
        const copy = res.clone();
        const h = new Headers(copy.headers);
        h.set('cache-control', 'public, max-age=604800'); // запасна копія живе 7 днів
        context.waitUntil(cache.put(staleKey, new Response(copy.body, { status: 200, headers: h })));
      }
    }
    res.headers.set('X-Cache', store ? 'MISS' : 'BYPASS');
    return res;
  }

  if (!opts.noStale) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const r = new Response(stale.body, stale);
      r.headers.set('cache-control', 'no-store');
      r.headers.set('X-Cache', 'STALE');
      return r;
    }
  }
  return new Response(opts.errorBody || 'Сервіс тимчасово недоступний. Спробуйте за кілька хвилин.', {
    status: 503,
    headers: {
      'content-type': opts.errorType || 'text/plain; charset=utf-8',
      'retry-after': '300',
      'cache-control': 'no-store',
      'X-Cache': 'ERROR'
    }
  });
}

export async function onRequestGet(context) {
  return cached(context, renderSiteInfo, { errorBody: '{"ok":false,"error":"temporarily unavailable"}', errorType: 'application/json; charset=utf-8' });
}

async function renderSiteInfo(context) {
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
        "Cache-Control": "public, max-age=0, s-maxage=600",
      },
    }
  );
}
