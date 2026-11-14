"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Unsigned sources live in src/; the repository root serves the signed copies CI generates.
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.join(projectRoot, "src");
const indexPath = path.join(repoRoot, "index.json");
const indexText = fs.readFileSync(indexPath, "utf8");
const index = JSON.parse(indexText);


const allowedContentKinds = new Set(["IMAGE_SEQUENCE", "PLAIN_TEXT", "EPUB_SPINE"]);
const allowedHostPermissions = new Set([
  "REQUEST_LOGIN_UI",
  "REQUEST_SOURCE_REFRESH",
  "REQUEST_LOGOUT",
  "REPORT_DIAGNOSTIC",
  "REPORT_USER_MESSAGE",
  "REQUEST_BROWSER_CHALLENGE",
]);
const allowedEventIds = new Set([
  "command.auth.login.request",
  "command.source.refresh.request",
  "command.auth.logout.request",
  "event.diagnostic.message.report",
]);
const allowedRuntimePermissions = new Set([
  "EXECUTE_SCRIPT",
  "NETWORK",
  "COOKIE_STORAGE",
  "CREDENTIAL_ACCESS",
  "LOGIN_PROMPT",
  "FAVORITE_MUTATION",
  "BROWSER_CHALLENGE",
  "COOKIE_READ",
  "BROWSER_IMAGES",
]);

function expect(condition, message) {
  assert.ok(condition, message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function noTraversal(value, label) {
  expect(typeof value === "string" && value.length > 0, label + " must be a non-empty string");
  expect(!value.split("/").includes(".."), label + " must not traverse outside the repository root");
}

function checkEvents(events, label) {
  expect(events && events.protocol === "dev.shinsou.system", label + " protocol");
  expect(events.minVersion === 1 && events.maxVersion === 1, label + " version range");
  expect(Array.isArray(events.required) && Array.isArray(events.optional), label + " event arrays");
  const required = new Set(events.required);
  const optional = new Set(events.optional);
  for (const eventId of required) expect(allowedEventIds.has(eventId), label + " unknown required event " + eventId);
  for (const eventId of optional) expect(allowedEventIds.has(eventId), label + " unknown optional event " + eventId);
  for (const eventId of required) expect(!optional.has(eventId), label + " event is both required and optional: " + eventId);
}

function checkPermissions(permissions, label) {
  expect(Array.isArray(permissions), label + " must be an array");
  for (const permission of permissions) {
    expect(allowedHostPermissions.has(permission), label + " contains unknown host permission " + permission);
  }
}

function checkRuntimePermissions(permissions, label) {
  expect(Array.isArray(permissions), label + " must be an array");
  for (const permission of permissions) {
    expect(allowedRuntimePermissions.has(permission), label + " contains unknown runtime permission " + permission);
  }
}

function checkBrowserSessionOrigins(origins, label) {
  expect(Array.isArray(origins), label + " must be an array");
  expect(origins.length <= 4, label + " must remain bounded");
  for (const origin of origins) {
    const parsed = new URL(origin);
    expect(parsed.protocol === "https:", label + " must use HTTPS");
    expect(parsed.origin === origin && parsed.pathname === "/", label + " must contain exact origins only");
  }
}

expect(index.format === "shinsou-extension-v2", "unexpected repository index format");
expect(index.contractVersion === 2, "unexpected v2 contract version");
expect(index.contentContract === "extension-content-v2", "unexpected v2 content contract");
expect(!("unifiedSource" in index.repository), "the retired unified ShuYue fixture must not be referenced");
expect(Array.isArray(index.packages) && index.packages.length === 16, "expected exactly 16 v2 packages");
expect(new Set(index.packages.map((pkg) => pkg.id)).size === 16, "v2 package ids must be unique");
expect(!fs.existsSync(path.join(projectRoot, "v2")), "the retired v2 subdirectory must be absent");
expect(!fs.existsSync(path.join(repoRoot, "src")), "src/ must not nest another source tree");
const seenScriptUrls = new Set();
const seenSidecarUrls = new Set();

for (const pkg of index.packages) {
  expect(pkg.contractVersion === undefined || pkg.contractVersion === 2, pkg.id + " contract version");
  expect(typeof pkg.id === "string" && pkg.id.length > 0, "package id");
  expect(!Object.prototype.hasOwnProperty.call(pkg, "hostPermissions"), pkg.id + " must not self-grant host permissions");
  expect(!seenScriptUrls.has(pkg.scriptUrl), "duplicate v2 script URL " + pkg.scriptUrl);
  expect(!seenSidecarUrls.has(pkg.sidecarUrl), "duplicate v2 sidecar URL " + pkg.sidecarUrl);
  seenScriptUrls.add(pkg.scriptUrl);
  seenSidecarUrls.add(pkg.sidecarUrl);
  noTraversal(pkg.scriptUrl, pkg.id + " scriptUrl");
  noTraversal(pkg.sidecarUrl, pkg.id + " sidecarUrl");
  expect(pkg.scriptUrl.startsWith("plugins/"), pkg.id + " scriptUrl must be under plugins");
  expect(pkg.sidecarUrl.startsWith("sidecars/"), pkg.id + " sidecarUrl must be under sidecars");
  expect(Array.isArray(pkg.contentKinds) && pkg.contentKinds.length > 0, pkg.id + " content kinds");
  for (const kind of pkg.contentKinds) expect(allowedContentKinds.has(kind), pkg.id + " unknown content kind " + kind);
  checkEvents(pkg.systemEvents, pkg.id + " package events");
  checkPermissions(pkg.requestedHostPermissions, pkg.id + " requestedHostPermissions");
  checkRuntimePermissions(pkg.runtimePermissions, pkg.id + " runtimePermissions");
  for (const source of pkg.sources || []) {
    checkBrowserSessionOrigins(source.browserSessionOrigins || [], pkg.id + " source browserSessionOrigins");
  }

  const scriptPath = path.join(repoRoot, pkg.scriptUrl);
  const scriptBytes = fs.readFileSync(scriptPath);
  expect(scriptBytes.length === pkg.byteSize, pkg.id + " index byteSize mismatch");
  expect(sha256(scriptBytes) === pkg.sha256, pkg.id + " index sha256 mismatch");
  new vm.Script(scriptBytes.toString("utf8"), { filename: pkg.scriptUrl });
  const scriptText = scriptBytes.toString("utf8");
  expect(scriptText.includes("source.v2 = __shinsouExtensionV2"), pkg.id + " missing v2 metadata export");
  const declaration = scriptText.match(/var __shinsouExtensionV2 = (\{[^\n]+\});/);
  expect(declaration, pkg.id + " missing executable v2 declaration");
  const executableMetadata = JSON.parse(declaration[1]);
  expect(executableMetadata.contractVersion === 2, pkg.id + " executable contract version");
  expect(executableMetadata.contentContract === "extension-content-v2", pkg.id + " executable content contract");
  expect(executableMetadata.packageId === pkg.id, pkg.id + " executable package identity");
  assert.deepStrictEqual(executableMetadata.contentKinds, pkg.contentKinds, pkg.id + " executable content kinds");
  assert.deepStrictEqual(executableMetadata.systemEvents, pkg.systemEvents, pkg.id + " executable event declaration");
  assert.deepStrictEqual(executableMetadata.requestedHostPermissions, pkg.requestedHostPermissions, pkg.id + " executable requested permissions");

  const sidecar = readJson(path.join(repoRoot, pkg.sidecarUrl));
  expect(sidecar.format === "shinsou-extension-sidecar-v2", pkg.id + " sidecar format");
  expect(sidecar.contractVersion === 2, pkg.id + " sidecar contract version");
  expect(sidecar.packageId === pkg.id, pkg.id + " sidecar package identity");
  expect(sidecar.version === pkg.version && sidecar.versionCode === pkg.versionCode, pkg.id + " sidecar version identity");
  expect(!Object.prototype.hasOwnProperty.call(sidecar, "hostPermissions"), pkg.id + " sidecar must not self-grant host permissions");
  expect(sidecar.artifact && sidecar.artifact.scriptUrl === pkg.scriptUrl, pkg.id + " sidecar artifact binding");
  expect(sidecar.artifact.sha256 === pkg.sha256 && sidecar.artifact.byteSize === pkg.byteSize, pkg.id + " sidecar artifact metadata");
  expect(sidecar.content.contract === "extension-content-v2" && sidecar.content.contractVersion === 2, pkg.id + " sidecar content contract");
  expect(sidecar.content.type === pkg.contentType, pkg.id + " sidecar content type");
  assert.deepStrictEqual(sidecar.content.kinds, pkg.contentKinds, pkg.id + " sidecar content kinds");
  assert.deepStrictEqual(sidecar.capabilities, pkg.capabilities, pkg.id + " sidecar capabilities");
  checkEvents(sidecar.systemEvents, pkg.id + " sidecar events");
  assert.deepStrictEqual(sidecar.systemEvents, pkg.systemEvents, pkg.id + " sidecar package events");
  checkPermissions(sidecar.requestedHostPermissions, pkg.id + " sidecar requested permissions");
  assert.deepStrictEqual(sidecar.requestedHostPermissions, pkg.requestedHostPermissions, pkg.id + " sidecar requested permissions");
  checkRuntimePermissions(sidecar.runtimePermissions, pkg.id + " sidecar runtime permissions");
  assert.deepStrictEqual(sidecar.runtimePermissions, pkg.runtimePermissions, pkg.id + " sidecar runtime permissions");
  for (const source of pkg.sources || []) {
    const sidecarSource = sidecar.sources.find((entry) => entry.sourceId === source.sourceId);
    assert.deepStrictEqual(
      sidecarSource.browserSessionOrigins || [],
      source.browserSessionOrigins || [],
      pkg.id + " source browser-session origin binding",
    );
  }

  // One format only: every package is a Shinsou script for the app's sandbox.
  expect(pkg.contract === "shinsou" && pkg.runtime === "legacy-shinsou-adapter-v2", pkg.id + " must be a Shinsou package");
  expect(!pkg.legacyScriptUrl && !sidecar.migration, pkg.id + " must not reference a removed legacy artifact");
  for (const source of pkg.sources || []) {
    const numeric = /^-?\d{1,19}$/.test(source.sourceId);
    // Reference-only fixtures are never installed, so the app never parses their source ids.
    if (!numeric && pkg.referenceOnly !== true) {
      expect(/^[a-z0-9][a-z0-9._-]{0,127}$/.test(source.sourceId), pkg.id + " string source id shape");
      expect(/^-?\d{1,19}$/.test(String(source.legacyLongId)), pkg.id + " string source id needs a numeric legacyLongId");
    }
    const sidecarSource = sidecar.sources.find((entry) => entry.sourceId === source.sourceId);
    for (const field of ["requestOrigins", "credentialOrigins", "contentOrigins", "browserSessionOrigins", "contentHostSuffixes", "browserImageOrigins", "browserLoginOrigins", "browserLoginResourceOrigins"]) {
      assert.deepStrictEqual(sidecarSource && sidecarSource[field], source[field], pkg.id + " sidecar " + field);
    }
    if (pkg.installable !== false && pkg.runtimePermissions.includes("NETWORK")) {
      expect(Array.isArray(source.requestOrigins) && source.requestOrigins.length > 0, pkg.id + " must declare its request origins");
    }
    if ((source.browserSessionOrigins || []).length) {
      expect(pkg.runtimePermissions.includes("BROWSER_CHALLENGE"), pkg.id + " browser-session origins need BROWSER_CHALLENGE");
    }
    if ((source.browserImageOrigins || []).length) {
      expect(pkg.runtimePermissions.includes("BROWSER_IMAGES"), pkg.id + " browser image origins need BROWSER_IMAGES");
      expect(source.browserImageOrigins.every((o) => source.contentOrigins.includes(o)), pkg.id + " browser image origins are content origins");
    }
  }

  if (pkg.id === "example.login") {
    expect(pkg.referenceOnly === true && pkg.installable === false, "example.login must remain reference-only");
  }
  if (pkg.id === "example.dual") {
    expect(pkg.referenceOnly === true && pkg.installable === false, "example.dual must remain reference-only");
    expect(pkg.contentType === "both", "example.dual package content type");
    expect(pkg.contentKinds.includes("PLAIN_TEXT") && pkg.contentKinds.includes("IMAGE_SEQUENCE"), "example.dual package content kinds");
    expect(Array.isArray(pkg.sources) && pkg.sources.length === 2, "example.dual must expose two sources");
    const dualSources = new Map(pkg.sources.map((source) => [source.sourceId, source]));
    const dualNovel = dualSources.get("example.dual.novel");
    const dualManga = dualSources.get("example.dual.manga");
    expect(dualNovel && dualNovel.contentType === "novel", "example.dual novel source type");
    expect(dualNovel && dualNovel.contentKinds.includes("PLAIN_TEXT"), "example.dual novel source kind");
    expect(dualManga && dualManga.contentType === "manga", "example.dual manga source type");
    expect(dualManga && dualManga.contentKinds.includes("IMAGE_SEQUENCE"), "example.dual manga source kind");
  }
  if (pkg.id === "zh.bilimanga") {
    expect(pkg.referenceOnly !== true && pkg.installable === true, "zh.bilimanga novel package must be installable");
    expect(pkg.contentType === "novel", "zh.bilimanga package content type");
    assert.deepStrictEqual(pkg.contentKinds, ["PLAIN_TEXT"], "zh.bilimanga package content kinds");
    expect(Array.isArray(pkg.sources) && pkg.sources.length === 1, "zh.bilimanga must expose only Linovelib");
    expect(pkg.sources[0].sourceId === "zh.bilimanga.novel" && pkg.sources[0].legacyLongId === "-9110000000000004", "zh.bilimanga novel source identity");
    expect(pkg.sources[0].baseUrl === "https://tw.linovelib.com", "zh.bilimanga novel domain");
    expect(pkg.capabilities.includes("LOGIN"), "zh.bilimanga must advertise its implemented member login");
    expect(/supportsLogin:\s*true/.test(scriptText), "zh.bilimanga source must expose login controls");
    expect(/login:\s*function\s*\(username, password\)/.test(scriptText), "zh.bilimanga login implementation missing");
    expect(/errorMessage/.test(scriptText), "zh.bilimanga login error message support missing");
    expect(/logout:\s*function\s*\(\)/.test(scriptText), "zh.bilimanga logout implementation missing");
  }
  if (pkg.id === "zh.bilimanga.manga") {
    expect(pkg.referenceOnly !== true && pkg.installable === true, "zh.bilimanga.manga must be installable");
    expect(pkg.contract === "shinsou" && pkg.runtime === "legacy-shinsou-adapter-v2", "zh.bilimanga.manga generic runtime");
    expect(pkg.contentType === "manga", "zh.bilimanga.manga package content type");
    assert.deepStrictEqual(pkg.contentKinds, ["IMAGE_SEQUENCE"], "zh.bilimanga.manga package content kinds");
    expect(Array.isArray(pkg.sources) && pkg.sources.length === 1, "zh.bilimanga.manga standalone source");
    expect(pkg.sources[0].sourceId === "7289707411592168382", "zh.bilimanga.manga numeric source identity");
    expect(pkg.sources[0].legacyLongId === "7289707411592168382", "zh.bilimanga.manga legacy numeric identity");
    expect(pkg.sources[0].baseUrl === "https://www.bilimanga.net", "zh.bilimanga.manga domain");
    expect(!/bridge\.browserSessionRequest\s*\(/.test(scriptText), "zh.bilimanga.manga must use ordinary plugin network transport");
    expect(!/User-Agent["']?\s*[:=]\s*["']Mozilla/i.test(scriptText), "zh.bilimanga.manga must not hard-code a browser User-Agent");
  }
  if (pkg.id === "zh.wenku8") {
    expect(pkg.legacyCompatibilityOnly === true && pkg.installable === false, "zh.wenku8 must remain compatibility-only");
    expect(pkg.sources[0].sourceId === "zh.wenku8" && pkg.sources[0].legacyLongId === "-9110000000000001", "zh.wenku8 source identity");
  }
  if (pkg.id === "zh.wenku8.api") {
    expect(pkg.sources[0].sourceId === "zh.wenku8.api" && pkg.sources[0].legacyLongId === "-9110000000000002", "zh.wenku8.api source identity");
    expect(!pkg.capabilities.includes("FAVORITE"), "zh.wenku8.api must use the app-local library");
    expect(!pkg.runtimePermissions.includes("FAVORITE_MUTATION"), "zh.wenku8.api must not request remote favorite mutation");
    expect(/supportsFavorites:\s*false/.test(scriptText), "zh.wenku8.api must disable remote favorites");
    expect(!/favorite:\s*function\s*\(/.test(scriptText), "zh.wenku8.api remote favorite hook must be absent");
    expect(!/getFavoriteManga\s*=/.test(scriptText), "zh.wenku8.api remote bookcase adapter must be absent");
    expect(!/action=bookcase/.test(scriptText), "zh.wenku8.api must not call the remote bookcase API");
  }
  if (pkg.id === "zh.biquge.tw") {
    expect(pkg.sources[0].sourceId === "zh.biquge.tw" && pkg.sources[0].legacyLongId === "-9110000000000003", "zh.biquge.tw source identity");
  }

  const declaredLoginEvents = pkg.systemEvents.required.concat(pkg.systemEvents.optional);
  if (declaredLoginEvents.includes("command.auth.login.request")) {
    expect(/bridge\.requestLogin\s*\(/.test(scriptText), pkg.id + " must ask the app for login through bridge.requestLogin");
  }
}

const mangadex = index.packages.find((pkg) => pkg.id === "all.mangadex");
expect(mangadex && mangadex.unindexedLegacy === true && !mangadex.legacyScriptUrl, "MangaDex must not reference a removed v1 artifact");
expect(index.packages.some((pkg) => pkg.id === "example.login" && pkg.referenceOnly === true), "reference-only login entry missing");
console.log("v2 smoke: 16 Shinsou packages, scripts, sidecars, permissions, origins and identities verified");
