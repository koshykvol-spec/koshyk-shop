// GET /admin/orders — список замовлень з можливістю зміни статусу.
// Раніше жив на /admin; тепер /admin — дашборд-хаб, а це окрема сторінка.

const STATUS_LABELS = {
  new: "Нове",
  confirmed: "Підтверджено",
  shipped: "Відправлено",
  done: "Виконано",
  cancelled: "Скасовано",
};

export async function onRequestGet(context) {
  const { env } = context;

  const { results: orders } = await env.koshyk_db
    .prepare(
      `SELECT id, order_number, customer_name, customer_phone, delivery_method,
              status, total_amount, telegram_sent, created_at
       FROM orders ORDER BY created_at DESC LIMIT 100`
    )
    .all();

  return new Response(renderPage(orders), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderPage(orders) {
  const rows = orders
    .map((o) => {
      return `
    <tr data-order-id="${o.id}">
      <td class="mono">${escapeHtml(o.order_number)}</td>
      <td>${new Date(o.created_at).toLocaleString("uk-UA")}</td>
      <td>${escapeHtml(o.customer_name)}<br><span class="soft">${escapeHtml(o.customer_phone)}</span></td>
      <td>${o.delivery_method === "pickup" ? "Самовивіз" : "Нова Пошта"}</td>
      <td class="mono">${o.total_amount.toFixed(2)} ₴</td>
      <td>${o.telegram_sent ? "✅" : "—"}</td>
      <td>
        <select class="status-select" data-id="${o.id}">
          ${Object.entries(STATUS_LABELS)
            .map(([val, label]) => `<option value="${val}" ${val === o.status ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </td>
    </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Замовлення — Адмінка Ощадного Кошика</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${css()}</style>
</head>
<body>

<header>
  <div class="wrap header-row">
    <div class="logo">К · Адмінка Ощадного Кошика</div>
    <nav>
      <a href="/admin">Дашборд</a>
      <a href="/admin/orders" class="active">Замовлення</a>
      <a href="/admin/products">Товари</a>
      <a href="/admin/bulk">Масові дії</a>
      <a href="/admin/reviews">Відгуки</a>
      <a href="/admin/settings">Налаштування</a>
      <a href="/">← На сайт</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <h1>Замовлення <span class="count">${orders.length}</span></h1>

  ${
    orders.length === 0
      ? '<p class="empty">Замовлень поки немає.</p>'
      : `<table>
    <thead>
      <tr>
        <th>№</th><th>Дата</th><th>Клієнт</th><th>Доставка</th><th>Сума</th><th>TG</th><th>Статус</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
  }
</div>

<script>
document.querySelectorAll(".status-select").forEach(function (select) {
  select.addEventListener("change", function () {
    var id = select.dataset.id;
    var status = select.value;
    select.disabled = true;
    fetch("/admin/api/order-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, status: status }),
    })
      .then(function (r) { return r.json(); })
      .then(function () { select.disabled = false; })
      .catch(function () { select.disabled = false; alert("Не вдалося оновити статус"); });
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
  .header-row { display: flex; justify-content: space-between; align-items: center; max-width: 1180px; margin: 0 auto; padding: 0 28px; flex-wrap: wrap; gap: 10px; }
  .logo { font-family: 'Fraunces', serif; font-weight: 700; font-size: 1.2rem; }
  nav { display: flex; gap: 18px; font-size: 0.88rem; font-weight: 600; color: var(--ink-soft); flex-wrap: wrap; }
  nav a:hover, nav a.active { color: var(--ink); }
  h1 { font-family: 'Fraunces', serif; font-size: 1.6rem; margin: 20px 0 20px; display: flex; align-items: center; gap: 10px; }
  .count { font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; background: var(--card); border: 1px solid var(--line); padding: 3px 10px; border-radius: 100px; color: var(--ink-soft); }
  table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 14px; overflow: hidden; border: 1.5px solid var(--line); }
  th { text-align: left; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-soft); padding: 12px 14px; border-bottom: 1.5px solid var(--line); }
  td { padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 0.88rem; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .soft { color: var(--ink-soft); font-size: 0.8rem; }
  .status-select { padding: 6px 10px; border-radius: 8px; border: 1.5px solid var(--line); background: var(--paper); font-size: 0.84rem; font-family: 'Manrope', sans-serif; }
  .empty { color: var(--ink-soft); padding: 40px 0; }
  `;
}
