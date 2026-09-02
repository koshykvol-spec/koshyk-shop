// POST /api/reviews
// { productId, authorName, rating, text }

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { productId, authorName, rating, text } = body;
  const ratingNum = parseInt(rating, 10);

  if (!productId || !authorName || !authorName.trim()) {
    return json({ ok: false, error: "Вкажіть ім'я" }, 400);
  }
  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    return json({ ok: false, error: "Оцінка має бути від 1 до 5" }, 400);
  }

  const product = await env.koshyk_db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
  if (!product) {
    return json({ ok: false, error: "Товар не знайдено" }, 404);
  }

  await env.koshyk_db
    .prepare("INSERT INTO product_reviews (product_id, author_name, rating, text, approved) VALUES (?, ?, ?, ?, 0)")
    .bind(productId, authorName.trim().slice(0, 100), ratingNum, (text || "").trim().slice(0, 2000) || null)
    .run();

  return json({ ok: true, pending: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
