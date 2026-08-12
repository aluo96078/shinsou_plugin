const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "../src/zh.mangacopy/mangacopy.js");
const publishedPath = path.join(__dirname, "../plugins/zh.mangacopy.js");
const sourceCode = fs.readFileSync(sourcePath, "utf8");
const publishedCode = fs.readFileSync(publishedPath, "utf8");

const API_ORIGIN = "https://api.manga2026.xyz";
const FIRST_API_MIRROR = "https://mapi.hotmangasg.com";
const SITE_ORIGIN = "https://www.mangacopy.com";
const FIRST_SITE_MIRROR = "https://www.2026copy.com";
const AES_KEY = "op0zzpvv.nmn.00p";
const API_HEADERS = {
    "User-Agent": "COPY/3.0.0",
    "Accept": "application/json",
    "version": "2025.08.15",
    "platform": "1",
    "webp": "1",
    "region": "1"
};

function json(value) {
    return JSON.stringify(value);
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function encryptWebsitePayload(value) {
    const ivText = "0123456789abcdef";
    const cipher = crypto.createCipheriv(
        "aes-128-cbc",
        Buffer.from(AES_KEY, "utf8"),
        Buffer.from(ivText, "ascii")
    );
    const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(json(value), "utf8")),
        cipher.final()
    ]);
    return ivText + ciphertext.toString("hex");
}

function boot(responder) {
    const calls = [];
    const logs = [];
    const context = {
        bridge: {
            httpGetWithHeaders: function(url, headers) {
                calls.push({ url: String(url), headers: plain(headers || {}) });
                return responder(String(url), plain(headers || {}));
            },
            log: function(message) {
                logs.push(String(message));
            },
            domReleaseAll: function() {}
        },
        Jsoup: {
            parse: function() {
                throw new Error("unexpected DOM fallback in offline smoke test");
            }
        },
        SManga: {
            create: function() {
                return {
                    url: "",
                    title: "",
                    author: null,
                    artist: null,
                    description: null,
                    genre: null,
                    status: 0,
                    thumbnailUrl: null,
                    initialized: false
                };
            },
            UNKNOWN: 0,
            ONGOING: 1,
            COMPLETED: 2
        },
        SChapter: {
            create: function() {
                return {
                    url: "",
                    name: "",
                    scanlator: null,
                    dateUpload: 0,
                    chapterNumber: -1
                };
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
    return { source: context.source, calls: calls, logs: logs };
}

function assertApiRequest(call, expectedPath, expectedOffset) {
    const url = new URL(call.url);
    assert.equal(url.pathname, expectedPath);
    if (expectedOffset != null) assert.equal(url.searchParams.get("offset"), String(expectedOffset));
    assert.deepEqual(call.headers, API_HEADERS);
}

assert.equal(
    sourceCode,
    publishedCode,
    "source and published MangaCopy scripts stay byte-identical"
);

// A risk-control response from the primary API must be skipped in favor of a
// working API mirror. Page 1 is zero-based, so its catalogue offset is 50.
{
    const catalogue = {
        code: 200,
        message: "ok",
        results: {
            total: 100,
            limit: 50,
            offset: 50,
            list: [
                {
                    name: "Fixture Manga",
                    path_word: "fixture-manga",
                    cover: "https://images.example/cover.jpg",
                    author: [{ name: "Fixture Author" }],
                    status: 0
                }
            ]
        }
    };
    const riskControl = {
        code: 210,
        message: "risk control",
        results: { detail: "try another host" }
    };
    const runtime = boot(function(url) {
        const parsed = new URL(url);
        if (parsed.origin === API_ORIGIN) return json(riskControl);
        if (parsed.origin === FIRST_API_MIRROR) return json(catalogue);
        throw new Error("unexpected request: " + url);
    });

    const result = runtime.source.getPopularManga(1);
    assert.equal(result.mangas.length, 1);
    assert.equal(result.mangas[0].title, "Fixture Manga");
    assert.equal(result.hasNextPage, true);
    assert.equal(runtime.calls.length, 2);
    assert.equal(new URL(runtime.calls[0].url).origin, API_ORIGIN);
    assert.equal(new URL(runtime.calls[1].url).origin, FIRST_API_MIRROR);
    for (const call of runtime.calls) {
        assertApiRequest(call, "/api/v3/comics", 50);
        assert.equal(new URL(call.url).searchParams.get("limit"), "50");
        assert.equal(new URL(call.url).searchParams.get("ordering"), "-popular");
    }
}

// Reader responses from the v3 API are plaintext JSON. No token or AES step
// is needed for public chapters; contents are mapped directly to Page values.
{
    const readerResponse = {
        code: 200,
        message: "ok",
        results: {
            chapter: {
                uuid: "chapter-api",
                contents: [
                    { url: "https://images.example/api-001.webp" },
                    { imageUrl: "https://images.example/api-002.webp" }
                ]
            }
        }
    };
    const runtime = boot(function(url) {
        assert.equal(new URL(url).origin, API_ORIGIN);
        return json(readerResponse);
    });

    const pages = runtime.source.getPageList({
        url: "/comic/fixture-manga/chapter/chapter-api"
    });
    assert.deepEqual(plain(pages), [
        { index: 0, url: "", imageUrl: "https://images.example/api-001.webp" },
        { index: 1, url: "", imageUrl: "https://images.example/api-002.webp" }
    ]);
    assert.equal(runtime.calls.length, 1);
    assertApiRequest(
        runtime.calls[0],
        "/api/v3/comic/fixture-manga/chapter/chapter-api"
    );
}

// If every API host is risk-blocked, reader parsing falls back to website
// contentKey data. An invalid ciphertext on the main site must be contained so
// the first website mirror can still provide a valid AES-CBC payload.
{
    const encrypted = encryptWebsitePayload([
        { url: "https://images.example/web-001.jpg" },
        { imageUrl: "/images/web-002.jpg" }
    ]);
    const invalidCiphertext = "0123456789abcdefnot-hex";
    const riskControl = json({
        code: 210,
        message: "risk control",
        results: { detail: "try website" }
    });
    const runtime = boot(function(url) {
        const parsed = new URL(url);
        if (parsed.pathname.indexOf("/api/v3/") === 0) return riskControl;
        if (parsed.origin === SITE_ORIGIN) {
            return "<script>var contentKey = '" + invalidCiphertext + "';</script>";
        }
        if (parsed.origin === FIRST_SITE_MIRROR) {
            return "<script>var contentKey = '" + encrypted + "';</script>";
        }
        throw new Error("unexpected request: " + url);
    });

    assert.throws(
        function() { runtime.source._decryptPayload(invalidCiphertext); },
        /invalid AES ciphertext/
    );
    const pages = runtime.source.getPageList({
        url: "/comic/fixture-manga/chapter/chapter-web"
    });
    assert.deepEqual(plain(pages), [
        { index: 0, url: "", imageUrl: "https://images.example/web-001.jpg" },
        { index: 1, url: "", imageUrl: FIRST_SITE_MIRROR + "/images/web-002.jpg" }
    ]);

    const websiteCalls = runtime.calls.filter(function(call) {
        return new URL(call.url).pathname.indexOf("/api/v3/") !== 0;
    });
    assert.deepEqual(
        websiteCalls.map(function(call) { return new URL(call.url).origin; }),
        [SITE_ORIGIN, FIRST_SITE_MIRROR]
    );
    assert.ok(
        runtime.logs.some(function(message) {
            return message.indexOf("invalid AES ciphertext") !== -1;
        }),
        "invalid website ciphertext is logged before mirror fallback"
    );
}

console.log(
    "MangaCopy smoke tests passed: parity, API headers/offset/mirror, " +
    "plaintext reader, website AES fallback, invalid ciphertext"
);
