// Cloudflare Pages Function — /sitemap.xml як sitemap-INDEX.
// Логіка винесена в sitemap-main.xml (головна + категорії) і sitemap-products.xml (товари),
// щоб кожен файл був невеликим і Google легше його опрацьовував (як на AGRO3).
import { escapeXml, xmlResponse } from './_sitemap-lib.js';

export async function onRequestGet(context) {
  const origin = new URL(context.request.url).origin;
  const today = new Date().toISOString().slice(0, 10);
  const subs = [`${origin}/sitemap-main.xml`, `${origin}/sitemap-products.xml`];
  const body = subs
    .map(u => `  <sitemap><loc>${escapeXml(u)}</loc><lastmod>${today}</lastmod></sitemap>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
  return xmlResponse(xml);
}

export const onRequestHead = onRequestGet;
