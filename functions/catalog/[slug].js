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
<html lang="uk"><head><meta charset="UTF-8"><title>Категорію не знайдено — Ощадний Кошик</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FF3D71'/%3E%3Cstop offset='1' stop-color='%23B94FFF'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)' transform='rotate(-6 32 32)'/%3E%3Ctext x='32' y='44' font-family='Arial, sans-serif' font-weight='800' font-size='34' fill='white' text-anchor='middle'%3EК%3C/text%3E%3C/svg%3E"></head>
<body style="font-family:sans-serif;padding:60px;text-align:center;">
  <h1>Категорію не знайдено</h1>
  <p><a href="/">← На головну</a></p>
</body></html>`;
}

function renderPage(slug, nameUk, icon, isClothing) {
  const SITE_URL = "https://koshyk.pp.ua";
  const categoryUrl = `${SITE_URL}/catalog/${slug}`;
  const description = `${nameUk} за ощадними цінами в інтернет-магазині Ощадний Кошик.`;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: nameUk,
      url: categoryUrl,
      description: description,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Головна", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: nameUk, item: categoryUrl },
      ],
    },
  ];

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<script>(function(){try{if(localStorage.getItem("koshykTheme")==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nameUk} — Ощадний Кошик</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${categoryUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ощадний Кошик">
<meta property="og:title" content="${nameUk} — Ощадний Кошик">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${categoryUrl}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${nameUk} — Ощадний Кошик">
<meta name="twitter:description" content="${description}">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1E202E">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FF3D71'/%3E%3Cstop offset='1' stop-color='%23B94FFF'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)' transform='rotate(-6 32 32)'/%3E%3Ctext x='32' y='44' font-family='Arial, sans-serif' font-weight='800' font-size='34' fill='white' text-anchor='middle'%3EК%3C/text%3E%3C/svg%3E">
${jsonLd.map((obj) => `<script type="application/ld+json">${safeJsonLd(obj)}</script>`).join("\n")}
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
      <button type="button" id="themeToggle" class="theme-toggle" aria-label="Перемкнути тему">
        <span class="theme-icon-dark">🌙</span>
        <span class="theme-icon-light">☀️</span>
      </button>
      <a href="/cart.html" class="cart-link">
        🛒 Кошик <span id="cartBadge" class="cart-badge" style="display:none">0</span>
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
<script src="/theme.js"></script>
<script src="/search-autocomplete.js"></script>
<script>
${clientJs(icon)}
</script>

</body>
</html>`;
}

// JSON.stringify всередині <script>, з екрануванням "</" — щоб текст
// (напр. назва категорії) не міг передчасно закрити тег <script>.
function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function sharedCss() {
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
  body { background: var(--bg); color: var(--ink); font-family: 'Nunito', system-ui, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; transition: background 0.2s ease, color 0.2s ease; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
  h1, h2, h3 { font-family: 'Baloo 2', sans-serif; }

  header { padding: 18px 0; background: var(--card); border-bottom: 2px solid var(--teal); box-shadow: 0 0 20px -4px var(--teal); position: sticky; top: 0; z-index: 20; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .logo { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 1.3rem; display: flex; align-items: center; gap: 10px; }
  .logo-mark { width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, var(--coral), var(--purple)); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 800; transform: rotate(-6deg); flex-shrink: 0; box-shadow: 0 0 16px -2px var(--coral); }
  nav { display: flex; align-items: center; gap: 18px; font-size: 0.92rem; font-weight: 700; color: var(--ink-soft); }
  nav a:hover { color: var(--ink); }
  .cart-link { position: relative; display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff !important; padding: 9px 16px; border-radius: 100px; box-shadow: 0 0 16px -3px var(--purple); }
  .cart-link:hover { box-shadow: 0 0 22px -2px var(--coral); }
  .header-search { display: flex; flex: 1; max-width: 380px; margin: 0 20px; }
  .header-search input { flex: 1; padding: 10px 16px; border-radius: 100px 0 0 100px; border: 2px solid var(--teal); border-right: none; background: var(--bg); color: var(--ink); font-size: 0.86rem; }
  .header-search input::placeholder { color: var(--ink-soft); }
  .header-search button { border: 2px solid var(--teal); border-radius: 0 100px 100px 0; background: var(--yellow); color: #14151F; padding: 0 16px; cursor: pointer; font-weight: 800; box-shadow: 0 0 14px -2px var(--yellow); }
  .header-search button:hover { background: var(--coral); color: #fff; }
  .theme-toggle { background: var(--bg); border: 2px solid var(--line); width: 38px; height: 38px; border-radius: 100px; display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; flex-shrink: 0; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  .theme-toggle:hover { border-color: var(--teal); box-shadow: 0 0 14px -3px var(--teal); }
  .theme-icon-light { display: none; }
  html[data-theme="light"] .theme-icon-dark { display: none; }
  html[data-theme="light"] .theme-icon-light { display: inline; }
  .cart-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; background: var(--yellow); color: #14151F; border-radius: 100px; font-size: 0.72rem; font-weight: 800; }

  .crumbs { padding: 4px 28px 18px; font-size: 0.86rem; color: var(--ink-soft); }
  .crumbs a:hover { color: var(--ink); }
  .crumbs span { margin: 0 4px; }

  .cat-header { display: flex; align-items: center; gap: 18px; padding-bottom: 30px; }
  .cat-header-icon { width: 56px; height: 56px; border-radius: 16px; background: var(--card); border: 2px solid var(--line); display: flex; align-items: center; justify-content: center; font-size: 1.7rem; flex-shrink: 0; }
  .cat-header h1 { font-weight: 700; font-size: clamp(1.6rem, 3vw, 2.1rem); letter-spacing: -0.01em; }
  .cat-header-count { color: var(--ink-soft); font-family: 'Baloo 2', sans-serif; font-size: 0.88rem; margin-top: 4px; font-weight: 600; }

  .layout { display: grid; grid-template-columns: 260px 1fr; gap: 30px; align-items: start; padding-bottom: 60px; }

  .filters { background: var(--card); border: 2px solid var(--line); border-radius: var(--radius); padding: 22px; position: sticky; top: 90px; }
  .filters-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .filters-head h2 { font-size: 1.1rem; font-weight: 700; }
  .clear-btn { font-size: 0.8rem; color: var(--coral); font-weight: 700; background: none; border: none; cursor: pointer; }
  .filter-group { margin-bottom: 20px; }
  .filter-group h3 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); margin-bottom: 10px; font-weight: 700; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { font-size: 0.82rem; padding: 6px 12px; border-radius: 100px; border: 2px solid var(--line); background: var(--bg); cursor: pointer; font-weight: 700; color: var(--ink-soft); }
  .chip.active { background: var(--purple); border-color: var(--purple); color: #fff; box-shadow: 0 0 14px -3px var(--purple); }
  .price-range { display: flex; align-items: center; gap: 8px; }
  .price-range input { width: 100%; padding: 8px 10px; border-radius: 8px; border: 2px solid var(--line); font-family: 'Baloo 2', sans-serif; font-size: 0.86rem; background: var(--bg); color: var(--ink); }
  .price-range input:focus, #minPrice:focus, #maxPrice:focus { outline: none; border-color: var(--teal); }
  .brand-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
  .brand-list label { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; }
  .apply-btn { width: 100%; background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff; font-weight: 800; padding: 12px; border-radius: 100px; border: none; cursor: pointer; font-size: 0.92rem; margin-top: 6px; box-shadow: 0 0 16px -3px var(--purple); }
  .apply-btn:hover { box-shadow: 0 0 22px -2px var(--coral); }

  .results-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; gap: 12px; flex-wrap: wrap; }
  .mobile-filter-toggle { display: none; background: var(--card); border: 2px solid var(--line); border-radius: 100px; padding: 10px 16px; font-weight: 700; font-size: 0.86rem; cursor: pointer; color: var(--ink); }
  .results-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .instock-label { display: flex; align-items: center; gap: 6px; font-size: 0.86rem; color: var(--ink-soft); cursor: pointer; white-space: nowrap; }
  #sortSelect, #perPageSelect { padding: 9px 14px; border-radius: 100px; border: 2px solid var(--line); background: var(--card); font-size: 0.86rem; font-weight: 700; color: var(--ink); cursor: pointer; }

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
  .out-of-stock-badge { display: inline-block; background: rgba(255,61,113,0.14); color: var(--coral); font-size: 0.74rem; font-weight: 700; padding: 4px 10px; border-radius: 100px; margin-top: 4px; }

  .pagination { display: flex; justify-content: center; gap: 8px; margin-top: 34px; flex-wrap: wrap; }
  .page-btn { padding: 8px 14px; border-radius: 8px; border: 2px solid var(--line); background: var(--card); font-size: 0.86rem; font-weight: 700; cursor: pointer; color: var(--ink-soft); }
  .page-btn.active { background: var(--teal); color: #14151F; border-color: var(--teal); }

  footer { padding: 40px 0; border-top: 2px solid var(--line); margin-top: 20px; }
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
