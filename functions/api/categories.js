// GET /api/categories
// Публічний ендпоінт для головної сторінки: живі лічильники товарів
// по категоріях (в наявності) та діапазон цін. Раніше ці числа були
// захардкоджені в index.html і розходились з реальними даними
// каталогу (наприклад 642 на головній проти 735 у /catalog/kanctovary,
// бо друге число includes товари не в наявності). Тепер обидва місця
// повинні брати дані з БД: тут — тільки in_stock=1, узгоджено з
// написом "X товарів в наявності" на головній.

export async function onRequestGet(context) {
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
    { headers: { "Content-Type": "application/json; charset=utf-8" } }
  );
}
