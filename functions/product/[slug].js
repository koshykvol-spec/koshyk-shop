// Pages Function: GET /product/:slug
// Сторінка одного товару. Дані читаються напряму з D1 на сервері
// (без окремого /api/product/:slug — тут не потрібна клієнтська
// інтерактивність фільтрів, як на сторінці каталогу).

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

  const product = await env.koshyk_db
    .prepare(
      `SELECT p.id, p.sku, p.name, p.slug, p.price, p.brand, p.has_real_photo, p.in_stock,
              p.image_url, c.slug as category_slug, c.name_uk as category_name,
              pc.attributes_json, pc.description
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_content pc ON pc.product_id = p.id
       WHERE p.slug = ?`
    )
    .bind(slug)
    .first();

  if (!product) {
    return new Response(renderNotFound(), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // усі фото товару (не тільки головне) — для галереї на сторінці
  const { results: images } = await env.koshyk_db
    .prepare(
      `SELECT r2_key, is_primary FROM product_images WHERE product_id = ?
       ORDER BY is_primary DESC, sort_order, id`
    )
    .bind(product.id)
    .all();

  // схожі товари з тієї ж категорії (для навігації, без окремого API)
  // ORDER BY RANDOM() тут раніше змушував SQLite прочитати й
  // відсортувати ВСІ товари категорії (до 686 рядків) на кожному
  // показі кожної сторінки товару — дорого для D1 при 2000+ товарах.
  // Просте "ORDER BY id DESC LIMIT 4" індекс idx_products_category
  // покриває без TEMP B-TREE (SQLite вже зберігає записи індексу
  // впорядкованими за rowid/id у межах category_id) — LIMIT 4
  // зупиняється одразу, без читання всієї категорії. Свідомо без
  // "in_stock DESC" — додавання другого критерію сортування знову
  // змусило б SQLite сортувати всю вибірку в TEMP B-TREE.
  const { results: related } = await env.koshyk_db
    .prepare(
      `SELECT name, slug, price, has_real_photo, image_url FROM products
       WHERE category_id = (SELECT category_id FROM products WHERE slug = ?) AND slug != ?
       ORDER BY id DESC LIMIT 4`
    )
    .bind(slug, slug)
    .all();

  // відгуки товару + середній рейтинг
  const { results: reviews } = await env.koshyk_db
    .prepare("SELECT author_name, rating, text, created_at FROM product_reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC")
    .bind(product.id)
    .all();
  const reviewCount = reviews.length;
  const avgRating = reviewCount
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10) / 10
    : 0;

  // контактні дані для блоку доставки — з site_settings (заповнюються в /admin/settings)
  const { results: settingsRows } = await env.koshyk_db
    .prepare("SELECT key, value FROM site_settings WHERE key IN ('store_phone', 'store_address')")
    .all();
  const settings = {};
  settingsRows.forEach((r) => { settings[r.key] = r.value; });

  const icon = CATEGORY_ICONS[product.category_slug] || "🛒";
  const attrs = product.attributes_json ? JSON.parse(product.attributes_json) : null;

  return new Response(renderPage(product, attrs, icon, related, images, reviews, avgRating, reviewCount, settings), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="UTF-8"><title>Товар не знайдено — Ощадний Кошик</title><link rel="icon" type="image/png" href="/icon-192.png"></head>
<body style="font-family:sans-serif;padding:60px;text-align:center;">
  <h1>Товар не знайдено</h1>
  <p><a href="/">← На головну</a></p>
</body></html>`;
}

function renderPage(p, attrs, icon, related, images, reviews, avgRating, reviewCount, settings) {
  const hasPhotos = images && images.length > 0;
  const mainImageUrl = hasPhotos ? `/img/${images[0].r2_key}` : null;
  const SITE_URL = "https://koshyk.pp.ua";
  const productUrl = `${SITE_URL}/product/${p.slug}`;
  const absImageUrl = mainImageUrl ? `${SITE_URL}${mainImageUrl}` : null;
  // og:image завжди має значення — навіть без реального фото товару
  // посилання в месенджерах матиме фірмову картку, а не порожній
  // превʼю. У Product JSON-LD "image" лишаємо тільки для реального
  // фото товару — заглушку туди додавати не варто (це не фото товару).
  const ogImageUrl = absImageUrl || `${SITE_URL}/og-share.png`;
  const shortDescription = p.description
    ? p.description.slice(0, 160)
    : `${p.name} — ${Number(p.price).toFixed(2)} ₴. Купити в Ощадному Кошику.`;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(absImageUrl ? { image: [absImageUrl] } : {}),
    ...(p.description ? { description: p.description } : {}),
    url: productUrl,
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "UAH",
      price: Number(p.price).toFixed(2),
      availability: p.in_stock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
    ...(reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avgRating,
            reviewCount: reviewCount,
          },
        }
      : {}),
  };
  const thumbsHtml = hasPhotos && images.length > 1
    ? `<div class="photo-thumbs">${images
        .map(
          (img, i) =>
            `<button type="button" class="thumb-btn${i === 0 ? " active" : ""}" data-url="/img/${img.r2_key}"><img src="/img/${img.r2_key}" alt=""></button>`
        )
        .join("")}</div>`
    : "";
  const metaParts = [];
  if (attrs) {
    if (attrs.gender) metaParts.push(escapeHtml(attrs.gender));
    if (attrs.age_group) metaParts.push(escapeHtml(attrs.age_group));
    if (attrs.size) metaParts.push("розмір " + escapeHtml(attrs.size));
  }
  if (p.brand) metaParts.push("бренд: " + escapeHtml(p.brand));
  const metaLine = metaParts.join(" · ");

  const starsHtml = (rating) => {
    const full = Math.round(rating);
    return Array.from({ length: 5 }, (_, i) => (i < full ? "★" : "☆")).join("");
  };

  const reviewsListHtml = reviews.length
    ? reviews
        .map(
          (r) => `
      <div class="review-item">
        <div class="review-head">
          <span class="review-stars">${starsHtml(r.rating)}</span>
          <span class="review-author">${escapeHtml(r.author_name)}</span>
          <span class="review-date">${new Date(r.created_at).toLocaleDateString("uk-UA")}</span>
        </div>
        ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : ""}
      </div>`
        )
        .join("")
    : '<p class="no-reviews">Поки що відгуків немає — будьте першими.</p>';

  const relatedHtml = related.length
    ? related
        .map((r) => {
          const rThumb = r.has_real_photo && r.image_url
            ? `<img src="${escapeHtml(r.image_url)}" alt="" loading="lazy">`
            : icon;
          return `
      <a class="related-card" href="/product/${escapeHtml(r.slug)}">
        <div class="related-thumb">${rThumb}</div>
        <div class="related-name">${escapeHtml(r.name)}</div>
        <div class="related-price">${Number(r.price).toFixed(2)} ₴</div>
      </a>`;
        })
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<script>(function(){try{if(localStorage.getItem("koshykTheme")==="light")document.documentElement.setAttribute("data-theme","light");}catch(e){}})();</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(p.name)} — Ощадний Кошик</title>
<meta name="description" content="${escapeHtml(shortDescription)}">
<link rel="canonical" href="${productUrl}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Ощадний Кошик">
<meta property="og:title" content="${escapeHtml(p.name)}">
<meta property="og:description" content="${escapeHtml(shortDescription)}">
<meta property="og:url" content="${productUrl}">
${`<meta property="og:image" content="${ogImageUrl}">`}
<meta property="product:price:amount" content="${Number(p.price).toFixed(2)}">
<meta property="product:price:currency" content="UAH">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(p.name)}">
<meta name="twitter:description" content="${escapeHtml(shortDescription)}">
<meta name="twitter:image" content="${ogImageUrl}">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1E202E">
<link rel="icon" type="image/png" href="/icon-192.png">
<script type="application/ld+json">${safeJsonLd(productJsonLd)}</script>
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

<header>
  <div class="wrap header-row">
    <a class="logo" href="/">
      <span class="logo-mark">К</span>
      Ощадний Кошик
    </a>
    <form class="header-search" action="/search" method="get">
      <input type="text" name="q" placeholder="Пошук товарів…">
      <button type="submit">🔍</button>
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
</header>

<div class="wrap crumbs">
  <a href="/">Головна</a> <span>/</span>
  <a href="/catalog/${escapeHtml(p.category_slug)}">${escapeHtml(p.category_name)}</a> <span>/</span>
  <span>${escapeHtml(p.name)}</span>
</div>

<div class="wrap product-layout">
  <div class="product-photo">
    <div class="photo-box" id="mainPhotoBox">${mainImageUrl ? `<img src="${escapeHtml(mainImageUrl)}" alt="${escapeHtml(p.name)}" id="mainPhotoImg">` : icon}</div>
    ${thumbsHtml}
  </div>

  <div class="product-info">
    <div class="sku-tag">Артикул ${escapeHtml(p.sku)}</div>
    <h1>${escapeHtml(p.name)}</h1>
    ${metaLine ? `<div class="meta-line">${metaLine}</div>` : ""}

    <div class="price-block">
      <span class="price${p.in_stock ? "" : " price-out"}">${Number(p.price).toFixed(2)} ₴</span>
      ${p.in_stock ? "" : '<span class="stock-badge">Немає в наявності</span>'}
    </div>

    ${
      p.in_stock
        ? `<div class="qty-row">
      <label for="qtyInput">Кількість</label>
      <div class="qty-control">
        <button type="button" id="qtyMinus" aria-label="Зменшити">−</button>
        <input type="number" id="qtyInput" value="1" min="1">
        <button type="button" id="qtyPlus" aria-label="Збільшити">+</button>
      </div>
    </div>

    <div class="action-row">
      <button type="button" class="add-cart-btn" id="addCartBtn">Додати в кошик</button>
      <button type="button" class="order-btn" id="orderNowBtn">Замовити зараз →</button>
    </div>

    <div class="cart-toast" id="cartToast" hidden>Додано в кошик ✓</div>

    <p class="order-note">«Додати в кошик» — зібрати декілька товарів і оформити одне замовлення. «Замовити зараз» — оформити замовлення тільки з цим товаром одразу, без переходу в кошик.</p>

    <form class="side-form quick-order-form" id="quickOrderForm" hidden>
      <h3>Оформити замовлення</h3>
      <div class="form-row">
        <label for="orderName">Ваше ім'я</label>
        <input type="text" id="orderName" required maxlength="100">
      </div>
      <div class="form-row">
        <label for="orderPhone">Телефон</label>
        <input type="text" id="orderPhone" required maxlength="30" placeholder="+380...">
      </div>
      <div class="form-row">
        <label for="orderDelivery">Доставка</label>
        <select id="orderDelivery">
          <option value="pickup">Самовивіз</option>
          <option value="nova_poshta">Нова Пошта</option>
        </select>
      </div>
      <div class="form-row">
        <label for="orderNoteInput">Коментар (необов'язково)</label>
        <textarea id="orderNoteInput" maxlength="500"></textarea>
      </div>
      <button type="submit" class="submit-btn">Підтвердити замовлення</button>
      <div class="form-status" id="orderStatus"></div>
    </form>`
        : `<p class="order-note out-of-stock-note">Цього товару тимчасово немає в наявності. Спробуйте пізніше або перегляньте схожі товари нижче.</p>`
    }

    <button type="button" class="share-btn" id="shareBtn">↗ Поділитися</button>

    <div class="delivery-box">
      <p><span class="delivery-icon">🚚</span> <b>Доставка:</b> Нова Пошта, Укрпошта</p>
      ${settings.store_address ? `<p><span class="delivery-icon">🏬</span> <b>Самовивіз:</b> ${escapeHtml(settings.store_address)}</p>` : ""}
      <p><span class="delivery-icon">💳</span> <b>Оплата:</b> готівка або на картку</p>
      ${settings.store_phone ? `<p><span class="delivery-icon">📞</span> <b>Консультація:</b> ${escapeHtml(settings.store_phone)}</p>` : ""}
    </div>

    ${p.description ? `<div class="description"><h2>Опис</h2><p>${escapeHtml(p.description)}</p></div>` : ""}
  </div>
</div>

<section class="reviews-section">
  <div class="wrap">
    <h2>⭐ Відгуки ${reviewCount ? `<span class="reviews-avg">${avgRating.toFixed(1)} · ${reviewCount}</span>` : ""}</h2>

    <div class="reviews-list">${reviewsListHtml}</div>

    <div class="write-review-cta">
      <button type="button" class="write-review-btn" id="writeReviewBtn">Написати відгук →</button>
    </div>

    <form class="side-form" id="reviewForm" hidden>
      <h3>Залишити відгук</h3>
      <div class="form-row">
        <label for="reviewName">Ваше ім'я</label>
        <input type="text" id="reviewName" required maxlength="100">
      </div>
      <div class="form-row">
        <label>Оцінка</label>
        <div class="star-picker" id="starPicker">
          <button type="button" data-value="1">★</button>
          <button type="button" data-value="2">★</button>
          <button type="button" data-value="3">★</button>
          <button type="button" data-value="4">★</button>
          <button type="button" data-value="5">★</button>
        </div>
        <input type="hidden" id="reviewRating" value="0">
      </div>
      <div class="form-row">
        <label for="reviewText">Текст відгуку (необов'язково)</label>
        <textarea id="reviewText" maxlength="2000"></textarea>
      </div>
      <button type="submit" class="submit-btn">Надіслати</button>
      <div class="form-status" id="reviewStatus"></div>
    </form>
  </div>
</section>

${
  relatedHtml
    ? `<section class="related-section">
  <div class="wrap">
    <h2>Схожі товари</h2>
    <div class="related-grid">${relatedHtml}</div>
  </div>
</section>`
    : ""
}

<footer>
  <div class="wrap foot-row">
    <span>© 2026 Ощадний Кошик · koshyk.pp.ua</span>
    <span><a href="/catalog/${escapeHtml(p.category_slug)}">← До категорії "${escapeHtml(p.category_name)}"</a></span>
  </div>
</footer>

<script src="/cart.js"></script>
<script src="/theme.js"></script>
<script src="/search-autocomplete.js"></script>
<script>
(function () {
  var product = {
    id: ${p.id},
    sku: ${JSON.stringify(p.sku)},
    name: ${JSON.stringify(p.name)},
    slug: ${JSON.stringify(p.slug)},
    price: ${p.price}
  };
  var qtyInput = document.getElementById("qtyInput");
  if (qtyInput) {
    document.getElementById("qtyMinus").addEventListener("click", function () {
      qtyInput.value = Math.max(1, parseInt(qtyInput.value || "1", 10) - 1);
    });
    document.getElementById("qtyPlus").addEventListener("click", function () {
      qtyInput.value = parseInt(qtyInput.value || "1", 10) + 1;
    });
  }

  var thumbBtns = document.querySelectorAll(".thumb-btn");
  if (thumbBtns.length) {
    var mainImg = document.getElementById("mainPhotoImg");
    thumbBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        mainImg.src = btn.dataset.url;
        thumbBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
      });
    });
  }

  var addCartBtn = document.getElementById("addCartBtn");
  if (addCartBtn) {
    addCartBtn.addEventListener("click", function () {
      var qty = Math.max(1, parseInt(qtyInput.value || "1", 10));
      window.KoshykCart.addToCart(product, qty);
      var toast = document.getElementById("cartToast");
      toast.hidden = false;
      setTimeout(function () { toast.hidden = true; }, 2200);
    });
  }

  // "Замовити зараз" — оформлення замовлення напряму через /api/order
  // (той самий бекенд, що й кошик), без переходу в Telegram вручну.
  // Ціна перевіряється сервером з D1, тож клієнт передає лише id+qty.
  var orderNowBtn = document.getElementById("orderNowBtn");
  var quickOrderForm = document.getElementById("quickOrderForm");
  if (orderNowBtn && quickOrderForm) {
    orderNowBtn.addEventListener("click", function () {
      quickOrderForm.hidden = !quickOrderForm.hidden;
    });
  }

  if (quickOrderForm) {
    var orderSubmitBtn = quickOrderForm.querySelector('button[type="submit"]');
    var orderSubmitting = false;

    quickOrderForm.addEventListener("submit", function (e) {
      e.preventDefault();
      // Захист від подвійної відправки — Enter у полі + клік по кнопці,
      // подвійний клік чи повільна мережа могли раніше створити два
      // ідентичні замовлення з одного натискання.
      if (orderSubmitting) return;

      var statusEl = document.getElementById("orderStatus");
      var qty = Math.max(1, parseInt(qtyInput ? qtyInput.value : "1", 10) || 1);
      var name = document.getElementById("orderName").value.trim();
      var phone = document.getElementById("orderPhone").value.trim();
      if (!name || !phone) {
        statusEl.textContent = "Вкажіть ім'я та телефон.";
        statusEl.className = "form-status error";
        return;
      }

      orderSubmitting = true;
      if (orderSubmitBtn) orderSubmitBtn.disabled = true;
      statusEl.textContent = "Оформлення…";
      statusEl.className = "form-status";

      fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          deliveryMethod: document.getElementById("orderDelivery").value,
          customerNote: document.getElementById("orderNoteInput").value,
          items: [{ id: product.id, qty: qty }],
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            statusEl.textContent = "Замовлення №" + data.orderNumber + " прийнято! Ми зв'яжемося з вами найближчим часом.";
            statusEl.className = "form-status success";
            quickOrderForm.reset();
          } else {
            statusEl.textContent = data.error || "Помилка оформлення замовлення.";
            statusEl.className = "form-status error";
          }
        })
        .catch(function () {
          statusEl.textContent = "Помилка з'єднання.";
          statusEl.className = "form-status error";
        })
        .finally(function () {
          orderSubmitting = false;
          if (orderSubmitBtn) orderSubmitBtn.disabled = false;
        });
    });
  }

  // "Поділитися" — Web Share API з фолбеком на копіювання посилання
  var shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var shareData = { title: product.name, url: window.location.href };
      if (navigator.share) {
        navigator.share(shareData).catch(function () {});
      } else {
        navigator.clipboard.writeText(window.location.href).then(function () {
          var original = shareBtn.textContent;
          shareBtn.textContent = "Посилання скопійовано ✓";
          setTimeout(function () { shareBtn.textContent = original; }, 2000);
        });
      }
    });
  }

  // Відгуки: розгортання форми, вибір зірок, надсилання
  var writeReviewBtn = document.getElementById("writeReviewBtn");
  var reviewForm = document.getElementById("reviewForm");
  if (writeReviewBtn && reviewForm) {
    writeReviewBtn.addEventListener("click", function () {
      reviewForm.hidden = !reviewForm.hidden;
    });
  }

  var starPicker = document.getElementById("starPicker");
  var reviewRatingInput = document.getElementById("reviewRating");
  if (starPicker) {
    var starBtns = starPicker.querySelectorAll("button");
    starBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var value = parseInt(btn.dataset.value, 10);
        reviewRatingInput.value = value;
        starBtns.forEach(function (b) {
          b.classList.toggle("active", parseInt(b.dataset.value, 10) <= value);
        });
      });
    });
  }

  if (reviewForm) {
    reviewForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var statusEl = document.getElementById("reviewStatus");
      var rating = parseInt(reviewRatingInput.value, 10);
      if (!rating) {
        statusEl.textContent = "Оберіть оцінку зірками.";
        statusEl.className = "form-status error";
        return;
      }
      statusEl.textContent = "Надсилання…";
      statusEl.className = "form-status";

      fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          authorName: document.getElementById("reviewName").value,
          rating: rating,
          text: document.getElementById("reviewText").value,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) {
            statusEl.textContent = "Дякуємо! Відгук з'явиться на сторінці після перевірки модератором.";
            statusEl.className = "form-status success";
            reviewForm.reset();
            reviewRatingInput.value = "0";
            starBtns.forEach ? starBtns.forEach(function (b) { b.classList.remove("active"); }) : null;
          } else {
            statusEl.textContent = data.error || "Помилка надсилання.";
            statusEl.className = "form-status error";
          }
        })
        .catch(function () {
          statusEl.textContent = "Помилка з'єднання.";
          statusEl.className = "form-status error";
        });
    });
  }
})();
</script>
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

// JSON.stringify всередині <script>, з екрануванням "</" — щоб опис
// товару з БД не міг передчасно закрити тег <script>.
function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
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
  body { background: var(--bg); color: var(--ink); font-family: 'Nunito', system-ui, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; transition: background 0.2s ease, color 0.2s ease; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
  h1, h2, h3 { font-family: 'Baloo 2', sans-serif; }

  header { padding: 18px 0; background: var(--card); border-bottom: 2px solid var(--teal); box-shadow: 0 0 20px -4px var(--teal); position: sticky; top: 0; z-index: 20; }
  .header-row { display: flex; align-items: center; gap: 18px; }
  .logo { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 1.3rem; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .logo-mark { width: 38px; height: 38px; border-radius: 12px; background: linear-gradient(135deg, var(--coral), var(--purple)); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 800; transform: rotate(-6deg); box-shadow: 0 0 16px -2px var(--coral); }
  .header-search { flex: 1; max-width: 380px; margin: 0 20px; display: flex; }
  .header-search input { flex: 1; padding: 10px 16px; border-radius: 100px 0 0 100px; border: 2px solid var(--teal); border-right: none; background: var(--bg); color: var(--ink); font-size: 0.86rem; }
  .header-search input::placeholder { color: var(--ink-soft); }
  .header-search button { border: 2px solid var(--teal); border-radius: 0 100px 100px 0; background: var(--yellow); color: #14151F; padding: 0 16px; cursor: pointer; font-weight: 800; box-shadow: 0 0 14px -2px var(--yellow); }
  .header-search button:hover { background: var(--coral); color: #fff; }
  nav { display: flex; align-items: center; gap: 18px; font-size: 0.92rem; font-weight: 700; color: var(--ink-soft); flex-shrink: 0; }
  nav a:hover { color: var(--ink); }
  .theme-toggle { background: var(--bg); border: 2px solid var(--line); width: 38px; height: 38px; border-radius: 100px; display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; flex-shrink: 0; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  .theme-toggle:hover { border-color: var(--teal); box-shadow: 0 0 14px -3px var(--teal); }
  .theme-icon-light { display: none; }
  html[data-theme="light"] .theme-icon-dark { display: none; }
  html[data-theme="light"] .theme-icon-light { display: inline; }
  .cart-link { position: relative; display: flex; align-items: center; gap: 6px; background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff !important; padding: 9px 16px; border-radius: 100px; box-shadow: 0 0 16px -3px var(--purple); }
  .cart-link:hover { box-shadow: 0 0 22px -2px var(--coral); }

  .crumbs { padding: 4px 28px 24px; font-size: 0.86rem; color: var(--ink-soft); }
  .crumbs a:hover { color: var(--ink); }
  .crumbs span { margin: 0 4px; }

  .product-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 46px; padding-bottom: 60px; align-items: start; }
  .photo-box { aspect-ratio: 1; background: var(--card); border: 2px solid var(--line); border-radius: var(--radius); display: flex; align-items: center; justify-content: center; font-size: 5rem; overflow: hidden; position: relative; }
  .photo-box img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .photo-thumbs { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
  .thumb-btn { width: 64px; height: 64px; border-radius: 10px; overflow: hidden; border: 2px solid var(--line); padding: 0; cursor: pointer; background: var(--card); position: relative; }
  .thumb-btn.active { border-color: var(--teal); box-shadow: 0 0 14px -4px var(--teal); }
  .thumb-btn img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }

  .sku-tag { font-family: 'Baloo 2', sans-serif; font-size: 0.78rem; color: var(--ink-soft); background: var(--card); border: 1.5px solid var(--line); display: inline-block; padding: 5px 11px; border-radius: 100px; margin-bottom: 16px; font-weight: 700; }
  .product-info h1 { font-weight: 700; font-size: clamp(1.6rem, 3vw, 2.1rem); line-height: 1.15; letter-spacing: -0.01em; margin-bottom: 10px; }
  .meta-line { color: var(--ink-soft); font-size: 0.94rem; margin-bottom: 20px; text-transform: capitalize; font-weight: 600; }

  .price-block { margin-bottom: 26px; }
  .price { font-family: 'Baloo 2', sans-serif; font-weight: 800; font-size: 2rem; color: var(--coral); }
  .price.price-out { color: var(--ink-soft); text-decoration: line-through; }
  .stock-badge { display: inline-block; margin-left: 12px; background: rgba(255,61,113,0.14); color: var(--coral); font-size: 0.82rem; font-weight: 700; padding: 5px 12px; border-radius: 100px; vertical-align: middle; }
  .out-of-stock-note { background: var(--card); border: 2px solid var(--line); border-radius: 12px; padding: 16px 18px; }

  .share-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 2px solid var(--line); color: var(--ink-soft); font-weight: 700; font-size: 0.86rem; padding: 9px 18px; border-radius: 100px; cursor: pointer; margin: 18px 0; }
  .share-btn:hover { border-color: var(--teal); color: var(--ink); box-shadow: 0 0 14px -4px var(--teal); }

  .delivery-box { background: var(--card); border: 2px solid var(--line); border-radius: var(--radius); padding: 18px 20px; margin-bottom: 26px; }
  .delivery-box p { font-size: 0.9rem; color: var(--ink-soft); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .delivery-box p:last-child { margin-bottom: 0; }
  .delivery-box b { color: var(--ink); font-weight: 800; }
  .delivery-icon { flex-shrink: 0; }

  .reviews-section { background: var(--card); padding: 50px 0 60px; border-top: 2px solid var(--line); }
  .reviews-section h2 { font-weight: 700; font-size: 1.4rem; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
  .reviews-avg { font-family: 'Baloo 2', sans-serif; font-size: 0.9rem; font-weight: 700; color: var(--ink-soft); background: var(--bg); padding: 4px 12px; border-radius: 100px; }
  .reviews-list { display: flex; flex-direction: column; gap: 18px; margin-bottom: 28px; }
  .review-item { border-bottom: 1px solid var(--line); padding-bottom: 18px; }
  .review-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .review-stars { color: var(--yellow); font-size: 1rem; letter-spacing: 1px; text-shadow: 0 0 8px rgba(255,230,0,0.4); }
  .review-author { font-weight: 700; font-size: 0.9rem; }
  .review-date { font-size: 0.78rem; color: var(--ink-soft); }
  .review-text { font-size: 0.9rem; color: var(--ink-soft); line-height: 1.6; }
  .no-reviews { color: var(--ink-soft); font-size: 0.9rem; }

  .write-review-cta { background: var(--bg); border: 2px dashed var(--line); border-radius: var(--radius); padding: 18px 20px; margin-bottom: 20px; }
  .write-review-btn { background: none; border: none; color: var(--teal); font-weight: 700; font-size: 0.92rem; cursor: pointer; padding: 0; }
  .write-review-btn:hover { text-decoration: underline; }

  .side-form { background: var(--bg); border: 2px solid var(--line); border-radius: var(--radius); padding: 24px; max-width: 480px; }
  .side-form h3 { font-size: 1.1rem; margin-bottom: 16px; }
  .side-form .form-row { margin-bottom: 14px; }
  .side-form label { display: block; font-size: 0.8rem; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
  .side-form input[type="text"], .side-form select, .side-form textarea { width: 100%; padding: 10px 12px; border-radius: 8px; border: 2px solid var(--line); background: var(--card); color: var(--ink); font-family: 'Nunito', sans-serif; font-size: 0.88rem; }
  .side-form input:focus, .side-form select:focus, .side-form textarea:focus { outline: none; border-color: var(--teal); }
  .side-form textarea { min-height: 70px; resize: vertical; }
  .quick-order-form { margin: 18px 0 0; }
  .star-picker { display: flex; gap: 6px; }
  .star-picker button { background: none; border: none; font-size: 1.6rem; color: var(--line); cursor: pointer; padding: 0; line-height: 1; }
  .star-picker button.active { color: var(--yellow); text-shadow: 0 0 8px rgba(255,230,0,0.4); }
  .submit-btn { background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff; font-weight: 800; padding: 11px 24px; border-radius: 100px; border: none; cursor: pointer; font-size: 0.9rem; box-shadow: 0 0 16px -3px var(--purple); }
  .submit-btn:hover { box-shadow: 0 0 22px -2px var(--coral); }
  .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
  .form-status { margin-top: 10px; font-size: 0.84rem; font-weight: 700; }
  .form-status.success { color: var(--teal); }
  .form-status.error { color: var(--coral); }

  .order-btn { display: inline-block; background: linear-gradient(135deg, var(--purple), var(--coral)); color: #fff; font-weight: 800; font-size: 0.98rem; padding: 15px 30px; border-radius: 100px; border: none; cursor: pointer; box-shadow: 0 0 18px -4px var(--purple); transition: box-shadow 0.15s ease, transform 0.15s ease; }
  .order-btn:hover { box-shadow: 0 0 24px -2px var(--coral); transform: translateY(-1px); }
  .order-note { font-size: 0.82rem; color: var(--ink-soft); margin-top: 12px; max-width: 42ch; font-weight: 600; }

  .qty-row { margin-bottom: 22px; }
  .qty-row label { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); font-weight: 700; margin-bottom: 8px; }
  .qty-control { display: inline-flex; align-items: center; border: 2px solid var(--line); border-radius: 100px; background: var(--card); }
  .qty-control button { width: 38px; height: 38px; border: none; background: none; font-size: 1.1rem; cursor: pointer; color: var(--ink); }
  .qty-control input { width: 50px; text-align: center; border: none; background: none; font-family: 'Baloo 2', sans-serif; font-size: 0.94rem; color: var(--ink); -moz-appearance: textfield; }
  .qty-control input::-webkit-outer-spin-button, .qty-control input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

  .action-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .add-cart-btn { background: var(--teal); color: #14151F; font-weight: 800; font-size: 0.98rem; padding: 15px 26px; border-radius: 100px; border: none; cursor: pointer; box-shadow: 0 0 18px -4px var(--teal); transition: box-shadow 0.15s ease, transform 0.15s ease; }
  .add-cart-btn:hover { box-shadow: 0 0 24px -2px var(--teal-deep); transform: translateY(-1px); }
  .cart-toast { margin-top: 14px; font-size: 0.86rem; font-weight: 700; color: var(--teal); }

  .description { margin-top: 34px; padding-top: 24px; border-top: 2px solid var(--line); }
  .description h2 { font-size: 1.1rem; margin-bottom: 10px; }
  .description p { color: var(--ink-soft); font-size: 0.94rem; }

  .related-section { background: var(--card); padding: 50px 0 60px; border-top: 2px solid var(--line); }
  .related-section h2 { font-weight: 700; font-size: 1.4rem; margin-bottom: 24px; }
  .related-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .related-card { background: var(--bg); border: 2px solid var(--line); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; }
  .related-card:hover { transform: translateY(-3px); border-color: var(--teal); box-shadow: 0 0 20px -6px var(--teal); }
  .related-thumb { aspect-ratio: 1; background: var(--card); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; overflow: hidden; position: relative; }
  .related-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .related-name { font-size: 0.86rem; font-weight: 700; line-height: 1.3; }
  .related-price { font-family: 'Baloo 2', sans-serif; font-weight: 800; color: var(--coral); font-size: 0.9rem; }

  footer { padding: 40px 0; }
  .foot-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; font-size: 0.86rem; color: var(--ink-soft); }

  @media (max-width: 880px) {
    .product-layout { grid-template-columns: 1fr; }
    .related-grid { grid-template-columns: repeat(2, 1fr); }
    nav a:not(.cart-link) { display: none; }
    .header-search { max-width: none; margin: 0 12px; }
    .header-row { flex-wrap: nowrap; }
  }
  `;
}
