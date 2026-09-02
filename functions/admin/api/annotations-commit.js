// POST /admin/api/annotations-commit
// { field, rows: [{ productId, willBecome, willUpdate }] }
// Пише в product_content ТІЛЬКИ рядки з willUpdate=true — попередній
// перегляд (annotations-preview) уже відфільтрував/позначив решту,
// і адмін міг вручну зняти позначку з конкретних рядків у Кроці 4.

const FIELD_COLUMNS = {
  description: "description",
  keywords: "keywords",
  meta_title: "meta_title",
  meta_description: "meta_description",
};

const BATCH_SIZE = 50;

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { field, rows } = body;
  const column = FIELD_COLUMNS[field];
  if (!column || !Array.isArray(rows)) {
    return json({ ok: false, error: "Відсутні дані" }, 400);
  }

  const toApply = rows.filter((r) => r.willUpdate && r.productId);
  if (!toApply.length) {
    return json({ ok: true, updated: 0 });
  }

  const statements = toApply.map((r) =>
    env.koshyk_db
      .prepare(
        `INSERT INTO product_content (product_id, ${column}, seo_updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(product_id) DO UPDATE SET ${column} = excluded.${column}, seo_updated_at = datetime('now')`
      )
      .bind(r.productId, r.willBecome)
  );

  let updated = 0;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await env.koshyk_db.batch(statements.slice(i, i + BATCH_SIZE));
    updated += Math.min(BATCH_SIZE, statements.length - i);
  }

  return json({ ok: true, updated });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
