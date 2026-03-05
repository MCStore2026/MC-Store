// ============================================================
//  api/product-share.js
//  Serves product page WITH Open Graph meta tags for social sharing
//  When WhatsApp/Instagram/Twitter scrapes the link, it sees:
//  - Product image
//  - Product name + price
//  - MC Store branding
//
//  Usage: share link as /api/product-share?id=PRODUCT_ID
//  The page then redirects to /product.html?id=PRODUCT_ID for real users
// ============================================================

const SUPA_URL  = 'https://kswikkoqfpyxuurzxail.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd2lra29xZnB5eHV1cnp4YWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEzMDQsImV4cCI6MjA4NjkzNzMwNH0.uuoSKWOTeXot1HJys0EO9OcIRBL0mKrNHIUHIAPCpZ4';

export default async function handler(req, res) {
  const { id } = req.query;

  // Default fallback values
  let title       = 'MC Store — Quality Products at Great Prices';
  let description = 'Shop electronics, phones, accessories and more. Fast delivery across Nigeria.';
  let image       = 'https://kswikkoqfpyxuurzxail.supabase.co/storage/v1/object/public/product-images/og-default.jpg';
  let price       = '';
  let productUrl  = 'https://mcstore.com.ng';

  // If product ID given, fetch from Supabase
  if (id) {
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/products?id=eq.${id}&select=name,title,price,promo_price,image_url,description&limit=1`,
        { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } }
      );
      const data = await r.json();
      if (data && data.length > 0) {
        const p    = data[0];
        const name = p.name || p.title || 'Product';
        const sell = p.promo_price && p.promo_price < p.price ? p.promo_price : p.price;
        title       = `${name} — MC Store`;
        description = p.description
          ? p.description.slice(0, 160)
          : `Buy ${name} for ₦${Number(sell).toLocaleString()} on MC Store. Fast delivery across Nigeria.`;
        if (p.image_url) image = p.image_url;
        price      = `₦${Number(sell).toLocaleString()}`;
        productUrl = `https://mcstore.com.ng/product.html?id=${id}`;
      }
    } catch (e) {
      console.error('product-share fetch error:', e.message);
    }
  }

  // Serve HTML with OG tags + instant JS redirect for real users
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>

  <!-- ── Open Graph (WhatsApp, Facebook, Instagram) ── -->
  <meta property="og:type"        content="product">
  <meta property="og:title"       content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:image"       content="${escHtml(image)}">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height"content="800">
  <meta property="og:url"         content="${escHtml(productUrl)}">
  <meta property="og:site_name"   content="MC Store">
  ${price ? `<meta property="product:price:amount"   content="${escHtml(price)}">
  <meta property="product:price:currency" content="NGN">` : ''}

  <!-- ── Twitter Card ── -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image"       content="${escHtml(image)}">

  <!-- ── General SEO ── -->
  <meta name="description" content="${escHtml(description)}">

  <!-- ── Redirect real users to the actual product page ── -->
  <meta http-equiv="refresh" content="0;url=${escHtml(productUrl)}">
  <script>window.location.replace('${productUrl.replace(/'/g, "\\'")}');</script>
</head>
<body style="background:#f0f7ff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <img src="${escHtml(image)}" alt="${escHtml(title)}" style="width:120px;height:120px;object-fit:cover;border-radius:16px;margin-bottom:1rem">
    <div style="font-weight:800;font-size:1.1rem;color:#0f172a">${escHtml(title)}</div>
    ${price ? `<div style="color:#1a56db;font-size:1.2rem;font-weight:800;margin:.5rem 0">${escHtml(price)}</div>` : ''}
    <div style="color:#64748b;font-size:.85rem">Redirecting to MC Store…</div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache for 1 hour so repeated shares are fast
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(html);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
