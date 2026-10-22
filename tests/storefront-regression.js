/**
 * Biotaderm storefront regression suite.
 *
 * Runs in the browser console on biotaderm.com, against the published theme or
 * a preview theme. Shopify refuses to load storefront pages inside a frame, so
 * the interactive checks run on the real page, in STAGES. Each stage is run on
 * the page it names, and results build up in sessionStorage until `report`.
 *
 * Load this file into the console on every page (it is idempotent), then:
 *
 *   T = 189766402360   // or null for the published theme
 *   1. any page                          bdRegression.stage('static', T)
 *   2. /collections/moisturiser, desktop bdRegression.stage('collection-desktop', T)
 *   3. same page, 375px wide, reloaded   bdRegression.stage('collection-mobile', T)
 *   4. any page                          bdRegression.stage('drawer-setup', T)   then reload
 *   5. same page after the reload        bdRegression.stage('drawer', T)
 *   6. any page                          bdRegression.stage('clear', T)
 *   7. the product page it names         bdRegression.stage('product', T)
 *   8. any page                          bdRegression.stage('report', T)  -> JSON
 *
 * Append ?preview_theme_id=T to every URL when testing a preview theme. Each
 * stage refuses to score a page served by a different theme than T.
 *
 * WARNING: it empties the cart of the browser it runs in and resets the Appstle
 * `_apdData` cart attribute. Use a test browser session.
 *
 * Compare two reports with `python tests/compare.py OLD.json NEW.json`.
 *
 * Built 22 Oct 2026 for the Horizon 4.1.4 -> 4.3.0 upgrade. Every check maps to
 * something fixed or built on this store; see the git history for the why.
 */
(function () {
  const KEY = 'bdRegression';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = () => JSON.parse(sessionStorage.getItem(KEY) || '{"results":[],"meta":{}}');
  const save = (s) => sessionStorage.setItem(KEY, JSON.stringify(s));

  const money = (t) => (String(t || '').match(/£\s?\d+(\.\d\d)?/) || [null])[0];
  const lum = (rgb) => {
    const c = rgb
      .match(/\d+(\.\d+)?/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
  };
  const click = (el) => el.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true, composed: true }));
  const cart = async () => (await fetch('/cart.js')).json();
  // Horizon persists an open drawer across page loads (storage key
  // `theme-drawer-open`), and quick add will not open over an open drawer. So
  // every cleanup closes drawers and forgets that state, or one stage's
  // add-to-cart leaves the drawer open and fails the next stage's quick add.
  const closeDrawers = () => {
    document.querySelectorAll('theme-drawer').forEach((d) => {
      if (d.isOpen && typeof d.close === 'function') d.close();
    });
    sessionStorage.removeItem('theme-drawer-open');
    localStorage.removeItem('theme-drawer-open');
  };
  const clearCart = async () => {
    closeDrawers();
    await fetch('/cart/clear.js', { method: 'POST' });
    await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: { _apdData: '' } }),
    });
  };
  const servedTheme = (html) => {
    const raw = (html.match(/Shopify\.theme\s*=\s*(\{[^;]*?\});/) || [])[1];
    try {
      const t = JSON.parse(raw);
      return { id: t.id, name: t.name, schema: t.schema_name, version: t.schema_version, role: t.role };
    } catch (e) {
      return null;
    }
  };

  async function stage(name, themeId = null) {
    const s = store();
    const add = (area, id, ok, value) => {
      s.results = s.results.filter((r) => r.id !== id);
      s.results.push({ area, id, ok, value, stage: name });
    };
    const url = (path) => (themeId ? path + (path.includes('?') ? '&' : '?') + 'preview_theme_id=' + themeId : path);
    const getDoc = async (path) => {
      const res = await fetch(url(path), { credentials: 'same-origin' });
      const html = await res.text();
      return { status: res.status, html, doc: new DOMParser().parseFromString(html, 'text/html') };
    };
    const safe = async (area, id, fn) => {
      try {
        await fn();
      } catch (e) {
        add(area, id, false, 'ERROR: ' + (e && e.message ? e.message : e));
      }
    };
    // Guard: the page in front of us must be the theme under test.
    const live = window.Shopify && window.Shopify.theme;
    const pageOk = !live || (themeId ? String(live.id) === String(themeId) : live.role === 'main');
    if (!pageOk && !['static', 'drawer-setup', 'clear', 'report'].includes(name)) {
      add('harness', 'theme guard ' + name, false, `page served by #${live.id} ${live.name}, expected ${themeId || 'the published theme'}`);
      save(s);
      return { stage: name, error: 'wrong theme on this page' };
    }

    if (name === 'static') {
      s.results = [];
      const home = await getDoc('/');
      s.meta = { url: location.origin, requestedThemeId: themeId, started: new Date().toISOString(), served: servedTheme(home.html) };
      const pages = [
        ['/', '.bd-hh'],
        ['/pages/faq', '.bd-faq'],
        ['/pages/about-us', '.bd-ab'],
        ['/pages/contact', '.bd-cp'],
        ['/pages/our-science', '.bd-sc'],
        ['/pages/how-we-formulate', '.bd-sci'],
        ['/pages/the-skin-microbiome', '.bd-sci'],
        ['/pages/how-we-handle-evidence', '.bd-sci'],
        ['/pages/everything-on-the-label', '.bd-sci'],
        ['/pages/our-ethics', '.bd-sci'],
        ['/pages/opening-offer', '.bd-of'],
        ['/pages/cookie-policy', '.bd-pol'],
        ['/pages/find-your-skin-type', 'main'],
        ['/blogs/journal', '.bd-jx'],
        ['/blogs/journal/how-to-read-an-ingredient-list', '.bd-jp'],
        ['/blogs/ingredients', '.bd-ix'],
        ['/blogs/ingredients/dragon-fruit-hylocereus-undatus-seed-oil', '.bd-ing'],
        ['/cart', 'main'],
        ['/search?q=moisturiser', 'main'],
      ];
      for (const [path, sel] of pages) {
        await safe('pages', 'page ' + path, async () => {
          const p = path === '/' ? home : await getDoc(path);
          const liquidErr = /Liquid (syntax )?error|Could not find (asset|snippet)/i.test(p.html);
          const present = !!p.doc.querySelector(sel);
          add('pages', 'page ' + path, p.status === 200 && present && !liquidErr,
            `status ${p.status}, ${sel} ${present ? 'present' : 'MISSING'}${liquidErr ? ', LIQUID ERROR' : ''}`);
        });
      }
      await safe('content', 'announcement bar', async () => {
        const el = home.doc.querySelector('[id*="header_announcements"]');
        // The section carries inline <style>; read the visible text only.
        const copy = el ? el.cloneNode(true) : null;
        if (copy) copy.querySelectorAll('style, script').forEach((n) => n.remove());
        const text = copy ? copy.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : null;
        add('content', 'announcement bar', text ? null : false, text || 'MISSING');
      });
      await safe('apps', 'app embeds in HTML', async () => {
        const h = home.html.toLowerCase();
        const found = ['pandectes', 'omnisend', 'appstle'].filter((k) => h.includes(k));
        add('apps', 'app embeds in HTML', found.length === 3, found.join(', ') || 'none');
      });
      for (const h of ['moisturiser', 'all-products', 'dry-skin-type', 'balanced-skin-type', 'core-texture', 'flow-texture', 'deep-texture']) {
        await safe('collections', 'collection ' + h, async () => {
          const p = await getDoc('/collections/' + h);
          const ratios = [...new Set([...p.doc.querySelectorAll('[data-image-ratio]')].map((e) => e.dataset.imageRatio))];
          const cards = p.doc.querySelectorAll('product-card').length;
          add('collections', 'collection ' + h, p.status === 200 && cards > 0 && ratios.length === 1 && ratios[0] === 'square',
            `${cards} cards, ratio ${ratios.join('/') || 'none'}`);
        });
      }
      const product = (await (await fetch(url('/products.json?limit=1'))).json()).products[0];
      s.meta.productPath = '/products/' + product.handle;
      await safe('product', 'product page hooks', async () => {
        const p = await getDoc(s.meta.productPath);
        const need = ['[data-product-grid-content]', '.product-details', 'variant-picker', 'product-form-component', 'product-price', '.view-product-title'];
        const missing = need.filter((x) => !p.doc.querySelector(x));
        add('product', 'product page hooks', missing.length === 0, missing.length ? 'MISSING ' + missing.join(', ') : 'all quick-add hooks present');
        const btn = p.doc.querySelector('product-form-component button[name="add"]');
        const label = btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null;
        add('product', 'add button label', label === 'Add to bag', label || 'MISSING');
        const pickup = !!p.doc.querySelector('local-pickup');
        add('product', 'pickup panel absent', !pickup, pickup ? 'pickup panel PRESENT' : 'absent');
      });
      await clearCart();
    }

    if (name === 'collection-desktop') {
      if (innerWidth < 750) {
        add('harness', 'desktop viewport', false, `viewport ${innerWidth}px; the desktop stage needs at least 750px`);
        save(s);
        return { stage: name, error: 'viewport too narrow for the desktop stage' };
      }
      closeDrawers();
      await sleep(500);
      await safe('quick-add', 'collection-desktop stage', async () => {
        const hero = [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Find your skin type');
        if (hero) {
          const cs = getComputedStyle(hero);
          const ratio = contrast(cs.color, cs.backgroundColor);
          add('collections', 'hero button contrast', ratio >= 4.5, `${ratio}:1 (${cs.color} on ${cs.backgroundColor})`);
        } else {
          add('collections', 'hero button contrast', false, 'hero button not found');
        }
        click(document.querySelector('quick-add-component button'));
        await sleep(4500);
        const dlg = document.querySelector('dialog.quick-add-modal');
        const m = document.getElementById('quick-add-modal-content');
        const price = m.querySelector('product-price');
        const det = m.querySelector('.product-details');
        const radios = m.querySelectorAll('variant-picker input[type=radio]');
        const dr = dlg.getBoundingClientRect();
        const mr = det ? det.getBoundingClientRect() : { height: 0 };
        const titleEl = m.querySelector('.view-product-title') || m.querySelector('.product-header a');
        const title = titleEl ? titleEl.textContent.trim() : '';
        add('quick-add', 'modal opens populated', !!(dlg.open && m.children.length), dlg.open ? `open, ${m.children.length} child` : 'NOT OPEN');
        add('quick-add', 'modal title', !!title, title || 'MISSING');
        add('quick-add', 'modal price visible', !!(price && getComputedStyle(price).display !== 'none' && money(price.textContent)), money(price && price.textContent) || 'MISSING');
        add('quick-add', 'modal options', radios.length >= 2, radios.length + ' options');
        add('quick-add', 'modal layout desktop', dr.width > 300 && dr.width <= 520 && dr.height - mr.height <= 8,
          `${Math.round(dr.width)}x${Math.round(dr.height)}, dead space ${Math.round(dr.height - mr.height)}px (viewport ${innerWidth}px)`);
        const other = [...radios].find((r) => !r.checked);
        if (other) {
          other.click();
          await sleep(2000);
        }
        const idInput = m.querySelector('product-form-component input[name="id"]');
        const chosen = idInput ? idInput.value : null;
        click(m.querySelector('product-form-component button[name="add"]'));
        await sleep(5000);
        const c = await cart();
        add('quick-add', 'adds the chosen variant', c.items.some((i) => String(i.variant_id) === chosen), c.items.map((i) => i.variant_title).join(', ') || 'cart empty');
        const drawer = document.getElementById('cart-drawer');
        add('cart', 'drawer auto-opens after quick add', !!(drawer && drawer.isOpen), drawer && drawer.isOpen ? 'open' : 'closed');
      });
      await clearCart();
    }

    if (name === 'collection-mobile') {
      closeDrawers();
      await sleep(500);
      await safe('quick-add', 'collection-mobile stage', async () => {
        click(document.querySelector('quick-add-component button'));
        await sleep(4500);
        const dlg = document.querySelector('dialog.quick-add-modal');
        const price = document.querySelector('#quick-add-modal-content product-price');
        const width = Math.round(dlg.getBoundingClientRect().width);
        add('quick-add', 'modal layout mobile', innerWidth < 750 && dlg.open && width >= innerWidth - 5 && !!money(price && price.textContent),
          `viewport ${innerWidth}px, ${dlg.open ? 'open' : 'NOT OPEN'}, ${width}px wide, price ${money(price && price.textContent) || 'MISSING'}`);
      });
    }

    if (name === 'drawer-setup') {
      await clearCart();
      const prod = await (await fetch(url(s.meta.productPath + '.js'))).json();
      const bottle = prod.variants.find((v) => /refill|bottle only/i.test(v.title) && !/pump/i.test(v.title));
      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: bottle.id, quantity: 2 }] }),
      });
      save(s);
      return { stage: name, next: 'reload this page, then run the drawer stage' };
    }

    if (name === 'drawer') {
      await safe('cart', 'drawer stage', async () => {
        const drawer = document.getElementById('cart-drawer');
        drawer.open();
        await sleep(4000);
        for (const [sel, label] of [
          ['.bd-progress', 'delivery progress'],
          ['.bd-refill-notice', 'bottle-only notice'],
          ['.bd-dispatch-line', 'dispatch line'],
          ['.bd-trial-line', 'trial line'],
        ]) {
          const el = document.querySelector('#cart-drawer ' + sel);
          add('cart', label, !!el, el ? 'present' : 'MISSING');
        }
        const ap = document.querySelectorAll('#cart-drawer [class*="ap-"]').length;
        add('apps', 'Appstle delivery selector in drawer', ap > 0, ap + ' Appstle elements');
        const widget = window.pandectesBannerSettings && window.pandectesBannerSettings.widget;
        add('apps', 'Pandectes reopener enabled', !!(widget && widget.enabled === true), JSON.stringify(widget || null));
        const offer = document.querySelector('#cart-drawer [data-bd-add-pump]');
        add('cart', 'per-line pump offer', !!offer && /\+£1\.00/.test(offer.textContent), offer ? offer.textContent.replace(/\s+/g, ' ').trim() : 'MISSING');
        if (offer) {
          const dlg = drawer.querySelector('dialog');
          click(offer);
          await sleep(5000);
          const drawer2 = document.getElementById('cart-drawer');
          const dlg2 = drawer2 && drawer2.querySelector('dialog');
          const c = await cart();
          add('cart', 'pump offer keeps drawer open', dlg2 === dlg && dlg2.open && dlg2.matches(':modal'),
            dlg2 === dlg ? (dlg2.open ? 'same dialog, open' : 'same dialog, CLOSED') : 'dialog REPLACED');
          add('cart', 'pump offer converts one unit', c.items.length === 2 && c.items.every((i) => i.quantity === 1),
            c.items.map((i) => `${i.variant_title} x${i.quantity}`).join(', '));
          const left = document.querySelectorAll('#cart-drawer [data-bd-add-pump]').length;
          add('cart', 'offer remains on the remaining bottle', left === 1, left + ' offer(s)');
        }
      });
      await clearCart();
    }

    if (name === 'clear') {
      await clearCart();
      save(s);
      return { stage: name, next: 'open ' + s.meta.productPath + ' and run the product stage' };
    }

    if (name === 'product') {
      await safe('product', 'product stage', async () => {
        const buy = document.querySelector('.bd-buyblock');
        const pp = buy.querySelector('product-price');
        const before = money(pp.textContent);
        const other = [...buy.querySelectorAll('variant-picker input[type=radio]')].find((r) => !r.checked);
        if (other) {
          other.click();
          await sleep(2500);
        }
        const after = money(pp.textContent);
        const stickyEl = document.querySelector('.bd-bar__buy [data-bd-price]');
        const sticky = money(stickyEl && stickyEl.textContent);
        add('product', 'price updates on variant change', !!before && !!after && before !== after, `${before} -> ${after}`);
        add('product', 'sticky bar price in sync', !!sticky && sticky === after, `sticky ${sticky}, buy block ${after}`);
        add('product', 'safety line present', !!document.querySelector('.bd-assure'), document.querySelector('.bd-assure') ? 'present' : 'MISSING');
        click(buy.querySelector('product-form-component button[name="add"]'));
        await sleep(5000);
        const c = await cart();
        const drawer = document.getElementById('cart-drawer');
        add('product', 'add to bag', c.item_count === 1, c.item_count + ' item(s) in cart');
        add('cart', 'drawer auto-opens after add to bag', !!(drawer && drawer.isOpen), drawer && drawer.isOpen ? 'open' : 'closed');
        const icon = document.querySelector('cart-icon');
        const badge = icon ? (icon.textContent.match(/\d+/) || [null])[0] : null;
        add('cart', 'header count updates', badge === String(c.item_count), `badge ${badge}, cart ${c.item_count}`);
      });
      await clearCart();
    }

    if (name === 'report') {
      await clearCart();
      s.meta.finished = new Date().toISOString();
      const scored = s.results.filter((r) => r.ok !== null);
      s.summary = {
        passed: scored.filter((r) => r.ok).length,
        failed: scored.filter((r) => !r.ok).length,
        info: s.results.length - scored.length,
        failures: scored.filter((r) => !r.ok).map((r) => r.id),
      };
      save(s);
      return s;
    }

    save(s);
    const mine = s.results.filter((r) => r.stage === name);
    return { stage: name, passed: mine.filter((r) => r.ok).length, failed: mine.filter((r) => r.ok === false).map((r) => r.id) };
  }

  window.bdRegression = { stage };
})();
