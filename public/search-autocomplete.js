// Автопідказки для пошуку в хедері. Підключається на всіх сторінках,
// де є <form class="header-search">...<input>...</form> — знаходить
// усі такі форми на сторінці й додає випадаючий список підказок під
// час набору тексту через /api/suggest. Без залежностей, progressive
// enhancement: якщо JS не спрацював або fetch впав — форма й так працює
// як звичайний GET-пошук на /search.

(function () {
  var DEBOUNCE_MS = 220;
  var MIN_LEN = 2;

  var styleTag = document.createElement("style");
  styleTag.textContent = [
    ".sa-wrap { position: relative; }",
    ".sa-dropdown {",
    "  position: absolute; top: calc(100% + 8px); left: 0; right: 0;",
    "  background: var(--card); border: 2px solid var(--line); border-radius: 14px;",
    "  box-shadow: 0 18px 40px -12px rgba(0,0,0,0.45); overflow: hidden; z-index: 60;",
    "  display: none; max-height: 420px; overflow-y: auto;",
    "  min-width: 320px;",
    "}",
    ".sa-dropdown.open { display: block; }",
    ".sa-item {",
    "  display: grid; grid-template-columns: 40px 1fr auto; align-items: center;",
    "  column-gap: 12px; padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--line);",
    "}",
    ".sa-item:last-child { border-bottom: none; }",
    ".sa-item:hover, .sa-item.active { background: var(--bg); }",
    ".sa-thumb {",
    "  width: 40px; height: 40px; border-radius: 10px;",
    "  background: var(--bg); display: flex; align-items: center; justify-content: center;",
    "  font-size: 1.2rem; overflow: hidden; border: 1px solid var(--line);",
    "}",
    ".sa-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }",
    ".sa-info { min-width: 0; }",
    ".sa-name {",
    "  font-size: 0.86rem; font-weight: 700; color: var(--ink); line-height: 1.28;",
    "  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;",
    "  overflow: hidden; word-break: break-word;",
    "}",
    ".sa-meta { font-size: 0.75rem; color: var(--ink-soft); font-weight: 600; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".sa-oos { display: inline-block; margin-top: 3px; font-size: 0.68rem; font-weight: 700; color: var(--coral, #FF3D71); background: rgba(255,61,113,0.14); padding: 1px 7px; border-radius: 100px; }",
    ".sa-price { font-weight: 800; color: var(--coral, #FF3D71); font-size: 0.86rem; white-space: nowrap; text-align: right; align-self: start; }",
    ".sa-more {",
    "  display: block; text-align: center; padding: 11px; font-size: 0.84rem;",
    "  font-weight: 700; color: var(--ink-soft); background: var(--bg); cursor: pointer;",
    "}",
    ".sa-more:hover { color: var(--ink); }",
    ".sa-empty { padding: 16px; text-align: center; color: var(--ink-soft); font-size: 0.84rem; font-weight: 600; }",
  ].join("\n");
  document.head.appendChild(styleTag);

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  function init(form) {
    var input = form.querySelector('input[type="text"]');
    if (!input) return;

    // Обгортаємо input у позиційний контейнер, щоб dropdown кріпився під ним.
    var wrap = document.createElement("div");
    wrap.className = "sa-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var dropdown = document.createElement("div");
    dropdown.className = "sa-dropdown";
    wrap.appendChild(dropdown);

    var timer = null;
    var activeIndex = -1;
    var items = [];
    var lastQuery = "";

    function close() {
      dropdown.classList.remove("open");
      dropdown.innerHTML = "";
      activeIndex = -1;
      items = [];
    }

    function goTo(slug) {
      window.location.href = "/product/" + encodeURIComponent(slug);
    }

    function render(data, q) {
      var products = data.products || [];
      if (!products.length) {
        dropdown.innerHTML = '<div class="sa-empty">Нічого не знайдено за «' + escapeHtml(q) + '»</div>';
        dropdown.classList.add("open");
        items = [];
        activeIndex = -1;
        return;
      }

      var html = products.map(function (p) {
        var thumb = (p.hasRealPhoto && p.imageUrl)
          ? '<img src="' + p.imageUrl + '" alt="" loading="lazy">'
          : "\ud83d\uded2";
        var priceHtml = p.price != null ? Number(p.price).toFixed(2) + " \u20b4" : "";
        var oosHtml = p.inStock === false ? '<div class="sa-oos">Немає в наявності</div>' : "";
        return (
          '<div class="sa-item" data-slug="' + escapeHtml(p.slug) + '">' +
            '<div class="sa-thumb">' + thumb + "</div>" +
            '<div class="sa-info">' +
              '<div class="sa-name">' + escapeHtml(p.name) + "</div>" +
              '<div class="sa-meta">' + escapeHtml(p.categoryName || "") + "</div>" +
              oosHtml +
            "</div>" +
            '<div class="sa-price">' + priceHtml + "</div>" +
          "</div>"
        );
      }).join("");

      if (data.total > products.length) {
        html += '<div class="sa-more" data-q="' + escapeHtml(q) + '">Показати всі ' + data.total + " результатів \u2192</div>";
      }

      dropdown.innerHTML = html;
      dropdown.classList.add("open");
      items = Array.prototype.slice.call(dropdown.querySelectorAll(".sa-item"));
      activeIndex = -1;

      items.forEach(function (el) {
        el.addEventListener("mousedown", function (e) {
          e.preventDefault();
          goTo(el.getAttribute("data-slug"));
        });
      });
      var more = dropdown.querySelector(".sa-more");
      if (more) {
        more.addEventListener("mousedown", function (e) {
          e.preventDefault();
          window.location.href = "/search?q=" + encodeURIComponent(more.getAttribute("data-q"));
        });
      }
    }

    function setActive(idx) {
      items.forEach(function (el) { el.classList.remove("active"); });
      activeIndex = idx;
      if (idx >= 0 && items[idx]) {
        items[idx].classList.add("active");
        if (typeof items[idx].scrollIntoView === "function") {
          items[idx].scrollIntoView({ block: "nearest" });
        }
      }
    }

    function fetchSuggestions(q) {
      fetch("/api/suggest?q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok || input.value.trim() !== q) return;
          render(data, q);
        })
        .catch(function () { close(); });
    }

    input.addEventListener("input", function () {
      var q = input.value.trim();
      lastQuery = q;
      clearTimeout(timer);
      if (q.length < MIN_LEN) { close(); return; }
      timer = setTimeout(function () { fetchSuggestions(q); }, DEBOUNCE_MS);
    });

    input.addEventListener("keydown", function (e) {
      if (!dropdown.classList.contains("open") || !items.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(activeIndex + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault();
        goTo(items[activeIndex].getAttribute("data-slug"));
      } else if (e.key === "Escape") {
        close();
      }
    });

    input.addEventListener("blur", function () {
      // Невелика затримка — щоб встиг спрацювати mousedown на пункті списку.
      setTimeout(close, 150);
    });
    input.addEventListener("focus", function () {
      var q = input.value.trim();
      if (q.length >= MIN_LEN && q === lastQuery && dropdown.innerHTML) {
        dropdown.classList.add("open");
      }
    });
  }

  document.querySelectorAll("form.header-search").forEach(init);
})();
