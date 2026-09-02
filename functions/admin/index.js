// GET /admin — дашборд-хаб замість прямої таблиці замовлень.
// Статистика підвантажується клієнтським JS з /admin/api/dashboard-stats,
// чіпи ведуть на /admin/products із заповненим фільтром.

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
<title>Адмінка — Ощадний Кошик</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css()}</style>
</head>
<body>

<header>
  <div class="wrap header-row">
    <div class="logo">К · Адмінка Ощадного Кошика</div>
    <nav>
      <a href="/admin" class="active">Дашборд</a>
      <a href="/admin/orders">Замовлення</a>
      <a href="/admin/products">Товари</a>
      <a href="/admin/bulk">Масові дії</a>
      <a href="/admin/brands">Бренди</a>
      <a href="/admin/reviews">Відгуки</a>
      <a href="/admin/settings">Налаштування</a>
      <a href="/">← На сайт</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <form class="search-row" id="searchForm">
    <input type="text" id="quickSearch" placeholder="Пошук за назвою або SKU…">
    <button type="submit">Знайти</button>
  </form>

  <div class="chips" id="statusChips">
    <span class="chip-loading">Рахуємо статистику…</span>
  </div>

  <div class="chips" id="categoryChips"></div>

  <h2 class="section-title">Оберіть розділ</h2>

  <div class="group">
    <div class="group-label">Операційне</div>
    <div class="card-grid">
      <a class="admin-card" href="/admin/orders">
        <span class="card-icon">🛒</span>
        <span class="card-title">Замовлення</span>
        <span class="card-sub" id="ordersSub">…</span>
      </a>
      <a class="admin-card" href="/admin/reviews">
        <span class="card-icon">⭐</span>
        <span class="card-title">Відгуки</span>
        <span class="card-sub" id="reviewsSub">…</span>
      </a>
    </div>
  </div>

  <div class="group">
    <div class="group-label">Каталог</div>
    <div class="card-grid">
      <a class="admin-card" href="/admin/import1c">
        <span class="card-icon">⬆️</span>
        <span class="card-title">Імпорт 1С</span>
        <span class="card-sub">Оновлення цін/наявності з products.json</span>
      </a>
      <a class="admin-card" href="/admin/products">
        <span class="card-icon">📦</span>
        <span class="card-title">Товари</span>
        <span class="card-sub">Пошук, редагування, фото</span>
      </a>
      <a class="admin-card" href="/admin/bulk">
        <span class="card-icon">✨</span>
        <span class="card-title">Масові дії</span>
        <span class="card-sub">Опис, SEO, ключові слова за шаблоном</span>
      </a>
      <a class="admin-card" href="/admin/annotations">
        <span class="card-icon">🧺</span>
        <span class="card-title">Масова заливка</span>
        <span class="card-sub">Через LLM: опис, ключові слова, SEO</span>
      </a>
      <a class="admin-card" href="/admin/attributes">
        <span class="card-icon">🏷️</span>
        <span class="card-title">Черга доправки</span>
        <span class="card-sub" id="reviewSub">Стать/вік для одягу</span>
      </a>
      <a class="admin-card" href="/admin/brands">
        <span class="card-icon">🔖</span>
        <span class="card-title">Бренди</span>
        <span class="card-sub">Заливка з назви товару</span>
      </a>
    </div>
  </div>

  <div class="group">
    <div class="group-label">Налаштування</div>
    <div class="card-grid">
      <a class="admin-card" href="/admin/settings">
        <span class="card-icon">⚙️</span>
        <span class="card-title">Налаштування сайту</span>
        <span class="card-sub">Telegram, контакти</span>
      </a>
    </div>
  </div>
</div>

<script>
document.getElementById("searchForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var q = document.getElementById("quickSearch").value.trim();
  window.location.href = "/admin/products" + (q ? "?search=" + encodeURIComponent(q) : "");
});

fetch("/admin/api/dashboard-stats")
  .then(function (r) { return r.json(); })
  .then(function (data) {
    var statusChips = document.getElementById("statusChips");
    statusChips.innerHTML =
      '<a class="chip chip-all" href="/admin/products">Усі <b>' + data.total + '</b></a>' +
      '<a class="chip" href="/admin/products?missing=description">Без опису <b>' + data.missingDescription + '</b></a>' +
      '<a class="chip" href="/admin/products?missing=photo">Без фото <b>' + data.missingPhoto + '</b></a>' +
      '<a class="chip" href="/admin/products?missing=seo">Без SEO <b>' + data.missingSeo + '</b></a>' +
      '<a class="chip" href="/admin/products?missing=keywords">Без ключових слів <b>' + data.missingKeywords + '</b></a>';

    var categoryChips = document.getElementById("categoryChips");
    categoryChips.innerHTML = data.categories.map(function (c) {
      return '<a class="chip chip-category" href="/admin/products?category=' + c.slug + '">' + c.name + ' <b>' + c.count + '</b></a>';
    }).join("");

    document.getElementById("ordersSub").textContent = data.pendingOrders > 0
      ? data.pendingOrders + " нових замовлень"
      : "Немає нових замовлень";
    document.getElementById("reviewsSub").textContent = data.pendingReviews > 0
      ? data.pendingReviews + " на модерації"
      : "Черга порожня";
    document.getElementById("reviewSub").textContent = data.reviewQueue > 0
      ? data.reviewQueue + " товарів чекають"
      : "Черга порожня";
  })
  .catch(function () {
    document.getElementById("statusChips").innerHTML = '<span class="chip-loading">Не вдалося завантажити статистику</span>';
  });
</script>

</body>
</html>`;
}

function css() {
  return `
  :root { --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E; --red: #C8462E; --red-deep:#A73A26; --green: #33604A; --green-deep: #244A39; --line: rgba(35,39,31,0.14); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px 60px; }
  header { padding: 20px 0; margin-bottom: 10px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; flex-wrap: wrap; gap: 10px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 18px; font-size: 0.88rem; font-weight: 600; color: var(--ink-soft); flex-wrap: wrap; }
  nav a:hover, nav a.active { color: var(--ink); }

  .search-row { display: flex; gap: 10px; margin: 24px 0 20px; }
  .search-row input { flex: 1; padding: 12px 16px; border-radius: 100px; border: 1.5px solid var(--line); background: var(--card); font-size: 0.92rem; }
  .search-row button { background: var(--green); color: var(--card); border: none; padding: 0 24px; border-radius: 100px; font-weight: 700; cursor: pointer; }
  .search-row button:hover { background: var(--green-deep); }

  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1.5px solid var(--line); padding: 8px 14px; border-radius: 100px; font-size: 0.84rem; font-weight: 600; color: var(--ink-soft); }
  .chip:hover { border-color: var(--ink); color: var(--ink); }
  .chip b { color: var(--ink); font-family: 'IBM Plex Mono', monospace; font-weight: 700; }
  .chip-all { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .chip-all b { color: var(--card); }
  .chip-all:hover { color: var(--card); }
  .chip-loading { font-size: 0.84rem; color: var(--ink-soft); padding: 8px 0; }

  .section-title { font-family: 'Fraunces', serif; font-size: 1.3rem; margin: 30px 0 16px; }
  .group { margin-bottom: 28px; }
  .group-label { font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); font-weight: 700; margin-bottom: 10px; }
  .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .admin-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 6px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .admin-card:hover { transform: translateY(-2px); box-shadow: 0 14px 26px -16px rgba(35,39,31,0.3); }
  .card-icon { font-size: 1.5rem; }
  .card-title { font-weight: 700; font-size: 0.98rem; }
  .card-sub { font-size: 0.8rem; color: var(--ink-soft); }

  @media (max-width: 620px) { nav { display: none; } }
  `;
}
