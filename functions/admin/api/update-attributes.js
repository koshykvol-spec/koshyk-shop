// POST /admin/api/update-attributes — { id, gender, ageGroup }
// Оновлює product_content.attributes_json: проставляє стать/вік
// вручну і знімає прапорець needs_review.

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { id, gender, ageGroup } = body;
  if (!id) {
    return json({ ok: false, error: "Відсутній id товару" }, 400);
  }

  const row = await env.koshyk_db
    .prepare("SELECT attributes_json FROM product_content WHERE product_id = ?")
    .bind(id)
    .first();

  if (!row) {
    return json({ ok: false, error: "Запис не знайдено" }, 404);
  }

  const attrs = JSON.parse(row.attributes_json);
  attrs.gender = gender || attrs.gender || null;
  attrs.age_group = ageGroup || attrs.age_group || null;
  attrs.needs_review = false;

  await env.koshyk_db
    .prepare("UPDATE product_content SET attributes_json = ? WHERE product_id = ?")
    .bind(JSON.stringify(attrs), id)
    .run();

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
