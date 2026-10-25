// HTML-карта каталогу Кошика: усі товари в наявності живими <a href="/product/…>.
// Сторінка категорії віддає зі статичного HTML лише першу сторінку (24 товари), решта
// підвантажується JS-кнопками, тому без цієї карти Googlebot бачить за посиланнями лише
// кілька сотень товарів із ~2 тис. Карта лишається в індексі (index,follow) і веде краулер
// на всі сторінки товарів. Кешується (Cache API) на 6 год, щоб не читати D1 на кожен візит.
import { cached } from './_sitemap-lib.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function renderKatalog(context) {
  const db = context.env.koshyk_db;
  const { results } = await db
    .prepare(
      `SELECT c.slug AS cat_slug, c.name_uk AS cat_name, p.slug, p.name
         FROM products p JOIN categories c ON c.id = p.category_id
        WHERE p.in_stock = 1 AND p.slug IS NOT NULL
        ORDER BY c.sort_order, c.id, p.name`
    )
    .all();
  const rows = results || [];

  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.cat_slug)) byCat.set(r.cat_slug, { name: r.cat_name, items: [] });
    byCat.get(r.cat_slug).items.push(r);
  }

  let body = '';
  for (const [slug, c] of byCat) {
    body += `<h2><a href="/catalog/${esc(encodeURIComponent(slug))}">${esc(c.name)}</a> <span class="n">(${c.items.length})</span></h2>\n<ul>`;
    body += c.items
      .map((i) => `<li><a href="/product/${esc(encodeURIComponent(i.slug))}">${esc(i.name)}</a></li>`)
      .join('');
    body += `</ul>\n`;
  }

  const html = `<!DOCTYPE html><html lang="uk" data-theme="dark"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index,follow">
<title>Повний каталог товарів — Ощадний Кошик</title>
<meta name="description" content="Повний перелік усіх товарів в наявності в Ощадному Кошику: канцтовари, господарчі товари, посуд, іграшки та інше.">
<link rel="canonical" href="https://koshyk.pp.ua/katalog">
<style>
  :root { --bg:#14151F; --card:#1E202E; --ink:#F5F6FA; --ink-soft:#9A9DB0; --teal:#00E5C7; }
  html[data-theme="light"] { --bg:#F4F5FA; --card:#FFFFFF; --ink:#14151F; --ink-soft:#6B6E85; --teal:#00806A; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; line-height:1.5; }
  .wrap { max-width:1000px; margin:0 auto; padding:0 16px; }
  header { padding:18px 0; border-bottom:1px solid var(--ink-soft); }
  header a { color:var(--ink); font-weight:800; text-decoration:none; font-size:1.2rem; }
  h1 { margin:24px 0 8px; font-size:1.6rem; }
  h2 { margin:28px 0 8px; font-size:1.15rem; }
  h2 a { color:var(--teal); text-decoration:none; }
  .n { color:var(--ink-soft); font-weight:400; font-size:.85rem; }
  p.lead { color:var(--ink-soft); }
  ul { columns:2 280px; column-gap:28px; padding-left:18px; margin:0; }
  li { margin:0 0 4px; break-inside:avoid; font-size:.92rem; }
  li a { color:var(--ink); text-decoration:none; }
  li a:hover { color:var(--teal); text-decoration:underline; }
  footer { margin:40px 0; color:var(--ink-soft); font-size:.9rem; }
  footer a { color:var(--teal); }
</style>
</head><body>
<header><div class="wrap"><a href="/">Ощадний Кошик</a></div></header>
<main class="wrap">
  <h1>Повний каталог товарів</h1>
  <p class="lead">Усі ${rows.length} товарів в наявності. Оберіть категорію або товар нижче.</p>
  ${body}
</main>
<footer><div class="wrap"><a href="/">← На головну</a></div></footer>
<script src="/theme.js"></script>
</body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=21600, s-maxage=21600',
    },
  });
}

export async function onRequestGet(context) {
  return cached(context, renderKatalog);
}
