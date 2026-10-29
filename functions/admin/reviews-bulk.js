// /admin/reviews-bulk — масовий імпорт СПРАВЖНІХ відгуків покупців
// (Google, Facebook, Prom, листування з клієнтами).
//
// Вхід: JSON-масив або CSV/TSV із заголовком. Поля:
//   sku (або id, або product — точна назва товару), author, rating (1–5), text, date (необов'язково)
// Потік: вставити → «Перевірити» (нічого не пишеться) → «Залити».
// Дублі (той самий товар + автор + текст) пропускаються, тож повторна заливка безпечна.
// Оцінки не змінюються й не обмежуються: 1–5 як є в оригіналі.

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const escapeHtml = (str) =>
  String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ---------- парсинг ----------

function parseCsv(text, delim) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch === "\r") { /* ігноруємо */ }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const ALIASES = {
  sku: ["sku", "артикул", "код"],
  id: ["id", "product_id", "pid"],
  product: ["product", "product_name", "товар", "назва"],
  author: ["author", "author_name", "автор", "ім'я", "імя", "name"],
  rating: ["rating", "оцінка", "рейтинг", "stars"],
  text: ["text", "review", "відгук", "текст", "comment"],
  date: ["date", "created_at", "дата"],
};

function pick(rec, key) {
  const lower = {};
  for (const k of Object.keys(rec)) lower[k.trim().toLowerCase()] = rec[k];
  for (const a of ALIASES[key]) if (lower[a] != null && String(lower[a]).trim() !== "") return String(lower[a]).trim();
  return "";
}

function parseInput(raw) {
  raw = raw.replace(/^﻿/, "").replace(/^```[\w]*[\r\n]+/m, "").replace(/[\r\n]+```\s*$/m, "").trim();
  if (!raw) throw new Error("Порожньо");
  if (raw[0] === "[" || raw[0] === "{") {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [data];
  }
  const first = raw.split("\n")[0];
  const counts = { "\t": 0, ";": 0, ",": 0 };
  for (const ch of first) if (ch in counts) counts[ch]++;
  const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows = parseCsv(raw, delim);
  if (rows.length < 2) throw new Error("У CSV потрібен рядок заголовків і хоча б один відгук");
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] != null ? r[i] : ""; });
    return o;
  });
}

function parseDate(s) {
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (d) m = [null, d[3], d[2].padStart(2, "0"), d[1].padStart(2, "0")];
  }
  if (!m) return null;
  const y = +m[1], mo = +m[2], da = +m[3];
  if (y < 2000 || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]} 12:00:00`;
}

// ---------- GET: сторінка ----------

export async function onRequestGet() {
  return new Response(renderPage(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ---------- POST: перевірка / заливка ----------
// POST /admin/reviews-bulk?dryrun=1&approve=1

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const dry = url.searchParams.get("dryrun") === "1";
  const approve = url.searchParams.get("approve") === "1" ? 1 : 0;
  const db = env.koshyk_db;

  let recs;
  try {
    recs = parseInput(await request.text());
  } catch (e) {
    return json({ ok: false, error: "Не вдалося розібрати дані: " + e.message }, 400);
  }
  if (!recs.length) return json({ ok: false, error: "Порожньо" }, 400);
  if (recs.length > 2000) return json({ ok: false, error: "Забагато записів за раз (макс. 2000)" }, 400);

  const products = (await db.prepare("SELECT id, sku, name FROM products").all()).results || [];
  const byId = new Map(), bySku = new Map(), byName = new Map();
  for (const p of products) {
    byId.set(p.id, p);
    bySku.set(String(p.sku).trim().toLowerCase(), p);
    const k = String(p.name).trim().toLowerCase();
    byName.set(k, byName.has(k) ? null : p); // null = неоднозначна назва
  }

  const existing = (await db.prepare("SELECT product_id, author_name, text FROM product_reviews").all()).results || [];
  const seen = new Set(existing.map((r) => `${r.product_id}|${String(r.author_name).trim().toLowerCase()}|${String(r.text || "").trim()}`));

  const Ins = db.prepare(
    "INSERT INTO product_reviews (product_id, author_name, rating, text, created_at, approved) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const stmts = [];
  const added = [], notFound = [], invalid = [], duplicates = [];
  const today = new Date().toISOString().slice(0, 10) + " 12:00:00";

  recs.forEach((rec, idx) => {
    const line = idx + 1;
    const sku = pick(rec, "sku"), idRaw = pick(rec, "id"), prodName = pick(rec, "product");
    const author = pick(rec, "author").slice(0, 100);
    const rating = parseInt(pick(rec, "rating"), 10);
    const text = pick(rec, "text").slice(0, 2000);

    if (!author || !(rating >= 1 && rating <= 5)) {
      invalid.push(`№${line}: потрібні author та rating 1–5`);
      return;
    }
    let p = null;
    if (sku) p = bySku.get(sku.toLowerCase());
    if (!p && idRaw) p = byId.get(parseInt(idRaw, 10));
    if (!p && prodName) p = byName.get(prodName.toLowerCase());
    if (!p) {
      notFound.push(`№${line}: ${sku || idRaw || prodName || "(без ідентифікатора товару)"}`);
      return;
    }
    const key = `${p.id}|${author.toLowerCase()}|${text}`;
    if (seen.has(key)) {
      duplicates.push(`№${line}: ${p.sku} — ${author}`);
      return;
    }
    seen.add(key);
    added.push({ sku: p.sku, product: p.name, author, rating, text });
    if (!dry) stmts.push(Ins.bind(p.id, author, rating, text || null, parseDate(pick(rec, "date")) || today, approve));
  });

  if (!dry) {
    for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  }

  const cap = (a, n) => ({ total: a.length, sample: a.slice(0, n) });
  return json({
    ok: true,
    dryrun: dry,
    approve: !!approve,
    total: recs.length,
    willAdd: added.length,
    added: cap(added, 60),
    notFound: cap(notFound, 40),
    invalid: cap(invalid, 40),
    duplicates: cap(duplicates, 40),
  });
}

// ---------- UI ----------

function renderPage() {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Масовий імпорт відгуків — Адмінка Ощадного Кошика</title>
<link rel="icon" type="image/png" href="/icon-192.png">
<style>
@font-face{font-family:'Fraunces';font-weight:700;font-display:swap;src:url("/fonts/admin/fraunces-latin-700-normal.woff2") format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
@font-face{font-family:'Manrope';font-weight:400;font-display:swap;src:url("/fonts/admin/manrope-latin-400-normal.woff2") format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
@font-face{font-family:'Manrope';font-weight:400;font-display:swap;src:url("/fonts/admin/manrope-cyrillic-400-normal.woff2") format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+2116}
@font-face{font-family:'Manrope';font-weight:600;font-display:swap;src:url("/fonts/admin/manrope-latin-600-normal.woff2") format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
@font-face{font-family:'Manrope';font-weight:600;font-display:swap;src:url("/fonts/admin/manrope-cyrillic-600-normal.woff2") format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+2116}
@font-face{font-family:'Manrope';font-weight:700;font-display:swap;src:url("/fonts/admin/manrope-latin-700-normal.woff2") format("woff2");unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
@font-face{font-family:'Manrope';font-weight:700;font-display:swap;src:url("/fonts/admin/manrope-cyrillic-700-normal.woff2") format("woff2");unicode-range:U+0400-045F,U+0490-0491,U+2116}
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
      <a href="/admin/reviews">Відгуки</a>
      <a href="/admin/reviews-bulk" class="active">Імпорт відгуків</a>
      <a href="/admin/settings">Налаштування</a>
      <a href="/">← На сайт</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <h1>💬 Масовий імпорт відгуків</h1>
  <p class="lede">Для справжніх відгуків покупців (Google, Facebook, Prom, листування). Нічого не вигадується й не змінюється: оцінка та текст заливаються як є. Дублі пропускаються.</p>

  <div class="box">
    <b>Формат</b> — JSON-масив або CSV/TSV із заголовком:
    <pre>sku;author;rating;text;date
00-00001338;Олена К.;5;Гарний зошит, папір щільний;2026-09-14
РТ-00012105;Іван;4;Доставили швидко;12.10.2026</pre>
    <div class="soft">Товар шукається за <code>sku</code>, далі за <code>id</code>, далі за точною назвою (<code>product</code>). <code>date</code> необов'язкова (YYYY-MM-DD або ДД.ММ.РРРР); без неї ставиться сьогоднішня. <code>rating</code> — 1–5.</div>
  </div>

  <p>
    <label class="btn gray" style="cursor:pointer">📂 Обрати файл (.json / .csv / .txt)
      <input type="file" id="f" accept=".json,.csv,.tsv,.txt,text/plain,text/csv,application/json" hidden>
    </label>
    <span id="fn" class="soft">або вставте дані нижче ↓</span>
  </p>
  <textarea id="ta" placeholder="sku;author;rating;text;date"></textarea>

  <label class="check"><input type="checkbox" id="appr"> Одразу показувати на сайті (без черги модерації)</label>
  <p class="soft" style="margin-top:-6px">Якщо не відмічено, відгуки потраплять у чергу «Відгуки» й чекатимуть схвалення.</p>

  <p>
    <button class="btn" id="chk">Перевірити</button>
    <button class="btn green" id="imp" disabled>Залити</button>
    <span id="s" class="soft"></span>
  </p>
  <div id="o" class="out">Вставте дані або оберіть файл.</div>
</div>

<script>${clientJs()}</script>
</body>
</html>`;
}

function clientJs() {
  return `
var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

$("f").onchange = function (e) {
  var file = e.target.files[0]; if (!file) return;
  $("fn").textContent = file.name;
  file.text().then(function (t) { $("ta").value = t; $("imp").disabled = true; });
};
$("ta").oninput = function () { $("imp").disabled = true; };
$("appr").onchange = function () { $("imp").disabled = true; };

function post(dry) {
  var u = "/admin/reviews-bulk?" + (dry ? "dryrun=1&" : "") + ($("appr").checked ? "approve=1" : "");
  return fetch(u, { method: "POST", headers: { "Content-Type": "text/plain" }, body: $("ta").value })
    .then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "Не JSON (HTTP " + r.status + ")" }; });
    });
}

function section(title, obj, fmt, open) {
  if (!obj || !obj.total) return "";
  var rows = obj.sample.map(fmt).join("");
  var more = obj.total > obj.sample.length ? '<div class="soft">…ще ' + (obj.total - obj.sample.length) + "</div>" : "";
  return '<details' + (open || obj.total <= 10 ? " open" : "") + '><summary>' + title + ": " + obj.total + "</summary>" +
    '<div class="rows">' + rows + more + "</div></details>";
}

function render(d, dry) {
  if (!d || !d.ok) return '<div class="err">❌ ' + esc(d && d.error || "помилка") + "</div>";
  var h = '<div class="sum"><b>' + (dry ? "🔎 Перевірка" : "✅ Залито") + "</b> — записів: " + d.total +
    "<br>✅ " + (dry ? "буде додано" : "додано") + ": <b>" + d.willAdd + "</b> &nbsp; " +
    "❓ товар не знайдено: <b>" + d.notFound.total + "</b> &nbsp; " +
    "⚠️ некоректні: <b>" + d.invalid.total + "</b> &nbsp; " +
    "♻️ дублі: <b>" + d.duplicates.total + "</b>" +
    (d.willAdd ? "<br>" + (d.approve ? "Відгуки одразу з'являться на сайті." : "Відгуки підуть у чергу модерації.") : "") + "</div>";
  h += section("✅ Нові відгуки", d.added, function (x) {
    return '<div class="row"><b class="mono">' + esc(x.sku) + "</b> · " + esc(x.product) + "<br>" + esc(x.author) + ' <span class="stars">' +
      "★".repeat(x.rating) + "☆".repeat(5 - x.rating) + "</span><div>" + esc(x.text) + "</div></div>";
  }, true);
  h += section("❓ Товар не знайдено", d.notFound, function (x) { return '<div class="row">' + esc(x) + "</div>"; });
  h += section("⚠️ Некоректні рядки", d.invalid, function (x) { return '<div class="row">' + esc(x) + "</div>"; });
  h += section("♻️ Вже є в базі (пропущено)", d.duplicates, function (x) { return '<div class="row">' + esc(x) + "</div>"; });
  return h;
}

$("chk").onclick = function () {
  if (!$("ta").value.trim()) { alert("Вставте дані або оберіть файл"); return; }
  $("s").textContent = "перевірка…";
  post(true).then(function (d) {
    $("s").textContent = "";
    $("o").innerHTML = render(d, true);
    $("imp").disabled = !(d && d.ok && d.willAdd > 0);
  }).catch(function () { $("s").textContent = "помилка з'єднання"; });
};

$("imp").onclick = function () {
  if (!confirm("Залити відгуки в базу?")) return;
  $("s").textContent = "заливка…"; $("imp").disabled = true;
  post(false).then(function (d) {
    $("s").textContent = d && d.ok ? "✅ Готово" : "❌ Помилка";
    $("o").innerHTML = render(d, false);
  }).catch(function () { $("s").textContent = "помилка з'єднання"; });
};
  `;
}

function css() {
  return `
  :root { --paper:#EBE7DB; --card:#FFFDF7; --ink:#23271F; --ink-soft:#565A4E; --red:#C8462E; --green:#33604A; --green-deep:#244A39; --mustard:#E0A400; --line:rgba(35,39,31,0.14); }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--paper); color:var(--ink); font-family:'Manrope',system-ui,sans-serif; }
  a { color:inherit; text-decoration:none; }
  .wrap { max-width:900px; margin:0 auto; padding:0 28px 60px; }
  header { padding:20px 0; margin-bottom:10px; }
  .header-row { display:flex; justify-content:space-between; align-items:center; max-width:1180px; margin:0 auto; padding:0 28px; flex-wrap:wrap; gap:10px; }
  .logo { font-family:'Fraunces',serif; font-weight:700; font-size:1.2rem; }
  nav { display:flex; gap:18px; font-size:.88rem; font-weight:600; color:var(--ink-soft); flex-wrap:wrap; }
  nav a:hover, nav a.active { color:var(--ink); }
  h1 { font-family:'Fraunces',serif; font-size:1.6rem; margin:20px 0 10px; }
  .lede { color:var(--ink-soft); font-size:.9rem; line-height:1.5; margin-bottom:16px; }
  .soft { color:var(--ink-soft); font-size:.82rem; }
  .box { background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:14px 18px; margin-bottom:16px; font-size:.9rem; }
  pre { background:var(--paper); padding:10px; border-radius:8px; white-space:pre-wrap; margin:8px 0; font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:.8rem; }
  code, .mono { font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:.82rem; background:var(--paper); padding:1px 5px; border-radius:4px; }
  textarea { width:100%; min-height:180px; border:1.5px solid var(--line); border-radius:12px; padding:12px; font-family:'IBM Plex Mono',ui-monospace,monospace; font-size:.82rem; background:var(--card); margin:10px 0; }
  .check { display:flex; align-items:center; gap:8px; font-size:.88rem; margin:6px 0 12px; }
  .btn { display:inline-block; background:var(--ink); color:var(--card); border:0; padding:10px 18px; border-radius:100px; font-weight:700; font-size:.85rem; cursor:pointer; font-family:inherit; }
  .btn.gray { background:var(--ink-soft); }
  .btn.green { background:var(--green); }
  .btn.green:hover { background:var(--green-deep); }
  .btn:disabled { background:#aaa; cursor:not-allowed; }
  .out { background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:14px 18px; font-size:.88rem; }
  .sum { background:#E3EDE5; padding:10px 14px; border-radius:10px; margin-bottom:10px; line-height:1.7; }
  .err { color:var(--red); font-weight:600; }
  details { margin:8px 0; border:1px solid var(--line); border-radius:10px; padding:6px 12px; background:var(--paper); }
  summary { cursor:pointer; font-weight:700; }
  .rows { margin:8px 0 4px; line-height:1.5; }
  .row { padding:6px 0; border-bottom:1px solid var(--line); }
  .row:last-child { border-bottom:0; }
  .stars { color:var(--mustard); letter-spacing:1px; }
  `;
}
