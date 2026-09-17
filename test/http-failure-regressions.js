"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(file, response, legacy = false) {
  let calls = 0;
  const respond = () => {
    assert.strictEqual(++calls, 1, "Each fixture must make exactly one request");
    return response;
  };
  const bridge = legacy ? { httpGetWithHeaders: respond } : {
    httpGetResponse: respond,
    httpGetWithHeaders: () => { throw new Error("Unexpected duplicate HTTP request"); },
  };
  const context = { console, bridge, MangasPage: class { constructor(items, hasNext) { this.items = items; this.hasNextPage = hasNext; } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "plugins", file), "utf8"), context);
  return context.source;
}

for (const file of ["zh.mycomic.js", "zh.jinmantiantang.js", "zh.baozimh.js"]) {
  // Cloudflare can return a challenge document with a successful or transient HTTP status.
  // Classification must happen before the generic non-2xx branch, while a blocked page wins
  // when both markers are present. The structured bridge must not be retried through the legacy
  // bridge (the fixture throws if that duplicate request is attempted).
  const challengeBody = "<html><title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/challenge.js'></script></html>";
  {
    for (const status of [200, 403, 503]) {
      assert.throws(
        () => load(file, { status, body: challengeBody }).getPopularManga(0),
        /SHINSOU_SOURCE_HTTP_CHALLENGE/,
        file + " HTTP " + status + " challenge",
      );
    }

    // A normal page can include Cloudflare's passive JSD and a Turnstile widget. Those resource
    // names are not proof that the catalogue is an interstitial, especially on HTTP 200.
    const normalCloudflareBody = [
      "<html><head><title>18comic catalogue</title>",
      "<script src='/cdn-cgi/challenge-platform/scripts/jsd/main.js'></script></head>",
      "<body><div class='cf-turnstile' data-sitekey='public'></div></body></html>",
    ].join("");
    assert.strictEqual(
      load(file, { status: 200, body: normalCloudflareBody })._requestPage("https://example.invalid"),
      normalCloudflareBody,
      file + " HTTP 200 JSD/Turnstile is normal content",
    );
    assert.strictEqual(load(file, normalCloudflareBody, true)._requestPage("https://example.invalid"), normalCloudflareBody);
    assert.throws(() => load(file, challengeBody, true)._requestPage("https://example.invalid"), /SHINSOU_SOURCE_HTTP_CHALLENGE/);
    for (const body of ["", " \n\t"]) {
      assert.throws(() => load(file, body, true)._requestPage("https://example.invalid"), /SHINSOU_SOURCE_HTTP_UNAVAILABLE/);
    }
    for (const status of [0, NaN, Infinity, 200.5]) {
      assert.throws(
        () => load(file, { status, body: challengeBody })._requestPage("https://example.invalid"),
        /SHINSOU_SOURCE_HTTP_UNAVAILABLE/,
        file + " malformed HTTP status " + String(status) + " stays unavailable",
      );
    }
  }
  for (const [body, marker] of [
    ["sorry, you have been blocked", "SHINSOU_SOURCE_HTTP_BLOCKED"],
    ["<script>var _cf_chl_opt={};</script>", "SHINSOU_SOURCE_HTTP_CHALLENGE"],
    ["denied", "SHINSOU_SOURCE_HTTP_FORBIDDEN"],
  ]) {
    assert.throws(() => load(file, { status: 403, body }).getPopularManga(0), new RegExp(marker), file + " " + marker);
  }
  assert.throws(() => load(file, { status: 503, body: "temporary" }).getPopularManga(0), /SHINSOU_SOURCE_HTTP_UNAVAILABLE/);
  for (const response of [null, {error:"network failed"}, {status:0,body:""}, {status:200,body:{}}, {status:404,body:"missing"}]) {
    assert.throws(() => load(file, response)._requestPage("https://example.invalid"), /SHINSOU_SOURCE_HTTP_UNAVAILABLE/);
  }
  assert.throws(() => load(file, {status:403,body:"sorry, you have been blocked _cf_chl_opt"})._requestPage("https://example.invalid"), /SHINSOU_SOURCE_HTTP_BLOCKED/);
  assert.strictEqual(load(file, {status:200,body:"<html>Public catalogue</html>"})._requestPage("https://example.invalid"), "<html>Public catalogue</html>");
  {
    assert.throws(() => load(file, {status:200,body:"sorry, you have been blocked _cf_chl_opt"})._requestPage("https://example.invalid"), /SHINSOU_SOURCE_HTTP_BLOCKED/);
    for (const response of [
      {status:200,body:""},
      {status:200,body:"   \n\t"},
      {status:"not-a-status",body:"<html>Malformed response</html>"},
    ]) {
      assert.throws(() => load(file, response)._requestPage("https://example.invalid"), /SHINSOU_SOURCE_HTTP_UNAVAILABLE/);
    }
  }
  for (const [body, marker] of [["sorry, you have been blocked", "BLOCKED"], ["<script>window._cf_chl_opt={};</script>", "CHALLENGE"], [{error:"network failed"}, "UNAVAILABLE"]]) {
    assert.throws(() => load(file, body, true)._requestPage("https://example.invalid"), new RegExp("SHINSOU_SOURCE_HTTP_" + marker));
  }
}
console.log("HTTP failure regressions passed");
