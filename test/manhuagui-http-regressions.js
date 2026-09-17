"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const script = fs.readFileSync(path.join(__dirname, "..", "plugins", "zh.manhuagui.js"), "utf8");

function emptyElements() {
  return {
    isEmpty() { return true; },
    size() { return 0; },
    forEach() {},
  };
}

function load(responseFactory, structured = true) {
  const requests = [];
  const context = {
    Date,
    encodeURIComponent,
    bridge: {
      ...(structured ? {
        httpGetResponse(url) {
          requests.push({ bridge: "structured", url });
          return responseFactory(url);
        },
        httpGetWithHeaders() {
          throw new Error("structured failures must not retry through the legacy bridge");
        },
      } : {
        httpGetWithHeaders(url) {
          requests.push({ bridge: "legacy", url });
          return responseFactory(url);
        },
      }),
      domReleaseAll() {},
      log() {},
    },
    Jsoup: {
      parse() {
        return {
          select() { return emptyElements(); },
          selectFirst() { return null; },
        };
      },
    },
    SManga: { create: () => ({}) },
    SChapter: { create: () => ({}) },
    Page: function Page(index, url, imageUrl) { Object.assign(this, { index, url, imageUrl }); },
    MangasPage: function MangasPage(items, hasNextPage) {
      Object.assign(this, { items, mangas: items, hasNextPage });
    },
  };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "plugins/zh.manhuagui.js" });
  return { source: context.source, requests };
}

const emptyCatalogue = "<html><body><p>沒有符合條件的漫畫</p></body></html>";
const callbacks = [
  source => source.getPopularManga(0),
  source => source.getLatestUpdates(0),
  source => source.getSearchManga(0, "fixture", []),
  source => source.getMangaDetails({ url: "/comic/1", title: "fixture" }),
  source => source.getChapterList({ url: "/comic/1" }),
  source => source.getPageList({ url: "/comic/1/1.html" }),
];

// A valid non-empty HTML response may represent a real empty result. It must remain a normal
// empty page, while a transport-level empty body must surface as unavailable.
const emptyResult = load(() => ({ status: 200, body: emptyCatalogue }));
assert.strictEqual(emptyResult.source.getPopularManga(0).items.length, 0);
assert.strictEqual(emptyResult.requests.length, 1);
for (const body of ["", "  \n\t"]) {
  const run = load(() => ({ status: 200, body }));
  assert.throws(() => run.source.getPopularManga(0), /SHINSOU_SOURCE_HTTP_UNAVAILABLE/);
  assert.strictEqual(run.requests.length, 1);
}

// Structured failures are terminal for the current operation and never fall back to a second
// bridge request. Every source read callback must preserve that failure for the host.
for (const [response, marker] of [
  [{ status: 403, body: "denied" }, "FORBIDDEN"],
  [{ status: 429, body: "rate limited" }, "UNAVAILABLE"],
  [{ status: 500, body: "temporary" }, "UNAVAILABLE"],
  [{ status: 502, body: "bad gateway" }, "UNAVAILABLE"],
  [{ status: 200, body: "<html><title>Just a moment...</title><script>window._cf_chl_opt={}</script></html>" }, "CHALLENGE"],
  [{ status: 503, body: "<form id=\"challenge-form\"></form>" }, "CHALLENGE"],
]) {
  for (const callback of callbacks) {
    const run = load(() => response);
    assert.throws(() => callback(run.source), new RegExp("SHINSOU_SOURCE_HTTP_" + marker));
    assert.strictEqual(run.requests.length, 1, marker + " must make one request");
  }
}

// A failed response is not cached: the next attempt gets one fresh request and can recover.
{
  const responses = [
    { status: 503, body: "temporary" },
    { status: 200, body: emptyCatalogue },
  ];
  const run = load(() => responses.shift());
  assert.throws(() => run.source.getPopularManga(0), /SHINSOU_SOURCE_HTTP_UNAVAILABLE/);
  assert.strictEqual(run.source.getPopularManga(0).items.length, 0);
  assert.strictEqual(run.requests.length, 2);
}

// A successful response is cached for the list TTL, avoiding duplicate reads for the same page.
{
  const run = load(() => ({ status: 200, body: emptyCatalogue }));
  run.source.getPopularManga(0);
  run.source.getPopularManga(0);
  assert.strictEqual(run.requests.length, 1);
}

// Legacy hosts still receive the old body-only bridge path.
{
  const run = load(() => emptyCatalogue, false);
  assert.strictEqual(run.source.getPopularManga(0).items.length, 0);
  assert.strictEqual(run.requests.length, 1);
}

console.log("Manhuagui HTTP regressions: status propagation, cache boundaries, and empty results PASS");
