// /admin/newproducts — НОВІ товари одним проходом: опис + ключові слова + SEO meta description.
// Об'єднує окремі кроки /admin/annotations (поле за полем) для типового випадку
// «після імпорту 1С з'явились нові товари без текстів».
//   GET                          — сторінка (лічильники, кнопка копіювання промпту, вставка відповіді, перевірка/заливка)
//   GET  ?export=1&limit=N&cat=… — JSON нових товарів (вхід для LLM); заголовок x-total-remaining
//   POST ?dryrun=1               — перевірка відповіді LLM (JSON-масив) без запису
//   POST                         — заливка
// «Новий» = товар, у якого порожня хоча б одна з трьох колонок product_content:
//   description, keywords, meta_description. Спершу йдуть товари в наявності, потім найновіші (id DESC).
// Заливка ЗАПОВНЮЄ ЛИШЕ ПОРОЖНІ поля: наявні тексти не перезаписуються (гарантовано самим SQL, а не лише перевіркою).
// Для перезапису наявних текстів лишається /admin/annotations.
// Чіпає ЛИШЕ product_content.description / keywords / meta_description (+ seo_updated_at);
// ціни, наявність, фото, бренди — ні. Ціна навмисно не потрапляє в експорт (LLM не має вписувати її в текст).

const json = (o, s = 200) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });
const escA = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MAX_DESC = 5000;
const MAX_KW = 1000;
const MAX_MD = 500;
const FIELDS = ['description', 'keywords', 'meta_description'];
const EMPTY = f => `COALESCE(pc.${f},'')=''`;
const NEW_COND = `(${EMPTY('description')} OR ${EMPTY('keywords')} OR ${EMPTY('meta_description')})`;

// Один промпт на всі три поля. Правила узято з промптів /admin/annotations.
const PROMPT = `Ти копірайтер інтернет-магазину «Ощадний Кошик» (Україна): канцтовари, господарчі товари, іграшки, одяг, хімія, біжутерія, взуття.
Для кожного НОВОГО товару зі списку в кінці підготуй тексти.

ФОРМАТ ВІДПОВІДІ: лише валідний JSON-масив, без пояснень і без жодного тексту навколо.
Елемент: {"sku":"…точно як у вході…","description":"…","keywords":"…","meta_description":"…"}
Заповнюй ЛИШЕ ті поля, що перелічені в "need" цього товару; решту полів не додавай. Якщо в товара є поле "description" (уже готовий опис), не переписуй його, а використай для keywords і meta_description.

description (опис товару), формат MARKDOWN:
- Українська. Дозволений ЛИШЕ такий markdown (сайт інших не відображає): абзаци, **жирний**, *курсив*, список через "- ", нумерований список "1. ", підзаголовок "### ". Без HTML, таблиць, посилань, зображень і емодзі.
- 400–800 символів. Абзаци розділяй порожнім рядком (у JSON це \\n\\n), пункти списку з нового рядка (\\n).
- Структура: 1) короткий вступ на 2–3 речення: що це за товар і для чого, **назва** жирним; 2) якщо є що сказати, підзаголовок "### Особливості" і список із 3–5 пунктів "- ..." лише з того, що випливає з назви, категорії, бренду й attributes.
- Природно вплети назву й категорію, без «води» і порожніх обіцянок. Не став на початок рядка "- " чи "#" там, де це не список чи підзаголовок.

keywords (ключові слова):
- 8–15 слів або коротких фраз через кому, без повторів.
- Назва товару (і природні синоніми), тип/категорія, призначення, бренд, для одягу й взуття стать/вік, якщо це видно з назви чи attributes.

meta_description (SEO description):
- 120–160 символів (суворо, Google обрізає довше). Лише звичайний текст, без HTML, markdown і лапок на початку/кінці.
- Коротко суть + користь + заклик («Купити в Ощадному Кошику»). Бери з description (наданого або щойно написаного тобою).

ФАКТИ (для всіх полів): спирайся ЛИШЕ на надані поля (name, category, brand, attributes). НЕ вигадуй розмірів, матеріалів, складу, країни виробника, комплектації, віку, сертифікатів, якщо їх немає у вхідних даних. Ціну не згадуй. Немає даних, пиши загально про призначення.
sku не змінюй і не вигадуй. Один товар = один об'єкт у масиві.

СПИСОК ТОВАРІВ (JSON):`;

// ── Експорт ──────────────────────────────────────────────────────────────────
async function exportNew(db, url) {
  let limit = parseInt(url.searchParams.get('limit') || '30', 10);
  if (!(limit > 0)) limit = 30;
  limit = Math.min(limit, 100);
  const cat = (url.searchParams.get('cat') || '').trim();
  const eb = []; let extra = '';
  if (cat) { extra = ' AND c.slug=?'; eb.push(cat); }

  // COUNT(*) OVER () рахується до LIMIT → загальна кількість нових одним запитом
  const rows = (await db.prepare(
    `SELECT p.sku AS sku, p.name AS name, c.name_uk AS category, p.brand AS brand,
            COALESCE(pc.attributes_json,'') AS attrs,
            COALESCE(pc.description,'') AS descr, COALESCE(pc.keywords,'') AS kw, COALESCE(pc.meta_description,'') AS md,
            COUNT(*) OVER () AS total
       FROM products p
       JOIN categories c ON c.id=p.category_id
       LEFT JOIN product_content pc ON pc.product_id=p.id
      WHERE ${NEW_COND}${extra}
      ORDER BY p.in_stock DESC, p.id DESC LIMIT ?`).bind(...eb, limit).all()).results || [];

  const items = rows.map(r => {
    const need = [];
    if (!r.descr) need.push('description');
    if (!r.kw) need.push('keywords');
    if (!r.md) need.push('meta_description');
    const o = { sku: r.sku, name: r.name, need };
    if (r.category) o.category = r.category;
    if (r.brand) o.brand = r.brand;
    if (r.attrs) { try { const a = JSON.parse(r.attrs); if (a && typeof a === 'object' && Object.keys(a).length) o.attributes = a; } catch (e) { /* кривий JSON не потрапляє в промпт */ } }
    if (r.descr) o.description = r.descr.slice(0, 1200);   // уже є опис → LLM бере його для keywords/meta_description
    return o;
  });
  return new Response(JSON.stringify(items, null, 1), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-total-remaining': String(rows.length ? Number(rows[0].total) | 0 : 0)
    }
  });
}

// ── Нормалізація полів відповіді LLM ─────────────────────────────────────────
function cleanMeta(s) {
  let t = String(s == null ? '' : s)
    .replace(/<[^>]*>/g, ' ')            // HTML
    .replace(/\*\*|__|`/g, '')           // markdown-виділення
    .replace(/^[\s#>\-*]+/, '')          // маркери на початку
    .replace(/\s+/g, ' ').trim();
  if (t.length > 1 && /^["«“'].*["»”']$/.test(t)) t = t.slice(1, -1).trim();   // обгортка лапками
  return t.slice(0, MAX_MD);
}
function cleanKeywords(v) {
  const t = Array.isArray(v) ? v.map(x => String(x == null ? '' : x).trim()).filter(Boolean).join(', ') : String(v == null ? '' : v);
  return t.replace(/\s+/g, ' ').trim().slice(0, MAX_KW);
}
// Опис зберігає markdown: переноси рядків лишаються, чиститься лише HTML і зайві пробіли/порожні рядки.
function cleanDesc(v) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_DESC);
}

// Відповідь LLM → масив { id, description, keywords, meta_description }. Лише JSON; терпимий до ```-обгортки і тексту навколо.
function parseRecords(text) {
  let raw = String(text || '').replace(/^﻿/, '').trim();
  raw = raw.replace(/^```[\w]*[\r\n]+/m, '').replace(/[\r\n]+```\s*$/m, '').trim();
  if (raw[0] !== '[' && raw[0] !== '{') {
    const a = raw.indexOf('['), b = raw.lastIndexOf(']');
    if (a !== -1 && b > a) raw = raw.slice(a, b + 1);
  }
  let arr = JSON.parse(raw);
  if (!Array.isArray(arr)) arr = [arr];
  return arr.filter(r => r && typeof r === 'object').map(r => ({
    id: String(r.sku ?? r.id ?? r.name ?? '').trim(),
    description: cleanDesc(r.description ?? r.annotation ?? r.text),
    keywords: cleanKeywords(r.keywords ?? r.keyword ?? r.kw),
    meta_description: cleanMeta(r.meta_description ?? r.meta_desc ?? r.seo_description ?? r.seo_desc),
  }));
}

// М'які попередження (не блокують заливку)
function warnings(f) {
  const w = [];
  if (f.description != null) { if (f.description.length < 150) w.push('опис короткий (' + f.description.length + ')'); else if (f.description.length > 1500) w.push('опис дуже довгий (' + f.description.length + ')'); }
  if (f.meta_description != null && (f.meta_description.length < 90 || f.meta_description.length > 170)) w.push('meta description ' + f.meta_description.length + ' симв. (норма 120–160)');
  if (f.keywords != null && f.keywords.split(/[,\s]+/).filter(Boolean).length < 5) w.push('мало ключових слів');
  return w;
}

// ── POST: перевірка / заливка ────────────────────────────────────────────────
export async function onRequestPost(context) {
  const db = context.env.koshyk_db;
  const dry = new URL(context.request.url).searchParams.get('dryrun') === '1';

  // Basic Auth браузер підставляє автоматично, а text/plain-POST — «простий» запит: блокуємо чужі сайти.
  const sfs = context.request.headers.get('Sec-Fetch-Site');
  if (sfs && sfs !== 'same-origin' && sfs !== 'none') return json({ ok: false, error: 'Заборонено (cross-site)' }, 403);

  let recs;
  try { recs = parseRecords(await context.request.text()); }
  catch (e) { return json({ ok: false, error: 'Не вдалося розпарсити JSON: ' + e.message }, 400); }
  if (!recs.length) return json({ ok: false, error: 'Порожньо' }, 400);

  const ex = (await db.prepare(
    `SELECT p.id AS pid, p.sku, p.name,
            COALESCE(pc.description,'') descr, COALESCE(pc.keywords,'') kw, COALESCE(pc.meta_description,'') md
       FROM products p LEFT JOIN product_content pc ON pc.product_id=p.id`).all()).results || [];
  const bySku = new Map(), byName = new Map(), info = new Map();
  const nkey = s => String(s || '').trim().toLowerCase();
  const push = (m, k, pid) => { const a = m.get(k); if (a) a.push(pid); else m.set(k, [pid]); };
  for (const r of ex) {
    info.set(r.pid, r);
    if (r.sku) push(bySku, r.sku.trim(), r.pid);
    const k = nkey(r.name); if (k) push(byName, k, r.pid);
  }

  // Захист «лише порожні» — у самому SQL: навіть якщо між перевіркою і заливкою хтось вписав текст, він не буде затертий.
  const Up = db.prepare(
    `INSERT INTO product_content(product_id, description, keywords, meta_description, seo_updated_at) VALUES(?,?,?,?,datetime('now'))
     ON CONFLICT(product_id) DO UPDATE SET
       description      = CASE WHEN COALESCE(product_content.description,'')=''      THEN excluded.description      ELSE product_content.description END,
       keywords         = CASE WHEN COALESCE(product_content.keywords,'')=''         THEN excluded.keywords         ELSE product_content.keywords END,
       meta_description = CASE WHEN COALESCE(product_content.meta_description,'')='' THEN excluded.meta_description ELSE product_content.meta_description END,
       seo_updated_at   = datetime('now')`);

  const stmts = [], matched = [], unmatchedList = [], ambiguous = [];
  const filled = { description: 0, keywords: 0, meta_description: 0 };
  const kept = { description: 0, keywords: 0, meta_description: 0 };
  let willUpdate = 0, nothingNew = 0, unmatched = 0, empty = 0;
  const seen = new Set();

  for (const rec of recs) {
    if (!rec.description && !rec.keywords && !rec.meta_description) { empty++; continue; }
    const id = rec.id;
    if (!id) { unmatched++; unmatchedList.push('(порожній sku)'); continue; }
    let pids = bySku.get(id);
    if (!pids) pids = byName.get(nkey(id));
    if (!pids || !pids.length) { unmatched++; if (unmatchedList.length < 200) unmatchedList.push(id); continue; }
    if (pids.length > 1) { ambiguous.push({ id, names: pids.map(p => (info.get(p) || {}).name) }); continue; }
    const pid = pids[0];
    if (seen.has(pid)) continue;
    seen.add(pid);
    const cur = info.get(pid) || {};
    const curOf = { description: cur.descr, keywords: cur.kw, meta_description: cur.md };

    const fill = {}, keep = [];
    for (const f of FIELDS) {
      if (!rec[f]) continue;
      if (curOf[f]) { keep.push(f); kept[f]++; } else { fill[f] = rec[f]; filled[f]++; }
    }
    if (!Object.keys(fill).length) { nothingNew++; continue; }
    willUpdate++;
    if (matched.length < 80) matched.push({
      sku: cur.sku || '—', n: cur.name || '',
      fills: Object.keys(fill), kept: keep,
      preview: {
        description: fill.description ? fill.description.replace(/\s+/g, ' ').slice(0, 110) + (fill.description.length > 110 ? '…' : '') : '',
        keywords: fill.keywords || '',
        meta_description: fill.meta_description || '',
      },
      len: { description: (fill.description || '').length, meta_description: (fill.meta_description || '').length },
      warn: warnings(fill),
    });
    if (!dry) stmts.push(Up.bind(pid, fill.description || '', fill.keywords || '', fill.meta_description || ''));
  }

  const cap = (a, n) => ({ total: a.length, sample: a.slice(0, n) });
  const payload = {
    ok: true, dryrun: dry, total: recs.length,
    willUpdate, filled, kept, nothingNew, unmatched, empty,
    matched: cap(matched, 50),
    unmatchedList: cap(unmatchedList, 30),
    ambiguous: cap(ambiguous, 30),
  };
  if (dry) return json(payload);
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  return json(payload);
}

// ── GET: сторінка / експорт ──────────────────────────────────────────────────
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const db = context.env.koshyk_db;
  if (url.searchParams.get('export') === '1') return exportNew(db, url);

  // Лічильники одним запитом: нові товари загалом і по розділах
  let stats = null, statsErr = '';
  try {
    const rows = (await db.prepare(
      `SELECT c.slug AS slug, c.name_uk AS cat,
              SUM(CASE WHEN ${NEW_COND} THEN 1 ELSE 0 END) AS nnew,
              SUM(CASE WHEN ${EMPTY('description')} THEN 1 ELSE 0 END) AS noa,
              SUM(CASE WHEN ${EMPTY('keywords')} THEN 1 ELSE 0 END) AS nokw,
              SUM(CASE WHEN ${EMPTY('meta_description')} THEN 1 ELSE 0 END) AS nomd
         FROM products p
         JOIN categories c ON c.id=p.category_id
         LEFT JOIN product_content pc ON pc.product_id=p.id
        GROUP BY c.id`).all()).results || [];
    stats = { nnew: 0, noa: 0, nokw: 0, nomd: 0, cats: [] };
    for (const r of rows) {
      stats.nnew += r.nnew | 0; stats.noa += r.noa | 0; stats.nokw += r.nokw | 0; stats.nomd += r.nomd | 0;
      if ((r.nnew | 0) > 0) stats.cats.push({ slug: r.slug, cat: r.cat, n: r.nnew | 0 });
    }
    stats.cats.sort((a, b) => a.cat.localeCompare(b.cat, 'uk'));
  } catch (e) { statsErr = String(e && e.message || e); }

  const catOpts = stats ? stats.cats.map(c => `<option value="${escA(c.slug)}">${escA(c.cat)} (${c.n})</option>`).join('') : '';
  const summary = stats
    ? (stats.nnew
        ? `Нових товарів: <b>${stats.nnew}</b> <span class=muted>(без опису: ${stats.noa} · без ключових слів: ${stats.nokw} · без SEO description: ${stats.nomd})</span>`
        : '🎉 Нових товарів немає: усі мають опис, ключові слова й SEO description.')
    : `<span style="color:#C8462E">Не вдалося порахувати: ${escA(statsErr)}</span>`;

  return new Response(`<!DOCTYPE html><html lang=uk><head><meta charset=UTF-8>
<meta name=viewport content="width=device-width, initial-scale=1.0"><meta name=robots content=noindex>
<title>Нові товари — Ощадний Кошик</title><style>
:root{--paper:#EBE7DB;--card:#FFFDF7;--ink:#23271F;--ink-soft:#565A4E;--red:#C8462E;--green:#33604A;--green-deep:#244A39;--line:rgba(35,39,31,.14)}
body{font-family:Manrope,system-ui,sans-serif;max-width:860px;margin:1.5rem auto;padding:1rem;color:var(--ink);background:var(--paper)}
a{color:var(--green-deep)} h2{color:var(--green-deep)} .btn{background:var(--green);color:var(--card);border:0;padding:11px 20px;border-radius:100px;cursor:pointer;font-weight:700}
.btn:hover{background:var(--green-deep)} .btn:disabled{background:#aaa;cursor:not-allowed}
textarea{width:100%;box-sizing:border-box;min-height:160px;border:1.5px solid var(--line);border-radius:10px;padding:10px;font-family:ui-monospace,monospace;font-size:.85rem;background:var(--card)}
.muted{color:var(--ink-soft);font-size:.85rem} .box{background:var(--card);border:1.5px solid var(--line);border-radius:12px;padding:14px;margin:12px 0}
.num{width:72px;padding:5px;border:1.5px solid var(--line);border-radius:8px} select{padding:5px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper)}
</style></head><body>
<div><a href="/admin">← до адмінки</a></div>
<h2>🆕 Нові товари: опис + ключові слова + SEO description</h2>
<p>${summary}</p>
<p class=muted>Усі три тексти за один прохід. Заповнюються <b>лише порожні</b> поля: вже наявні тексти не перезаписуються
(для перезапису є «Масова заливка»). Чіпає лише ці три поля; ціна, наявність і фото не змінюються.</p>

<div class=box>
  <b>Крок 1 · Підготувати завдання для LLM</b><br>
  <label class=muted style="display:inline-block;margin:8px 8px 0 0">за раз: <input type=number id=n value=30 min=1 max=100 class=num></label>
  <label class=muted style="display:inline-block;margin:8px 8px 0 0">розділ: <select id=cat><option value="">усі</option>${catOpts}</select></label><br>
  <button class=btn id=prep onclick="prepare()" style="margin-top:8px">📋 Скопіювати промпт + нові товари</button>
  <span id=ps class=muted></span>
  <div id=taskbox style="display:none;margin-top:8px">
    <div class=muted>Не скопіювалось автоматично? Виділіть усе в полі нижче й скопіюйте. Вставте в Claude / ChatGPT / Gemini.</div>
    <textarea id=task readonly style="min-height:120px"></textarea>
  </div>
  <details style="margin-top:8px"><summary class=muted style="cursor:pointer">Показати промпт</summary>
    <textarea id=prompt readonly style="min-height:300px;margin-top:6px">${escA(PROMPT)}</textarea></details>
</div>

<p style="margin:12px 0 4px"><b>Крок 2 · Вставте відповідь LLM</b> <span class=muted>(JSON-масив; обгортку \`\`\` можна лишати)</span></p>
<p><textarea id=ta placeholder='[{"sku":"00-12345","description":"…","keywords":"…","meta_description":"…"}]'></textarea></p>
<p><b>Крок 3 ·</b> <button class=btn id=chk onclick="verify()">Перевірити</button>
   <button class=btn id=imp onclick="run()" disabled>Залити</button> <span id=s></span></p>
<div id=o class=box>Вставте відповідь LLM і натисніть «Перевірити».</div>

<script>
var $=function(id){return document.getElementById(id);};
var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
var NL=String.fromCharCode(10);
$('ta').oninput=function(){$('imp').disabled=true;};
async function prepare(){
  var n=Math.max(1,Math.min(100,parseInt($('n').value||'30',10)));
  var cat=$('cat').value;
  $('ps').textContent='готую…';
  var r=await fetch('/admin/newproducts?export=1&limit='+n+(cat?'&cat='+encodeURIComponent(cat):''));
  if(!r.ok){$('ps').textContent='помилка '+r.status;return;}
  var remaining=r.headers.get('x-total-remaining')||'0';
  var txt=await r.text(), items=[];
  try{items=JSON.parse(txt);}catch(e){}
  if(!items.length){$('ps').textContent='🎉 нових товарів немає';return;}
  var task=$('prompt').value.replace(/\\s+$/,'')+NL+NL+txt;
  $('task').value=task; $('taskbox').style.display='none';
  var done=function(){$('ps').textContent='✅ скопійовано: '+items.length+' товарів (усього нових: '+remaining+'). Вставте в LLM → відповідь у Крок 2.';};
  var fail=function(){$('taskbox').style.display='block';$('task').select();$('ps').textContent='⚠️ скопіюйте вручну з поля нижче ('+items.length+' товарів, усього нових: '+remaining+')';};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(task).then(done,fail);}else{fail();}
}
async function post(dry){
  var r=await fetch('/admin/newproducts'+(dry?'?dryrun=1':''),{method:'POST',headers:{'content-type':'text/plain'},body:$('ta').value});
  return {ok:r.ok,data:await r.json().catch(function(){return {ok:false,error:'не JSON (HTTP '+r.status+')'};})};
}
var LBL={description:'опис',keywords:'ключові слова',meta_description:'SEO description'};
function sect(title,obj,fmt){
  if(!obj||!obj.total) return '';
  var rows=(obj.sample||[]).map(fmt).join('');
  var more=obj.total>(obj.sample||[]).length?'<div class=muted>…ще '+(obj.total-obj.sample.length)+'</div>':'';
  return '<details'+(obj.total<=12?' open':'')+' style="margin:6px 0;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:6px 10px"><summary style="cursor:pointer;font-weight:700">'+title+': '+obj.total+'</summary><div style="margin:6px 0 4px;font-size:.86rem;line-height:1.5">'+rows+more+'</div></details>';
}
function render(d,dry){
  if(!d||!d.ok) return '<div style="color:#C8462E">❌ '+esc(d&&d.error||'помилка')+'</div>';
  var h='<div style="background:#E3EDE5;padding:10px;border-radius:8px;margin-bottom:8px"><b>'+(dry?'🔎 Перевірка':'✅ Залито')+'</b> — записів у відповіді: '+d.total+'<br>'
    +'✅ '+(dry?'буде оновлено':'оновлено')+' товарів: <b>'+d.willUpdate+'</b> <span class=muted>(опис: '+d.filled.description+' · ключові слова: '+d.filled.keywords+' · SEO description: '+d.filled.meta_description+')</span><br>'
    +((d.kept.description+d.kept.keywords+d.kept.meta_description)?'🔒 вже були заповнені й лишились як є: опис '+d.kept.description+' · ключові слова '+d.kept.keywords+' · SEO description '+d.kept.meta_description+'<br>':'')
    +(d.nothingNew?'⏭ нічого нового (усе вже заповнено): <b>'+d.nothingNew+'</b> &nbsp; ':'')
    +'❓ не знайдено: <b>'+d.unmatched+'</b> &nbsp; ⛔ порожні записи: <b>'+d.empty+'</b></div>';
  h+=sect('✅ Що буде записано',d.matched,function(x){
    var warn=(x.warn&&x.warn.length)?' <span style="color:#b8860b">⚠️ '+esc(x.warn.join('; '))+'</span>':'';
    var kept=(x.kept&&x.kept.length)?' <span class=muted>🔒 лишено: '+x.kept.map(function(f){return LBL[f];}).join(', ')+'</span>':'';
    var l='<div style="margin-bottom:8px;border-bottom:1px solid var(--line);padding-bottom:6px"><b>'+esc(x.sku)+'</b> · '+esc(x.n)+' — заповниться: '+x.fills.map(function(f){return LBL[f];}).join(', ')+kept+warn;
    if(x.preview.description) l+='<div>📝 ('+x.len.description+') '+esc(x.preview.description)+'</div>';
    if(x.preview.keywords) l+='<div>🔑 '+esc(x.preview.keywords)+'</div>';
    if(x.preview.meta_description) l+='<div>🔍 ('+x.len.meta_description+') '+esc(x.preview.meta_description)+'</div>';
    return l+'</div>';
  });
  h+=sect('❓ Не знайдено (sku з відповіді нема в базі)',d.unmatchedList,function(x){return '<div>'+esc(x)+'</div>';});
  h+=sect('⚠️ Неоднозначні (sku збігається з кількома товарами)',d.ambiguous,function(x){return '<div><b>'+esc(x.id)+'</b>: '+esc((x.names||[]).join('  |  '))+'</div>';});
  return h;
}
async function verify(){
  if(!$('ta').value.trim()){alert('Вставте відповідь LLM');return;}
  $('s').textContent='перевірка…'; var res=await post(true); $('s').textContent='';
  $('o').innerHTML=render(res.data,true);
  $('imp').disabled=!(res.ok&&res.data.ok&&res.data.willUpdate>0);
}
async function run(){
  $('s').textContent='заливка…'; $('imp').disabled=true;
  var res=await post(false); $('s').textContent=res.ok&&res.data.ok?'✅ Готово':'❌ Помилка';
  $('o').innerHTML=render(res.data,false);
}
</script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
