// ============================================================
//  db.js — MC Store Database
//
//  ALL DATA → Supabase (anon key)
//  RLS is DISABLED on all tables in Supabase dashboard.
//  Anon key is browser-safe for public + user data when RLS is off.
//  Supabase docs: "safe to use in a browser"
//
//  PRODUCTS → Supabase products table (read)
//  CART     → Supabase cart table     (read/write)
//  WISHLIST → Supabase wishlist table (read/write)
//  REVIEWS  → Supabase reviews table  (read/write)
//  ORDERS   → Supabase orders table   (read/write)
// ============================================================

const SB_URL  = "https://kswikkoqfpyxuurzxail.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd2lra29xZnB5eHV1cnp4YWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEzMDQsImV4cCI6MjA4NjkzNzMwNH0.uuoSKWOTeXot1HJys0EO9OcIRBL0mKrNHIUHIAPCpZ4";

// ─────────────────────────────────────────
//  ONE fetch helper — handles everything
// ─────────────────────────────────────────
async function sb(endpoint, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey:         SB_ANON,
      Authorization:  `Bearer ${SB_ANON}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase error:', endpoint, err);
    throw new Error(err);
  }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

// ─────────────────────────────────────────
//  Normalise product row
// ─────────────────────────────────────────
function normalise(p) {
  if (!p) return p;
  const name      = p.name || p.title || 'Unnamed Product';
  const image_url = p.image_url
    || (Array.isArray(p.images) && p.images[0])
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
//  ── PRODUCTS ──
// ============================================================

export async function db_getProducts({ category, section, search, limit } = {}) {
  try {
    let q = 'products?select=*&is_active=eq.true&order=created_at.desc';
    if (category) q += `&category=eq.${encodeURIComponent(category)}`;
    if (section)  q += `&section=eq.${encodeURIComponent(section)}`;
    if (search)   q += `&name=ilike.${encodeURIComponent('%'+search+'%')}`;
    if (limit)    q += `&limit=${limit}`;
    const rows = await sb(q);
    return (rows || []).map(normalise);
  } catch(e) { console.error('db_getProducts:', e); return []; }
}

export async function db_getProductById(id) {
  try {
    const rows = await sb(`products?select=*&id=eq.${id}`);
    return rows && rows.length > 0 ? normalise(rows[0]) : null;
  } catch(e) { console.error('db_getProductById:', e); return null; }
}


// ============================================================
//  ── CART ──
// ============================================================

export async function db_getCart(uid) {
  try {
    return await sb(`cart?select=*&uid=eq.${uid}&order=added_at.desc`) || [];
  } catch(e) { console.error('db_getCart:', e); return []; }
}

export async function db_addToCart(uid, product, quantity = 1) {
  try {
    const pid      = String(product.id);
    // First try to update existing item
    const existing = await sb(`cart?uid=eq.${uid}&product_id=eq.${pid}`);
    if (existing && existing.length > 0) {
      const newQty = (existing[0].quantity || 1) + quantity;
      await sb(`cart?uid=eq.${uid}&product_id=eq.${pid}`, {
        method: 'PATCH',
        body:   JSON.stringify({ quantity: newQty })
      });
      return { action: 'updated', quantity: newQty };
    }
    // Insert new item
    await sb('cart', {
      method:  'POST',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify({
        uid,
        product_id: pid,
        name:       product.name || product.title || '',
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || '',
        price:      product.display_price || product.promo_price || product.price || 0,
        quantity,
        added_at:   new Date().toISOString()
      })
    });
    return { action: 'added', quantity };
  } catch(e) {
    console.error('db_addToCart:', e);
    throw new Error('Could not add to cart. Please try again.');
  }
}

export async function db_updateCartQty(uid, productId, quantity) {
  try {
    if (quantity <= 0) return db_removeFromCart(uid, productId);
    await sb(`cart?uid=eq.${uid}&product_id=eq.${productId}`, {
      method: 'PATCH',
      body:   JSON.stringify({ quantity })
    });
  } catch(e) { console.error('db_updateCartQty:', e); throw e; }
}

export async function db_removeFromCart(uid, productId) {
  try {
    await sb(`cart?uid=eq.${uid}&product_id=eq.${productId}`, { method: 'DELETE' });
  } catch(e) { console.error('db_removeFromCart:', e); throw e; }
}

export async function db_clearCart(uid) {
  try {
    await sb(`cart?uid=eq.${uid}`, { method: 'DELETE' });
  } catch(e) { console.error('db_clearCart:', e); }
}

export async function db_getCartCount(uid) {
  try {
    const items = await db_getCart(uid);
    return items.reduce((s, i) => s + (i.quantity || 1), 0);
  } catch { return 0; }
}


// ============================================================
//  ── WISHLIST ──
// ============================================================

export async function db_getWishlist(uid) {
  try {
    return await sb(`wishlist?select=*&uid=eq.${uid}&order=added_at.desc`) || [];
  } catch(e) { console.error('db_getWishlist:', e); return []; }
}

export async function db_addToWishlist(uid, product) {
  try {
    const pid = String(product.id);
    // Use ON CONFLICT DO NOTHING — handles duplicates gracefully
    await sb('wishlist', {
      method:  'POST',
      headers: { Prefer: 'return=minimal', Resolution: 'ignore-duplicates' },
      body:    JSON.stringify({
        uid,
        product_id: pid,
        name:       product.name || product.title || '',
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || '',
        price:      product.display_price || product.price || 0
      })
    });
    return { action: 'added' };
  } catch(e) {
    // If duplicate key — it's already in wishlist, not a real error
    if (e.message && e.message.includes('duplicate')) return { action: 'already_exists' };
    console.error('db_addToWishlist:', e);
    throw new Error('Could not save to wishlist. Please try again.');
  }
}

export async function db_removeFromWishlist(uid, productId) {
  try {
    await sb(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`, { method: 'DELETE' });
  } catch(e) { console.error('db_removeFromWishlist:', e); throw e; }
}

export async function db_isInWishlist(uid, productId) {
  try {
    const rows = await sb(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`);
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
    return await sb(
      `reviews?select=*&product_id=eq.${productId}&order=created_at.desc`
    ) || [];
  } catch(e) { console.error('db_getReviews:', e); return []; }
}

export async function db_addReview({ uid, productId, userName, rating, comment }) {
  try {
    // Send only columns we know exist — uid as text (Firebase UID)
    await sb('reviews', {
      method:  'POST',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify({
        uid:           String(uid),
        product_id:    String(productId),
        user_name:     userName || 'Customer',
        customer_name: userName || 'Customer',
        rating:        Number(rating),
        comment:       comment || '',
        verified:      true,
        created_at:    new Date().toISOString()
      })
    });
    return true;
  } catch(e) {
    console.error('db_addReview:', e);
    throw new Error(e.message || 'Could not post review. Please try again.');
  }
}


// ============================================================
//  ── ORDERS ──
// ============================================================

export async function db_placeOrder(orderData) {
  try {
    const year   = new Date().getFullYear();
    const num    = Math.floor(Math.random() * 900000) + 100000;
    const result = await sb('orders', {
      method:  'POST',
      headers: { Prefer: 'return=representation' },
      body:    JSON.stringify({
        order_number:      `MC-${year}-${num}`,
        uid:               orderData.uid,
        customer_name:     orderData.customerName    || '',
        customer_email:    orderData.customerEmail   || '',
        customer_phone:    orderData.customerPhone   || '',
        items:             JSON.stringify(orderData.items || []),
        delivery_street:   orderData.deliveryStreet  || '',
        delivery_city:     orderData.deliveryCity    || '',
        delivery_state:    orderData.deliveryState   || '',
        delivery_landmark: orderData.deliveryLandmark|| '',
        payment_method:    orderData.paymentMethod   || 'paystack',
        payment_status:    orderData.paymentRef ? 'paid' : 'pending',
        payment_ref:       orderData.paymentRef      || '',
        status:            'processing',
        subtotal:          orderData.subtotal        || 0,
        delivery_fee:      orderData.deliveryFee     || 0,
        discount:          orderData.discount        || 0,
        total:             orderData.total           || 0,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString()
      })
    });

    // Clear cart
    await db_clearCart(orderData.uid);

    // Reduce stock for each item
    for (const item of (orderData.items || [])) {
      try {
        const pid  = item.product_id || item.id;
        const rows = await sb(`products?select=stock,id&id=eq.${pid}`);
        if (rows && rows.length > 0) {
          const newStock = Math.max(0, (rows[0].stock || 0) - (item.quantity || 1));
          await sb(`products?id=eq.${pid}`, {
            method: 'PATCH',
            body:   JSON.stringify({ stock: newStock })
          });
        }
      } catch(_) {}
    }

    return result && result.length > 0 ? result[0] : result;
  } catch(e) {
    console.error('db_placeOrder:', e);
    throw new Error('Could not place your order. Please try again.');
  }
}

export async function db_getMyOrders(uid, limit = 50) {
  try {
    return await sb(
      `orders?select=*&uid=eq.${uid}&order=created_at.desc&limit=${limit}`
    ) || [];
  } catch(e) { console.error('db_getMyOrders:', e); return []; }
}

export async function db_getAllOrders(limit = 200) {
  try {
    return await sb(
      `orders?select=*&order=created_at.desc&limit=${limit}`
    ) || [];
  } catch(e) { console.error('db_getAllOrders:', e); return []; }
}

export async function db_updateOrderStatus(orderId, status) {
  try {
    await sb(`orders?id=eq.${orderId}`, {
      method: 'PATCH',
      body:   JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    return true;
  } catch(e) { console.error('db_updateOrderStatus:', e); throw e; }
}


// ============================================================
//  ── UTILS ──
// ============================================================

export function sid(id) {
  return id === null || id === undefined ? '' : String(id);
}
