# Customisations to stock Horizon

This theme is Horizon **4.1.4** plus Biotaderm customisations.

The goal is that **every custom thing lives in a file Shopify does not ship**, so a
theme update can never silently revert it. There is currently **one** exception,
documented below. Check it after every Horizon update.

> **That goal is necessary but not sufficient - JSON templates are also at risk.**
> The 4.1.3 -> 4.1.4 update (11 Aug 2026) created a *new theme with a new ID*
> rather than upgrading in place, and rewrote three of our templates back to
> stock sections: `product.biotaderm.json` (`product-biotaderm` ->
> `product-information`), `blog.ingredients-index.json` (`ingredients-index` ->
> `main-blog`), and `article.ingredient.json` (a stock `main-blog-post` inserted
> above our `ingredient-page`). Shopify flagged none of it as a conflict.
>
> Our custom `sections/*.liquid` files were left completely untouched - only the
> templates that *reference* them were rewritten. So the pages quietly stop using
> our sections while nothing appears missing from a file listing.
>
> **After every Horizon update, compare the section `type` values inside
> `templates/*.json` against git - not just the file list.** Restoring is simply a
> matter of pushing the templates back from the repo.

---

## The one edited stock file

### `sections/section.liquid`

Adds a third option to the `section_width` select (around line 178):

```json
{
  "value": "page-width-content",
  "label": "Content width"
}
```

**Why it cannot live elsewhere.** A merchant-selectable option has to exist in the
schema of the section it belongs to, and `section_width` is a setting on Horizon's
own generic `section`. There is no hook for adding one from outside.

**Why it is only four lines.** The two supporting pieces were deliberately moved
out of stock files:

| Piece | Lives in | Note |
|---|---|---|
| The CSS that makes the option work | `sections/footer-main.liquid` (ours) | `.section--page-width-content`, in that file's `{% stylesheet %}` |
| The option's label | the schema itself | A literal string, so `locales/en.default.schema.json` stays stock |

**How it works.** Stock `snippets/section.liquid` renders `section--{{ section_width }}`,
so selecting this option emits `.section--page-width-content`. Stock CSS does not
define that class, so we define it in `footer-main.liquid` — which renders on every
page via the footer group, and whose `{% stylesheet %}` Shopify bundles into the
theme stylesheet loaded in `<head>`. The rule mirrors `.page-width-content` in
`assets/base.css`; keep the two in sync if Horizon ever changes those values.

**Used by** 29 sections across 9 templates: all eight `collection.collection-*.json`
and `page.find-your-skin-type.json`. Losing it silently would widen those pages from
a 672px reading column to full page width.

### After a Horizon update

1. Check the option is still present in `sections/section.liquid`. Re-add if not.
2. Confirm a content-width section still computes a 672px central column
   (`getComputedStyle(el).gridTemplateColumns` should read `<n>px 672px <n>px`).

---

## Diffing this theme against stock Horizon

A naive `diff` reports ~190 changed files. Almost all are artefacts of how the
Shopify CLI stores files, not real edits:

- **CRLF vs LF** — GitHub checks out CRLF, the CLI pulls LF
- **Two leading blank lines** added to every `blocks/` and `sections/` file
- **A 9-line auto-generated header** injected into all 50 `locales/*.json`
- **A missing trailing newline** on `config/settings_schema.json`

Use this instead:

```bash
git clone https://github.com/Shopify/horizon.git horizon-stock
diff -B --strip-trailing-cr horizon-stock/sections/section.liquid sections/section.liquid
```

`-B` (ignore blank lines) and `--strip-trailing-cr` remove the noise. Horizon has no
version tags — `main` tracks the current release, so check
`config/settings_schema.json` → `theme_version` matches before trusting a comparison.

Exclude from any comparison, as these are merchant data and are *meant* to differ:
`config/settings_data.json`, `templates/*`, `sections/*-group.json`.

---

## Our own files

Safe from theme updates. Nothing here needs checking after an upgrade.

**Sections (11)** — `footer-main`, `home-ethos-strip`, `home-formulation`,
`home-hero`, `home-image-text-band`, `home-newsletter`, `home-skin-sorter`,
`home-texture-ladder`, `ingredient-page`, `ingredients-index`, `product-biotaderm`

**Snippets (1)** — `home-organic-shape`

**Assets (13)** — `ethos-*.svg` (8), `home-*-standin.jpg` (3), `logo-horizontal-*.svg` (2)

**Templates (18)** — the eight `collection.collection-*.json`, the ingredient and
blog templates, `page.find-your-skin-type.json`, `product.biotaderm.json`

Note that `bento-grid`, `grid-density-controls`, `chat-drawer` and the three
`editorial-*-grid` snippets are **stock Horizon**, not ours — do not edit them.

---

## Known issues

- **Duplicated collection templates.** The eight `collection.collection-*.json`
  files total ~320KB and encode near-identical structure once per skin type and
  texture. Changing the collection layout means repeating the edit eight times.
  Worth collapsing to one template with the variation moved to collection metafields.
- **Orphaned templates.** `article.ingedients-blog-post.json` (note the typo) appears
  to duplicate `article.ingredient-post.json`; `blog.ingredients-template.json` and
  `blog.ingredients-template2.json` both duplicate `blog.json`. Verify they are
  unassigned before deleting.
