// GET /api/search?q=...&page=&perPage=&sort=&category=&inStockOnly=
// Пошук по назві та SKU, по всіх категоріях одразу (на відміну від
// /api/catalog/:slug, який завжди прив'язаний до однієї категорії).
//
// Регістронезалежність: SQLite LIKE / LOWER() не розпізнають кирилицю,
// тому порівнюємо з окремими колонками name_lower / sku_lower, які
// заповнюються через JS toLowerCase() (див. міграцію 0002 і backfill_lower.js).
// При кожному додаванні/редагуванні товару обов'язково записуй name_lower
// та sku_lower разом з name/sku.

const DEFAULT_PER_PAGE = 24;
const ALLOWED_PER_PAGE = new Set([12, 24, 48, 96]);

export async function onRequestGet(context) {
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
    const where = ["(p.name_lower LIKE ? OR p.sku_lower LIKE ?)"];
    const bindings = [`%${qLower}%`, `%${qLower}%`];

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
      WHERE (p.name_lower LIKE ? OR p.sku_lower LIKE ?)
      GROUP BY c.id ORDER BY cnt DESC
    `;
    const { results: categoryRows } = await env.koshyk_db
      .prepare(categoryCountSql)
      .bind(`%${qLower}%`, `%${qLower}%`)
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
