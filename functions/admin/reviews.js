// GET /admin/reviews — черга схвалення відгуків (approved=0),
// плюс список уже схвалених знизу для довідки.

export async function onRequestGet(context) {
  const { env } = context;

  const { results: pending } = await env.koshyk_db
    .prepare(
      `SELECT r.id, r.author_name, r.rating, r.text, r.created_at,
              p.name as product_name, p.slug as product_slug
       FROM product_reviews r JOIN products p ON p.id = r.product_id
       WHERE r.approved = 0
       ORDER BY r.created_at ASC`
    )
    .all();

  const { results: approved } = await env.koshyk_db
    .prepare(
      `SELECT r.id, r.author_name, r.rating, r.created_at, p.name as product_name
       FROM product_reviews r JOIN products p ON p.id = r.product_id
       WHERE r.approved = 1
       ORDER BY r.created_at DESC LIMIT 30`
    )
    .all();

  return new Response(renderPage(pending, approved), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(pending, approved) {
  const pendingHtml = pending.length
    ? pending
        .map(
          (r) => `
    <div class="review-card" data-id="${r.id}">
      <div class="review-card-head">
        <span class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
        <a href="/product/${escapeHtml(r.product_slug)}" target="_blank" class="review-product">${escapeHtml(r.product_name)}</a>
      </div>
      <p class="review-author">${escapeHtml(r.author_name)} · ${new Date(r.created_at).toLocaleString("uk-UA")}</p>
      ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : '<p class="review-text soft">Без тексту</p>'}
      <div class="review-actions">
        <button type="button" class="approve-btn" data-action="approve">✓ Схвалити</button>
        <button type="button" class="reject-btn" data-action="reject">✕ Відхилити</button>
      </div>
    </div>`
        )
        .join("")
    : '<p class="empty">Черга порожня — усі відгуки оброблено.</p>';

  const approvedRows = approved
    .map(
      (r) => `
    <tr>
      <td>${"★".repeat(r.rating)}</td>
      <td>${escapeHtml(r.author_name)}</td>
      <td>${escapeHtml(r.product_name)}</td>
      <td>${new Date(r.created_at).toLocaleDateString("uk-UA")}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Відгуки — Адмінка Ощадного Кошика</title>
<link rel="icon" type="image/png" href="/icon-192.png">
<style>
/* Локальні шрифти замість Google Fonts CDN для адмінки */

/* ---- Fraunces (заголовки; латиниця — кирилиця в шрифті відсутня) ---- */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/fraunces-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/fraunces-latin-700-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

/* ---- Manrope (основний текст) ---- */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-400-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-400-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-400-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-500-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-500-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-500-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-600-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-600-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-700-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-700-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-700-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}

/* ---- IBM Plex Mono (числа в чіпах) ---- */
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/ibm-plex-mono-latin-400-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/ibm-plex-mono-latin-500-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/ibm-plex-mono-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

</style>
<style>${css()}</style>
</head>
<body>

<header>
  <div class="wrap header-row">
    <div class="logo">К · Адмінка Ощадного Кошика</div>
    <nav>
      <a href="/admin">Дашборд</a>
      <a href="/admin/orders">Замовлення</a>
      <a href="/admin/products">Товари</a>
      <a href="/admin/reviews" class="active">Відгуки</a>
      <a href="/admin/settings">Налаштування</a>
      <a href="/">← На сайт</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <h1>Черга схвалення відгуків <span class="count">${pending.length}</span></h1>

  <div class="pending-list" id="pendingList">${pendingHtml}</div>

  ${
    approved.length
      ? `<h2 class="section-title">Останні схвалені</h2>
  <table>
    <thead><tr><th>Оцінка</th><th>Автор</th><th>Товар</th><th>Дата</th></tr></thead>
    <tbody>${approvedRows}</tbody>
  </table>`
      : ""
  }
</div>

<script>${clientJs()}</script>

</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clientJs() {
  return `
document.querySelectorAll(".review-actions button").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var card = btn.closest(".review-card");
    var id = card.dataset.id;
    var action = btn.dataset.action;

    if (action === "reject" && !confirm("Відхилити й видалити цей відгук?")) return;

    card.style.opacity = "0.4";
    card.querySelectorAll("button").forEach(function (b) { b.disabled = true; });

    fetch("/admin/api/review-moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, action: action }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          card.remove();
        } else {
          alert(data.error || "Помилка");
          card.style.opacity = "1";
          card.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
        }
      })
      .catch(function () {
        alert("Помилка з'єднання");
        card.style.opacity = "1";
        card.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
      });
  });
});
  `;
}

function css() {
  return `
  :root { --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E; --red: #C8462E; --red-deep:#A73A26; --green: #33604A; --green-deep: #244A39; --mustard: #E0A400; --line: rgba(35,39,31,0.14); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 0 28px 60px; }
  header { padding: 20px 0; margin-bottom: 10px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; flex-wrap: wrap; gap: 10px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 18px; font-size: 0.88rem; font-weight: 600; color: var(--ink-soft); flex-wrap: wrap; }
  nav a:hover, nav a.active { color: var(--ink); }
  h1 { font-family: 'Fraunces', serif; font-size: 1.6rem; margin: 20px 0 20px; display: flex; align-items: center; gap: 10px; }
  .count { font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; background: var(--card); border: 1px solid var(--line); padding: 3px 10px; border-radius: 100px; color: var(--ink-soft); }
  .section-title { font-family: 'Fraunces', serif; font-size: 1.2rem; margin: 40px 0 16px; }

  .pending-list { display: flex; flex-direction: column; gap: 14px; }
  .review-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 18px 20px; }
  .review-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 8px; }
  .review-stars { color: var(--mustard); font-size: 1rem; letter-spacing: 1px; }
  .review-product { font-size: 0.84rem; font-weight: 700; color: var(--green-deep); }
  .review-product:hover { text-decoration: underline; }
  .review-author { font-size: 0.82rem; color: var(--ink-soft); margin-bottom: 8px; }
  .review-text { font-size: 0.9rem; color: var(--ink); line-height: 1.5; margin-bottom: 14px; }
  .review-text.soft { color: var(--ink-soft); font-style: italic; }
  .review-actions { display: flex; gap: 10px; }
  .approve-btn, .reject-btn { padding: 8px 16px; border-radius: 100px; font-weight: 700; font-size: 0.82rem; cursor: pointer; border: none; }
  .approve-btn { background: var(--green); color: var(--card); }
  .approve-btn:hover { background: var(--green-deep); }
  .reject-btn { background: var(--paper); color: var(--red-deep); border: 1.5px solid var(--line); }
  .reject-btn:hover { border-color: var(--red-deep); }
  .empty { color: var(--ink-soft); padding: 30px 0; }

  table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 14px; overflow: hidden; border: 1.5px solid var(--line); }
  th { text-align: left; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); padding: 10px 14px; border-bottom: 1.5px solid var(--line); }
  td { padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 0.86rem; }
  tr:last-child td { border-bottom: none; }
  `;
}
