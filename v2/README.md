# Shinsou extension content v2 fixture

This directory is a parallel, host-consumable view of the repository.  The historical
`index.json`, `plugins/`, and `merged-shuyue/index.json` contracts remain unchanged.

`index.json` is an `shinsou-extension-v2` package index.  Its `scriptUrl` values are
relative to the `/v2` repository root and point at independently hashed V2 executable
artifacts under `plugins/`.  The `legacyScriptUrl` and `migration` fields retain the
canonical legacy artifacts:

- `plugins/*.js` for Shinsou scripts;
- `merged-shuyue/shuyue/*.js` for the three reviewed ShuYue scripts.

Each package has a `sidecarUrl` under `sidecars/`.  A sidecar binds the package/version/
versionCode to the exact SHA-256 and byte size of the script, declares the v2 content
kind, preserves the complete opaque `SourceKey` (including a lossless legacy ID when
one exists), and declares system-v1 event negotiation separately from runtime
permissions.

The system event fields follow `docs/PLUGIN_SYSTEM_EVENT_ARCHITECTURE.md` in
`shinsou_kmp`:

- `systemEvents.protocol` is always `dev.shinsou.system`;
- `required`/`optional` contain negotiated event capability IDs;
- `requestedHostPermissions` contains the independent host-event requests such as
  `REQUEST_LOGIN_UI`;
- `runtimePermissions` contains execution/storage grants and never implies a host
  event grant.

The reviewed ShuYue packages include the maintained relay source `zh.wenku8.api` and the
migrated legacy `zh.biquge.tw` (筆趣閣), whose original script is retained at
`merged-shuyue/shuyue/biquge-tw.js`. The reviewed ShuYue package `zh.wenku8` is retained as `legacyCompatibilityOnly`; it
is needed for lossless migration but is not a new-install candidate.  `example.login`
is a reference-only source and is likewise not installable.  Both are declared so a
migration audit can account for every implementation without accidentally exposing
them as production sources.

To validate the complete mapping from this repository root:

```sh
node test/v2-migration-smoke.js
```
