// POST /admin/api/brands-commit
// { rows: [{ productId, matchedBrand, willUpdate }] }

const BATCH_SIZE = 50;

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { rows } = body;
  if (!Array.isArray(rows)) {
    return json({ ok: false, error: "Відсутні дані" }, 400);
  }

  const toApply = rows.filter((r) => r.willUpdate && r.productId && r.matchedBrand);
  if (!toApply.length) {
    return json({ ok: true, updated: 0 });
  }

  const statements = toApply.map((r) =>
    env.koshyk_db
      .prepare(`UPDATE products SET brand = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(r.matchedBrand, r.productId)
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
