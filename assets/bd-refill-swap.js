import { CartLinesUpdateEvent } from '@shopify/events';

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

const SECTION_ID = 'cart-drawer-section';

async function swapAll(button) {
  button.setAttribute('aria-busy', 'true');
  try {
    const cart = await getCart();
    const updates = {};
    const lines = [];

    for (const line of cart.items) {
      if (!String(line.variant_title || '').toLowerCase().includes(REFILL)) continue;
      const product = await getProduct(line.handle);
      const pump = findPumpVariant(product, line);
      if (!pump) continue;
      updates[line.variant_id] = 0;
      updates[pump.id] = (updates[pump.id] || 0) + line.quantity;
      lines.push({ id: line.key, quantity: line.quantity });
    }

    if (Object.keys(updates).length === 0) return;

    // Ask Shopify to render the drawer section as part of the mutation, so the updated
    // markup arrives with the cart rather than needing a second request for it.
    const res = await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ updates, sections: SECTION_ID, sections_url: window.location.pathname }),
    });
    if (!res.ok) throw new Error('cart update failed');
    const updated = await res.json();

    /*
     * Hand the rendered section to the theme and let cart-items-component morph it.
     *
     * This replaced a wholesale replacement of the section's markup, which worked on
     * the cart page but broke the drawer. The drawer is a <dialog> opened with
     * showModal(), so it lives in the top layer; swapping the section's contents
     * destroyed that dialog and inserted a fresh, closed one. The drawer vanished
     * mid-click and the swap it had just completed stayed invisible until the customer
     * reopened the cart, which read as "the button does nothing".
     *
     * Morphing patches the existing nodes rather than replacing them, so the open
     * dialog survives. cart-items-component morphs whenever the event carries
     * `detail.sections`, and that same event updates the header count and the totals.
     */
    const deferred = CartLinesUpdateEvent.createPromise();
    document.dispatchEvent(
      new CartLinesUpdateEvent({ action: 'update', context: 'cart', lines, promise: deferred.promise })
    );
    deferred.resolve({
      cart: CartLinesUpdateEvent.createCartFromAjaxResponse(updated),
      detail: {
        sections: updated.sections,
        items: updated.items,
        itemCount: updated.item_count,
        source: 'bd-refill-swap',
        didError: false,
      },
    });
  } catch (error) {
    console.error('[bd-refill-swap]', error);
  } finally {
    // Always clear it. The notice normally morphs away with the refill line, but a
    // partial failure used to leave the button stuck at opacity .6 / pointer-events
    // none, which is indistinguishable from a dead button.
    button.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-bd-refill-swap]');
  if (button) swapAll(button);
});
