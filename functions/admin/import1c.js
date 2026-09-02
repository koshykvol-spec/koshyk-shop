// GET /admin/import1c — імпорт products.json з 1С.
// Логіка синхронізації: оновлюються ціна/наявність/назва/бренд для
// існуючих товарів (за SKU); нові товари додаються; описи, фото та
// SEO-атрибути НЕ чіпаються (окрема відповідальність — редагуються
// вручну або через /admin/annotations). Товари, яких немає в новому
// файлі, позначаються "немає в наявності", а не видаляються —
// історія замовлень і посилання на них лишаються робочими.

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
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css()}</style>
</head>
<body>

<a class="back-link" href="/admin">← до адмінки</a>

<div class="wrap">
  <h1>Імпорт вигрузки 1С</h1>
  <p class="lede">
    1) Оберіть файл <code>products.json</code> з 1С. 2) «Перевірити формат». 3) Якщо помилок немає — «Імпортувати».
    Оновлюються ціни/наявність/назви; нові товари додаються; описи й фото зберігаються.
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
        if (!data.ok) {
          resultBox.innerHTML = '<p class="error">' + escapeHtmlJs(data.error) + '</p>';
          return;
        }
        validated = data.invalidCount === 0 && data.unmatchedCategories.length === 0;
        importBtn.disabled = !validated;

        var html = '<p><b>Товарів у файлі:</b> ' + data.total + '</p>';
        html += '<p><b>Розподіл по категоріях:</b> ' + Object.entries(data.categoryCounts).map(function (e) { return e[0] + ': ' + e[1]; }).join(', ') + '</p>';
        if (data.duplicateSkus.length) {
          html += '<p class="error"><b>Дублі SKU у файлі (' + data.duplicateSkus.length + '):</b> ' + data.duplicateSkus.slice(0, 10).join(', ') + (data.duplicateSkus.length > 10 ? '…' : '') + '</p>';
        }
        if (data.unmatchedCategories.length) {
          html += '<p class="error"><b>Невідомі категорії (' + data.unmatchedCategories.length + '):</b> ' + data.unmatchedCategories.join(', ') + ' — додайте їх у таблицю categories вручну перед імпортом.</p>';
        }
        if (data.invalidCount > 0) {
          html += '<p class="error"><b>Некоректних рядків (без sku/назви/ціни):</b> ' + data.invalidCount + '</p>';
        }
        if (validated) {
          html += '<p class="success">Помилок не знайдено. Можна імпортувати.</p>';
        } else {
          html += '<p class="error">Виправте файл і перевірте ще раз — «Імпортувати» заблоковано, поки є помилки.</p>';
        }
        resultBox.innerHTML = html;
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
        if (!data.ok) {
          resultBox.innerHTML = '<p class="error">' + escapeHtmlJs(data.error) + '</p>';
          return;
        }
        var html =
          '<p class="success">Імпорт завершено ✓</p>' +
          '<p>Рядків у файлі: ' + data.total + '</p>' +
          '<p>Оновлено: ' + data.updated + '</p>' +
          '<p>Додано нових: ' + data.added + '</p>' +
          '<p>Позначено «немає в наявності»: ' + data.markedOutOfStock + '</p>';

        if (data.skippedInvalid > 0) {
          html += '<p class="error"><b>Пропущено (не оновлено й не додано): ' + data.skippedInvalid + '</b></p>';
          if (data.unmatchedCategories.length) {
            html += '<p class="error">Причина — невідома категорія: ' + data.unmatchedCategories.join(', ') + '. Це не одна з 7 категорій магазину — перевірте написання в 1С або додайте категорію в базу.</p>';
          }
          if (data.skippedSamples.length) {
            html += '<p><b>Приклади пропущених товарів:</b></p><ul class="skipped-list">' +
              data.skippedSamples.map(function (s) { return '<li>' + escapeHtmlJs(s.sku) + ' — ' + escapeHtmlJs(s.name) + ' <span class="soft">(категорія: ' + escapeHtmlJs(s.category) + ')</span></li>'; }).join('') +
              '</ul>';
          }
        }
        resultBox.innerHTML = html;
      })
      .catch(function () {
        validateBtn.disabled = false;
        resultBox.innerHTML = '<p class="error">Помилка імпорту. Спробуйте ще раз.</p>';
      });
  });

  function escapeHtmlJs(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
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
  .skipped-list { margin: 6px 0 10px 18px; }
  .skipped-list li { margin-bottom: 4px; }
  .soft { color: var(--ink-soft); font-size: 0.82rem; font-weight: 400; }
  `;
}
