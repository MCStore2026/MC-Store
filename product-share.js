// api/product-share.js
// Makes product links show image + title + price when shared on WhatsApp
// exactly like Jumia does

const SUPA_URL  = 'https://kswikkoqfpyxuurzxail.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd2lra29xZnB5eHV1cnp4YWlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEzMDQsImV4cCI6MjA4NjkzNzMwNH0.uuoSKWOTeXot1HJys0EO9OcIRBL0mKrNHIUHIAPCpZ4';

export default async function handler(req, res) {
  const { id } = req.query;

  let name        = 'MC Store';
  let description = 'Shop electronics, phones, accessories and more. Fast delivery across Nigeria.';
  let image       = 'https://mc-store-sigma.vercel.app/favicon.ico';
  let priceText   = '';
  let productUrl  = 'https://mc-store-sigma.vercel.app';
  let siteName    = 'mcstore.com.ng';

  if (id) {
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=name,title,price,promo_price,image_url,description&limit=1`,
        { headers: { apikey: SUPA_ANON, Authorization: `Bearer ${SUPA_ANON}` } }
      );
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const p   = rows[0];
        name      = p.name || p.title || 'Product';
        const sell = (p.promo_price && p.promo_price < p.price) ? p.promo_price : p.price;
        priceText  = `₦${Number(sell).toLocaleString()}`;

        // Description: price first (like Jumia), then product description
        description = `${priceText} — ${p.description ? p.description.slice(0, 120) : `Buy ${name} on MC Store. Fast delivery across Nigeria.`}`;

        if (p.image_url) image = p.image_url;
        productUrl = `https://mc-store-sigma.vercel.app/product.html?id=${id}`;
      }
    } catch (e) {
      console.error('product-share error:', e.message);
    }
  }

  const title = `${name} | MC Store`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>

<!-- WhatsApp / Facebook / Instagram preview -->
<meta property="og:type"         content="product">
<meta property="og:site_name"    content="${esc(siteName)}">
<meta property="og:title"        content="${esc(name)}">
<meta property="og:description"  content="${esc(description)}">
<meta property="og:image"        content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:width"  content="800">
<meta property="og:image:height" content="800">
<meta property="og:image:type"   content="image/jpeg">
<meta property="og:url"          content="${esc(productUrl)}">

<!-- Twitter -->
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:title"       content="${esc(name)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image"       content="${esc(image)}">

<!-- SEO -->
<meta name="description" content="${esc(description)}">

<!-- Instant redirect for real users — bots stay and read OG tags above -->
<meta http-equiv="refresh" content="0;url=${esc(productUrl)}">
<script>window.location.replace("${productUrl.replace(/"/g, '\\"')}");</script>
</head>
<body style="margin:0;background:#f0f7ff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="text-align:center;padding:2rem;max-width:320px">
    <img src="${esc(image)}" alt="${esc(name)}"
         style="width:160px;height:160px;object-fit:cover;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.15);margin-bottom:1rem">
    <div style="font-size:1.1rem;font-weight:800;color:#0f172a;margin-bottom:.4rem">${esc(name)}</div>
    ${priceText ? `<div style="font-size:1.4rem;font-weight:800;color:#1a56db;margin-bottom:.5rem">${esc(priceText)}</div>` : ''}
    <div style="font-size:.85rem;color:#64748b;margin-bottom:1.2rem">${esc(siteName)}</div>
    <div style="font-size:.8rem;color:#94a3b8">Opening product page…</div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // No cache — so every new price/image update shows immediately
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.status(200).send(html);
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
