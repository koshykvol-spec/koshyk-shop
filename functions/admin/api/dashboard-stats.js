// GET /admin/api/dashboard-stats
// Лічильники для чіпів на головній сторінці адмінки: усього товарів,
// по кожній категорії, і скільки бракує опису/фото/SEO/ключових слів.

export async function onRequestGet(context) {
  const { env } = context;

  const totalRow = await env.koshyk_db.prepare("SELECT COUNT(*) as cnt FROM products").first();

  const { results: categories } = await env.koshyk_db
    .prepare(
      `SELECT c.slug, c.name_uk, COUNT(p.id) as cnt
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.sort_order`
    )
    .all();

  const missingDescription = await env.koshyk_db
    .prepare(
      `SELECT COUNT(*) as cnt FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
       WHERE pc.description IS NULL OR pc.description = ''`
    )
    .first();

  const missingPhoto = await env.koshyk_db
    .prepare("SELECT COUNT(*) as cnt FROM products WHERE has_real_photo = 0")
    .first();

  const missingSeo = await env.koshyk_db
    .prepare(
      `SELECT COUNT(*) as cnt FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
       WHERE pc.meta_title IS NULL OR pc.meta_title = ''`
    )
    .first();

  const missingKeywords = await env.koshyk_db
    .prepare(
      `SELECT COUNT(*) as cnt FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
       WHERE pc.keywords IS NULL OR pc.keywords = ''`
    )
    .first();

  const reviewQueue = await env.koshyk_db
    .prepare(
      `SELECT COUNT(*) as cnt FROM product_content WHERE json_extract(attributes_json, '$.needs_review') = 1`
    )
    .first();

  const pendingOrders = await env.koshyk_db
    .prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'new'")
    .first();

  const pendingReviews = await env.koshyk_db
    .prepare("SELECT COUNT(*) as cnt FROM product_reviews WHERE approved = 0")
    .first();

  return new Response(
    JSON.stringify({
      total: totalRow.cnt,
      categories: categories.map((c) => ({ slug: c.slug, name: c.name_uk, count: c.cnt })),
      missingDescription: missingDescription.cnt,
      missingPhoto: missingPhoto.cnt,
      missingSeo: missingSeo.cnt,
      missingKeywords: missingKeywords.cnt,
      reviewQueue: reviewQueue.cnt,
      pendingOrders: pendingOrders.cnt,
      pendingReviews: pendingReviews.cnt,
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}
