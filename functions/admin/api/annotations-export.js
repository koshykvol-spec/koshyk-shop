// GET /admin/api/annotations-export?field=description&filter=missing&n=250&batch=50&category=
// Крок 1 воркфлоу: віддає JSON-список товарів для вставки в LLM.
// Оскільки фільтр завжди читає ПОТОЧНИЙ стан бази, наступний експорт
// автоматично дає наступну порцію — щойно залиті товари випадають
// з фільтру "без опису" самі собою, без окремого трекінгу сесії.

const FIELD_COLUMNS = {
  description: "description",
  keywords: "keywords",
  meta_title: "meta_title",
  meta_description: "meta_description",
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  const field = url.searchParams.get("field") || "description";
  const filter = url.searchParams.get("filter") || "missing"; // missing | short | all
  const n = parseInt(url.searchParams.get("n") || "250", 10);
  const batch = Math.min(500, parseInt(url.searchParams.get("batch") || "50", 10));
  const category = url.searchParams.get("category") || "";

  const column = FIELD_COLUMNS[field];
  if (!column) {
    return json({ ok: false, error: "Невідоме поле" }, 400);
  }

  const where = [];
  const bindings = [];

  if (category) {
    where.push("c.slug = ?");
    bindings.push(category);
  }
  if (filter === "missing") {
    where.push(`(pc.${column} IS NULL OR pc.${column} = '')`);
  } else if (filter === "short") {
    where.push(`(pc.${column} IS NOT NULL AND pc.${column} != '' AND LENGTH(pc.${column}) < ?)`);
    bindings.push(n);
  }
  // filter === 'all' — без додаткової умови

  const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

  const sql = `
    SELECT p.sku, p.name, p.brand, c.name_uk as category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_content pc ON pc.product_id = p.id
    ${whereClause}
    ORDER BY p.id
    LIMIT ?
  `;
  const { results } = await env.koshyk_db.prepare(sql).bind(...bindings, batch).all();

  return json({
    ok: true,
    count: results.length,
    products: results.map((p) => ({
      sku: p.sku,
      name: p.name,
      brand: p.brand || "",
      category: p.category_name,
    })),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
