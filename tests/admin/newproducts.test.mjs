// Тести /admin/newproducts на справжньому SQLite (node:sqlite, Node >= 22.5) із реальною схемою koshyk-db.
//   node --test tests/admin/newproducts.test.mjs
// Без мережі й без D1: невеличка обгортка імітує D1-API (prepare/bind/all/first/run/batch).

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* старий Node: тести пропускаються */ }
const skip = DatabaseSync ? false : 'node:sqlite недоступний (потрібен Node >= 22.5)';

const mod = await import('../../functions/admin/newproducts.js');
const adminIndex = await import('../../functions/admin/index.js');
const middleware = await import('../../functions/admin/_middleware.js');

function makeD1(sqlite) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    all: async () => ({ results: sqlite.prepare(sql).all(...args).map(r => ({ ...r })) }),
    first: async () => { const r = sqlite.prepare(sql).get(...args); return r ? { ...r } : null; },
    run: async () => { sqlite.prepare(sql).run(...args); return { success: true }; },
    _exec: () => sqlite.prepare(sql).run(...args),
  });
  return {
    prepare: sql => wrap(sql),
    batch: async stmts => { sqlite.exec('BEGIN'); try { for (const s of stmts) s._exec(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } return []; },
  };
}

// Схема береться з koshyk-db-schema.sql (+ міграція keywords), щоб тест ловив розсинхрон колонок.
function freshDb() {
  const s = new DatabaseSync(':memory:');
  s.exec(readFileSync(new URL('../../koshyk-db-schema.sql', import.meta.url), 'utf8'));
  s.exec(readFileSync(new URL('../../migration_keywords.sql', import.meta.url), 'utf8'));
  return s;
}

const longDesc = 'Зручний зошит для щоденних записів. '.repeat(8).trim();
const kw = 'зошит, зошит а5, зошит у клітинку, канцтовари, школа, навчання, записи';

function seed(s) {
  const p = s.prepare('INSERT INTO products(sku,name,price,category_id,brand,in_stock) VALUES(?,?,?,?,?,?)');
  p.run('00-1', 'Зошит 48 арк', 20, 1, 'Axent', 1);            // id1: без тексту
  p.run('00-2', 'Ручка кулькова синя', 10, 1, '', 1);          // id2: є опис, без keywords/meta
  p.run('00-3', 'Фломастери 12 кол', 50, 1, 'Economix', 1);    // id3: усе заповнено
  p.run('РТ-4', 'Майка для хлопчика 60', 90, 4, '', 0);        // id4: немає в наявності, без тексту
  p.run('00-5', 'Дубль', 1, 1, '', 1);                          // id5, id6: однакова назва
  p.run('00-6', 'Дубль', 1, 1, '', 1);
  s.prepare('INSERT INTO product_content(product_id,description,keywords,meta_description) VALUES(?,?,?,?)').run(2, 'Готовий опис ручки, який не можна затирати.', '', '');
  s.prepare('INSERT INTO product_content(product_id,description,keywords,meta_description) VALUES(?,?,?,?)').run(3, longDesc, kw, 'Фломастери 12 кольорів. Купити в Ощадному Кошику.');
  s.prepare('INSERT INTO product_content(product_id,attributes_json) VALUES(?,?)').run(4, '{"gender":"хлопчик","size":"60"}');
}

const get = (db, qs = '') => mod.onRequestGet({ env: { koshyk_db: db }, request: new Request('https://x.test/admin/newproducts' + qs) });
const post = (db, body, qs = '', headers = {}) => mod.onRequestPost({
  env: { koshyk_db: db },
  request: new Request('https://x.test/admin/newproducts' + qs, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }),
});
const row = (s, id) => s.prepare('SELECT * FROM product_content WHERE product_id=?').get(id);

describe('/admin/newproducts: експорт', { skip }, () => {
  let s, db;
  beforeEach(() => { s = freshDb(); seed(s); db = makeD1(s); });

  it('віддає лише товари з порожнім description/keywords/meta_description, у наявності першими, з need і total', async () => {
    const res = await get(db, '?export=1');
    const items = await res.json();
    assert.equal(res.headers.get('x-total-remaining'), '5');
    assert.deepEqual(items.map(i => i.sku), ['00-6', '00-5', '00-2', '00-1', 'РТ-4']);
    assert.ok(!items.some(i => i.sku === '00-3'));
    const pen = items.find(i => i.sku === '00-2');
    assert.deepEqual(pen.need, ['keywords', 'meta_description']);
    assert.equal(pen.description, 'Готовий опис ручки, який не можна затирати.');
    assert.deepEqual(items.find(i => i.sku === '00-1').need, ['description', 'keywords', 'meta_description']);
  });

  it('є категорія (укр. назва), бренд лише коли заданий, attributes з JSON; ціни немає', async () => {
    const items = await (await get(db, '?export=1')).json();
    const a = items.find(i => i.sku === '00-1');
    assert.equal(a.category, 'Канцтовари'); assert.equal(a.brand, 'Axent'); assert.ok(!('price' in a));
    const m = items.find(i => i.sku === 'РТ-4');
    assert.deepEqual(m.attributes, { gender: 'хлопчик', size: '60' });
    assert.ok(!('brand' in items.find(i => i.sku === '00-2')));
  });

  it('limit обмежує вибірку, total лишається загальним; cat (slug) фільтрує', async () => {
    const r = await get(db, '?export=1&limit=2');
    assert.equal((await r.json()).length, 2);
    assert.equal(r.headers.get('x-total-remaining'), '5');
    const c = await get(db, '?export=1&cat=odyah');
    assert.deepEqual((await c.json()).map(i => i.sku), ['РТ-4']);
  });

  it('кривий attributes_json не ламає експорт', async () => {
    s.prepare('UPDATE product_content SET attributes_json=? WHERE product_id=4').run('{не json');
    const items = await (await get(db, '?export=1')).json();
    assert.ok(!('attributes' in items.find(i => i.sku === 'РТ-4')));
  });
});

describe('/admin/newproducts: заливка', { skip }, () => {
  let s, db;
  beforeEach(() => { s = freshDb(); seed(s); db = makeD1(s); });

  it('dryrun нічого не пише', async () => {
    const d = await (await post(db, [{ sku: '00-1', description: longDesc, keywords: kw, meta_description: 'Мета-опис для зошита.' }], '?dryrun=1')).json();
    assert.equal(d.willUpdate, 1); assert.equal(d.dryrun, true);
    assert.equal(row(s, 1), undefined);
  });

  it('заповнює порожнє, НЕ перезаписує наявне; товар без рядка отримує його', async () => {
    const d = await (await post(db, [
      { sku: '00-1', description: longDesc, keywords: kw, meta_description: 'Зошит 48 аркушів. Купити в Ощадному Кошику.' },
      { sku: '00-2', description: 'ІНШИЙ опис, що має бути проігнорований', keywords: kw, meta_description: 'Ручка кулькова синя. Купити.' },
    ])).json();
    assert.equal(d.willUpdate, 2);
    assert.deepEqual({ ...d.kept }, { description: 1, keywords: 0, meta_description: 0 });
    const r1 = row(s, 1); assert.equal(r1.description, longDesc); assert.equal(r1.keywords, kw); assert.ok(r1.seo_updated_at);
    const r2 = row(s, 2);
    assert.equal(r2.description, 'Готовий опис ручки, який не можна затирати.');
    assert.equal(r2.keywords, kw); assert.match(r2.meta_description, /^Ручка/);
  });

  it('SQL-захист: текст, що з’явився між перевіркою і заливкою, не затирається', async () => {
    const wrapped = { ...db, prepare: sql => db.prepare(sql) };
    // емулюємо гонку: після SELECT у POST хтось вписує опис товару 1
    let injected = false;
    wrapped.prepare = sql => {
      const st = db.prepare(sql);
      if (/FROM products p LEFT JOIN product_content/.test(sql) && !injected) {
        const all = st.all; st.all = async () => { const r = await all(); injected = true;
          s.prepare('INSERT INTO product_content(product_id,description) VALUES(1,?)').run('Хтось уже вписав'); return r; };
      }
      return st;
    };
    await post(wrapped, [{ sku: '00-1', description: 'мій текст', keywords: kw, meta_description: 'мета' }]);
    assert.equal(row(s, 1).description, 'Хтось уже вписав');
    assert.equal(row(s, 1).keywords, kw);
  });

  it('після заливки товар зникає з експорту', async () => {
    await post(db, [{ sku: '00-1', description: longDesc, keywords: kw, meta_description: 'Мета.' }]);
    const items = await (await get(db, '?export=1')).json();
    assert.ok(!items.some(i => i.sku === '00-1'));
  });

  it('невідомий sku, порожній запис, дубль у відповіді, неоднозначна назва, матч за назвою', async () => {
    const d = await (await post(db, [
      { sku: 'НЕМАЄ', description: 'x'.repeat(200) },
      { sku: '00-1' },
      { sku: '00-1', description: longDesc },
      { sku: '00-1', keywords: 'другий запис ігнорується' },
      { sku: 'Дубль', description: 'тест' },
      { sku: 'фломастери 12 кол', keywords: 'нове' },
    ])).json();
    assert.equal(d.unmatched, 1); assert.equal(d.empty, 1); assert.equal(d.ambiguous.total, 1);
    assert.equal(d.willUpdate, 1); assert.equal(d.nothingNew, 1);
    assert.equal(row(s, 1).description, longDesc); assert.equal(row(s, 1).keywords, '');
  });

  it('терпимий до ```json, тексту навколо, масиву в keywords; чистить HTML/markdown/лапки; синоніми ключів', async () => {
    const text = 'Ось відповідь:\n```json\n' + JSON.stringify([{ sku: '00-1', text: '<p>Опис <b>зошита</b></p>', keywords: ['зошит', ' а5 ', ''], seo_description: '**«Зошит 48 арк. Купити в Ощадному Кошику»**' }]) + '\n```';
    const d = await (await post(db, text)).json();
    assert.equal(d.willUpdate, 1);
    const r = row(s, 1);
    assert.equal(r.description, 'Опис зошита');
    assert.equal(r.keywords, 'зошит, а5');
    assert.equal(r.meta_description, 'Зошит 48 арк. Купити в Ощадному Кошику');
  });

  it('попередження не блокують; кривий JSON → 400, порожній масив → 400, нічого не пишеться', async () => {
    const w = await (await post(db, [{ sku: '00-1', description: 'коротко', keywords: 'а, б', meta_description: 'ок' }], '?dryrun=1')).json();
    assert.ok(w.matched.sample[0].warn.length >= 3);
    const bad = await post(db, 'це не json'); assert.equal(bad.status, 400);
    const emp = await post(db, '[]'); assert.equal(emp.status, 400);
    assert.equal(s.prepare('SELECT COUNT(*) n FROM product_content').get().n, 3);
  });

  it('ціна, наявність, бренд не змінюються', async () => {
    const before = s.prepare('SELECT sku,price,in_stock,brand,image_url FROM products ORDER BY id').all().map(r => ({ ...r }));
    await post(db, [{ sku: '00-1', description: longDesc, keywords: kw, meta_description: 'м' }, { sku: 'РТ-4', description: longDesc }]);
    const after = s.prepare('SELECT sku,price,in_stock,brand,image_url FROM products ORDER BY id').all().map(r => ({ ...r }));
    assert.deepEqual(after, before);
  });

  it('cross-site POST відхиляється 403 (CSRF), same-origin проходить', async () => {
    const bad = await post(db, [{ sku: '00-1', description: longDesc }], '', { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(bad.status, 403); assert.equal(row(s, 1), undefined);
    const ok = await post(db, [{ sku: '00-1', description: longDesc }], '', { 'Sec-Fetch-Site': 'same-origin' });
    assert.equal(ok.status, 200);
  });
});

describe('/admin/newproducts: сторінка та інтеграція', { skip }, () => {
  it('показує лічильники, розділи зі slug і промпт без вигадування фактів; скрипт синтаксично валідний', async () => {
    const s = freshDb(); seed(s);
    const html = await (await get(makeD1(s))).text();
    assert.match(html, /Нових товарів: <b>5<\/b>/);
    assert.match(html, /value="odyah">Одяг \(1\)/);
    assert.match(html, /НЕ вигадуй розмірів/);
    assert.match(html, /"meta_description"/);
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    assert.doesNotThrow(() => new Function(script));
  });

  it('нових нема → 🎉', async () => {
    const s = freshDb(); s.exec(`INSERT INTO products(sku,name,price,category_id) VALUES('a','A',1,1); INSERT INTO product_content(product_id,description,keywords,meta_description) VALUES(1,'d','k','m')`);
    assert.match(await (await get(makeD1(s))).text(), /🎉 Нових товарів немає/);
  });

  it('збій D1 не ламає сторінку', async () => {
    const broken = { prepare: () => ({ bind() { return this; }, all: async () => { throw new Error('D1_ERROR boom'); } }) };
    const html = await (await get(broken)).text();
    assert.match(html, /Не вдалося порахувати: D1_ERROR boom/);
  });

  it('плитка є на головній адмінки; /admin/newproducts під Basic Auth', async () => {
    const html = await (await adminIndex.onRequestGet()).text();
    assert.match(html, /href="\/admin\/newproducts"/);
    // У Node заголовок WWW-Authenticate з кирилицею кидає TypeError (у Workers це працює), тому перевіряємо головне:
    // без пароля next() не викликається, з правильним паролем — викликається.
    let called = 0; const next = () => { called++; return new Response('ok'); };
    const env = { ADMIN_PASSWORD: 'pw' };
    let status = null;
    try { status = (await middleware.onRequest({ request: new Request('https://x.test/admin/newproducts'), env, next })).status; } catch (e) { assert.ok(e instanceof TypeError); }
    assert.ok(status === null || status === 401); assert.equal(called, 0);
    const auth = { Authorization: 'Basic ' + Buffer.from('u:pw').toString('base64') };
    await middleware.onRequest({ request: new Request('https://x.test/admin/newproducts', { headers: auth }), env, next });
    assert.equal(called, 1);
  });
});
