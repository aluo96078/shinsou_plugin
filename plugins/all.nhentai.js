/*
 * Shinsou extension content v2 executable artifact.
 *
 * This is an independently hashed migration artifact. The legacy source remains in
 * plugins/all.nhentai.js; this file carries the v2 declaration consumed by the host admission layer.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"all.nhentai","contentType":"manga","contentKinds":["IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};
// NHentai source plugin for Shinsou
// Uses the public NHentai API v2: https://nhentai.net/api/v2/docs

var source = {
    baseUrl: "https://nhentai.net",
    apiUrl: "https://nhentai.net/api/v2",
    supportsLatest: true,
    headers: {
        "Accept": "application/json",
        "Referer": "https://nhentai.net/",
        "User-Agent": "Shinsou/2.0 (https://github.com/aluo96078/shinsou)"
    },

    // API responses contain relative media paths. The server lists must come
    // from /cdn; the API explicitly warns clients not to guess CDN routes.
    _cdnConfig: null,
    _cdnConfigTime: 0,
    _cdnConfigTtl: 21600000,
    _cdnConfigFailureTime: 0,
    _cdnConfigFailureTtl: 60000,
    _detailCache: {},
    _detailCacheOrder: [],
    _detailCacheLimit: 20,
    _requestWindows: {},
    _rateLimitCooldowns: {},
    _globalRateLimitCooldown: 0,
    _rateLimitCooldownTtl: 60000,
    _rateLimits: {
        latest: { permits: 15, period: 60000 },
        search: { permits: 10, period: 60000 },
        detail: { permits: 20, period: 60000 },
        cdn: { permits: 8, period: 60000 }
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        // /galleries/popular is an unpaginated five-item highlight list. Use
        // the equivalent searchable ranking so the browse tab gets 25 items
        // per page and can continue loading.
        var apiPage = page + 1;
        var url = this.apiUrl + "/search?query="
            + encodeURIComponent("pages:>0")
            + "&sort=popular-today"
            + "&page=" + apiPage;
        var response = this._apiGet(url, "search");
        return this._paginatedMangasPage(response, apiPage);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var apiPage = page + 1;
        var url = this.apiUrl + "/galleries?page=" + apiPage + "&per_page=25";
        var response = this._apiGet(url, "latest");
        return this._paginatedMangasPage(response, apiPage);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var searchTerms = [];
        var rawQuery = this._trim(query);
        var sort = "date";

        if (rawQuery) searchTerms.push(rawQuery);

        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (!filter || !filter.type) continue;

                if (filter.type === "select" && filter.name === "Sort By") {
                    var sorts = [
                        "date",
                        "popular-today",
                        "popular-week",
                        "popular-month",
                        "popular"
                    ];
                    sort = sorts[filter.state] || "date";
                    continue;
                }

                if (filter.type === "select" && filter.name === "Language") {
                    var languages = ["", "english", "japanese", "chinese"];
                    var language = languages[filter.state] || "";
                    if (language) searchTerms.push("language:" + language);
                    continue;
                }

                if (filter.type === "text" && filter.name === "Tags") {
                    this._appendTags(searchTerms, filter.state, false);
                    continue;
                }

                if (filter.type === "text" && filter.name === "Excluded Tags") {
                    this._appendTags(searchTerms, filter.state, true);
                    continue;
                }

                if (filter.type === "text" && filter.name === "Minimum Pages") {
                    var minimum = this._positiveInteger(filter.state);
                    if (minimum) searchTerms.push("pages:>=" + minimum);
                    continue;
                }

                if (filter.type === "text" && filter.name === "Maximum Pages") {
                    var maximum = this._positiveInteger(filter.state);
                    if (maximum) searchTerms.push("pages:<=" + maximum);
                }
            }
        }

        // Empty, date-sorted searches are the same as the newest feed. For a
        // sort-only search, use a neutral query because the API requires one.
        if (searchTerms.length === 0 && sort === "date") {
            return this.getLatestUpdates(page);
        }
        if (searchTerms.length === 0) searchTerms.push("pages:>0");

        var apiPage = page + 1;
        var url = this.apiUrl + "/search?query="
            + encodeURIComponent(searchTerms.join(" "))
            + "&sort=" + encodeURIComponent(sort)
            + "&page=" + apiPage;
        var response = this._apiGet(url, "search");
        return this._paginatedMangasPage(response, apiPage);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var galleryId = this._extractGalleryId(manga.url);
        if (!galleryId) return manga;

        var detail = this._getGalleryDetail(galleryId);
        if (!this._isGalleryDetail(detail)) return manga;

        var result = SManga.create();
        result.url = this._galleryUrl(galleryId);
        result.initialized = true;
        result.title = this._detailTitle(detail) || manga.title || ("Gallery #" + galleryId);
        result.status = SManga.COMPLETED;

        var coverPath = detail.cover && detail.cover.path
            ? detail.cover.path
            : (detail.thumbnail && detail.thumbnail.path ? detail.thumbnail.path : null);
        result.thumbnailUrl = coverPath ? this._cdnUrl(coverPath, true) : null;

        var genres = [];
        var artists = [];
        var groups = [];
        var parodies = [];
        var characters = [];
        var categories = [];
        var languages = [];
        var tags = detail.tags || [];

        for (var i = 0; i < tags.length; i++) {
            var tag = tags[i];
            if (!tag || !tag.name) continue;
            if (tag.type === "artist") artists.push(tag.name);
            else if (tag.type === "group") groups.push(tag.name);
            else if (tag.type === "parody") parodies.push(tag.name);
            else if (tag.type === "character") characters.push(tag.name);
            else if (tag.type === "category") categories.push("category:" + tag.name);
            else if (tag.type === "language") languages.push("language:" + tag.name);
            else if (tag.type === "tag") genres.push(tag.name);
        }

        result.genre = categories.concat(languages).concat(genres);
        result.artist = artists.length > 0 ? artists.join(", ") : null;
        result.author = groups.length > 0
            ? groups.join(", ")
            : (artists.length > 0 ? artists.join(", ") : null);

        var description = [];
        var japaneseTitle = detail.title && detail.title.japanese
            ? detail.title.japanese
            : null;
        if (japaneseTitle && japaneseTitle !== result.title) description.push(japaneseTitle);
        if (typeof detail.num_pages === "number") description.push("Pages: " + detail.num_pages);
        if (typeof detail.num_favorites === "number") description.push("Favorites: " + detail.num_favorites);
        var uploaded = this._formatUploadDate(detail.upload_date);
        if (uploaded) description.push("Uploaded: " + uploaded);
        if (parodies.length > 0) description.push("Parodies: " + parodies.join(", "));
        if (characters.length > 0) description.push("Characters: " + characters.join(", "));
        result.description = description.length > 0 ? description.join("\n") : null;

        return result;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var galleryId = this._extractGalleryId(manga.url);
        if (!galleryId) return [];

        var detail = this._getGalleryDetail(galleryId);
        if (!this._isGalleryDetail(detail)) return [];

        var chapter = SChapter.create();
        chapter.url = this._galleryUrl(galleryId);
        chapter.name = this._detailTitle(detail) || manga.title || ("Gallery #" + galleryId);
        chapter.chapterNumber = 1;
        chapter.dateUpload = typeof detail.upload_date === "number"
            ? detail.upload_date * 1000
            : 0;
        chapter.scanlator = detail.scanlator || null;
        return [chapter];
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var galleryId = this._extractGalleryId(chapter.url);
        if (!galleryId) return [];

        var detail = this._getGalleryDetail(galleryId);
        if (!this._isGalleryDetail(detail) || !Array.isArray(detail.pages)) return [];

        var config = this._getCdnConfig();
        if (!config || !config.image_servers || config.image_servers.length === 0) return [];

        var pages = [];
        for (var i = 0; i < detail.pages.length; i++) {
            var pageInfo = detail.pages[i];
            if (!pageInfo || !pageInfo.path) continue;
            var imageUrl = this._cdnUrlWithConfig(pageInfo.path, false, config);
            if (imageUrl) pages.push(new Page(pages.length, "", imageUrl));
        }
        return pages;
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Sort By", values: [
                "Recent",
                "Popular Today",
                "Popular This Week",
                "Popular This Month",
                "All Time Popular"
            ], state: 0 },

            { type: "separator" },
            { type: "header", name: "Language" },
            { type: "select", name: "Language", values: [
                "Any", "English", "Japanese", "Chinese"
            ], state: 0 },

            { type: "separator" },
            { type: "header", name: "Tags (comma separated)" },
            { type: "text", name: "Tags", state: "" },
            { type: "text", name: "Excluded Tags", state: "" },

            { type: "separator" },
            { type: "header", name: "Pages" },
            { type: "text", name: "Minimum Pages", state: "" },
            { type: "text", name: "Maximum Pages", state: "" }
        ];
    },

    // ======== API and Mapping Helpers ========

    _apiGet: function(url, rateLimitKey) {
        if (!this._reserveRequest(rateLimitKey)) return null;

        var raw;
        try {
            raw = bridge.httpGetWithHeaders
                ? bridge.httpGetWithHeaders(url, this.headers)
                : bridge.httpGet(url);
        } catch (error) {
            bridge.log("NHentai request failed: " + error);
            return null;
        }

        if (!raw || raw.error) {
            if (raw && raw.error) {
                this._applyRateLimitCooldown(rateLimitKey, raw.error);
                bridge.log("NHentai request failed: " + raw.error);
            }
            return null;
        }

        try {
            var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (!parsed || parsed.error) {
                if (parsed && parsed.error) {
                    this._applyRateLimitCooldown(rateLimitKey, parsed.error);
                    bridge.log("NHentai API error: " + parsed.error);
                }
                return null;
            }
            return parsed;
        } catch (error) {
            bridge.log("NHentai JSON parse failed: " + error);
            return null;
        }
    },

    _paginatedMangasPage: function(response, apiPage) {
        if (!response || !Array.isArray(response.result)) {
            return new MangasPage([], false);
        }
        var numPages = typeof response.num_pages === "number" ? response.num_pages : 0;
        return this._mangasPageFromItems(response.result, apiPage < numPages);
    },

    _mangasPageFromItems: function(items, hasNextPage) {
        if (!Array.isArray(items)) return new MangasPage([], false);

        var mangas = [];
        var cdnConfig = null;
        var cdnConfigLoaded = false;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item || item.blacklisted || !item.id) continue;

            var manga = SManga.create();
            manga.url = this._galleryUrl(item.id);
            manga.title = item.english_title || item.japanese_title || ("Gallery #" + item.id);
            if (item.thumbnail) {
                if (!cdnConfigLoaded) {
                    cdnConfig = this._getCdnConfig();
                    cdnConfigLoaded = true;
                }
                manga.thumbnailUrl = this._cdnUrlWithConfig(item.thumbnail, true, cdnConfig);
            }
            mangas.push(manga);
        }
        return new MangasPage(mangas, !!hasNextPage);
    },

    _getGalleryDetail: function(galleryId) {
        var cached = this._detailCache[galleryId];
        if (cached) return cached;

        var detail = this._apiGet(this.apiUrl + "/galleries/" + galleryId, "detail");
        if (!this._isGalleryDetail(detail)) return null;

        this._detailCache[galleryId] = detail;
        this._detailCacheOrder.push(galleryId);
        if (this._detailCacheOrder.length > this._detailCacheLimit) {
            var oldest = this._detailCacheOrder.shift();
            delete this._detailCache[oldest];
        }
        return detail;
    },

    _isGalleryDetail: function(detail) {
        return !!(detail && detail.id && detail.title && detail.cover);
    },

    _getCdnConfig: function() {
        var now = Date.now();
        if (this._cdnConfig && now - this._cdnConfigTime < this._cdnConfigTtl) {
            return this._cdnConfig;
        }
        if (this._cdnConfigFailureTime
            && now - this._cdnConfigFailureTime < this._cdnConfigFailureTtl) {
            return this._cdnConfig;
        }

        var config = this._apiGet(this.apiUrl + "/cdn", "cdn");
        if (!config
            || !Array.isArray(config.image_servers)
            || !Array.isArray(config.thumb_servers)
            || config.image_servers.length === 0
            || config.thumb_servers.length === 0) {
            this._cdnConfigFailureTime = Date.now();
            bridge.log("NHentai CDN configuration is unavailable");
            return this._cdnConfig;
        }

        this._cdnConfig = config;
        this._cdnConfigTime = now;
        this._cdnConfigFailureTime = 0;
        return config;
    },

    _reserveRequest: function(rateLimitKey) {
        var key = rateLimitKey || "default";
        var limit = this._rateLimits[key] || { permits: 8, period: 60000 };
        var now = Date.now();
        if (now < this._globalRateLimitCooldown) {
            bridge.log("NHentai requests paused after host rate limiting");
            return false;
        }
        var cooldownUntil = this._rateLimitCooldowns[key] || 0;
        if (now < cooldownUntil) {
            bridge.log("NHentai " + key + " request paused after rate limiting");
            return false;
        }

        var timestamps = this._requestWindows[key] || [];
        var windowStart = now - limit.period;
        while (timestamps.length > 0 && timestamps[0] <= windowStart) {
            timestamps.shift();
        }
        this._requestWindows[key] = timestamps;

        if (timestamps.length >= limit.permits) {
            bridge.log("NHentai " + key + " request quota reached; retry later");
            return false;
        }

        timestamps.push(now);
        return true;
    },

    _applyRateLimitCooldown: function(rateLimitKey, error) {
        var text = "";
        try {
            text = typeof error === "string" ? error : JSON.stringify(error);
        } catch (ignored) {
            text = String(error || "");
        }
        if (!/(?:429|rate[ -]?limit|too many requests)/i.test(text)) return;

        var key = rateLimitKey || "default";
        var cooldownUntil = Date.now() + this._rateLimitCooldownTtl;
        this._rateLimitCooldowns[key] = cooldownUntil;
        this._globalRateLimitCooldown = cooldownUntil;
    },

    _cdnUrl: function(path, thumbnail) {
        var config = this._getCdnConfig();
        return this._cdnUrlWithConfig(path, thumbnail, config);
    },

    _cdnUrlWithConfig: function(path, thumbnail, config) {
        if (!path || !config) return null;
        var servers = thumbnail ? config.thumb_servers : config.image_servers;
        if (!servers || servers.length === 0) return null;

        var hash = 0;
        for (var i = 0; i < path.length; i++) hash += path.charCodeAt(i);
        var server = servers[hash % servers.length];
        if (!server) return null;
        return server.charAt(server.length - 1) === "/"
            ? server + path
            : server + "/" + path;
    },

    _detailTitle: function(detail) {
        if (!detail || !detail.title) return null;
        return detail.title.english
            || detail.title.pretty
            || detail.title.japanese
            || null;
    },

    _galleryUrl: function(galleryId) {
        return "/g/" + galleryId + "/";
    },

    _extractGalleryId: function(url) {
        var value = String(url || "");
        var match = value.match(/\/g\/(\d+)/);
        if (match) return match[1];
        return /^\d+$/.test(value) ? value : null;
    },

    _appendTags: function(terms, input, excluded) {
        var value = this._trim(input);
        if (!value) return;

        var tags = value.split(",");
        for (var i = 0; i < tags.length; i++) {
            var tag = this._trim(tags[i]);
            if (!tag) continue;
            terms.push((excluded ? "-" : "") + "tag:" + this._quoteSearchValue(tag));
        }
    },

    _quoteSearchValue: function(value) {
        var escaped = String(value)
            .replace(/\\/g, "\\\\")
            .replace(/\"/g, "\\\"");
        return "\"" + escaped + "\"";
    },

    _positiveInteger: function(value) {
        var text = this._trim(value);
        return /^\d+$/.test(text) && parseInt(text, 10) > 0
            ? String(parseInt(text, 10))
            : null;
    },

    _formatUploadDate: function(timestamp) {
        if (typeof timestamp !== "number" || timestamp <= 0) return null;
        try {
            return new Date(timestamp * 1000).toISOString();
        } catch (error) {
            return null;
        }
    },

    _trim: function(value) {
        return String(value || "").replace(/^\s+|\s+$/g, "");
    }
};

// Expose only bounded, host-audited v2 metadata; executable calls still cross the legacy adapter.
if (typeof source === "object" && source) {
    source.v2 = __shinsouExtensionV2;
}
