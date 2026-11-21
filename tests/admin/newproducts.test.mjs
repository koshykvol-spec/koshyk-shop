// Тести /admin/newproducts на справжньому SQLite (node:sqlite, Node >= 22.5) із реальною схемою koshyk-db.
//   node --test tests/admin/newproducts.test.mjs
// Без мережі й без D1: невеличка обгортка імітує D1-API (prepare/bind/all/first/run/batch).
// Інструмент заливає ЛИШЕ product_content.description (markdown): сайт читає тільки його.

import { describe, it, beforeEach } from 'node:test';
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

function seed(s) {
  const p = s.prepare('INSERT INTO products(sku,name,price,category_id,brand,in_stock) VALUES(?,?,?,?,?,?)');
  p.run('00-1', 'Зошит 48 арк', 20, 1, 'Axent', 1);            // id1: без рядка в product_content
  p.run('00-2', 'Ручка кулькова синя', 10, 1, '', 1);          // id2: рядок є, опис порожній (є лише keywords)
  p.run('00-3', 'Фломастери 12 кол', 50, 1, 'Economix', 1);    // id3: опис є
  p.run('РТ-4', 'Майка для хлопчика 60', 90, 4, '', 0);        // id4: немає в наявності, без опису
  p.run('00-5', 'Дубль', 1, 1, '', 1);                          // id5, id6: однакова назва
  p.run('00-6', 'Дубль', 1, 1, '', 1);
  s.prepare('INSERT INTO product_content(product_id,keywords) VALUES(?,?)').run(2, 'ручка, синя');
  s.prepare('INSERT INTO product_content(product_id,description) VALUES(?,?)').run(3, longDesc);
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

  it('віддає лише товари з порожнім описом: у наявності першими, потім найновіші; total загальний', async () => {
    const res = await get(db, '?export=1');
    const items = await res.json();
    assert.equal(res.headers.get('x-total-remaining'), '5');
    assert.deepEqual(items.map(i => i.sku), ['00-6', '00-5', '00-2', '00-1', 'РТ-4']);
    assert.ok(!items.some(i => i.sku === '00-3'));
  });

  it('є категорія (укр. назва), бренд лише коли заданий, attributes з JSON; ціни й поля need немає', async () => {
    const items = await (await get(db, '?export=1')).json();
    const a = items.find(i => i.sku === '00-1');
    assert.equal(a.category, 'Канцтовари'); assert.equal(a.brand, 'Axent');
    assert.ok(!('price' in a)); assert.ok(!('need' in a));
    assert.deepEqual(items.find(i => i.sku === 'РТ-4').attributes, { gender: 'хлопчик', size: '60' });
    assert.ok(!('brand' in items.find(i => i.sku === '00-2')));
  });

  it('limit обмежує вибірку, total лишається загальним; cat (slug) фільтрує', async () => {
    const r = await get(db, '?export=1&limit=2');
    assert.equal((await r.json()).length, 2);
    assert.equal(r.headers.get('x-total-remaining'), '5');
    assert.deepEqual((await (await get(db, '?export=1&cat=odyah')).json()).map(i => i.sku), ['РТ-4']);
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
    const d = await (await post(db, [{ sku: '00-1', description: longDesc }], '?dryrun=1')).json();
    assert.equal(d.willUpdate, 1); assert.equal(d.dryrun, true);
    assert.equal(row(s, 1), undefined);
  });

  it('заповнює порожній опис (і для товару без рядка, і з рядком), НЕ перезаписує наявний; інші колонки не чіпає', async () => {
    const d = await (await post(db, [
      { sku: '00-1', description: longDesc },
      { sku: '00-2', description: longDesc },
      { sku: '00-3', description: 'ІНШИЙ опис, що має бути проігнорований' },
    ])).json();
    assert.equal(d.willUpdate, 2); assert.equal(d.kept, 1);
    assert.equal(row(s, 1).description, longDesc); assert.ok(row(s, 1).seo_updated_at);
    assert.equal(row(s, 2).description, longDesc); assert.equal(row(s, 2).keywords, 'ручка, синя');
    assert.equal(row(s, 3).description, longDesc);
    assert.equal(row(s, 3).seo_updated_at, null);
    assert.equal(row(s, 1).keywords, null); assert.equal(row(s, 1).meta_description, null);
  });

  it('keywords/meta_* у відповіді LLM ігноруються: інструмент пише лише description', async () => {
    const d = await (await post(db, [{ sku: '00-1', description: longDesc, keywords: 'a, b, c', meta_description: 'мета', meta_title: 'т' }])).json();
    assert.equal(d.willUpdate, 1);
    assert.equal(row(s, 1).keywords, null); assert.equal(row(s, 1).meta_description, null); assert.equal(row(s, 1).meta_title, null);
    const only = await (await post(db, [{ sku: '00-2', keywords: 'тільки ключові', meta_description: 'тільки мета' }])).json();
    assert.equal(only.empty, 1); assert.equal(only.willUpdate, 0);
  });

  it('SQL-захист: опис, що з’явився між перевіркою і заливкою, не затирається', async () => {
    let injected = false;
    const racing = { ...db, prepare: sql => {
      const st = db.prepare(sql);
      if (/FROM products p LEFT JOIN product_content/.test(sql) && !injected) {
        const all = st.all;
        st.all = async () => { const r = await all(); injected = true; s.prepare('INSERT INTO product_content(product_id,description) VALUES(1,?)').run('Хтось уже вписав'); return r; };
      }
      return st;
    } };
    await post(racing, [{ sku: '00-1', description: 'мій текст' }]);
    assert.equal(row(s, 1).description, 'Хтось уже вписав');
    assert.equal(row(s, 1).seo_updated_at, null);
  });

  it('після заливки товар зникає з експорту', async () => {
    await post(db, [{ sku: '00-1', description: longDesc }]);
    assert.ok(!(await (await get(db, '?export=1')).json()).some(i => i.sku === '00-1'));
  });

  it('невідомий sku, порожній запис, дубль у відповіді, неоднозначна назва, матч за назвою', async () => {
    const d = await (await post(db, [
      { sku: 'НЕМАЄ', description: 'x'.repeat(200) },
      { sku: '00-1' },
      { sku: '00-1', description: longDesc },
      { sku: '00-1', description: 'другий запис ігнорується' },
      { sku: 'Дубль', description: 'тест' },
      { sku: 'ручка кулькова синя', description: longDesc },
    ])).json();
    assert.equal(d.unmatched, 1); assert.equal(d.empty, 1); assert.equal(d.ambiguous.total, 1);
    assert.equal(d.willUpdate, 2);
    assert.equal(row(s, 1).description, longDesc); assert.equal(row(s, 2).description, longDesc);
  });

  it('опис зберігає markdown: переноси, **жирний**, списки; HTML вирізається, зайві порожні рядки стискаються', async () => {
    const md = '**Зошит 48 арк** для записів.\r\n\r\n\r\n\r\n### Особливості\r\n- 48 аркушів\r\n- клітинка\r\n<script>x</script>';
    await post(db, [{ sku: '00-1', description: md }]);
    assert.equal(row(s, 1).description, '**Зошит 48 арк** для записів.\n\n### Особливості\n- 48 аркушів\n- клітинка\nx');
  });

  it('терпимий до ```json, тексту навколо, ключів text/annotation', async () => {
    const text = 'Ось відповідь:\n```json\n' + JSON.stringify([{ sku: '00-1', text: '<p>Опис <b>зошита</b></p>' }, { id: '00-2', annotation: 'Опис ручки' }]) + '\n```';
    const d = await (await post(db, text)).json();
    assert.equal(d.willUpdate, 2);
    assert.equal(row(s, 1).description, 'Опис зошита'); assert.equal(row(s, 2).description, 'Опис ручки');
  });

  it('попередження про довжину не блокують; кривий JSON → 400, порожній масив → 400, нічого не пишеться', async () => {
    const w = await (await post(db, [{ sku: '00-1', description: 'коротко' }], '?dryrun=1')).json();
    assert.match(w.matched.sample[0].warn, /короткий/); assert.equal(w.willUpdate, 1);
    assert.equal((await post(db, 'це не json')).status, 400);
    assert.equal((await post(db, '[]')).status, 400);
    assert.equal(s.prepare('SELECT COUNT(*) n FROM product_content').get().n, 3);
  });

  it('ціна, наявність, бренд не змінюються', async () => {
    const q = () => s.prepare('SELECT sku,price,in_stock,brand,image_url FROM products ORDER BY id').all().map(r => ({ ...r }));
    const before = q();
    await post(db, [{ sku: '00-1', description: longDesc }, { sku: 'РТ-4', description: longDesc }]);
    assert.deepEqual(q(), before);
  });

  it('cross-site POST відхиляється 403 (CSRF), same-origin проходить', async () => {
    const bad = await post(db, [{ sku: '00-1', description: longDesc }], '', { 'Sec-Fetch-Site': 'cross-site' });
    assert.equal(bad.status, 403); assert.equal(row(s, 1), undefined);
    assert.equal((await post(db, [{ sku: '00-1', description: longDesc }], '', { 'Sec-Fetch-Site': 'same-origin' })).status, 200);
  });
});

describe('/admin/newproducts: сторінка та інтеграція', { skip }, () => {
  it('показує лічильник без опису, розділи зі slug і промпт: markdown, \\n показано буквально, факти не вигадувати, лише опис', async () => {
    const s = freshDb(); seed(s);
    const html = await (await get(makeD1(s))).text();
    assert.match(html, /Товарів без опису: <b>5<\/b>/);
    assert.match(html, /value="odyah">Одяг \(1\)/);
    assert.match(html, /формат MARKDOWN/);
    assert.match(html, /\(у JSON це \\n\\n\)/);
    assert.match(html, /НЕ вигадуй розмірів/);
    const promptArea = html.match(/<textarea id=prompt[\s\S]*?<\/textarea>/)[0];
    assert.ok(!/keywords|meta_description|meta_title/.test(promptArea), 'у промпті не має бути зайвих полів');
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    assert.doesNotThrow(() => new Function(script));
  });

  it('усі товари з описом → 🎉', async () => {
    const s = freshDb(); s.exec(`INSERT INTO products(sku,name,price,category_id) VALUES('a','A',1,1); INSERT INTO product_content(product_id,description) VALUES(1,'d')`);
    assert.match(await (await get(makeD1(s))).text(), /🎉 Усі товари мають опис/);
  });

  it('збій D1 не ламає сторінку', async () => {
    const broken = { prepare: () => ({ bind() { return this; }, all: async () => { throw new Error('D1_ERROR boom'); } }) };
    assert.match(await (await get(broken)).text(), /Не вдалося порахувати: D1_ERROR boom/);
  });

  it('плитка є на головній адмінки; /admin/newproducts під Basic Auth', async () => {
    assert.match(await (await adminIndex.onRequestGet()).text(), /href="\/admin\/newproducts"/);
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
