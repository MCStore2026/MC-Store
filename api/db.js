// ============================================================
//  api/supabase.js — Vercel Serverless Function
//  This runs on the SERVER — keys never reach the browser.
//
//  Keys live in Vercel environment variables:
//    SUPABASE_URL         → https://kswikkoqfpyxuurzxail.supabase.co
//    SUPABASE_SERVICE_KEY → service_role key (secret, bypasses RLS)
//
//  All Supabase calls go through here.
//  Frontend calls /api/db with { action, payload }
// ============================================================

// Keys come from Vercel environment variables — never hardcoded
// SUPABASE_URL         = https://kswikkoqfpyxuurzxail.supabase.co
// SUPABASE_SERVICE_KEY = your service_role key (secret, bypasses RLS)
const SB_URL  = process.env.SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_KEY;

// ─────────────────────────────────────────
//  Supabase fetch — server side
// ─────────────────────────────────────────
async function sb(endpoint, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${endpoint}`, {
    ...options,
    headers: {
      apikey:         SB_KEY,
      Authorization:  `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Supabase error ${res.status}`);
  return text ? JSON.parse(text) : null;
}

// ─────────────────────────────────────────
//  Normalise product
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

// ─────────────────────────────────────────
//  ACTION HANDLERS
// ─────────────────────────────────────────
const actions = {

  // ── PRODUCTS ──
  async getProducts({ category, section, search, limit }) {
    let q = 'products?select=*&is_active=eq.true&order=created_at.desc';
    if (category) q += `&category=eq.${encodeURIComponent(category)}`;
    if (section)  q += `&section=eq.${encodeURIComponent(section)}`;
    if (search)   q += `&name=ilike.${encodeURIComponent('%' + search + '%')}`;
    if (limit)    q += `&limit=${limit}`;
    const rows = await sb(q);
    return (rows || []).map(normalise);
  },

  async getProductById({ id }) {
    const rows = await sb(`products?select=*&id=eq.${id}`);
    return rows && rows.length > 0 ? normalise(rows[0]) : null;
  },

  // ── CART ──
  async getCart({ uid }) {
    return await sb(`cart?select=*&uid=eq.${uid}&order=added_at.desc`) || [];
  },

  async addToCart({ uid, product, quantity = 1 }) {
    const existing = await sb(`cart?uid=eq.${uid}&product_id=eq.${product.id}`);
    if (existing && existing.length > 0) {
      const newQty = existing[0].quantity + quantity;
      await sb(`cart?uid=eq.${uid}&product_id=eq.${product.id}`, {
        method: 'PATCH',
        body:   JSON.stringify({ quantity: newQty })
      });
      return { action: 'updated', quantity: newQty };
    }
    await sb('cart', {
      method:  'POST',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify({
        uid,
        product_id: product.id,
        name:       product.name || product.title || '',
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || '',
        price:      product.display_price || product.promo_price || product.price,
        quantity
      })
    });
    return { action: 'added', quantity };
  },

  async updateCartQty({ uid, productId, quantity }) {
    if (quantity <= 0) return actions.removeFromCart({ uid, productId });
    await sb(`cart?uid=eq.${uid}&product_id=eq.${productId}`, {
      method: 'PATCH',
      body:   JSON.stringify({ quantity })
    });
    return { ok: true };
  },

  async removeFromCart({ uid, productId }) {
    await sb(`cart?uid=eq.${uid}&product_id=eq.${productId}`, { method: 'DELETE' });
    return { ok: true };
  },

  async clearCart({ uid }) {
    await sb(`cart?uid=eq.${uid}`, { method: 'DELETE' });
    return { ok: true };
  },

  async getCartCount({ uid }) {
    const items = await sb(`cart?select=quantity&uid=eq.${uid}`) || [];
    return items.reduce((s, i) => s + i.quantity, 0);
  },

  // ── WISHLIST ──
  async getWishlist({ uid }) {
    return await sb(`wishlist?select=*&uid=eq.${uid}&order=added_at.desc`) || [];
  },

  async addToWishlist({ uid, product }) {
    const existing = await sb(`wishlist?uid=eq.${uid}&product_id=eq.${product.id}`);
    if (existing && existing.length > 0) return { action: 'already_exists' };
    await sb('wishlist', {
      method:  'POST',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify({
        uid,
        product_id: product.id,
        name:       product.name || product.title || '',
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || '',
        price:      product.display_price || product.price
      })
    });
    return { action: 'added' };
  },

  async removeFromWishlist({ uid, productId }) {
    await sb(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`, { method: 'DELETE' });
    return { ok: true };
  },

  async isInWishlist({ uid, productId }) {
    const rows = await sb(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`);
    return { result: rows && rows.length > 0 };
  },

  async getWishlistCount({ uid }) {
    const items = await sb(`wishlist?select=id&uid=eq.${uid}`) || [];
    return items.length;
  },

  // ── REVIEWS ──
  async getReviews({ productId }) {
    return await sb(`reviews?select=*&product_id=eq.${productId}&order=created_at.desc`) || [];
  },

  async addReview({ uid, productId, userName, rating, comment }) {
    await sb('reviews', {
      method:  'POST',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify({
        uid,
        product_id:    productId,
        user_id:       uid,
        user_name:     userName || 'Customer',
        customer_name: userName || 'Customer',
        rating:        Number(rating),
        comment:       comment || '',
        verified:      true,
        created_at:    new Date().toISOString()
      })
    });
    return { ok: true };
  },

  // ── ORDERS ──
  async placeOrder({ orderData }) {
    const year   = new Date().getFullYear();
    const num    = Math.floor(Math.random() * 900000) + 100000;
    const result = await sb('orders', {
      method:  'POST',
      headers: { Prefer: 'return=representation' },
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
        delivery_landmark: orderData.deliveryLandmark || '',
        payment_method:    orderData.paymentMethod || 'paystack',
        payment_status:    orderData.paymentRef ? 'paid' : 'pending',
        payment_ref:       orderData.paymentRef || '',
        status:            'processing',
        subtotal:          orderData.subtotal,
        delivery_fee:      orderData.deliveryFee || 0,
        discount:          orderData.discount || 0,
        total:             orderData.total,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString()
      })
    });

    // Clear cart
    await sb(`cart?uid=eq.${orderData.uid}`, { method: 'DELETE' });

    // Reduce stock
    for (const item of (orderData.items || [])) {
      try {
        const rows = await sb(`products?select=stock&id=eq.${item.product_id || item.id}`);
        if (rows && rows.length > 0) {
          const newStock = Math.max(0, (rows[0].stock || 0) - (item.quantity || 1));
          await sb(`products?id=eq.${item.product_id || item.id}`, {
            method: 'PATCH',
            body:   JSON.stringify({ stock: newStock })
          });
        }
      } catch(_) {}
    }

    return result && result.length > 0 ? result[0] : result;
  },

  async getMyOrders({ uid, limit = 50 }) {
    return await sb(`orders?select=*&uid=eq.${uid}&order=created_at.desc&limit=${limit}`) || [];
  },

  async getAllOrders({ limit = 200 }) {
    return await sb(`orders?select=*&order=created_at.desc&limit=${limit}`) || [];
  },

  async updateOrderStatus({ orderId, status }) {
    await sb(`orders?id=eq.${orderId}`, {
      method: 'PATCH',
      body:   JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    return { ok: true };
  }
};

// ─────────────────────────────────────────
//  VERCEL HANDLER
// ─────────────────────────────────────────
export default async function handler(req, res) {
  // Allow all origins (your Vercel domain)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, payload = {} } = req.body || {};

  if (!action || !actions[action]) {
    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  try {
    const result = await actions[action](payload);
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error(`[api/db] ${action} error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
