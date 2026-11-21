// «Масова заливка» (/admin/annotations) і «Масові дії» (/admin/bulk) працюють лише з описом:
// публічний сайт читає тільки product_content.description, інші SEO-колонки йому не потрібні.
//   node --test tests/admin/description-only.test.mjs

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch { /* старий Node */ }
const skip = DatabaseSync ? false : 'node:sqlite недоступний (потрібен Node >= 22.5)';

const annotations = await import('../../functions/admin/annotations.js');
const bulk = await import('../../functions/admin/bulk.js');
const bulkApply = await import('../../functions/admin/api/bulk-apply.js');

function makeD1(sqlite) {
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    all: async () => ({ results: sqlite.prepare(sql).all(...args).map(r => ({ ...r })) }),
    first: async () => { const r = sqlite.prepare(sql).get(...args); return r ? { ...r } : null; },
    _exec: () => sqlite.prepare(sql).run(...args),
  });
  return {
    prepare: sql => wrap(sql),
    batch: async stmts => { sqlite.exec('BEGIN'); try { for (const s of stmts) s._exec(); sqlite.exec('COMMIT'); } catch (e) { sqlite.exec('ROLLBACK'); throw e; } return []; },
  };
}
function freshDb() {
  const s = new DatabaseSync(':memory:');
  s.exec(readFileSync(new URL('../../koshyk-db-schema.sql', import.meta.url), 'utf8'));
  s.exec(readFileSync(new URL('../../migration_keywords.sql', import.meta.url), 'utf8'));
  const p = s.prepare('INSERT INTO products(sku,name,price,category_id,brand) VALUES(?,?,?,?,?)');
  p.run('00-1', 'Зошит', 20, 1, 'Axent'); p.run('00-2', 'Ручка', 10, 1, ''); p.run('00-3', 'Майка', 90, 4, '');
  s.prepare('INSERT INTO product_content(product_id,description,keywords,meta_title,meta_description) VALUES(2,?,?,?,?)').run('Старий опис', 'k', 't', 'm');
  return s;
}
const row = (s, id) => s.prepare('SELECT * FROM product_content WHERE product_id=?').get(id);
const apply = (db, body) => bulkApply.onRequestPost({ env: { koshyk_db: db }, request: new Request('https://x.test/admin/api/bulk-apply', { method: 'POST', body: JSON.stringify(body) }) });

describe('«Масова заливка»: лише опис', { skip }, () => {
  it('у випадайці одне поле «Опис товару»; клієнтський скрипт валідний; правил для інших полів немає', async () => {
    const s = freshDb();
    const html = await (await annotations.onRequestGet({ env: { koshyk_db: makeD1(s) } })).text();
    const sel = html.match(/<select id="fieldSelect">([\s\S]*?)<\/select>/)[1];
    assert.deepEqual([...sel.matchAll(/value="(\w+)"/g)].map(m => m[1]), ['description']);
    assert.ok(!/Ключові слова|meta title|meta description/i.test(sel));
    const script = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, '')).join('\n');
    assert.doesNotThrow(() => new Function(script));
    assert.ok(!/FIELD_RULES[\s\S]{0,40}keywords|meta_title:|meta_description:/.test(script));
  });
});

describe('«Масові дії»: лише опис', { skip }, () => {
  let s, db;
  beforeEach(() => { s = freshDb(); db = makeD1(s); });

  it('на сторінці лише шаблон опису (без meta title/description і ключових слів), без ціни за замовчуванням', async () => {
    const html = await (await bulk.onRequestGet({ env: { koshyk_db: db } })).text();
    assert.ok(html.includes('id="tplDescription"'));
    assert.ok(!/tplMetaTitle|tplMetaDescription|tplKeywords/.test(html));
    const tpl = html.match(/<textarea id="tplDescription"[^>]*>([\s\S]*?)<\/textarea>/)[1];
    assert.ok(!tpl.includes('{price}'), 'ціна в тексті опису швидко застаріє');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new Function(script));
  });

  it('bulk-apply пише лише description: ключові слова й meta-колонки не чіпає (і не створює)', async () => {
    const r = await apply(db, { category: null, missingOnly: false, templates: { description: '{name} від {brand}', keywords: 'x', metaTitle: 'x', metaDescription: 'x' } });
    assert.equal((await r.json()).updated, 3);
    assert.equal(row(s, 1).description, 'Зошит від Axent'); assert.equal(row(s, 1).keywords, null); assert.equal(row(s, 1).meta_title, null);
    const r2 = row(s, 2);
    assert.equal(r2.description, 'Ручка'); assert.equal(r2.keywords, 'k'); assert.equal(r2.meta_title, 't'); assert.equal(r2.meta_description, 'm');
  });

  it('«лише без опису» не затирає наявні описи', async () => {
    await apply(db, { category: null, missingOnly: true, templates: { description: 'Новий {name}' } });
    assert.equal(row(s, 2).description, 'Старий опис');
    assert.equal(row(s, 1).description, 'Новий Зошит');
  });

  it('порожній шаблон опису → 400 і нічого не пишеться (інакше NULL стер би описи)', async () => {
    const r = await apply(db, { missingOnly: false, templates: { description: '   ' } });
    assert.equal(r.status, 400);
    assert.equal(row(s, 2).description, 'Старий опис'); assert.equal(row(s, 1), undefined);
  });

  it('фільтр за категорією (slug) діє', async () => {
    await apply(db, { category: 'odyah', missingOnly: false, templates: { description: '{name}' } });
    assert.equal(row(s, 3).description, 'Майка'); assert.equal(row(s, 1), undefined);
  });
});

describe('дашборд адмінки: чіпи', { skip }, () => {
  it('є «Без опису» і «Без фото»; чіпів «Без SEO» і «Без ключових слів» (колонки, яких сайт не читає) немає; скрипт валідний', async () => {
    const adminIndex = await import('../../functions/admin/index.js');
    const html = await (await adminIndex.onRequestGet()).text();
    assert.match(html, /missing=description/); assert.match(html, /missing=photo/);
    assert.ok(!/missing=seo|missing=keywords|Без SEO|Без ключових слів/.test(html));
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
  });
});
