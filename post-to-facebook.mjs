// Автопост одного товару на Facebook-сторінку «Ощадний Кошик».
// Запускається з GitHub Actions за розкладом (.github/workflows/fb-daily-post.yml).
//
// Без залежностей (Node 20+, вбудований fetch). Товари беруться з публічного API
// сайту (/api/categories, /api/catalog/:slug), тому доступ до D1 і додаткові секрети
// не потрібні — лише FB_PAGE_ID та FB_PAGE_TOKEN.
//
// Що публікуємо: товар В НАЯВНОСТІ з РЕАЛЬНИМ фото, якого ще немає в posted-log.json.
// Опис береться зі сторінки товару (JSON-LD Product.description) — змін на сайті не треба.
// Товари без опису пропускаємо (до MAX_TRIES спроб); якщо опису не знайшлось ніде —
// публікуємо без нього, щоб розклад не зупинявся.
// Категорії чергуються по колу, щоб стрічка не була з самих канцтоварів.
// Коли всі товари вже були — лог скидається, і коло починається заново.
//
// Перевірка без публікації:  DRY_RUN=1 node post-to-facebook.mjs

import fs from 'node:fs';

const SITE = 'https://koshyk.pp.ua';
const LOG_PATH = './posted-log.json';
const FB_API = 'https://graph.facebook.com/v26.0'; // та сама версія, що в скрипті Агронома
const DRY_RUN = process.env.DRY_RUN === '1';
const MAX_TRIES = 10;        // скільки товарів перевіряти на наявність опису за один запуск
const MAX_DESC_CHARS = 900;  // довший опис обрізаємо по реченню
const PAGE_ID = process.env.FB_PAGE_ID;
const PAGE_TOKEN = process.env.FB_PAGE_TOKEN;

if (!DRY_RUN && (!PAGE_ID || !PAGE_TOKEN)) {
  console.error('Не задано FB_PAGE_ID або FB_PAGE_TOKEN (GitHub → Settings → Secrets and variables → Actions).');
  process.exit(1);
}

function readLog() {
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf-8').replace(/^﻿/, '');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeLog(list) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(list, null, 2) + '\n');
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return res.json();
}

// Усі товари категорії в наявності з реальним фото (пагінація по 96).
async function loadCategory(slug) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const data = await getJson(`${SITE}/api/catalog/${slug}?perPage=96&inStockOnly=1&page=${page}`);
    for (const p of data.products || []) {
      if (p.inStock && p.hasRealPhoto && p.imageUrl && p.slug && p.price > 0) out.push(p);
    }
    if (page >= (data.totalPages || 1)) break;
  }
  return out;
}

function photoUrl(imageUrl) {
  if (/^https?:\/\//.test(imageUrl)) return imageUrl;
  const path = imageUrl.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  return `${SITE}/${path}`;
}

// Опис зі сторінки товару: <script type="application/ld+json"> → Product.description.
async function fetchDescription(slug) {
  try {
    const res = await fetch(`${SITE}/product/${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return '';
    const html = await res.text();
    const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
      let obj;
      try { obj = JSON.parse(m[1]); } catch { continue; }
      for (const o of Array.isArray(obj) ? obj : [obj]) {
        if (o && o['@type'] === 'Product' && typeof o.description === 'string' && o.description.trim()) {
          return o.description.trim();
        }
      }
    }
  } catch (e) {
    console.warn(`Не вдалося прочитати опис для ${slug}: ${e.message}`);
  }
  return '';
}

// Обрізка по межі речення (або слова), щоб підпис не обривався посеред слова.
function shorten(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[,;:\s]+$/, '') + '…';
}

function buildCaption(p, categoryName, description) {
  const lines = [`🛍 ${p.name}`];
  if (description) lines.push('', shorten(description, MAX_DESC_CHARS));
  else if (p.brand) lines.push(`Бренд: ${p.brand}`);
  lines.push('', `💰 Ціна: ${p.price} грн`, `📍 Категорія: ${categoryName}`, `🛒 Купити: ${SITE}/product/${p.slug}`);
  return lines.join('\n');
}

const catData = await getJson(`${SITE}/api/categories`);
const categories = (catData.categories || []).filter(c => c.slug);
if (!categories.length) {
  console.error('API категорій повернуло порожній список — публікацію скасовано.');
  process.exit(1);
}

let posted = readLog();
const postedSet = new Set(posted);

// Збираємо кандидатів по категоріях (лише ті, що ще не публікувались).
const byCategory = [];
for (const c of categories) {
  const items = await loadCategory(c.slug);
  const fresh = items.filter(p => !postedSet.has(p.sku));
  byCategory.push({ slug: c.slug, name: c.name || c.slug, fresh });
}

let total = byCategory.reduce((n, c) => n + c.fresh.length, 0);
if (total === 0) {
  console.log('Усі товари вже опубліковані — скидаю лог і починаю нове коло.');
  posted = [];
  postedSet.clear();
  for (const c of byCategory) {
    c.fresh = (await loadCategory(c.slug));
  }
  total = byCategory.reduce((n, c) => n + c.fresh.length, 0);
  if (total === 0) {
    console.error('Немає жодного товару в наявності з фото — нічого публікувати.');
    process.exit(1);
  }
}

// Черга категорій по колу (за кількістю вже опублікованих), пропускаючи порожні.
// Для кожної спроби беремо випадковий товар наступної категорії й перевіряємо опис.
const nonEmpty = byCategory.filter(c => c.fresh.length);
const start = posted.length % nonEmpty.length;
let cat = null, candidate = null, description = '';
let fallback = null;
for (let k = 0; k < MAX_TRIES; k++) {
  const c = nonEmpty[(start + k) % nonEmpty.length];
  if (!c.fresh.length) continue;
  const p = c.fresh.splice(Math.floor(Math.random() * c.fresh.length), 1)[0];
  if (!fallback) fallback = { cat: c, p };
  const d = await fetchDescription(p.slug);
  if (d) { cat = c; candidate = p; description = d; break; }
  console.log(`Без опису, пропускаю: ${p.name} (${p.sku})`);
}
if (!candidate) {
  console.warn(`Опису не знайдено в ${MAX_TRIES} спробах — публікую першого кандидата без опису.`);
  cat = fallback.cat; candidate = fallback.p;
}

const caption = buildCaption(candidate, cat.name, description);
const url = photoUrl(candidate.imageUrl);

console.log(`Кандидатів: ${total}; категорія: ${cat.name}; товар: ${candidate.name} (${candidate.sku}); опис: ${description ? description.length + ' симв.' : 'немає'}`);
console.log('Фото:', url);
console.log('Підпис:\n' + caption);

if (DRY_RUN) {
  console.log('\nDRY_RUN=1 — на Facebook не публікую, лог не змінюю.');
  process.exit(0);
}

const res = await fetch(`${FB_API}/${PAGE_ID}/photos`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url, caption, access_token: PAGE_TOKEN }),
  signal: AbortSignal.timeout(60_000),
});
const result = await res.json().catch(() => ({}));

if (result.id) {
  posted.push(candidate.sku);
  writeLog(posted);
  console.log('Опубліковано. ID поста:', result.post_id || result.id);
} else {
  // Токен/ID не друкуємо — лише відповідь Facebook.
  console.error('Помилка публікації:', JSON.stringify(result));
  // Якщо лог було скинуто, але пост не вийшов — зберігаємо скинутий лог, щоб не застрягти.
  if (posted.length === 0) writeLog(posted);
  process.exit(1);
}
