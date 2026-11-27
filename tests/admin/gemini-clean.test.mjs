// POST /admin/api/gemini-clean (Nano Banana 2) + кнопка «✨ Gemini» в редакторі фото. Gemini підроблений (fetch).
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const g = await import('../../functions/admin/api/gemini-clean.js');
const products = await import('../../functions/admin/products.js');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const req = body => new Request('https://k.test/admin/api/gemini-clean', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(new TextEncoder().encode(body).length) }, body });

describe('endpoint Gemini (тонкий проксі)', () => {
  it('без ключа → 501 з підказкою (JSON)', async () => {
    const r = await g.onRequestPost({ env: {}, request: req('{}') }); assert.equal(r.status, 501); assert.match((await r.json()).error.message, /GEMINI_API_KEY/);
  });
  it('порожній і завеликий запит відхиляються, Gemini не викликається', async () => {
    let called = 0; globalThis.fetch = async () => { called++; return new Response('{}'); };
    const env = { GEMINI_API_KEY: 'k' };
    assert.equal((await g.onRequestPost({ env, request: new Request('https://k.test/x', { method: 'POST', headers: { 'Content-Length': '0' } }) })).status, 400);
    assert.equal((await g.onRequestPost({ env, request: new Request('https://k.test/x', { method: 'POST', headers: { 'Content-Length': String(8 * 1024 * 1024 + 1) }, body: '{}' }) })).status, 413);
    assert.equal(called, 0);
  });
  it('пересилає тіло як є з ключем у заголовку і віддає відповідь Gemini без змін (статус теж)', async () => {
    let seen, bodyText;
    globalThis.fetch = async (url, init) => { seen = { url: String(url), init }; bodyText = await new Response(init.body).text(); return new Response('{"candidates":[{"x":1}]}', { status: 200 }); };
    const payload = JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] });
    const r = await g.onRequestPost({ env: { GEMINI_API_KEY: 'sekret' }, request: req(payload) });
    assert.equal(r.status, 200); assert.equal(await r.text(), '{"candidates":[{"x":1}]}'); assert.equal(bodyText, payload);
    assert.match(seen.url, /\/v1beta\/models\/gemini-3\.1-flash-image:generateContent$/); assert.equal(seen.init.headers['x-goog-api-key'], 'sekret');
    globalThis.fetch = async () => new Response('{"error":{"message":"quota"}}', { status: 429 });
    const r2 = await g.onRequestPost({ env: { GEMINI_API_KEY: 'k' }, request: req(payload) }); assert.equal(r2.status, 429); assert.match((await r2.json()).error.message, /quota/);
  });
  it('GEMINI_IMAGE_MODEL змінює модель; мережева помилка → 504 з JSON', async () => {
    let url; globalThis.fetch = async u => { url = String(u); return new Response('{}'); };
    await g.onRequestPost({ env: { GEMINI_API_KEY: 'k', GEMINI_IMAGE_MODEL: 'gemini-x' }, request: req('{}') }); assert.match(url, /models\/gemini-x:/);
    globalThis.fetch = async () => { throw new Error('net'); };
    const r = await g.onRequestPost({ env: { GEMINI_API_KEY: 'k' }, request: req('{}') }); assert.equal(r.status, 504); assert.match((await r.json()).error.message, /Gemini/);
  });
});

describe('редактор фото', () => {
  it('редактор: кнопка «✨ Gemini» і виклик ендпоїнта; скрипт валідний', async () => {
    const stub = { prepare: sql => ({ all: async () => ({ results: /categories/.test(sql) ? [{ id: 1, slug: 'k', name_uk: 'К' }] : [{ brand: 'A' }] }) }) };
    const h = await (await products.onRequestGet({ env: { koshyk_db: stub } })).text();
    for (const k of ['✨ Gemini', '/admin/api/gemini-clean', 'function aiClean', 'inline_data', 'ПЕРЕВІРТЕ текст на упаковці']) assert.ok(h.includes(k), k);
    assert.doesNotThrow(() => new Function(h.match(/<script>([\s\S]*?)<\/script>/)[1]));
  });
});
