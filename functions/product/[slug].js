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

// TODO: замінити на реальний юзернейм Telegram-бота/каналу магазину,
// коли він буде створений (за аналогією з AGRO3 client-side ordering).
const STORE_TELEGRAM_USERNAME = "ahronon_order_bot";

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
  const { results: related } = await env.koshyk_db
    .prepare(
      `SELECT name, slug, price FROM products
       WHERE category_id = (SELECT category_id FROM products WHERE slug = ?) AND slug != ?
       ORDER BY RANDOM() LIMIT 4`
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
<html lang="uk"><head><meta charset="UTF-8"><title>Товар не знайдено — Ощадний Кошик</title></head>
<body style="font-family:sans-serif;padding:60px;text-align:center;">
  <h1>Товар не знайдено</h1>
  <p><a href="/">← На головну</a></p>
</body></html>`;
}

function renderPage(p, attrs, icon, related, images, reviews, avgRating, reviewCount, settings) {
  const hasPhotos = images && images.length > 0;
  const mainImageUrl = hasPhotos ? `/img/${images[0].r2_key}` : null;
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

  const telegramText = encodeURIComponent(
    `Вітаю! Хочу замовити: ${p.name} (${p.sku}), ціна ${p.price} ₴`
  );
  const telegramUrl = `https://t.me/${STORE_TELEGRAM_USERNAME}?text=${telegramText}`;

  const relatedHtml = related.length
    ? related
        .map(
          (r) => `
      <a class="related-card" href="/product/${escapeHtml(r.slug)}">
        <div class="related-thumb">${icon}</div>
        <div class="related-name">${escapeHtml(r.name)}</div>
        <div class="related-price">${Number(r.price).toFixed(2)} ₴</div>
      </a>`
        )
        .join("")
    : "";

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(p.name)} — Ощадний Кошик</title>
<meta name="description" content="${escapeHtml(p.name)} — ${p.price} ₴. Купити в Ощадному Кошику.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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
      <a class="order-btn" href="${telegramUrl}" target="_blank" rel="noopener">
        Замовити зараз →
      </a>
    </div>

    <div class="cart-toast" id="cartToast" hidden>Додано в кошик ✓</div>

    <p class="order-note">«Додати в кошик» — зібрати декілька товарів і оформити одне замовлення. «Замовити зараз» — миттєве повідомлення в Telegram тільки з цим товаром.</p>`
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

    <form class="review-form" id="reviewForm" hidden>
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
      <button type="submit" class="submit-review-btn">Надіслати</button>
      <div class="review-status" id="reviewStatus"></div>
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
        statusEl.className = "review-status error";
        return;
      }
      statusEl.textContent = "Надсилання…";
      statusEl.className = "review-status";

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
            statusEl.className = "review-status success";
            reviewForm.reset();
            reviewRatingInput.value = "0";
            starBtns.forEach ? starBtns.forEach(function (b) { b.classList.remove("active"); }) : null;
          } else {
            statusEl.textContent = data.error || "Помилка надсилання.";
            statusEl.className = "review-status error";
          }
        })
        .catch(function () {
          statusEl.textContent = "Помилка з'єднання.";
          statusEl.className = "review-status error";
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

function css() {
  return `
  :root {
    --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E;
    --red: #C8462E; --red-deep: #A73A26; --green: #33604A; --green-deep: #244A39;
    --line: rgba(35, 39, 31, 0.14); --radius: 14px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }

  header { padding: 22px 0; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.35rem; display: flex; align-items: center; gap: 10px; }
  .logo-mark { width: 34px; height: 34px; border-radius: 8px; background: var(--green); color: var(--card); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; transform: rotate(-6deg); }
  nav { display: flex; gap: 26px; font-size: 0.94rem; font-weight: 600; color: var(--ink-soft); }
  nav a:hover { color: var(--ink); }
  .cart-link { position: relative; display: inline-flex; align-items: center; gap: 6px; }
  .header-search { display: flex; flex: 1; max-width: 380px; margin: 0 20px; }
  .header-search input { flex: 1; padding: 10px 16px; border-radius: 100px 0 0 100px; border: 1.5px solid var(--line); border-right: none; background: var(--card); font-size: 0.86rem; }
  .header-search button { border: 1.5px solid var(--line); border-radius: 0 100px 100px 0; background: var(--ink); color: var(--card); padding: 0 16px; cursor: pointer; }
  .cart-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; background: var(--red); color: #fff; border-radius: 100px; font-size: 0.72rem; font-weight: 700; }

  .crumbs { padding: 4px 28px 24px; font-size: 0.86rem; color: var(--ink-soft); }
  .crumbs a:hover { color: var(--ink); }
  .crumbs span { margin: 0 4px; }

  .product-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 46px; padding-bottom: 60px; align-items: start; }
  .photo-box { aspect-ratio: 1; background: var(--card); border: 1.5px solid var(--line); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 5rem; overflow: hidden; position: relative; }
  .photo-box img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
  .photo-thumbs { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
  .thumb-btn { width: 64px; height: 64px; border-radius: 10px; overflow: hidden; border: 1.5px solid var(--line); padding: 0; cursor: pointer; background: var(--card); position: relative; }
  .thumb-btn.active { border-color: var(--green); border-width: 2px; }
  .thumb-btn img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }

  .sku-tag { font-family: 'IBM Plex Mono', monospace; font-size: 0.78rem; color: var(--ink-soft); background: var(--card); border: 1px solid var(--line); display: inline-block; padding: 5px 11px; border-radius: 100px; margin-bottom: 16px; }
  .product-info h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(1.6rem, 3vw, 2.1rem); line-height: 1.15; letter-spacing: -0.01em; margin-bottom: 10px; }
  .meta-line { color: var(--ink-soft); font-size: 0.94rem; margin-bottom: 20px; text-transform: capitalize; }

  .price-block { margin-bottom: 26px; }
  .price { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 2rem; color: var(--red-deep); }
  .price.price-out { color: var(--ink-soft); text-decoration: line-through; }
  .stock-badge { display: inline-block; margin-left: 12px; background: rgba(200,70,46,0.1); color: var(--red-deep); font-size: 0.82rem; font-weight: 700; padding: 5px 12px; border-radius: 100px; vertical-align: middle; }
  .out-of-stock-note { background: var(--paper); border: 1.5px solid var(--line); border-radius: 12px; padding: 16px 18px; }

  .share-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--card); border: 1.5px solid var(--line); color: var(--ink-soft); font-weight: 600; font-size: 0.86rem; padding: 9px 18px; border-radius: 100px; cursor: pointer; margin: 18px 0; }
  .share-btn:hover { border-color: var(--ink); color: var(--ink); }

  .delivery-box { background: var(--paper); border: 1.5px solid var(--line); border-radius: 14px; padding: 18px 20px; margin-bottom: 26px; }
  .delivery-box p { font-size: 0.9rem; color: var(--ink-soft); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  .delivery-box p:last-child { margin-bottom: 0; }
  .delivery-box b { color: var(--ink); font-weight: 700; }
  .delivery-icon { flex-shrink: 0; }

  .reviews-section { background: var(--card); padding: 50px 0 60px; border-top: 1.5px solid var(--line); }
  .reviews-section h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.4rem; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
  .reviews-avg { font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; font-weight: 600; color: var(--ink-soft); background: var(--paper); padding: 4px 12px; border-radius: 100px; }
  .reviews-list { display: flex; flex-direction: column; gap: 18px; margin-bottom: 28px; }
  .review-item { border-bottom: 1px solid var(--line); padding-bottom: 18px; }
  .review-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .review-stars { color: var(--mustard, #E0A400); font-size: 1rem; letter-spacing: 1px; }
  .review-author { font-weight: 700; font-size: 0.9rem; }
  .review-date { font-size: 0.78rem; color: var(--ink-soft); }
  .review-text { font-size: 0.9rem; color: var(--ink-soft); line-height: 1.6; }
  .no-reviews { color: var(--ink-soft); font-size: 0.9rem; }

  .write-review-cta { background: var(--paper); border: 1.5px dashed var(--line); border-radius: 14px; padding: 18px 20px; margin-bottom: 20px; }
  .write-review-btn { background: none; border: none; color: var(--green-deep); font-weight: 700; font-size: 0.92rem; cursor: pointer; padding: 0; }
  .write-review-btn:hover { text-decoration: underline; }

  .review-form { background: var(--paper); border: 1.5px solid var(--line); border-radius: 14px; padding: 24px; max-width: 480px; }
  .review-form h3 { font-family: 'Fraunces', serif; font-size: 1.1rem; margin-bottom: 16px; }
  .review-form .form-row { margin-bottom: 14px; }
  .review-form label { display: block; font-size: 0.8rem; font-weight: 700; color: var(--ink-soft); margin-bottom: 6px; }
  .review-form input[type="text"], .review-form textarea { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--card); font-family: 'Manrope', sans-serif; font-size: 0.88rem; }
  .review-form textarea { min-height: 70px; resize: vertical; }
  .star-picker { display: flex; gap: 6px; }
  .star-picker button { background: none; border: none; font-size: 1.6rem; color: var(--line); cursor: pointer; padding: 0; line-height: 1; }
  .star-picker button.active { color: var(--mustard, #E0A400); }
  .submit-review-btn { background: var(--green); color: var(--card); font-weight: 700; padding: 11px 24px; border-radius: 100px; border: none; cursor: pointer; font-size: 0.9rem; }
  .submit-review-btn:hover { background: var(--green-deep); }
  .review-status { margin-top: 10px; font-size: 0.84rem; font-weight: 600; }
  .review-status.success { color: var(--green-deep); }
  .review-status.error { color: var(--red-deep); }

  .order-btn { display: inline-block; background: var(--ink); color: var(--card); font-weight: 700; font-size: 0.98rem; padding: 15px 30px; border-radius: 100px; transition: background 0.15s ease, transform 0.15s ease; }
  .order-btn:hover { background: var(--green-deep); transform: translateY(-1px); }
  .order-note { font-size: 0.82rem; color: var(--ink-soft); margin-top: 12px; max-width: 42ch; }

  .qty-row { margin-bottom: 22px; }
  .qty-row label { display: block; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); font-weight: 700; margin-bottom: 8px; }
  .qty-control { display: inline-flex; align-items: center; border: 1.5px solid var(--line); border-radius: 100px; background: var(--card); }
  .qty-control button { width: 38px; height: 38px; border: none; background: none; font-size: 1.1rem; cursor: pointer; color: var(--ink); }
  .qty-control input { width: 50px; text-align: center; border: none; background: none; font-family: 'IBM Plex Mono', monospace; font-size: 0.94rem; color: var(--ink); -moz-appearance: textfield; }
  .qty-control input::-webkit-outer-spin-button, .qty-control input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

  .action-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .add-cart-btn { background: var(--green); color: var(--card); font-weight: 700; font-size: 0.98rem; padding: 15px 26px; border-radius: 100px; border: none; cursor: pointer; transition: background 0.15s ease, transform 0.15s ease; }
  .add-cart-btn:hover { background: var(--green-deep); transform: translateY(-1px); }
  .cart-toast { margin-top: 14px; font-size: 0.86rem; font-weight: 600; color: var(--green-deep); }

  .description { margin-top: 34px; padding-top: 24px; border-top: 1.5px solid var(--line); }
  .description h2 { font-family: 'Fraunces', serif; font-size: 1.1rem; margin-bottom: 10px; }
  .description p { color: var(--ink-soft); font-size: 0.94rem; }

  .related-section { background: var(--card); padding: 50px 0 60px; border-top: 1.5px solid var(--line); }
  .related-section h2 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 1.4rem; margin-bottom: 24px; }
  .related-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .related-card { background: var(--paper); border: 1.5px solid var(--line); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; gap: 8px; transition: transform 0.15s ease; }
  .related-card:hover { transform: translateY(-3px); }
  .related-thumb { aspect-ratio: 1; background: var(--card); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; }
  .related-name { font-size: 0.86rem; font-weight: 600; line-height: 1.3; }
  .related-price { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: var(--red-deep); font-size: 0.9rem; }

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
