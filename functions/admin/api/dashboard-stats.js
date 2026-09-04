// GET /admin/api/dashboard-stats
// Лічильники для чіпів на головній сторінці адмінки: усього товарів,
// по кожній категорії, і скільки бракує опису/фото/SEO/ключових слів.
//
// Кешується в admin_stats_cache на 5 хв (TTL) замість перерахунку 8 запитів
// на кожне відкриття /admin — прибирає повторюване навантаження на D1 при
// частому переході на дашборд під час активного редагування каталогу.

const STATS_TTL_MS = 5 * 60 * 1000;

export async function onRequestGet(context) {
  const { env } = context;
  const db = env.koshyk_db;

  const cached = await db.prepare("SELECT * FROM admin_stats_cache WHERE id = 1").first();
  const fresh = cached && Date.now() - cached.updated_at < STATS_TTL_MS;

  if (fresh) {
    return json({
      total: cached.total,
      categories: JSON.parse(cached.categories_json),
      missingDescription: cached.missing_description,
      missingPhoto: cached.missing_photo,
      missingSeo: cached.missing_seo,
      missingKeywords: cached.missing_keywords,
      reviewQueue: cached.review_queue,
      pendingOrders: cached.pending_orders,
      pendingReviews: cached.pending_reviews,
    });
  }

  const totalRow = await db.prepare("SELECT COUNT(*) as cnt FROM products").first();

  const { results: categories } = await db
    .prepare(
      `SELECT c.slug, c.name_uk, COUNT(p.id) as cnt
       FROM categories c LEFT JOIN products p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.sort_order`
    )
    .all();

  const missingDescription = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
       WHERE pc.description IS NULL OR pc.description = ''`
    )
    .first();

  const missingPhoto = await db
    .prepare("SELECT COUNT(*) as cnt FROM products WHERE has_real_photo = 0")
    .first();

  const missingSeo = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
       WHERE pc.meta_title IS NULL OR pc.meta_title = ''`
    )
    .first();

  const missingKeywords = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
       WHERE pc.keywords IS NULL OR pc.keywords = ''`
    )
    .first();

  const reviewQueue = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM product_content WHERE json_extract(attributes_json, '$.needs_review') = 1`
    )
    .first();

  const pendingOrders = await db
    .prepare("SELECT COUNT(*) as cnt FROM orders WHERE status = 'new'")
    .first();

  const pendingReviews = await db
    .prepare("SELECT COUNT(*) as cnt FROM product_reviews WHERE approved = 0")
    .first();

  const categoriesOut = categories.map((c) => ({ slug: c.slug, name: c.name_uk, count: c.cnt }));

  await db
    .prepare(
      `INSERT INTO admin_stats_cache (id, total, categories_json, missing_description, missing_photo, missing_seo, missing_keywords, review_queue, pending_orders, pending_reviews, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         total = excluded.total,
         categories_json = excluded.categories_json,
         missing_description = excluded.missing_description,
         missing_photo = excluded.missing_photo,
         missing_seo = excluded.missing_seo,
         missing_keywords = excluded.missing_keywords,
         review_queue = excluded.review_queue,
         pending_orders = excluded.pending_orders,
         pending_reviews = excluded.pending_reviews,
         updated_at = excluded.updated_at`
    )
    .bind(
      totalRow.cnt,
      JSON.stringify(categoriesOut),
      missingDescription.cnt,
      missingPhoto.cnt,
      missingSeo.cnt,
      missingKeywords.cnt,
      reviewQueue.cnt,
      pendingOrders.cnt,
      pendingReviews.cnt,
      Date.now()
    )
    .run();

  return json({
    total: totalRow.cnt,
    categories: categoriesOut,
    missingDescription: missingDescription.cnt,
    missingPhoto: missingPhoto.cnt,
    missingSeo: missingSeo.cnt,
    missingKeywords: missingKeywords.cnt,
    reviewQueue: reviewQueue.cnt,
    pendingOrders: pendingOrders.cnt,
    pendingReviews: pendingReviews.cnt,
  });
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
