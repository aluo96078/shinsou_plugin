/*
 * Shinsou extension content v2 executable artifact.
 *
 * Sen Manga Raw (https://raw.senmanga.com) — Japanese raw manga site.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"ja.senmanga","contentType":"manga","contentKinds":["IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};
// Sen Manga Raw Plugin for Shinsou (Japanese raw)
// Reads the JSON API behind https://raw.senmanga.com

var source = {
    baseUrl: "https://raw.senmanga.com",
    apiUrl: "https://raw.senmanga.com/api",
    webChallengeUrl: "https://raw.senmanga.com/",
    supportsLatest: true,
    headers: {
        "Referer": "https://raw.senmanga.com/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    },

    filterOptions: {
        statuses: [
            { label: "All", code: "" },
            { label: "Ongoing", code: "Ongoing" },
            { label: "Completed", code: "Completed" },
            { label: "Hiatus", code: "Hiatus" },
            { label: "Dropped", code: "Dropped" }
        ],
        types: [
            { label: "All", code: "" },
            { label: "Manga", code: "Manga" },
            { label: "Manhwa", code: "Manhwa" },
            { label: "Manhua", code: "Manhua" }
        ]
    },

    // ======== Popular / Latest ========

    getPopularManga: function(page) {
        return this._directory(page, "", "");
    },

    // The home feed has a single page of recently updated works.
    getLatestUpdates: function(page) {
        if (page > 0) return new MangasPage([], false);
        var data = this._getJson("/home?page=1");
        return new MangasPage(this._toMangas(data && data.series), false);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var status = "";
        var type = "";
        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (!filter || filter.type !== "select") continue;
                if (filter.name === "Status") status = this._filterCode(this.filterOptions.statuses, filter.state);
                else if (filter.name === "Type") type = this._filterCode(this.filterOptions.types, filter.state);
            }
        }

        var cleanQuery = String(query || "").trim();
        if (!cleanQuery) return this._directory(page, status, type);

        // The site's /search endpoint currently ignores its keyword and answers the directory, so
        // a title is looked up directly by its slug first and the page results are then matched
        // against the keyword locally.
        var mangas = [];
        var seen = {};
        if (page === 0) {
            var slug = this._slugFromQuery(cleanQuery);
            if (slug) {
                var exact = null;
                try { exact = this._getJson("/manga/" + encodeURIComponent(slug), 1); } catch (ignored) {}
                if (exact && exact.title) {
                    var exactManga = this._toManga(exact);
                    if (exactManga) {
                        seen[exactManga.url] = true;
                        mangas.push(exactManga);
                    }
                }
            }
        }

        var data = this._getJson("/search?q=" + encodeURIComponent(cleanQuery) + "&page=" + (page + 1));
        var words = cleanQuery.toLowerCase().split(/\s+/);
        var candidates = this._toMangas(data && data.series);
        for (var j = 0; j < candidates.length; j++) {
            var candidate = candidates[j];
            if (seen[candidate.url]) continue;
            var haystack = (candidate.title + " " + candidate.url.replace(/-/g, " ")).toLowerCase();
            var matches = true;
            for (var k = 0; k < words.length; k++) {
                if (words[k] && haystack.indexOf(words[k]) === -1) { matches = false; break; }
            }
            if (!matches) continue;
            seen[candidate.url] = true;
            mangas.push(candidate);
        }
        return new MangasPage(mangas, this._hasNext(data));
    },

    _directory: function(page, status, type) {
        var params = ["page=" + (page + 1)];
        if (status) params.push("status=" + encodeURIComponent(status));
        if (type) params.push("type=" + encodeURIComponent(type));
        var data = this._getJson("/directory?" + params.join("&"));
        return new MangasPage(this._toMangas(data && data.series), this._hasNext(data));
    },

    _hasNext: function(data) {
        if (!data) return false;
        var current = parseInt(data.currentPage, 10);
        var total = parseInt(data.totalPages, 10);
        return !isNaN(current) && !isNaN(total) && current < total;
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var data = this._getJson("/manga/" + encodeURIComponent(this._mangaSlug(manga.url)));
        var result = this._toManga(data) || SManga.create();
        result.url = manga.url;
        result.initialized = true;
        if (!result.title) result.title = manga.title || "";
        if (!result.thumbnailUrl) result.thumbnailUrl = manga.thumbnailUrl || null;

        var genres = this._splitList(data && data.genre);
        if (data && data.type && genres.indexOf(String(data.type)) === -1) genres.push(String(data.type));
        result.genre = genres.length > 0 ? genres : null;
        result.status = this._parseStatus(data && data.status);

        var parts = [];
        if (data && data.description) parts.push(String(data.description).trim());
        if (data && data.alt_name && String(data.alt_name).trim()) {
            parts.push("Alternative names: " + this._splitList(data.alt_name).join(", "));
        }
        result.description = parts.length > 0 ? parts.join("\n\n") : null;
        return result;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var data = this._getJson("/manga/" + encodeURIComponent(this._mangaSlug(manga.url)));
        var slug = this._canonicalSlug(data) || this._mangaSlug(manga.url);
        var list = data && data.chapterList instanceof Array ? data.chapterList : [];
        var entries = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item || !item.url) continue;
            var url = "/" + slug + "/" + String(item.url);
            if (seen[url]) continue;
            seen[url] = true;
            var number = parseFloat(item.number != null ? item.number : item.slug);
            var date = item.datetime ? new Date(item.datetime).getTime() : 0;
            entries.push({
                url: url,
                name: String(item.title || "").trim() || ("Chapter " + item.slug),
                number: isNaN(number) ? -1 : number,
                date: isNaN(date) ? 0 : date
            });
        }

        // The API lists the newest chapter first; Shinsou reads in story order.
        entries.reverse();
        var chapters = [];
        for (var j = 0; j < entries.length; j++) {
            var chapter = SChapter.create();
            chapter.url = entries[j].url;
            chapter.name = entries[j].name;
            chapter.dateUpload = entries[j].date;
            chapter.chapterNumber = entries[j].number;
            chapters.push(chapter);
        }
        return chapters;
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var path = this._relativeUrl(chapter.url).replace(/^\/+|\/+$/g, "");
        var parts = path.split("/");
        if (parts.length < 2) return [];
        var data = this._getJson("/read/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts[1]));
        var images = data && data.pages instanceof Array ? data.pages : [];
        var pages = [];
        var seen = {};
        for (var i = 0; i < images.length; i++) {
            var imageUrl = this._absoluteUrl(images[i]);
            if (!imageUrl || seen[imageUrl]) continue;
            seen[imageUrl] = true;
            pages.push(new Page(pages.length, "", imageUrl));
        }
        return pages;
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "header", name: "The site's keyword search is limited; exact titles match best" },
            { type: "select", name: "Status", values: this._filterLabels(this.filterOptions.statuses), state: 0 },
            { type: "select", name: "Type", values: this._filterLabels(this.filterOptions.types), state: 0 }
        ];
    },

    // ======== Helpers ========

    // The API answers an occasional transient 500, so a failed call is asked for once more.
    _getJson: function(path, attempts) {
        var remaining = attempts || 2;
        var text;
        while (true) {
            try {
                text = this._request(this.apiUrl + path);
                break;
            } catch (e) {
                remaining--;
                if (e !== "SHINSOU_SOURCE_HTTP_UNAVAILABLE" || remaining <= 0) throw e;
            }
        }
        if (!text || !text.trim()) return null;
        try {
            return JSON.parse(text);
        } catch (e) {
            throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        }
    },

    _toMangas: function(list) {
        var mangas = [];
        var seen = {};
        if (!(list instanceof Array)) return mangas;
        for (var i = 0; i < list.length; i++) {
            var manga = this._toManga(list[i]);
            if (!manga || seen[manga.url]) continue;
            seen[manga.url] = true;
            mangas.push(manga);
        }
        return mangas;
    },

    _toManga: function(item) {
        if (!item) return null;
        var slug = this._canonicalSlug(item) || String(item.slug || item.url || "").replace(/^\/+|\/+$/g, "");
        var title = String(item.title || "").trim();
        if (!slug || !title) return null;
        var manga = SManga.create();
        manga.url = "/" + slug;
        manga.title = title;
        manga.thumbnailUrl = item.cover ? this._fullCover(this._absoluteUrl(item.cover)) : null;
        return manga;
    },

    // The API echoes the requested slug even when it resolved a near match, so the work's own
    // slug is read back from its chapter links.
    _canonicalSlug: function(item) {
        var list = item && item.chapterList instanceof Array ? item.chapterList : [];
        for (var i = 0; i < list.length; i++) {
            var match = list[i] && /\/manga\/([^\/]+)\//.exec(String(list[i].full_url || ""));
            if (match) return match[1];
        }
        return "";
    },

    // Feed thumbnails carry a WordPress size suffix ("-96x137"); the original is the same path without it.
    _fullCover: function(url) {
        return String(url || "").replace(/-\d{2,4}x\d{2,4}(\.[A-Za-z0-9]+)$/, "$1");
    },

    _mangaSlug: function(url) {
        return this._relativeUrl(url).replace(/^\/+|\/+$/g, "").split("/")[0];
    },

    _slugFromQuery: function(query) {
        var value = String(query || "").trim();
        var urlMatch = /^https?:\/\/(?:raw\.senmanga\.com|rawkuma\.net\/manga)\/([^\/?#]+)/i.exec(value);
        if (urlMatch) return urlMatch[1].toLowerCase();
        return value.toLowerCase()
            .replace(/['’]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    },

    _splitList: function(value) {
        var parts = String(value || "").split(",");
        var result = [];
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (part && result.indexOf(part) === -1) result.push(part);
        }
        return result;
    },

    _filterCode: function(options, state) {
        var index = parseInt(state || 0, 10);
        if (index < 0 || index >= options.length) return "";
        return options[index].code || "";
    },

    _filterLabels: function(options) {
        var labels = [];
        for (var i = 0; i < options.length; i++) labels.push(options[i].label);
        return labels;
    },

    _absoluteUrl: function(url) {
        if (!url) return "";
        var value = String(url).replace(/&amp;/g, "&").trim();
        if (value.indexOf("//") === 0) return "https:" + value;
        if (value.indexOf("http://") === 0 || value.indexOf("https://") === 0) return value;
        if (value.charAt(0) !== "/") value = "/" + value;
        return this.baseUrl + value;
    },

    _relativeUrl: function(url) {
        if (!url) return "";
        var value = String(url).trim();
        if (value.indexOf(this.baseUrl) === 0) value = value.substring(this.baseUrl.length);
        return value || "/";
    },

    _parseStatus: function(text) {
        var value = String(text || "").toLowerCase();
        if (value.indexOf("completed") !== -1) return SManga.COMPLETED;
        if (value.indexOf("ongoing") !== -1) return SManga.ONGOING;
        if (value.indexOf("hiatus") !== -1) return SManga.ON_HIATUS;
        if (value.indexOf("dropped") !== -1 || value.indexOf("cancel") !== -1) return SManga.CANCELLED;
        return SManga.UNKNOWN;
    },

    _request: function(url, body, extraHeaders) {
        var headers = {};
        var key;
        for (key in this.headers) headers[key] = this.headers[key];
        if (extraHeaders) {
            for (key in extraHeaders) headers[key] = extraHeaders[key];
        }
        var isPost = body !== undefined && body !== null;
        var structured = isPost
            ? typeof bridge.httpPostResponse === "function"
            : typeof bridge.httpGetResponse === "function";
        var response;
        if (isPost) {
            response = structured
                ? bridge.httpPostResponse(url, body, headers)
                : bridge.httpPost(url, body, headers);
        } else {
            response = structured
                ? bridge.httpGetResponse(url, headers)
                : bridge.httpGetWithHeaders(url, headers);
        }
        var rawStatus = structured && response
            ? (response.status != null ? response.status : response.statusCode)
            : null;
        var status = structured ? Number(rawStatus) : 0;
        var html = response && typeof response === "object"
            ? (response.body != null ? response.body : response.text)
            : response;
        if (!response || response.error) throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        if (structured && (!isFinite(status) || status <= 0 || Math.floor(status) !== status)) {
            throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        }
        if (typeof html !== "string") throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";

        var lower = html.toLowerCase();
        if (lower.indexOf("sorry, you have been blocked") !== -1 ||
            (lower.indexOf("cloudflare") !== -1 && lower.indexOf("cf-error-details") !== -1)) {
            throw "SHINSOU_SOURCE_HTTP_BLOCKED";
        }
        var explicitChallenge = lower.indexOf("_cf_chl_opt") !== -1 ||
            lower.indexOf("cf-chl") !== -1 ||
            lower.indexOf("challenge-form") !== -1;
        var interstitialTitle = /<title\b[^>]*>[^<]*(?:just a moment|checking your browser|attention required|enable javascript and cookies)[^<]*<\/title>/i.test(html);
        var challengePlatform = lower.indexOf("challenge-platform") !== -1 || lower.indexOf("cf-mitigated") !== -1;
        if (explicitChallenge ||
            (challengePlatform && ((structured && (status === 403 || status === 503)) || interstitialTitle))) {
            throw "SHINSOU_SOURCE_HTTP_CHALLENGE";
        }
        if (status === 403) throw "SHINSOU_SOURCE_HTTP_FORBIDDEN";
        if (structured && (status < 200 || status >= 300)) throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        return html;
    }
};

// Expose only bounded, host-audited v2 metadata; executable calls still cross the legacy adapter.
if (typeof source === "object" && source) {
    source.v2 = __shinsouExtensionV2;
}
// ja.senmanga 1.0.0: network origins are declared in the repository index.
