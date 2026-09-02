// GET /admin/attributes — товари ОДЯГ/ВЗУТТЯ з needs_review=true
// (ті самі 9 позицій, які виявив parse_clothing_attributes.py і не зміг
// впевнено визначити стать/вікову групу). Дозволяє виставити вручну.

const GENDER_OPTIONS = ["хлопчик", "дівчинка", "жіноче", "чоловіче", "унісекс"];
const AGE_GROUP_OPTIONS = ["ясла", "дитячий"];

export async function onRequestGet(context) {
  const { env } = context;

  const { results: items } = await env.koshyk_db
    .prepare(
      `SELECT p.id, p.sku, p.name, pc.attributes_json
       FROM products p
       JOIN product_content pc ON pc.product_id = p.id
       WHERE json_extract(pc.attributes_json, '$.needs_review') = 1
       ORDER BY p.name`
    )
    .all();

  return new Response(renderPage(items), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(items) {
  const rows = items
    .map((item) => {
      const attrs = JSON.parse(item.attributes_json);
      return `
    <tr data-product-id="${item.id}">
      <td class="mono">${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}<br><span class="soft">тип: ${escapeHtml(attrs.type || "—")}</span></td>
      <td>
        <select class="gender-select">
          <option value="">— стать —</option>
          ${GENDER_OPTIONS.map((g) => `<option value="${g}">${g}</option>`).join("")}
        </select>
      </td>
      <td>
        <select class="age-select">
          <option value="">— вік —</option>
          ${AGE_GROUP_OPTIONS.map((a) => `<option value="${a}">${a}</option>`).join("")}
        </select>
      </td>
      <td><button type="button" class="save-btn">Зберегти</button></td>
    </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Черга доправки — Адмінка Ощадного Кошика</title>
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
  <h1>Черга доправки атрибутів <span class="count">${items.length}</span></h1>
  <p class="lede">Товари одягу/взуття, де автоматичний парсер не зміг впевнено визначити стать чи вікову групу. Виставте вручну і збережіть — товар одразу зникне зі списку.</p>

  ${
    items.length === 0
      ? '<p class="empty">Черга порожня — усі товари розпізнані.</p>'
      : `<table>
    <thead><tr><th>SKU</th><th>Назва</th><th>Стать</th><th>Вік</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
  }
</div>

<script>
document.querySelectorAll(".save-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    var row = btn.closest("tr");
    var id = row.dataset.productId;
    var gender = row.querySelector(".gender-select").value;
    var ageGroup = row.querySelector(".age-select").value;

    if (!gender && !ageGroup) {
      alert("Оберіть стать або вікову групу перед збереженням.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Збереження…";

    fetch("/admin/api/update-attributes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, gender: gender || null, ageGroup: ageGroup || null }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          row.style.opacity = "0.4";
          btn.textContent = "Збережено ✓";
        } else {
          btn.disabled = false;
          btn.textContent = "Зберегти";
          alert(data.error || "Помилка збереження");
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Зберегти";
        alert("Помилка з'єднання");
      });
  });
});
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
  :root { --paper: #EBE7DB; --card: #FFFDF7; --ink: #23271F; --ink-soft: #565A4E; --red: #C8462E; --green: #33604A; --green-deep: #244A39; --line: rgba(35,39,31,0.14); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--paper); color: var(--ink); font-family: 'Manrope', system-ui, sans-serif; }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px 60px; }
  header { padding: 20px 0; margin-bottom: 10px; }
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 22px; font-size: 0.9rem; font-weight: 600; color: var(--ink-soft); }
  nav a:hover { color: var(--ink); }
  h1 { font-family: 'Fraunces', serif; font-size: 1.6rem; margin: 20px 0 10px; display: flex; align-items: center; gap: 10px; }
  .count { font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; background: var(--card); border: 1px solid var(--line); padding: 3px 10px; border-radius: 100px; color: var(--ink-soft); }
  .lede { color: var(--ink-soft); font-size: 0.9rem; max-width: 60ch; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 14px; overflow: hidden; border: 1.5px solid var(--line); }
  th { text-align: left; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); padding: 12px 14px; border-bottom: 1.5px solid var(--line); }
  td { padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 0.88rem; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .soft { color: var(--ink-soft); font-size: 0.8rem; }
  select { padding: 6px 10px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-size: 0.84rem; font-family: 'Manrope', sans-serif; }
  .save-btn { background: var(--green); color: var(--card); border: none; padding: 7px 14px; border-radius: 100px; font-weight: 700; font-size: 0.82rem; cursor: pointer; }
  .save-btn:hover { background: var(--green-deep); }
  .save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .empty { color: var(--ink-soft); padding: 40px 0; }
  `;
}
