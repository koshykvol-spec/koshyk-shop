// GET /api/suggest?q=... — легкі автопідказки для пошуку в хедері.
// На відміну від /api/search (повний пошук зі сторінками/фільтрами),
// тут завжди максимум 6 результатів і мінімум даних — для dropdown
// під час набору тексту. Той самий принцип регістронезалежності
// (name_lower/sku_lower), що й у /api/search.

const SUGGEST_LIMIT = 6;
const MIN_QUERY_LENGTH = 2;

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  const q = (url.searchParams.get("q") || "").trim();
  const qLower = q.toLowerCase();

  if (qLower.length < MIN_QUERY_LENGTH) {
    return json({ ok: true, query: q, total: 0, products: [] });
  }

  try {
    const containsParam = `%${qLower}%`;
    const prefixParam = `${qLower}%`;

    const sql = `
      SELECT p.name, p.slug, p.price, p.in_stock, p.has_real_photo, p.image_url,
             c.slug as category_slug, c.name_uk as category_name,
             CASE WHEN p.name_lower LIKE ? THEN 0 ELSE 1 END as rank_prefix
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE (p.name_lower LIKE ? OR p.sku_lower LIKE ?)
      ORDER BY rank_prefix ASC, p.in_stock DESC, p.name ASC
      LIMIT ?
    `;
    const { results: products } = await env.koshyk_db
      .prepare(sql)
      .bind(prefixParam, containsParam, containsParam, SUGGEST_LIMIT)
      .all();

    const countRow = await env.koshyk_db
      .prepare(
        `SELECT COUNT(*) as total FROM products p
         WHERE (p.name_lower LIKE ? OR p.sku_lower LIKE ?)`
      )
      .bind(containsParam, containsParam)
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
