// ============================================================
//  db.js — MC Store Frontend Database Client
//
//  PRODUCTS  → fetched directly from Supabase (anon key, public, safe)
//  CART / WISHLIST / REVIEWS / ORDERS → routed through /api/supabase
//    (server keeps the service_role key hidden in env vars)
// ============================================================

const SB_URL  = "https://kswikkoqfpyxuurzxail.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd2lra29xZnB5eHV1cnp4YWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEzMDQsImV4cCI6MjA4NjkzNzMwNH0.uuoSKWOTeXot1HJys0EO9OcIRBL0mKrNHIUHIAPCpZ4";
// ↑ anon key is SAFE in browser — it's public read-only
//   Supabase themselves say: "safe to use in a browser"

// ─────────────────────────────────────────
//  DIRECT Supabase fetch — for public reads
//  (products only — no sensitive data)
// ─────────────────────────────────────────
async function sbRead(endpoint) {
  const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
    headers: {
      apikey:        SB_ANON,
      Authorization: `Bearer ${SB_ANON}`
    }
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// ─────────────────────────────────────────
//  SERVER route — for user writes
//  Cart, wishlist, reviews, orders go here
//  Keys stay on server in Vercel env vars
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

// ─────────────────────────────────────────
//  Normalise product fields
// ─────────────────────────────────────────
function normalise(p) {
  if (!p) return p;
  const name      = p.name || p.title || 'Unnamed Product';
  const image_url = p.image_url
    || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null)
    || p.image || null;
  const price    = Number(p.price) || 0;
  const promo    = p.promo_price ? Number(p.promo_price) : 0;
  const hasPromo = promo > 0 && promo < price;
  return {
    ...p, name, image_url,
    display_price:  hasPromo ? promo : price,
    original_price: hasPromo ? price : null
  };
}


// ============================================================
//  ── PRODUCTS — direct Supabase (anon key, always works) ──
// ============================================================

export async function db_getProducts({ category, section, search, limit } = {}) {
  try {
    let q = 'products?select=*&is_active=eq.true&order=created_at.desc';
    if (category) q += `&category=eq.${encodeURIComponent(category)}`;
    if (section)  q += `&section=eq.${encodeURIComponent(section)}`;
    if (search)   q += `&name=ilike.${encodeURIComponent('%' + search + '%')}`;
    if (limit)    q += `&limit=${limit}`;
    const rows = await sbRead(q);
    return (rows || []).map(normalise);
  } catch(e) {
    console.error('db_getProducts:', e);
    return [];
  }
}

export async function db_getProductById(id) {
  try {
    const rows = await sbRead(`products?select=*&id=eq.${id}`);
    return rows && rows.length > 0 ? normalise(rows[0]) : null;
  } catch(e) {
    console.error('db_getProductById:', e);
    return null;
  }
}


// ============================================================
//  ── CART — server route ──
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
//  ── WISHLIST — server route ──
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
//  ── REVIEWS — server route ──
// ============================================================

export async function db_getReviews(productId) {
  // Reviews are public — read directly
  try {
    const rows = await sbRead(
      `reviews?select=*&product_id=eq.${productId}&order=created_at.desc`
    );
    return rows || [];
  } catch(e) {
    console.error('db_getReviews:', e);
    return [];
  }
}

export async function db_addReview({ uid, productId, userName, rating, comment }) {
  return await api('addReview', { uid, productId, userName, rating, comment });
}


// ============================================================
//  ── ORDERS — server route ──
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

export function sid(id) {
  return id === null || id === undefined ? '' : String(id);
}
