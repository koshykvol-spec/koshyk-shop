// GET /admin/settings — керування site_settings (Telegram-бот, контакти магазину).
// За аналогією з functions/admin/keys.js в AGRO3, тільки без пулу
// ротаційних ключів — тут один бот, не потрібна ротація.

const KNOWN_KEYS = [
  { key: "telegram_bot_token", label: "Telegram Bot Token", hint: "Отримати у @BotFather", secret: true },
  { key: "telegram_chat_id", label: "Telegram Chat ID", hint: "ID чату/каналу, куди приходять сповіщення про замовлення", secret: false },
  { key: "store_phone", label: "Телефон магазину", hint: "Показується в футері сайту та на сторінці Контакти", secret: false },
  { key: "store_address", label: "Адреса самовивозу", hint: "Показується при виборі 'Самовивіз' у кошику та на сторінці Контакти", secret: false },
  { key: "about_text", label: "Сторінка «Про нас»", hint: "Текст у футері сайту в розділі «Про нас». Можна кілька абзаців.", secret: false, multiline: true },
  { key: "contacts_text", label: "Сторінка «Контакти»", hint: "Додатковий текст у розділі «Контакти» (окрім телефону й адреси вище) — графік роботи, посилання на месенджери тощо.", secret: false, multiline: true },
];

export async function onRequestGet(context) {
  const { env } = context;

  const { results } = await env.koshyk_db.prepare("SELECT key, value FROM site_settings").all();
  const current = {};
  results.forEach((r) => { current[r.key] = r.value; });

  return new Response(renderPage(current), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(current) {
  const rows = KNOWN_KEYS.map((k) => {
    const val = current[k.key] || "";
    const displayVal = k.secret && val ? maskSecret(val) : val;
    const fieldHtml = k.multiline
      ? `<textarea class="setting-value setting-textarea" placeholder="не встановлено" data-secret="0" data-original="${val ? "1" : "0"}">${escapeHtml(displayVal)}</textarea>`
      : `<input type="text" class="setting-value" value="${escapeHtml(displayVal)}" placeholder="не встановлено" data-secret="${k.secret ? "1" : "0"}" data-original="${val ? "1" : "0"}">`;
    return `
    <div class="setting-row" data-key="${k.key}">
      <div class="setting-label">
        <label>${escapeHtml(k.label)}</label>
        <span class="hint">${escapeHtml(k.hint)}</span>
      </div>
      <div class="setting-input">
        ${fieldHtml}
        <button type="button" class="save-btn">Зберегти</button>
        <span class="save-status"></span>
      </div>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Налаштування — Адмінка Ощадного Кошика</title>
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
      <a href="/admin/bulk">Масові дії</a>
      <a href="/admin/attributes">Черга доправки</a>
      <a href="/admin/reviews">Відгуки</a>
      <a href="/admin/settings">Налаштування</a>
      <a href="/">← На сайт</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <h1>Налаштування сайту</h1>
  <p class="lede">Telegram-сповіщення про нові замовлення почнуть працювати одразу після заповнення перших двох полів — API вже готовий, лише чекає на ці значення.</p>

  <div class="settings-list">${rows}</div>
</div>

<script>
document.querySelectorAll(".setting-row").forEach(function (row) {
  var key = row.dataset.key;
  var input = row.querySelector(".setting-value");
  var btn = row.querySelector(".save-btn");
  var status = row.querySelector(".save-status");
  var wasMasked = input.dataset.secret === "1" && input.dataset.original === "1";

  input.addEventListener("focus", function () {
    if (wasMasked) { input.value = ""; wasMasked = false; }
  });

  btn.addEventListener("click", function () {
    var value = input.value.trim();
    if (!value) { status.textContent = "Порожнє значення не збережено"; status.className = "save-status error"; return; }
    btn.disabled = true;
    status.textContent = "";
    fetch("/admin/api/settings-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key, value: value }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        btn.disabled = false;
        if (data.ok) {
          status.textContent = "Збережено ✓";
          status.className = "save-status success";
        } else {
          status.textContent = data.error || "Помилка";
          status.className = "save-status error";
        }
      })
      .catch(function () {
        btn.disabled = false;
        status.textContent = "Помилка з'єднання";
        status.className = "save-status error";
      });
  });
});
</script>

</body>
</html>`;
}

function maskSecret(val) {
  if (val.length <= 8) return "•".repeat(val.length);
  return val.slice(0, 4) + "…" + val.slice(-4);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function css() {
  return `
  :root { --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E; --red: #C8462E; --red-deep:#A73A26; --green: #33604A; --green-deep: #244A39; --line: rgba(35,39,31,0.14); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 0 28px 60px; }
  header { padding: 20px 0; margin-bottom: 10px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; flex-wrap: wrap; gap: 10px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 20px; font-size: 0.88rem; font-weight: 600; color: var(--ink-soft); flex-wrap: wrap; }
  nav a:hover { color: var(--ink); }
  h1 { font-family: 'Fraunces', serif; font-size: 1.6rem; margin: 20px 0 10px; }
  .lede { color: var(--ink-soft); font-size: 0.9rem; max-width: 60ch; margin-bottom: 28px; }
  .settings-list { display: flex; flex-direction: column; gap: 14px; }
  .setting-row { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 18px 20px; display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: center; }
  .setting-label label { font-weight: 700; font-size: 0.92rem; display: block; }
  .hint { font-size: 0.78rem; color: var(--ink-soft); }
  .setting-input { display: flex; align-items: center; gap: 10px; }
  .setting-row:has(.setting-textarea) .setting-input { align-items: flex-start; }
  .setting-row:has(.setting-textarea) .save-btn { margin-top: 2px; }
  .setting-value { flex: 1; padding: 9px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-family: 'IBM Plex Mono', monospace; font-size: 0.86rem; color: var(--ink); }
  .setting-textarea { font-family: 'Manrope', sans-serif; min-height: 90px; resize: vertical; line-height: 1.5; }
  .save-btn { background: var(--ink); color: var(--card); border: none; padding: 9px 16px; border-radius: 100px; font-weight: 700; font-size: 0.82rem; cursor: pointer; white-space: nowrap; }
  .save-btn:hover { background: var(--green-deep); }
  .save-status { font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
  .save-status.success { color: var(--green-deep); }
  .save-status.error { color: var(--red-deep); }
  @media (max-width: 620px) { .setting-row { grid-template-columns: 1fr; } }
  `;
}
