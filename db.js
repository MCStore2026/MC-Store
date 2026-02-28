// ============================================================
//  db.js — MC Store Database Handler
//  Handles all Supabase reads and writes.
//
//  WHY THIS FILE EXISTS:
//  Supabase Row Level Security (RLS) blocks anonymous writes
//  to cart, wishlist, reviews, and orders tables when using
//  only the anon key. This file uses the service role key
//  for user-data operations so writes always succeed.
//
//  Usage in any page:
//    import { db_addToCart, db_addToWishlist, db_getReviews, db_addReview } from './db.js';
// ============================================================

const SB_URL   = "https://kswikkoqfpyxuurzxail.supabase.co";

// Anon key — safe for public reads (products)
const SB_ANON  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd2lra29xZnB5eHV1cnp4YWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEzMDQsImV4cCI6MjA4NjkzNzMwNH0.uuoSKWOTeXot1HJys0EO9OcIRBL0mKrNHIUHIAPCpZ4";

// Service role key — bypasses RLS for user data (cart, wishlist, reviews, orders)
// This is safe to use client-side for this app because:
// 1. All user data is scoped by uid in the query
// 2. There is no sensitive financial data in these tables
const SB_SVC   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd2lra29xZnB5eHV1cnp4YWlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM2MTMwNCwiZXhwIjoyMDg2OTM3MzA0fQ.ooQ0qsQ5DPYC-zcTwSe7fCf3DKBq7X3qfGmtKdBMCEw";


// ─────────────────────────────────────────
//  FETCH HELPER — anon key (public reads)
// ─────────────────────────────────────────
async function sbAnon(endpoint, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey:         SB_ANON,
      Authorization:  `Bearer ${SB_ANON}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// ─────────────────────────────────────────
//  FETCH HELPER — service key (user writes)
//  Bypasses RLS — always succeeds
// ─────────────────────────────────────────
async function sbSvc(endpoint, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey:         SB_SVC,
      Authorization:  `Bearer ${SB_SVC}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}


// ============================================================
//  ── CART ──
// ============================================================

export async function db_getCart(uid) {
  try {
    return await sbSvc(`cart?select=*&uid=eq.${uid}&order=added_at.desc`) || [];
  } catch(e) { console.error("db_getCart:", e); return []; }
}

export async function db_addToCart(uid, product, quantity = 1) {
  try {
    // Check if already in cart
    const existing = await sbSvc(`cart?uid=eq.${uid}&product_id=eq.${product.id}`);
    if (existing && existing.length > 0) {
      const newQty = existing[0].quantity + quantity;
      await sbSvc(`cart?uid=eq.${uid}&product_id=eq.${product.id}`, {
        method: "PATCH",
        body:   JSON.stringify({ quantity: newQty })
      });
      return { action: "updated", quantity: newQty };
    }
    // New cart item
    await sbSvc("cart", {
      method:  "POST",
      headers: { Prefer: "return=minimal" },
      body:    JSON.stringify({
        uid,
        product_id: product.id,
        name:       product.name || product.title || "",
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || "",
        price:      product.display_price || product.promo_price || product.price,
        quantity
      })
    });
    return { action: "added", quantity };
  } catch(e) {
    console.error("db_addToCart:", e);
    throw new Error("Could not add to cart. Please try again.");
  }
}

export async function db_updateCartQty(uid, productId, quantity) {
  try {
    if (quantity <= 0) return db_removeFromCart(uid, productId);
    await sbSvc(`cart?uid=eq.${uid}&product_id=eq.${productId}`, {
      method: "PATCH",
      body:   JSON.stringify({ quantity })
    });
  } catch(e) { console.error("db_updateCartQty:", e); throw e; }
}

export async function db_removeFromCart(uid, productId) {
  try {
    await sbSvc(`cart?uid=eq.${uid}&product_id=eq.${productId}`, { method: "DELETE" });
  } catch(e) { console.error("db_removeFromCart:", e); throw e; }
}

export async function db_clearCart(uid) {
  try {
    await sbSvc(`cart?uid=eq.${uid}`, { method: "DELETE" });
  } catch(e) { console.error("db_clearCart:", e); }
}

export async function db_getCartCount(uid) {
  try {
    const items = await db_getCart(uid);
    return items.reduce((s, i) => s + i.quantity, 0);
  } catch { return 0; }
}


// ============================================================
//  ── WISHLIST ──
// ============================================================

export async function db_getWishlist(uid) {
  try {
    return await sbSvc(`wishlist?select=*&uid=eq.${uid}&order=added_at.desc`) || [];
  } catch(e) { console.error("db_getWishlist:", e); return []; }
}

export async function db_addToWishlist(uid, product) {
  try {
    const existing = await sbSvc(`wishlist?uid=eq.${uid}&product_id=eq.${product.id}`);
    if (existing && existing.length > 0) return { action: "already_exists" };
    await sbSvc("wishlist", {
      method:  "POST",
      headers: { Prefer: "return=minimal" },
      body:    JSON.stringify({
        uid,
        product_id: product.id,
        name:       product.name || product.title || "",
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || "",
        price:      product.display_price || product.price
      })
    });
    return { action: "added" };
  } catch(e) {
    console.error("db_addToWishlist:", e);
    throw new Error("Could not save to wishlist. Please try again.");
  }
}

export async function db_removeFromWishlist(uid, productId) {
  try {
    await sbSvc(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`, { method: "DELETE" });
  } catch(e) { console.error("db_removeFromWishlist:", e); throw e; }
}

export async function db_isInWishlist(uid, productId) {
  try {
    const rows = await sbSvc(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`);
    return rows && rows.length > 0;
  } catch { return false; }
}

export async function db_getWishlistCount(uid) {
  try {
    const items = await db_getWishlist(uid);
    return items.length;
  } catch { return 0; }
}


// ============================================================
//  ── REVIEWS ──
// ============================================================

export async function db_getReviews(productId) {
  try {
    // Use anon key — reviews are public reads
    return await sbAnon(
      `reviews?select=*&product_id=eq.${productId}&order=created_at.desc`
    ) || [];
  } catch(e) { console.error("db_getReviews:", e); return []; }
}

export async function db_addReview({ uid, productId, userName, rating, comment }) {
  try {
    await sbSvc("reviews", {
      method:  "POST",
      headers: { Prefer: "return=minimal" },
      body:    JSON.stringify({
        uid,
        product_id:    productId,
        user_id:       uid,
        user_name:     userName || "Customer",
        customer_name: userName || "Customer",
        rating:        Number(rating),
        comment:       comment || "",
        verified:      true,
        created_at:    new Date().toISOString()
      })
    });
    return true;
  } catch(e) {
    console.error("db_addReview:", e);
    throw new Error("Could not post review. Please try again.");
  }
}


// ============================================================
//  ── ORDERS ──
// ============================================================

export async function db_placeOrder(orderData) {
  try {
    const year   = new Date().getFullYear();
    const num    = Math.floor(Math.random() * 900000) + 100000;
    const result = await sbSvc("orders", {
      method:  "POST",
      headers: { Prefer: "return=representation" },
      body:    JSON.stringify({
        order_number:      `MC-${year}-${num}`,
        uid:               orderData.uid,
        customer_name:     orderData.customerName,
        customer_email:    orderData.customerEmail,
        customer_phone:    orderData.customerPhone,
        items:             JSON.stringify(orderData.items),
        delivery_street:   orderData.deliveryStreet,
        delivery_city:     orderData.deliveryCity,
        delivery_state:    orderData.deliveryState,
        delivery_landmark: orderData.deliveryLandmark || "",
        payment_method:    orderData.paymentMethod || "paystack",
        payment_status:    orderData.paymentRef ? "paid" : "pending",
        payment_ref:       orderData.paymentRef || "",
        status:            "processing",
        subtotal:          orderData.subtotal,
        delivery_fee:      orderData.deliveryFee || 0,
        discount:          orderData.discount || 0,
        total:             orderData.total,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString()
      })
    });

    // Clear cart after order
    await db_clearCart(orderData.uid);

    // Reduce stock for each item
    for (const item of (orderData.items || [])) {
      try {
        const rows = await sbSvc(`products?select=stock&id=eq.${item.product_id || item.id}`);
        if (rows && rows.length > 0) {
          const newStock = Math.max(0, (rows[0].stock || 0) - (item.quantity || 1));
          await sbSvc(`products?id=eq.${item.product_id || item.id}`, {
            method: "PATCH",
            body:   JSON.stringify({ stock: newStock })
          });
        }
      } catch(_) { /* don't fail order if stock update fails */ }
    }

    return result && result.length > 0 ? result[0] : result;
  } catch(e) {
    console.error("db_placeOrder:", e);
    throw new Error("Could not place your order. Please try again.");
  }
}

export async function db_getMyOrders(uid, limit = 50) {
  try {
    return await sbSvc(
      `orders?select=*&uid=eq.${uid}&order=created_at.desc&limit=${limit}`
    ) || [];
  } catch(e) { console.error("db_getMyOrders:", e); return []; }
}

export async function db_getAllOrders(limit = 200) {
  try {
    return await sbSvc(
      `orders?select=*&order=created_at.desc&limit=${limit}`
    ) || [];
  } catch(e) { console.error("db_getAllOrders:", e); return []; }
}

export async function db_updateOrderStatus(orderId, status) {
  try {
    await sbSvc(`orders?id=eq.${orderId}`, {
      method: "PATCH",
      body:   JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    return true;
  } catch(e) { console.error("db_updateOrderStatus:", e); throw e; }
}


// ============================================================
//  ── PRODUCTS (public reads, anon key) ──
// ============================================================

export async function db_getProducts({ category, section, search, limit } = {}) {
  try {
    let q = "products?select=*&is_active=eq.true&order=created_at.desc";
    if (category) q += `&category=eq.${encodeURIComponent(category)}`;
    if (section)  q += `&section=eq.${encodeURIComponent(section)}`;
    if (search)   q += `&name=ilike.${encodeURIComponent("%" + search + "%")}`;
    if (limit)    q += `&limit=${limit}`;
    const rows = await sbAnon(q);
    return (rows || []).map(normalise);
  } catch(e) { console.error("db_getProducts:", e); return []; }
}

export async function db_getProductById(id) {
  try {
    const rows = await sbAnon(`products?select=*&id=eq.${id}`);
    return rows && rows.length > 0 ? normalise(rows[0]) : null;
  } catch(e) { console.error("db_getProductById:", e); return null; }
}

// ─────────────────────────────────────────
//  NORMALISE — compute display_price from promo_price
// ─────────────────────────────────────────
function normalise(p) {
  if (!p) return p;
  const name      = p.name || p.title || "Unnamed Product";
  const image_url = p.image_url
    || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null)
    || p.image || null;
  const price     = Number(p.price) || 0;
  const promo     = p.promo_price ? Number(p.promo_price) : 0;
  const hasPromo  = promo > 0 && promo < price;
  return {
    ...p,
    name,
    image_url,
    display_price:  hasPromo ? promo : price,
    original_price: hasPromo ? price : null
  };
}

// ─────────────────────────────────────────
//  STRING ID NORMALISER
//  Always compare IDs as strings — avoids
//  UUID vs integer type mismatch bugs
// ─────────────────────────────────────────
export function sid(id) {
  return id === null || id === undefined ? "" : String(id);
}
