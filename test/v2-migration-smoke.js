"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const indexPath = path.join(repoRoot, "index.json");
const indexText = fs.readFileSync(indexPath, "utf8");
const index = JSON.parse(indexText);
const merged = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "merged-shuyue", "index.json"), "utf8"),
);

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

expect(index.format === "shinsou-extension-v2", "unexpected repository index format");
expect(index.contractVersion === 2, "unexpected v2 contract version");
expect(index.contentContract === "extension-content-v2", "unexpected v2 content contract");
expect(index.repository.unifiedSource === "merged-shuyue/index.json", "unexpected unified fixture path");
expect(Array.isArray(index.packages) && index.packages.length === 17, "expected exactly 17 v2 packages");
expect(new Set(index.packages.map((pkg) => pkg.id)).size === 17, "v2 package ids must be unique");
expect(!fs.existsSync(path.join(repoRoot, "v2")), "the retired v2 subdirectory must be absent");
expect(!fs.existsSync(path.join(repoRoot, "src")), "the retired v1 source tree must be absent");
expect(merged.format === "shinsou-unified-v1", "merged ShuYue fixture format");
expect(Array.isArray(merged.shuyue) && merged.shuyue.length === 3, "merged ShuYue index must retain 3 sources");

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
  expect(pkg.scriptUrl.startsWith("plugins/"), pkg.id + " scriptUrl must be under plugins");
  expect(pkg.sidecarUrl.startsWith("sidecars/"), pkg.id + " sidecarUrl must be under sidecars");
  expect(Array.isArray(pkg.contentKinds) && pkg.contentKinds.length > 0, pkg.id + " content kinds");
  for (const kind of pkg.contentKinds) expect(allowedContentKinds.has(kind), pkg.id + " unknown content kind " + kind);
  checkEvents(pkg.systemEvents, pkg.id + " package events");
  checkPermissions(pkg.requestedHostPermissions, pkg.id + " requestedHostPermissions");
  checkRuntimePermissions(pkg.runtimePermissions, pkg.id + " runtimePermissions");

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

  if (pkg.legacyScriptUrl) {
    const legacyUrl = pkg.legacyScriptUrl.split("?")[0];
    const legacyPath = path.join(repoRoot, legacyUrl);
    expect(fs.existsSync(legacyPath), pkg.id + " legacy migration script is missing");
    expect(!fs.readFileSync(legacyPath).equals(scriptBytes), pkg.id + " v2 artifact must differ from legacy bytes");
    expect(sidecar.migration && sidecar.migration.legacyScriptUrl === pkg.legacyScriptUrl, pkg.id + " migration script binding");
    expect(sidecar.migration.legacyIndex === "merged-shuyue/index.json", pkg.id + " migration index binding");
  } else {
    expect(!sidecar.migration, pkg.id + " must not advertise a removed v1 migration artifact");
  }

  if (pkg.id === "example.login") {
    expect(pkg.referenceOnly === true && pkg.installable === false, "example.login must remain reference-only");
  }
  if (pkg.id === "zh.wenku8") {
    expect(pkg.legacyCompatibilityOnly === true && pkg.installable === false, "zh.wenku8 must remain compatibility-only");
  }
  if (pkg.contract === "shuyue") expect(mergedIds.has(pkg.id), pkg.id + " must map to merged ShuYue catalog");

  const declaredLoginEvents = pkg.systemEvents.required.concat(pkg.systemEvents.optional);
  if (declaredLoginEvents.includes("command.auth.login.request")) {
    expect(/bridge\.system\.requestLogin\s*\(/.test(scriptText), pkg.id + " must use the native system login helper");
    const systemCall = scriptText.indexOf("bridge.system.requestLogin");
    const legacyCall = scriptText.indexOf("bridge.requestLogin");
    expect(legacyCall < 0 || systemCall < legacyCall, pkg.id + " legacy login callback may only be a fallback");
  }
}

const mangadex = index.packages.find((pkg) => pkg.id === "all.mangadex");
expect(mangadex && mangadex.unindexedLegacy === true && !mangadex.legacyScriptUrl, "MangaDex must not reference a removed v1 artifact");
expect(index.packages.some((pkg) => pkg.id === "example.login" && pkg.referenceOnly === true), "reference-only login entry missing");
console.log("root v2 migration smoke: 17 packages, scripts, sidecars, permissions, identities, and migration fixtures verified");
