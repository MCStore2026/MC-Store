// ============================================================
//  shipping.js — MC Store Shipbubble Delivery Integration
//  Handles: Delivery fee calculation, pickup, courier rates
//  Provider: Shipbubble API (sandbox)
// ============================================================

const SHIPBUBBLE_KEY     = "sb_sandbox_f1d7ab8f1d6e69df77c93527811973001404cdc0c23d9aa7ef36ed4cb7ad3995";
const SHIPBUBBLE_BASE    = "https://api.shipbubble.com/v1";
const WEBHOOK_URL        = "https://mc-store-test.vercel.app/api/shipbubble/webhook";

// ── MC STORE PICKUP / SENDER ADDRESS ──
const STORE_ADDRESS = {
  name:    "MC Store",
  email:   "mcstore@gmail.com",
  phone:   "08000000000",         // Update with real store phone
  address: "Opposite Bovas Filling Station, Bodija, Ibadan, Oyo State, Nigeria",
  city:    "Ibadan",
  state:   "Oyo",
  country: "NG"
};

// ── DELIVERY METHODS ──
const DELIVERY_METHODS = {
  PICKUP:   "pickup",
  DELIVERY: "delivery"
};

// ── SHIPBUBBLE FETCH HELPER ──
async function sbShip(endpoint, options = {}) {
  const res = await fetch(`${SHIPBUBBLE_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${SHIPBUBBLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("Shipbubble error:", data);
    throw new Error(data.message || "Shipbubble request failed");
  }

  return data;
}


// ─────────────────────────────────────────
//  VALIDATE ADDRESS
//  Checks if a customer address is valid
//  before calculating shipping
// ─────────────────────────────────────────
async function validateAddress(address) {
  try {
    const res = await sbShip("/shipping/address/validate", {
      method: "POST",
      body:   JSON.stringify({
        address: address.street,
        city:    address.city,
        state:   address.state,
        country: "NG"
      })
    });
    return { valid: true, data: res };
  } catch(e) {
    console.error("validateAddress error:", e);
    return { valid: false, error: e.message };
  }
}


// ─────────────────────────────────────────
//  GET SHIPPING RATES
//  Returns available couriers + their rates
//  for a given delivery address and package
//
//  Usage:
//    getRates({
//      recipientAddress: { street, city, state },
//      items: [{ name, weight, quantity }],
//      totalWeight: 1.5
//    })
// ─────────────────────────────────────────
async function getRates({ recipientAddress, items = [], totalWeight = 0.5 }) {
  try {
    // Call /api/shipping (Vercel serverless) — fixes CORS
    const res = await fetch('/api/shipping', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        action: 'getRates',
        payload: { recipientAddress, items, totalWeight }
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Could not get rates');
    return data.rates || [];
  } catch(e) {
    console.error('getRates error:', e);
    throw new Error('Could not calculate delivery rates. Please check your address.');
  }
}


// ─────────────────────────────────────────
//  GET CHEAPEST RATE
//  Returns only the cheapest courier option
// ─────────────────────────────────────────
async function getCheapestRate(params) {
  const rates = await getRates(params);
  if (!rates || rates.length === 0) return null;
  return rates.sort((a, b) => a.delivery_fee - b.delivery_fee)[0];
}


// ─────────────────────────────────────────
//  CREATE SHIPMENT
//  Called after payment is confirmed
//  Creates the actual shipment order
// ─────────────────────────────────────────
async function createShipment({
  orderId,
  courierId,
  recipientAddress,
  items,
  totalWeight = 0.5
}) {
  try {
    const payload = {
      request_token: orderId,
      courier_id:    courierId,
      sender: {
        name:    STORE_ADDRESS.name,
        email:   STORE_ADDRESS.email,
        phone:   STORE_ADDRESS.phone,
        address: STORE_ADDRESS.address,
        city:    STORE_ADDRESS.city,
        state:   STORE_ADDRESS.state,
        country: STORE_ADDRESS.country
      },
      recipient: {
        name:    recipientAddress.fullName || "Customer",
        email:   recipientAddress.email    || "",
        phone:   recipientAddress.phone    || "",
        address: recipientAddress.street   || "",
        city:    recipientAddress.city     || "",
        state:   recipientAddress.state    || "",
        country: "NG"
      },
      package: {
        weight:   totalWeight,
        length:   20,
        width:    15,
        height:   10,
        items:    items.map(i => ({
          name:     i.name,
          quantity: i.quantity || 1,
          weight:   i.weight   || 0.3
        }))
      },
      webhook_url: WEBHOOK_URL
    };

    const res = await sbShip("/shipping/shipment/create", {
      method: "POST",
      body:   JSON.stringify(payload)
    });

    return {
      success:      true,
      tracking_id:  res.data?.tracking_id  || res.tracking_id,
      shipment_id:  res.data?.shipment_id  || res.shipment_id,
      tracking_url: res.data?.tracking_url || res.tracking_url || null
    };

  } catch(e) {
    console.error("createShipment error:", e);
    throw new Error("Could not create shipment. Please contact support.");
  }
}


// ─────────────────────────────────────────
//  TRACK SHIPMENT
//  Returns live tracking info by tracking ID
// ─────────────────────────────────────────
async function trackShipment(trackingId) {
  try {
    const res = await sbShip(`/shipping/shipment/track/${trackingId}`);
    return {
      status:   res.data?.status  || res.status,
      location: res.data?.location || "",
      history:  res.data?.history  || [],
      eta:      res.data?.eta      || ""
    };
  } catch(e) {
    console.error("trackShipment error:", e);
    return null;
  }
}


// ─────────────────────────────────────────
//  CALCULATE PICKUP
//  Pickup is always free
// ─────────────────────────────────────────
function getPickupInfo() {
  return {
    courier_name: "Store Pickup",
    delivery_fee: 0,
    eta:          "Ready in 1-2 hours",
    address:      STORE_ADDRESS.address,
    city:         STORE_ADDRESS.city,
    state:        STORE_ADDRESS.state
  };
}


// ─────────────────────────────────────────
//  FORMAT DELIVERY FEE
// ─────────────────────────────────────────
function formatDeliveryFee(fee) {
  if (!fee || fee === 0) return "Free";
  return "₦" + Number(fee).toLocaleString("en-NG");
}


// ─────────────────────────────────────────
//  CALCULATE PACKAGE WEIGHT
//  Estimates total package weight from cart
// ─────────────────────────────────────────
function estimateWeight(cartItems) {
  // Default 0.3kg per item if no weight set
  const total = cartItems.reduce((sum, item) =>
    sum + ((item.weight || 0.3) * (item.quantity || 1)), 0
  );
  return Math.max(total, 0.5); // minimum 0.5kg
}


// ─────────────────────────────────────────
//  NIGERIAN STATES LIST
//  For address form dropdowns
// ─────────────────────────────────────────
const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi",
  "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT - Abuja",
  "Gombe", "Imo", "Jigawa", "Kaduna", "Kano",
  "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
  "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba",
  "Yobe", "Zamfara"
];


// ─────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────
export {
  DELIVERY_METHODS,
  STORE_ADDRESS,
  NIGERIAN_STATES,
  validateAddress,
  getRates,
  getCheapestRate,
  createShipment,
  trackShipment,
  getPickupInfo,
  formatDeliveryFee,
  estimateWeight
};
