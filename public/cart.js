// Спільний модуль кошика замовлень.
// Кошик зберігається в localStorage (це реальний сайт у браузері
// користувача, а не Claude-артефакт — тут localStorage можна).
// Підключати на кожній сторінці: <script src="/cart.js"></script>

(function () {
  var CART_KEY = "koshyk_cart_v1";

  function getCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    renderBadge();
  }

  function addToCart(product, qty) {
    qty = qty || 1;
    var items = getCart();
    var existing = items.find(function (i) { return i.id === product.id; });
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        id: product.id,
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        price: product.price,
        qty: qty,
      });
    }
    saveCart(items);
    return items;
  }

  function removeFromCart(id) {
    var items = getCart().filter(function (i) { return i.id !== id; });
    saveCart(items);
    return items;
  }

  function updateQty(id, qty) {
    var items = getCart();
    var item = items.find(function (i) { return i.id === id; });
    if (item) {
      item.qty = Math.max(1, qty);
    }
    saveCart(items);
    return items;
  }

  function clearCart() {
    saveCart([]);
  }

  function cartCount() {
    return getCart().reduce(function (sum, i) { return sum + i.qty; }, 0);
  }

  function cartTotal() {
    return getCart().reduce(function (sum, i) { return sum + i.qty * i.price; }, 0);
  }

  function renderBadge() {
    var badge = document.getElementById("cartBadge");
    if (!badge) return;
    var count = cartCount();
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-flex" : "none";
  }

  window.KoshykCart = {
    getCart: getCart,
    addToCart: addToCart,
    removeFromCart: removeFromCart,
    updateQty: updateQty,
    clearCart: clearCart,
    cartCount: cartCount,
    cartTotal: cartTotal,
    renderBadge: renderBadge,
  };

  document.addEventListener("DOMContentLoaded", renderBadge);
})();
