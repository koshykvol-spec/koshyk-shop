// GET /api/categories
// Публічний ендпоінт для головної сторінки: живі лічильники товарів
// по категоріях (в наявності) та діапазон цін. Раніше ці числа були
// захардкоджені в index.html і розходились з реальними даними
// каталогу (наприклад 642 на головній проти 735 у /catalog/kanctovary,
// бо друге число includes товари не в наявності). Тепер обидва місця
// повинні брати дані з БД: тут — тільки in_stock=1, узгоджено з
// написом "X товарів в наявності" на головній.
//
// Головна сторінка (functions/index.js) більше НЕ викликає цей
// ендпоінт — вона читає ті самі дані напряму з D1 при серверному
// рендері. Ендпоінт лишається як самостійний публічний API (раптом
// знадобиться десь ще — інша сторінка, зовнішній клієнт тощо).
// Кеш на 1 год (Cache API + edge) — дані каталогу не змінюються щосекунди.

// Кеш відповіді через Cache API: без нього кожен виклик виконує 2 запити
// по всій таблиці products (≈2,5 тис. рядків кожен).
const CATEGORIES_CACHE_TTL = 3600; // секунд (було 600, див. functions/index.js)

// Кеш через Cache API + захист від збоїв D1.
// Pages Function виконується ПЕРЕД CDN-кешем, тому самого Cache-Control недостатньо.
//  - успішна відповідь кешується (TTL із заголовка) і ще раз як "запасна копія" на 7 днів;
//  - якщо D1 недоступна (виняток, 5xx або мітка x-degraded) — віддаємо запасну копію
//    (X-Cache: STALE, без кешування), а якщо її немає — чесний 503 + Retry-After;
//  - помилки та деградовані відповіді в кеш не потрапляють.
// opts: skipCache (не читати/не писати кеш), serveDegraded (за відсутності запасної копії
// віддати деградовану відповідь як є), errorBody/errorType (тіло 503).
async function cached(context, render, opts = {}) {
  const { request } = context;
  if (request.method !== 'GET') return render(context);
  const url = new URL(request.url);
  const cache = caches.default;
  const key = new Request(url.origin + url.pathname);
  const staleKey = new Request(url.origin + '/__stale' + url.pathname);
  const useCache = !opts.skipCache;

  if (useCache) {
    const hit = await cache.match(key);
    if (hit) {
      const r = new Response(hit.body, hit);
      r.headers.set('X-Cache', 'HIT');
      return r;
    }
  }

  let res = null;
  try { res = await render(context); } catch (e) { res = null; }
  const failed = !res || res.status >= 500 || res.headers.has('x-degraded');

  if (!failed) {
    const store = useCache && res.status === 200;
    if (store) {
      context.waitUntil(cache.put(key, res.clone()));
      const copy = res.clone();
      const h = new Headers(copy.headers);
      h.set('cache-control', 'public, max-age=604800'); // запасна копія живе 7 днів
      context.waitUntil(cache.put(staleKey, new Response(copy.body, { status: 200, headers: h })));
    }
    res.headers.set('X-Cache', store ? 'MISS' : 'BYPASS');
    return res;
  }

  if (useCache) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const r = new Response(stale.body, stale);
      r.headers.set('cache-control', 'no-store');
      r.headers.set('X-Cache', 'STALE');
      return r;
    }
  }
  if (res && res.status < 500 && opts.serveDegraded) {
    res.headers.delete('x-degraded');
    res.headers.set('cache-control', 'no-store');
    res.headers.set('X-Cache', 'BYPASS');
    return res;
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
  return cached(context, getCategories, { errorBody: '{"ok":false,"error":"temporarily unavailable"}', errorType: 'application/json; charset=utf-8' });
}

async function getCategories(context) {
  const { env } = context;

  const { results: categories } = await env.koshyk_db
    .prepare(
      `SELECT c.slug, c.name_uk,
              COUNT(CASE WHEN p.in_stock = 1 THEN 1 END) as in_stock_count,
              COUNT(p.id) as total_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id
       ORDER BY in_stock_count DESC`
    )
    .all();

  const totalsRow = await env.koshyk_db
    .prepare(
      `SELECT
         COUNT(CASE WHEN in_stock = 1 THEN 1 END) as total_in_stock,
         COUNT(*) as total_all,
         MIN(CASE WHEN in_stock = 1 THEN price END) as min_price,
         MAX(CASE WHEN in_stock = 1 THEN price END) as max_price
       FROM products`
    )
    .first();

  return new Response(
    JSON.stringify({
      ok: true,
      categories: categories.map((c) => ({
        slug: c.slug,
        name: c.name_uk,
        count: c.in_stock_count,
        totalCount: c.total_count,
      })),
      totalInStock: totalsRow ? totalsRow.total_in_stock : 0,
      totalAll: totalsRow ? totalsRow.total_all : 0,
      minPrice: totalsRow ? totalsRow.min_price : null,
      maxPrice: totalsRow ? totalsRow.max_price : null,
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=0, s-maxage=${CATEGORIES_CACHE_TTL}`,
      },
    }
  );
}
