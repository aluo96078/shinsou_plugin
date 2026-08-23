# Shinsou Extension v2 package schema

This reference is for package authors. The repository's `index.json` is the
authoritative package catalog; each `sidecars/<package-id>.json` repeats the
host-facing contract so an installer can inspect an artifact before executing
it.

## Index entry

An index package normally contains:

```json
{
  "id": "example.source",
  "name": "Example Source",
  "version": "1.0.0",
  "versionCode": 1,
  "lang": "zh",
  "nsfw": false,
  "contract": "shinsou",
  "runtime": "legacy-shinsou-adapter-v2",
  "contentType": "manga",
  "contentKinds": ["IMAGE_SEQUENCE"],
  "scriptUrl": "plugins/example.source.js",
  "sidecarUrl": "sidecars/example.source.json",
  "sha256": "<sha256 of the script bytes>",
  "byteSize": 1234,
  "capabilities": ["CATALOGUE", "LATEST", "BROWSE", "METADATA", "UNITS", "CONTENT", "SEARCH"],
  "runtimePermissions": ["EXECUTE_SCRIPT"],
  "requestedHostPermissions": [],
  "systemEvents": {
    "protocol": "dev.shinsou.system",
    "minVersion": 1,
    "maxVersion": 1,
    "required": [],
    "optional": []
  },
  "sources": [{
    "sourceId": "example.source",
    "legacyLongId": null,
    "name": "Example Source",
    "lang": "zh",
    "baseUrl": "https://example.invalid"
  }]
}
```

`contentKinds` currently accepts `IMAGE_SEQUENCE`, `PLAIN_TEXT`, and
`EPUB_SPINE`. Use `contentType: "novel"` for text-only packages,
`"manga"` for image-only packages, and `"both"` only when the package
really contains both. A source's own type/kinds belong in the sidecar source
binding; they must not be inferred from the package union.

## Sidecar binding

The sidecar repeats the package identity and binds the exact executable:

```json
{
  "format": "shinsou-extension-sidecar-v2",
  "contractVersion": 2,
  "packageId": "example.source",
  "artifact": {
    "scriptUrl": "plugins/example.source.js",
    "sha256": "<same digest as index>",
    "byteSize": 1234
  },
  "content": {
    "contract": "extension-content-v2",
    "contractVersion": 2,
    "type": "manga",
    "kinds": ["IMAGE_SEQUENCE"]
  },
  "sources": [{
    "sourceKey": {
      "contractVersion": 2,
      "packageId": "example.source",
      "sourceId": "example.source",
      "legacyLongId": null
    },
    "sourceId": "example.source",
    "name": "Example Source",
    "lang": "zh",
    "baseUrl": "https://example.invalid",
    "contentType": "manga",
    "contentKinds": ["IMAGE_SEQUENCE"]
  }]
}
```

The sidecar's capabilities, events, requested host permissions, runtime
permissions, versions, and artifact digest must exactly match the index entry.
Do not include a `hostPermissions` field; host access is an admission decision,
not a plugin self-grant. Add `migration` only when a real legacy artifact is
being retained for migration.

## Script contract

The script declares executable metadata on one line so the repository smoke
test can inspect it without running the source:

```javascript
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2",...};
```

A single-source script exports `var source = { ... }`. A multi-source script
exports `var sources = [ ... ]` (or an object keyed by source ID), and every
entry has a unique exact `id`. The host chooses a source by exact ID; never use
the source list position as identity. The selected object supplies the usual
hooks: `getPopularManga`, `getLatestUpdates`, `getSearchManga`,
`getMangaDetails`, `getChapterList`, `getPageList`, and, when useful,
`getFilterList`.

For novels, a page can preserve text for v2-aware hosts:

```javascript
{ index: 0, url: chapter.url, imageUrl: null, text: "...", content: "..." }
```

For comics, return one image page per panel/page:

```javascript
{ index: 0, url: "https://cdn.example.invalid/page-1.jpg", imageUrl: "https://cdn.example.invalid/page-1.jpg" }
```

## Mixed-platform examples and current limitation

The repository's `example.dual` fixture demonstrates one package with a novel
source and a manga source. It is intentionally `referenceOnly` and not
installable: the generic Shinsou adapter still has image-oriented legacy
assumptions, while the reviewed ShuYue coordinator currently expects a single
source. A real package must only be marked installable after its target host
supports the complete mixed runtime.

## Validation

From the repository root, run:

```bash
node test/v2-migration-smoke.js
git diff --check
```

Then recompute the executable digest and byte count whenever the script changes:

```bash
shasum -a 256 plugins/example.source.js
wc -c < plugins/example.source.js
```
