// GET /admin/bulk — масове заповнення description/meta_title/meta_description/keywords
// за текстовим шаблоном з підстановками {name}, {brand}, {category}, {price}, {sku}.
//
// Навіщо шаблон, а не AI-генерація: без окремого API-ключа (OpenAI/
// Anthropic у site_settings) і без бюджету на 2030 викликів LLM це
// найпрактичніший спосіб заповнити SEO-поля масово вже зараз. Якщо
// пізніше буде додано ключ для генерації текстів — це природне місце
// для розширення (кнопка "згенерувати AI" поруч із шаблоном).

export async function onRequestGet(context) {
  const { env } = context;
  const { results: categories } = await env.koshyk_db
    .prepare("SELECT slug, name_uk FROM categories ORDER BY sort_order")
    .all();

  return new Response(renderPage(categories), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(categories) {
  const options = categories.map((c) => `<option value="${c.slug}">${escapeHtml(c.name_uk)}</option>`).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Масові дії — Адмінка Ощадного Кошика</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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
  <h1>Масове заповнення описів і SEO</h1>
  <p class="lede">
    Шаблон застосовується одразу до всіх товарів, що потрапляють під фільтр.
    Підстановки: <code>{name}</code> назва, <code>{brand}</code> бренд (якщо порожній — просто зникає),
    <code>{category}</code> категорія, <code>{price}</code> ціна, <code>{sku}</code> артикул.
  </p>

  <div class="panel">
    <h2>1. Кого торкається</h2>
    <div class="filter-row">
      <select id="filterCategory">
        <option value="">Усі категорії</option>
        ${options}
      </select>
      <label class="checkbox-label">
        <input type="checkbox" id="filterMissingOnly" checked>
        Тільки товари без опису
      </label>
    </div>
    <p class="match-count" id="matchCount">Рахуємо…</p>
  </div>

  <div class="panel">
    <h2>2. Шаблони</h2>
    <div class="form-row">
      <label>Опис (буде в описі товару, довільна довжина)</label>
      <textarea id="tplDescription" placeholder="{name} — вигідна пропозиція в категорії «{category}» за {price} ₴.">{name} від {brand} у категорії «{category}». Вигідна ціна — {price} ₴.</textarea>
    </div>
    <div class="form-row">
      <label>Meta title</label>
      <input type="text" id="tplMetaTitle" value="{name} купити за {price} ₴ — Ощадний Кошик">
    </div>
    <div class="form-row">
      <label>Meta description</label>
      <textarea id="tplMetaDescription">{name} в категорії «{category}» за {price} ₴. Купити в Ощадному Кошику.</textarea>
    </div>
    <div class="form-row">
      <label>Ключові слова (через кому)</label>
      <input type="text" id="tplKeywords" value="{name}, {category}, купити, ощадний кошик">
    </div>
  </div>

  <div class="panel">
    <h2>3. Застосувати</h2>
    <button type="button" class="apply-btn" id="applyBtn">Застосувати до <span id="applyCount">0</span> товарів</button>
    <div class="apply-status" id="applyStatus"></div>
  </div>
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
(function () {
  var matchCountEl = document.getElementById("matchCount");
  var applyCountEl = document.getElementById("applyCount");
  var currentTotal = 0;

  function refreshCount() {
    var params = new URLSearchParams();
    if (document.getElementById("filterCategory").value) params.set("category", document.getElementById("filterCategory").value);
    if (document.getElementById("filterMissingOnly").checked) params.set("missingOnly", "1");

    matchCountEl.textContent = "Рахуємо…";
    fetch("/admin/api/bulk-count?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        currentTotal = data.total;
        matchCountEl.textContent = "Під фільтр підпадає: " + data.total + " товарів";
        applyCountEl.textContent = data.total;
      });
  }

  document.getElementById("filterCategory").addEventListener("change", refreshCount);
  document.getElementById("filterMissingOnly").addEventListener("change", refreshCount);
  refreshCount();

  document.getElementById("applyBtn").addEventListener("click", function () {
    if (currentTotal === 0) { alert("Немає товарів під поточний фільтр."); return; }
    if (!confirm("Застосувати шаблон до " + currentTotal + " товарів? Існуючі описи буде перезаписано для товарів, що підпадають під фільтр.")) return;

    var btn = document.getElementById("applyBtn");
    var statusEl = document.getElementById("applyStatus");
    btn.disabled = true;
    statusEl.textContent = "Виконується…";

    var payload = {
      category: document.getElementById("filterCategory").value || null,
      missingOnly: document.getElementById("filterMissingOnly").checked,
      templates: {
        description: document.getElementById("tplDescription").value,
        metaTitle: document.getElementById("tplMetaTitle").value,
        metaDescription: document.getElementById("tplMetaDescription").value,
        keywords: document.getElementById("tplKeywords").value,
      },
    };

    fetch("/admin/api/bulk-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        btn.disabled = false;
        if (data.ok) {
          statusEl.textContent = "Оновлено товарів: " + data.updated + " ✓";
          refreshCount();
        } else {
          statusEl.textContent = data.error || "Помилка";
        }
      })
      .catch(function () {
        btn.disabled = false;
        statusEl.textContent = "Помилка з'єднання";
      });
  });
})();
  `;
}

function css() {
  return `
  :root { --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E; --red: #C8462E; --red-deep:#A73A26; --green: #33604A; --green-deep: #244A39; --line: rgba(35,39,31,0.14); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 28px 60px; }
  header { padding: 20px 0; margin-bottom: 10px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; flex-wrap: wrap; gap: 10px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 18px; font-size: 0.86rem; font-weight: 600; color: var(--ink-soft); flex-wrap: wrap; }
  nav a:hover { color: var(--ink); }
  h1 { font-family: 'Fraunces', serif; font-size: 1.5rem; margin: 20px 0 10px; }
  .lede { color: var(--ink-soft); font-size: 0.86rem; margin-bottom: 26px; line-height: 1.6; }
  .lede code { background: var(--card); border: 1px solid var(--line); padding: 1px 6px; border-radius: 5px; font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; }
  .panel { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 22px; margin-bottom: 18px; }
  .panel h2 { font-family: 'Fraunces', serif; font-size: 1.05rem; margin-bottom: 14px; }
  .filter-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  .filter-row select { padding: 8px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-size: 0.86rem; }
  .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; }
  .match-count { font-family: 'IBM Plex Mono', monospace; font-size: 0.84rem; color: var(--green-deep); font-weight: 600; }
  .form-row { margin-bottom: 16px; }
  .form-row label { display: block; font-size: 0.8rem; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
  .form-row input, .form-row textarea { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-family: 'Manrope', sans-serif; font-size: 0.86rem; }
  .form-row textarea { min-height: 60px; resize: vertical; }
  .apply-btn { width: 100%; background: var(--green); color: var(--card); font-weight: 700; padding: 14px; border-radius: 100px; border: none; cursor: pointer; font-size: 0.94rem; }
  .apply-btn:hover { background: var(--green-deep); }
  .apply-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .apply-status { margin-top: 12px; font-size: 0.86rem; font-weight: 600; color: var(--green-deep); text-align: center; }
  `;
}
