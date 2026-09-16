// POST /admin/api/import1c-commit
// Тіло: сирий JSON-масив products.json з 1С.
//
// Стратегія "немає в наявності" у два кроки (уникаємо NOT IN на 2000+ sku):
//   1. Одним UPDATE позначаємо УСІ товари in_stock = 0.
//   2. Кожен товар з файлу піднімає себе назад через statements з buildDiff().
// Товари, яких у файлі не було, лишаються in_stock = 0.
//
// Diff (хто created/updated/backInStock/priceChanges/moved/disappeared)
// рахується buildDiff() з _import1c-lib.js — тим самим кодом, що й
// import1c-validate.js, тому прогноз на «Перевірити» і факт після
// «Імпортувати» завжди узгоджені.
//
// НЕ чіпається при оновленні існуючих товарів: image_url, has_real_photo,
// product_content (опис/SEO) — окрема відповідальність (адмінка товарів).

import { buildDiff } from "./_import1c-lib.js";

const BATCH_SIZE = 50;

export async function onRequestPost(context) {
  const { env, request } = context;

  let data;
  try {
    const text = await request.text();
    data = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "Файл не є коректним JSON" }, 400);
  }

  const diff = await buildDiff(data, env.koshyk_db);
  if (!diff.ok) return json(diff, 400);

  // Крок 1: усі товари тимчасово "немає в наявності"
  await env.koshyk_db.prepare("UPDATE products SET in_stock = 0").run();

  // Крок 2: statements із buildDiff піднімають назад товари з файлу
  const stmts = diff.statements.map((s) => env.koshyk_db.prepare(s.sql).bind(...s.args));
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await env.koshyk_db.batch(stmts.slice(i, i + BATCH_SIZE));
  }

  const outOfStockRow = await env.koshyk_db
    .prepare("SELECT COUNT(*) as cnt FROM products WHERE in_stock = 0")
    .first();

  return json({
    ok: true,
    mode: "commit",
    ...diff.report,
    markedOutOfStock: outOfStockRow ? outOfStockRow.cnt : 0, // факт замінює оцінку з diff.report
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
