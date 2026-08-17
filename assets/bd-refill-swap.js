/**
 * Biotaderm — swap every "Refill Bottle only" line to "Bottle with Pump" in place.
 *
 * The single most valuable interaction in the cart brief: the customer stays in
 * the drawer, the line changes variant, the delivery progress recalculates.
 *
 * Matching is by option VALUE, not by position, so it survives a product whose
 * options are ordered differently.
 */

const REFILL = 'refill';
const PUMP = 'pump';

async function getCart() {
  const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('cart fetch failed');
  return res.json();
}

const productCache = new Map();

async function getProduct(handle) {
  if (productCache.has(handle)) return productCache.get(handle);
  const res = await fetch('/products/' + handle + '.js', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('product fetch failed: ' + handle);
  const product = await res.json();
  productCache.set(handle, product);
  return product;
}

/** The pump variant that matches this line on every other option. */
function findPumpVariant(product, line) {
  const wanted = (line.options_with_values || []).map((o) => String(o.value));
  const refillIndex = wanted.findIndex((v) => v.toLowerCase().includes(REFILL));
  if (refillIndex === -1) return null;

  return (
    product.variants.find((variant) => {
      const options = variant.options.map(String);
      if (options.length !== wanted.length) return false;
      return options.every((value, i) =>
        i === refillIndex ? value.toLowerCase().includes(PUMP) : value === wanted[i]
      );
    }) || null
  );
}

/** Re-render the drawer from the Section Rendering API; reload if that fails. */
async function refreshDrawer() {
  const host = document.getElementById('shopify-section-cart-drawer-section');
  if (!host) return window.location.reload();
  try {
    const res = await fetch('/?sections=cart-drawer-section');
    const sections = await res.json();
    const markup = sections['cart-drawer-section'];
    if (!markup) throw new Error('no section markup');
    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const next = parsed.getElementById('shopify-section-cart-drawer-section') || parsed.body.firstElementChild;
    host.innerHTML = next.innerHTML;
    document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
  } catch (error) {
    console.warn('[bd-refill-swap] section render failed, reloading', error);
    window.location.reload();
  }
}

async function swapAll(button) {
  button.setAttribute('aria-busy', 'true');
  try {
    const cart = await getCart();
    const updates = {};

    for (const line of cart.items) {
      if (!String(line.variant_title || '').toLowerCase().includes(REFILL)) continue;
      const product = await getProduct(line.handle);
      const pump = findPumpVariant(product, line);
      if (!pump) continue;
      updates[line.variant_id] = 0;
      updates[pump.id] = (updates[pump.id] || 0) + line.quantity;
    }

    if (Object.keys(updates).length === 0) return;

    const res = await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (!res.ok) throw new Error('cart update failed');

    await refreshDrawer();
  } catch (error) {
    console.error('[bd-refill-swap]', error);
    button.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-bd-refill-swap]');
  if (button) swapAll(button);
});
