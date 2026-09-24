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

export async function onRequestGet(context) {
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
