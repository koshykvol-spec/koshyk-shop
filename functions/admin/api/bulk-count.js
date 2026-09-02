// GET /admin/api/bulk-count?category=&missingOnly=1

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const missingOnly = url.searchParams.get("missingOnly") === "1";

  const where = [];
  const bindings = [];

  if (category) {
    where.push("c.slug = ?");
    bindings.push(category);
  }
  if (missingOnly) {
    where.push("(pc.description IS NULL OR pc.description = '')");
  }

  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

  const sql = `
    SELECT COUNT(*) as total
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_content pc ON pc.product_id = p.id
    ${whereClause}
  `;
  const row = await env.koshyk_db.prepare(sql).bind(...bindings).first();

  return new Response(JSON.stringify({ total: row ? row.total : 0 }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
