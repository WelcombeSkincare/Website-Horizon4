import { CartLinesUpdateEvent } from '@shopify/events';

/**
 * Biotaderm — add a pump to one refill line.
 *
 * Any pump fits any bottle, so the cart cannot know whether a customer needs one.
 * The control is therefore an offer on each refill line rather than a single
 * cart-wide button, and one click converts exactly ONE unit, so the price printed
 * on the control is always the true price of that click.
 *
 * A refill line of two becomes one with-pump and one refill; the remaining refill
 * still carries the offer, so a customer wanting two pumps clicks twice.
 */

const SECTION_ID = 'cart-drawer-section';

async function getCart() {
  const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('cart fetch failed');
  return res.json();
}

async function addPump(button) {
  const refillId = Number(button.dataset.refillId);
  const pumpId = Number(button.dataset.pumpId);
  if (!refillId || !pumpId) return;

  button.setAttribute('aria-busy', 'true');
  try {
    const cart = await getCart();
    const refillQty = cart.items.find((i) => i.variant_id === refillId)?.quantity ?? 0;
    if (refillQty < 1) return;
    const pumpQty = cart.items.find((i) => i.variant_id === pumpId)?.quantity ?? 0;

    // Absolute quantities: move one unit across. /cart/update.js sets rather than
    // increments, so this is a single request and cannot half-apply the way a
    // remove-then-add pair can.
    const updates = { [refillId]: refillQty - 1, [pumpId]: pumpQty + 1 };

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
     * Not a wholesale replacement of the section's markup: the drawer is a <dialog>
     * opened with showModal(), so it lives in the browser's top layer. Replacing the
     * section's contents destroys that dialog and inserts a fresh, closed one, and the
     * drawer vanishes mid-click. Morphing patches the existing nodes, so the open
     * dialog survives. The same event updates the header count and the totals.
     */
    const deferred = CartLinesUpdateEvent.createPromise();
    document.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'update',
        context: 'cart',
        lines: [{ id: String(refillId), quantity: refillQty - 1 }],
        promise: deferred.promise,
      })
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
    // Always clear it. The control normally morphs away with its line, but a partial
    // failure used to leave it dimmed with pointer-events none, which is
    // indistinguishable from a control that does nothing.
    button.removeAttribute('aria-busy');
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-bd-add-pump]');
  if (button) addPump(button);
});
