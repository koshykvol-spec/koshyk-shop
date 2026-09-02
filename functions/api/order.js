// Pages Function: POST /api/order
// Приймає кошик з клієнта, ЗВІРЯЄ ціни/назви з D1 (клієнтські дані
// ніколи не довіряються напряму — інакше можна підмінити ціну в
// DevTools), створює запис у orders + order_items.
//
// Тіло запиту:
//   { customerName, customerPhone, deliveryMethod, customerNote,
//     items: [{ id, qty }, ...] }

export async function onRequestPost(context) {
  const { env, request } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Некоректний формат запиту" }, 400);
  }

  const { customerName, customerPhone, deliveryMethod, customerNote, items } = body;

  if (!customerName || !customerPhone) {
    return json({ ok: false, error: "Вкажіть ім'я та телефон" }, 400);
  }
  if (!Array.isArray(items) || items.length === 0) {
    return json({ ok: false, error: "Кошик порожній" }, 400);
  }

  try {
    // 1. Звірити кожен товар з D1 — беремо АКТУАЛЬНУ ціну й назву звідти,
    //    а не з того, що прислав клієнт.
    const resolvedItems = [];
    for (const item of items) {
      const qty = Math.max(1, Number(item.qty) || 1);
      const product = await env.koshyk_db
        .prepare("SELECT id, sku, name, price FROM products WHERE id = ?")
        .bind(item.id)
        .first();

      if (!product) {
        return json({ ok: false, error: `Товар з id=${item.id} більше не доступний` }, 400);
      }
      resolvedItems.push({ ...product, qty });
    }

    const totalAmount = resolvedItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    const orderNumber = generateOrderNumber();

    // 2. Створити замовлення
    const orderResult = await env.koshyk_db
      .prepare(
        `INSERT INTO orders (order_number, customer_name, customer_phone, customer_note,
                              delivery_method, status, total_amount)
         VALUES (?, ?, ?, ?, ?, 'new', ?)`
      )
      .bind(orderNumber, customerName, customerPhone, customerNote || null, deliveryMethod || "pickup", totalAmount)
      .run();

    const orderId = orderResult.meta.last_row_id;

    // 3. Створити позиції замовлення (знімок sku/назви/ціни на момент замовлення)
    for (const item of resolvedItems) {
      await env.koshyk_db
        .prepare(
          `INSERT INTO order_items (order_id, product_id, sku, name, price, quantity)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(orderId, item.id, item.sku, item.name, item.price, item.qty)
        .run();
    }

    // 4. Спроба сповістити Telegram, якщо бот налаштований у site_settings.
    //    Неуспіх сповіщення НЕ повинен провалювати саме замовлення —
    //    воно вже надійно збережене в D1.
    await notifyTelegram(env, orderNumber, customerName, customerPhone, resolvedItems, totalAmount);

    return json({ ok: true, orderNumber, total: totalAmount });
  } catch (err) {
    return json({ ok: false, error: "Помилка сервера: " + err.message }, 500);
  }
}

function generateOrderNumber() {
  const now = new Date();
  const stamp = now.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${stamp}-${rand}`;
}

async function notifyTelegram(env, orderNumber, name, phone, items, total) {
  try {
    const tokenRow = await env.koshyk_db
      .prepare("SELECT value FROM site_settings WHERE key = 'telegram_bot_token'")
      .first();
    const chatRow = await env.koshyk_db
      .prepare("SELECT value FROM site_settings WHERE key = 'telegram_chat_id'")
      .first();

    if (!tokenRow || !chatRow) return; // бот ще не налаштований — це нормально на цьому етапі

    const lines = items.map((i) => `• ${i.name} ×${i.qty} — ${(i.price * i.qty).toFixed(2)} ₴`);
    const text =
      `🛒 Нове замовлення №${orderNumber}\n` +
      `Ім'я: ${name}\nТелефон: ${phone}\n\n` +
      lines.join("\n") +
      `\n\nРазом: ${total.toFixed(2)} ₴`;

    await fetch(`https://api.telegram.org/bot${tokenRow.value}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatRow.value, text }),
    });

    await env.koshyk_db
      .prepare("UPDATE orders SET telegram_sent = 1 WHERE order_number = ?")
      .bind(orderNumber)
      .run();
  } catch {
    // мовчки ігноруємо — сповіщення не критичне для факту замовлення
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
