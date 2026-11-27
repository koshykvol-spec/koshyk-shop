// GET /admin/products — список товарів з пошуком/фільтром, рендер
// клієнтський через /admin/api/products (аналог логіки каталогу,
// але без публічних обмежень і з можливістю редагування).

export async function onRequestGet(context) {
  const { env } = context;
  const { results: categories } = await env.koshyk_db
    .prepare("SELECT id, slug, name_uk FROM categories ORDER BY sort_order")
    .all();
  const { results: brandRows } = await env.koshyk_db
    .prepare("SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != '' ORDER BY brand")
    .all();
  const brands = brandRows.map((r) => r.brand);

  return new Response(renderPage(categories, brands), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(categories, brands) {
  const options = categories
    .map((c) => `<option value="${c.slug}">${escapeHtml(c.name_uk)}</option>`)
    .join("");
  // Для форми редагування товару: value = id категорії (products.category_id).
  const editCategoryOptions = categories
    .map((c) => `<option value="${c.id}">${escapeHtml(c.name_uk)}</option>`)
    .join("");
  const brandOptions = brands.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Товари — Адмінка Ощадного Кошика</title>
<link rel="icon" type="image/png" href="/icon-192.png">
<style>
/* Локальні шрифти замість Google Fonts CDN для адмінки */

/* ---- Fraunces (заголовки; латиниця — кирилиця в шрифті відсутня) ---- */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/fraunces-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/fraunces-latin-700-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

/* ---- Manrope (основний текст) ---- */
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-400-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-400-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-400-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-500-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-500-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-500-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-600-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-600-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/manrope-latin-700-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-700-normal.woff2") format("woff2");
  unicode-range: U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
@font-face {
  font-family: 'Manrope';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url("/fonts/admin/manrope-cyrillic-ext-700-normal.woff2") format("woff2");
  unicode-range: U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;
}

/* ---- IBM Plex Mono (числа в чіпах) ---- */
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/admin/ibm-plex-mono-latin-400-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/admin/ibm-plex-mono-latin-500-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url("/fonts/admin/ibm-plex-mono-latin-600-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

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
      <a href="/admin/bulk">Масові дії</a>
      <a href="/admin/attributes">Черга доправки</a>
      <a href="/admin/reviews">Відгуки</a>
      <a href="/admin/settings">Налаштування</a>
      <a href="/">← На сайт</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <h1>Товари <span class="count" id="totalCount">…</span></h1>

  <div class="controls">
    <input type="text" id="searchInput" placeholder="Пошук за назвою або SKU…">
    <select id="categorySelect">
      <option value="">Усі категорії</option>
      ${options}
    </select>
    <select id="brandSelect">
      <option value="">Усі бренди</option>
      ${brandOptions}
    </select>
  </div>
  <div id="missingIndicator"></div>
  <div id="bulkBar" class="bulk-bar" hidden></div>

  <div id="productTable"></div>
  <div class="pagination" id="pagination"></div>
</div>

<!-- Модалка редагування (на весь екран) -->
<div class="modal-overlay" id="editOverlay" hidden>
  <div class="modal">
    <div class="modal-header">
      <h2>Редагувати товар</h2>
      <button type="button" id="closeEditX" class="modal-close-x" aria-label="Закрити">✕</button>
    </div>
    <input type="hidden" id="editId">
    <div class="form-row"><label>Назва</label><input type="text" id="editName"></div>
    <div class="form-row"><label>Ціна, ₴</label><input type="number" step="0.01" id="editPrice"></div>
    <div class="form-row"><label>Бренд</label><input type="text" id="editBrand"></div>
    <div class="form-row"><label>Категорія <span style="color:#c0392b">*</span></label>
      <select id="editCategory" required>
        <option value="">— оберіть категорію —</option>
        ${editCategoryOptions}
      </select>
    </div>
    <div class="form-row form-row-checkbox">
      <label class="checkbox-label">
        <input type="checkbox" id="editInStock">
        <span>В наявності</span>
      </label>
    </div>
    <div class="form-row">
      <label>Фото товару</label>
      <div class="photo-gallery" id="photoGallery"></div>
      <input type="file" id="photoInput" accept="image/*" multiple>
      <div class="upload-status" id="uploadStatus"></div>
    </div>
    <div class="form-row"><label>Опис</label><textarea id="editDescription"></textarea></div>
    <div class="seo-divider">SEO</div>
    <div class="form-row"><label>Meta title</label><input type="text" id="editMetaTitle"></div>
    <div class="form-row"><label>Meta description</label><textarea id="editMetaDescription"></textarea></div>
    <div class="form-row"><label>Ключові слова (через кому)</label><input type="text" id="editKeywords" placeholder="альбом, малювання, канцтовари"></div>
    <div class="modal-footer">
      <div class="modal-actions">
        <button type="button" id="cancelEdit">Скасувати</button>
        <button type="button" id="saveEdit">Зберегти</button>
      </div>
      <div class="modal-status" id="modalStatus"></div>
    </div>
  </div>
</div>

<script>
${clientJs()}
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

function clientJs() {
  return `
(function () {
  var urlParams = new URLSearchParams(window.location.search);
  var state = {
    search: urlParams.get("search") || "",
    category: urlParams.get("category") || "",
    brand: urlParams.get("brand") || "",
    missing: urlParams.get("missing") || "",
    page: 1,
  };
  var table = document.getElementById("productTable");
  var pagination = document.getElementById("pagination");
  var totalCount = document.getElementById("totalCount");
  var searchInput = document.getElementById("searchInput");
  var categorySelect = document.getElementById("categorySelect");
  var brandSelect = document.getElementById("brandSelect");
  var bulkBar = document.getElementById("bulkBar");
  var debounceTimer;

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function fetchData() {
    var params = new URLSearchParams();
    if (state.search) params.set("search", state.search);
    if (state.category) params.set("category", state.category);
    if (state.brand) params.set("brand", state.brand);
    if (state.missing) params.set("missing", state.missing);
    params.set("page", state.page);

    table.innerHTML = '<p class="loading">Завантаження…</p>';
    bulkBar.hidden = true;

    fetch("/admin/api/products?" + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        renderTable(data.products);
        renderPagination(data.page, data.totalPages);
        totalCount.textContent = data.total;
        renderMissingIndicator();
      });
  }

  var MISSING_LABELS = { description: "без опису", photo: "без фото", seo: "без SEO", keywords: "без ключових слів" };

  function renderMissingIndicator() {
    var el = document.getElementById("missingIndicator");
    if (!state.missing) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="missing-tag">Фільтр: товари ' + (MISSING_LABELS[state.missing] || state.missing) + ' <button type="button" id="clearMissing">✕</button></div>';
    document.getElementById("clearMissing").addEventListener("click", function () {
      state.missing = "";
      fetchData();
    });
  }

  // ── Масові дії (чекбокси в таблиці) ──────────────────────────────
  function selectedIds() {
    return Array.prototype.slice.call(table.querySelectorAll(".row-select:checked")).map(function (cb) { return cb.dataset.id; });
  }

  function updateBulkBar() {
    var ids = selectedIds();
    if (!ids.length) { bulkBar.hidden = true; bulkBar.innerHTML = ""; return; }
    bulkBar.hidden = false;
    bulkBar.innerHTML =
      '<span class="bulk-count">' + ids.length + ' обрано</span>' +
      '<button type="button" id="bulkMarkOut" class="bulk-btn bulk-btn-out">Позначити як недоступні</button>' +
      '<button type="button" id="bulkMarkIn" class="bulk-btn bulk-btn-in">Позначити як в наявності</button>';
    document.getElementById("bulkMarkOut").addEventListener("click", function () { applyBulkStock(false); });
    document.getElementById("bulkMarkIn").addEventListener("click", function () { applyBulkStock(true); });
  }

  function applyBulkStock(inStock) {
    var ids = selectedIds();
    if (!ids.length) return;
    bulkBar.innerHTML = '<span class="bulk-count">Оновлення…</span>';
    fetch("/admin/api/bulk-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids, inStock: inStock }),
    })
      .then(function (r) { return r.json(); })
      .then(function () { fetchData(); });
  }

  function renderTable(products) {
    if (!products.length) {
      table.innerHTML = '<p class="loading">Нічого не знайдено.</p>';
      return;
    }
    var rows = products.map(function (p) {
      return '' +
        '<tr data-id="' + p.id + '">' +
          '<td style="width:24px;text-align:center"><input type="checkbox" class="row-select" data-id="' + p.id + '"></td>' +
          '<td class="mono">' + escapeHtml(p.sku) + '</td>' +
          '<td>' + escapeHtml(p.name) + '</td>' +
          '<td>' + escapeHtml(p.categoryName) + '</td>' +
          '<td class="mono">' + p.price.toFixed(2) + ' ₴</td>' +
          '<td>' + (p.hasRealPhoto ? '✅' : '—') + '</td>' +
          '<td>' + (p.inStock ? '<span class="stock-badge stock-yes">в наявності</span>' : '<span class="stock-badge stock-no">немає</span>') + '</td>' +
          '<td><button type="button" class="edit-btn" data-id="' + p.id + '">Редагувати</button></td>' +
        '</tr>';
    }).join("");

    table.innerHTML = '<table><thead><tr>' +
      '<th style="width:24px"><input type="checkbox" id="selectAllCheckbox"></th>' +
      '<th>SKU</th><th>Назва</th><th>Категорія</th><th>Ціна</th><th>Фото</th><th>Наявність</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';

    table.querySelectorAll(".edit-btn").forEach(function (btn) {
      btn.addEventListener("click", function () { openEdit(btn.dataset.id, products); });
    });

    table.querySelectorAll(".row-select").forEach(function (cb) {
      cb.addEventListener("change", updateBulkBar);
    });

    var selectAll = document.getElementById("selectAllCheckbox");
    selectAll.addEventListener("change", function () {
      table.querySelectorAll(".row-select").forEach(function (cb) { cb.checked = selectAll.checked; });
      updateBulkBar();
    });

    updateBulkBar();
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
      });
    });
  }

  var overlay = document.getElementById("editOverlay");
  var currentProductId = null;

  function openEdit(id, products) {
    var p = products.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    currentProductId = p.id;
    document.getElementById("editId").value = p.id;
    document.getElementById("editName").value = p.name;
    document.getElementById("editPrice").value = p.price;
    document.getElementById("editBrand").value = p.brand || "";
    document.getElementById("editCategory").value = p.categoryId ? String(p.categoryId) : "";
    document.getElementById("editInStock").checked = !!p.inStock;
    document.getElementById("editDescription").value = p.description || "";
    document.getElementById("editMetaTitle").value = p.metaTitle || "";
    document.getElementById("editMetaDescription").value = p.metaDescription || "";
    document.getElementById("editKeywords").value = p.keywords || "";
    document.getElementById("modalStatus").textContent = "";
    document.getElementById("photoInput").value = "";
    document.getElementById("uploadStatus").textContent = "";
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    loadGallery(p.id);
  }

  function closeEdit() {
    overlay.hidden = true;
    document.body.style.overflow = "";
  }

  function loadGallery(productId) {
    var gallery = document.getElementById("photoGallery");
    gallery.innerHTML = '<p class="gallery-loading">Завантаження фото…</p>';
    fetch("/admin/api/product-images?productId=" + productId)
      .then(function (r) { return r.json(); })
      .then(function (data) { renderGallery(data.images || []); });
  }

  // ── Drag&drop сортування галереї ─────────────────────────────────
  function attachDragReorder(gallery) {
    var dragEl = null;
    function thumbs() { return Array.prototype.slice.call(gallery.querySelectorAll(".photo-thumb")); }
    function saveOrder() {
      var ids = thumbs().map(function (t) { return t.dataset.imageId; });
      fetch("/admin/api/reorder-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: currentProductId, order: ids }),
      });
    }
    thumbs().forEach(function (t) {
      t.addEventListener("dragstart", function (e) {
        dragEl = t;
        t.style.opacity = "0.4";
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", "x"); } catch (_) {}
      });
      t.addEventListener("dragend", function () {
        t.style.opacity = "";
        saveOrder();
      });
      t.addEventListener("dragover", function (e) {
        e.preventDefault();
        if (!dragEl || dragEl === t) return;
        var r = t.getBoundingClientRect();
        var before = (e.clientX - r.left) < r.width / 2;
        gallery.insertBefore(dragEl, before ? t : t.nextSibling);
      });
    });
  }

  function renderGallery(images) {
    var gallery = document.getElementById("photoGallery");
    if (!images.length) {
      gallery.innerHTML = '<p class="gallery-empty">Фото ще немає — додайте нижче.</p>';
      return;
    }
    var hint = images.length > 1 ? '<p class="gallery-hint">🖐 перетягуйте фото для зміни порядку · 🔍 клік по фото — переглянути</p>' : '';
    gallery.innerHTML = hint + images.map(function (img) {
      return '' +
        '<div class="photo-thumb' + (img.isPrimary ? ' primary' : '') + '" draggable="true" data-image-id="' + img.id + '" title="Клік — переглянути, перетягніть — змінити порядок">' +
          '<img src="' + img.url + '" alt="">' +
          (img.isPrimary ? '<span class="primary-badge">Головне</span>' : '<button type="button" class="make-primary-btn">Зробити головним</button>') +
          '<button type="button" class="delete-photo-btn">✕</button>' +
        '</div>';
    }).join("");

    gallery.querySelectorAll(".make-primary-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var imageId = btn.closest(".photo-thumb").dataset.imageId;
        fetch("/admin/api/set-primary-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: currentProductId, imageId: imageId }),
        })
          .then(function (r) { return r.json(); })
          .then(function () { loadGallery(currentProductId); });
      });
    });

    gallery.querySelectorAll(".delete-photo-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var imageId = btn.closest(".photo-thumb").dataset.imageId;
        if (!confirm("Видалити це фото?")) return;
        fetch("/admin/api/delete-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: imageId }),
        })
          .then(function (r) { return r.json(); })
          .then(function () { loadGallery(currentProductId); });
      });
    });

    attachDragReorder(gallery);
    attachViewer(gallery);
  }

  // ── Перегляд фото (великий розмір) ───────────────────────────────
  var pv = null, pvList = [], pvIdx = 0, pvPrevOverflow = "";
  function pvBuild() {
    pv = document.createElement("div");
    pv.className = "pv";
    pv.hidden = true;
    pv.setAttribute("role", "dialog");
    pv.setAttribute("aria-modal", "true");
    pv.setAttribute("aria-label", "Перегляд фото");
    pv.innerHTML =
      '<button type="button" class="pv-close" aria-label="Закрити">×</button>' +
      '<button type="button" class="pv-prev" aria-label="Попереднє фото">‹</button>' +
      '<img class="pv-img" alt="">' +
      '<button type="button" class="pv-next" aria-label="Наступне фото">›</button>' +
      '<div class="pv-bar"><span class="pv-count"></span><span class="pv-main"></span><a class="pv-open" target="_blank" rel="noopener">Відкрити оригінал ↗</a><button type="button" class="pv-edit">✏️ Редагувати</button></div>';
    document.body.appendChild(pv);
    pv.querySelector(".pv-close").addEventListener("click", pvClose);
    pv.querySelector(".pv-edit").addEventListener("click", function (e) { e.stopPropagation(); openEditor(pvList[pvIdx]); });
    pv.querySelector(".pv-prev").addEventListener("click", function (e) { e.stopPropagation(); pvGo(-1); });
    pv.querySelector(".pv-next").addEventListener("click", function (e) { e.stopPropagation(); pvGo(1); });
    pv.addEventListener("click", function (e) { if (e.target === pv) pvClose(); });
    var x0 = null;
    pv.addEventListener("touchstart", function (e) { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    pv.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50 && pvList.length > 1) pvGo(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (!pv || pv.hidden || ed) return;   // поки відкритий редактор — клавіші належать йому
      if (e.key === "Escape") { e.stopPropagation(); pvClose(); }
      else if (e.key === "ArrowLeft" && pvList.length > 1) pvGo(-1);
      else if (e.key === "ArrowRight" && pvList.length > 1) pvGo(1);
    }, true);
  }
  function pvShow() {
    var it = pvList[pvIdx];
    pv.querySelector(".pv-img").src = it.url;
    pv.querySelector(".pv-count").textContent = pvList.length > 1 ? (pvIdx + 1) + " / " + pvList.length : "";
    pv.querySelector(".pv-main").textContent = it.primary ? "★ Головне фото" : "";
    pv.querySelector(".pv-open").href = it.url;
    pv.querySelector(".pv-prev").style.display = pv.querySelector(".pv-next").style.display = pvList.length > 1 ? "" : "none";
  }
  function pvGo(d) { pvIdx = (pvIdx + d + pvList.length) % pvList.length; pvShow(); }
  function pvClose() { pv.hidden = true; document.body.style.overflow = pvPrevOverflow; }
  function attachViewer(gallery) {
    gallery.querySelectorAll(".photo-thumb:not(.photo-thumb-pending)").forEach(function (t) {
      t.addEventListener("click", function (e) {
        if (e.target.closest("button")) return;
        // порядок беремо з DOM: після перетягування він міг змінитись
        var all = Array.prototype.slice.call(gallery.querySelectorAll(".photo-thumb:not(.photo-thumb-pending)"));
        pvList = all.map(function (el) { return { id: el.dataset.imageId, url: el.querySelector("img").getAttribute("src"), primary: el.classList.contains("primary") }; });
        pvIdx = Math.max(0, all.indexOf(t));
        if (!pv) pvBuild();
        pvShow();
        pv.hidden = false;
        pvPrevOverflow = document.body.style.overflow;   // вікно редагування вже блокує прокрутку — після закриття повертаємо як було
        document.body.style.overflow = "hidden";
      });
    });
  }

  // ── Редактор фото: поворот, відзеркалення, обрізка, замальовування, яскравість/контраст ──
  // Заповнення ділянки за сусідніми фрагментами фото (для «Ластика»)
// Заповнення виділеної ділянки за сусідніми фрагментами фото (exemplar-based, спрощений Criminisi).
  // inpaint(rgba: Uint8ClampedArray, w, h, mask: Uint8Array(1 = стерти)) → змінює rgba на місці, повертає кількість заповнених пікселів.
  function edInpaint(rgba, w, h, mask) {
    var r = 4, S = 2 * r + 1, n = w * h, R0 = 40;
    var m = new Uint8Array(mask), conf = new Float32Array(n), i, x, y;
    var left = 0;
    for (i = 0; i < n; i++) { if (m[i]) left++; else conf[i] = 1; }
    var total = left;
    // інтегральна маска → швидка перевірка «у фрагменті немає невідомих пікселів»
    var W1 = w + 1, ii = new Int32Array(W1 * (h + 1));
    function buildII() {
      for (y = 0; y < h; y++) { var row = 0; for (x = 0; x < w; x++) { row += m[y * w + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + row; } }
    }
    function maskSum(x0, y0, x1, y1) { return ii[(y1 + 1) * W1 + x1 + 1] - ii[y0 * W1 + x1 + 1] - ii[(y1 + 1) * W1 + x0] + ii[y0 * W1 + x0]; }
    buildII();
    // для ефективності перебудовуємо інтегральну маску не щоразу, а раз на кілька заповнень
    var sinceII = 0;
    var front = [];
    function isFront(p) {
      if (!m[p]) return false; var px = p % w, py = (p / w) | 0;
      return (px > 0 && !m[p - 1]) || (px < w - 1 && !m[p + 1]) || (py > 0 && !m[p - w]) || (py < h - 1 && !m[p + w]);
    }
    for (i = 0; i < n; i++) if (isFront(i)) front.push(i);
    var guard = 0;
    while (left > 0 && guard++ < total + 50) {
      // пріоритет: середня «достовірність» у фрагменті (заповнюємо від країв всередину)
      var best = -1, bp = -1;
      for (var f = 0; f < front.length; f++) {
        var p = front[f]; if (!m[p]) continue;
        var px = p % w, py = (p / w) | 0, s = 0, c = 0;
        for (var dy = -r; dy <= r; dy++) { var yy = py + dy; if (yy < 0 || yy >= h) continue; for (var dx = -r; dx <= r; dx++) { var xx = px + dx; if (xx < 0 || xx >= w) continue; s += conf[yy * w + xx]; c++; } }
        var pr = s / (S * S);
        if (pr > best) { best = pr; bp = p; }
      }
      if (bp < 0) break;
      var tx = bp % w, ty = (bp / w) | 0;
      if (sinceII >= 40) { buildII(); sinceII = 0; }
      // пошук найкращого фрагмента у вікні навколо; розширюємо вікно, якщо джерел немає
      var bestD = 1e18, bsx = -1, bsy = -1, R = R0;
      for (var tries = 0; tries < 4 && bsx < 0; tries++, R *= 2) {
        var x0 = Math.max(r, tx - R), x1 = Math.min(w - 1 - r, tx + R), y0 = Math.max(r, ty - R), y1 = Math.min(h - 1 - r, ty + R);
        for (var sy = y0; sy <= y1; sy++) for (var sx = x0; sx <= x1; sx++) {
          if (maskSum(sx - r, sy - r, sx + r, sy + r) - 0 > 0) continue;   // джерело — лише повністю відомі фрагменти (інтегральна маска трохи застаріла, але лише в бік «обережніше»)
          var d = 0, k = 0;
          for (dy = -r; dy <= r && d < bestD; dy++) {
            var ty2 = ty + dy; if (ty2 < 0 || ty2 >= h) continue;
            for (dx = -r; dx <= r; dx++) {
              var tx2 = tx + dx; if (tx2 < 0 || tx2 >= w) continue;
              var q = ty2 * w + tx2; if (m[q]) continue;
              var a = q * 4, b = ((sy + dy) * w + sx + dx) * 4;
              var e0 = rgba[a] - rgba[b], e1 = rgba[a + 1] - rgba[b + 1], e2 = rgba[a + 2] - rgba[b + 2];
              d += e0 * e0 + e1 * e1 + e2 * e2;
            }
          }
          if (d < bestD) { bestD = d; bsx = sx; bsy = sy; }
        }
      }
      if (bsx < 0) { // зовсім немає джерел — беремо середній колір відомих сусідів
        var qa = bp * 4; rgba[qa] = rgba[qa + 1] = rgba[qa + 2] = 128; m[bp] = 0; conf[bp] = 0.1; left--; continue;
      }
      var cval = best;
      for (dy = -r; dy <= r; dy++) {
        var yy2 = ty + dy; if (yy2 < 0 || yy2 >= h) continue;
        for (dx = -r; dx <= r; dx++) {
          var xx2 = tx + dx; if (xx2 < 0 || xx2 >= w) continue;
          var q2 = yy2 * w + xx2; if (!m[q2]) continue;
          var a2 = q2 * 4, b2 = ((bsy + dy) * w + bsx + dx) * 4;
          rgba[a2] = rgba[b2]; rgba[a2 + 1] = rgba[b2 + 1]; rgba[a2 + 2] = rgba[b2 + 2];
          m[q2] = 0; conf[q2] = cval; left--;
          // нові пікселі фронту
          if (xx2 > 0 && m[q2 - 1]) front.push(q2 - 1); if (xx2 < w - 1 && m[q2 + 1]) front.push(q2 + 1);
          if (yy2 > 0 && m[q2 - w]) front.push(q2 - w); if (yy2 < h - 1 && m[q2 + w]) front.push(q2 + w);
        }
      }
      sinceII++;
      if (front.length > 4 * n) front = front.filter(function (p) { return m[p]; });
      else if (guard % 50 === 0) front = front.filter(function (p) { return m[p]; });
    }
    return total - left;
  }

  var ed = null;
  function edBtn(txt, title, fn, extra) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = txt; b.title = title || "";
    b.style.cssText = "position:static;width:auto;height:auto;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:.9rem;line-height:1.2;background:#fff;color:#222;" + (extra || "");
    b.addEventListener("click", fn);
    return b;
  }
  function edClose() { if (ed) { ed.remove(); ed = null; } }
  function openEditor(it) {
    edClose();
    var src = new Image();
    src.onload = function () { edStart(src, it); };
    src.onerror = function () { alert("Не вдалося завантажити фото для редагування"); };
    src.src = it.url;
  }
  function edStart(img, it) {
    function cnv(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
    var CAP = 2000, k = Math.min(1, CAP / Math.max(img.naturalWidth, img.naturalHeight));
    var work = cnv(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
    work.getContext("2d").drawImage(img, 0, 0, work.width, work.height);
    var hist = [], mode = "crop", rect = null, bright = 100, contr = 100, s = 1, drag = null, brush = 24, thin = true, mk = cnv(1, 1), lastp = null;
    ed = document.createElement("div");
    ed.style.cssText = "position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:10px;box-sizing:border-box";
    ed.setAttribute("role", "dialog"); ed.setAttribute("aria-modal", "true"); ed.setAttribute("aria-label", "Редагування фото");
    var dc = document.createElement("canvas");
    dc.style.cssText = "touch-action:none;cursor:crosshair;background:#fff;border-radius:4px;max-width:96vw";
    var tools = document.createElement("div"); tools.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;justify-content:center";
    var sl = document.createElement("div"); sl.style.cssText = "display:flex;flex-wrap:wrap;gap:14px;justify-content:center;color:#fff;font-size:.82rem;align-items:center";
    var acts = document.createElement("div"); acts.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;justify-content:center";
    var msg = document.createElement("div"); msg.style.cssText = "color:#ddd;font-size:.8rem;min-height:1.1em;text-align:center";
    function say(t) { msg.textContent = t || ""; }
    function push() { var c = cnv(work.width, work.height); c.getContext("2d").drawImage(work, 0, 0); hist.push(c); if (hist.length > 12) hist.shift(); }
    function layout() {
      var maxW = Math.min(window.innerWidth * 0.94, 1100), maxH = window.innerHeight - 250;
      s = Math.min(1, maxW / work.width, maxH / work.height);
      dc.width = Math.max(1, Math.round(work.width * s)); dc.height = Math.max(1, Math.round(work.height * s));
      mk.width = dc.width; mk.height = dc.height;   // шар зафарбованого (скидається при зміні картинки)
      draw();
    }
    function draw() {
      var g = dc.getContext("2d"); g.clearRect(0, 0, dc.width, dc.height); g.drawImage(work, 0, 0, dc.width, dc.height);
      dc.style.filter = "brightness(" + bright + "%) contrast(" + contr + "%)";
      if (mode === "erase") { g.save(); g.globalAlpha = 0.5; g.drawImage(mk, 0, 0); g.restore(); }
      if (rect) {
        g.save(); g.fillStyle = "rgba(0,0,0,.45)";
        if (mode === "crop") {
          g.fillRect(0, 0, dc.width, rect.y); g.fillRect(0, rect.y + rect.h, dc.width, dc.height - rect.y - rect.h);
          g.fillRect(0, rect.y, rect.x, rect.h); g.fillRect(rect.x + rect.w, rect.y, dc.width - rect.x - rect.w, rect.h);
        }
        g.strokeStyle = mode === "crop" ? "#4caf50" : "#ff9800"; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
        g.restore();
      }
    }
    function setWork(c) { work = c; rect = null; layout(); }
    function rotate(dir) {
      push(); var c = cnv(work.height, work.width), g = c.getContext("2d");
      g.translate(c.width / 2, c.height / 2); g.rotate(dir * Math.PI / 2); g.drawImage(work, -work.width / 2, -work.height / 2); setWork(c);
    }
    function flip() { push(); var c = cnv(work.width, work.height), g = c.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(work, 0, 0); setWork(c); }
    function undo() { if (!hist.length) { say("Немає що скасовувати"); return; } setWork(hist.pop()); say(""); }
    var bs, cs;
    function reset() {
      push(); var c = cnv(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      bright = 100; contr = 100; bs.value = 100; cs.value = 100; setWork(c); say("Скинуто до оригіналу");
    }
    function applyRect() {
      if (mode === "erase") { applyErase(); return; }
      if (!rect || rect.w < 4 || rect.h < 4) { say("Спочатку виділіть ділянку мишею/пальцем"); return; }
      var rx = Math.max(0, Math.round(rect.x / s)), ry = Math.max(0, Math.round(rect.y / s));
      var rw = Math.min(Math.round(rect.w / s), work.width - rx), rh = Math.min(Math.round(rect.h / s), work.height - ry);
      push();
      if (mode === "crop") {
        var c = cnv(rw, rh); c.getContext("2d").drawImage(work, rx, ry, rw, rh, 0, 0, rw, rh); setWork(c);
      } else {
        // замальовування: колір = середній по смузі 6px навколо ділянки (для написів на однотонному тлі)
        var g = work.getContext("2d"), P = 6, x0 = Math.max(0, rx - P), y0 = Math.max(0, ry - P), x1 = Math.min(work.width, rx + rw + P), y1 = Math.min(work.height, ry + rh + P);
        var d = g.getImageData(x0, y0, x1 - x0, y1 - y0), w = d.width, sr = 0, sg = 0, sb = 0, n = 0;
        for (var y = 0; y < d.height; y++) for (var x = 0; x < w; x++) {
          var ax = x0 + x, ay = y0 + y; if (ax >= rx && ax < rx + rw && ay >= ry && ay < ry + rh) continue;
          var i = (y * w + x) * 4; sr += d.data[i]; sg += d.data[i + 1]; sb += d.data[i + 2]; n++;
        }
        if (n) { g.fillStyle = "rgb(" + Math.round(sr / n) + "," + Math.round(sg / n) + "," + Math.round(sb / n) + ")"; g.fillRect(rx, ry, rw, rh); }
        rect = null; layout();
      }
      say("");
    }
    function applyErase() {
      var W = work.width, H = work.height, n = W * H, i, x, y;
      var mc = cnv(W, H), mg = mc.getContext("2d"); mg.drawImage(mk, 0, 0, W, H);
      var md = mg.getImageData(0, 0, W, H).data, m = new Uint8Array(n), cnt = 0;
      for (i = 0; i < n; i++) if (md[i * 4 + 3] > 64) { m[i] = 1; cnt++; }
      if (!cnt) { say("Зафарбуйте напис пензлем, потім натисніть «Застосувати»"); return; }
      var id = work.getContext("2d").getImageData(0, 0, W, H), d = id.data;
      var fin = m;
      if (thin) {
        // лише тонкі штрихи (текст) всередині зафарбованого: піксель помітно відрізняється від середнього в околі 11x11
        var gr = new Float32Array(n);
        for (i = 0; i < n; i++) gr[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        var t = new Uint8Array(n), c2 = 0;
        for (y = 5; y < H - 5; y++) for (x = 5; x < W - 5; x++) {
          var p = y * W + x; if (!m[p]) continue;
          var sm = 0; for (var dy = -5; dy <= 5; dy++) for (var dx = -5; dx <= 5; dx++) sm += gr[p + dy * W + dx];
          var df = gr[p] - sm / 121; if (df > 2.2 || df < -2.2) { t[p] = 1; c2++; }
        }
        if (c2 > 20) {
          fin = new Uint8Array(n); cnt = 0;
          for (y = 2; y < H - 2; y++) for (x = 2; x < W - 2; x++) {
            var q = y * W + x; if (!m[q]) continue;
            var hit = 0; for (dy = -2; dy <= 2 && !hit; dy++) for (dx = -2; dx <= 2; dx++) if (t[q + dy * W + dx]) { hit = 1; break; }
            if (hit) { fin[q] = 1; cnt++; }
          }
        } else say("Тонких штрихів не знайдено — стираю все зафарбоване");
      }
      if (cnt > 70000) { say("Ділянка завелика (" + cnt + " px) — зафарбуйте менше за раз"); return; }
      say("⏳ Стираю…"); setBusy(true);
      setTimeout(function () {
        try {
          push(); edInpaint(d, W, H, fin);
          var c = cnv(W, H); c.getContext("2d").putImageData(id, 0, 0); setWork(c);
          say("Готово. Можна зафарбувати ще або скасувати крок");
        } catch (e) { hist.pop(); say("Помилка: " + (e && e.message || e)); }
        setBusy(false);
      }, 30);
    }
    function stroke(a, b) {
      var g = mk.getContext("2d"); g.strokeStyle = "#ff1744"; g.fillStyle = "#ff1744"; g.lineWidth = brush; g.lineCap = "round"; g.lineJoin = "round";
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); draw();
    }
    function pt(e) { var r = dc.getBoundingClientRect(); return { x: Math.max(0, Math.min(dc.width, (e.clientX - r.left) * dc.width / r.width)), y: Math.max(0, Math.min(dc.height, (e.clientY - r.top) * dc.height / r.height)) }; }
    dc.addEventListener("pointerdown", function (e) { if (mode === "erase") { lastp = pt(e); stroke(lastp, lastp); try { dc.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); return; } drag = pt(e); rect = { x: drag.x, y: drag.y, w: 0, h: 0 }; try { dc.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
    dc.addEventListener("pointermove", function (e) { if (mode === "erase") { if (lastp) { var np = pt(e); stroke(lastp, np); lastp = np; } return; } if (!drag) return; var p = pt(e); rect = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }; draw(); });
    dc.addEventListener("pointerup", function () { lastp = null; drag = null; if (rect && (rect.w < 4 || rect.h < 4)) { rect = null; draw(); } });
    var bCrop = edBtn("✂️ Обрізка", "Виділіть ділянку, що залишиться", function () { mode = "crop"; mark(); draw(); });
    var bErase = edBtn("🪄 Ластик", "Зафарбуйте напис пензлем — він зникне, а фон добудується з сусідніх ділянок", function () { mode = "erase"; rect = null; mark(); draw(); say("Зафарбуйте напис пензлем, потім натисніть «Застосувати»"); });
    var bFill = edBtn("🩹 Замалювати", "Виділіть напис на однотонному тлі — заливається кольором навколо", function () { mode = "fill"; mark(); draw(); });
    function mark() {
      bCrop.style.background = mode === "crop" ? "#4caf50" : "#fff"; bCrop.style.color = mode === "crop" ? "#fff" : "#222";
      bFill.style.background = mode === "fill" ? "#ff9800" : "#fff"; bFill.style.color = mode === "fill" ? "#fff" : "#222";
      bErase.style.background = mode === "erase" ? "#9c27b0" : "#fff"; bErase.style.color = mode === "erase" ? "#fff" : "#222";
      dc.style.cursor = mode === "erase" ? "cell" : "crosshair";
    }
    tools.appendChild(edBtn("⟲", "Повернути вліво", function () { rotate(-1); }));
    tools.appendChild(edBtn("⟳", "Повернути вправо", function () { rotate(1); }));
    tools.appendChild(edBtn("⇋", "Відзеркалити", flip));
    tools.appendChild(bCrop); tools.appendChild(bFill); tools.appendChild(bErase);
    var aiBusy = false;
    function aiClean() {
      if (aiBusy) return; aiBusy = true;
      say("⏳ Gemini прибирає напис (до хвилини)…"); setBusy(true);
      new Promise(function (res) { out(1536).toBlob(res, "image/jpeg", 0.9); }).then(function (blob) {
        if (!blob) throw new Error("браузер не зміг підготувати фото");
        return fetch("/admin/api/gemini-clean", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error || "помилка сервера");
        return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("не вдалося прочитати результат")); }; im.src = "data:" + j.mime + ";base64," + j.image; });
      }).then(function (im) {
        push(); var c = cnv(im.naturalWidth, im.naturalHeight); c.getContext("2d").drawImage(im, 0, 0);
        bright = 100; contr = 100; bs.value = 100; cs.value = 100; setWork(c);
        say("✨ Готово. ПЕРЕВІРТЕ текст на упаковці й логотип — ШІ міг щось спотворити. Не подобається — «Скасувати крок».");
        setBusy(false); aiBusy = false;
      }).catch(function (e) { say("Помилка: " + (e && e.message || e)); setBusy(false); aiBusy = false; });
    }
    tools.appendChild(edBtn("✨ Gemini", "ШІ (Nano Banana 2) прибирає водяний знак. Платно; завжди перевіряйте результат", aiClean, "background:#6a1b9a;color:#fff"));
    tools.appendChild(edBtn("✔ Застосувати", "Обрізати / замалювати виділене / стерти зафарбоване", applyRect, "background:#2d6a2d;color:#fff"));
    tools.appendChild(edBtn("↶ Скасувати крок", "", undo));
    tools.appendChild(edBtn("⟲⟲ До оригіналу", "", reset));
    function slider(label, val, cb) {
      var l = document.createElement("label"); l.style.cssText = "display:flex;gap:6px;align-items:center";
      l.appendChild(document.createTextNode(label));
      var r = document.createElement("input"); r.type = "range"; r.min = 50; r.max = 150; r.value = val; r.style.cssText = "width:140px;padding:0";
      r.addEventListener("input", function () { cb(+r.value); });
      l.appendChild(r); sl.appendChild(l); return r;
    }
    bs = slider("Яскравість", 100, function (v) { bright = v; draw(); });
    cs = slider("Контраст", 100, function (v) { contr = v; draw(); });
    (function () {
      var l = document.createElement("label"); l.style.cssText = "display:flex;gap:6px;align-items:center";
      l.appendChild(document.createTextNode("Пензель"));
      var r = document.createElement("input"); r.type = "range"; r.min = 6; r.max = 80; r.value = brush; r.style.cssText = "width:120px;padding:0";
      r.addEventListener("input", function () { brush = +r.value; }); l.appendChild(r); sl.appendChild(l);
      var l2 = document.createElement("label"); l2.style.cssText = "display:flex;gap:6px;align-items:center;cursor:pointer";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; cb.style.cssText = "width:auto;margin:0";
      cb.addEventListener("change", function () { thin = cb.checked; });
      l2.appendChild(cb); l2.appendChild(document.createTextNode("Лише тонкий напис")); l2.title = "Стирати тільки тонкі штрихи тексту всередині зафарбованого, а не все"; sl.appendChild(l2);
    })();
    function out(maxSide) {
      var f = Math.min(1, maxSide / Math.max(work.width, work.height)), c = cnv(Math.max(1, Math.round(work.width * f)), Math.max(1, Math.round(work.height * f))), g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);   // JPEG без прозорості
      g.drawImage(work, 0, 0, c.width, c.height);
      if (bright !== 100 || contr !== 100) {
        var d = g.getImageData(0, 0, c.width, c.height), b = bright / 100, ct = contr / 100, a = d.data;
        for (var i = 0; i < a.length; i += 4) for (var j = 0; j < 3; j++) { var v = a[i + j] * b; v = (v - 128) * ct + 128; a[i + j] = v < 0 ? 0 : v > 255 ? 255 : v; }
        g.putImageData(d, 0, 0);
      }
      return c;
    }
    function setBusy(on) { Array.prototype.forEach.call(acts.querySelectorAll("button"), function (b) { b.disabled = on; }); }
    function save(replace) {
      say("⏳ Збереження…"); setBusy(true);
      new Promise(function (res) { out(1200).toBlob(res, "image/jpeg", 0.85); }).then(function (blob) {
        if (!blob) throw new Error("браузер не зміг зберегти зображення");
        var url = replace
          ? "/admin/api/replace-image?imageId=" + encodeURIComponent(it.id)
          : "/admin/api/upload-image?productId=" + encodeURIComponent(currentProductId) + "&filename=edited.jpg";
        return fetch(url, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error || "помилка сервера");
        edClose(); if (pv) pvClose(); loadGallery(currentProductId);
      }).catch(function (e) { say("Помилка: " + (e && e.message || e)); setBusy(false); });
    }
    acts.appendChild(edBtn("💾 Замінити це фото", "Файл буде замінено, місце в списку збережеться", function () { save(true); }, "background:#2d6a2d;color:#fff"));
    acts.appendChild(edBtn("➕ Зберегти як нове", "Додати як окреме фото, оригінал лишається", function () { save(false); }, "background:#1565c0;color:#fff"));
    acts.appendChild(edBtn("Скасувати", "", edClose, "background:#777;color:#fff"));
    ed.appendChild(tools); ed.appendChild(dc); ed.appendChild(sl); ed.appendChild(acts); ed.appendChild(msg);
    document.body.appendChild(ed); mark(); layout();
    say("«Обрізка»/«Замалювати» — виділіть ділянку; «Ластик» — зафарбуйте напис пензлем");
  }
  document.addEventListener("keydown", function (e) { if (ed && e.key === "Escape") { e.stopImmediatePropagation(); edClose(); } }, true);   // не даємо Esc дійти до переглядача під редактором

  // ── Прев'ю фото перед завантаженням ──────────────────────────────
  function addPendingPreviews(files) {
    var gallery = document.getElementById("photoGallery");
    var emptyMsg = gallery.querySelector(".gallery-empty, .gallery-loading");
    if (emptyMsg) gallery.innerHTML = "";
    files.forEach(function (file) {
      var url = URL.createObjectURL(file);
      var div = document.createElement("div");
      div.className = "photo-thumb photo-thumb-pending";
      div.innerHTML = '<img src="' + url + '" alt=""><span class="pending-badge">⏳ завантаження…</span>';
      gallery.appendChild(div);
    });
  }

  function revokePendingPreviews() {
    document.querySelectorAll(".photo-thumb-pending img").forEach(function (img) { URL.revokeObjectURL(img.src); });
  }

  // Стиснення зображення на клієнті перед відправкою: зменшуємо до
  // максимум 1200px по довшій стороні і кодуємо в JPEG якістю 0.8 —
  // цього достатньо для картки товару і суттєво зменшує розмір файлу
  // (типове фото з телефону 3-8МБ стискається до 100-300КБ).
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var reader = new FileReader();
      reader.onload = function (e) { img.src = e.target.result; };
      reader.onerror = reject;
      img.onload = function () {
        var maxSide = 1200;
        var ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) { resolve(blob); }, "image/jpeg", 0.8);
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Паралельне завантаження з обмеженням одночасних запитів (3) —
  // швидше за послідовне по-одному, але не заливає Worker/D1 усіма
  // файлами разом при масовому додаванні (10-20+ фото одночасно).
  function uploadAllPhotos(files, statusEl) {
    var UPLOAD_CONCURRENCY = 3;
    var total = files.length;
    var nextIndex = 0;
    var doneCount = 0;

    function uploadOne(file) {
      return compressImage(file)
        .then(function (blob) {
          return fetch(
            "/admin/api/upload-image?productId=" + currentProductId + "&filename=" + encodeURIComponent(file.name),
            { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }
          );
        })
        .then(function (r) { return r.json(); })
        .catch(function () {
          statusEl.textContent = "Помилка на файлі " + file.name + ", продовжуємо…";
        });
    }

    function worker() {
      if (nextIndex >= total) return Promise.resolve();
      var file = files[nextIndex++];
      return uploadOne(file).then(function () {
        doneCount++;
        statusEl.textContent = "Завантаження " + doneCount + " з " + total + "…";
        return worker();
      });
    }

    var workers = [];
    var poolSize = Math.min(UPLOAD_CONCURRENCY, total);
    for (var i = 0; i < poolSize; i++) workers.push(worker());
    return Promise.all(workers);
  }

  document.getElementById("photoInput").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files);
    if (!files.length) return;
    var statusEl = document.getElementById("uploadStatus");

    addPendingPreviews(files);
    statusEl.textContent = "Завантаження 0 з " + files.length + "…";

    uploadAllPhotos(files, statusEl).then(function () {
      statusEl.textContent = "Готово ✓";
      e.target.value = "";
      revokePendingPreviews();
      loadGallery(currentProductId);
    });
  });

  document.getElementById("cancelEdit").addEventListener("click", closeEdit);
  document.getElementById("closeEditX").addEventListener("click", closeEdit);
  // Модалка на весь екран — клікнути "поза нею" фізично неможливо,
  // закриття лише через кнопки "Скасувати" / "✕".

  document.getElementById("saveEdit").addEventListener("click", function () {
    var statusEl = document.getElementById("modalStatus");
    if (!document.getElementById("editCategory").value) {
      statusEl.textContent = "Оберіть категорію товару";
      document.getElementById("editCategory").focus();
      return;
    }
    var payload = {
      id: document.getElementById("editId").value,
      name: document.getElementById("editName").value,
      price: parseFloat(document.getElementById("editPrice").value),
      brand: document.getElementById("editBrand").value,
      categoryId: parseInt(document.getElementById("editCategory").value, 10),
      inStock: document.getElementById("editInStock").checked,
      description: document.getElementById("editDescription").value,
      metaTitle: document.getElementById("editMetaTitle").value,
      metaDescription: document.getElementById("editMetaDescription").value,
      keywords: document.getElementById("editKeywords").value,
    };
    statusEl.textContent = "Збереження…";
    fetch("/admin/api/product-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          closeEdit();
          fetchData();
        } else {
          statusEl.textContent = data.error || "Помилка збереження";
        }
      })
      .catch(function () { statusEl.textContent = "Помилка з'єднання"; });
  });

  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      state.search = searchInput.value;
      state.page = 1;
      fetchData();
    }, 350);
  });

  categorySelect.addEventListener("change", function () {
    state.category = categorySelect.value;
    state.page = 1;
    fetchData();
  });

  brandSelect.addEventListener("change", function () {
    state.brand = brandSelect.value;
    state.page = 1;
    fetchData();
  });

  searchInput.value = state.search;
  categorySelect.value = state.category;
  brandSelect.value = state.brand;

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
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px 60px; }
  header { padding: 20px 0; margin-bottom: 10px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; flex-wrap: wrap; gap: 10px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 20px; font-size: 0.88rem; font-weight: 600; color: var(--ink-soft); flex-wrap: wrap; }
  nav a:hover { color: var(--ink); }
  h1 { font-family: 'Fraunces', serif; font-size: 1.6rem; margin: 20px 0 16px; display: flex; align-items: center; gap: 10px; }
  .count { font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; background: var(--card); border: 1px solid var(--line); padding: 3px 10px; border-radius: 100px; color: var(--ink-soft); }
  .controls { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .controls input, .controls select { padding: 9px 14px; border-radius: 100px; border: 1.5px solid var(--line); background: var(--card); font-size: 0.88rem; font-family: 'Manrope', sans-serif; }
  #searchInput { flex: 1; min-width: 220px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 14px; overflow: hidden; border: 1.5px solid var(--line); }
  th { text-align: left; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); padding: 12px 14px; border-bottom: 1.5px solid var(--line); }
  td { padding: 10px 14px; border-bottom: 1px solid var(--line); font-size: 0.86rem; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .loading { color: var(--ink-soft); padding: 30px 0; }
  .edit-btn { background: var(--ink); color: var(--card); border: none; padding: 6px 14px; border-radius: 100px; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
  .edit-btn:hover { background: var(--green-deep); }
  .stock-badge { display: inline-block; padding: 3px 10px; border-radius: 100px; font-size: 0.74rem; font-weight: 700; }
  .stock-yes { background: rgba(51,96,74,0.12); color: var(--green-deep); }
  .stock-no { background: rgba(200,70,46,0.12); color: var(--red-deep); }
  .pagination { display: flex; gap: 8px; justify-content: center; margin-top: 24px; flex-wrap: wrap; }
  .page-btn { padding: 7px 13px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--card); font-size: 0.84rem; font-weight: 600; cursor: pointer; color: var(--ink-soft); }
  .page-btn.active { background: var(--ink); color: var(--card); border-color: var(--ink); }
  .row-select, #selectAllCheckbox { width: 16px; height: 16px; accent-color: var(--green); cursor: pointer; }

  .bulk-bar { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1.5px solid var(--line); padding: 10px 14px; border-radius: 100px; margin-bottom: 14px; flex-wrap: wrap; }
  .bulk-count { font-size: 0.84rem; font-weight: 700; color: var(--ink); margin-right: 4px; }
  .bulk-btn { padding: 7px 14px; border-radius: 100px; border: none; font-size: 0.82rem; font-weight: 700; cursor: pointer; }
  .bulk-btn-out { background: rgba(200,70,46,0.12); color: var(--red-deep); }
  .bulk-btn-out:hover { background: var(--red); color: #fff; }
  .bulk-btn-in { background: rgba(51,96,74,0.12); color: var(--green-deep); }
  .bulk-btn-in:hover { background: var(--green); color: #fff; }

  /* Модалка редагування — на весь екран, без бекдропу (нема куди клікнути "поза нею") */
  .modal-overlay { position: fixed; inset: 0; background: var(--card); z-index: 100; }
  .modal-overlay[hidden] { display: none; }
  .modal { background: var(--card); padding: 24px 28px 28px; max-width: 720px; width: 100%; height: 100vh; margin: 0 auto; overflow-y: auto; box-sizing: border-box; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; position: sticky; top: -24px; background: var(--card); padding-top: 24px; margin-top: -24px; z-index: 1; }
  .modal-header h2 { font-family: 'Fraunces', serif; font-size: 1.3rem; }
  .modal-close-x { background: var(--paper); border: 1.5px solid var(--line); width: 34px; height: 34px; border-radius: 50%; font-size: 1rem; cursor: pointer; color: var(--ink-soft); flex-shrink: 0; }
  .modal-close-x:hover { color: var(--ink); border-color: var(--ink); }
  .form-row { margin-bottom: 14px; }
  .form-row label { display: block; font-size: 0.8rem; font-weight: 700; color: var(--ink-soft); margin-bottom: 5px; }
  .form-row input[type="text"], .form-row input[type="number"], .form-row textarea { width: 100%; padding: 9px 12px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-family: 'Manrope', sans-serif; font-size: 0.88rem; }
  .form-row textarea { min-height: 70px; resize: vertical; }
  .form-row-checkbox { padding: 4px 0; }
  .checkbox-label { display: flex; align-items: center; gap: 9px; cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--ink); }
  .checkbox-label input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--green); cursor: pointer; }
  .modal-footer { position: sticky; bottom: -28px; margin: 18px -28px -28px; padding: 14px 28px 28px; background: var(--card); border-top: 1.5px solid var(--line); }
  .modal-actions { display: flex; gap: 10px; max-width: 420px; margin: 0 auto; }
  .modal-actions button { flex: 1; padding: 11px; border-radius: 100px; border: none; font-weight: 700; cursor: pointer; font-size: 0.9rem; }
  #cancelEdit { background: var(--paper); color: var(--ink); border: 1.5px solid var(--line); }
  #saveEdit { background: var(--green); color: var(--card); }
  #saveEdit:hover { background: var(--green-deep); }
  .modal-status { margin-top: 10px; font-size: 0.82rem; color: var(--ink-soft); text-align: center; }
  .seo-divider { font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); font-weight: 700; margin: 18px 0 10px; padding-top: 14px; border-top: 1.5px dashed var(--line); }
  .missing-tag { display: inline-flex; align-items: center; gap: 8px; background: var(--card); border: 1.5px solid var(--red); color: var(--red-deep); padding: 6px 12px; border-radius: 100px; font-size: 0.82rem; font-weight: 600; margin-bottom: 16px; }
  .missing-tag button { background: none; border: none; color: var(--red-deep); cursor: pointer; font-size: 0.9rem; line-height: 1; }

  .photo-gallery { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; min-height: 40px; }
  .gallery-empty, .gallery-loading { font-size: 0.82rem; color: var(--ink-soft); }
  .gallery-hint { width: 100%; font-size: 0.76rem; color: var(--ink-soft); margin-bottom: 2px; }
  .pv { position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,.9); display: flex; align-items: center; justify-content: center; touch-action: pinch-zoom; }
  .pv[hidden] { display: none; }
  .pv-img { max-width: 94vw; max-height: 84vh; object-fit: contain; border-radius: 6px; background: #fff; }
  .pv button { position: absolute; border: 0; background: rgba(255,255,255,.18); color: #fff; font-size: 1.7rem; width: 46px; height: 46px; border-radius: 50%; cursor: pointer; line-height: 1; padding: 0; }
  .pv button:hover { background: rgba(255,255,255,.34); }
  .pv-close { top: 14px; right: 14px; }
  .pv-prev { left: 14px; top: 50%; transform: translateY(-50%); }
  .pv-next { right: 14px; top: 50%; transform: translateY(-50%); }
  .pv-bar { position: absolute; bottom: 14px; left: 0; right: 0; display: flex; gap: 16px; justify-content: center; align-items: center; color: #fff; font-size: .88rem; }
  .pv-open { color: #fff; text-decoration: underline; }
  .pv .pv-edit { position: static; width: auto; height: auto; border-radius: 8px; padding: 7px 14px; font-size: .88rem; background: #ff9800; color: #fff; }
  .pv .pv-edit:hover { background: #fb8c00; }
  .photo-thumb { position: relative; width: 84px; height: 84px; border-radius: 10px; overflow: hidden; border: 1.5px solid var(--line); background: var(--paper); cursor: grab; }
  .photo-thumb.primary { border-color: var(--green); border-width: 2px; }
  .photo-thumb.photo-thumb-pending { cursor: default; opacity: 0.65; }
  .photo-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
  .primary-badge { position: absolute; bottom: 0; left: 0; right: 0; background: var(--green); color: #fff; font-size: 0.62rem; font-weight: 700; text-align: center; padding: 2px 0; }
  .pending-badge { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(35,39,31,0.75); color: #fff; font-size: 0.6rem; font-weight: 700; text-align: center; padding: 3px 0; }
  .make-primary-btn { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(35,39,31,0.75); color: #fff; font-size: 0.6rem; font-weight: 700; border: none; padding: 3px 0; cursor: pointer; }
  .delete-photo-btn { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: none; background: var(--red); color: #fff; font-size: 0.68rem; cursor: pointer; line-height: 1; }
  #photoInput { font-size: 0.82rem; }
  .upload-status { font-size: 0.8rem; color: var(--green-deep); margin-top: 6px; font-weight: 600; }
  `;
}
