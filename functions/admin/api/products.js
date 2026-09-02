// GET /admin/api/products?search=&category=&page=
// На відміну від публічного /api/catalog/:slug, тут немає обмеження
// однією категорією і є повнотекстовий пошук по назві/SKU.
//
// Регістронезалежність (кирилиця): SQLite LIKE/LOWER() не розпізнають
// кирилицю, тому пошук іде по колонках name_lower/sku_lower, які
// заповнюються через JS toLowerCase() у product-update.js та
// import1c-commit.js при кожному записі товару.

const PER_PAGE = 30;

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const category = url.searchParams.get("category") || "";
  const brand = url.searchParams.get("brand") || "";
  const missing = url.searchParams.get("missing") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));

  const where = [];
  const bindings = [];

  if (search) {
    const searchLower = search.toLowerCase();
    where.push("(p.name_lower LIKE ? OR p.sku_lower LIKE ?)");
    bindings.push(`%${searchLower}%`, `%${searchLower}%`);
  }
  if (category) {
    where.push("c.slug = ?");
    bindings.push(category);
  }
  if (brand) {
    where.push("p.brand = ?");
    bindings.push(brand);
  }
  if (missing === "description") {
    where.push("(pc.description IS NULL OR pc.description = '')");
  } else if (missing === "photo") {
    where.push("p.has_real_photo = 0");
  } else if (missing === "seo") {
    where.push("(pc.meta_title IS NULL OR pc.meta_title = '')");
  } else if (missing === "keywords") {
    where.push("(pc.keywords IS NULL OR pc.keywords = '')");
  }

  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
  const offset = (page - 1) * PER_PAGE;

  const productsSql = `
    SELECT p.id, p.sku, p.name, p.price, p.brand, p.image_url, p.has_real_photo,
           c.name_uk as category_name, pc.description, pc.meta_title, pc.meta_description, pc.keywords
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_content pc ON pc.product_id = p.id
    ${whereClause}
    ORDER BY p.name ASC
    LIMIT ? OFFSET ?
  `;
  const { results: products } = await env.koshyk_db
    .prepare(productsSql)
    .bind(...bindings, PER_PAGE, offset)
    .all();

  const countSql = `
    SELECT COUNT(*) as total FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_content pc ON pc.product_id = p.id
    ${whereClause}
  `;
  const countRow = await env.koshyk_db.prepare(countSql).bind(...bindings).first();
  const total = countRow ? countRow.total : 0;

  return new Response(
    JSON.stringify({
      total,
      page,
      totalPages: Math.ceil(total / PER_PAGE),
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        brand: p.brand,
        imageUrl: p.image_url,
        hasRealPhoto: !!p.has_real_photo,
        categoryName: p.category_name,
        description: p.description,
        metaTitle: p.meta_title,
        metaDescription: p.meta_description,
        keywords: p.keywords,
      })),
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}
