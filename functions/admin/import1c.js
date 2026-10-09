// GET /admin/import1c — імпорт products.json з 1С.
// «Перевірити формат» → /admin/api/import1c-validate (dry-run, нічого не пише).
// «Імпортувати» → /admin/api/import1c-commit (реальний запис).
// Обидва повертають ОДНАКОВУ структуру звіту (buildDiff у _import1c-lib.js),
// тому renderReport() на клієнті один для обох режимів.

export async function onRequestGet() {
  return new Response(renderPage(), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage() {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Імпорт з 1С — Адмінка Ощадного Кошика</title>
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

<a class="back-link" href="/admin">← до адмінки</a>

<div class="wrap">
  <h1>Імпорт вигрузки 1С</h1>
  <p class="lede">
    1) Оберіть файл <code>products.json</code> з 1С. 2) «Перевірити формат» — показує прогноз, нічого не змінює.
    3) Якщо помилок немає — «Імпортувати». Оновлюються ціни/наявність/назви; нові товари додаються; описи й фото зберігаються.
    Товари, яких немає у новому файлі, автоматично позначаються «немає в наявності» (не видаляються).
  </p>

  <label class="file-btn">
    📁 Виберіть файл
    <input type="file" id="fileInput" accept=".json" hidden>
  </label>
  <span class="file-name" id="fileName">Файл не вибрано</span>

  <div class="actions">
    <button type="button" class="btn-secondary" id="validateBtn" disabled>① Перевірити формат</button>
    <button type="button" class="btn-primary" id="importBtn" disabled>② Імпортувати</button>
  </div>

  <div class="result-box" id="resultBox">Файл не обрано.</div>
</div>

<script>${clientJs()}</script>

</body>
</html>`;
}

function clientJs() {
  return `
(function () {
  var fileContent = null;
  var validated = false;

  var fileInput = document.getElementById("fileInput");
  var fileName = document.getElementById("fileName");
  var validateBtn = document.getElementById("validateBtn");
  var importBtn = document.getElementById("importBtn");
  var resultBox = document.getElementById("resultBox");

  fileInput.addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    fileName.textContent = file.name;
    validated = false;
    importBtn.disabled = true;
    resultBox.textContent = "Файл обрано. Натисніть «Перевірити формат».";

    var reader = new FileReader();
    reader.onload = function (ev) {
      fileContent = ev.target.result;
      validateBtn.disabled = false;
    };
    reader.onerror = function () {
      resultBox.textContent = "Не вдалося прочитати файл.";
    };
    reader.readAsText(file);
  });

  function esc(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function section(title, obj, fmt, openByDefault) {
    if (!obj || !obj.total) return "";
    var rows = (obj.sample || []).map(fmt).join("");
    var more = obj.total > (obj.sample || []).length
      ? '<div class="soft">…ще ' + (obj.total - obj.sample.length) + '</div>' : "";
    return '<details' + (openByDefault ? ' open' : '') + '>' +
      '<summary>' + title + ': ' + obj.total + '</summary>' +
      '<ul class="change-list">' + rows + more + '</ul></details>';
  }

  // Один рендер для preview (mode:"preview") і commit (mode:"commit") —
  // формулювання підлаштовується під режим, структура однакова.
  function renderReport(d) {
    if (!d || !d.ok) {
      return '<p class="error">' + esc((d && d.error) || 'помилка') + '</p>';
    }
    var preview = d.mode === "preview";
    var html = '<p class="success">' + (preview ? '🔎 Прогноз (нічого не змінено)' : 'Імпорт завершено ✓') + '</p>';
    html += '<p>Рядків у файлі: ' + d.total + '</p>';
    html += '<p>' + (preview ? 'Буде оновлено' : 'Оновлено') + ': ' + d.updated +
            ' &nbsp; ' + (preview ? 'Буде додано нових' : 'Додано нових') + ': ' + d.added +
            ' &nbsp; ' + (preview ? 'Стане «немає в наявності»' : 'Позначено «немає в наявності»') + ': ' + d.markedOutOfStock + '</p>';

    html += section(
      preview ? '➕ Будуть додані (sku · назва → категорія)' : '➕ Додані (sku · назва → категорія)',
      d.created,
      function (p) { return '<li>' + esc(p.sku) + ' · ' + esc(p.name) + ' <span class="soft">→ ' + esc(p.category) + '</span></li>'; },
      true
    );
    html += section(
      '🔄 Знову в наявності (0→в наявності)',
      d.backInStock,
      function (p) { return '<li>' + esc(p.sku) + ' · ' + esc(p.name) + '</li>'; },
      true
    );
    html += section(
      '💸 Зміна ціни (стара → нова)',
      d.priceChanges,
      function (p) { return '<li>' + esc(p.sku) + ' · ' + esc(p.name) + ': <b>' + p.old + ' → ' + p.neu + '</b></li>'; },
      true
    );
    html += section(
      '🔀 Зміна категорії/бренду',
      d.moved,
      function (p) { return '<li>' + esc(p.sku) + ' · ' + esc(p.name) + ': ' + esc(p.oldC) + '→' + esc(p.newC) +
        (p.oldB !== p.newB ? ' / бренд ' + esc(p.oldB) + '→' + esc(p.newB) : '') + '</li>'; },
      false
    );
    html += section(
      preview
        ? '⏸ Будуть позначені недоступними самою 1С (inStock: false) — нових: ' + (d.wentUnavailableNewCount || 0)
        : '⏸ Позначено недоступними самою 1С (inStock: false) — нових: ' + (d.wentUnavailableNewCount || 0),
      d.wentUnavailableInFile,
      function (p) { return '<li>' + esc(p.sku) + ' · ' + esc(p.name) + (p.alreadyInactive ? ' <span class="soft">(вже було відсутнє)</span>' : '') + '</li>'; },
      false
    );
    html += section(
      preview
        ? '🗑 Зникнуть з вигрузки (є в базі, нема у файлі) — буде деактивовано: ' + (d.disappearedNewCount || 0)
        : '🗑 Зникли з вигрузки (є в базі, нема у файлі) — деактивовано: ' + (d.disappearedNewCount || 0),
      d.disappeared,
      function (p) { return '<li>' + esc(p.sku) + ' · ' + esc(p.name) + (p.alreadyInactive ? ' <span class="soft">(вже було відсутнє)</span>' : '') + '</li>'; },
      false
    );
    html += section(
      '⚠️ Дублі sku в базі (виправити в 1С)',
      d.dupSkus,
      function (p) { return '<li><b>' + esc(p.sku) + '</b>: ' + esc((p.names || []).join('  |  ')) + '</li>'; },
      false
    );

    if (d.duplicateSkusInFile && d.duplicateSkusInFile.length) {
      html += '<p class="error"><b>Дублі SKU у самому файлі (' + d.duplicateSkusInFile.length + '):</b> ' +
        d.duplicateSkusInFile.slice(0, 10).map(esc).join(', ') + (d.duplicateSkusInFile.length > 10 ? '…' : '') + '</p>';
    }
    if (d.skippedInvalid > 0) {
      html += '<p class="error"><b>Пропущено (не оновлено й не додано): ' + d.skippedInvalid + '</b></p>';
      if (d.unmatchedCategories && d.unmatchedCategories.length) {
        html += '<p class="error">Причина — невідома категорія: ' + d.unmatchedCategories.map(esc).join(', ') +
          '. Це не одна з 7 категорій магазину — перевірте написання в 1С або додайте категорію в базу.</p>';
      }
      if (d.skippedSamples && d.skippedSamples.length) {
        html += '<p><b>Приклади пропущених товарів:</b></p><ul class="skipped-list">' +
          d.skippedSamples.map(function (s) {
            return '<li>' + esc(s.sku) + ' — ' + esc(s.name) + ' <span class="soft">(категорія: ' + esc(s.category) + ')</span></li>';
          }).join('') + '</ul>';
      }
    }
    if (preview) {
      var blocked = d.skippedInvalid > 0 || (d.unmatchedCategories && d.unmatchedCategories.length) || (d.duplicateSkusInFile && d.duplicateSkusInFile.length);
      html += blocked
        ? '<p class="error">Виправте файл і перевірте ще раз — «Імпортувати» заблоковано, поки є помилки.</p>'
        : '<p class="success">Помилок не знайдено. Можна імпортувати.</p>';
    }
    return html;
  }

  validateBtn.addEventListener("click", function () {
    if (!fileContent) return;
    resultBox.textContent = "Перевірка…";
    validateBtn.disabled = true;

    fetch("/admin/api/import1c-validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: fileContent,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        validateBtn.disabled = false;
        resultBox.innerHTML = renderReport(data);
        validated = data.ok && data.skippedInvalid === 0 &&
          (!data.unmatchedCategories || data.unmatchedCategories.length === 0) &&
          (!data.duplicateSkusInFile || data.duplicateSkusInFile.length === 0);
        importBtn.disabled = !validated;
      })
      .catch(function () {
        validateBtn.disabled = false;
        resultBox.innerHTML = '<p class="error">Помилка перевірки. Файл може бути надто великим або пошкодженим.</p>';
      });
  });

  importBtn.addEventListener("click", function () {
    if (!fileContent || !validated) return;
    if (!confirm("Імпортувати файл? Ціни/наявність/назви оновляться, нові товари додадуться, товари поза файлом стануть «немає в наявності».")) return;

    importBtn.disabled = true;
    validateBtn.disabled = true;
    resultBox.textContent = "Імпортування… це може зайняти хвилину для великих файлів.";

    fetch("/admin/api/import1c-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: fileContent,
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        validateBtn.disabled = false;
        resultBox.innerHTML = renderReport(data);
      })
      .catch(function () {
        validateBtn.disabled = false;
        resultBox.innerHTML = '<p class="error">Помилка імпорту. Спробуйте ще раз.</p>';
      });
  });
})();
  `;
}

function css() {
  return `
  :root { --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E; --red: #C8462E; --red-deep:#A73A26; --green: #33604A; --green-deep: #244A39; --line: rgba(35,39,31,0.14); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; padding: 20px 0 60px; }
  a { color: inherit; }
  .back-link { display: inline-block; margin: 0 0 0 28px; background: var(--card); border: 1.5px solid var(--line); padding: 8px 16px; border-radius: 100px; font-size: 0.84rem; font-weight: 600; text-decoration: none; }
  .wrap { max-width: 760px; margin: 20px auto 0; padding: 0 28px; }
  h1 { font-family: 'Fraunces', serif; font-size: 1.6rem; margin-bottom: 12px; }
  .lede { color: var(--ink-soft); font-size: 0.86rem; margin-bottom: 22px; line-height: 1.7; }
  .lede code { background: var(--card); border: 1px solid var(--line); padding: 1px 6px; border-radius: 5px; font-family: 'IBM Plex Mono', monospace; }
  .file-btn { display: inline-block; background: var(--green); color: var(--card); padding: 12px 22px; border-radius: 100px; font-weight: 700; font-size: 0.9rem; cursor: pointer; }
  .file-btn:hover { background: var(--green-deep); }
  .file-name { margin-left: 12px; color: var(--ink-soft); font-size: 0.88rem; }
  .actions { display: flex; gap: 10px; margin: 20px 0; }
  .btn-primary, .btn-secondary { padding: 12px 22px; border-radius: 100px; font-weight: 700; font-size: 0.88rem; cursor: pointer; border: none; }
  .btn-secondary { background: var(--paper); color: var(--ink); border: 1.5px solid var(--line); }
  .btn-secondary:hover:not(:disabled) { border-color: var(--ink); }
  .btn-primary { background: var(--green); color: var(--card); }
  .btn-primary:hover:not(:disabled) { background: var(--green-deep); }
  .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .result-box { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 20px 22px; font-size: 0.88rem; line-height: 1.7; color: var(--ink-soft); }
  .result-box p { margin-bottom: 8px; }
  .result-box .error { color: var(--red-deep); font-weight: 600; }
  .result-box .success { color: var(--green-deep); font-weight: 700; }
  .result-box details { margin: 10px 0; border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }
  .result-box summary { cursor: pointer; font-weight: 600; }
  .change-list { margin: 8px 0 0 4px; max-height: 260px; overflow-y: auto; }
  .change-list li { list-style: none; font-size: 0.84rem; padding: 3px 0; border-bottom: 1px solid var(--line); }
  .skipped-list { margin: 6px 0 10px 18px; }
  .skipped-list li { margin-bottom: 4px; }
  .soft { color: var(--ink-soft); font-size: 0.82rem; font-weight: 400; }
  `;
}
