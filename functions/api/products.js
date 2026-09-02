// Тестова функція: перевіряє, що D1-біндинг koshyk_db доступний
// з Pages Function. Повертає перші 5 товарів у JSON.
//
// Розмістити у: functions/api/products.js (відносно кореня проєкту,
// поруч з public/, НЕ всередині public/)
//
// Після деплою перевірити: https://koshyk.pp.ua/api/products

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const { results } = await env.koshyk_db
      .prepare("SELECT id, sku, name, price, category_id FROM products LIMIT 5")
      .all();

    return new Response(JSON.stringify({ ok: true, count: results.length, products: results }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
}
