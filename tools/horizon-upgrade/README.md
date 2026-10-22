# Horizon upgrade tooling

Scripts used to move this theme from Horizon 4.1.4 to 4.3.0 (October 2026),
kept for the next upgrade. None of them is uploaded to Shopify (`tools/` is in
`.shopifyignore`). Run them with `python -I`.

Get the stock trees from Shopify's public source, which has no release tags. Find
each version's commit by the `theme_version` in `config/settings_schema.json`:

```
git clone https://github.com/Shopify/horizon.git
git -C horizon log --format="%h %ad" --date=short -G'"theme_version"' -- config/settings_schema.json
git -C horizon archive <commit> | tar -x -C stock-OLD
```

| Script | What it answers |
|---|---|
| `footprint.py THEME OLD NEW` | Which stock files differ from the release we are on, and which of those changed upstream. Ignores Shopify's packaging (CRLF, leading blank lines, JSON header comment) |
| `merge_upstream.py THEME OLD NEW` | Takes every untouched stock file from NEW, three-way merges the listed customisations, deletes files removed upstream. Stops on any unclassified difference |
| `settings_migration.py THEME OLD NEW` | Template, group and global settings that OLD declared and NEW no longer does. Shopify strips those silently |
| `option_values.py THEME OLD NEW` | Select and radio values valid in OLD but not in NEW |
| `theme_check_compare.py OLD.json NEW.json` | Theme Check findings new in the upgraded theme (`shopify theme check --output json`) |

Lessons from 4.1.4 -> 4.3.0, which is why these exist:

- Three stock files were still on 4.1.3 a whole release after the last upgrade,
  and `base.css` matched no release. A theme reporting version X is not
  necessarily on X. Always run `footprint.py` against the real stock source.
- 4.3.0 deleted `snippets/fonts.liquid`, which the 4.1.4 layouts render. One
  stale layout surviving would have put a Liquid error on every page.
- **Shopify's updater rewrites the templates that use our own sections.** On
  4.3.0 it changed 16: `product.biotaderm` lost `product-biotaderm` for stock
  `product-information`, ten pages lost their sections for stock `main-page`,
  and `article.journal` gained a stock blog-post section above ours. The
  section files themselves came through intact, so nothing errors; pages just
  turn generic. (4.1.4 did the same to three templates.) Never take content from
  the updater's copy: push the frozen live templates onto it, then verify with
  `settings_migration.py` and a template-by-section listing.
- The updater handled code well on 4.3.0: it kept all five customisations, and
  apart from whitespace and stripped translator comments its code matched the
  three-way merge exactly.
- Liquid templates (`templates/gift_card.liquid`) are code; JSON templates are
  content. The first merge pass missed that distinction.
- Theme Check can lag the platform. 4.3.0 uses `applicable_disclosures`, a
  documented filter the bundled linter did not yet know. Confirm against
  shopify.dev, then prove it renders with `tests/storefront-regression.js`.
