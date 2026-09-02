// GET /admin/api/product-images?productId=123

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return json({ ok: false, error: "Відсутній productId" }, 400);
  }

  const { results } = await env.koshyk_db
    .prepare(
      "SELECT id, r2_key, is_primary FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id"
    )
    .bind(productId)
    .all();

  return json({
    ok: true,
    images: results.map((r) => ({ id: r.id, url: `/img/${r.r2_key}`, isPrimary: !!r.is_primary })),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
