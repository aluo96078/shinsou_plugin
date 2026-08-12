const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.join(__dirname, "../src/all.nhentai/nhentai.js");
const publishedPath = path.join(__dirname, "../plugins/all.nhentai.js");
const sourceCode = fs.readFileSync(sourcePath, "utf8");

function json(value) {
    return JSON.stringify(value);
}

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function additiveIndex(mediaPath, serverCount) {
    let sum = 0;
    for (let i = 0; i < mediaPath.length; i++) {
        sum += mediaPath.charCodeAt(i);
    }
    return sum % serverCount;
}

const cdnFixture = {
    image_servers: [
        "https://i1.nhentai.net",
        "https://i2.nhentai.net",
        "https://i3.nhentai.net",
        "https://i4.nhentai.net"
    ],
    thumb_servers: [
        "https://t1.nhentai.net",
        "https://t2.nhentai.net",
        "https://t3.nhentai.net",
        "https://t4.nhentai.net"
    ]
};

const visibleSummary = {
    id: 672258,
    media_id: "4115116",
    english_title: "English title",
    japanese_title: "日本語題",
    thumbnail: "galleries/4115116/thumb.webp",
    thumbnail_width: 250,
    thumbnail_height: 362,
    num_pages: 2,
    num_favorites: 123,
    tag_ids: [1, 2],
    blacklisted: false
};

const blockedSummary = Object.assign({}, visibleSummary, {
    id: 9,
    media_id: "9",
    english_title: "Must not be displayed",
    thumbnail: "galleries/9/thumb.webp",
    blacklisted: true
});

const detailFixture = {
    id: 672258,
    media_id: "4115116",
    title: {
        english: "English title",
        japanese: "日本語題",
        pretty: "Pretty title"
    },
    cover: {
        path: "galleries/4115116/cover.webp.webp",
        width: 350,
        height: 507
    },
    thumbnail: {
        path: "galleries/4115116/thumb.webp",
        width: 250,
        height: 362
    },
    scanlator: "Scanner",
    upload_date: 1700000000,
    tags: [
        { id: 1, type: "tag", name: "sole female", slug: "sole-female" },
        { id: 2, type: "artist", name: "artist a", slug: "artist-a" },
        { id: 3, type: "group", name: "group a", slug: "group-a" },
        { id: 4, type: "language", name: "chinese", slug: "chinese" },
        { id: 5, type: "category", name: "doujinshi", slug: "doujinshi" },
        { id: 6, type: "artist", name: "artist b", slug: "artist-b" }
    ],
    num_pages: 2,
    num_favorites: 123,
    pages: [
        {
            number: 1,
            path: "galleries/4115116/1.webp",
            width: 1280,
            height: 1804,
            thumbnail: "galleries/4115116/1t.webp",
            thumbnail_width: 200,
            thumbnail_height: 282
        },
        {
            number: 2,
            path: "galleries/4115116/2.webp",
            width: 1280,
            height: 1804,
            thumbnail: "galleries/4115116/2t.webp.webp",
            thumbnail_width: 200,
            thumbnail_height: 282
        }
    ]
};

const paginatedFixture = {
    result: [visibleSummary, blockedSummary],
    num_pages: 2,
    per_page: 25,
    total: 50
};

const fullPageFixture = Object.assign({}, paginatedFixture, {
    result: Array.from({ length: 25 }, function(_, index) {
        return Object.assign({}, visibleSummary, {
            id: visibleSummary.id + index,
            thumbnail: "galleries/" + (4115116 + index) + "/thumb.webp"
        });
    })
});

function fixtureRouter(overrides) {
    const values = overrides || {};

    function response(key, fallback) {
        const value = hasOwn(values, key) ? values[key] : fallback;
        return typeof value === "function" ? value() : value;
    }

    return function route(url) {
        const parsed = new URL(url);

        if (parsed.pathname === "/api/v2/cdn") {
            return response("cdn", json(cdnFixture));
        }
        if (parsed.pathname === "/api/v2/galleries") {
            return response("latest", json(paginatedFixture));
        }
        if (parsed.pathname === "/api/v2/search") {
            return response("search", json(paginatedFixture));
        }
        if (parsed.pathname === "/api/v2/galleries/672258") {
            return response("detail", json(detailFixture));
        }

        throw new Error("Unexpected offline request: " + url);
    };
}

function boot(responder, initialNow) {
    const calls = [];

    function request(method, url, headers) {
        calls.push({ method: method, url: url, headers: plain(headers || {}) });
        return responder(url, headers);
    }

    const context = {
        bridge: {
            httpGet: function(url) {
                return request("GET", url, {});
            },
            httpGetWithHeaders: function(url, headers) {
                return request("GET", url, headers);
            },
            log: function() {},
            domReleaseAll: function() {},
            getPreference: function() { return null; }
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
            COMPLETED: 2,
            LICENSED: 3,
            PUBLISHING_FINISHED: 4,
            CANCELLED: 5,
            ON_HIATUS: 6
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
    if (typeof initialNow === "number") {
        context.__testNow = initialNow;
        vm.runInContext("Date.now = function() { return __testNow; };", context);
    }
    vm.runInContext(sourceCode, context, { filename: sourcePath });
    assert.ok(context.source, "plugin exports source");
    return {
        source: context.source,
        calls: calls,
        setNow: function(value) {
            assert.equal(typeof initialNow, "number", "boot must receive initialNow to control time");
            context.__testNow = value;
        }
    };
}

function requestsFor(calls, pathname) {
    return calls.filter(function(call) {
        return new URL(call.url).pathname === pathname;
    });
}

function onlyRequestFor(calls, pathname) {
    const matches = requestsFor(calls, pathname);
    assert.equal(matches.length, 1, "expected exactly one request for " + pathname);
    return new URL(matches[0].url);
}

function assertEmptyMangasPage(result) {
    assert.deepEqual(plain(result.mangas), []);
    assert.equal(result.hasNextPage, false);
}

assert.equal(
    sourceCode,
    fs.readFileSync(publishedPath, "utf8"),
    "source and published NHentai scripts stay identical"
);

{
    const runtime = boot(fixtureRouter());
    const source = runtime.source;
    assert.equal(source.baseUrl, "https://nhentai.net");
    assert.equal(source.apiUrl, "https://nhentai.net/api/v2");
    assert.equal(source.supportsLatest, true);

    const result = source.getLatestUpdates(0);
    const request = onlyRequestFor(runtime.calls, "/api/v2/galleries");
    assert.equal(request.searchParams.get("page"), "1");
    assert.equal(request.searchParams.get("per_page"), "25");
    assert.equal(result.hasNextPage, true);
    assert.equal(result.mangas.length, 1, "blacklisted summaries are filtered");
    assert.deepEqual(plain(result.mangas[0]), {
        url: "/g/672258/",
        title: "English title",
        author: null,
        artist: null,
        description: null,
        genre: null,
        status: 0,
        thumbnailUrl: "https://t2.nhentai.net/galleries/4115116/thumb.webp",
        initialized: false
    });
}

{
    const blockedPage = Object.assign({}, paginatedFixture, { result: [blockedSummary] });
    const runtime = boot(fixtureRouter({ latest: json(blockedPage) }));
    const result = runtime.source.getLatestUpdates(0);
    assert.deepEqual(plain(result.mangas), []);
    assert.equal(
        result.hasNextPage,
        true,
        "pagination metadata, not the filtered item count, controls hasNextPage"
    );
}

{
    const runtime = boot(fixtureRouter());
    const result = runtime.source.getPopularManga(0);
    assert.equal(result.mangas.length, 1);
    assert.equal(result.mangas[0].url, "/g/672258/");
    assert.equal(result.hasNextPage, true);

    const firstRequest = onlyRequestFor(runtime.calls, "/api/v2/search");
    assert.equal(firstRequest.searchParams.get("query"), "pages:>0");
    assert.equal(firstRequest.searchParams.get("sort"), "popular-today");
    assert.equal(firstRequest.searchParams.get("page"), "1");

    const secondResult = runtime.source.getPopularManga(1);
    assert.equal(secondResult.mangas.length, 1);
    assert.equal(secondResult.hasNextPage, false);
    const searchRequests = requestsFor(runtime.calls, "/api/v2/search");
    assert.equal(searchRequests.length, 2, "popular browsing uses the paginated search endpoint");
    assert.equal(new URL(searchRequests[1].url).searchParams.get("page"), "2");
    assert.equal(requestsFor(runtime.calls, "/api/v2/galleries/popular").length, 0);
}

{
    const runtime = boot(fixtureRouter());
    runtime.source._rateLimits.search = { permits: 2, period: 60000 };

    assert.equal(runtime.source.getPopularManga(0).mangas.length, 1);
    assert.equal(runtime.source.getSearchManga(0, "query", []).mangas.length, 1);
    assertEmptyMangasPage(runtime.source.getPopularManga(1));
    assert.equal(
        requestsFor(runtime.calls, "/api/v2/search").length,
        2,
        "popular browsing and ordinary searches share the search endpoint quota"
    );
}

{
    const runtime = boot(fixtureRouter());
    const filters = [
        { type: "select", name: "Sort By", state: 2 },
        { type: "select", name: "Language", state: 3 },
        { type: "text", name: "Tags", state: "big breasts, schoolgirl" },
        { type: "text", name: "Excluded Tags", state: "guro, scat" },
        { type: "text", name: "Minimum Pages", state: "10" },
        { type: "text", name: "Maximum Pages", state: "20" }
    ];
    const result = runtime.source.getSearchManga(2, "blue archive", filters);
    const request = onlyRequestFor(runtime.calls, "/api/v2/search");

    assert.equal(request.searchParams.get("page"), "3");
    assert.equal(request.searchParams.get("sort"), "popular-week");
    assert.equal(
        request.searchParams.get("query"),
        "blue archive language:chinese tag:\"big breasts\" tag:\"schoolgirl\" " +
            "-tag:\"guro\" -tag:\"scat\" pages:>=10 pages:<=20"
    );
    assert.equal(result.mangas.length, 1);
    assert.equal(result.hasNextPage, false);
}

{
    const runtime = boot(fixtureRouter());
    runtime.source.getSearchManga(0, "", [
        { type: "select", name: "Sort By", state: 4 }
    ]);
    const request = onlyRequestFor(runtime.calls, "/api/v2/search");
    assert.equal(request.searchParams.get("query"), "pages:>0");
    assert.equal(request.searchParams.get("sort"), "popular");
}

{
    const runtime = boot(fixtureRouter());
    runtime.source.getSearchManga(0, "", []);
    onlyRequestFor(runtime.calls, "/api/v2/galleries");
    assert.equal(requestsFor(runtime.calls, "/api/v2/search").length, 0);
}

{
    const runtime = boot(fixtureRouter());
    const sortFilter = plain(runtime.source.getFilterList()).find(function(filter) {
        return filter.type === "select" && filter.name === "Sort By";
    });
    assert.deepEqual(sortFilter.values, [
        "Recent",
        "Popular Today",
        "Popular This Week",
        "Popular This Month",
        "All Time Popular"
    ]);
}

{
    const runtime = boot(fixtureRouter());
    const input = { url: "/g/672258/", title: "List title" };
    const result = runtime.source.getMangaDetails(input);

    onlyRequestFor(runtime.calls, "/api/v2/galleries/672258");
    assert.equal(result.url, "/g/672258/");
    assert.equal(result.initialized, true);
    assert.equal(result.status, 2);
    assert.equal(result.title, "English title");
    assert.equal(
        result.thumbnailUrl,
        "https://t1.nhentai.net/galleries/4115116/cover.webp.webp",
        "the exact double-extension cover path is preserved"
    );
    assert.deepEqual(plain(result.genre), [
        "category:doujinshi",
        "language:chinese",
        "sole female"
    ]);
    assert.equal(result.artist, "artist a, artist b");
    assert.equal(result.author, "group a");
    assert.equal(
        result.description,
        "日本語題\n" +
            "Pages: 2\n" +
            "Favorites: 123\n" +
            "Uploaded: 2023-11-14T22:13:20.000Z"
    );
}

{
    const fallbackCases = [
        { english: "", pretty: "Pretty title", japanese: "日本語題", expected: "Pretty title" },
        { english: "", pretty: "", japanese: "日本語題", expected: "日本語題" },
        { english: "", pretty: "", japanese: null, expected: "Input fallback" }
    ];

    fallbackCases.forEach(function(testCase) {
        const fixture = JSON.parse(json(detailFixture));
        fixture.title = {
            english: testCase.english,
            pretty: testCase.pretty,
            japanese: testCase.japanese
        };
        const runtime = boot(fixtureRouter({ detail: json(fixture) }));
        const result = runtime.source.getMangaDetails({
            url: "/g/672258/",
            title: "Input fallback"
        });
        assert.equal(result.title, testCase.expected);
    });
}

{
    const runtime = boot(fixtureRouter());
    const chapters = runtime.source.getChapterList({
        url: "/g/672258/",
        title: "English title"
    });
    assert.equal(chapters.length, 1);
    assert.equal(chapters[0].url, "/g/672258/");
    assert.equal(chapters[0].name, "English title");
    assert.equal(chapters[0].chapterNumber, 1);
    assert.equal(chapters[0].dateUpload, 1700000000000);
    assert.equal(chapters[0].scanlator, "Scanner");
    onlyRequestFor(runtime.calls, "/api/v2/galleries/672258");
}

{
    assert.equal(additiveIndex("galleries/4115116/thumb.webp", 4), 1);
    assert.equal(additiveIndex("galleries/4115116/cover.webp.webp", 4), 0);
    assert.equal(additiveIndex("galleries/4115116/1.webp", 4), 2);
    assert.equal(additiveIndex("galleries/4115116/2.webp", 4), 3);

    const runtime = boot(fixtureRouter());
    const pages = runtime.source.getPageList({ url: "/g/672258/" });
    assert.deepEqual(plain(pages), [
        {
            index: 0,
            url: "",
            imageUrl: "https://i3.nhentai.net/galleries/4115116/1.webp"
        },
        {
            index: 1,
            url: "",
            imageUrl: "https://i4.nhentai.net/galleries/4115116/2.webp"
        }
    ]);
    onlyRequestFor(runtime.calls, "/api/v2/galleries/672258");
}

{
    const runtime = boot(fixtureRouter());
    runtime.source.getLatestUpdates(0);
    runtime.source.getMangaDetails({ url: "/g/672258/", title: "English title" });
    runtime.source.getPageList({ url: "/g/672258/" });
    assert.equal(
        requestsFor(runtime.calls, "/api/v2/cdn").length,
        1,
        "CDN configuration is cached for the lifetime of the source"
    );
    assert.equal(
        requestsFor(runtime.calls, "/api/v2/galleries/672258").length,
        1,
        "details are reused by the reader within the detail cache"
    );
}

{
    const secondDetail = JSON.parse(json(detailFixture));
    secondDetail.id = 672259;
    secondDetail.title.english = "Second detail";

    const runtime = boot(function(url) {
        const pathname = new URL(url).pathname;
        if (pathname === "/api/v2/galleries/672258") return json(detailFixture);
        if (pathname === "/api/v2/galleries/672259") return json(secondDetail);
        throw new Error("Unexpected offline request: " + url);
    });
    runtime.source._detailCacheLimit = 1;

    assert.equal(runtime.source.getChapterList({ url: "/g/672258/" }).length, 1);
    assert.equal(runtime.source.getChapterList({ url: "/g/672259/" }).length, 1);
    assert.deepEqual(Object.keys(runtime.source._detailCache), ["672259"]);
    assert.equal(runtime.source.getChapterList({ url: "/g/672258/" }).length, 1);
    assert.equal(
        requestsFor(runtime.calls, "/api/v2/galleries/672258").length,
        2,
        "the oldest detail is fetched again after bounded-cache eviction"
    );
}

{
    const runtime = boot(fixtureRouter());
    const input = { url: "https://nhentai.net/g/672258", title: "Input title" };
    assert.equal(runtime.source.getMangaDetails(input).url, "/g/672258/");
}

{
    const runtime = boot(function() {
        throw new Error("offline timeout");
    });
    assertEmptyMangasPage(runtime.source.getLatestUpdates(0));
}

{
    const runtime = boot(function() {
        throw new Error("invalid gallery URLs must not request the API");
    });
    const input = { url: "/not-a-gallery/", title: "Original title" };
    assert.deepEqual(plain(runtime.source.getMangaDetails(input)), input);
    assert.deepEqual(plain(runtime.source.getChapterList(input)), []);
    assert.deepEqual(plain(runtime.source.getPageList({ url: input.url })), []);
    assert.equal(runtime.calls.length, 0);
}

{
    const runtime = boot(fixtureRouter());
    runtime.source._rateLimits.latest = { permits: 2, period: 60000 };

    assert.equal(runtime.source.getLatestUpdates(0).mangas.length, 1);
    assert.equal(runtime.source.getLatestUpdates(1).mangas.length, 1);
    assertEmptyMangasPage(runtime.source.getLatestUpdates(2));
    assert.equal(
        requestsFor(runtime.calls, "/api/v2/galleries").length,
        2,
        "endpoint quotas suppress requests beyond the official minute bucket"
    );
}

{
    const runtime = boot(fixtureRouter());
    Object.keys(runtime.source._rateLimits).forEach(function(key) {
        runtime.source._requestWindows = {};
        runtime.source._rateLimits[key] = { permits: 1, period: 60000 };
        assert.equal(runtime.source._reserveRequest(key), true, key + " accepts its first request");
        assert.equal(runtime.source._reserveRequest(key), false, key + " enforces its minute quota");
    });
}

{
    const runtime = boot(fixtureRouter(), 100000);
    runtime.source._rateLimits.latest = { permits: 1, period: 60000 };
    assert.equal(runtime.source._reserveRequest("latest"), true);
    assert.equal(runtime.source._reserveRequest("latest"), false);
    runtime.setNow(160001);
    assert.equal(
        runtime.source._reserveRequest("latest"),
        true,
        "expired request timestamps leave the sliding window"
    );
}

{
    let latestCalls = 0;
    const runtime = boot(function(url) {
        const pathname = new URL(url).pathname;
        if (pathname === "/api/v2/galleries") {
            latestCalls += 1;
            return latestCalls === 1 ? json({ error: "Too many requests (429)" }) : json(paginatedFixture);
        }
        if (pathname === "/api/v2/search") return json(paginatedFixture);
        if (pathname === "/api/v2/cdn") return json(cdnFixture);
        throw new Error("Unexpected offline request: " + url);
    });

    assertEmptyMangasPage(runtime.source.getLatestUpdates(0));
    assertEmptyMangasPage(runtime.source.getLatestUpdates(1));
    assertEmptyMangasPage(runtime.source.getSearchManga(0, "query", []));
    assert.equal(latestCalls, 1, "a 429 response starts a cooldown before another network call");
    assert.equal(
        requestsFor(runtime.calls, "/api/v2/search").length,
        0,
        "a host rate-limit response cools down every NHentai API endpoint"
    );
}

{
    const runtime = boot(fixtureRouter());
    assert.equal(runtime.source._formatUploadDate(Number.MAX_VALUE), null);
    assert.equal(runtime.source._formatUploadDate(0), null);
}

[
    null,
    { error: "timeout" },
    "not json",
    json({ error: "rate limited" }),
    json({
        detail: [{ loc: ["query", "page"], msg: "invalid", type: "value_error" }]
    })
].forEach(function(payload) {
    const runtime = boot(function() { return payload; });
    const input = { url: "/g/672258/", title: "Original title" };

    assertEmptyMangasPage(runtime.source.getLatestUpdates(0));
    assertEmptyMangasPage(runtime.source.getPopularManga(0));
    assertEmptyMangasPage(runtime.source.getSearchManga(0, "query", []));
    assert.deepEqual(plain(runtime.source.getMangaDetails(input)), input);
    assert.deepEqual(plain(runtime.source.getChapterList(input)), []);
    assert.deepEqual(plain(runtime.source.getPageList({ url: input.url })), []);
});

[
    null,
    { error: "timeout" },
    "not json",
    json({ image_servers: [], thumb_servers: [] })
].forEach(function(cdnPayload) {
    const listRuntime = boot(fixtureRouter({ cdn: cdnPayload, latest: json(fullPageFixture) }));
    const list = listRuntime.source.getLatestUpdates(0);
    assert.equal(list.mangas.length, 25);
    assert.ok(!list.mangas[0].thumbnailUrl, "a failed CDN lookup does not hardcode a host");
    assert.equal(
        requestsFor(listRuntime.calls, "/api/v2/cdn").length,
        1,
        "a list attempts CDN discovery only once when configuration is unavailable"
    );
    listRuntime.source.getLatestUpdates(1);
    assert.equal(
        requestsFor(listRuntime.calls, "/api/v2/cdn").length,
        1,
        "failed CDN discovery is negative-cached before retrying"
    );

    const detailRuntime = boot(fixtureRouter({ cdn: cdnPayload }));
    const manga = detailRuntime.source.getMangaDetails({
        url: "/g/672258/",
        title: "Original title"
    });
    assert.equal(manga.initialized, true);
    assert.ok(!manga.thumbnailUrl, "detail metadata survives a failed CDN lookup");

    const pageRuntime = boot(fixtureRouter({ cdn: cdnPayload }));
    assert.deepEqual(
        plain(pageRuntime.source.getPageList({ url: "/g/672258/" })),
        [],
        "reader pages are withheld when no valid image server is available"
    );
});

console.log("NHentai API v2 smoke tests passed");
