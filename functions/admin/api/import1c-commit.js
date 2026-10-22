// POST /admin/api/import1c-commit
// Тіло: сирий JSON-масив products.json з 1С.
//
// Стратегія запису (мінімум записів у D1 — безкоштовний план має денний ліміт rows written):
//   - UPDATE лише для товарів, у яких справді змінилась назва/ціна/категорія/наявність;
//   - in_stock = 0 лише для тих, кого немає у файлі й хто ще не погашений.
// Усе це готує buildDiff() у вигляді statements (раніше тут був "UPDATE products SET in_stock = 0"
// для ВСІХ товарів, а потім UPDATE для кожного товару з файлу — по 2 записи на товар за імпорт).
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

import { invalidateCatalogStats } from "../../_lib/catalog-stats.js";

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

  // statements із buildDiff: зміни, нові товари, погашення зниклих
  const stmts = diff.statements.map((s) => env.koshyk_db.prepare(s.sql).bind(...s.args));
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await env.koshyk_db.batch(stmts.slice(i, i + BATCH_SIZE));
  }

  await invalidateCatalogStats(env.koshyk_db);

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
