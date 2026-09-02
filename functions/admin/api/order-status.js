// POST /admin/api/order-status — { id, status }
// Захищено middleware functions/admin/_middleware.js (діє на весь /admin/*).

const VALID_STATUSES = new Set(["new", "confirmed", "shipped", "done", "cancelled"]);

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { id, status } = body;
  if (!id || !VALID_STATUSES.has(status)) {
    return json({ ok: false, error: "Некоректні дані" }, 400);
  }

  await env.koshyk_db
    .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, id)
    .run();

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
