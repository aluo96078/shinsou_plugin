---
name: shinsou-extension-creator
description: Create or update Shinsou Extension v2 packages, scripts, sidecars, and index entries when building an extension source; do not use for ordinary app UI or backend work.
---

# Shinsou Extension Creator

Use this skill when a user wants to add, migrate, or repair a Shinsou/ShuYue extension package in the extension repository. The result must be a self-consistent v2 package: executable script, repository index entry, sidecar, source identity, content declaration, permissions, and digest metadata all describe the same artifact.

## Workflow

1. Identify the runtime contract before editing. Use `contract: "shinsou"` for the generic legacy-adapter path and `contract: "shuyue"` only when the reviewed ShuYue runtime and its catalog entry apply.
2. Give the package and every source a stable identity. A multi-source script must export `sources` and each source must have a unique exact `id`/`sourceId`; source selection is by that identifier, never by array position. Keep the package `id`, sidecar `packageId`, executable metadata, and `SourceKey.packageId` aligned.
3. Declare the content honestly. A package containing both media types uses `contentType: "both"` and the union of `contentKinds` (`PLAIN_TEXT` and `IMAGE_SEQUENCE`); each source still declares its own `contentType` and kinds. `getPageList` should return text/content fields for novels and image URLs for comics.
4. Keep capability and permission declarations minimal. Only expose `supportsLogin`, `LOGIN`, `REQUEST_LOGIN_UI`, credential storage, or login events when the source actually implements login. A source must not self-grant host permissions; request only the permissions that the host contract recognizes.
5. Keep script, sidecar, and index metadata identical for content kinds, system events, requested host permissions, capabilities, version, script URL, SHA-256, and byte size. Recalculate the digest and byte size after every script change, for example:

   ```bash
   shasum -a 256 plugins/<package-id>.js
   wc -c < plugins/<package-id>.js
   ```

6. Validate from the repository root with `node test/v2-migration-smoke.js` and `git diff --check`. If the package is only an educational multi-platform sample and the current host cannot execute its mixed runtime end to end, mark it `referenceOnly: true` and `installable: false` instead of advertising a partial install.

## References

- Read [references/v2-package-schema.md](references/v2-package-schema.md) when creating or reviewing index/sidecar fields, source output shapes, or digest bindings.
- The repository's complete multi-platform fixture is [../../plugins/example.dual.js](../../plugins/example.dual.js) with [../../sidecars/example.dual.json](../../sidecars/example.dual.json). Use it as a concrete example of exact multi-source selection and novel/manga content declarations.

Do not add account fields or login UI merely because another extension has them. Do not let an example claim installability when the host runtime or reviewed adapter cannot support the declared combination.
