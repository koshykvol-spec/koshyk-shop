// Sitemap для сторінок товарів /product/<slug> (основна вага, ~2000+ URL).
// Ліміт одного файлу — 50 000 URL; для Кошика запасу вдосталь.
import { cached, escapeXml, urlset, xmlResponse } from './_sitemap-lib.js';

async function renderProducts(context) {
  const origin = new URL(context.request.url).origin;
  const db = context.env.koshyk_db;

  const r = await db.prepare(
    `SELECT slug, updated_at FROM products WHERE slug IS NOT NULL AND in_stock = 1`
  ).all();

  const entries = (r.results || []).map(p => {
    const lastmod = p.updated_at ? String(p.updated_at).slice(0, 10) : '';
    return `  <url><loc>${escapeXml(origin + '/product/' + p.slug)}</loc>`
      + (lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '')
      + `</url>`;
  });
  return xmlResponse(urlset(entries));
}

export async function onRequestGet(context) {
  return cached(context, renderProducts);
}

export const onRequestHead = onRequestGet;
