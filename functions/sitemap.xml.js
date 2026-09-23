// GET /sitemap.xml
// Генерується динамічно з D1 при кожному запиті (з edge-кешем на
// годину) — каталог на 2000+ товарів занадто великий і мінливий,
// щоб вести sitemap вручну. Включає головну, всі активні категорії
// та всі товари в наявності. Максимум 50 000 URL на один sitemap
// (ліміт Google) — поточний обсяг каталогу в нього вкладається
// на порядок; якщо каталог виросте до десятків тисяч позицій,
// сюди треба буде додати розбиття на sitemap-index.

const SITE_URL = "https://koshyk.pp.ua";

export async function onRequestGet(context) {
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
