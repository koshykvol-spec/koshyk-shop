// Захищає всі маршрути під /admin/* (і /api/admin/*, якщо підключити
// той самий middleware туди) через HTTP Basic Auth.
//
// Пароль зберігається як secret, НЕ в D1 і НЕ в коді:
//   npx wrangler pages secret put ADMIN_PASSWORD --project-name=koshyk-shop
//
// Логін довільний (перевіряється тільки пароль), щоб не плодити
// окрему таблицю користувачів заради одного адміна на старті.

export async function onRequest(context) {
  const { request, env, next } = context;

  const auth = request.headers.get("Authorization");

  if (!env.ADMIN_PASSWORD) {
    return new Response(
      "Адмінка не налаштована: відсутній secret ADMIN_PASSWORD.\n" +
        "Виконайте: npx wrangler pages secret put ADMIN_PASSWORD --project-name=koshyk-shop",
      { status: 500 }
    );
  }

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const password = decoded.split(":").slice(1).join(":");
      if (password === env.ADMIN_PASSWORD) {
        return next();
      }
    }
  }

  return new Response("Потрібна авторизація", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Ощадний Кошик — адмінка"' },
  });
}
