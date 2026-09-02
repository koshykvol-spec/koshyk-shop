// POST /admin/api/review-moderate — { id, action: 'approve' | 'reject' }
// approve -> approved = 1; reject -> рядок видаляється повністю
// (відхилені відгуки не мають цінності зберігати — не спам-лог, просто сміття).

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { id, action } = body;
  if (!id || (action !== "approve" && action !== "reject")) {
    return json({ ok: false, error: "Некоректні дані" }, 400);
  }

  if (action === "approve") {
    await env.koshyk_db.prepare("UPDATE product_reviews SET approved = 1 WHERE id = ?").bind(id).run();
  } else {
    await env.koshyk_db.prepare("DELETE FROM product_reviews WHERE id = ?").bind(id).run();
  }

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
