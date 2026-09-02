// GET /search?q=... — глобальний пошук по всьому магазину.
// На відміну від /catalog/:slug, не прив'язана до категорії.

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";

  return new Response(renderPage(q), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(initialQuery) {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${initialQuery ? `Пошук: ${escapeHtml(initialQuery)}` : "Пошук"} — Ощадний Кошик</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css()}</style>
</head>
<body>

${renderHeader()}

<div class="wrap">
  <form class="search-hero" id="searchForm">
    <input type="text" id="searchInput" value="${escapeHtml(initialQuery)}" placeholder="Пошук за назвою або артикулом…" autofocus>
    <button type="submit">Знайти</button>
  </form>

  <p class="result-summary" id="resultSummary"></p>
  <div class="chips" id="categoryChips"></div>

  <div class="layout">
    <aside class="filters">
      <div class="filter-group">
        <h3>Ціна, ₴</h3>
        <div class="price-range">
          <select id="sortSelect">
            <option value="name">За назвою</option>
            <option value="price_asc">Спершу дешевші</option>
            <option value="price_desc">Спершу дорожчі</option>
          </select>
        </div>
      </div>
      <div class="filter-group">
        <label class="instock-label">
          <input type="checkbox" id="inStockOnly">
          Тільки в наявності
        </label>
      </div>
      <div class="filter-group">
        <select id="perPageSelect">
          <option value="12">12 на сторінці</option>
          <option value="24" selected>24 на сторінці</option>
          <option value="48">48 на сторінці</option>
          <option value="96">96 на сторінці</option>
        </select>
      </div>
    </aside>

    <main class="results">
      <div class="grid" id="productGrid"></div>
      <div class="pagination" id="pagination"></div>
    </main>
  </div>
</div>

<footer>
  <div class="wrap foot-row">
    <span>© 2026 Ощадний Кошик · koshyk.pp.ua</span>
    <span><a href="/">← На головну</a></span>
  </div>
</footer>

<script src="/cart.js"></script>
<script>${clientJs()}</script>

</body>
</html>`;
}

function renderHeader() {
  return `<header>
  <div class="wrap header-row">
    <a class="logo" href="/">
      <span class="logo-mark">К</span>
      Ощадний Кошик
    </a>
    <form class="header-search" id="headerSearchForm">
      <input type="text" id="headerSearchInput" placeholder="Пошук товарів…">
      <button type="submit" aria-label="Знайти">🔍</button>
    </form>
    <nav>
      <a href="/#categories">Категорії</a>
      <a href="/#contacts">Контакти</a>
      <a href="/cart.html" class="cart-link">
        Кошик <span id="cartBadge" class="cart-badge" style="display:none">0</span>
      </a>
    </nav>
  </div>
</header>`;
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
  var state = {
    q: new URLSearchParams(window.location.search).get("q") || "",
    sort: "name", page: 1, perPage: 24, inStockOnly: false,
  };

  var grid = document.getElementById("productGrid");
  var pagination = document.getElementById("pagination");
  var resultSummary = document.getElementById("resultSummary");
  var categoryChips = document.getElementById("categoryChips");
  var sortSelect = document.getElementById("sortSelect");
  var inStockOnlyCheckbox = document.getElementById("inStockOnly");
  var perPageSelect = document.getElementById("perPageSelect");
  var searchInput = document.getElementById("searchInput");
  var headerSearchInput = document.getElementById("headerSearchInput");

  var CATEGORY_ICONS = {
    kanctovary: "✏️", gospodarchi: "🧺", igrashky: "🧸", odyah: "👕",
    himiya: "🧴", bizhuteriya: "💍", vzuttya: "👟"
  };

  function escapeHtmlJs(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function fetchData() {
    if (!state.q) {
      grid.innerHTML = '';
      resultSummary.textContent = "Введіть слово для пошуку.";
      pagination.innerHTML = "";
      return;
    }
    var params = new URLSearchParams({
      q: state.q, sort: state.sort, page: state.page, perPage: state.perPage,
    });
    if (state.inStockOnly) params.set("inStockOnly", "1");

    grid.innerHTML = '<div class="loading">Пошук…</div>';

    fetch("/api/search?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) { grid.innerHTML = '<div class="empty">Помилка пошуку.</div>'; return; }
        renderProducts(data.products);
        renderPagination(data.page, data.totalPages);
        renderCategoryChips(data.categories);
        resultSummary.textContent = data.total
          ? "Знайдено " + data.total + " товарів за запитом «" + state.q + "»"
          : "Нічого не знайдено за запитом «" + state.q + "»";
      })
      .catch(function () { grid.innerHTML = '<div class="empty">Помилка з\\'єднання.</div>'; });
  }

  function renderProducts(products) {
    if (!products.length) {
      grid.innerHTML = '<div class="empty">Спробуйте інше формулювання або перевірте написання.</div>';
      return;
    }
    grid.innerHTML = products.map(function (p) {
      var icon = CATEGORY_ICONS[p.categorySlug] || "🛒";
      var thumb = (p.hasRealPhoto && p.imageUrl)
        ? '<div class="product-thumb"><img src="' + p.imageUrl + '" alt="" loading="lazy"></div>'
        : '<div class="product-thumb">' + icon + '</div>';
      var cardClass = "product-card" + (p.inStock === false ? " out-of-stock" : "");
      var badge = p.inStock === false ? '<div class="out-of-stock-badge">Немає в наявності</div>' : "";
      return '' +
        '<a class="' + cardClass + '" href="/product/' + encodeURIComponent(p.slug) + '">' +
          thumb +
          '<div class="product-name">' + escapeHtmlJs(p.name) + '</div>' +
          '<div class="product-meta">' + escapeHtmlJs(p.categoryName) + '</div>' +
          '<div class="product-price">' + p.price.toFixed(2) + ' ₴</div>' +
          badge +
        '</a>';
    }).join("");
  }

  function renderCategoryChips(categories) {
    if (!categories || !categories.length) { categoryChips.innerHTML = ""; return; }
    categoryChips.innerHTML = categories.map(function (c) {
      return '<a class="chip" href="/catalog/' + c.slug + '">' + escapeHtmlJs(c.name) + ' <b>' + c.count + '</b></a>';
    }).join("");
  }

  function renderPagination(page, totalPages) {
    if (totalPages <= 1) { pagination.innerHTML = ""; return; }
    var html = "";
    var start = Math.max(1, page - 2);
    var end = Math.min(totalPages, start + 4);
    for (var i = start; i <= end; i++) {
      html += '<button class="page-btn' + (i === page ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    pagination.innerHTML = html;
    pagination.querySelectorAll(".page-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.page = parseInt(btn.dataset.page, 10);
        fetchData();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function runSearch(q) {
    state.q = q.trim();
    state.page = 1;
    var url = new URL(window.location.href);
    url.searchParams.set("q", state.q);
    window.history.replaceState({}, "", url);
    if (searchInput) searchInput.value = state.q;
    if (headerSearchInput) headerSearchInput.value = state.q;
    fetchData();
  }

  document.getElementById("searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    runSearch(searchInput.value);
  });

  document.getElementById("headerSearchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (window.location.pathname !== "/search") {
      window.location.href = "/search?q=" + encodeURIComponent(headerSearchInput.value.trim());
      return;
    }
    runSearch(headerSearchInput.value);
  });

  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value; state.page = 1; fetchData();
  });
  inStockOnlyCheckbox.addEventListener("change", function () {
    state.inStockOnly = inStockOnlyCheckbox.checked; state.page = 1; fetchData();
  });
  perPageSelect.addEventListener("change", function () {
    state.perPage = parseInt(perPageSelect.value, 10); state.page = 1; fetchData();
  });

  if (headerSearchInput) headerSearchInput.value = state.q;
  fetchData();
})();
  `;
}

function css() {
  return `
  :root { --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E; --red: #C8462E; --red-deep:#A73A26; --green: #33604A; --green-deep: #244A39; --line: rgba(35,39,31,0.14); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }

  header { padding: 22px 0; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.35rem; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .logo-mark { width: 34px; height: 34px; border-radius: 8px; background: var(--green); color: var(--card); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; transform: rotate(-6deg); }
  .header-search { display: flex; flex: 1; max-width: 420px; }
  .header-search input { flex: 1; padding: 10px 16px; border-radius: 100px 0 0 100px; border: 1.5px solid var(--line); border-right: none; background: var(--card); font-size: 0.86rem; }
  .header-search button { border: 1.5px solid var(--line); border-radius: 0 100px 100px 0; background: var(--ink); color: var(--card); padding: 0 16px; cursor: pointer; }
  nav { display: flex; gap: 22px; font-size: 0.9rem; font-weight: 600; color: var(--ink-soft); flex-shrink: 0; }
  nav a:hover { color: var(--ink); }
  .cart-link { position: relative; display: inline-flex; align-items: center; gap: 6px; }
  .cart-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; background: var(--red); color: #fff; border-radius: 100px; font-size: 0.72rem; font-weight: 700; }

  .search-hero { display: flex; gap: 10px; margin: 20px 0; }
  .search-hero input { flex: 1; padding: 14px 20px; border-radius: 100px; border: 1.5px solid var(--line); background: var(--card); font-size: 1rem; }
  .search-hero button { background: var(--ink); color: var(--card); border: none; padding: 0 28px; border-radius: 100px; font-weight: 700; cursor: pointer; }

  .result-summary { color: var(--ink-soft); font-size: 0.9rem; margin-bottom: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1.5px solid var(--line); padding: 7px 13px; border-radius: 100px; font-size: 0.82rem; font-weight: 600; color: var(--ink-soft); }
  .chip:hover { border-color: var(--ink); color: var(--ink); }
  .chip b { color: var(--ink); font-family: 'IBM Plex Mono', monospace; }

  .layout { display: grid; grid-template-columns: 220px 1fr; gap: 30px; padding-bottom: 60px; }
  .filters { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 20px; align-self: start; }
  .filter-group { margin-bottom: 16px; }
  .filter-group:last-child { margin-bottom: 0; }
  .filter-group h3 { font-size: 0.78rem; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 8px; font-weight: 700; }
  #sortSelect, #perPageSelect { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-size: 0.86rem; }
  .instock-label { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; min-height: 200px; }
  .loading, .empty { grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--ink-soft); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; }

  .product-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .product-card:hover { transform: translateY(-3px); box-shadow: 0 18px 30px -20px rgba(35,39,31,0.32); }
  .product-thumb { aspect-ratio: 1; border-radius: 10px; background: var(--paper); display: flex; align-items: center; justify-content: center; font-size: 2.2rem; border: 1px solid var(--line); overflow: hidden; position: relative; }
  .product-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .product-name { font-size: 0.92rem; font-weight: 600; line-height: 1.3; }
  .product-meta { font-size: 0.78rem; color: var(--ink-soft); }
  .product-price { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: var(--red-deep); font-size: 1.02rem; margin-top: auto; }
  .product-card.out-of-stock { opacity: 0.75; }
  .product-card.out-of-stock .product-price { color: var(--ink-soft); text-decoration: line-through; font-weight: 500; }
  .out-of-stock-badge { display: inline-block; background: rgba(200,70,46,0.1); color: var(--red-deep); font-size: 0.74rem; font-weight: 700; padding: 4px 10px; border-radius: 100px; }

  .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 34px; flex-wrap: wrap; }
  .page-btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--card); font-size: 0.86rem; font-weight: 600; cursor: pointer; color: var(--ink-soft); }
  .page-btn.active { background: var(--ink); color: var(--card); border-color: var(--ink); }

  footer { padding: 40px 0; border-top: 1.5px solid var(--line); margin-top: 20px; }
  .foot-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; font-size: 0.86rem; color: var(--ink-soft); }

  @media (max-width: 880px) {
    .layout { grid-template-columns: 1fr; }
    .header-search { display: none; }
    nav { display: flex; }
    .grid { grid-template-columns: repeat(2, 1fr); }
  }
  `;
}
