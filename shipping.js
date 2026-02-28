// ============================================================
//  shipping.js — MC Store Shipping
//  Calls /api/shipping (Vercel server) — fixes CORS
//  Shipbubble API never called from browser directly
// ============================================================

const STORE_ADDRESS = {
  name:    "MC Store",
  email:   "mcstore.care@gmail.com",
  phone:   "08056230366",
  address: "Opposite Bovas Filling Station, Bodija, Ibadan, Oyo State, Nigeria",
  city:    "Ibadan",
  state:   "Oyo",
  country: "NG"
};

export const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue",
  "Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT",
  "Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi",
  "Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo",
  "Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"
];

// ── Call /api/shipping on Vercel server ──
async function callShipping(action, payload = {}) {
  const res = await fetch('/api/shipping', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, payload })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Shipping service error');
  return data;
}

// ── GET RATES — called from cart.html ──
export async function getRates({ recipientAddress, items = [], totalWeight = 0.5 }) {
  const data = await callShipping('getRates', {
    recipientAddress,
    items,
    totalWeight
  });
  return data.rates || [];
}

// ── PICKUP INFO ──
export function getPickupInfo() {
  return {
    courier_id:   'pickup',
    courier_name: 'Store Pickup',
    delivery_fee: 0,
    eta:          'Same day (visit our store)',
    address:      STORE_ADDRESS.address
  };
}

// ── FORMAT FEE ──
export function formatDeliveryFee(fee) {
  if (!fee || fee === 0) return 'Free';
  return '₦' + Number(fee).toLocaleString('en-NG');
}

// ── ESTIMATE WEIGHT ──
export function estimateWeight(cartItems = []) {
  return Math.max(0.5, cartItems.reduce((s, i) => s + ((i.quantity || 1) * 0.3), 0));
}
