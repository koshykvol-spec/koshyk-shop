// POST /admin/api/review-edit — { id, text }
// Виправлення ОПИСОК у тексті відгуку. Змінюється лише text: автор, оцінка й дата — ні.
// Щоб це не перетворилось на переписування відгуків, сервер приймає правку лише
// якщо новий текст відрізняється від старого не більше ніж на кілька символів
// (відстань Левенштейна ≤ ліміту нижче).

const MAX_LEN = 2000;

// Дозволена кількість змінених символів: 4% довжини, але від 3 до 10.
function allowedEdits(oldLen) {
  return Math.min(10, Math.max(3, Math.ceil(oldLen * 0.04)));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const A = Array.from(a), B = Array.from(b);
  if (!A.length) return B.length;
  if (!B.length) return A.length;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний запит" }, 400);
  }

  const id = parseInt(body && body.id, 10);
  const text = String((body && body.text) || "").trim();
  if (!(id > 0)) return json({ ok: false, error: "Некоректні дані" }, 400);
  if (text.length < 5 || text.length > MAX_LEN) {
    return json({ ok: false, error: "Текст має бути від 5 до " + MAX_LEN + " символів" }, 400);
  }

  const row = await env.koshyk_db.prepare("SELECT text FROM product_reviews WHERE id = ?").bind(id).first();
  if (!row) return json({ ok: false, error: "Відгук не знайдено" }, 404);

  const oldText = String(row.text || "").trim();
  if (oldText === text) return json({ ok: true, text, unchanged: true });

  const dist = levenshtein(oldText, text);
  const limit = allowedEdits(oldText.length);
  if (dist > limit) {
    return json(
      {
        ok: false,
        error:
          "Забагато змін: змінено " + dist + " симв., дозволено до " + limit +
          ". Ця функція лише для виправлення описок; суттєво переписувати відгуки не можна.",
      },
      400
    );
  }

  await env.koshyk_db.prepare("UPDATE product_reviews SET text = ? WHERE id = ?").bind(text, id).run();
  return json({ ok: true, text });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
