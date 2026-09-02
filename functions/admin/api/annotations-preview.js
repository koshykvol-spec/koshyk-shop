// POST /admin/api/annotations-preview
// { field, items: [{sku, text}], mergePolicy, n }
// mergePolicy: 'weak' (перезаписати лише короткі < n) | 'always' | 'skip' (лишити наявні)
//
// Матчинг товару: спершу точно по SKU, якщо не знайдено — по точній назві
// (name), як і в AGRO3.

const FIELD_COLUMNS = {
  description: "description",
  keywords: "keywords",
  meta_title: "meta_title",
  meta_description: "meta_description",
};

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { field, items, mergePolicy, n } = body;
  const column = FIELD_COLUMNS[field];
  if (!column || !Array.isArray(items) || !items.length) {
    return json({ ok: false, error: "Відсутні дані" }, 400);
  }

  const threshold = parseInt(n, 10) || 200;
  const rows = [];

  for (const item of items) {
    const sku = (item.sku || "").trim();
    const text = (item.text || "").trim();
    if (!sku || !text) continue;

    let product = await env.koshyk_db
      .prepare(
        `SELECT p.id, p.sku, p.name, pc.${column} as current_value
         FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
         WHERE p.sku = ?`
      )
      .bind(sku)
      .first();

    let matchedBy = "sku";
    if (!product) {
      // fallback: точна назва (item.sku міг бути насправді назвою, якщо LLM переплутав колонки)
      product = await env.koshyk_db
        .prepare(
          `SELECT p.id, p.sku, p.name, pc.${column} as current_value
           FROM products p LEFT JOIN product_content pc ON pc.product_id = p.id
           WHERE p.name = ?`
        )
        .bind(sku)
        .first();
      matchedBy = "name";
    }

    if (!product) {
      rows.push({ input: sku, matched: false, willUpdate: false });
      continue;
    }

    const current = product.current_value || "";
    let willUpdate;
    if (mergePolicy === "always") willUpdate = true;
    else if (mergePolicy === "skip") willUpdate = !current;
    else willUpdate = !current || current.length < threshold; // 'weak' (default)

    rows.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      matched: true,
      matchedBy,
      was: current,
      willBecome: text,
      willUpdate,
    });
  }

  return json({ ok: true, rows });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
