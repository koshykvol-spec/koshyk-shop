// Pages Function: GET /catalog/:slug
// Віддає HTML-шаблон каталогу. Дані товарів підвантажуються клієнтським
// JS з /api/catalog/:slug — сама функція тільки перевіряє існування
// категорії (щоб миттєво віддати 404 для неіснуючих slug) і вставляє
// назву категорії в <title>/<h1> без додаткового round-trip на клієнті.

const CATEGORY_ICONS = {
  kanctovary: "✏️",
  gospodarchi: "🧺",
  igrashky: "🧸",
  odyah: "👕",
  himiya: "🧴",
  bizhuteriya: "💍",
  vzuttya: "👟",
};

export async function onRequestGet(context) {
  const { env, params } = context;
  const slug = params.slug;

  const category = await env.koshyk_db
    .prepare("SELECT slug, name_uk FROM categories WHERE slug = ?")
    .bind(slug)
    .first();

  if (!category) {
    return new Response(renderNotFound(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const icon = CATEGORY_ICONS[category.slug] || "🛒";
  const isClothing = category.slug === "odyah" || category.slug === "vzuttya";

  return new Response(renderPage(category.slug, category.name_uk, icon, isClothing), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="UTF-8"><title>Категорію не знайдено — Ощадний Кошик</title></head>
<body style="font-family:sans-serif;padding:60px;text-align:center;">
  <h1>Категорію не знайдено</h1>
  <p><a href="/">← На головну</a></p>
</body></html>`;
}

function renderPage(slug, nameUk, icon, isClothing) {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nameUk} — Ощадний Кошик</title>
<meta name="description" content="${nameUk} за ощадними цінами в інтернет-магазині Ощадний Кошик.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
${sharedCss()}
</style>
</head>
<body data-slug="${slug}" data-clothing="${isClothing ? "1" : "0"}">

<header>
  <div class="wrap header-row">
    <a class="logo" href="/">
      <span class="logo-mark">К</span>
      Ощадний Кошик
    </a>
    <form class="header-search" action="/search" method="get">
      <input type="text" name="q" placeholder="Пошук товарів…">
      <button type="submit" aria-label="Знайти">🔍</button>
    </form>
    <nav>
      <a href="/#categories">Категорії</a>
      <a href="/#about">Про нас</a>
      <a href="/#contacts">Контакти</a>
      <a href="/cart.html" class="cart-link">
        Кошик <span id="cartBadge" class="cart-badge" style="display:none">0</span>
      </a>
    </nav>
  </div>
</header>

<div class="wrap crumbs">
  <a href="/">Головна</a> <span>/</span> <span>${nameUk}</span>
</div>

<div class="wrap cat-header">
  <div class="cat-header-icon">${icon}</div>
  <div>
    <h1>${nameUk}</h1>
    <p class="cat-header-count" id="resultCount">Завантаження…</p>
  </div>
</div>

<div class="wrap layout">
  <aside class="filters" id="filters">
    <div class="filters-head">
      <h2>Фільтри</h2>
      <button class="clear-btn" id="clearFilters" type="button">Скинути</button>
    </div>

    <div class="filter-group" id="genderGroup" hidden>
      <h3>Стать / вік</h3>
      <div class="chips" id="genderChips"></div>
    </div>

    <div class="filter-group">
      <h3>Ціна, ₴</h3>
      <div class="price-range">
        <input type="number" id="minPrice" placeholder="від" min="0">
        <span>—</span>
        <input type="number" id="maxPrice" placeholder="до" min="0">
      </div>
    </div>

    <div class="filter-group" id="brandGroup" hidden>
      <h3>Бренд</h3>
      <div class="brand-list" id="brandList"></div>
    </div>

    <button class="apply-btn" id="applyFilters" type="button">Застосувати</button>
  </aside>

  <main class="results">
    <div class="results-bar">
      <button class="mobile-filter-toggle" id="mobileFilterToggle" type="button">⚙️ Фільтри</button>
      <div class="results-controls">
        <select id="sortSelect">
          <option value="name">За назвою</option>
          <option value="price_asc">Спершу дешевші</option>
          <option value="price_desc">Спершу дорожчі</option>
        </select>
        <label class="instock-label">
          <input type="checkbox" id="inStockOnly">
          Тільки в наявності
        </label>
        <select id="perPageSelect">
          <option value="12">12 на сторінці</option>
          <option value="24" selected>24 на сторінці</option>
          <option value="48">48 на сторінці</option>
          <option value="96">96 на сторінці</option>
        </select>
      </div>
    </div>

    <div class="grid" id="productGrid">
      <div class="loading">Завантаження товарів…</div>
    </div>

    <div class="pagination" id="pagination"></div>
  </main>
</div>

<footer>
  <div class="wrap foot-row">
    <span>© 2026 Ощадний Кошик · koshyk.pp.ua</span>
    <span><a href="/">← На головну</a></span>
  </div>
</footer>

<script src="/cart.js"></script>
<script>
${clientJs(icon)}
</script>

</body>
</html>`;
}

function sharedCss() {
  return `
  :root {
    --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E;
    --red: #C8462E; --red-deep: #A73A26; --green: #33604A; --green-deep: #244A39;
    --mustard: #E0A400; --line: rgba(35, 39, 31, 0.14); --radius: 14px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }

  header { padding: 22px 0; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.35rem; display: flex; align-items: center; gap: 10px; }
  .logo-mark { width: 34px; height: 34px; border-radius: 8px; background: var(--green); color: var(--card); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; transform: rotate(-6deg); flex-shrink: 0; }
  nav { display: flex; gap: 26px; font-size: 0.94rem; font-weight: 600; color: var(--ink-soft); }
  nav a:hover { color: var(--ink); }
  .cart-link { position: relative; display: inline-flex; align-items: center; gap: 6px; }
  .header-search { display: flex; flex: 1; max-width: 380px; margin: 0 20px; }
  .header-search input { flex: 1; padding: 10px 16px; border-radius: 100px 0 0 100px; border: 1.5px solid var(--line); border-right: none; background: var(--card); font-size: 0.86rem; }
  .header-search button { border: 1.5px solid var(--line); border-radius: 0 100px 100px 0; background: var(--ink); color: var(--card); padding: 0 16px; cursor: pointer; }
  .cart-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; background: var(--red); color: #fff; border-radius: 100px; font-size: 0.72rem; font-weight: 700; }

  .crumbs { padding: 4px 28px 18px; font-size: 0.86rem; color: var(--ink-soft); }
  .crumbs a:hover { color: var(--ink); }
  .crumbs span { margin: 0 4px; }

  .cat-header { display: flex; align-items: center; gap: 18px; padding-bottom: 30px; }
  .cat-header-icon { width: 56px; height: 56px; border-radius: 14px; background: var(--card); border: 1.5px solid var(--line); display: flex; align-items: center; justify-content: center; font-size: 1.7rem; flex-shrink: 0; }
  .cat-header h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(1.6rem, 3vw, 2.1rem); letter-spacing: -0.01em; }
  .cat-header-count { color: var(--ink-soft); font-family: 'IBM Plex Mono', monospace; font-size: 0.88rem; margin-top: 4px; }

  .layout { display: grid; grid-template-columns: 260px 1fr; gap: 30px; align-items: start; padding-bottom: 60px; }

  .filters { background: var(--card); border: 1.5px solid var(--line); border-radius: var(--radius); padding: 22px; position: sticky; top: 20px; }
  .filters-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .filters-head h2 { font-family: 'Fraunces', serif; font-size: 1.1rem; font-weight: 600; }
  .clear-btn { font-size: 0.8rem; color: var(--red-deep); font-weight: 600; background: none; border: none; cursor: pointer; }
  .filter-group { margin-bottom: 20px; }
  .filter-group h3 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); margin-bottom: 10px; font-weight: 700; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { font-size: 0.82rem; padding: 6px 12px; border-radius: 100px; border: 1.5px solid var(--line); background: var(--paper); cursor: pointer; font-weight: 600; color: var(--ink-soft); }
  .chip.active { background: var(--green); border-color: var(--green); color: var(--card); }
  .price-range { display: flex; align-items: center; gap: 8px; }
  .price-range input { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1.5px solid var(--line); font-family: 'IBM Plex Mono', monospace; font-size: 0.86rem; background: var(--paper); color: var(--ink); }
  .brand-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  .brand-list label { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; }
  .apply-btn { width: 100%; background: var(--ink); color: var(--card); font-weight: 700; padding: 12px; border-radius: 100px; border: none; cursor: pointer; font-size: 0.92rem; margin-top: 6px; }
  .apply-btn:hover { background: var(--green-deep); }

  .results-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
  .mobile-filter-toggle { display: none; background: var(--card); border: 1.5px solid var(--line); border-radius: 100px; padding: 10px 16px; font-weight: 600; font-size: 0.86rem; cursor: pointer; }
  .results-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .instock-label { display: flex; align-items: center; gap: 6px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; white-space: nowrap; }
  #sortSelect, #perPageSelect { padding: 9px 14px; border-radius: 100px; border: 1.5px solid var(--line); background: var(--card); font-size: 0.86rem; font-weight: 600; color: var(--ink); cursor: pointer; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; min-height: 200px; }
  .loading, .empty { grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--ink-soft); font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; }

  .product-card { background: var(--card); border: 1.5px solid var(--line); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: transform 0.15s ease, box-shadow 0.15s ease; }
  .product-card:hover { transform: translateY(-3px); box-shadow: 0 18px 30px -20px rgba(35,39,31,0.32); }
  .product-thumb { aspect-ratio: 1; border-radius: 10px; background: var(--paper); display: flex; align-items: center; justify-content: center; font-size: 2.2rem; border: 1px solid var(--line); overflow: hidden; position: relative; }
  .product-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .product-name { font-size: 0.92rem; font-weight: 600; line-height: 1.3; }
  .product-meta { font-size: 0.78rem; color: var(--ink-soft); }
  .product-price { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: var(--red-deep); font-size: 1.02rem; margin-top: auto; }
  .product-card.out-of-stock { opacity: 0.75; }
  .product-card.out-of-stock .product-price { color: var(--ink-soft); text-decoration: line-through; font-weight: 500; }
  .out-of-stock-badge { display: inline-block; background: rgba(200,70,46,0.1); color: var(--red-deep); font-size: 0.74rem; font-weight: 700; padding: 4px 10px; border-radius: 100px; margin-top: 4px; }

  .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 34px; flex-wrap: wrap; }
  .page-btn { padding: 8px 14px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--card); font-size: 0.86rem; font-weight: 600; cursor: pointer; color: var(--ink-soft); }
  .page-btn.active { background: var(--ink); color: var(--card); border-color: var(--ink); }

  footer { padding: 40px 0; border-top: 1.5px solid var(--line); margin-top: 20px; }
  .foot-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; font-size: 0.86rem; color: var(--ink-soft); }

  @media (max-width: 880px) {
    .layout { grid-template-columns: 1fr; }
    .filters { display: none; position: fixed; inset: auto 0 0 0; top: 10%; z-index: 50; border-radius: 20px 20px 0 0; overflow-y: auto; }
    .filters.open { display: block; }
    .mobile-filter-toggle { display: inline-block; }
    .grid { grid-template-columns: repeat(2, 1fr); }
    nav a:not(.cart-link) { display: none; }
    .header-search { max-width: none; margin: 0 12px; }
    .header-row { flex-wrap: nowrap; }
  }
  @media (max-width: 480px) {
    .grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  }
  `;
}

function clientJs(icon) {
  return `
(function () {
  var body = document.body;
  var slug = body.dataset.slug;
  var isClothing = body.dataset.clothing === "1";
  var icon = ${JSON.stringify(icon)};

  var state = { brands: [], minPrice: null, maxPrice: null, gender: null, sort: "name", page: 1, inStockOnly: false, perPage: 24 };
  var facetsLoaded = false;

  var grid = document.getElementById("productGrid");
  var resultCount = document.getElementById("resultCount");
  var pagination = document.getElementById("pagination");
  var genderGroup = document.getElementById("genderGroup");
  var genderChips = document.getElementById("genderChips");
  var brandGroup = document.getElementById("brandGroup");
  var brandList = document.getElementById("brandList");
  var sortSelect = document.getElementById("sortSelect");
  var inStockOnlyCheckbox = document.getElementById("inStockOnly");
  var perPageSelect = document.getElementById("perPageSelect");
  var minPriceInput = document.getElementById("minPrice");
  var maxPriceInput = document.getElementById("maxPrice");

  function fetchData() {
    var params = new URLSearchParams();
    if (state.brands.length) params.set("brands", state.brands.join(","));
    if (state.minPrice) params.set("minPrice", state.minPrice);
    if (state.maxPrice) params.set("maxPrice", state.maxPrice);
    if (state.gender) params.set("gender", state.gender);
    if (state.sort) params.set("sort", state.sort);
    params.set("page", state.page);
    params.set("perPage", state.perPage);
    if (state.inStockOnly) params.set("inStockOnly", "1");

    grid.innerHTML = '<div class="loading">Завантаження товарів…</div>';

    fetch("/api/catalog/" + slug + "?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.ok) {
          grid.innerHTML = '<div class="empty">Помилка завантаження. Спробуйте оновити сторінку.</div>';
          return;
        }
        renderProducts(data.products);
        renderPagination(data.page, data.totalPages);
        resultCount.textContent = data.total + " товарів у категорії";
        if (!facetsLoaded) {
          renderFacets(data.facets);
          facetsLoaded = true;
        }
      })
      .catch(function () {
        grid.innerHTML = '<div class="empty">Не вдалося завантажити товари.</div>';
      });
  }

  function renderProducts(products) {
    if (!products.length) {
      grid.innerHTML = '<div class="empty">Товарів за цими фільтрами не знайдено.</div>';
      return;
    }
    grid.innerHTML = products.map(function (p) {
      var meta = "";
      if (p.attributes) {
        var parts = [];
        if (p.attributes.gender) parts.push(p.attributes.gender);
        if (p.attributes.age_group) parts.push(p.attributes.age_group);
        if (p.attributes.size) parts.push("розмір " + p.attributes.size);
        meta = parts.join(" · ");
      } else if (p.brand) {
        meta = p.brand;
      }
      var thumb = (p.hasRealPhoto && p.imageUrl)
        ? '<div class="product-thumb"><img src="' + p.imageUrl + '" alt="" loading="lazy"></div>'
        : '<div class="product-thumb">' + icon + '</div>';
      var cardClass = "product-card" + (p.inStock === false ? " out-of-stock" : "");
      var badge = p.inStock === false ? '<div class="out-of-stock-badge">Немає в наявності</div>' : "";
      return '' +
        '<a class="' + cardClass + '" href="/product/' + encodeURIComponent(p.slug) + '">' +
          thumb +
          '<div class="product-name">' + escapeHtml(p.name) + '</div>' +
          (meta ? '<div class="product-meta">' + escapeHtml(meta) + '</div>' : '') +
          '<div class="product-price">' + p.price.toFixed(2) + ' ₴</div>' +
          badge +
        '</a>';
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
    Array.prototype.forEach.call(pagination.querySelectorAll(".page-btn"), function (btn) {
      btn.addEventListener("click", function () {
        state.page = parseInt(btn.dataset.page, 10);
        fetchData();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }

  function renderFacets(facets) {
    if (isClothing && facets.genders && facets.genders.length) {
      genderGroup.hidden = false;
      genderChips.innerHTML = facets.genders.map(function (g) {
        return '<button class="chip" data-gender="' + escapeHtml(g) + '">' + escapeHtml(g) + '</button>';
      }).join("");
      Array.prototype.forEach.call(genderChips.querySelectorAll(".chip"), function (chip) {
        chip.addEventListener("click", function () {
          var g = chip.dataset.gender;
          var wasActive = chip.classList.contains("active");
          Array.prototype.forEach.call(genderChips.querySelectorAll(".chip"), function (c) { c.classList.remove("active"); });
          state.gender = wasActive ? null : g;
          if (!wasActive) chip.classList.add("active");
          state.page = 1;
          fetchData();
        });
      });
    }

    if (facets.brands && facets.brands.length) {
      brandGroup.hidden = false;
      brandList.innerHTML = facets.brands.map(function (b) {
        var checked = state.brands.indexOf(b) !== -1 ? "checked" : "";
        return '<label><input type="checkbox" class="brand-checkbox" value="' + escapeHtml(b) + '" ' + checked + '> ' + escapeHtml(b) + '</label>';
      }).join("");
      Array.prototype.forEach.call(brandList.querySelectorAll('input[type="checkbox"]'), function (cb) {
        cb.addEventListener("change", function () {
          var v = cb.value;
          var idx = state.brands.indexOf(v);
          if (cb.checked && idx === -1) state.brands.push(v);
          if (!cb.checked && idx !== -1) state.brands.splice(idx, 1);
          state.page = 1;
          fetchData();
        });
      });
    }

    if (facets.priceMin != null) minPriceInput.placeholder = "від " + Number(facets.priceMin).toFixed(2);
    if (facets.priceMax != null) maxPriceInput.placeholder = "до " + Number(facets.priceMax).toFixed(2);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById("applyFilters").addEventListener("click", function () {
    state.minPrice = minPriceInput.value || null;
    state.maxPrice = maxPriceInput.value || null;
    state.page = 1;
    fetchData();
    document.getElementById("filters").classList.remove("open");
  });

  document.getElementById("clearFilters").addEventListener("click", function () {
    state = { brands: [], minPrice: null, maxPrice: null, gender: null, sort: "name", page: 1, inStockOnly: false, perPage: state.perPage };
    minPriceInput.value = "";
    maxPriceInput.value = "";
    sortSelect.value = "name";
    inStockOnlyCheckbox.checked = false;
    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) { c.classList.remove("active"); });
    Array.prototype.forEach.call(document.querySelectorAll('input[type="checkbox"].brand-checkbox'), function (cb) { cb.checked = false; });
    fetchData();
  });

  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value;
    state.page = 1;
    fetchData();
  });

  inStockOnlyCheckbox.addEventListener("change", function () {
    state.inStockOnly = inStockOnlyCheckbox.checked;
    state.page = 1;
    fetchData();
  });

  perPageSelect.addEventListener("change", function () {
    state.perPage = parseInt(perPageSelect.value, 10);
    state.page = 1;
    fetchData();
  });

  document.getElementById("mobileFilterToggle").addEventListener("click", function () {
    document.getElementById("filters").classList.toggle("open");
  });

  fetchData();
})();
  `;
}
