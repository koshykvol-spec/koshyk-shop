// functions/_lib/synonyms.js
// Розширення пошукового запиту синонімами з таблиці search_synonyms
// (напр. "гумка" -> "резинка для волосся"), щоб розмовні/побутові
// слова теж знаходили товари, названі в каталозі формальніше.
// Файл під "_lib" — Cloudflare Pages не трактує його як маршрут
// (той самий принцип, що й у admin/_middleware.js).

export async function expandWithSynonyms(db, qLower) {
  const { results } = await db
    .prepare("SELECT synonym FROM search_synonyms WHERE term = ?")
    .bind(qLower)
    .all();
  return results.map((r) => (r.synonym || "").toLowerCase()).filter(Boolean);
}

// Будує "(p.name_lower LIKE ? OR p.sku_lower LIKE ? [OR p.name_lower LIKE ? ...])"
// разом із відповідними bindings — основний запит + всі знайдені синоніми.
// SKU навмисно не розширюється синонімами (це не про побутові слова).
export function buildNameSkuClause(qLower, synonymTerms) {
  const clauses = ["p.name_lower LIKE ?", "p.sku_lower LIKE ?"];
  const bindings = [`%${qLower}%`, `%${qLower}%`];
  synonymTerms.forEach((syn) => {
    clauses.push("p.name_lower LIKE ?");
    bindings.push(`%${syn}%`);
  });
  return { clause: `(${clauses.join(" OR ")})`, bindings };
}
