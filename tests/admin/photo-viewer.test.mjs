// Перегляд фото у вікні редагування товару (/admin/products): розмітка, стилі, синтаксис клієнтського скрипта.
// Поведінку (клік по фото, стрілки, Esc) перевіряє браузерний прогін; тут — що код присутній і не ламає сторінку.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const mod = await import('../../functions/admin/products.js');
const stubDb = { prepare: sql => ({ all: async () => ({ results: /categories/.test(sql) ? [{ id: 1, slug: 'kanctovary', name_uk: 'Канцтовари' }] : [{ brand: 'Axent' }] }) }) };
const html = await (await mod.onRequestGet({ env: { koshyk_db: stubDb } })).text();
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

describe('/admin/products: перегляд фото при редагуванні', () => {
  it('клієнтський скрипт синтаксично валідний', () => assert.doesNotThrow(() => new Function(script)));

  it('мініатюри відкривають перегляд (кнопки керування не відкривають), порядок береться з DOM', () => {
    assert.ok(script.includes('attachViewer(gallery)'));
    assert.ok(script.includes('e.target.closest("button")'));
    assert.ok(script.includes('gallery.querySelectorAll(".photo-thumb:not(.photo-thumb-pending)")'));
  });

  it('є закриття (×, Esc, клік по фону), стрілки й свайп, посилання на оригінал', () => {
    for (const k of ['"Escape"', '"ArrowLeft"', '"ArrowRight"', 'e.target === pv', 'touchend', 'Відкрити оригінал', 'pv-close']) assert.ok(script.includes(k), k);
  });

  it('Esc перехоплюється (capture), а прокрутка після закриття повертається у попередній стан', () => {
    assert.ok(script.includes('}, true);'));
    assert.ok(script.includes('pvPrevOverflow'));
  });

  it('стилі перегляду є і лежать вище вікна редагування (z-index 300 > 100)', () => {
    assert.match(html, /\.pv \{ position: fixed; inset: 0; z-index: 300;/);
    assert.match(html, /\.modal-overlay \{[^}]*z-index: 100;/);
  });

  it('перегляд не ходить на зовнішні адреси і не використовує зовнішніх бібліотек', () => {
    const chunk = script.slice(script.indexOf('Перегляд фото'), script.indexOf("Прев'ю фото перед завантаженням"));
    assert.ok(chunk.length > 500);
    assert.ok(!/https?:\/\//.test(chunk));
  });
});
