// Sitemap для головної та категорій (мала карта, ~8 URL).
import { cached, escapeXml, urlset, xmlResponse } from './_sitemap-lib.js';

async function renderMain(context) {
  const origin = new URL(context.request.url).origin;
  const db = context.env.koshyk_db;

  const r = await db.prepare(`SELECT slug FROM categories WHERE is_active = 1`).all();
  const cats = (r.results || []).map(x => x.slug).filter(Boolean);

  const entries = [`  <url><loc>${escapeXml(origin + '/')}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`]
    .concat(cats.map(s =>
      `  <url><loc>${escapeXml(origin + '/catalog/' + s)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`));
  return xmlResponse(urlset(entries));
}

export async function onRequestGet(context) {
  return cached(context, renderMain);
}
