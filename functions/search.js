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
<script>(function(){try{if(localStorage.getItem("koshykTheme")==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${initialQuery ? `Пошук: ${escapeHtml(initialQuery)}` : "Пошук"} — Ощадний Кошик</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FF3D71'/%3E%3Cstop offset='1' stop-color='%23B94FFF'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)' transform='rotate(-6 32 32)'/%3E%3Ctext x='32' y='44' font-family='Arial, sans-serif' font-weight='800' font-size='34' fill='white' text-anchor='middle'%3EК%3C/text%3E%3C/svg%3E">
<style>
/* Локальні шрифти замість Google Fonts CDN — прибирає зовнішній запит,
   пришвидшує перший рендер (немає блокуючого stylesheet-запиту),
   не залежить від доступності fonts.googleapis.com */

/* ---- Nunito (текст) ---- */
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/nunito-latin-400-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-400-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-ext-400-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/nunito-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-600-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-ext-600-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/nunito-latin-700-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-700-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-ext-700-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("/fonts/nunito-latin-800-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-800-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-ext-800-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("/fonts/nunito-latin-900-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-900-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Nunito';
  font-style: normal;
  font-weight: 900;
  font-display: swap;
  src: url("/fonts/nunito-cyrillic-ext-900-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}

/* ---- Baloo 2 (заголовки; кирилиця в шрифті відсутня) ---- */
@font-face {
  font-family: 'Baloo 2';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/baloo-2-latin-500-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Baloo 2';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/baloo-2-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Baloo 2';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/baloo-2-latin-700-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Baloo 2';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url("/fonts/baloo-2-latin-800-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

</style>
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
<script src="/theme.js"></script>
<script src="/search-autocomplete.js"></script>
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
      <button type="button" id="themeToggle" class="theme-toggle" aria-label="Перемкнути тему">
        <span class="theme-icon-dark">🌙</span>
        <span class="theme-icon-light">☀️</span>
      </button>
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
  :root {
    --bg: #14151F; --card: #1E202E; --ink: #F5F6FA; --ink-soft: #9A9DB0;
    --line: rgba(245, 246, 250, 0.12);
    --coral: #FF3D71; --coral-deep: #FF6B93;
    --teal: #00E5C7; --teal-deep: #4DFFEA;
    --yellow: #FFE600; --blue: #2ED1FF; --pink: #FF3D9A; --purple: #B94FFF; --green: #39FF6A;
    --radius: 20px;
  }
  html[data-theme="light"] {
    --bg: #F4F5FA; --card: #FFFFFF; --ink: #14151F; --ink-soft: #6B6E85;
    --line: rgba(20, 21, 31, 0.12);
    --coral: #E8265D; --coral-deep: #C71C4D;
    --teal: #00A98C; --teal-deep: #00806A;
    --yellow: #E6B800; --blue: #0092C7; --pink: #E62E86; --purple: #8A2BE0; --green: #1FAE4D;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--ink); font-family: 'Nunito', system-ui, sans-serif; transition: background 0.2s ease, color 0.2s ease; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
  h3 { font-family: 'Baloo 2', sans-serif; }

  header { padding: 18px 0; background: var(--card); border-bottom: 2px solid var(--teal); box-shadow: 0 0 20px -4px var(--teal); position: sticky; top: 0; z-index: 20; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .logo { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 1.3rem; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .logo-mark { width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, var(--coral), var(--purple)); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 800; transform: rotate(-6deg); box-shadow: 0 0 16px -2px var(--coral); }
  .header-search { display: flex; flex: 1; max-width: 420px; }
  .header-search input { flex: 1; padding: 10px 16px; border-radius: 100px 0 0 100px; border: 2px solid var(--teal); border-right: none; background: var(--bg); color: var(--ink); font-size: 0.86rem; }
  .header-search input::placeholder { color: var(--ink-soft); }
  .header-search button { border: 2px solid var(--teal); border-radius: 0 100px 100px 0; background: var(--yellow); color: #14151F; padding: 0 16px; cursor: pointer; font-weight: 800; box-shadow: 0 0 14px -2px var(--yellow); }
  .header-search button:hover { background: var(--coral); color: #fff; }
  nav { display: flex; align-items: center; gap: 18px; font-size: 0.9rem; font-weight: 700; color: var(--ink-soft); flex-shrink: 0; }
  nav a:hover { color: var(--ink); }
  .theme-toggle { background: var(--bg); border: 2px solid var(--line); width: 38px; height: 38px; border-radius: 100px; display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; flex-shrink: 0; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  .theme-toggle:hover { border-color: var(--teal); box-shadow: 0 0 14px -3px var(--teal); }
  .theme-icon-light { display: none; }
  html[data-theme="light"] .theme-icon-dark { display: none; }
  html[data-theme="light"] .theme-icon-light { display: inline; }
  .cart-link { position: relative; display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff !important; padding: 9px 16px; border-radius: 100px; box-shadow: 0 0 16px -3px var(--purple); }
  .cart-link:hover { box-shadow: 0 0 22px -2px var(--coral); }
  .cart-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; background: var(--yellow); color: #14151F; border-radius: 100px; font-size: 0.72rem; font-weight: 800; }

  .search-hero { display: flex; gap: 10px; margin: 24px 0; }
  .search-hero input { flex: 1; padding: 14px 20px; border-radius: 100px; border: 2px solid var(--teal); background: var(--card); color: var(--ink); font-size: 1rem; }
  .search-hero input::placeholder { color: var(--ink-soft); }
  .search-hero button { background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff; border: none; padding: 0 28px; border-radius: 100px; font-weight: 800; cursor: pointer; box-shadow: 0 0 16px -3px var(--purple); }
  .search-hero button:hover { box-shadow: 0 0 22px -2px var(--coral); }

  .result-summary { color: var(--ink-soft); font-size: 0.9rem; margin-bottom: 12px; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 2px solid var(--line); padding: 7px 13px; border-radius: 100px; font-size: 0.82rem; font-weight: 700; color: var(--ink-soft); }
  .chip:hover { border-color: var(--teal); color: var(--ink); box-shadow: 0 0 14px -4px var(--teal); }
  .chip b { color: var(--ink); font-family: 'Baloo 2', sans-serif; }

  .layout { display: grid; grid-template-columns: 220px 1fr; gap: 30px; padding-bottom: 60px; }
  .filters { background: var(--card); border: 2px solid var(--line); border-radius: var(--radius); padding: 20px; align-self: start; }
  .filter-group { margin-bottom: 16px; }
  .filter-group:last-child { margin-bottom: 0; }
  .filter-group h3 { font-size: 0.78rem; text-transform: uppercase; color: var(--ink-soft); margin-bottom: 8px; font-weight: 700; }
  #sortSelect, #perPageSelect { width: 100%; padding: 9px 12px; border-radius: 8px; border: 2px solid var(--line); background: var(--bg); color: var(--ink); font-size: 0.86rem; font-weight: 700; cursor: pointer; }
  .instock-label { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; min-height: 200px; }
  .loading, .empty { grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--ink-soft); font-family: 'Baloo 2', sans-serif; font-size: 0.9rem; }

  .product-card { background: var(--card); border: 2px solid var(--line); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; }
  .product-card:hover { transform: translateY(-4px); border-color: var(--teal); box-shadow: 0 0 24px -6px var(--teal); }
  .product-thumb { aspect-ratio: 1; border-radius: 12px; background: var(--bg); display: flex; align-items: center; justify-content: center; font-size: 2.2rem; border: 1px solid var(--line); overflow: hidden; position: relative; }
  .product-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .product-name { font-size: 0.92rem; font-weight: 700; line-height: 1.3; }
  .product-meta { font-size: 0.78rem; color: var(--ink-soft); font-weight: 600; }
  .product-price { font-family: 'Baloo 2', sans-serif; font-weight: 800; color: var(--coral); font-size: 1.05rem; margin-top: auto; }
  .product-card.out-of-stock { opacity: 0.6; }
  .product-card.out-of-stock .product-price { color: var(--ink-soft); text-decoration: line-through; font-weight: 600; }
  .out-of-stock-badge { display: inline-block; background: rgba(255,61,113,0.14); color: var(--coral); font-size: 0.74rem; font-weight: 700; padding: 4px 10px; border-radius: 100px; }

  .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 34px; flex-wrap: wrap; }
  .page-btn { padding: 8px 14px; border-radius: 8px; border: 2px solid var(--line); background: var(--card); font-size: 0.86rem; font-weight: 700; cursor: pointer; color: var(--ink-soft); }
  .page-btn.active { background: var(--teal); color: #14151F; border-color: var(--teal); }

  footer { padding: 40px 0; border-top: 2px solid var(--line); margin-top: 20px; }
  .foot-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; font-size: 0.86rem; color: var(--ink-soft); }

  @media (max-width: 880px) {
    .layout { grid-template-columns: 1fr; }
    .header-search { display: none; }
    nav { display: flex; }
    .grid { grid-template-columns: repeat(2, 1fr); }
  }
  `;
}
