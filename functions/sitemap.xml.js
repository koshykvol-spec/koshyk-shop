// GET /sitemap.xml
// Генерується динамічно з D1 при кожному запиті (з edge-кешем на
// годину) — каталог на 2000+ товарів занадто великий і мінливий,
// щоб вести sitemap вручну. Включає головну, всі активні категорії
// та всі товари в наявності. Максимум 50 000 URL на один sitemap
// (ліміт Google) — поточний обсяг каталогу в нього вкладається
// на порядок; якщо каталог виросте до десятків тисяч позицій,
// сюди треба буде додати розбиття на sitemap-index.

const SITE_URL = "https://koshyk.pp.ua";

// Кеш через Cache API + захист від збоїв D1.
// Pages Function виконується ПЕРЕД CDN-кешем, тому самого Cache-Control недостатньо.
//  - успішна відповідь кешується і (якщо не noStale) ще раз як "запасна копія" на 7 днів;
//  - якщо D1 недоступна (виняток або 5xx) — віддаємо запасну копію (X-Cache: STALE,
//    без кешування), а якщо її немає — чесний 503 + Retry-After;
//  - помилки в кеш не потрапляють.
// opts: keyQuery (ключ кешу враховує query-параметри), ttl (s-maxage, якщо відповідь
// без Cache-Control), noStale (без запасної копії — для пошуку з довільними запитами),
// errorBody/errorType (тіло 503).
async function cached(context, render, opts = {}) {
  const { request } = context;
  if (request.method !== 'GET') return render(context);
  const url = new URL(request.url);
  const cache = caches.default;
  let query = '';
  if (opts.keyQuery) {
    const sp = new URLSearchParams(url.searchParams);
    sp.sort();
    const s = sp.toString();
    query = s ? '?' + s : '';
  }
  const key = new Request(url.origin + url.pathname + query);
  const staleKey = new Request(url.origin + '/__stale' + url.pathname + query);

  const hit = await cache.match(key);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('X-Cache', 'HIT');
    return r;
  }

  let res = null;
  try { res = await render(context); } catch (e) { res = null; }
  const failed = !res || res.status >= 500;

  if (!failed) {
    const store = res.status === 200;
    if (store) {
      if (opts.ttl && !res.headers.has('cache-control')) {
        res.headers.set('cache-control', 'public, max-age=0, s-maxage=' + opts.ttl);
      }
      context.waitUntil(cache.put(key, res.clone()));
      if (!opts.noStale) {
        const copy = res.clone();
        const h = new Headers(copy.headers);
        h.set('cache-control', 'public, max-age=604800'); // запасна копія живе 7 днів
        context.waitUntil(cache.put(staleKey, new Response(copy.body, { status: 200, headers: h })));
      }
    }
    res.headers.set('X-Cache', store ? 'MISS' : 'BYPASS');
    return res;
  }

  if (!opts.noStale) {
    const stale = await cache.match(staleKey);
    if (stale) {
      const r = new Response(stale.body, stale);
      r.headers.set('cache-control', 'no-store');
      r.headers.set('X-Cache', 'STALE');
      return r;
    }
  }
  return new Response(opts.errorBody || 'Сервіс тимчасово недоступний. Спробуйте за кілька хвилин.', {
    status: 503,
    headers: {
      'content-type': opts.errorType || 'text/plain; charset=utf-8',
      'retry-after': '300',
      'cache-control': 'no-store',
      'X-Cache': 'ERROR'
    }
  });
}

export async function onRequestGet(context) {
  return cached(context, renderSitemap);
}

async function renderSitemap(context) {
  const { env } = context;
  const db = env.koshyk_db;

  const [{ results: categories }, { results: products }] = await Promise.all([
    db.prepare(`SELECT slug FROM categories WHERE is_active = 1`).all(),
    db
      .prepare(
        `SELECT slug, updated_at FROM products WHERE slug IS NOT NULL AND in_stock = 1`
      )
      .all(),
  ]);

  const urls = [];
  urls.push({ loc: `${SITE_URL}/`, changefreq: "daily", priority: "1.0" });

  categories.forEach((c) => {
    urls.push({ loc: `${SITE_URL}/catalog/${c.slug}`, changefreq: "daily", priority: "0.8" });
  });

  products.forEach((p) => {
    urls.push({
      loc: `${SITE_URL}/product/${p.slug}`,
      changefreq: "weekly",
      priority: "0.6",
      lastmod: p.updated_at ? String(p.updated_at).slice(0, 10) : null,
    });
  });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${escapeXml(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
          `    <changefreq>${u.changefreq}</changefreq>\n` +
          `    <priority>${u.priority}</priority>\n` +
          `  </url>`
      )
      .join("\n") +
    `\n</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
