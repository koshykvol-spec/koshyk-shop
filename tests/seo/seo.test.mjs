// Регресійні SEO-тести Ощадного Кошика (koshyk.pp.ua).
// Без залежностей: лише Node >= 20 (node:test + fetch). Тести ходять на живий сайт (або прев'ю-деплой),
// бо SEO ламається саме у відрендереному HTML, sitemap і заголовках, а не в окремих функціях.
//
//   node --test tests/seo/seo.test.mjs
//   BASE_URL=https://<hash>.koshyk-shop.pages.dev node --test tests/seo/seo.test.mjs   # прев'ю-деплой
//   UPDATE_BASELINE=1 node --test tests/seo/seo.test.mjs                               # зафіксувати новий еталон
//
// Змінні середовища:
//   BASE_URL          звідки тягнемо сторінки (за замовчуванням https://koshyk.pp.ua)
//   SEO_SAMPLE        скільки товарів із sitemap перевіряти (15; вибірка рівномірна й детермінована)
//   SEO_MIN_PRODUCTS  нижня межа кількості товарів у sitemap-products.xml (1000)
//   UPDATE_BASELINE   1 = перезаписати tests/seo/baseline.json поточним станом
//
// Запити йдуть послідовно й малою кількістю (~60 на прогін), щоб не навантажувати D1.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const SITE = 'https://koshyk.pp.ua'; // canonical у коді захардкоджений, тому порівнюємо саме з ним
const BASE = (process.env.BASE_URL || SITE).replace(/\/+$/, '');
const IS_PROD = BASE === SITE;
const SAMPLE = Math.max(1, Number(process.env.SEO_SAMPLE) || 15);
const MIN_PRODUCTS = Number(process.env.SEO_MIN_PRODUCTS) || 1000;
const UPDATE = process.env.UPDATE_BASELINE === '1';
const BASELINE_URL = new URL('./baseline.json', import.meta.url);
const BRAND = ' — Ощадний Кошик';
const TITLE_MAX = 150;
const UA = 'koshyk-seo-regression/1.0 (+https://koshyk.pp.ua)';

// ───────────────────────────── HTTP ─────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const _cache = new Map();

/** GET зі спільним кешем на прогін, одним повтором на 5xx/мережеву помилку; redirect не слідуємо. */
function get(path, { redirect = 'manual' } = {}) {
  const key = redirect + '|' + path;
  if (!_cache.has(key)) _cache.set(key, doFetch(path, redirect));
  return _cache.get(key);
}

async function doFetch(path, redirect) {
  const url = /^https?:/i.test(path) ? path : BASE + path;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        redirect,
        headers: { 'user-agent': UA, 'accept-language': 'uk' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status >= 500 && attempt === 0) { await res.arrayBuffer(); await sleep(1500); continue; }
      const type = res.headers.get('content-type') || '';
      let body = '';
      if (/text|xml|json|html/i.test(type)) body = await res.text();
      else await res.arrayBuffer();
      return { url, status: res.status, headers: res.headers, type, body };
    } catch (e) {
      lastErr = e;
      await sleep(1500);
    }
  }
  throw lastErr;
}

// ───────────────────────────── Розбір HTML (без залежностей) ─────────────────────────────

function decode(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const safeDecode = (s) => { try { return decodeURI(s); } catch { return s; } };
const hasType = (x, t) => [].concat((x && x['@type']) || []).includes(t);

function attrs(tag) {
  const o = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    o[m[1].toLowerCase()] = decode(m[2] !== undefined ? m[2] : m[3]);
  }
  return o;
}
const metaTags = (html) => [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
function meta(html, key) {
  const m = metaTags(html).find((a) => (a.name || a.property || '').toLowerCase() === key);
  return m ? (m.content === undefined ? '' : m.content) : null;
}
const canonicals = (html) => [...html.matchAll(/<link\b[^>]*>/gi)]
  .map((m) => attrs(m[0])).filter((a) => (a.rel || '').toLowerCase() === 'canonical').map((a) => a.href);
const title = (html) => { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? norm(decode(m[1])) : null; };

/** HTML без <script>/<style>: так h1 і посилання з клієнтських шаблонів JS не плутаються з розміткою. */
const visible = (html) => html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
const h1s = (html) => [...visible(html).matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
  .map((m) => norm(decode(m[1].replace(/<[^>]+>/g, ''))));
const hrefs = (html) => [...visible(html).matchAll(/<a\b[^>]*>/gi)].map((m) => attrs(m[0]).href).filter(Boolean);

function jsonLd(html) {
  const flat = (j) => (Array.isArray(j) ? j.flatMap(flat) : j && j['@graph'] ? flat(j['@graph']) : [j]);
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(...flat(JSON.parse(m[1]))); } catch (e) { out.push({ __parseError: e.message }); }
  }
  return out;
}
const ldTypes = (ld) => [...new Set(ld.flatMap((x) => [].concat((x && x['@type']) || [])))].sort();

const GARBAGE = /\b(undefined|null|NaN)\b|\[object |\{\{|\$\{/;
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => decode(m[1]));
const pathQuery = (u) => { const x = new URL(u, SITE); return safeDecode(x.pathname + x.search); };

function pick(arr, n) {
  if (arr.length <= n) return arr.slice();
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

// ───────────────────────────── Спільні перевірки <head> ─────────────────────────────

/**
 * Інваріанти, які мусить мати кожна індексована HTML-сторінка. Повертає розібрані поля для подальших перевірок.
 * canonicalPath — шлях (з query, якщо є), на який має вказувати canonical.
 */
function assertHead(r, canonicalPath, { rich = true } = {}) {
  // rich=false — службові сторінки без og/twitter/JSON-LD (напр. HTML-карта /katalog)
  const html = r.body;
  assert.equal(r.status, 200, `статус ${r.status}`);
  assert.match(r.type, /text\/html/i, `content-type: ${r.type}`);
  assert.ok(!/noindex|nofollow/i.test(r.headers.get('x-robots-tag') || ''), 'X-Robots-Tag забороняє індексацію');
  assert.match(html, /<html[^>]*\blang=["']uk["']/i, 'відсутній <html lang="uk">');

  const canon = canonicals(html);
  assert.equal(canon.length, 1, `canonical: очікується 1, знайдено ${canon.length}`);
  assert.equal(safeDecode(canon[0]), safeDecode(SITE + canonicalPath), 'canonical вказує не туди');

  const t = title(html);
  assert.ok(t, 'відсутній <title>');
  assert.ok(t.length >= 5 && t.length <= TITLE_MAX, `довжина title ${t.length}: «${t}»`);
  assert.ok(t.includes('Ощадний Кошик'), `title без бренду: «${t}»`);

  const desc = meta(html, 'description');
  assert.ok(desc !== null, 'відсутній meta description');
  assert.ok(norm(desc).length >= 30 && norm(desc).length <= 320, `довжина description ${norm(desc).length}`);

  const robots = meta(html, 'robots');
  assert.ok(robots === null || !/noindex|nofollow/i.test(robots), `meta robots: ${robots}`);
  assert.ok(meta(html, 'viewport'), 'відсутній meta viewport');

  if (rich) {
    assert.equal(meta(html, 'og:url') && safeDecode(meta(html, 'og:url')), safeDecode(SITE + canonicalPath), 'og:url ≠ canonical');
    assert.ok(meta(html, 'og:title'), 'відсутній og:title');
    assert.ok(meta(html, 'og:type'), 'відсутній og:type');
    assert.match(meta(html, 'og:image') || '', /^https:\/\//, 'og:image має бути абсолютним https-URL');
    assert.ok(meta(html, 'twitter:card'), 'відсутній twitter:card');
  }

  const h1 = h1s(html);
  assert.equal(h1.length, 1, `<h1>: очікується 1, знайдено ${h1.length}`);
  assert.ok(h1[0], '<h1> порожній');

  // Типові сліди зламаного шаблону
  for (const [k, v] of Object.entries({ title: t, description: desc, h1: h1[0], 'og:title': meta(html, 'og:title') || '' })) {
    assert.doesNotMatch(String(v), GARBAGE, `сміття в ${k}: «${v}»`);
  }

  // Змішаний вміст: ресурси лише через https
  assert.doesNotMatch(html, /\bsrc=["']http:\/\//i, 'є ресурс src="http://…"');
  assert.doesNotMatch(html, /<link\b[^>]*\bhref=["']http:\/\//i, 'є <link href="http://…">');

  const ld = jsonLd(html);
  assert.ok(!rich || ld.length > 0, 'немає JSON-LD');
  assert.ok(!ld.some((x) => x && x.__parseError), 'JSON-LD не парситься: ' + ld.map((x) => x.__parseError).filter(Boolean).join('; '));
  assert.doesNotMatch(JSON.stringify(ld), GARBAGE, 'сміття у JSON-LD');

  return { title: t, description: norm(desc), canonical: canon[0], h1: h1[0], ld, html };
}

// ───────────────────────────── Виявлення URL із живого sitemap ─────────────────────────────

const D = await discover();

async function discover() {
  const d = { err: null, cats: [], products: [], mainLocs: [], prodLocs: [] };
  try {
    const [main, prod] = await Promise.all([get('/sitemap-main.xml'), get('/sitemap-products.xml')]);
    d.mainLocs = locs(main.body);
    d.prodLocs = locs(prod.body);
    d.cats = d.mainLocs.map((u) => new URL(u).pathname).filter((p) => /^\/catalog\/[^/]+$/.test(p)).map((p) => p.split('/')[2]);
    d.products = d.prodLocs.map((u) => new URL(u).pathname).filter((p) => /^\/product\/[^/]+$/.test(p)).map((p) => p.split('/')[2]);
  } catch (e) {
    d.err = e;
  }
  return d;
}

// ───────────────────────────── Тести ─────────────────────────────

describe('виявлення URL', () => {
  it('sitemap доступні, URL знайдено', () => {
    if (D.err) throw D.err;
    assert.ok(D.cats.length > 0, 'у sitemap-main.xml немає категорій');
    assert.ok(D.products.length > 0, 'у sitemap-products.xml немає товарів');
  });
});

describe('robots.txt', () => {
  it('дозволяє сканування контенту, закриває службові розділи, вказує sitemap', async () => {
    const r = await get('/robots.txt');
    assert.equal(r.status, 200);
    assert.match(r.type, /text\/plain/i);
    // Розбір по групах User-agent: правила для окремих ботів (напр. AI-краулерів, які Cloudflare може
    // додавати автоматично) не повинні плутатися з правилами для * і Googlebot.
    const groups = []; const sitemaps = []; let cur = null; let prevUA = false;
    for (const raw of r.body.split(/\r?\n/)) {
      const m = raw.replace(/#.*/, '').trim().match(/^([\w-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const k = m[1].toLowerCase(); const v = m[2].trim();
      if (k === 'user-agent') {
        if (!cur || !prevUA) { cur = { agents: [], disallow: [] }; groups.push(cur); }
        cur.agents.push(v.toLowerCase()); prevUA = true; continue;
      }
      prevUA = false;
      if (k === 'disallow' && cur) cur.disallow.push(v);
      if (k === 'sitemap') sitemaps.push(v);
    }
    const mine = groups.filter((g) => g.agents.some((a) => a === '*' || a === 'googlebot'));
    assert.ok(groups.some((g) => g.agents.includes('*')), 'немає User-agent: *');
    for (const g of mine) {
      assert.ok(!g.disallow.includes('/'), `robots.txt закриває весь сайт для ${g.agents.join(', ')} (Disallow: /)`);
    }
    const disallowed = mine.flatMap((g) => g.disallow).filter(Boolean);
    // /search свідомо НЕ закритий у robots.txt: Google має зайти й побачити <meta robots noindex>
    for (const p of ['/admin']) {
      assert.ok(disallowed.includes(p), `${p} має бути закритий для * (Disallow: ${p})`);
    }
    for (const p of ['/product/x', '/catalog/x', '/katalog', '/img/x.webp', '/fonts/x.woff2', '/theme.js', '/cart.js', '/og-share.png']) {
      assert.ok(!disallowed.some((d) => p.startsWith(d)), `robots.txt блокує ${p} (правило ${disallowed.find((d) => p.startsWith(d))})`);
    }
    assert.ok(sitemaps.includes(`${SITE}/sitemap.xml`), 'немає рядка Sitemap: ' + SITE + '/sitemap.xml');
  });
});

describe('sitemap', () => {
  it('sitemap.xml — індекс із sitemap-main і sitemap-products', async () => {
    const r = await get('/sitemap.xml');
    assert.equal(r.status, 200);
    assert.match(r.type, /xml/i);
    assert.match(r.body, /<sitemapindex\b/);
    const paths = locs(r.body).map((u) => new URL(u).pathname).sort();
    assert.deepEqual(paths, ['/sitemap-main.xml', '/sitemap-products.xml']);
    for (const m of r.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) assert.match(m[1], /^\d{4}-\d{2}-\d{2}/, `lastmod ${m[1]}`);
  });

  it('sitemap-main: головна, /katalog і категорії; без дублів і query', async () => {
    const r = await get('/sitemap-main.xml');
    assert.equal(r.status, 200);
    assert.match(r.type, /xml/i);
    assert.match(r.body, /<urlset\b/);
    assert.ok(r.body.trim().endsWith('</urlset>'), 'XML обірваний');
    const u = locs(r.body);
    assert.ok(u.includes(BASE + '/'), 'немає головної');
    assert.ok(u.includes(BASE + '/katalog'), 'немає /katalog');
    assert.ok(D.cats.length > 0, 'немає категорій');
    assert.equal(new Set(u).size, u.length, 'дублі URL');
    for (const x of u) {
      assert.ok(x.startsWith(BASE + '/'), `URL з чужим origin: ${x}`);
      assert.ok(!x.includes('?') && !x.includes('#'), `URL з query/hash: ${x}`);
    }
  });

  it('sitemap-products: достатньо товарів, коректні URL і lastmod', async () => {
    const r = await get('/sitemap-products.xml');
    assert.equal(r.status, 200);
    assert.match(r.type, /xml/i);
    assert.ok(r.body.trim().endsWith('</urlset>'), 'XML обірваний');
    const u = locs(r.body);
    assert.ok(u.length >= MIN_PRODUCTS, `товарів у sitemap ${u.length} < ${MIN_PRODUCTS} (різке падіння = регресія фільтра in_stock/slug)`);
    assert.ok(u.length <= 50000, 'ліміт 50 000 URL на файл');
    assert.equal(new Set(u).size, u.length, 'дублі URL');
    const bad = u.filter((x) => !x.startsWith(BASE + '/product/') || /[?#]/.test(x) || x.slice((BASE + '/product/').length).includes('/'));
    assert.deepEqual(bad.slice(0, 5), [], 'некоректні URL товарів');
    const tomorrow = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
    for (const m of r.body.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      assert.match(m[1], /^\d{4}-\d{2}-\d{2}$/, `lastmod ${m[1]}`);
      assert.ok(m[1] <= tomorrow, `lastmod у майбутньому: ${m[1]}`);
    }
  });
});

describe('головна сторінка', () => {
  it('голова, JSON-LD (Store, WebSite+SearchAction, ItemList)', async () => {
    const h = assertHead(await get('/'), '/');
    const t = ldTypes(h.ld);
    for (const need of ['Store', 'WebSite', 'ItemList']) assert.ok(t.includes(need), `немає JSON-LD ${need} (є: ${t})`);
    const site = h.ld.find((x) => hasType(x, 'WebSite'));
    assert.ok(site.potentialAction && hasType(site.potentialAction, 'SearchAction'), 'WebSite без SearchAction');
    assert.ok(hrefs(h.html).some((x) => pathQuery(x).startsWith('/catalog/')), 'на головній немає посилань на категорії');
  });
});

describe('/katalog (HTML-карта)', () => {
  it('індексується й веде на (майже) всі товари із sitemap', async () => {
    const r = await get('/katalog');
    const h = assertHead(r, '/katalog', { rich: false });
    assert.match(meta(h.html, 'robots') || '', /index/i, 'katalog має бути index,follow');
    const links = new Set(hrefs(h.html).map(pathQuery).filter((p) => /^\/product\/[^/?]+$/.test(p)));
    assert.ok(D.products.length > 0);
    assert.ok(links.size >= D.products.length * 0.95,
      `у /katalog ${links.size} посилань на товари, у sitemap ${D.products.length}: краулер втрачає товари`);
    const cats = hrefs(h.html).map(pathQuery).filter((p) => /^\/catalog\/[^/?]+$/.test(p));
    assert.ok(cats.length > 0, 'немає посилань на категорії');
  });
});

for (const slug of D.cats) {
  describe(`категорія /catalog/${slug}`, () => {
    it('сторінка 1: голова, JSON-LD, посилання на товари', async () => {
      const h = assertHead(await get(`/catalog/${slug}`), `/catalog/${slug}`);
      assert.ok(h.title.endsWith(BRAND), `title: «${h.title}»`);
      const t = ldTypes(h.ld);
      assert.ok(t.includes('CollectionPage') && t.includes('BreadcrumbList'), `JSON-LD: ${t}`);
      const bc = h.ld.find((x) => hasType(x, 'BreadcrumbList'));
      assert.equal(bc.itemListElement.length, 2);
      assert.equal(bc.itemListElement[0].item, SITE + '/');
      assert.equal(safeDecode(bc.itemListElement[1].item), safeDecode(`${SITE}/catalog/${slug}`));
      const il = h.ld.find((x) => hasType(x, 'ItemList'));
      if (il) {
        const urls = il.itemListElement.map((x) => x.url);
        assert.equal(new Set(urls).size, urls.length, 'дублі в ItemList');
        const onPage = new Set(hrefs(h.html).map(pathQuery));
        for (const u of urls) {
          assert.ok(u.startsWith(SITE + '/product/'), `ItemList: ${u}`);
          assert.ok(onPage.has(pathQuery(u)), `товар з ItemList не має <a href> на сторінці: ${u}`);
        }
      }
    });

    it('пагінація: ?page=2 має власний canonical, title і опис', async (t) => {
      const r1 = await get(`/catalog/${slug}`);
      const next = hrefs(r1.body).map(pathQuery).filter((p) => p === `/catalog/${slug}?page=2`);
      if (!next.length) { t.skip('одна сторінка товарів'); return; }
      const h1 = assertHead(r1, `/catalog/${slug}`);
      const h2 = assertHead(await get(`/catalog/${slug}?page=2`), `/catalog/${slug}?page=2`);
      assert.match(h2.title, /сторінка 2/, `title p2: «${h2.title}»`);
      assert.notEqual(h2.description, h1.description, 'description однаковий на сторінках 1 і 2');
      assert.doesNotMatch(h2.html, /class=["'][^"']*\bcat-seo\b/, 'SEO-текст категорії дублюється на сторінці 2');
      const il1 = h1.ld.find((x) => hasType(x, 'ItemList'));
      const il2 = h2.ld.find((x) => hasType(x, 'ItemList'));
      assert.ok(il1 && il2, 'немає ItemList');
      assert.equal(il2.itemListElement[0].position, il1.itemListElement.length + 1, 'позиції ItemList на сторінці 2');
      const urls1 = new Set(il1.itemListElement.map((x) => x.url));
      assert.ok(!il2.itemListElement.some((x) => urls1.has(x.url)), 'товари сторінки 2 повторюють сторінку 1');
    });
  });
}

describe('канонікалізація і параметри', () => {
  const slug = D.cats[0];
  const prod = D.products[0];

  if (slug) {
    for (const q of ['?page=1', '?page=abc', '?page=0', '?utm_source=seo&gclid=1']) {
      it(`/catalog/${slug}${q} → canonical без параметрів`, async () => {
        assertHead(await get(`/catalog/${slug}${q}`), `/catalog/${slug}`);
      });
    }
    it('сторінка за межами діапазону → 404 (не soft-404)', async () => {
      assert.equal((await get(`/catalog/${slug}?page=4999`)).status, 404);
    });
    it('кінцевий слеш: або редірект на канонічний, або canonical правильний', async () => {
      const r = await get(`/catalog/${slug}/`);
      if (r.status >= 300 && r.status < 400) {
        assert.ok([301, 308].includes(r.status), `редірект ${r.status} має бути постійним`);
        assert.equal(new URL(r.headers.get('location'), BASE).pathname, `/catalog/${slug}`);
      } else assertHead(r, `/catalog/${slug}`);
    });
  }
  if (prod) {
    it(`/product/${prod}?utm_source=seo → canonical без параметрів`, async () => {
      assertHead(await get(`/product/${prod}?utm_source=seo&fbclid=1`), `/product/${prod}`);
    });
    it('кінцевий слеш: або редірект на канонічний, або canonical правильний', async () => {
      const r = await get(`/product/${prod}/`);
      if (r.status >= 300 && r.status < 400) {
        assert.ok([301, 308].includes(r.status), `редірект ${r.status} має бути постійним`);
        assert.equal(new URL(r.headers.get('location'), BASE).pathname, `/product/${prod}`);
      } else assertHead(r, `/product/${prod}`);
    });
  }
});

describe(`товари (вибірка ${SAMPLE} із sitemap)`, () => {
  for (const slug of pick(D.products, SAMPLE)) {
    it(`/product/${slug}`, async () => {
      const path = `/product/${slug}`;
      const h = assertHead(await get(path), path);
      assert.equal(meta(h.html, 'og:type'), 'product');
      assert.equal(h.title, `${h.h1}${BRAND}`, 'title має бути «<h1> — Ощадний Кошик»');

      const p = h.ld.find((x) => hasType(x, 'Product'));
      assert.ok(p, `немає Product JSON-LD (є: ${ldTypes(h.ld)})`);
      assert.equal(norm(p.name), h.h1, 'Product.name ≠ h1');
      assert.ok(p.sku, 'Product без sku');
      assert.equal(safeDecode(p.url), safeDecode(SITE + path), 'Product.url');
      assert.ok(p.brand && p.brand.name || (p.additionalProperty || []).some((x) => x.name === 'identifier_exists'),
        'Product без brand і без identifier_exists');
      if (p.image) for (const i of [].concat(p.image)) assert.match(i, /^https:\/\//, `image не абсолютний: ${i}`);

      const o = p.offers;
      assert.ok(o && hasType(o, 'Offer'), 'немає Offer');
      assert.equal(o.priceCurrency, 'UAH');
      assert.ok(Number(o.price) > 0, `ціна ${o.price}`);
      assert.equal(meta(h.html, 'product:price:amount'), String(o.price), 'product:price:amount ≠ Offer.price');
      assert.equal(meta(h.html, 'product:price:currency'), 'UAH');
      assert.match(o.availability, /^https:\/\/schema\.org\/(InStock|OutOfStock)$/);
      assert.equal(safeDecode(o.url), safeDecode(SITE + path), 'Offer.url');
      assert.ok(o.hasMerchantReturnPolicy && hasType(o.hasMerchantReturnPolicy, 'MerchantReturnPolicy'), 'немає політики повернення');
      assert.ok(o.shippingDetails && hasType(o.shippingDetails, 'OfferShippingDetails'), 'немає shippingDetails');
      if (p.aggregateRating) {
        assert.ok(p.aggregateRating.reviewCount > 0 && p.aggregateRating.ratingValue >= 1 && p.aggregateRating.ratingValue <= 5, 'aggregateRating');
      }
    });
  }

  it('головні зображення товарів віддаються як image/* (до 5 з вибірки)', async () => {
    let checked = 0;
    for (const slug of pick(D.products, SAMPLE)) {
      const og = meta((await get(`/product/${slug}`)).body, 'og:image') || '';
      if (!og.startsWith(SITE + '/img/')) continue; // заглушка og-share.png перевіряється окремо
      const r = await get(og.replace(SITE, ''));
      assert.equal(r.status, 200, `${og} → ${r.status}`);
      assert.match(r.type, /^image\//i, `${og}: content-type ${r.type}`);
      if (++checked >= 5) break;
    }
  });
});

describe('статика та службові файли', () => {
  it('og-share.png (запасне превʼю) віддається як image/png', async () => {
    const r = await get('/og-share.png');
    assert.equal(r.status, 200);
    assert.match(r.type, /image\/png/i);
  });
  it('site.webmanifest — валідний JSON', async () => {
    const r = await get('/site.webmanifest');
    assert.equal(r.status, 200);
    assert.doesNotThrow(() => JSON.parse(r.body));
  });
  it('файл верифікації Google Search Console на місці', async () => {
    // Cloudflare Pages віддає 308 з /x.html на /x — це норма, тому йдемо за редіректом
    const r = await get('/google361eeacbfd439fad.html', { redirect: 'follow' });
    assert.equal(r.status, 200);
    assert.ok(r.body.includes('google361eeacbfd439fad.html'), 'вміст файлу верифікації змінився');
  });
});

describe('статуси та редіректи', () => {
  const rnd = 'seo-test-' + Date.now().toString(36);
  for (const p of [`/product/${rnd}`, `/catalog/${rnd}`, `/${rnd}`]) {
    it(`неіснуючий ${p.replace(rnd, '<випадковий>')} → 404 (а не soft-404 із 200)`, async () => {
      assert.equal((await get(p)).status, 404);
    });
  }
  it('/index.html → 301 на /', async () => {
    const r = await get('/index.html');
    assert.equal(r.status, 301);
    assert.equal(new URL(r.headers.get('location'), BASE).pathname, '/');
  });
  it('/admin без пароля закритий (401), а не 200', async () => {
    const r = await get('/admin');
    assert.equal(r.status, 401);
    assert.ok(r.headers.get('www-authenticate'));
  });
  it('http:// → https:// (301/308)', { skip: IS_PROD ? false : 'лише для продакшн-домену' }, async () => {
    const r = await get(SITE.replace('https:', 'http:') + '/');
    assert.ok([301, 308].includes(r.status), `статус ${r.status}`);
    assert.match(r.headers.get('location') || '', /^https:\/\/koshyk\.pp\.ua\//);
  });
});

describe('унікальність метаданих', () => {
  it('title і description категорій та головної не повторюються', async () => {
    const pages = ['/', ...D.cats.map((s) => `/catalog/${s}`)];
    const titles = new Map(); const descs = new Map();
    for (const p of pages) {
      const r = await get(p);
      const t = title(r.body); const d = norm(meta(r.body, 'description') || '');
      titles.set(t, [...(titles.get(t) || []), p]);
      descs.set(d, [...(descs.get(d) || []), p]);
    }
    const dup = (m) => [...m].filter(([, v]) => v.length > 1).map(([k, v]) => `«${k.slice(0, 60)}» → ${v.join(', ')}`);
    assert.deepEqual(dup(titles), [], 'однакові title');
    assert.deepEqual(dup(descs), [], 'однакові description');
  });
});

describe('сторінка пошуку', () => {
  it('/search має <meta robots noindex> і не закрита в robots.txt', async () => {
    const r = await get('/search?q=test');
    assert.equal(r.status, 200);
    assert.match(meta(r.body, 'robots') || '', /noindex/i, 'без noindex URL пошуку потрапляє в індекс');
    const robots = (await get('/robots.txt')).body;
    assert.doesNotMatch(robots, /^\s*Disallow:\s*\/search\b/im,
      'Disallow: /search у robots.txt заважає Google побачити noindex');
  });
});

// ───────────────────────────── Еталон (baseline) ─────────────────────────────

async function snapshot() {
  const fp = (r, withText) => {
    const html = r.body;
    const o = {
      status: r.status,
      canonical: canonicals(html)[0] || null,
      robots: meta(html, 'robots'),
      lang: (html.match(/<html[^>]*\blang=["']([^"']+)["']/i) || [])[1] || null,
      h1Count: h1s(html).length,
      ldTypes: ldTypes(jsonLd(html)),
      ogType: meta(html, 'og:type'),
      hasOgImage: !!meta(html, 'og:image'),
      twitterCard: meta(html, 'twitter:card'),
    };
    if (withText) { o.title = title(html); }
    return o;
  };
  const pages = {};
  pages['/'] = { ...fp(await get('/'), true), description: norm(meta((await get('/')).body, 'description') || '') };
  pages['/katalog'] = { ...fp(await get('/katalog'), true), description: norm(meta((await get('/katalog')).body, 'description') || '') };
  for (const s of D.cats) pages[`/catalog/${s}`] = fp(await get(`/catalog/${s}`), true);
  return {
    note: 'Еталон SEO-структури. Оновлюється: UPDATE_BASELINE=1 node --test tests/seo/seo.test.mjs',
    categories: [...D.cats].sort(),
    counts: { products: D.products.length },
    pages,
  };
}

describe('еталон (baseline.json)', () => {
  it('структура ключових сторінок і розмір каталогу не змінились', async (t) => {
    if (D.err) throw D.err;
    const current = await snapshot();
    if (UPDATE) {
      await writeFile(BASELINE_URL, JSON.stringify(current, null, 2) + '\n');
      t.diagnostic('baseline.json оновлено');
      return;
    }
    let base;
    try { base = JSON.parse(await readFile(BASELINE_URL, 'utf8')); }
    catch { t.skip('baseline.json немає — створіть: UPDATE_BASELINE=1 node --test tests/seo/seo.test.mjs'); return; }

    assert.deepEqual(current.categories, base.categories, 'набір категорій у sitemap змінився (якщо це навмисно — оновіть baseline)');
    assert.ok(current.counts.products >= base.counts.products * 0.85,
      `товарів у sitemap ${current.counts.products}, було ${base.counts.products}: падіння більше ніж на 15%`);
    assert.deepEqual(current.pages, base.pages, 'SEO-відбиток ключових сторінок змінився (якщо це навмисно — оновіть baseline)');
  });
});
