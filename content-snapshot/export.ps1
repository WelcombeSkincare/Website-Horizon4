# Exports Shopify store content (metafields, metaobjects, page bodies) to JSON.
#
# Theme code is version-controlled by the Shopify CLI. Store CONTENT is not -
# it lives only in Shopify. This script writes a diffable snapshot of it into
# the repo so copy changes show up in git history alongside the code.
#
# The snapshot is a RECORD, not a backup. Restoring means feeding the values
# back through metafieldsSet / metaobjectUpdate; nothing here does that
# automatically, and no script in this repo will overwrite the store.
#
# Usage (from the repo root):
#   pwsh content-snapshot/export.ps1
#
# Requires a Shopify CLI app auth with these scopes:
#   read_products, read_content, read_metaobjects, read_metaobject_definitions
# If a query returns an empty result rather than an error, the auth is
# missing a scope. Re-run:
#   shopify store auth --store <domain> --scopes read_products,write_products,`
#     read_themes,write_themes,read_content,write_content,read_metaobjects,`
#     write_metaobjects,read_metaobject_definitions
# Always include the theme scopes - a store auth without them breaks
# `shopify theme` commands until you re-authorise.

$ErrorActionPreference = 'Stop'
$Store = 'biotaderm.myshopify.com'
$Root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$Q     = Join-Path $Root 'queries'
$Out   = Join-Path $Root 'data'

New-Item -ItemType Directory -Force -Path $Out | Out-Null

function Invoke-Export {
    param([string]$QueryFile, [string]$OutFile, [string]$Variables)
    $args = @(
        'store','execute','--store',$Store,
        '--query-file',(Join-Path $Q $QueryFile),
        '--json','--output-file',(Join-Path $Out $OutFile)
    )
    if ($Variables) { $args += @('--variables',$Variables) }
    & shopify @args | Out-Null
    $len = (Get-Item (Join-Path $Out $OutFile)).Length
    "{0,-34} {1,9:N0} bytes" -f $OutFile, $len
}

Write-Host "Exporting store content from $Store`n"

Invoke-Export 'definitions.graphql' 'definitions.json'
Invoke-Export 'collections.graphql' 'collections.json'
Invoke-Export 'products.graphql'    'products.json'
Invoke-Export 'pages.graphql'       'pages.json'

# One file per metaobject type, so a change to one type produces a small diff
# rather than rewriting a single large file.
$types = (Get-Content (Join-Path $Out 'definitions.json') -Raw | ConvertFrom-Json).
         metaobjectDefinitions.nodes |
         Where-Object { $_.type -notlike 'shopify--*' } |
         Select-Object -ExpandProperty type

foreach ($t in $types) {
    Invoke-Export 'metaobjects.graphql' "metaobject.$t.json" ('{"type":"' + $t + '"}')
}

Write-Host "`nDone. $((Get-ChildItem $Out -File).Count) files in content-snapshot/data/"
Write-Host "Review with: git diff --stat content-snapshot/"
