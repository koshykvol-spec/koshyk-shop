// Pages Function: GET /api/catalog/:slug
// Повертає товари категорії з урахуванням фільтрів + фасети для UI.
// SQL-логіка винесена в _lib/catalog-query.js — той самий код
// використовує functions/catalog/[slug].js для серверного рендеру
// першої сторінки (щоб не розходились).
//
// Query-параметри:
//   brands     — точні назви брендів через кому (множинний вибір)
//   minPrice / maxPrice — діапазон ціни
//   gender     — тільки для одяг/взуття (attributes_json.gender)
//   ageGroup   — тільки для одяг/взуття (attributes_json.age_group)
//   sort       — 'price_asc' | 'price_desc' | 'name' (default)
//   page       — сторінка (за замовчуванням 1)
//   perPage    — 12 | 24 | 48 | 96 (за замовчуванням 24)
//   inStockOnly — '1' — показувати лише товари в наявності

import { parseCatalogFilters, queryCatalog } from "../../_lib/catalog-query.js";

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
  return cached(context, renderCatalogApi, { keyQuery: true, ttl: 300, errorBody: '{"ok":false,"error":"temporarily unavailable"}', errorType: 'application/json; charset=utf-8' });
}

async function renderCatalogApi(context) {
  const { env, params, request } = context;
  const slug = params.slug;
  const url = new URL(request.url);

  try {
    const category = await env.koshyk_db
      .prepare("SELECT id, slug, name_uk FROM categories WHERE slug = ?")
      .bind(slug)
      .first();

    if (!category) {
      return json({ ok: false, error: "Категорію не знайдено" }, 404);
    }

    const filters = parseCatalogFilters(url.searchParams);
    const result = await queryCatalog(env.koshyk_db, category, filters, slug);

    return json({
      ok: true,
      category: { slug: category.slug, name: category.name_uk },
      ...result,
    });
  } catch (err) {
    return json({ ok: false, error: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
