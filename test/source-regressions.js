"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");

function attributes(markup) {
  const result = {};
  const pattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = pattern.exec(markup))) result[match[1]] = match[3];
  return result;
}

function element(markup, baseUrl) {
  const attrs = attributes(markup);
  return {
    attr(name) { return attrs[name] || ""; },
    absUrl(name) {
      const value = attrs[name] || "";
      return value ? new URL(value, baseUrl).toString() : "";
    },
    text() { return markup.replace(/<[^>]*>/g, "").trim(); },
  };
}

function elements(values) {
  values.isEmpty = () => values.length === 0;
  values.size = () => values.length;
  values.last = () => values[values.length - 1] || null;
  return values;
}

const fixtureJsoup = {
  parse(html, baseUrl) {
    return {
      select(selector) {
        if (selector.includes(".comic-contain__item")) {
          return elements(Array.from(html.matchAll(/<amp-img\b[^>]*class=["'][^"']*comic-contain__item[^"']*["'][^>]*>/gi),
            (match) => element(match[0], baseUrl)));
        }
        if (selector === "#gdt a") {
          const block = (html.match(/<div\b[^>]*id=["']gdt["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
          return elements(Array.from(block.matchAll(/<a\b[^>]*>/gi), (match) => element(match[0], baseUrl)));
        }
        return elements([]);
      },
      selectFirst(selector) {
        if (selector === "#img") {
          const match = html.match(/<img\b[^>]*id=["']img["'][^>]*>/i);
          return match ? element(match[0], baseUrl) : null;
        }
        return null;
      },
    };
  },
};

function loadSource(fileName, bridge, extra = {}) {
  const context = {
    console,
    Date,
    Math,
    JSON,
    encodeURIComponent,
    decodeURIComponent,
    bridge,
    Page: function Page(index, url, imageUrl) {
      this.index = index || 0;
      this.url = url || "";
      this.imageUrl = imageUrl || null;
    },
    MangasPage: function MangasPage(mangas, hasNextPage) {
      this.mangas = mangas || [];
      this.hasNextPage = Boolean(hasNextPage);
    },
    ...extra,
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "plugins", fileName), "utf8"),
    context,
    { filename: "plugins/" + fileName },
  );
  return context;
}

// Baozi must use the public redirect route before Cloudflare-protected app mirrors and must
// accept bzcdn.net paths whose internal directory does not match comic_id.
const baoziRequests = [];
const baoziFixture = [
  '<amp-img class="comic-contain__item" src="loading.gif" data-src="https://s1.bzcdn.net/scomic/internal-slug/0/1/1.jpg"></amp-img>',
  '<amp-img class="comic-contain__item" data-src="https://s1.bzcdn.net/scomic/internal-slug/0/1/2.jpg"></amp-img>',
].join("");
const baozi = loadSource("zh.baozimh.js", {
  httpGetWithHeaders(url) {
    baoziRequests.push(url);
    assert.ok(!url.includes("app.baozimh.com"), "app mirror must not run before a usable web reader");
    return baoziFixture;
  },
  domReleaseAll() {},
  log() {},
}, { Jsoup: fixtureJsoup });
const baoziPages = baozi.source.getPageList({
  url: "/user/page_direct?comic_id=public-slug&section_slot=0&chapter_slot=8",
});
assert.strictEqual(baoziRequests[0], "https://www.baozimh.com/user/page_direct?comic_id=public-slug&section_slot=0&chapter_slot=8");
assert.deepStrictEqual(Array.from(baoziPages, (page) => page.imageUrl), [
  "https://s1.bzcdn.net/scomic/internal-slug/0/1/1.jpg",
  "https://s1.bzcdn.net/scomic/internal-slug/0/1/2.jpg",
]);

// E-Hentai must return viewer pages without resolving the entire gallery up front.
const galleryUrl = "https://e-hentai.org/g/1/token/";
const viewerOne = "https://e-hentai.org/s/a/1-1";
const viewerTwo = "https://e-hentai.org/s/b/1-2";
let ehentaiViewerCalls = 0;
const ehentai = loadSource("eh.ehentai.js", {
  httpGetWithHeaders(url) {
    if (url === galleryUrl) {
      return `<div id="gdt"><a href="${viewerOne}"></a><a href="${viewerTwo}"></a></div>`;
    }
    if (url === viewerOne || url === viewerTwo) {
      ehentaiViewerCalls += 1;
      throw new Error("viewer pages must remain lazy");
    }
    throw new Error("Unexpected E-Hentai URL: " + url);
  },
  domReleaseAll() {},
  log() {},
}, { Jsoup: fixtureJsoup });
const ehentaiPages = ehentai.source.getPageList({ url: galleryUrl });
assert.strictEqual(ehentaiPages.length, 2);
assert.strictEqual(ehentaiViewerCalls, 0);
assert.deepStrictEqual(Array.from(ehentaiPages, (page) => page.url), [viewerOne, viewerTwo]);
assert.ok(ehentaiPages.every((page) => page.imageUrl === null));

// DM5 accepts a browser-imported member cookie and explains the CAPTCHA flow otherwise.
let dm5Session = false;
let dm5Cleared = false;
const dm5 = loadSource("zh.dm5.js", {
  httpGetWithHeaders(url) {
    assert.match(url, /\/dm5\.ashx\?action=getuserinfo/);
    return JSON.stringify({ isSuccess: dm5Session });
  },
  clearCookies() { dm5Cleared = true; },
});
assert.strictEqual(dm5.source.supportsLogin, true);
assert.strictEqual(dm5.source.webChallengeUrl, "https://www.dm5.com/login/");
const dm5Guest = dm5.source.login("member", "secret");
assert.strictEqual(dm5Guest.loggedIn, false);
assert.match(dm5Guest.errorMessage, /旋轉驗證碼/);
dm5Session = true;
assert.strictEqual(dm5.source.login("member", "secret").loggedIn, true);
dm5.source.logout();
assert.strictEqual(dm5Cleared, true);

// Bika login is browser-session-only: it must never call the rate-limited password endpoint or
// clear a token that Web Challenge already imported from the website's localStorage.
function bikaBridge(response, initialPreferences = {}) {
  const preferences = { ...initialPreferences };
  const calls = [];
  return {
    calls,
    preferences,
    httpPost(url, body, headers) {
      calls.push({ url, body, headers });
      return JSON.stringify(response);
    },
    httpPostResponse(url, body, headers) {
      calls.push({ url, body, headers });
      return { status: response.code || 200, body: JSON.stringify(response) };
    },
    httpGetResponse(url, headers) {
      calls.push({ url, headers });
      return { status: response.code || 200, body: JSON.stringify(response) };
    },
    httpGetWithHeaders() { throw new Error("structured GET bridge should be preferred"); },
    getPreference(key) { return preferences[key] || ""; },
    setPreference(key, value) { preferences[key] = value; },
    log() {},
  };
}

const browserOnlyBridge = bikaBridge({ code: 400, message: "too many requests" });
const browserOnlyBika = loadSource("zh.bika.js", browserOnlyBridge);
const browserOnlyLogin = browserOnlyBika.source.login("member@example.com", "secret");
assert.strictEqual(browserOnlyLogin.loggedIn, false);
assert.match(browserOnlyLogin.errorMessage, /在瀏覽器登入.*匯入瀏覽器工作階段/);
assert.strictEqual(browserOnlyBridge.calls.length, 0, "Bika login must not call /auth/sign-in");

const successBridge = bikaBridge(
  { code: 400, message: "too many requests" },
  { token: "browser-token", nonce: "abc234abc234abc234abc234abc234ab" },
);
const successfulBika = loadSource("zh.bika.js", successBridge);
assert.strictEqual(successfulBika.source.login("member@example.com", "secret").loggedIn, true);
assert.strictEqual(successBridge.preferences.token, "browser-token");
assert.strictEqual(successBridge.calls.length, 0, "an imported browser session must not be refreshed by password login");

assert.strictEqual(
  successfulBika.source._safeErrorText("too many requests", 400),
  "嗶咔 API 以 HTTP 400 回傳限流訊息（too many requests）。這不是 Cloudflare Worker Proxy 的 HTTP 429；請稍候後再試。",
);
assert.match(
  successfulBika.source._safeErrorText("too many requests", 429),
  /請求過於頻繁.*HTTP 429/,
);
assert.match(
  successfulBika.source._safeErrorText("<!DOCTYPE html><html><body>proxy error</body></html>", 502),
  /API 返回了網頁.*HTTP 502/,
);
assert.strictEqual(
  successfulBika.source._safeErrorText(
    'Exception in http request: Error Domain=NSURLErrorDomain Code=-1003 "A server with the specified hostname could not be found."',
  ),
  "找不到嗶咔 API 主機（DNS -1003）。請檢查網路或 DNS 後再試。",
);

const fixedHeaders = successfulBika.source._requestHeaders("/auth/sign-in", "POST", "1700000000", "abc234");
assert.strictEqual(successfulBika.source.baseUrl, "https://manhuabika.com");
assert.strictEqual(successfulBika.source.webChallengeUrl, "https://manhuabika.com/");
assert.strictEqual(Array.from(successfulBika.source.webChallengeLocalStorageKeys).join(","), "token,nonce");
assert.strictEqual(Array.from(successfulBika.source.requiredWebChallengeLocalStorageKeys).join(","), "token,nonce");
assert.strictEqual(
  Object.keys(successfulBika.source.headers).some((name) => name.toLowerCase() === "user-agent"),
  false,
  "Bika must use the host platform browser User-Agent",
);
assert.strictEqual(fixedHeaders.Origin, "https://manhuabika.com");
assert.strictEqual(fixedHeaders.Referer, "https://manhuabika.com/");
const signedText = ("auth/sign-in" + "1700000000" + "abc234" + "POST" + successfulBika.source._signatureSalt).toLowerCase();
const expectedSignature = crypto.createHmac("sha256", successfulBika.source._signatureKey).update(signedText).digest("hex");
assert.strictEqual(fixedHeaders.signature, expectedSignature);
const firstNonce = successfulBika.source._requestNonce();
successBridge.preferences.nonce = "def234def234def234def234def234de";
const secondNonce = successfulBika.source._requestNonce();
const nonceAlphabet = new Set("abcdefghijkmnpqrstwxyz2345678");
assert.strictEqual(firstNonce.length, 32);
assert.strictEqual(secondNonce.length, 32);
assert.ok(Array.from(firstNonce).every((value) => nonceAlphabet.has(value)));
assert.ok(Array.from(secondNonce).every((value) => nonceAlphabet.has(value)));
assert.notStrictEqual(firstNonce, secondNonce, "a newly imported nonce must replace the runtime cache immediately");
assert.strictEqual(secondNonce, successBridge.preferences.nonce);

assert.throws(
  () => successfulBika.source.getLatestUpdates(0),
  /HTTP 400.*too many requests|too many requests.*HTTP 400/,
  "Bika API failures must not become a fake empty catalogue",
);

const incompleteBridge = bikaBridge(
  { code: 200, data: {} },
  { token: "browser-token", nonce: "abc234abc234abc234abc234abc234ab" },
);
const incompleteBika = loadSource("zh.bika.js", incompleteBridge);
assert.throws(
  () => incompleteBika.source.getLatestUpdates(0),
  /成功回應缺少漫畫目錄資料/,
  "a successful envelope without comics must not become a fake empty catalogue",
);

console.log("source regressions: Baozi, E-Hentai, DM5 login, and Bika login verified");
