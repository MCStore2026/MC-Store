// ============================================================
//  db.js — MC Store Frontend Database Client
//  NO KEYS HERE. All calls go to /api/db (Vercel serverless).
//  Keys live safely in Vercel environment variables.
// ============================================================

// ─────────────────────────────────────────
//  ONE FUNCTION — calls /api/db on the server
// ─────────────────────────────────────────
async function api(action, payload = {}) {
  const res = await fetch('/api/supabase', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, payload })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Server error');
  return json.data;
}


// ============================================================
//  ── PRODUCTS ──
// ============================================================

export async function db_getProducts(opts = {}) {
  return await api('getProducts', opts);
}

export async function db_getProductById(id) {
  return await api('getProductById', { id });
}


// ============================================================
//  ── CART ──
// ============================================================

export async function db_getCart(uid) {
  return await api('getCart', { uid });
}

export async function db_addToCart(uid, product, quantity = 1) {
  return await api('addToCart', { uid, product, quantity });
}

export async function db_updateCartQty(uid, productId, quantity) {
  return await api('updateCartQty', { uid, productId, quantity });
}

export async function db_removeFromCart(uid, productId) {
  return await api('removeFromCart', { uid, productId });
}

export async function db_clearCart(uid) {
  return await api('clearCart', { uid });
}

export async function db_getCartCount(uid) {
  return await api('getCartCount', { uid });
}


// ============================================================
//  ── WISHLIST ──
// ============================================================

export async function db_getWishlist(uid) {
  return await api('getWishlist', { uid });
}

export async function db_addToWishlist(uid, product) {
  return await api('addToWishlist', { uid, product });
}

export async function db_removeFromWishlist(uid, productId) {
  return await api('removeFromWishlist', { uid, productId });
}

export async function db_isInWishlist(uid, productId) {
  const res = await api('isInWishlist', { uid, productId });
  return res?.result === true;
}

export async function db_getWishlistCount(uid) {
  return await api('getWishlistCount', { uid });
}


// ============================================================
//  ── REVIEWS ──
// ============================================================

export async function db_getReviews(productId) {
  return await api('getReviews', { productId });
}

export async function db_addReview({ uid, productId, userName, rating, comment }) {
  return await api('addReview', { uid, productId, userName, rating, comment });
}


// ============================================================
//  ── ORDERS ──
// ============================================================

export async function db_placeOrder(orderData) {
  return await api('placeOrder', { orderData });
}

export async function db_getMyOrders(uid, limit = 50) {
  return await api('getMyOrders', { uid, limit });
}

export async function db_getAllOrders(limit = 200) {
  return await api('getAllOrders', { limit });
}

export async function db_updateOrderStatus(orderId, status) {
  return await api('updateOrderStatus', { orderId, status });
}


// ============================================================
//  ── UTILS ──
// ============================================================

// Normalise product IDs — always compare as strings
export function sid(id) {
  return id === null || id === undefined ? '' : String(id);
}
