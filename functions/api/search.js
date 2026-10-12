// GET /api/search?q=...&page=&perPage=&sort=&category=&inStockOnly=
// Пошук по назві та SKU, по всіх категоріях одразу (на відміну від
// /api/catalog/:slug, який завжди прив'язаний до однієї категорії).
//
// Регістронезалежність: SQLite LIKE / LOWER() не розпізнають кирилицю,
// тому порівнюємо з окремими колонками name_lower / sku_lower, які
// заповнюються через JS toLowerCase() (див. міграцію 0002 і backfill_lower.js).
// При кожному додаванні/редагуванні товару обов'язково записуй name_lower
// та sku_lower разом з name/sku.
//
// Розширення синонімами (search_synonyms, напр. "гумка" -> "резинка
// для волосся") — див. _lib/synonyms.js. Той самий принцип у /api/suggest.

import { expandWithSynonyms, buildNameSkuClause } from "../_lib/synonyms.js";

const DEFAULT_PER_PAGE = 24;
const ALLOWED_PER_PAGE = new Set([12, 24, 48, 96]);

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
  return cached(context, renderSearch, { keyQuery: true, ttl: 300, noStale: true, errorBody: '{"ok":false,"error":"temporarily unavailable"}', errorType: 'application/json; charset=utf-8' });
}

async function renderSearch(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  const q = (url.searchParams.get("q") || "").trim();
  const qLower = q.toLowerCase();
  const category = url.searchParams.get("category") || "";
  const sort = url.searchParams.get("sort") || "name";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPageRaw = parseInt(url.searchParams.get("perPage") || String(DEFAULT_PER_PAGE), 10);
  const perPage = ALLOWED_PER_PAGE.has(perPageRaw) ? perPageRaw : DEFAULT_PER_PAGE;
  const inStockOnly = url.searchParams.get("inStockOnly") === "1";

  if (!q) {
    return json({ ok: true, query: "", total: 0, page: 1, perPage, totalPages: 0, products: [], categories: [] });
  }

  try {
    const synonymTerms = await expandWithSynonyms(env.koshyk_db, qLower);
    const { clause: nameSkuClause, bindings: nameSkuBindings } = buildNameSkuClause(qLower, synonymTerms);

    const where = [nameSkuClause];
    const bindings = [...nameSkuBindings];

    if (category) {
      where.push("c.slug = ?");
      bindings.push(category);
    }
    if (inStockOnly) {
      where.push("p.in_stock = 1");
    }
    const whereClause = "WHERE " + where.join(" AND ");

    let orderBy = "p.name ASC";
    if (sort === "price_asc") orderBy = "p.price ASC";
    if (sort === "price_desc") orderBy = "p.price DESC";

    const offset = (page - 1) * perPage;

    const productsSql = `
      SELECT p.id, p.sku, p.name, p.slug, p.price, p.brand, p.in_stock,
             p.has_real_photo, p.image_url, c.name_uk as category_name, c.slug as category_slug
      FROM products p
      JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const { results: products } = await env.koshyk_db
      .prepare(productsSql)
      .bind(...bindings, perPage, offset)
      .all();

    const countSql = `SELECT COUNT(*) as total FROM products p JOIN categories c ON c.id = p.category_id ${whereClause}`;
    const countRow = await env.koshyk_db.prepare(countSql).bind(...bindings).first();
    const total = countRow ? countRow.total : 0;

    // категорії, в яких є збіги — для швидких посилань-уточнень на сторінці результатів
    const categoryCountSql = `
      SELECT c.slug, c.name_uk, COUNT(*) as cnt
      FROM products p JOIN categories c ON c.id = p.category_id
      WHERE ${nameSkuClause}
      GROUP BY c.id ORDER BY cnt DESC
    `;
    const { results: categoryRows } = await env.koshyk_db
      .prepare(categoryCountSql)
      .bind(...nameSkuBindings)
      .all();

    return json({
      ok: true,
      query: q,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        slug: p.slug,
        price: p.price,
        brand: p.brand,
        inStock: !!p.in_stock,
        hasRealPhoto: !!p.has_real_photo,
        imageUrl: p.image_url,
        categoryName: p.category_name,
        categorySlug: p.category_slug,
      })),
      categories: categoryRows.map((c) => ({ slug: c.slug, name: c.name_uk, count: c.cnt })),
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
