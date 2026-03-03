// ============================================================
//  api/referral.js — Vercel Serverless Function
//  Actions:
//    getCode       — get or create referral code for a user
//    trackSignup   — record new user came via referral link
//    rewardReferrer — called when order marked delivered
//    getMyCoupons  — get all coupons for a user
//    validateCoupon — check if coupon is valid & return discount
//    useCoupon     — mark coupon as used on order
//    getMyReferrals — get referral history for a user
// ============================================================

const SB_URL = process.env.SUPABASE_URL        || "https://kswikkoqfpyxuurzxail.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";

const REWARD_PER_REFERRAL = 500;   // ₦500 per referral
const MILESTONE_COUNT     = 5;     // every 5 referrals
const MILESTONE_BONUS     = 2000;  // ₦2,000 milestone bonus
const COUPON_DAYS         = 14;    // expires in 14 days

const headers = {
  apikey:          SB_KEY,
  Authorization:   `Bearer ${SB_KEY}`,
  'Content-Type':  'application/json'
};

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers });
  return r.ok ? r.json() : [];
}
async function sbPost(path, body, prefer = 'return=representation') {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'POST', headers: { ...headers, Prefer: prefer },
    body: JSON.stringify(body)
  });
  return r.ok ? r.json() : null;
}
async function sbPatch(path, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  });
  return r.ok;
}

// Generate a short unique code like CHIB7X
function makeCode(uid, prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = (prefix || '').toUpperCase().slice(0, 4);
  while (code.length < 4) code += chars[Math.floor(Math.random() * chars.length)];
  // Add 4 random chars
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Generate unique coupon code like SAVE-X7K2-MC
function makeCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let part = '';
  for (let i = 0; i < 4; i++) part += chars[Math.floor(Math.random() * chars.length)];
  return `SAVE-${part}-MC`;
}

// Count delivered referrals for a user
async function countDeliveredReferrals(referrerUid) {
  const rows = await sbGet(`referrals?referrer_uid=eq.${referrerUid}&status=eq.rewarded&select=id`);
  return (rows || []).length;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.method === 'POST' ? req.body : {};
    const { action, uid, code, orderId, orderUid, referredUid, referredName, referredEmail } = body;

    // ── GET OR CREATE referral code ──
    if (action === 'getCode') {
      if (!uid) return res.status(400).json({ error: 'uid required' });
      const existing = await sbGet(`referral_codes?uid=eq.${uid}&select=code`);
      if (existing && existing[0]) return res.json({ ok: true, code: existing[0].code });
      // Create new code
      const newCode = makeCode(uid, '');
      await sbPost('referral_codes', { uid, code: newCode }, 'return=minimal');
      return res.json({ ok: true, code: newCode });
    }

    // ── TRACK SIGNUP via referral link ──
    if (action === 'trackSignup') {
      // code = referral code from URL, referredUid = new user's uid
      if (!code || !referredUid) return res.status(400).json({ error: 'code and referredUid required' });
      // Find referrer
      const codeRows = await sbGet(`referral_codes?code=eq.${code}&select=uid`);
      if (!codeRows || !codeRows[0]) return res.json({ ok: false, error: 'Invalid referral code' });
      const referrerUid = codeRows[0].uid;
      if (referrerUid === referredUid) return res.json({ ok: false, error: 'Cannot refer yourself' });
      // Check not already referred
      const already = await sbGet(`referrals?referred_uid=eq.${referredUid}&select=id`);
      if (already && already[0]) return res.json({ ok: true, alreadyTracked: true });
      // Record referral
      await sbPost('referrals', {
        referrer_uid:   referrerUid,
        referred_uid:   referredUid,
        referred_email: referredEmail || null,
        referred_name:  referredName  || null,
        status:         'pending'
      }, 'return=minimal');
      return res.json({ ok: true, referrerUid });
    }

    // ── REWARD REFERRER when order delivered ──
    if (action === 'rewardReferrer') {
      if (!orderUid) return res.status(400).json({ error: 'orderUid required' });
      // Find pending referral for this customer
      const refs = await sbGet(`referrals?referred_uid=eq.${orderUid}&status=eq.pending&select=id,referrer_uid`);
      if (!refs || !refs[0]) return res.json({ ok: false, reason: 'No pending referral found' });
      const ref = refs[0];
      // Mark referral as rewarded
      await sbPatch(`referrals?id=eq.${ref.id}`, {
        status:      'rewarded',
        order_id:    orderId || null,
        rewarded_at: new Date().toISOString()
      });
      // Count total delivered referrals for referrer
      const totalRewarded = (await countDeliveredReferrals(ref.referrer_uid)) + 1;
      const couponsToCreate = [];
      // Regular ₦500 coupon every referral
      couponsToCreate.push({ discount: REWARD_PER_REFERRAL, type: 'referral' });
      // Milestone bonus every 5th referral
      if (totalRewarded % MILESTONE_COUNT === 0) {
        couponsToCreate.push({ discount: MILESTONE_BONUS, type: 'milestone' });
      }
      // Create coupons
      const createdCoupons = [];
      const expires = new Date(Date.now() + COUPON_DAYS * 86400000).toISOString();
      for (const c of couponsToCreate) {
        const couponCode = makeCouponCode();
        await sbPost('coupons', {
          code:      couponCode,
          owner_uid: ref.referrer_uid,
          discount:  c.discount,
          type:      c.type,
          expires_at: expires,
          is_used:   false
        }, 'return=minimal');
        createdCoupons.push({ code: couponCode, discount: c.discount, type: c.type });
      }
      return res.json({ ok: true, referrerUid: ref.referrer_uid, coupons: createdCoupons, totalRewarded });
    }

    // ── GET MY COUPONS ──
    if (action === 'getMyCoupons') {
      if (!uid) return res.status(400).json({ error: 'uid required' });
      const coupons = await sbGet(
        `coupons?owner_uid=eq.${uid}&order=created_at.desc&select=*`
      );
      return res.json({ ok: true, coupons: coupons || [] });
    }

    // ── VALIDATE COUPON ──
    if (action === 'validateCoupon') {
      if (!code || !uid) return res.status(400).json({ error: 'code and uid required' });
      const rows = await sbGet(`coupons?code=eq.${code.trim().toUpperCase()}&select=*`);
      const coupon = rows && rows[0];
      if (!coupon)                          return res.json({ ok: false, error: 'Invalid coupon code' });
      if (coupon.owner_uid !== uid)         return res.json({ ok: false, error: 'This coupon belongs to a different account' });
      if (coupon.is_used)                   return res.json({ ok: false, error: 'This coupon has already been used' });
      if (new Date(coupon.expires_at) < new Date()) return res.json({ ok: false, error: 'This coupon has expired' });
      return res.json({ ok: true, discount: coupon.discount, type: coupon.type, code: coupon.code, id: coupon.id });
    }

    // ── USE COUPON (at checkout) ──
    if (action === 'useCoupon') {
      if (!code || !uid || !orderId) return res.status(400).json({ error: 'code, uid, orderId required' });
      const rows = await sbGet(`coupons?code=eq.${code}&owner_uid=eq.${uid}&select=id,discount,is_used,expires_at`);
      const coupon = rows && rows[0];
      if (!coupon)       return res.json({ ok: false, error: 'Coupon not found' });
      if (coupon.is_used) return res.json({ ok: false, error: 'Already used' });
      if (new Date(coupon.expires_at) < new Date()) return res.json({ ok: false, error: 'Expired' });
      await sbPatch(`coupons?id=eq.${coupon.id}`, {
        is_used:       true,
        used_at:       new Date().toISOString(),
        used_in_order: orderId
      });
      return res.json({ ok: true, discount: coupon.discount });
    }

    // ── GET MY REFERRALS ──
    if (action === 'getMyReferrals') {
      if (!uid) return res.status(400).json({ error: 'uid required' });
      const [refs, coupons] = await Promise.all([
        sbGet(`referrals?referrer_uid=eq.${uid}&order=created_at.desc&select=*`),
        sbGet(`coupons?owner_uid=eq.${uid}&order=created_at.desc&select=*`)
      ]);
      return res.json({ ok: true, referrals: refs || [], coupons: coupons || [] });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch(e) {
    console.error('[referral]', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
