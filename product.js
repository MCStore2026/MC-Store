// ============================================================
//  product.js — MC Store Product Manager v1
//  🗄️  Supabase handles everything product-related:
//      Products, Cart, Wishlist, Orders, Reviews, Notifications
//
//  Usage in any page:
//    import { getProducts, addToCart, placeOrder } from './product.js';
// ============================================================


// ─────────────────────────────────────────
//  SUPABASE CONFIG
//  Keys injected by Vercel at build time
//  Set SUPABASE_URL and SUPABASE_ANON_KEY
//  in Vercel → Settings → Environment Variables
// ─────────────────────────────────────────
const SUPABASE_URL  = "https://kswikkoqfpyxuurzxail.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd2lra29xZnB5eHV1cnp4YWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEzMDQsImV4cCI6MjA4NjkzNzMwNH0.uuoSKWOTeXot1HJys0EO9OcIRBL0mKrNHIUHIAPCpZ4";


// ─────────────────────────────────────────
//  SUPABASE FETCH HELPER
//  Lightweight wrapper — no SDK needed
// ─────────────────────────────────────────
async function sbFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const res  = await fetch(url, {
    ...options,
    headers: {
      apikey:          SUPABASE_ANON,
      Authorization:   `Bearer ${SUPABASE_ANON}`,
      "Content-Type":  "application/json",
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Supabase error:", err);
    throw new Error(err);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}


// ============================================================
//  ── PRODUCTS ──
// ============================================================

// ─────────────────────────────────────────
//  GET ALL PRODUCTS
//  Optional: filter by category, featured, search
//
//  Usage:
//    getProducts()                          → all products
//    getProducts({ category: 'Electronics' }) → by category
//    getProducts({ featured: true })        → featured only
//    getProducts({ search: 'samsung' })     → search by name
//    getProducts({ limit: 10 })             → limit results
// ─────────────────────────────────────────
async function getProducts({ category, featured, search, section, limit } = {}) {
  try {
    let query = "products?select=*&is_active=eq.true&order=created_at.desc";

    if (category) query += `&category=eq.${encodeURIComponent(category)}`;
    if (section)  query += `&section=eq.${encodeURIComponent(section)}`;
    if (search)   query += `&title=ilike.${encodeURIComponent("%" + search + "%")}`;
    if (limit)    query += `&limit=${limit}`;

    const rows = await sbFetch(query);
    return (rows || []).map(normalizeProduct);
  } catch (error) {
    console.error("getProducts error:", error);
    return [];
  }
}

// ── Normalize product columns ──
// Database uses: title, images[]
// Frontend uses: name, image_url
function normalizeProduct(p) {
  if (!p) return p;
  const name      = p.name || p.title || 'Unnamed Product';
  const image_url = p.image_url
    || (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null)
    || p.image || null;

  // Promo price: admin sets price=12000, promo_price=10000
  // Customer sees: ₦10,000  ~~₦12,000~~  -17%
  const price      = Number(p.price) || 0;
  const promoPrice = p.promo_price ? Number(p.promo_price) : 0;
  const hasPromo   = promoPrice > 0 && promoPrice < price;

  return {
    ...p,
    name,
    image_url,
    display_price:  hasPromo ? promoPrice : price,
    original_price: hasPromo ? price : null,
  };
}


// ─────────────────────────────────────────
//  GET SINGLE PRODUCT BY ID
// ─────────────────────────────────────────
async function getProductById(productId) {
  try {
    const rows = await sbFetch(`products?select=*&id=eq.${productId}`);
    return rows && rows.length > 0 ? normalizeProduct(rows[0]) : null;
  } catch (error) {
    console.error("getProductById error:", error);
    return null;
  }
}


// ─────────────────────────────────────────
//  GET PRODUCTS BY CATEGORY
// ─────────────────────────────────────────
async function getProductsByCategory(category, limit = 50) {
  return getProducts({ category, limit });
}


// ─────────────────────────────────────────
//  GET FEATURED PRODUCTS
//  Used on home page hero/banner section
// ─────────────────────────────────────────
async function getFeaturedProducts(limit = 50) {
  // Show ALL active products — no is_featured restriction
  return getProducts({ limit });
}


// ─────────────────────────────────────────
//  SEARCH PRODUCTS
// ─────────────────────────────────────────
async function searchProducts(query, limit = 100) {
  return getProducts({ search: query, limit });
}


// ─────────────────────────────────────────
//  GET ALL CATEGORIES
//  Returns unique list of product categories
// ─────────────────────────────────────────
async function getCategories() {
  try {
    const products = await sbFetch("products?select=category&is_active=eq.true");
    const unique   = [...new Set(products.map(p => p.category))];
    return unique.sort();
  } catch (error) {
    console.error("getCategories error:", error);
    return [];
  }
}


// ============================================================
//  ── CART ──
// ============================================================

// ─────────────────────────────────────────
//  GET CART
//  Returns all cart items for the logged-in user
// ─────────────────────────────────────────
async function getCart(uid) {
  try {
    return await sbFetch(`cart?select=*&uid=eq.${uid}&order=added_at.desc`);
  } catch (error) {
    console.error("getCart error:", error);
    return [];
  }
}


// ─────────────────────────────────────────
//  ADD TO CART
//  If product already in cart → increase quantity
//  If new product → add fresh row
// ─────────────────────────────────────────
async function addToCart(uid, product, quantity = 1) {
  try {
    // Check if already in cart
    const existing = await sbFetch(
      `cart?uid=eq.${uid}&product_id=eq.${product.id}`
    );

    if (existing && existing.length > 0) {
      // Already in cart — increase quantity
      const newQty = existing[0].quantity + quantity;
      await sbFetch(`cart?uid=eq.${uid}&product_id=eq.${product.id}`, {
        method:  "PATCH",
        body:    JSON.stringify({ quantity: newQty })
      });
      return { action: "updated", quantity: newQty };
    }

    // New item — add to cart
    await sbFetch("cart", {
      method:  "POST",
      headers: { Prefer: "return=representation" },
      body:    JSON.stringify({
        uid,
        product_id: product.id,
        name:       product.name || product.title,
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || "",
        price:      product.display_price || product.promo_price || product.price,
        quantity
      })
    });

    return { action: "added", quantity };
  } catch (error) {
    console.error("addToCart error:", error);
    throw new Error("Could not add item to cart. Please try again.");
  }
}


// ─────────────────────────────────────────
//  UPDATE CART QUANTITY
// ─────────────────────────────────────────
async function updateCartQuantity(uid, productId, quantity) {
  try {
    if (quantity <= 0) {
      return removeFromCart(uid, productId);
    }
    await sbFetch(`cart?uid=eq.${uid}&product_id=eq.${productId}`, {
      method: "PATCH",
      body:   JSON.stringify({ quantity })
    });
    return true;
  } catch (error) {
    console.error("updateCartQuantity error:", error);
    throw new Error("Could not update cart. Please try again.");
  }
}


// ─────────────────────────────────────────
//  REMOVE FROM CART
// ─────────────────────────────────────────
async function removeFromCart(uid, productId) {
  try {
    await sbFetch(`cart?uid=eq.${uid}&product_id=eq.${productId}`, {
      method: "DELETE"
    });
    return true;
  } catch (error) {
    console.error("removeFromCart error:", error);
    throw new Error("Could not remove item. Please try again.");
  }
}


// ─────────────────────────────────────────
//  CLEAR CART
//  Called after successful order placement
// ─────────────────────────────────────────
async function clearCart(uid) {
  try {
    await sbFetch(`cart?uid=eq.${uid}`, { method: "DELETE" });
    return true;
  } catch (error) {
    console.error("clearCart error:", error);
    return false;
  }
}


// ─────────────────────────────────────────
//  GET CART COUNT
//  Returns total number of items in cart
// ─────────────────────────────────────────
async function getCartCount(uid) {
  try {
    const items = await getCart(uid);
    return items.reduce((sum, item) => sum + item.quantity, 0);
  } catch {
    return 0;
  }
}


// ============================================================
//  ── WISHLIST ──
// ============================================================

// ─────────────────────────────────────────
//  GET WISHLIST
// ─────────────────────────────────────────
async function getWishlist(uid) {
  try {
    return await sbFetch(`wishlist?select=*&uid=eq.${uid}&order=added_at.desc`);
  } catch (error) {
    console.error("getWishlist error:", error);
    return [];
  }
}


// ─────────────────────────────────────────
//  ADD TO WISHLIST
// ─────────────────────────────────────────
async function addToWishlist(uid, product) {
  try {
    // Check if already in wishlist
    const existing = await sbFetch(
      `wishlist?uid=eq.${uid}&product_id=eq.${product.id}`
    );

    if (existing && existing.length > 0) {
      return { action: "already_exists" };
    }

    await sbFetch("wishlist", {
      method:  "POST",
      headers: { Prefer: "return=representation" },
      body:    JSON.stringify({
        uid,
        product_id: product.id,
        name:       product.name || product.title,
        image_url:  product.image_url || (Array.isArray(product.images) && product.images[0]) || "",
        price:      product.display_price || product.price
      })
    });

    return { action: "added" };
  } catch (error) {
    console.error("addToWishlist error:", error);
    throw new Error("Could not add to wishlist. Please try again.");
  }
}


// ─────────────────────────────────────────
//  REMOVE FROM WISHLIST
// ─────────────────────────────────────────
async function removeFromWishlist(uid, productId) {
  try {
    await sbFetch(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`, {
      method: "DELETE"
    });
    return true;
  } catch (error) {
    console.error("removeFromWishlist error:", error);
    throw new Error("Could not remove from wishlist. Please try again.");
  }
}


// ─────────────────────────────────────────
//  CHECK IF IN WISHLIST
// ─────────────────────────────────────────
async function isInWishlist(uid, productId) {
  try {
    const rows = await sbFetch(`wishlist?uid=eq.${uid}&product_id=eq.${productId}`);
    return rows && rows.length > 0;
  } catch {
    return false;
  }
}

// String-normalise a product ID (handles UUID, integer, anything)
function normaliseId(id) {
  return id === null || id === undefined ? '' : String(id);
}


// ─────────────────────────────────────────
//  GET WISHLIST COUNT
// ─────────────────────────────────────────
async function getWishlistCount(uid) {
  try {
    const items = await getWishlist(uid);
    return items.length;
  } catch {
    return 0;
  }
}


// ─────────────────────────────────────────
//  MOVE WISHLIST ITEM TO CART
// ─────────────────────────────────────────
async function moveToCart(uid, product) {
  try {
    await addToCart(uid, product);
    await removeFromWishlist(uid, product.id);
    return true;
  } catch (error) {
    console.error("moveToCart error:", error);
    throw new Error("Could not move item to cart. Please try again.");
  }
}


// ============================================================
//  ── ORDERS ──
// ============================================================

// ─────────────────────────────────────────
//  GENERATE ORDER NUMBER
//  Format: MC-2025-000001
// ─────────────────────────────────────────
function generateOrderNumber() {
  const year   = new Date().getFullYear();
  const random = Math.floor(Math.random() * 900000) + 100000;
  return `MC-${year}-${random}`;
}


// ─────────────────────────────────────────
//  PLACE ORDER
//  Creates order in Supabase then clears cart
// ─────────────────────────────────────────
async function placeOrder({
  uid,
  customerName,
  customerEmail,
  customerPhone,
  items,
  deliveryStreet,
  deliveryCity,
  deliveryState,
  deliveryLandmark,
  paymentMethod = "paystack",
  paymentRef    = "",
  subtotal,
  deliveryFee   = 0,
  discount      = 0,
  total
}) {
  try {
    const order = await sbFetch("orders", {
      method:  "POST",
      headers: { Prefer: "return=representation" },
      body:    JSON.stringify({
        order_number:      generateOrderNumber(),
        uid,
        customer_name:     customerName,
        customer_email:    customerEmail,
        customer_phone:    customerPhone,
        items:             JSON.stringify(items),
        delivery_street:   deliveryStreet,
        delivery_city:     deliveryCity,
        delivery_state:    deliveryState,
        delivery_landmark: deliveryLandmark,
        payment_method:    paymentMethod,
        payment_status:    paymentRef ? "paid" : "pending",
        payment_ref:       paymentRef,
        status:            "processing",
        subtotal,
        delivery_fee:      deliveryFee,
        discount,
        total,
        created_at:        new Date().toISOString(),
        updated_at:        new Date().toISOString()
      })
    });

    // Clear cart after successful order
    await clearCart(uid);

    // Reduce stock for each ordered item
    for (const item of items) {
      try {
        const rows = await sbFetch(`products?select=stock&id=eq.${item.product_id || item.id}`);
        if (rows && rows.length > 0) {
          const currentStock = rows[0].stock || 0;
          const newStock = Math.max(0, currentStock - (item.quantity || 1));
          await sbFetch(`products?id=eq.${item.product_id || item.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ stock: newStock })
          });
        }
      } catch(e) { /* don't block order if stock update fails */ }
    }

    // Update customer total orders and spent
    await sbFetch(`customers?uid=eq.${uid}`, {
      method: "PATCH",
      body:   JSON.stringify({
        total_orders:   "(total_orders + 1)",
        total_spent:    `(total_spent + ${total})`
      })
    });

    return order && order.length > 0 ? order[0] : order;
  } catch (error) {
    console.error("placeOrder error:", error);
    throw new Error("Could not place your order. Please try again.");
  }
}


// ─────────────────────────────────────────
//  GET MY ORDERS
//  Returns all orders for a customer
// ─────────────────────────────────────────
async function getMyOrders(uid, limit = 50) {
  try {
    return await sbFetch(
      `orders?select=*&uid=eq.${uid}&order=created_at.desc&limit=${limit}`
    );
  } catch (error) {
    console.error("getMyOrders error:", error);
    return [];
  }
}


// ─────────────────────────────────────────
//  GET SINGLE ORDER
// ─────────────────────────────────────────
async function getOrderById(orderId) {
  try {
    const rows = await sbFetch(`orders?select=*&id=eq.${orderId}`);
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("getOrderById error:", error);
    return null;
  }
}


// ============================================================
//  ── REVIEWS ──
// ============================================================

// ─────────────────────────────────────────
//  GET PRODUCT REVIEWS
// ─────────────────────────────────────────
async function getReviews(productId) {
  try {
    return await sbFetch(
      `reviews?select=*&product_id=eq.${productId}&order=created_at.desc`
    );
  } catch (error) {
    console.error("getReviews error:", error);
    return [];
  }
}


// ─────────────────────────────────────────
//  ADD REVIEW
// ─────────────────────────────────────────
async function addReview({ uid, productId, customerName, rating, comment }) {
  try {
    await sbFetch("reviews", {
      method:  "POST",
      headers: { Prefer: "return=representation" },
      body:    JSON.stringify({
        uid,
        product_id:    productId,
        customer_name: customerName,
        rating,
        comment,
        verified:      true,
        created_at:    new Date().toISOString()
      })
    });
    return true;
  } catch (error) {
    console.error("addReview error:", error);
    throw new Error("Could not submit review. Please try again.");
  }
}


// ============================================================
//  ── NOTIFICATIONS ──
// ============================================================

// ─────────────────────────────────────────
//  GET NOTIFICATIONS
// ─────────────────────────────────────────
async function getNotifications(uid) {
  try {
    return await sbFetch(
      `notifs?select=*&uid=eq.${uid}&order=created_at.desc&limit=30`
    );
  } catch (error) {
    console.error("getNotifications error:", error);
    return [];
  }
}


// ─────────────────────────────────────────
//  MARK NOTIFICATION AS READ
// ─────────────────────────────────────────
async function markNotifRead(notifId) {
  try {
    await sbFetch(`notifs?id=eq.${notifId}`, {
      method: "PATCH",
      body:   JSON.stringify({ is_read: true })
    });
    return true;
  } catch (error) {
    console.error("markNotifRead error:", error);
    return false;
  }
}


// ─────────────────────────────────────────
//  GET UNREAD COUNT
// ─────────────────────────────────────────
async function getUnreadCount(uid) {
  try {
    const notifs = await sbFetch(
      `notifs?uid=eq.${uid}&is_read=eq.false`
    );
    return notifs ? notifs.length : 0;
  } catch {
    return 0;
  }
}


// ============================================================
//  ── CUSTOMER PROFILE (Supabase side) ──
// ============================================================

// ─────────────────────────────────────────
//  GET CUSTOMER PROFILE
// ─────────────────────────────────────────
async function getCustomerProfile(uid) {
  try {
    const rows = await sbFetch(`customers?select=*&uid=eq.${uid}`);
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error("getCustomerProfile error:", error);
    return null;
  }
}


// ─────────────────────────────────────────
//  UPDATE CUSTOMER PROFILE
// ─────────────────────────────────────────
async function updateCustomerProfile(uid, updates) {
  try {
    await sbFetch(`customers?uid=eq.${uid}`, {
      method: "PATCH",
      body:   JSON.stringify({
        ...updates,
        updated_at: new Date().toISOString()
      })
    });
    return true;
  } catch (error) {
    console.error("updateCustomerProfile error:", error);
    throw new Error("Could not update profile. Please try again.");
  }
}


// ============================================================
//  ── STORAGE HELPERS ──
//  Upload images to Supabase Storage
// ============================================================

// ─────────────────────────────────────────
//  UPLOAD PROFILE PHOTO
// ─────────────────────────────────────────
async function uploadProfilePhoto(uid, file) {
  try {
    const ext      = file.name.split(".").pop();
    const path     = `${uid}/profile.${ext}`;
    const res      = await fetch(
      `${SUPABASE_URL}/storage/v1/object/profile-photos/${path}`,
      {
        method:  "POST",
        headers: {
          apikey:        SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          "Content-Type": file.type
        },
        body: file
      }
    );
    if (!res.ok) throw new Error(await res.text());
    return `${SUPABASE_URL}/storage/v1/object/public/profile-photos/${path}`;
  } catch (error) {
    console.error("uploadProfilePhoto error:", error);
    throw new Error("Could not upload photo. Please try again.");
  }
}


// ─────────────────────────────────────────
//  GET PUBLIC IMAGE URL
// ─────────────────────────────────────────
function getImageUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}


// ============================================================
//  ── UTILITY HELPERS ──
// ============================================================

// ─────────────────────────────────────────
//  FORMAT PRICE IN NAIRA
//  Usage: formatPrice(25000) → "₦25,000"
// ─────────────────────────────────────────
function formatPrice(amount) {
  return "₦" + Number(amount).toLocaleString("en-NG");
}


// ─────────────────────────────────────────
//  CALCULATE DISCOUNT PRICE
// ─────────────────────────────────────────
function calcDiscount(originalPrice, discountPercent) {
  return originalPrice - (originalPrice * discountPercent / 100);
}


// ─────────────────────────────────────────
//  CALCULATE CART TOTAL
// ─────────────────────────────────────────
function calcCartTotal(cartItems) {
  return cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}


// ─────────────────────────────────────────
//  TRUNCATE TEXT
//  Usage: truncate("Long product name...", 40)
// ─────────────────────────────────────────
function truncate(text, maxLength = 50) {
  if (!text) return "";
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}


// ─────────────────────────────────────────
//  GET ALL ORDERS (admin)
// ─────────────────────────────────────────
async function getAllOrders(limit = 200) {
  try {
    return await sbFetch(`orders?select=*&order=created_at.desc&limit=${limit}`);
  } catch (error) {
    console.error("getAllOrders error:", error);
    return [];
  }
}

// ─────────────────────────────────────────
//  UPDATE ORDER STATUS (admin confirmation)
// ─────────────────────────────────────────
async function updateOrderStatus(orderId, status) {
  try {
    await sbFetch(`orders?id=eq.${orderId}`, {
      method: "PATCH",
      body:   JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    return true;
  } catch (error) {
    console.error("updateOrderStatus error:", error);
    throw new Error("Could not update order.");
  }
}


// ============================================================
//  EXPORTS
// ============================================================
export {
  // Products
  getProducts,
  getProductById,
  getProductsByCategory,
  getFeaturedProducts,
  searchProducts,
  getCategories,

  // Cart
  getCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  getCartCount,

  // Wishlist
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  isInWishlist,
  getWishlistCount,
  moveToCart,

  // Orders
  placeOrder,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,

  // Reviews
  getReviews,
  addReview,

  // Notifications
  getNotifications,
  markNotifRead,
  getUnreadCount,

  // Customer profile
  getCustomerProfile,
  updateCustomerProfile,

  // Storage
  uploadProfilePhoto,
  getImageUrl,

  // Utilities
  normaliseId,
  formatPrice,
  calcDiscount,
  calcCartTotal,
  truncate
};
