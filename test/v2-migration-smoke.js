"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const v2Root = path.join(repoRoot, "v2");
const indexPath = path.join(v2Root, "index.json");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const rootIndexText = fs.readFileSync(path.join(repoRoot, "index.json"), "utf8");
const rootIndex = JSON.parse(rootIndexText);
const mergedText = fs.readFileSync(path.join(repoRoot, "merged-shuyue", "index.json"), "utf8");
const merged = JSON.parse(mergedText);

const allowedContentKinds = new Set(["IMAGE_SEQUENCE", "PLAIN_TEXT", "EPUB_SPINE"]);
const allowedHostPermissions = new Set([
  "REQUEST_LOGIN_UI",
  "REQUEST_SOURCE_REFRESH",
  "REQUEST_LOGOUT",
  "REPORT_DIAGNOSTIC",
  "REPORT_USER_MESSAGE",
  "REQUEST_BROWSER_CHALLENGE"
]);
const allowedEventIds = new Set([
  "command.auth.login.request",
  "command.source.refresh.request",
  "command.auth.logout.request",
  "event.diagnostic.message.report"
]);
const allowedRuntimePermissions = new Set([
  "EXECUTE_SCRIPT",
  "NETWORK",
  "COOKIE_STORAGE",
  "CREDENTIAL_ACCESS",
  "LOGIN_PROMPT",
  "FAVORITE_MUTATION",
  "BROWSER_CHALLENGE"
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
  expect(!value.split("/").includes(".."), label + " must not traverse outside the v2 root");
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

function packageBlock(rawText, packageId) {
  const marker = "\"id\": \"" + packageId + "\"";
  const start = rawText.indexOf(marker);
  expect(start >= 0, "raw legacy index is missing " + packageId);
  const next = rawText.indexOf("\n  },\n  {", start + marker.length);
  return rawText.slice(start, next < 0 ? rawText.length : next);
}

function assertRawLegacyId(packageId, expected) {
  const block = packageBlock(rootIndexText, packageId);
  const idPattern = new RegExp("\"id\"\\s*:\\s*" + expected + "(?!\\d)");
  expect(idPattern.test(block), packageId + " lost its exact raw legacy id");
}

expect(index.format === "shinsou-extension-v2", "unexpected v2 index format");
expect(index.contractVersion === 2, "unexpected v2 contract version");
expect(index.contentContract === "extension-content-v2", "unexpected v2 content contract");
expect(Array.isArray(index.packages) && index.packages.length === 17, "expected exactly 17 v2 packages");
expect(new Set(index.packages.map((pkg) => pkg.id)).size === 17, "v2 package ids must be unique");
const biqugeV2 = index.packages.find((pkg) => pkg.id === "zh.biquge.tw");
expect(biqugeV2 && biqugeV2.contract === "shuyue", "legacy ShuYue Biquge package missing from v2");
expect(biqugeV2.installable === true, "legacy ShuYue Biquge package must remain installable in v2");
expect(
  biqugeV2.legacyScriptUrl === "merged-shuyue/shuyue/biquge-tw.js",
  "Biquge v2 migration binding missing",
);
expect(rootIndex.length === 12, "legacy root index must retain 12 entries");
expect(merged.format === "shinsou-unified-v1", "merged ShuYue index must retain v1 format");
expect(Array.isArray(merged.shuyue) && merged.shuyue.length === 3, "merged ShuYue index must retain 3 sources");
assertRawLegacyId("zh.manhuaren", "3616827811449702173");
assertRawLegacyId("zh.mangacopy", "6696312508930833206");

const rootLegacyIds = new Set(rootIndex.map((pkg) => pkg.id));
const mergedIds = new Set(merged.shuyue.map((pkg) => pkg.id));
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
  expect(pkg.scriptUrl.startsWith("plugins/"), pkg.id + " scriptUrl must be under v2/plugins");
  expect(pkg.sidecarUrl.startsWith("sidecars/"), pkg.id + " sidecarUrl must be under v2/sidecars");
  expect(Array.isArray(pkg.contentKinds) && pkg.contentKinds.length > 0, pkg.id + " content kinds");
  for (const kind of pkg.contentKinds) expect(allowedContentKinds.has(kind), pkg.id + " unknown content kind " + kind);
  checkEvents(pkg.systemEvents, pkg.id + " package events");
  checkPermissions(pkg.requestedHostPermissions, pkg.id + " requestedHostPermissions");
  checkRuntimePermissions(pkg.runtimePermissions, pkg.id + " runtimePermissions");

  const scriptPath = path.join(v2Root, pkg.scriptUrl);
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

  const legacyUrl = pkg.legacyScriptUrl.split("?")[0];
  const legacyPath = path.join(repoRoot, legacyUrl);
  const legacyBytes = fs.readFileSync(legacyPath);
  expect(!legacyBytes.equals(scriptBytes), pkg.id + " v2 artifact must differ from legacy bytes");

  const sidecarPath = path.join(v2Root, pkg.sidecarUrl);
  const sidecar = readJson(sidecarPath);
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
  checkPermissions(sidecar.requestedHostPermissions, pkg.id + " sidecar requestedHostPermissions");
  assert.deepStrictEqual(sidecar.requestedHostPermissions, pkg.requestedHostPermissions, pkg.id + " sidecar requested permissions");
  checkRuntimePermissions(sidecar.runtimePermissions, pkg.id + " sidecar runtimePermissions");
  assert.deepStrictEqual(sidecar.runtimePermissions, pkg.runtimePermissions, pkg.id + " sidecar runtime permissions");
  expect(sidecar.migration && sidecar.migration.legacyScriptUrl === pkg.legacyScriptUrl, pkg.id + " migration script binding");
  expect(sidecar.migration.legacyIndex === (pkg.contract === "shuyue" ? "merged-shuyue/index.json" : "index.json"), pkg.id + " migration index binding");
  expect(Array.isArray(sidecar.sources) && sidecar.sources.length === pkg.sources.length, pkg.id + " source count");
  for (let i = 0; i < pkg.sources.length; i += 1) {
    const source = pkg.sources[i];
    const migrated = sidecar.sources[i];
    expect(migrated.sourceKey && migrated.sourceKey.contractVersion === 2, pkg.id + " source key contract");
    expect(migrated.sourceKey.packageId === pkg.id, pkg.id + " source key package identity");
    expect(migrated.sourceKey.sourceId === String(source.sourceId), pkg.id + " source key source identity");
    expect(migrated.sourceKey.legacyLongId === (source.legacyLongId == null ? null : String(source.legacyLongId)), pkg.id + " source key legacy id");
    expect(migrated.sourceId === String(source.sourceId), pkg.id + " source identity");
    expect(migrated.name === source.name && migrated.lang === source.lang && migrated.baseUrl === source.baseUrl, pkg.id + " source descriptor");
    assert.deepStrictEqual(migrated.capabilities, pkg.capabilities, pkg.id + " source capabilities");
    assert.deepStrictEqual(migrated.contentKinds, pkg.contentKinds, pkg.id + " source content kinds");
    checkEvents(migrated.systemEvents, pkg.id + " source events");
    assert.deepStrictEqual(migrated.systemEvents, pkg.systemEvents, pkg.id + " source event declaration");
    checkPermissions(migrated.requestedHostPermissions, pkg.id + " source requested permissions");
    assert.deepStrictEqual(migrated.requestedHostPermissions, pkg.requestedHostPermissions, pkg.id + " source requested permissions");
    checkRuntimePermissions(migrated.runtimePermissions, pkg.id + " source runtime permissions");
    assert.deepStrictEqual(migrated.runtimePermissions, pkg.runtimePermissions, pkg.id + " source runtime permissions");
  }

  if (pkg.id === "example.login") {
    expect(pkg.referenceOnly === true && pkg.installable === false, "example.login must remain reference-only");
    expect(pkg.sources[0].legacyLongId === null, "example.login must not invent a legacy numeric id");
  }
  if (pkg.id === "zh.wenku8") {
    expect(pkg.legacyCompatibilityOnly === true && pkg.installable === false, "zh.wenku8 must remain compatibility-only");
  }
  if (pkg.unindexedLegacy) expect(!rootLegacyIds.has(pkg.id), pkg.id + " should remain unindexed in legacy root");
  if (pkg.contract === "shuyue") expect(mergedIds.has(pkg.id), pkg.id + " must map to merged ShuYue catalog");

  const declaredLoginEvents = pkg.systemEvents.required.concat(pkg.systemEvents.optional);
  if (declaredLoginEvents.includes("command.auth.login.request")) {
    expect(/bridge\.system\.requestLogin\s*\(/.test(scriptText), pkg.id + " must use the native system login helper");
    const systemCall = scriptText.indexOf("bridge.system.requestLogin");
    const legacyCall = scriptText.indexOf("bridge.requestLogin");
    expect(legacyCall < 0 || systemCall < legacyCall, pkg.id + " legacy login callback may only be a fallback");
  }
}

expect(index.packages.some((pkg) => pkg.id === "all.mangadex" && pkg.unindexedLegacy === true), "unindexed MangaDex migration entry missing");
expect(index.packages.some((pkg) => pkg.id === "example.login" && pkg.referenceOnly === true), "reference-only login entry missing");
console.log("v2 migration smoke: 17 packages, scripts, sidecars, permissions, identities, and legacy invariants verified");
