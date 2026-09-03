// GET /admin/products — список товарів з пошуком/фільтром, рендер
// клієнтський через /admin/api/products (аналог логіки каталогу,
// але без публічних обмежень і з можливістю редагування).

export async function onRequestGet(context) {
  const { env } = context;
  const { results: categories } = await env.koshyk_db
    .prepare("SELECT slug, name_uk FROM categories ORDER BY sort_order")
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
  const brandOptions = brands.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Товари — Адмінка Ощадного Кошика</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
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
    var hint = images.length > 1 ? '<p class="gallery-hint">🖐 перетягуйте фото для зміни порядку</p>' : '';
    gallery.innerHTML = hint + images.map(function (img) {
      return '' +
        '<div class="photo-thumb' + (img.isPrimary ? ' primary' : '') + '" draggable="true" data-image-id="' + img.id + '">' +
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
  }

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

  document.getElementById("photoInput").addEventListener("change", function (e) {
    var files = Array.prototype.slice.call(e.target.files);
    if (!files.length) return;
    var statusEl = document.getElementById("uploadStatus");
    var done = 0;

    addPendingPreviews(files);
    statusEl.textContent = "Завантаження 0 з " + files.length + "…";

    var uploadNext = function () {
      if (done >= files.length) {
        statusEl.textContent = "Готово ✓";
        e.target.value = "";
        revokePendingPreviews();
        loadGallery(currentProductId);
        return;
      }
      var file = files[done];
      compressImage(file)
        .then(function (blob) {
          return fetch(
            "/admin/api/upload-image?productId=" + currentProductId + "&filename=" + encodeURIComponent(file.name),
            { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob }
          );
        })
        .then(function (r) { return r.json(); })
        .then(function () {
          done++;
          statusEl.textContent = "Завантаження " + done + " з " + files.length + "…";
          uploadNext();
        })
        .catch(function () {
          done++;
          statusEl.textContent = "Помилка на файлі " + file.name + ", продовжуємо…";
          uploadNext();
        });
    };
    uploadNext();
  });

  document.getElementById("cancelEdit").addEventListener("click", closeEdit);
  document.getElementById("closeEditX").addEventListener("click", closeEdit);
  // Модалка на весь екран — клікнути "поза нею" фізично неможливо,
  // закриття лише через кнопки "Скасувати" / "✕".

  document.getElementById("saveEdit").addEventListener("click", function () {
    var statusEl = document.getElementById("modalStatus");
    var payload = {
      id: document.getElementById("editId").value,
      name: document.getElementById("editName").value,
      price: parseFloat(document.getElementById("editPrice").value),
      brand: document.getElementById("editBrand").value,
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
