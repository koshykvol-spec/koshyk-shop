// GET /api/suggest?q=... — легкі автопідказки для пошуку в хедері.
// На відміну від /api/search (повний пошук зі сторінками/фільтрами),
// тут завжди максимум 6 результатів і мінімум даних — для dropdown
// під час набору тексту. Той самий принцип регістронезалежності
// (name_lower/sku_lower), що й у /api/search, плюс розширення
// синонімами з search_synonyms (див. _lib/synonyms.js) — щоб "гумка"
// теж знаходила товари, названі "резинка для волосся" тощо.

import { expandWithSynonyms, buildNameSkuClause } from "../_lib/synonyms.js";

const SUGGEST_LIMIT = 6;
const MIN_QUERY_LENGTH = 2;

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
  return cached(context, renderSuggest, { keyQuery: true, ttl: 600, noStale: true, errorBody: '{"ok":false,"error":"temporarily unavailable"}', errorType: 'application/json; charset=utf-8' });
}

async function renderSuggest(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  const q = (url.searchParams.get("q") || "").trim();
  const qLower = q.toLowerCase();

  if (qLower.length < MIN_QUERY_LENGTH) {
    return json({ ok: true, query: q, total: 0, products: [] });
  }

  try {
    const prefixParam = `${qLower}%`;
    const synonymTerms = await expandWithSynonyms(env.koshyk_db, qLower);
    const { clause: nameSkuClause, bindings: nameSkuBindings } = buildNameSkuClause(qLower, synonymTerms);

    const sql = `
      SELECT p.name, p.slug, p.price, p.in_stock, p.has_real_photo, p.image_url,
             c.slug as category_slug, c.name_uk as category_name,
             CASE WHEN p.name_lower LIKE ? THEN 0 ELSE 1 END as rank_prefix
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE ${nameSkuClause}
      ORDER BY rank_prefix ASC, p.in_stock DESC, p.name ASC
      LIMIT ?
    `;
    const { results: products } = await env.koshyk_db
      .prepare(sql)
      .bind(prefixParam, ...nameSkuBindings, SUGGEST_LIMIT)
      .all();

    const countRow = await env.koshyk_db
      .prepare(`SELECT COUNT(*) as total FROM products p WHERE ${nameSkuClause}`)
      .bind(...nameSkuBindings)
      .first();

    return json({
      ok: true,
      query: q,
      total: countRow ? countRow.total : 0,
      products: products.map((p) => ({
        name: p.name,
        slug: p.slug,
        price: p.price,
        inStock: !!p.in_stock,
        hasRealPhoto: !!p.has_real_photo,
        imageUrl: p.image_url,
        categorySlug: p.category_slug,
        categoryName: p.category_name,
      })),
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
