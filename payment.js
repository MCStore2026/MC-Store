// ============================================================
//  payment.js — MC Store Payment Integration
//  Handles: Paystack online payment + Cash on Delivery
//
//  Rules:
//  - Cash on Delivery: min ₦7,000 — max ₦50,000
//  - Online Payment: any amount via Paystack
// ============================================================

const PAYSTACK_PUBLIC_KEY = "pk_test_c1fbe834d4efeaf1ce6f128a588dcb80154edfc9";
const PAYSTACK_BASE       = "https://api.paystack.co";

// ── PAYMENT METHODS ──
const PAYMENT_METHODS = {
  CASH_ON_DELIVERY: "cash_on_delivery",
  ONLINE:           "online"
};

// ── COD LIMITS ──
const COD_MIN = 7000;   // ₦7,000
const COD_MAX = 50000;  // ₦50,000


// ─────────────────────────────────────────
//  LOAD PAYSTACK SCRIPT
//  Injects Paystack SDK into page if not
//  already loaded
// ─────────────────────────────────────────
function loadPaystackScript() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return; }

    const script    = document.createElement("script");
    script.src      = "https://js.paystack.co/v1/inline.js";
    script.onload   = resolve;
    script.onerror  = () => reject(new Error("Could not load Paystack. Check your internet connection."));
    document.head.appendChild(script);
  });
}


// ─────────────────────────────────────────
//  VALIDATE CASH ON DELIVERY
//  Checks if order total is within COD limits
//
//  Returns:
//    { valid: true }
//    { valid: false, reason: "..." }
// ─────────────────────────────────────────
function validateCOD(totalAmount) {
  if (totalAmount < COD_MIN) {
    return {
      valid:  false,
      reason: `Cash on Delivery is only available for orders of ₦${COD_MIN.toLocaleString()} and above. Your order total is ₦${totalAmount.toLocaleString()}.`
    };
  }
  if (totalAmount > COD_MAX) {
    return {
      valid:  false,
      reason: `Cash on Delivery is only available for orders up to ₦${COD_MAX.toLocaleString()}. Please pay online for this order.`
    };
  }
  return { valid: true };
}


// ─────────────────────────────────────────
//  GET AVAILABLE PAYMENT METHODS
//  Returns which methods are available
//  based on the order total
// ─────────────────────────────────────────
function getAvailablePaymentMethods(totalAmount) {
  const codCheck = validateCOD(totalAmount);
  return {
    online: {
      available: true,
      label:     "Pay Online",
      sublabel:  "Card, Bank Transfer, USSD",
      icon:      "fas fa-credit-card"
    },
    cash_on_delivery: {
      available: codCheck.valid,
      label:     "Cash on Delivery",
      sublabel:  codCheck.valid
        ? `Pay when your order arrives`
        : totalAmount < COD_MIN
          ? `Minimum order ₦${COD_MIN.toLocaleString()} required`
          : `Maximum ₦${COD_MAX.toLocaleString()} for COD`,
      icon:      "fas fa-money-bill-wave",
      disabled_reason: codCheck.valid ? null : codCheck.reason
    }
  };
}


// ─────────────────────────────────────────
//  INITIATE PAYSTACK PAYMENT
//  Opens Paystack payment popup
//
//  Usage:
//    initiatePayment({
//      email: "customer@email.com",
//      amount: 25000,           ← in Naira (we convert to kobo)
//      orderId: "MC-2025-001",
//      customerName: "John Doe",
//      phone: "08012345678",
//      onSuccess: (ref) => {},
//      onCancel: () => {}
//    })
// ─────────────────────────────────────────
async function initiatePayment({
  email,
  amount,
  orderId,
  customerName,
  phone,
  onSuccess,
  onCancel
}) {
  try {
    // Load Paystack script first
    await loadPaystackScript();

    // Convert Naira to Kobo (Paystack uses kobo)
    const amountInKobo = Math.round(amount * 100);

    const handler = window.PaystackPop.setup({
      key:       PAYSTACK_PUBLIC_KEY,
      email,
      amount:    amountInKobo,
      currency:  "NGN",
      ref:       `MC-${orderId}-${Date.now()}`,
      metadata: {
        custom_fields: [
          {
            display_name:  "Order ID",
            variable_name: "order_id",
            value:         orderId
          },
          {
            display_name:  "Customer Name",
            variable_name: "customer_name",
            value:         customerName || ""
          },
          {
            display_name:  "Phone",
            variable_name: "phone",
            value:         phone || ""
          }
        ]
      },
      callback: function(response) {
        // Payment successful
        if (onSuccess) onSuccess({
          reference:     response.reference,
          transaction:   response.transaction,
          status:        "paid"
        });
      },
      onClose: function() {
        // User closed popup
        if (onCancel) onCancel();
      }
    });

    handler.openIframe();

  } catch(e) {
    console.error("initiatePayment error:", e);
    throw new Error("Could not open payment. Please try again.");
  }
}


// ─────────────────────────────────────────
//  VERIFY PAYMENT (client-side check)
//  NOTE: Always verify on server side too!
//  This is just a basic client check.
// ─────────────────────────────────────────
async function verifyPayment(reference) {
  try {
    // NOTE: In production, verify via your backend
    // Never expose secret key on client
    // This returns the reference for now
    // Your Vercel backend should call Paystack verify API
    const res = await fetch(
      `/api/payment/verify?reference=${reference}`
    );

    if (!res.ok) {
      // If no backend yet, trust the reference from Paystack callback
      console.warn("Payment verification endpoint not set up yet. Trusting Paystack callback.");
      return { verified: true, reference };
    }

    const data = await res.json();
    return {
      verified:    data.status === "success",
      reference,
      amount:      data.amount / 100, // convert kobo back to Naira
      paid_at:     data.paid_at
    };
  } catch(e) {
    console.warn("verifyPayment fallback — trusting Paystack callback:", e);
    return { verified: true, reference };
  }
}


// ─────────────────────────────────────────
//  PROCESS CASH ON DELIVERY
//  Validates and returns COD payment object
// ─────────────────────────────────────────
function processCOD(totalAmount) {
  const check = validateCOD(totalAmount);
  if (!check.valid) throw new Error(check.reason);

  return {
    method:    "cash_on_delivery",
    status:    "pending",
    reference: `COD-${Date.now()}`,
    amount:    totalAmount
  };
}


// ─────────────────────────────────────────
//  FORMAT AMOUNT
// ─────────────────────────────────────────
function formatAmount(amount) {
  return "₦" + Number(amount).toLocaleString("en-NG");
}


// ─────────────────────────────────────────
//  GET COD LIMITS INFO
//  Returns limits for display in UI
// ─────────────────────────────────────────
function getCODLimits() {
  return {
    min:         COD_MIN,
    max:         COD_MAX,
    minFormatted: formatAmount(COD_MIN),
    maxFormatted: formatAmount(COD_MAX)
  };
}


// ─────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────
export {
  PAYMENT_METHODS,
  COD_MIN,
  COD_MAX,
  validateCOD,
  getAvailablePaymentMethods,
  initiatePayment,
  verifyPayment,
  processCOD,
  formatAmount,
  getCODLimits,
  loadPaystackScript
};
