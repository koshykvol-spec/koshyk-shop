// Редактор фото у вікні редагування товару (/admin/products) і POST /admin/api/replace-image.
//   node --test tests/admin/photo-editor.test.mjs
// Справжній SQLite (node:sqlite, Node >= 22.5) зі схемою koshyk-db-schema.sql + міграція product_images; R2 підроблений.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* старий Node */ }
const skip = DatabaseSync ? false : 'node:sqlite недоступний (потрібен Node >= 22.5)';

const repl = await import('../../functions/admin/api/replace-image.js');
const products = await import('../../functions/admin/products.js');

function d1(s) {
  const w = (sql, a = []) => ({
    bind: (...x) => w(sql, x),
    all: async () => ({ results: s.prepare(sql).all(...a).map(r => ({ ...r })) }),
    first: async () => { const r = s.prepare(sql).get(...a); return r ? { ...r } : null; },
    run: async () => { const r = s.prepare(sql).run(...a); return { success: true, meta: { last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return { prepare: sql => w(sql) };
}
const r2 = keys => { const m = new Map(keys.map(k => [k, 'old'])); return { m, put: async (k, v, o) => { m.set(k, { v, o }); }, delete: async k => { m.delete(k); } }; };

function setup(keys = ['products/1/a.jpg', 'products/1/b.jpg', 'products/1/c.jpg']) {
  const s = new DatabaseSync(':memory:');
  s.exec(readFileSync(new URL('../../koshyk-db-schema.sql', import.meta.url), 'utf8'));
  s.exec(readFileSync(new URL('../../migration_product_images.sql', import.meta.url), 'utf8'));
  s.prepare('INSERT INTO products(sku,name,price,category_id,in_stock) VALUES(?,?,?,?,1)').run('00-1', 'Зошит', 20, 1);
  keys.forEach((k, i) => s.prepare('INSERT INTO product_images(product_id,r2_key,is_primary,sort_order) VALUES(1,?,?,?)').run(k, i === 0 ? 1 : 0, i));
  s.prepare("UPDATE products SET image_url=? WHERE id=1").run('/img/' + keys[0]);
  const bucket = r2(keys);
  return { s, env: { koshyk_db: d1(s), koshyk_img: bucket }, bucket };
}
const rows = s => s.prepare('SELECT id,r2_key,is_primary,sort_order FROM product_images WHERE product_id=1 ORDER BY sort_order,id').all().map(r => ({ ...r }));
const call = (env, qs, { type = 'image/jpeg', body = new Uint8Array(500).fill(9) } = {}) =>
  repl.onRequestPost({ env, request: new Request('https://k.test/admin/api/replace-image' + qs, { method: 'POST', headers: type ? { 'Content-Type': type } : {}, body }) });

describe('POST /admin/api/replace-image', { skip }, () => {
  it('нове фото під НОВИМ ключем; id і порядок лишаються; старий файл видаляється; чужі не чіпаються', async () => {
    const { s, env, bucket } = setup(); const before = rows(s); const t = before[1];
    const res = await call(env, '?imageId=' + t.id); const j = await res.json();
    assert.equal(res.status, 200); assert.equal(j.ok, true); assert.equal(j.isPrimary, false);
    const after = rows(s);
    assert.deepEqual(after.map(r => r.id), before.map(r => r.id)); assert.deepEqual(after.map(r => r.sort_order), before.map(r => r.sort_order));
    assert.match(after[1].r2_key, /^products\/1\/[0-9a-f-]{36}\.jpg$/); assert.equal(j.url, '/img/' + after[1].r2_key);
    assert.ok(bucket.m.has(after[1].r2_key)); assert.equal(bucket.m.get(after[1].r2_key).o.httpMetadata.contentType, 'image/jpeg');
    assert.ok(!bucket.m.has(t.r2_key)); assert.ok(bucket.m.has(before[0].r2_key)); assert.ok(bucket.m.has(before[2].r2_key));
  });
  it('головне фото: products.image_url оновлюється, воно лишається головним', async () => {
    const { s, env } = setup(); const first = rows(s)[0];
    const j = await (await call(env, '?imageId=' + first.id, { type: 'image/webp' })).json();
    assert.equal(j.isPrimary, true);
    const a = rows(s)[0]; assert.equal(a.is_primary, 1); assert.match(a.r2_key, /\.webp$/);
    assert.equal(s.prepare('SELECT image_url, has_real_photo FROM products WHERE id=1').get().image_url, '/img/' + a.r2_key);
  });
  it('не головне фото НЕ чіпає products.image_url', async () => {
    const { s, env } = setup(); const t = rows(s)[2];
    await call(env, '?imageId=' + t.id);
    assert.equal(s.prepare('SELECT image_url FROM products WHERE id=1').get().image_url, '/img/products/1/a.jpg');
  });
  it('старий файл, на який ще посилається інший рядок, не видаляється', async () => {
    const { s, env, bucket } = setup(['products/1/a.jpg', 'products/1/a.jpg']);
    await call(env, '?imageId=' + rows(s)[1].id); assert.ok(bucket.m.has('products/1/a.jpg'));
  });
  it('відмови без змін: немає imageId, не зображення/gif, порожнє, >4 МБ, невідомий id', async () => {
    const { s, env, bucket } = setup(); const snap = JSON.stringify(rows(s)), n = bucket.m.size;
    assert.equal((await call(env, '')).status, 400);
    assert.equal((await call(env, '?imageId=1', { type: 'text/html' })).status, 400);
    assert.equal((await call(env, '?imageId=1', { type: 'image/gif' })).status, 400);
    assert.equal((await call(env, '?imageId=1', { type: '' })).status, 400);
    assert.equal((await call(env, '?imageId=1', { body: new Uint8Array(0) })).status, 400);
    assert.equal((await call(env, '?imageId=1', { body: new Uint8Array(4 * 1024 * 1024 + 1) })).status, 400);
    assert.equal((await call(env, '?imageId=9999')).status, 404);
    assert.equal(JSON.stringify(rows(s)), snap); assert.equal(bucket.m.size, n);
  });
});

describe('/admin/products: редактор фото (клієнт)', () => {
  const stubDb = { prepare: sql => ({ all: async () => ({ results: /categories/.test(sql) ? [{ id: 1, slug: 'k', name_uk: 'К' }] : [{ brand: 'Axent' }] }) }) };
  let html, script;
  beforeEach(async () => { html = await (await products.onRequestGet({ env: { koshyk_db: stubDb } })).text(); script = html.match(/<script>([\s\S]*?)<\/script>/)[1]; });
  it('скрипт валідний; у переглядачі є кнопка «Редагувати», елемент списку має id', () => {
    assert.doesNotThrow(() => new Function(script));
    assert.ok(script.includes('class="pv-edit"') && script.includes('✏️ Редагувати'));
    assert.ok(script.includes('id: el.dataset.imageId'));
    assert.match(html, /\.pv \.pv-edit \{/);
  });
  it('редактор: поворот/відзеркалення/обрізка/замальовування/яскравість; «замінити» і «як нове» ідуть на правильні API; Esc лише закриває редактор', () => {
    for (const k of ['function openEditor', 'rotate(-1)', 'rotate(1)', 'function flip', 'function applyRect', 'mode === "fill"', 'brightness(',
      '/admin/api/replace-image?imageId=', '/admin/api/upload-image?productId=', '"image/jpeg"', 'loadGallery(currentProductId)', 'setPointerCapture',
      '!pv || pv.hidden || ed', 'e.stopImmediatePropagation(); edClose()', 'function edInpaint', 'function applyErase', 'mode === "erase"', 'Лише тонкий напис', 'Пензель']) assert.ok(script.includes(k), k);
    assert.ok(!/https?:\/\//.test(script.slice(script.indexOf('function openEditor'), script.indexOf("Прев'ю фото перед завантаженням"))), 'без зовнішніх адрес');
  });
  it('наявні можливості лишились: перетягування, головне, видалення, завантаження, перегляд', () => {
    for (const k of ['attachDragReorder(gallery)', 'attachViewer(gallery)', '/admin/api/set-primary-image', '/admin/api/delete-image', 'uploadAllPhotos']) assert.ok(script.includes(k), k);
  });
});
