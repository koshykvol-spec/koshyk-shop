// GET /admin/brands — масова заливка поля brand за пошуком ключових
// слів-брендів у назві товару (напр. "Бейдж Axent (4501)" -> Axent).

export async function onRequestGet(context) {
  const { env } = context;
  const { results: categories } = await env.koshyk_db
    .prepare("SELECT slug, name_uk FROM categories ORDER BY sort_order")
    .all();

  return new Response(renderPage(categories), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const DEFAULT_BRANDS =
  "Axent, 4Office, Economix, Buromax, Bourgeois, Josefotten, Centropen, Marco, Class, Radius, Piano, Zibi, Aihao, Hiper, Norma, Yes, Polly";

function renderPage(categories) {
  const options = categories.map((c) => `<option value="${c.slug}">${escapeHtml(c.name_uk)}</option>`).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Масова заливка бренду — Адмінка Ощадного Кошика</title>
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
      <a href="/admin/annotations">Масова заливка</a>
      <a href="/admin/brands" class="active">Бренди</a>
      <a href="/admin/reviews">Відгуки</a>
      <a href="/admin/settings">Налаштування</a>
      <a href="/">← На сайт</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <h1>🏷️ Масова заливка бренду</h1>
  <p class="lede">
    Шукає перелічені бренди як окреме слово в назві товару (напр. «Бейдж <b>Axent</b> (4501)» → бренд «Axent»)
    і проставляє поле «Бренд». Реєстр не важливий. Перший бренд зі списку, що знайдеться в назві — переможець.
  </p>

  <div class="panel">
    <h2>1. Список брендів (через кому)</h2>
    <textarea id="brandsInput" class="brands-textarea">${escapeHtml(DEFAULT_BRANDS)}</textarea>
  </div>

  <div class="panel">
    <h2>2. Фільтр</h2>
    <div class="filter-row">
      <select id="categorySelect">
        <option value="">Усі категорії</option>
        ${options}
      </select>
      <label class="checkbox-label">
        <input type="checkbox" id="onlyEmpty" checked>
        Тільки товари без бренду
      </label>
    </div>
  </div>

  <div class="panel">
    <h2>3. Перевірити та залити</h2>
    <div class="step-actions">
      <button type="button" class="btn-secondary" id="previewBtn">Перевірити</button>
      <button type="button" class="btn-primary" id="commitBtn" disabled>Залити</button>
    </div>
    <div id="resultArea"><p class="hint-text">Натисніть «Перевірити», щоб побачити збіги.</p></div>
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
  var lastRows = [];

  function parseBrands() {
    return document.getElementById("brandsInput").value
      .split(",")
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  document.getElementById("previewBtn").addEventListener("click", function () {
    var brands = parseBrands();
    if (!brands.length) { alert("Додайте хоча б один бренд."); return; }

    var resultArea = document.getElementById("resultArea");
    resultArea.innerHTML = '<p class="hint-text">Перевірка…</p>';
    document.getElementById("commitBtn").disabled = true;

    fetch("/admin/api/brands-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: document.getElementById("categorySelect").value || null,
        brands: brands,
        onlyEmpty: document.getElementById("onlyEmpty").checked,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) { resultArea.innerHTML = '<p class="hint-text error">' + (data.error || "Помилка") + '</p>'; return; }
        lastRows = data.rows;
        renderResult(data);
        document.getElementById("commitBtn").disabled = data.matched === 0;
      })
      .catch(function () { resultArea.innerHTML = '<p class="hint-text error">Помилка з\\'єднання</p>'; });
  });

  function renderResult(data) {
    var resultArea = document.getElementById("resultArea");
    var html = '<p class="hint-text">Проскановано: ' + data.scanned + ', знайдено збігів: <b>' + data.matched + '</b></p>';

    if (data.rows.length) {
      html += '<table class="preview-table"><thead><tr><th></th><th>SKU</th><th>Назва</th><th>Було</th><th>Стане</th></tr></thead><tbody>';
      data.rows.forEach(function (r, i) {
        html += '<tr>' +
          '<td><input type="checkbox" class="row-apply" data-index="' + i + '" checked></td>' +
          '<td class="mono">' + escapeHtmlJs(r.sku) + '</td>' +
          '<td>' + escapeHtmlJs(r.name) + '</td>' +
          '<td class="was">' + escapeHtmlJs(r.currentBrand || "—") + '</td>' +
          '<td class="will">' + escapeHtmlJs(r.matchedBrand) + '</td>' +
        '</tr>';
      });
      html += '</tbody></table>';
    }
    resultArea.innerHTML = html;

    document.querySelectorAll(".row-apply").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var idx = parseInt(cb.dataset.index, 10);
        lastRows[idx].willUpdate = cb.checked;
        document.getElementById("commitBtn").disabled = !lastRows.some(function (r) { return r.willUpdate; });
      });
    });
  }

  function escapeHtmlJs(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById("commitBtn").addEventListener("click", function () {
    var toApply = lastRows.filter(function (r) { return r.willUpdate; });
    if (!toApply.length) return;
    if (!confirm("Залити бренд для " + toApply.length + " товарів?")) return;

    var btn = this;
    btn.disabled = true;
    var resultArea = document.getElementById("resultArea");

    fetch("/admin/api/brands-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: toApply }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          resultArea.innerHTML = '<p class="hint-text success">Залито: ' + data.updated + ' товарів ✓</p>';
        } else {
          resultArea.innerHTML = '<p class="hint-text error">' + (data.error || "Помилка") + '</p>';
          btn.disabled = false;
        }
      })
      .catch(function () {
        resultArea.innerHTML = '<p class="hint-text error">Помилка з\\'єднання</p>';
        btn.disabled = false;
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
  .wrap { max-width: 900px; margin: 0 auto; padding: 0 28px 60px; }
  header { padding: 20px 0; margin-bottom: 10px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; flex-wrap: wrap; gap: 10px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 16px; font-size: 0.84rem; font-weight: 600; color: var(--ink-soft); flex-wrap: wrap; }
  nav a:hover, nav a.active { color: var(--ink); }
  h1 { font-family: 'Fraunces', serif; font-size: 1.5rem; margin: 20px 0 10px; }
  .lede { color: var(--ink-soft); font-size: 0.86rem; margin-bottom: 24px; line-height: 1.6; }
  .panel { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 22px; margin-bottom: 16px; }
  .panel h2 { font-family: 'Fraunces', serif; font-size: 1.05rem; margin-bottom: 12px; }
  .brands-textarea { width: 100%; min-height: 70px; padding: 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-family: 'IBM Plex Mono', monospace; font-size: 0.86rem; resize: vertical; }
  .filter-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .filter-row select { padding: 8px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-size: 0.86rem; }
  .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; }
  .step-actions { display: flex; gap: 10px; margin-bottom: 16px; }
  .btn-primary, .btn-secondary { padding: 11px 20px; border-radius: 100px; font-weight: 700; font-size: 0.88rem; cursor: pointer; border: none; }
  .btn-secondary { background: var(--paper); color: var(--ink); border: 1.5px solid var(--line); }
  .btn-secondary:hover { border-color: var(--ink); }
  .btn-primary { background: var(--green); color: var(--card); }
  .btn-primary:hover:not(:disabled) { background: var(--green-deep); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .hint-text { color: var(--ink-soft); font-size: 0.86rem; }
  .hint-text.error { color: var(--red-deep); font-weight: 600; }
  .hint-text.success { color: var(--green-deep); font-weight: 700; }
  .preview-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 10px; }
  .preview-table th { text-align: left; padding: 8px; border-bottom: 1.5px solid var(--line); font-size: 0.72rem; text-transform: uppercase; color: var(--ink-soft); }
  .preview-table td { padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .preview-table .mono { font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; }
  .preview-table .was { color: var(--red-deep); }
  .preview-table .will { color: var(--green-deep); font-weight: 700; }
  `;
}
