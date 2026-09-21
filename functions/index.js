// GET / — головна сторінка.
// Раніше index.html був статичним файлом у public/, а лічильники
// ("X товарів", ціни, кількість по категоріях) та блок "Про нас"/
// "Контакти" підвантажувались клієнтським JS через /api/categories
// і /api/site-info після першого рендеру — звідси помітне "миготіння"
// нулів/дефолтних значень при відкритті сторінки.
//
// Тепер ці ж дані читаються напряму з D1 і вставляються в HTML на
// сервері (Pages Function за адресою "/" перекриває статичний
// public/index.html — Cloudflare Pages віддає перевагу Function,
// якщо шлях збігається). /api/categories і /api/site-info лишаються
// в коді як самостійні ендпоінти — раптом знадобляться десь ще.

const CATEGORY_META = {
  kanctovary:   { icon: "\u270f\ufe0f", desc: "Зошити, ручки, папір, шкільне приладдя" },
  gospodarchi:  { icon: "\ud83e\uddfa", desc: "Все для дому, побуту та порядку" },
  igrashky:     { icon: "\ud83e\uddf8", desc: "Для дітей будь-якого віку" },
  odyah:        { icon: "\ud83d\udc55", desc: "Дитячий одяг за розміром і статтю" },
  himiya:       { icon: "\ud83e\uddf4", desc: "Побутова хімія та засоби для чистоти" },
  bizhuteriya:  { icon: "\ud83d\udc8d", desc: "Прикраси, аксесуари, дрібнички" },
  vzuttya:      { icon: "\ud83d\udc5f", desc: "Дитяче взуття — галоші та шльопанці" },
};
const DEFAULT_META = { icon: "\ud83d\uded2", desc: "" };

const PUBLIC_SITE_KEYS = ["store_phone", "store_address", "about_text", "contacts_text"];

const DEFAULT_ABOUT =
  "Ощадний Кошик — інтернет-магазин канцтоварів, господарчих товарів, іграшок, одягу, хімії, біжутерії та взуття. Частина мережі магазинів, до якої входить також Агроном.";

export async function onRequestGet(context) {
  const { env } = context;
  const db = env.koshyk_db;

  const [{ results: categories }, totalsRow, siteRows] = await Promise.all([
    db
      .prepare(
        `SELECT c.slug, c.name_uk,
                COUNT(CASE WHEN p.in_stock = 1 THEN 1 END) as in_stock_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
         GROUP BY c.id
         ORDER BY in_stock_count DESC`
      )
      .all(),
    db
      .prepare(
        `SELECT
           COUNT(CASE WHEN in_stock = 1 THEN 1 END) as total_in_stock,
           MIN(CASE WHEN in_stock = 1 THEN price END) as min_price,
           MAX(CASE WHEN in_stock = 1 THEN price END) as max_price
         FROM products`
      )
      .first(),
    db
      .prepare(
        `SELECT key, value FROM site_settings WHERE key IN (${PUBLIC_SITE_KEYS.map(() => "?").join(",")})`
      )
      .bind(...PUBLIC_SITE_KEYS)
      .all(),
  ]);

  const siteValues = {};
  (siteRows.results || []).forEach((r) => { siteValues[r.key] = r.value; });

  return new Response(renderPage({ categories, totals: totalsRow || {}, site: siteValues }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Короткий edge-кеш: дані каталогу не змінюються щосекунди,
      // а D1-запит на кожен відкритий таб зайвий.
      "Cache-Control": "public, max-age=0, s-maxage=60",
    },
  });
}

function renderPage({ categories, totals, site }) {
  const fmt = (n) => Number(n || 0).toLocaleString("uk-UA");
  const price = (n) => (n == null ? "0.00" : Number(n).toFixed(2));

  const totalInStock = totals.total_in_stock || 0;
  const categoryCount = categories.length;

  const catCardsHtml = categories
    .map((c) => {
      const meta = CATEGORY_META[c.slug] || DEFAULT_META;
      return `
      <a class="cat-card" href="/catalog/${escapeHtml(c.slug)}" data-slug="${escapeHtml(c.slug)}">
        <div class="cat-top">
          <div class="cat-icon">${meta.icon}</div>
          <div class="cat-count" data-slug="${escapeHtml(c.slug)}">${fmt(c.in_stock_count)}</div>
        </div>
        <div class="cat-name">${escapeHtml(c.name_uk)}</div>
        <div class="cat-desc">${escapeHtml(meta.desc)}</div>
      </a>`;
    })
    .join("\n");

  const aboutText = site.about_text || DEFAULT_ABOUT;

  const contactLines = [];
  if (site.store_phone) {
    contactLines.push(`<span class="contact-line"><b>Телефон:</b> ${escapeHtml(site.store_phone)}</span>`);
  }
  if (site.store_address) {
    contactLines.push(`<span class="contact-line"><b>Адреса самовивозу:</b> ${escapeHtml(site.store_address)}</span>`);
  }

  const siteUrl = "https://koshyk.pp.ua/";

  // Structured data (Schema.org) для Google: Store (контакти/адреса),
  // WebSite (search box у видачі), ItemList (категорії в результатах).
  // Дані ті самі, що вже рендеряться в HTML — просто в машинному вигляді.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Store",
      name: "Ощадний Кошик",
      url: siteUrl,
      description: aboutText,
      ...(site.store_phone ? { telephone: site.store_phone } : {}),
      ...(site.store_address ? { address: { "@type": "PostalAddress", streetAddress: site.store_address, addressCountry: "UA" } } : {}),
      priceRange: totals.min_price != null && totals.max_price != null
        ? `${price(totals.min_price)}–${price(totals.max_price)} UAH`
        : undefined,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Ощадний Кошик",
      url: siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: categories.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name_uk,
        url: `${siteUrl}catalog/${c.slug}`,
      })),
    },
  ];

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<script>(function(){try{if(localStorage.getItem("koshykTheme")==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ощадний Кошик — все для дому за копійки</title>
<meta name="description" content="Канцтовари, господарчі товари, іграшки, одяг, хімія, біжутерія та взуття за найощадливішими цінами.">
<link rel="canonical" href="${siteUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ощадний Кошик">
<meta property="og:title" content="Ощадний Кошик — все для дому за копійки">
<meta property="og:description" content="Канцтовари, господарчі товари, іграшки, одяг, хімія, біжутерія та взуття за найощадливішими цінами.">
<meta property="og:url" content="${siteUrl}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Ощадний Кошик — все для дому за копійки">
<meta name="twitter:description" content="Канцтовари, господарчі товари, іграшки, одяг, хімія, біжутерія та взуття за найощадливішими цінами.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23FF3D71'/%3E%3Cstop offset='1' stop-color='%23B94FFF'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='18' fill='url(%23g)' transform='rotate(-6 32 32)'/%3E%3Ctext x='32' y='44' font-family='Arial, sans-serif' font-weight='800' font-size='34' fill='white' text-anchor='middle'%3EК%3C/text%3E%3C/svg%3E">
<style>${css()}</style>
${jsonLd.map((obj) => `<script type="application/ld+json">${safeJsonLd(obj)}</script>`).join("\n")}
</head>
<body>

<header>
  <div class="header-row">
    <a class="logo" href="/">
      <span class="logo-mark">К</span>
      Ощадний Кошик
    </a>
    <form class="header-search" action="/search" method="get">
      <input type="text" name="q" placeholder="Пошук товарів…">
      <button type="submit">\ud83d\udd0d</button>
    </form>
    <nav>
      <a href="/#categories">Категорії</a>
      <a href="/#about">Про нас</a>
      <a href="/#contacts">Контакти</a>
      <button type="button" id="themeToggle" class="theme-toggle" aria-label="Перемкнути тему">
        <span class="theme-icon-dark">\ud83c\udf19</span>
        <span class="theme-icon-light">\u2600\ufe0f</span>
      </button>
      <a class="cart-link" href="/cart.html">\ud83d\uded2 Кошик <span id="cartBadge" class="cart-badge"></span></a>
    </nav>
  </div>
</header>

<section class="intro">
  <div class="wrap">
    <h1>Все для дому, дітей і побуту — в одному кошику</h1>
    <p><b id="heroCount">${fmt(totalInStock)} товарів</b> в наявності просто зараз · ${categoryCount} категорій · без прихованих націнок</p>
  </div>
</section>

<section class="categories" id="categories">
  <div class="wrap">
    <div class="cat-grid">
${catCardsHtml}
    </div>
  </div>
</section>

<div class="strip">
  <div class="wrap">
    <span>\ud83d\udce6 <b id="stripTotal">${fmt(totalInStock)}</b> товарних позицій у каталозі</span>
    <span>\ud83c\udff7\ufe0f Ціни від <b id="stripMinPrice">${price(totals.min_price)} \u20b4</b> до <b id="stripMaxPrice">${price(totals.max_price)} \u20b4</b></span>
    <span>\ud83c\uddfa\ud83c\udde6 Працюємо для покупців по всій Україні</span>
  </div>
</div>

<footer>
  <div class="wrap">
    <div class="footer-content">
      <div class="footer-col" id="about">
        <h3>Про нас</h3>
        <p id="aboutText">${escapeHtml(aboutText)}</p>
      </div>
      <div class="footer-col" id="contacts">
        <h3>Контакти</h3>
        <p id="contactsLines">${contactLines.join("")}</p>
        <p id="contactsText">${site.contacts_text ? escapeHtml(site.contacts_text) : ""}</p>
      </div>
    </div>
    <div class="foot-row">
      <span>© 2026 Ощадний Кошик · koshyk.pp.ua</span>
      <span>Частина мережі магазинів, до якої входить також Агроном</span>
    </div>
  </div>
</footer>

<script src="/cart.js"></script>
<script src="/theme.js"></script>

</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// JSON.stringify всередині <script>, з екрануванням "</" — щоб текст
// з БД (наприклад about_text) не міг передчасно закрити тег <script>.
function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function css() {
  return `/* Локальні шрифти замість Google Fonts CDN — прибирає зовнішній запит,
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


  :root {
    --bg: #14151F;
    --card: #1E202E;
    --ink: #F5F6FA;
    --ink-soft: #9A9DB0;
    --line: rgba(245, 246, 250, 0.12);
    --coral: #FF3D71;
    --coral-deep: #FF6B93;
    --teal: #00E5C7;
    --teal-deep: #4DFFEA;
    --yellow: #FFE600;
    --blue: #2ED1FF;
    --pink: #FF3D9A;
    --purple: #B94FFF;
    --green: #39FF6A;
    --radius: 20px;
    --radius-lg: 28px;
  }
  html[data-theme="light"] {
    --bg: #F4F5FA;
    --card: #FFFFFF;
    --ink: #14151F;
    --ink-soft: #6B6E85;
    --line: rgba(20, 21, 31, 0.12);
    --coral: #E8265D;
    --coral-deep: #C71C4D;
    --teal: #00A98C;
    --teal-deep: #00806A;
    --yellow: #E6B800;
    --blue: #0092C7;
    --pink: #E62E86;
    --purple: #8A2BE0;
    --green: #1FAE4D;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: 'Nunito', system-ui, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    transition: background 0.2s ease, color 0.2s ease;
  }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  h1, h2, h3, .heading-font { font-family: 'Baloo 2', sans-serif; }

  /* ---------- HEADER ---------- */
  header { padding: 18px 0; background: var(--card); border-bottom: 2px solid var(--teal); box-shadow: 0 0 20px -4px var(--teal); position: sticky; top: 0; z-index: 20; }
  .header-row { display: flex; align-items: center; gap: 18px; max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  .logo { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 1.3rem; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .logo-mark {
    width: 38px; height: 38px; border-radius: 12px;
    background: linear-gradient(135deg, var(--coral), var(--purple));
    color: #fff; display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem; font-weight: 800; transform: rotate(-6deg);
    box-shadow: 0 0 16px -2px var(--coral);
  }
  .header-search { flex: 1; max-width: 440px; display: flex; }
  .header-search input {
    flex: 1; padding: 11px 16px; border: 2px solid var(--teal); border-right: none;
    border-radius: 100px 0 0 100px; font-family: 'Nunito', sans-serif; font-size: 0.94rem;
    background: var(--bg); color: var(--ink);
  }
  .header-search input::placeholder { color: var(--ink-soft); }
  .header-search input:focus { outline: none; box-shadow: 0 0 0 3px rgba(0,229,199,0.25); }
  .header-search button {
    padding: 0 18px; border: 2px solid var(--teal); background: var(--yellow); color: #14151F;
    border-radius: 0 100px 100px 0; font-size: 1rem; cursor: pointer; font-weight: 800;
    box-shadow: 0 0 14px -2px var(--yellow);
  }
  .header-search button:hover { background: var(--coral); color: #fff; }
  nav { display: flex; align-items: center; gap: 18px; font-weight: 700; font-size: 0.92rem; flex-shrink: 0; }
  nav a { color: var(--ink-soft); }
  nav a:hover { color: var(--ink); }
  .theme-toggle {
    background: var(--bg); border: 2px solid var(--line); width: 38px; height: 38px;
    border-radius: 100px; display: flex; align-items: center; justify-content: center;
    font-size: 1rem; cursor: pointer; flex-shrink: 0; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .theme-toggle:hover { border-color: var(--teal); box-shadow: 0 0 14px -3px var(--teal); }
  .theme-icon-light { display: none; }
  html[data-theme="light"] .theme-icon-dark { display: none; }
  html[data-theme="light"] .theme-icon-light { display: inline; }
  .cart-link { position: relative; display: flex; align-items: center; gap: 6px; background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff !important; padding: 9px 16px; border-radius: 100px; box-shadow: 0 0 16px -3px var(--purple); }
  .cart-link:hover { box-shadow: 0 0 22px -2px var(--coral); }
  .cart-badge {
    display: none; align-items: center; justify-content: center;
    background: var(--yellow); color: var(--ink); font-size: 0.72rem; font-weight: 800;
    min-width: 19px; height: 19px; border-radius: 100px; padding: 0 4px;
  }

  /* ---------- INTRO ---------- */
  .intro { padding: 26px 0 10px; }
  .intro h1 { font-size: clamp(1.4rem, 2.6vw, 1.9rem); font-weight: 700; margin-bottom: 6px; }
  .intro p { color: var(--ink-soft); font-size: 0.94rem; font-weight: 600; }
  .intro p b { color: var(--coral-deep); }

  /* ---------- CATEGORY GRID ---------- */
  .categories { padding: 20px 0 50px; }
  .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .cat-card {
    background: var(--card); border: 2px solid var(--line); border-radius: var(--radius);
    padding: 20px; display: flex; flex-direction: column; gap: 10px;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .cat-card:hover { transform: translateY(-4px); }
  .cat-card:active { transform: translateY(-1px); }
  .cat-top { display: flex; align-items: center; justify-content: space-between; }
  .cat-icon {
    width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
    font-size: 1.7rem; flex-shrink: 0;
  }
  .cat-count {
    font-family: 'Baloo 2', sans-serif; font-size: 0.8rem; font-weight: 700; color: var(--ink);
    background: var(--bg); border: 1.5px solid var(--line); padding: 3px 10px; border-radius: 100px;
  }
  .cat-name { font-family: 'Baloo 2', sans-serif; font-weight: 700; font-size: 1.15rem; color: var(--ink); }
  .cat-desc { font-size: 0.84rem; color: var(--ink-soft); font-weight: 600; }

  .cat-card[data-slug="kanctovary"] .cat-icon { background: rgba(0,229,199,0.16); }
  .cat-card[data-slug="kanctovary"]:hover { border-color: var(--teal); box-shadow: 0 0 24px -4px var(--teal); }
  .cat-card[data-slug="gospodarchi"] .cat-icon { background: rgba(255,230,0,0.16); }
  .cat-card[data-slug="gospodarchi"]:hover { border-color: var(--yellow); box-shadow: 0 0 24px -4px var(--yellow); }
  .cat-card[data-slug="igrashky"] .cat-icon { background: rgba(255,61,113,0.16); }
  .cat-card[data-slug="igrashky"]:hover { border-color: var(--coral); box-shadow: 0 0 24px -4px var(--coral); }
  .cat-card[data-slug="odyah"] .cat-icon { background: rgba(46,209,255,0.16); }
  .cat-card[data-slug="odyah"]:hover { border-color: var(--blue); box-shadow: 0 0 24px -4px var(--blue); }
  .cat-card[data-slug="himiya"] .cat-icon { background: rgba(57,255,106,0.16); }
  .cat-card[data-slug="himiya"]:hover { border-color: var(--green); box-shadow: 0 0 24px -4px var(--green); }
  .cat-card[data-slug="bizhuteriya"] .cat-icon { background: rgba(185,79,255,0.18); }
  .cat-card[data-slug="bizhuteriya"]:hover { border-color: var(--purple); box-shadow: 0 0 24px -4px var(--purple); }
  .cat-card[data-slug="vzuttya"] .cat-icon { background: rgba(255,61,154,0.16); }
  .cat-card[data-slug="vzuttya"]:hover { border-color: var(--pink); box-shadow: 0 0 24px -4px var(--pink); }
  .cat-card[data-slug="vzuttya"] { grid-column: span 1; }

  /* ---------- STRIP ---------- */
  .strip { background: linear-gradient(90deg, #1a0b2e, #2e0b3a); border-top: 1px solid var(--purple); border-bottom: 1px solid var(--purple); padding: 14px 0; font-size: 0.86rem; font-weight: 700; color: #fff; }
  .strip .wrap { display: flex; justify-content: center; gap: 34px; flex-wrap: wrap; }
  .strip b { color: var(--yellow); text-shadow: 0 0 10px rgba(255,230,0,0.5); }

  /* ---------- FOOTER ---------- */
  footer { padding: 40px 0 30px; background: var(--card); }
  .footer-content { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding-bottom: 26px; margin-bottom: 20px; border-bottom: 2px solid var(--line); }
  .footer-col h3 { font-size: 1.05rem; font-weight: 700; margin-bottom: 10px; color: var(--teal); }
  .footer-col p { font-size: 0.88rem; color: var(--ink-soft); white-space: pre-line; line-height: 1.6; font-weight: 600; }
  .footer-col .contact-line { margin-bottom: 4px; display: block; }
  .footer-col .contact-line b { color: var(--ink); }
  .foot-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 0.84rem; color: var(--ink-soft); font-weight: 600; }

  @media (max-width: 880px) {
    .header-row { flex-wrap: nowrap; }
    nav a:not(.cart-link) { display: none; }
    .header-search { margin: 0 8px; }
    .cat-grid { grid-template-columns: repeat(2, 1fr); }
    .footer-content { grid-template-columns: 1fr; }
    .strip .wrap { gap: 14px; }
  }
`;
}
