// functions/_lib/catalog-query.js
// Спільна логіка запиту товарів категорії (фільтри + фасети), якою
// користуються і /api/catalog/:slug (клієнтські фільтри/пагінація),
// і functions/catalog/[slug].js (серверний рендер першої сторінки —
// щоб не дублювати SQL у двох місцях і не розходитись з часом).

const DEFAULT_PER_PAGE = 24;
const ALLOWED_PER_PAGE = new Set([12, 24, 48, 96]);
const CLOTHING_SLUGS = new Set(["odyah", "vzuttya"]);

export function parseCatalogFilters(searchParams) {
  const brandsParam = searchParams.get("brands");
  const brandList = brandsParam ? brandsParam.split(",").map((b) => b.trim()).filter(Boolean) : [];
  const perPageRaw = parseInt(searchParams.get("perPage") || String(DEFAULT_PER_PAGE), 10);

  return {
    brandList,
    minPrice: searchParams.get("minPrice"),
    maxPrice: searchParams.get("maxPrice"),
    gender: searchParams.get("gender"),
    ageGroup: searchParams.get("ageGroup"),
    sort: searchParams.get("sort") || "name",
    page: Math.max(1, parseInt(searchParams.get("page") || "1", 10)),
    perPage: ALLOWED_PER_PAGE.has(perPageRaw) ? perPageRaw : DEFAULT_PER_PAGE,
    inStockOnly: searchParams.get("inStockOnly") === "1",
  };
}

export function defaultCatalogFilters() {
  return {
    brandList: [],
    minPrice: null,
    maxPrice: null,
    gender: null,
    ageGroup: null,
    sort: "name",
    page: 1,
    perPage: DEFAULT_PER_PAGE,
    inStockOnly: false,
  };
}

export async function queryCatalog(db, category, filters, slug) {
  const { brandList, minPrice, maxPrice, gender, ageGroup, sort, page, perPage, inStockOnly } = filters;

  const where = ["p.category_id = ?"];
  const bindings = [category.id];

  if (brandList.length) {
    where.push(`p.brand IN (${brandList.map(() => "?").join(",")})`);
    bindings.push(...brandList);
  }
  if (minPrice) {
    where.push("p.price >= ?");
    bindings.push(Number(minPrice));
  }
  if (maxPrice) {
    where.push("p.price <= ?");
    bindings.push(Number(maxPrice));
  }
  if (gender) {
    where.push("json_extract(pc.attributes_json, '$.gender') = ?");
    bindings.push(gender);
  }
  if (ageGroup) {
    where.push("json_extract(pc.attributes_json, '$.age_group') = ?");
    bindings.push(ageGroup);
  }
  if (inStockOnly) {
    where.push("p.in_stock = 1");
  }

  const whereClause = where.join(" AND ");

  let orderBy = "p.name ASC";
  if (sort === "price_asc") orderBy = "p.price ASC";
  if (sort === "price_desc") orderBy = "p.price DESC";

  const offset = (page - 1) * perPage;

  const productsSql = `
    SELECT p.id, p.sku, p.name, p.slug, p.price, p.brand, p.in_stock,
           p.has_real_photo, p.image_url,
           pc.attributes_json
    FROM products p
    LEFT JOIN product_content pc ON pc.product_id = p.id
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const { results: products } = await db
    .prepare(productsSql)
    .bind(...bindings, perPage, offset)
    .all();

  const countSql = `
    SELECT COUNT(*) as total
    FROM products p
    LEFT JOIN product_content pc ON pc.product_id = p.id
    WHERE ${whereClause}
  `;
  const countRow = await db.prepare(countSql).bind(...bindings).first();
  const total = countRow ? countRow.total : 0;

  // --- Фасети для фільтрів UI ---
  const { results: brandRows } = await db
    .prepare(
      "SELECT DISTINCT brand FROM products WHERE category_id = ? AND brand IS NOT NULL AND brand != '' ORDER BY brand"
    )
    .bind(category.id)
    .all();
  const brands = brandRows.map((r) => r.brand);

  let genders = [];
  let ageGroups = [];
  if (CLOTHING_SLUGS.has(slug)) {
    const { results: genderRows } = await db
      .prepare(
        `SELECT DISTINCT json_extract(pc.attributes_json, '$.gender') as g
         FROM products p JOIN product_content pc ON pc.product_id = p.id
         WHERE p.category_id = ? AND g IS NOT NULL`
      )
      .bind(category.id)
      .all();
    genders = genderRows.map((r) => r.g);

    const { results: ageRows } = await db
      .prepare(
        `SELECT DISTINCT json_extract(pc.attributes_json, '$.age_group') as a
         FROM products p JOIN product_content pc ON pc.product_id = p.id
         WHERE p.category_id = ? AND a IS NOT NULL`
      )
      .bind(category.id)
      .all();
    ageGroups = ageRows.map((r) => r.a);
  }

  const priceRow = await db
    .prepare("SELECT MIN(price) as min, MAX(price) as max FROM products WHERE category_id = ?")
    .bind(category.id)
    .first();

  return {
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      price: p.price,
      brand: p.brand,
      inStock: !!p.in_stock,
      hasRealPhoto: !!p.has_real_photo,
      imageUrl: p.image_url,
      attributes: p.attributes_json ? JSON.parse(p.attributes_json) : null,
    })),
    facets: {
      brands,
      genders,
      ageGroups,
      priceMin: priceRow ? priceRow.min : 0,
      priceMax: priceRow ? priceRow.max : 0,
    },
  };
}
