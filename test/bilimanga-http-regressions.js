"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const script = fs.readFileSync(
  path.join(__dirname, "..", "plugins", "zh.bilimanga.manga.js"),
  "utf8",
);

function load(responseFactory, options = {}) {
  const requests = [];
  const structured = options.structured !== false;
  const bridge = {
    ...(structured
      ? {
          httpGetResponse(url) {
            requests.push({ method: "structured", url });
            return responseFactory(url);
          },
          httpGetWithHeaders() {
            throw new Error("structured responses must not retry through the legacy bridge");
          },
        }
      : {
          httpGetWithHeaders(url) {
            requests.push({ method: "legacy", url });
            return responseFactory(url);
          },
        }),
    log() {},
    requestLogin() { return true; },
  };
  const context = {
    bridge,
    Date,
    encodeURIComponent,
    decodeURIComponent,
    MangasPage: function MangasPage(items, hasNextPage) {
      this.items = items;
      this.mangas = items;
      this.hasNextPage = hasNextPage;
    },
  };
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "plugins/zh.bilimanga.manga.js" });
  return { source: context.source, requests };
}

const emptyHtml = "<html><body><p>沒有符合條件的漫畫</p></body></html>";
const callbacks = [
  source => source.getPopularManga(0),
  source => source.getLatestUpdates(0),
  source => source.getSearchManga(0, "fixture", []),
  source => source.getMangaDetails({ url: "/detail/1.html", title: "fixture" }),
  source => source.getChapterList({ url: "/detail/1.html" }),
  source => source.getPageList({ url: "/read/1/1.html" }),
];

// A non-empty 200 page with no catalogue entries is a valid empty result.
{
  const run = load(() => ({ status: 200, body: emptyHtml }));
  assert.strictEqual(run.source.getPopularManga(0).items.length, 0);
  assert.strictEqual(run.requests.length, 1);
}

// The structured bridge is authoritative and the text field is accepted as its body.
{
  const run = load(() => ({ statusCode: 200, text: emptyHtml }));
  assert.strictEqual(run.source.getPopularManga(0).items.length, 0);
  assert.deepStrictEqual(run.requests.map(request => request.method), ["structured"]);
}

for (const body of ["", "  \n\t"]) {
  const run = load(() => ({ status: 200, body }));
  assert.throws(
    () => run.source.getPopularManga(0),
    /SHINSOU_SOURCE_HTTP_UNAVAILABLE/,
  );
  assert.strictEqual(run.requests.length, 1);
}

for (const response of [
  { status: 403, body: "denied" },
  { status: 429, body: "rate limited" },
  { status: 500, body: "temporary" },
  { status: 503, body: "temporary" },
  { status: 200, body: "" },
  { status: "unknown", body: emptyHtml },
  { error: "network failure" },
]) {
  const expected = response.status === 403 ? "FORBIDDEN" : "UNAVAILABLE";
  for (const callback of callbacks) {
    const run = load(() => response);
    assert.throws(
      () => callback(run.source),
      new RegExp(`SHINSOU_SOURCE_HTTP_${expected}`),
    );
    assert.strictEqual(run.requests.length, 1, `${expected} must make one request`);
  }
}

for (const body of [
  "<html><title>Just a moment...</title><script>window._cf_chl_opt={}</script></html>",
  '<form id="challenge-form"></form>',
]) {
  for (const callback of callbacks) {
    const run = load(() => ({ status: 200, body }));
    assert.throws(
      () => callback(run.source),
      /SHINSOU_SOURCE_HTTP_CHALLENGE/,
    );
    assert.strictEqual(run.requests.length, 1);
  }
}

// Passive Cloudflare JSD/Turnstile resources may occur in otherwise valid HTML.
{
  const passiveCloudflareHtml = [
    "<html><head>",
    '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>',
    '<div class="cf-turnstile" data-sitekey="fixture"></div>',
    "</head><body>catalogue</body></html>",
  ].join("");
  const run = load(() => ({ status: 200, body: passiveCloudflareHtml }));
  assert.strictEqual(run.source.getPopularManga(0).items.length, 0);
  assert.strictEqual(run.requests.length, 1);
}

// The reader's fixed desktop-browser note is a valid HTTP page that cannot provide pages.
{
  const run = load(() => ({
    status: 200,
    body: "<html><body>章節不支持桌面電腦端瀏覽器顯示</body></html>",
  }));
  assert.throws(
    () => run.source.getPageList({ url: "/read/1/1.html" }),
    /SHINSOU_SOURCE_HTTP_UNAVAILABLE/,
  );
  assert.strictEqual(run.requests.length, 1);
}

// Legacy body-only hosts remain supported for existing deployments.
{
  const run = load(() => emptyHtml, { structured: false });
  assert.strictEqual(run.source.getPopularManga(0).items.length, 0);
  assert.deepStrictEqual(run.requests.map(request => request.method), ["legacy"]);
}

console.log("BiliManga HTTP regressions: structured failures, public callbacks, and reader note PASS");
