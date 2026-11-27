// POST /admin/api/gemini-clean (Nano Banana 2) + кнопка «✨ Gemini» в редакторі фото. Gemini підроблений (fetch).
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const g = await import('../../functions/admin/api/gemini-clean.js');
const products = await import('../../functions/admin/products.js');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const req = (body, type = 'image/jpeg') => new Request('https://k.test/admin/api/gemini-clean', { method: 'POST', headers: type ? { 'Content-Type': type } : {}, body });
const jpeg = () => new Uint8Array(1000).fill(7);

describe('/admin/api/gemini-clean', () => {
  it('без ключа → 501 з підказкою', async () => {
    const r = await g.onRequestPost({ env: {}, request: req(jpeg()) }); assert.equal(r.status, 501); assert.match((await r.json()).error, /GEMINI_API_KEY/);
  });
  it('відмови: не зображення, порожнє, завелике — Gemini не викликається', async () => {
    let called = 0; globalThis.fetch = async () => { called++; return new Response('{}'); };
    const env = { GEMINI_API_KEY: 'k' };
    assert.equal((await g.onRequestPost({ env, request: req(jpeg(), 'text/plain') })).status, 400);
    assert.equal((await g.onRequestPost({ env, request: req(new Uint8Array(0)) })).status, 400);
    assert.equal((await g.onRequestPost({ env, request: req(new Uint8Array(4 * 1024 * 1024 + 1)) })).status, 400);
    assert.equal(called, 0);
  });
  it('успіх: правильний запит до Gemini (модель, ключ, промпт, фото), повертає base64 результату', async () => {
    let seen;
    globalThis.fetch = async (url, init) => { seen = { url: String(url), init, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] }), { status: 200 }); };
    const r = await g.onRequestPost({ env: { GEMINI_API_KEY: 'sekret' }, request: req(jpeg()) }); const j = await r.json();
    assert.equal(r.status, 200); assert.deepEqual([j.ok, j.mime, j.image], [true, 'image/png', 'QUJD']);
    assert.match(seen.url, /\/v1beta\/models\/gemini-3\.1-flash-image:generateContent$/); assert.equal(seen.init.headers['x-goog-api-key'], 'sekret');
    const parts = seen.body.contents[0].parts; assert.equal(parts[0].text, g.PROMPT); assert.equal(parts[1].inline_data.mime_type, 'image/jpeg'); assert.ok(parts[1].inline_data.data.length > 100);
    assert.deepEqual(seen.body.generationConfig.responseModalities, ['IMAGE']);
  });
  it('GEMINI_IMAGE_MODEL змінює модель; відповідь без картинки і помилка API → 502 з поясненням', async () => {
    let url; globalThis.fetch = async u => { url = String(u); return new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'no' }] } }] })); };
    let r = await g.onRequestPost({ env: { GEMINI_API_KEY: 'k', GEMINI_IMAGE_MODEL: 'gemini-x' }, request: req(jpeg()) });
    assert.match(url, /models\/gemini-x:/); assert.equal(r.status, 502); assert.match((await r.json()).error, /SAFETY/);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429 });
    r = await g.onRequestPost({ env: { GEMINI_API_KEY: 'k' }, request: req(jpeg()) }); assert.equal(r.status, 502); assert.match((await r.json()).error, /quota/);
  });
  it('редактор: кнопка «✨ Gemini» і виклик ендпоїнта; скрипт валідний', async () => {
    const stub = { prepare: sql => ({ all: async () => ({ results: /categories/.test(sql) ? [{ id: 1, slug: 'k', name_uk: 'К' }] : [{ brand: 'A' }] }) }) };
    const h = await (await products.onRequestGet({ env: { koshyk_db: stub } })).text();
    for (const k of ['✨ Gemini', '/admin/api/gemini-clean', 'function aiClean', 'ПЕРЕВІРТЕ текст на упаковці']) assert.ok(h.includes(k), k);
    assert.doesNotThrow(() => new Function(h.match(/<script>([\s\S]*?)<\/script>/)[1]));
  });
});
