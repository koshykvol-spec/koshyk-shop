// GET /admin/annotations — масова заливка тексту (опис/ключові слова/
// meta title/meta description) через зовнішній LLM-чат.
//
// Чому саме такий флоу, а не пряма AI-генерація на сервері: немає
// окремого API-ключа для генерації текстів у site_settings (тільки
// telegram). Людина сама вставляє JSON у свій ChatGPT/Claude і
// повертає результат сюди — нуль додаткових витрат і налаштувань.

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
<title>Масова заливка — Адмінка Ощадного Кошика</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css()}</style>
</head>
<body>

<a class="back-link" href="/admin">← до адмінки</a>

<div class="wrap">
  <h1>🧺 Масова заливка тексту</h1>
  <p class="lede">
    Заповнює обране поле товарів пакетом. Матч по <b>SKU</b> (точно), якщо не знайдено — по точній назві.
    Чіпає лише вибране поле; ціни/наявність/фото не змінюються.
  </p>

  <div class="field-select-row">
    <label>Яке поле заливаємо:</label>
    <select id="fieldSelect">
      <option value="description">Опис товару</option>
      <option value="keywords">Ключові слова</option>
      <option value="meta_title">SEO meta title</option>
      <option value="meta_description">SEO meta description</option>
    </select>
  </div>

  <p class="format-note">
    Формат відповіді LLM — на вибір (визначається автоматично):
    <br>• <b>CSV/TSV</b>: 1-й стовпець — SKU (або назва), 2-й — текст. Багаторядкові значення — в лапках. Роздільник <code>,</code> або таб.
    <br>• <b>JSON</b>: <code>[{"sku":"00-123","text":"…"}]</code>
  </p>

  <div class="panel">
    <h2>Крок 1 · Експорт товарів на (пере)заливку</h2>
    <p class="panel-sub">Віддає JSON-список товарів — готовий вхід для LLM. Наступний експорт дає наступну порцію (залиті зникають самі, бо більше не підпадають під фільтр).</p>

    <div class="export-controls">
      <label>які:
        <select id="exportFilter">
          <option value="missing">без поля</option>
          <option value="short">короткі (менше N символів)</option>
          <option value="all">усі</option>
        </select>
      </label>
      <label>N симв.: <input type="number" id="exportN" value="200" style="width:70px"></label>
      <label>за раз: <input type="number" id="exportBatch" value="50" style="width:70px"></label>
      <label>розділ:
        <select id="exportCategory">
          <option value="">усі розділи</option>
          ${options}
        </select>
      </label>
    </div>
    <button type="button" class="btn-primary" id="exportBtn">⬇ Експорт</button>
    <div class="export-status" id="exportStatus"></div>
    <textarea id="exportOutput" class="export-output" readonly hidden></textarea>
  </div>

  <div class="panel collapsible">
    <button type="button" class="collapsible-head" id="promptToggle">▶ Крок 2 · 📋 Промпт для LLM (розгорнути / скопіювати)</button>
    <div class="collapsible-body" id="promptBody" hidden>
      <textarea id="promptText" class="export-output" readonly></textarea>
      <button type="button" class="btn-secondary" id="copyPromptBtn">Скопіювати промпт</button>
    </div>
  </div>

  <div class="panel">
    <h2>Крок 3 · Встав відповідь LLM <span class="panel-sub-inline">(або обери файл)</span></h2>
    <label class="file-btn">
      📁 Файл (.csv/.tsv/.json/.txt)
      <input type="file" id="fileInput" accept=".csv,.tsv,.json,.txt" hidden>
    </label>
    <textarea id="pasteInput" class="paste-area" placeholder="00-12345,Опис товару одним рядком
00-22222,&quot;Опис, що містить кому
і перенос рядка&quot;"></textarea>

    <div class="merge-row">
      <label>Якщо поле вже заповнене:
        <select id="mergePolicy">
          <option value="weak">перезаписати лише слабкі (короткі &lt; N) — добрі лишити</option>
          <option value="always">завжди перезаписати</option>
          <option value="skip">лишити, якщо вже є</option>
        </select>
      </label>
      <label>N симв.: <input type="number" id="mergeN" value="200" style="width:70px"></label>
    </div>
  </div>

  <div class="panel">
    <h2>Крок 4</h2>
    <div class="step4-actions">
      <button type="button" class="btn-secondary" id="previewBtn">Перевірити</button>
      <button type="button" class="btn-primary" id="commitBtn" disabled>Залити</button>
    </div>
    <div id="previewArea"><p class="hint-text">Встав дані або оберіть файл, потім натисни «Перевірити».</p></div>
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
  var FIELD_LABELS = {
    description: "опис",
    keywords: "ключові слова (через кому)",
    meta_title: "SEO meta title (до 60 символів)",
    meta_description: "SEO meta description (до 160 символів)"
  };

  var lastPreviewRows = [];

  var FIELD_RULES = {
    description:
      "ПРАВИЛА:\\n" +
      "- Мова: українська. Лише звичайний текст — БЕЗ HTML, markdown, емодзі, списків.\\n" +
      "- Довжина: 300–500 символів (2–4 речення). Перші ~150 символів — суть + назва товару (йдуть у meta-опис Google).\\n" +
      "- Зміст: що це, для чого, ключова користь; природно вплети назву й категорію (SEO), без «води» й порожніх обіцянок.\\n" +
      "- ФАКТИ: спирайся ЛИШЕ на назву та надані поля. Ціни серед наданих полів НЕМАЄ навмисно — не згадуй і не вигадуй ціну: вона показується окремо й живо, а текст опису так не оновлюється.\\n" +
      "- sku не змінюй і не вигадуй. Один товар = один об'єкт у масиві. За раз обробляй до 30–50 товарів.",
    keywords:
      "ПРАВИЛА:\\n" +
      "- Мова: українська. Лише звичайний текст — БЕЗ HTML, markdown, емодзі.\\n" +
      "- Формат: 5–10 ключових слів/словосполучень через кому, без нумерації.\\n" +
      "- Зміст: пошукові запити, за якими покупець міг би шукати саме цей товар; природно включи назву й категорію.\\n" +
      "- ФАКТИ: спирайся ЛИШЕ на назву та надані поля. Ціни серед наданих полів НЕМАЄ навмисно — не вигадуй і не включай ціну як ключове слово: вона показується окремо й живо.\\n" +
      "- sku не змінюй і не вигадуй. Один товар = один об'єкт у масиві. За раз обробляй до 30–50 товарів.",
    meta_title:
      "ПРАВИЛА:\\n" +
      "- Мова: українська. Лише звичайний текст — БЕЗ HTML, markdown, емодзі.\\n" +
      "- Довжина: до 60 символів, один рядок.\\n" +
      "- Зміст: назва товару + ключова характеристика або категорія; те, що показується як заголовок у Google.\\n" +
      "- ФАКТИ: спирайся ЛИШЕ на назву та надані поля. Ціни серед наданих полів НЕМАЄ навмисно — не згадуй і не вигадуй ціну: вона показується окремо й живо, а заголовок так не оновлюється.\\n" +
      "- sku не змінюй і не вигадуй. Один товар = один об'єкт у масиві. За раз обробляй до 30–50 товарів.",
    meta_description:
      "ПРАВИЛА:\\n" +
      "- Мова: українська. Лише звичайний текст — БЕЗ HTML, markdown, емодзі, списків.\\n" +
      "- Довжина: 120–160 символів, 1–2 речення.\\n" +
      "- Зміст: суть товару + причина купити саме тут; це текст під заголовком у видачі Google.\\n" +
      "- ФАКТИ: спирайся ЛИШЕ на назву та надані поля. Ціни серед наданих полів НЕМАЄ навмисно — не згадуй і не вигадуй ціну: вона показується окремо й живо, а цей текст так не оновлюється.\\n" +
      "- sku не змінюй і не вигадуй. Один товар = один об'єкт у масиві. За раз обробляй до 30–50 товарів.",
  };

  document.getElementById("promptToggle").addEventListener("click", function () {
    var body = document.getElementById("promptBody");
    var isHidden = body.hidden;
    body.hidden = !isHidden;
    this.textContent = (isHidden ? "▼" : "▶") + " Крок 2 · 📋 Промпт для LLM (розгорнути / скопіювати)";
    if (isHidden) updatePromptText();
  });

  function updatePromptText() {
    var field = document.getElementById("fieldSelect").value;
    var label = FIELD_LABELS[field];
    var rules = FIELD_RULES[field];
    var exported = document.getElementById("exportOutput").value || "[ ... тут буде список товарів після Кроку 1 ... ]";
    var prompt =
      "Ти копірайтер інтернет-магазину \\"Ощадний Кошик\\" (Україна). " +
      "Для кожного товару зі списку нижче напиши " + label + ".\\n\\n" +
      rules + "\\n\\n" +
      "Поверни ВИКЛЮЧНО JSON-масив у форматі [{\\"sku\\":\\"...\\",\\"text\\":\\"...\\"}], " +
      "без жодного додаткового тексту навколо.\\n\\n" +
      "СПИСОК ТОВАРІВ (JSON):\\n" + exported;
    document.getElementById("promptText").value = prompt;
  }

  document.getElementById("copyPromptBtn").addEventListener("click", function () {
    var ta = document.getElementById("promptText");
    ta.select();
    document.execCommand("copy");
    this.textContent = "Скопійовано ✓";
    var self = this;
    setTimeout(function () { self.textContent = "Скопіювати промпт"; }, 1500);
  });

  document.getElementById("exportBtn").addEventListener("click", function () {
    var field = document.getElementById("fieldSelect").value;
    var filter = document.getElementById("exportFilter").value;
    var n = document.getElementById("exportN").value;
    var batch = document.getElementById("exportBatch").value;
    var category = document.getElementById("exportCategory").value;

    var params = new URLSearchParams({ field: field, filter: filter, n: n, batch: batch });
    if (category) params.set("category", category);

    var statusEl = document.getElementById("exportStatus");
    statusEl.textContent = "Завантаження…";

    fetch("/admin/api/annotations-export?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) { statusEl.textContent = data.error || "Помилка"; return; }
        var out = document.getElementById("exportOutput");
        out.value = JSON.stringify(data.products, null, 2);
        out.hidden = false;
        statusEl.textContent = "Знайдено " + data.count + " товарів. Скопіюйте текст нижче в LLM (Крок 2 дає готовий промпт).";
      })
      .catch(function () { statusEl.textContent = "Помилка з'єднання"; });
  });

  document.getElementById("fileInput").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      document.getElementById("pasteInput").value = ev.target.result;
    };
    reader.readAsText(file);
  });

  // Парсер CSV/TSV з підтримкою лапок (кома/перенос рядка всередині поля) + JSON.
  function parseInput(text) {
    text = text.trim();
    if (!text) return [];

    if (text[0] === "[") {
      try {
        var arr = JSON.parse(text);
        return arr.map(function (item) {
          return { sku: item.sku || item.SKU || "", text: item.text || item.annotation || item.description || "" };
        });
      } catch (e) {
        return [];
      }
    }

    // CSV/TSV state-machine парсер (підтримує лапки з комами/переносами рядків усередині)
    var delimiter = text.indexOf("\\t") !== -1 && text.split("\\n")[0].indexOf("\\t") !== -1 ? "\\t" : ",";
    var rows = [];
    var field = "";
    var row = [];
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === delimiter) { row.push(field); field = ""; }
        else if (ch === "\\n" || ch === "\\r") {
          if (ch === "\\r" && text[i + 1] === "\\n") i++;
          row.push(field); field = "";
          if (row.length > 1 || row[0]) rows.push(row);
          row = [];
        } else { field += ch; }
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }

    return rows.filter(function (r) { return r.length >= 2 && r[0]; }).map(function (r) {
      return { sku: r[0].trim(), text: r.slice(1).join(delimiter === "\\t" ? "\\t" : ",").trim() };
    });
  }

  document.getElementById("previewBtn").addEventListener("click", function () {
    var raw = document.getElementById("pasteInput").value;
    var items = parseInput(raw);
    var previewArea = document.getElementById("previewArea");

    if (!items.length) {
      previewArea.innerHTML = '<p class="hint-text">Не вдалося розпізнати дані. Перевірте формат.</p>';
      return;
    }

    previewArea.innerHTML = '<p class="hint-text">Перевірка…</p>';

    fetch("/admin/api/annotations-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: document.getElementById("fieldSelect").value,
        items: items,
        mergePolicy: document.getElementById("mergePolicy").value,
        n: document.getElementById("mergeN").value,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) { previewArea.innerHTML = '<p class="hint-text">' + (data.error || "Помилка") + '</p>'; return; }
        lastPreviewRows = data.rows;
        renderPreview(data.rows);
        document.getElementById("commitBtn").disabled = !data.rows.some(function (r) { return r.willUpdate; });
      })
      .catch(function () { previewArea.innerHTML = '<p class="hint-text">Помилка з\\'єднання</p>'; });
  });

  function renderPreview(rows) {
    var previewArea = document.getElementById("previewArea");
    var notMatched = rows.filter(function (r) { return !r.matched; });
    var matched = rows.filter(function (r) { return r.matched; });

    var html = '<p class="hint-text">Знайдено: ' + matched.length + ' з ' + rows.length + (notMatched.length ? ' (' + notMatched.length + ' не зіставлено)' : '') + '</p>';
    html += '<table class="preview-table"><thead><tr><th></th><th>SKU</th><th>Назва</th><th>Було</th><th>Стане</th></tr></thead><tbody>';
    matched.forEach(function (r, i) {
      html += '<tr' + (!r.willUpdate ? ' class="row-skip"' : '') + '>' +
        '<td><input type="checkbox" class="row-apply" data-index="' + i + '" ' + (r.willUpdate ? "checked" : "") + '></td>' +
        '<td class="mono">' + escapeHtmlJs(r.sku) + (r.matchedBy === "name" ? ' <span class="soft">(по назві)</span>' : '') + '</td>' +
        '<td>' + escapeHtmlJs(r.name) + '</td>' +
        '<td class="was">' + escapeHtmlJs(r.was || "—") + '</td>' +
        '<td class="will">' + escapeHtmlJs(r.willBecome) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    previewArea.innerHTML = html;

    document.querySelectorAll(".row-apply").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var idx = parseInt(cb.dataset.index, 10);
        matched[idx].willUpdate = cb.checked;
        cb.closest("tr").classList.toggle("row-skip", !cb.checked);
        document.getElementById("commitBtn").disabled = !matched.some(function (r) { return r.willUpdate; });
      });
    });

    lastPreviewRows = matched;
  }

  function escapeHtmlJs(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById("commitBtn").addEventListener("click", function () {
    var toApply = lastPreviewRows.filter(function (r) { return r.willUpdate; });
    if (!toApply.length) return;
    if (!confirm("Залити " + toApply.length + " товарів?")) return;

    var btn = this;
    btn.disabled = true;
    var previewArea = document.getElementById("previewArea");

    fetch("/admin/api/annotations-commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: document.getElementById("fieldSelect").value, rows: toApply }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          previewArea.innerHTML = '<p class="hint-text success">Залито: ' + data.updated + ' товарів ✓</p>';
          document.getElementById("pasteInput").value = "";
        } else {
          previewArea.innerHTML = '<p class="hint-text">' + (data.error || "Помилка") + '</p>';
          btn.disabled = false;
        }
      })
      .catch(function () {
        previewArea.innerHTML = '<p class="hint-text">Помилка з\\'єднання</p>';
        btn.disabled = false;
      });
  });

  document.getElementById("fieldSelect").addEventListener("change", updatePromptText);
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
  .wrap { max-width: 900px; margin: 20px auto 0; padding: 0 28px; }
  h1 { font-family: 'Fraunces', serif; font-size: 1.6rem; margin-bottom: 8px; }
  .lede { color: var(--ink-soft); font-size: 0.88rem; margin-bottom: 18px; line-height: 1.6; }
  .field-select-row { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; font-size: 0.9rem; font-weight: 600; }
  .field-select-row select { padding: 8px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--card); font-size: 0.88rem; }
  .format-note { font-size: 0.82rem; color: var(--ink-soft); background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; line-height: 1.7; }
  .format-note code { background: var(--paper); padding: 1px 5px; border-radius: 4px; font-family: 'IBM Plex Mono', monospace; }
  .panel { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 22px; margin-bottom: 16px; }
  .panel h2 { font-family: 'Fraunces', serif; font-size: 1.05rem; margin-bottom: 6px; }
  .panel-sub { font-size: 0.82rem; color: var(--ink-soft); margin-bottom: 16px; }
  .panel-sub-inline { font-size: 0.8rem; color: var(--ink-soft); font-weight: 400; }
  .export-controls { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; font-size: 0.86rem; }
  .export-controls select, .export-controls input { padding: 7px 10px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-size: 0.84rem; }
  .btn-primary { background: var(--green); color: var(--card); border: none; padding: 12px 22px; border-radius: 100px; font-weight: 700; cursor: pointer; font-size: 0.9rem; }
  .btn-primary:hover { background: var(--green-deep); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary { background: var(--paper); color: var(--ink); border: 1.5px solid var(--line); padding: 11px 20px; border-radius: 100px; font-weight: 700; cursor: pointer; font-size: 0.9rem; }
  .btn-secondary:hover { border-color: var(--ink); }
  .export-status { font-size: 0.82rem; color: var(--green-deep); font-weight: 600; margin-top: 10px; }
  .export-output { width: 100%; min-height: 120px; margin-top: 12px; padding: 12px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--paper); font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; resize: vertical; }
  .collapsible-head { width: 100%; text-align: left; background: none; border: none; font-family: 'Fraunces', serif; font-size: 1.05rem; cursor: pointer; padding: 0; color: var(--ink); }
  .collapsible-body { margin-top: 14px; }
  .file-btn { display: inline-block; background: var(--green); color: var(--card); padding: 10px 18px; border-radius: 100px; font-weight: 700; font-size: 0.86rem; cursor: pointer; margin-bottom: 12px; }
  .file-btn:hover { background: var(--green-deep); }
  .paste-area { width: 100%; min-height: 130px; padding: 14px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--paper); font-family: 'IBM Plex Mono', monospace; font-size: 0.84rem; resize: vertical; }
  .merge-row { display: flex; gap: 16px; align-items: center; margin-top: 14px; font-size: 0.86rem; flex-wrap: wrap; }
  .merge-row select, .merge-row input { padding: 7px 10px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-size: 0.84rem; }
  .step4-actions { display: flex; gap: 10px; margin-bottom: 16px; }
  .hint-text { color: var(--ink-soft); font-size: 0.86rem; }
  .hint-text.success { color: var(--green-deep); font-weight: 700; }
  .preview-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 10px; }
  .preview-table th { text-align: left; padding: 8px; border-bottom: 1.5px solid var(--line); font-size: 0.74rem; text-transform: uppercase; color: var(--ink-soft); }
  .preview-table td { padding: 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .preview-table .mono { font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; }
  .preview-table .was { color: var(--red-deep); max-width: 200px; }
  .preview-table .will { color: var(--green-deep); max-width: 220px; }
  .preview-table .soft { color: var(--ink-soft); font-size: 0.74rem; }
  .row-skip { opacity: 0.45; }
  `;
}
