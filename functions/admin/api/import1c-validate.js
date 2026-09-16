// POST /admin/api/import1c-validate
// Тіло: сирий JSON-масив products.json з 1С.
// Прогноз (dry-run): рахує ТОЙ САМИЙ diff, що й import1c-commit.js
// (через buildDiff у _import1c-lib.js), нічого не записуючи в D1.

import { buildDiff } from "./_import1c-lib.js";

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

  return json({ ok: true, mode: "preview", ...diff.report });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
