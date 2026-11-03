// POST /admin/api/review-delete — { id }
// Видаляє відгук назавжди (для вже опублікованих відгуків; у черзі модерації
// для цього є review-moderate → reject).

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const id = parseInt(body && body.id, 10);
  if (!(id > 0)) {
    return json({ ok: false, error: "Некоректні дані" }, 400);
  }

  const res = await env.koshyk_db.prepare("DELETE FROM product_reviews WHERE id = ?").bind(id).run();
  const changed = res && res.meta ? res.meta.changes : 0;
  if (!changed) {
    return json({ ok: false, error: "Відгук не знайдено (можливо, вже видалений)" }, 404);
  }
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
