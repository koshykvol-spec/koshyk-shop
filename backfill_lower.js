// Одноразовий скрипт: витягує всі товари з D1, рахує name_lower/sku_lower
// через JS toLowerCase() (коректно працює з кирилицею) і генерує SQL-файл
// з UPDATE-запитами для завантаження назад у D1.
//
// Використання:
//   1) Спочатку вивантаж поточні дані:
//        wrangler d1 execute koshyk_db --remote --command "SELECT id, name, sku FROM products" --json > products_dump.json
//   2) Запусти цей скрипт:
//        node backfill_lower.js
//      Він створить update_lower.sql
//   3) Заливаєш назад:
//        wrangler d1 execute koshyk_db --remote --file=update_lower.sql

import { readFileSync, writeFileSync } from "fs";

function readJsonSmart(path) {
  const buf = readFileSync(path);

  // PowerShell '>' часто пише файл у UTF-16LE з BOM (FF FE) —
  // Node за замовчуванням читає як UTF-8, і текст ламається.
  let text;
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.toString("utf16le").slice(1); // прибираємо BOM-символ після конвертації
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16BE — рідкість, але про всяк випадок
    const swapped = Buffer.from(buf);
    for (let i = 0; i < swapped.length - 1; i += 2) {
      const tmp = swapped[i];
      swapped[i] = swapped[i + 1];
      swapped[i + 1] = tmp;
    }
    text = swapped.toString("utf16le").slice(1);
  } else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    text = buf.toString("utf8").slice(1); // UTF-8 BOM
  } else {
    text = buf.toString("utf8");
  }

  return JSON.parse(text);
}

const raw = readJsonSmart("products_dump.json");
// wrangler --json віддає масив з одним об'єктом { results: [...] }
const rows = raw[0]?.results || raw.results || raw;

function escapeSql(str) {
  return (str || "").replace(/'/g, "''");
}

const statements = rows.map((row) => {
  const nameLower = escapeSql((row.name || "").toLowerCase());
  const skuLower = escapeSql((row.sku || "").toLowerCase());
  return `UPDATE products SET name_lower = '${nameLower}', sku_lower = '${skuLower}' WHERE id = ${row.id};`;
});

writeFileSync("update_lower.sql", statements.join("\n") + "\n", { encoding: "utf8" });
console.log(`Готово: ${statements.length} UPDATE-запитів записано в update_lower.sql`);
