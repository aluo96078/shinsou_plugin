const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "../src/zh.bika/bika.js");
const publishedPath = path.join(__dirname, "../plugins/zh.bika.js");
const sourceCode = fs.readFileSync(sourcePath, "utf8");
const publishedCode = fs.readFileSync(publishedPath, "utf8");

function json(value) {
    return JSON.stringify(value);
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function boot(responder, options) {
    options = options || {};
    const calls = [];
    const preferences = {};
    const loginRequests = [];
    const logs = [];
    if (options.initialToken) preferences.token = String(options.initialToken);
    const bridge = {
        httpGetWithHeaders: function(url, headers) {
            calls.push({ method: "GET", url: String(url), headers: plain(headers || {}) });
            return responder("GET", String(url), plain(headers || {}), null);
        },
        httpPost: function(url, body, headers) {
            calls.push({ method: "POST", url: String(url), body: String(body), headers: plain(headers || {}) });
            return responder("POST", String(url), plain(headers || {}), String(body));
        },
        getPreference: function(key) { return preferences[key] || ""; },
        setPreference: function(key, value) { preferences[key] = String(value); },
        log: function(message) { logs.push(String(message)); },
        domReleaseAll: function() {}
    };
    if (options.includeRequestLogin !== false) {
        bridge.requestLogin = function() {
            loginRequests.push(true);
            if (options.requestLoginThrows) throw new Error("requestLogin unavailable");
        };
    }
    const context = {
        bridge: bridge,
        SManga: {
            create: function() {
                return {
                    url: "", title: "", author: null, artist: null, description: null,
                    genre: [], status: 0, thumbnailUrl: null, initialized: false
                };
            },
            UNKNOWN: 0,
            ONGOING: 1,
            COMPLETED: 2
        },
        SChapter: {
            create: function() {
                return { url: "", name: "", chapterNumber: -1, dateUpload: 0 };
            }
        },
        Page: function(index, url, imageUrl) {
            this.index = index || 0;
            this.url = url || "";
            this.imageUrl = imageUrl || null;
        },
        MangasPage: function(mangas, hasNextPage) {
            this.mangas = mangas || [];
            this.hasNextPage = !!hasNextPage;
        }
    };
    vm.createContext(context);
    vm.runInContext(sourceCode, context, { filename: sourcePath });
    assert.ok(context.source, "plugin exports source");
    return { source: context.source, calls, preferences, loginRequests, logs };
}

assert.equal(sourceCode, publishedCode, "source and published Bika scripts stay byte-identical");

// The request signature is the same HMAC-SHA-256 envelope used by Pica Web.
{
    const runtime = boot(function() { return json({ code: 200, message: "success", data: { comics: { docs: [], page: 1, pages: 1 } } }); });
    const message = "comics?page=1&s=dd1786986849aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaGET" + runtime.source._signatureSalt;
    const expected = crypto.createHmac("sha256", runtime.source._signatureKey).update(message.toLowerCase()).digest("hex");
    assert.equal(runtime.source._hmacSha256(message.toLowerCase(), runtime.source._signatureKey), expected);
    assert.equal(
        runtime.source._requestHeaders("/comics?page=1&s=dd", "GET", "1786986849", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").signature,
        crypto.createHmac("sha256", runtime.source._signatureKey)
            .update(("comics?page=1&s=dd1786986849aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaGET" + runtime.source._signatureSalt).toLowerCase())
            .digest("hex")
    );
}

// Catalogue, details, chapters, and reader pages use the one-based API pages.
{
    const runtime = boot(function(method, url, headers, body) {
        const parsed = new URL(url);
        if (parsed.pathname === "/comics" && parsed.searchParams.get("s") === "vd") {
            return json({ code: 200, data: { comics: {
                total: 41, page: 1, pages: 2, docs: [{
                    _id: "comic-1", title: "Fixture Bika", author: "作者",
                    finished: true, thumb: { fileServer: "https://images.example", path: "cover.jpg" },
                    categories: ["偽娘哲學"], tags: ["長篇"]
                }]
            } } });
        }
        if (parsed.pathname === "/comics/comic-1") {
            return json({ code: 200, data: { comic: {
                _id: "comic-1", title: "Fixture Bika", author: "作者", description: "簡介",
                finished: true, thumb: { fileServer: "https://images.example", path: "cover.jpg" },
                categories: ["偽娘哲學"], tags: ["長篇"]
            } } });
        }
        if (parsed.pathname === "/comics/comic-1/eps") {
            return json({ code: 200, data: { eps: { page: 1, pages: 1, docs: [
                { order: 1, title: "第1話", created_at: "2026-08-15T00:00:00Z" },
                { order: 2, title: "第2話", created_at: "2026-08-16T00:00:00Z" }
            ] } } });
        }
        if (parsed.pathname === "/comics/comic-1/order/2/pages") {
            return json({ code: 200, data: { ep: { _id: "ep-2" }, pages: { page: 1, pages: 1, docs: [
                { media: { fileServer: "https://images.example", path: "page-1.jpg" } },
                { media: { fileServer: "https://images.example", path: "page-2.jpg" } }
            ] } } });
        }
        throw new Error("unexpected request: " + method + " " + url + " " + body);
    }, { initialToken: "token-fixture" });

    const catalogue = runtime.source.getPopularManga(0);
    assert.equal(catalogue.mangas.length, 1);
    assert.equal(catalogue.mangas[0].url, "/comic/comic-1");
    assert.equal(catalogue.mangas[0].thumbnailUrl, "https://images.example/static/cover.jpg");
    assert.equal(catalogue.hasNextPage, true);
    assert.equal(new URL(runtime.calls[0].url).searchParams.get("page"), "1");
    assert.equal(runtime.calls[0].headers["app-version"], "20251017");
    assert.equal(runtime.calls[0].headers.authorization, "token-fixture");
    assert.match(runtime.calls[0].headers.signature, /^[0-9a-f]{64}$/);

    const details = runtime.source.getMangaDetails(catalogue.mangas[0]);
    assert.equal(details.description, "簡介");
    assert.deepEqual(plain(details.genre), ["偽娘哲學", "長篇"]);

    const chapters = runtime.source.getChapterList(catalogue.mangas[0]);
    assert.deepEqual(plain(chapters.map(chapter => chapter.chapterNumber)), [2, 1]);
    assert.equal(chapters[0].url, "/comic/comic-1/chapter/2");
    assert.equal(chapters[0].dateUpload, new Date("2026-08-16T00:00:00Z").getTime());

    const pages = runtime.source.getPageList(chapters[0]);
    assert.deepEqual(plain(pages), [
        { index: 0, url: "", imageUrl: "https://images.example/static/page-1.jpg" },
        { index: 1, url: "", imageUrl: "https://images.example/static/page-2.jpg" }
    ]);
}

// Website list filters map to Pica's sort and query parameters.
{
    const filterRuntime = boot(function(method, url) {
        assert.equal(method, "GET");
        assert.equal(new URL(url).pathname, "/comics");
        return json({ code: 200, data: { comics: { docs: [], page: 1, pages: 1 } } });
    }, { initialToken: "token-fixture" });
    const filterList = filterRuntime.source.getFilterList();
    assert.deepEqual(plain(filterList[0]), {
        type: "select", name: "排序", values: ["新到舊", "舊到新", "最多愛心", "最多紳士指名次數"], state: 0
    });
    assert.equal(filterList[1].type, "select");
    assert.equal(filterList[1].name, "分類");
    assert.equal(filterList[1].values[0], "全部");
    assert.equal(filterList[1].values.includes("偽娘哲學"), true);
    assert.deepEqual(plain(filterList.slice(1).map(function(filter) { return filter.name; })),
        ["分類", "標籤", "作者", "翻譯團隊", "創作者 ID"]);

    const categoryIndex = filterRuntime.source._categoryValues.indexOf("偽娘哲學");
    assert.ok(categoryIndex > 0);
    filterRuntime.source.getSearchManga(0, "", [
        { type: "select", name: "排序", state: 2 },
        { type: "select", name: "分類", state: categoryIndex },
        { type: "text", name: "標籤", state: "長篇" },
        { type: "text", name: "作者", state: "作者" },
        { type: "text", name: "翻譯團隊", state: "團隊" },
        { type: "text", name: "創作者 ID", state: "creator-1" }
    ]);
    const listUrl = new URL(filterRuntime.calls[0].url);
    assert.equal(listUrl.searchParams.get("s"), "ld");
    assert.equal(listUrl.searchParams.get("c"), "偽娘哲學");
    assert.equal(listUrl.searchParams.get("t"), "長篇");
    assert.equal(listUrl.searchParams.get("a"), "作者");
    assert.equal(listUrl.searchParams.get("ct"), "團隊");
    assert.equal(listUrl.searchParams.get("ca"), "creator-1");
}

// Advanced search keeps the website's sort and supports multiple categories.
{
    const searchRuntime = boot(function(method, url, headers, body) {
        assert.equal(method, "POST");
        assert.equal(new URL(url).pathname, "/comics/advanced-search");
        assert.deepEqual(JSON.parse(body), {
            keyword: "測試", sort: "da", categories: ["偽娘哲學", "女裝"]
        });
        return json({ code: 200, data: { comics: { docs: [], page: 1, pages: 1 } } });
    }, { initialToken: "token-fixture" });
    searchRuntime.source.getSearchManga(0, "測試", [
        { type: "select", name: "排序", state: 1 },
        { type: "text", name: "分類", state: "偽娘哲學,女裝" }
    ]);
    assert.equal(new URL(searchRuntime.calls[0].url).searchParams.get("s"), "da");
}

// A protected call without a token asks a new client to show login and does
// not waste a network request that cannot succeed.
{
    const runtime = boot(function() {
        throw new Error("protected HTTP must not run without a token");
    });
    const result = runtime.source.getPopularManga(0);
    assert.deepEqual(plain(result.mangas), []);
    assert.equal(result.hasNextPage, false);
    assert.equal(runtime.calls.length, 0);
    assert.equal(runtime.loginRequests.length, 1);
    assert.deepEqual(runtime.logs, []);
}

// Old clients have no requestLogin bridge member.  The updated plugin must
// silently return an empty result instead of throwing a JavaScript error.
{
    const runtime = boot(function() {
        throw new Error("protected HTTP must not run without a token");
    }, { includeRequestLogin: false });
    let result;
    assert.doesNotThrow(function() {
        result = runtime.source.getPopularManga(0);
    });
    assert.deepEqual(plain(result.mangas), []);
    assert.equal(runtime.calls.length, 0);
    assert.deepEqual(runtime.logs, []);
}

// A client bridge that exposes requestLogin but rejects the call is treated
// like an older client and remains completely silent.
{
    const runtime = boot(function() {
        throw new Error("protected HTTP must not run without a token");
    }, { requestLoginThrows: true });
    assert.doesNotThrow(function() {
        runtime.source.getPopularManga(0);
    });
    assert.equal(runtime.calls.length, 0);
    assert.equal(runtime.loginRequests.length, 1);
    assert.deepEqual(runtime.logs, []);
}

// A rejected protected request invalidates the stale token and asks the app
// for login once.  It does not retry the same unauthorized call on a mirror.
{
    const runtime = boot(function() {
        return json({ code: 401, message: "unauthorized" });
    }, { initialToken: "expired-token" });
    const result = runtime.source.getPopularManga(0);
    assert.deepEqual(plain(result.mangas), []);
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.calls[0].headers.authorization, "expired-token");
    assert.equal(runtime.preferences.token, "");
    assert.equal(runtime.loginRequests.length, 1);
    assert.deepEqual(runtime.logs, []);
}

// A failed sign-in response belongs to the already-open login dialog and
// must never recursively request another one.
{
    const runtime = boot(function(method, url) {
        assert.equal(method, "POST");
        assert.equal(new URL(url).pathname, "/auth/sign-in");
        return json({ code: 401, message: "invalid credentials" });
    });
    assert.equal(runtime.source.login("user@example.com", "wrong"), false);
    assert.equal(runtime.calls.length, 1);
    assert.equal(runtime.loginRequests.length, 0);
}

// Login is allowed without an existing token and stores the new API token.
{
    const runtime = boot(function(method, url, headers, body) {
        assert.equal(method, "POST");
        assert.equal(new URL(url).pathname, "/auth/sign-in");
        assert.deepEqual(JSON.parse(body), { email: "user@example.com", password: "secret" });
        assert.equal(headers.time.length, 10);
        assert.equal(headers.nonce.length, 32);
        const expectedSignature = crypto.createHmac("sha256", runtime.source._signatureKey)
            .update(("auth/sign-in" + headers.time + headers.nonce + "POST" + runtime.source._signatureSalt).toLowerCase())
            .digest("hex");
        assert.equal(headers.signature, expectedSignature);
        return json({ code: 200, data: { token: "token-fixture" } });
    });
    assert.equal(runtime.source.login("user@example.com", "secret"), true);
    assert.equal(runtime.preferences.token, "token-fixture");
    assert.equal(runtime.loginRequests.length, 0);
}

console.log("Bika smoke tests passed");
