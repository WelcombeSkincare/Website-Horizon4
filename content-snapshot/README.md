# Content snapshot

Theme **code** is version-controlled by the Shopify CLI and lives in this repo.
Store **content** — metafields, metaobjects, page bodies — lives only in Shopify
and has no history. Change a product description or an ingredient table and
nothing records what it said before.

This folder closes that gap. `export.ps1` pulls the content into
`data/` as JSON, so copy changes appear in git history next to the code changes
they relate to.

## This is a record, not a backup

Nothing here restores anything automatically, and no script in this repo writes
to the store. Restoring means feeding values back through `metafieldsSet` /
`metaobjectUpdate` yourself. What the snapshot gives you is the ability to
answer *"what did this say last week, and who changed it?"* — which is the
question that actually comes up.

Shopify's own backups do not cover metafield content either.

## Running it

```powershell
pwsh content-snapshot/export.ps1
git diff --stat content-snapshot/
```

Worth running before and after any bulk content edit, and before publishing a
theme. Takes about a minute.

## What is captured

| File | Contents |
| :-- | :-- |
| `definitions.json` | Metafield definitions (product, collection, page) and all metaobject definitions — the schema |
| `collections.json` | Per collection: handle, title, template suffix, `custom` and `global` metafields |
| `products.json` | Same, per product |
| `pages.json` | Page bodies — the Science pages, FAQ, About |
| `metaobject.<type>.json` | One file per custom metaobject type, with ids |

One file per metaobject type on purpose: editing one type produces a small,
readable diff instead of rewriting a single large file.

Shopify-owned namespaces (`shopify--*`, `mm-google-shopping`, `mc-facebook`)
are excluded. They are app and taxonomy data, they churn on their own, and
they are not editorial content.

## What is NOT captured

- **Theme settings** — already tracked in `config/settings_data.json`
- **Navigation menus** — link lists live in the admin. Worth adding if they
  start changing often
- **Products, variants, prices, inventory** — commercial data, not copy
- **Files/images** — the CDN URLs appear in the values, the binaries do not
- **Redirects** — the ingredient library relies on several of these

## Scopes

`export.ps1` needs a CLI app auth with `read_products`, `read_content`,
`read_metaobjects`, `read_metaobject_definitions`.

**A missing scope returns an empty result, not an error.** If a file comes back
tiny or a record count drops to zero, suspect the auth before suspecting the
store. Re-authorise with:

```
shopify store auth --store biotaderm.myshopify.com --scopes read_products,write_products,read_themes,write_themes,read_content,write_content,read_metaobjects,write_metaobjects,read_metaobject_definitions
```

Always include the theme scopes. A `store auth` without them silently takes
over the CLI session and breaks every `shopify theme` command until you
re-authorise — that has happened twice on this project.

## First snapshot, 7 August 2026

232 records: 15 products, 9 collections, 11 pages, and 97 metaobjects across
11 custom types (37 ingredient articles, 16 product page records, 9 FAQ items,
and the rest).

Taking it immediately paid for itself: three `label_string` fields in the
ingredient library still read `Hylocereus Undatus (Dragon Fruit) Fruit
Extract` after that correction had been applied everywhere else. Grepping one
folder found what querying the API piecemeal had missed.
