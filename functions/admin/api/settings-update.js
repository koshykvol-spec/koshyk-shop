// POST /admin/api/settings-update — { key, value }
// Upsert у site_settings (INSERT OR REPLACE — D1/SQLite підтримує напряму).

const ALLOWED_KEYS = new Set([
  "telegram_bot_token",
  "telegram_chat_id",
  "store_phone",
  "store_address",
  "about_text",
  "contacts_text",
]);

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const { key, value } = body;
  if (!ALLOWED_KEYS.has(key) || typeof value !== "string" || !value.trim()) {
    return json({ ok: false, error: "Некоректний ключ або значення" }, 400);
  }

  await env.koshyk_db
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, value.trim())
    .run();

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
