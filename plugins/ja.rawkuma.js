/*
 * Shinsou extension content v2 executable artifact.
 *
 * Rawkuma (https://rawkuma.net) — Japanese raw manga site.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"ja.rawkuma","contentType":"manga","contentKinds":["IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};
// Rawkuma Plugin for Shinsou (Japanese raw)
// Crawls https://rawkuma.net

var source = {
    baseUrl: "https://rawkuma.net",
    webChallengeUrl: "https://rawkuma.net/",
    supportsLatest: true,
    headers: {
        "Referer": "https://rawkuma.net/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    },

    filterOptions: {
        orders: [
            { label: "Popular", code: "popular" },
            { label: "Latest update", code: "updated" },
            { label: "Rating", code: "rating" },
            { label: "Most bookmarked", code: "bookmarked" },
            { label: "Title", code: "title" }
        ],
        types: [
            { label: "All", code: "" },
            { label: "Manga", code: "manga" },
            { label: "Manhwa", code: "manhwa" },
            { label: "Manhua", code: "manhua" }
        ],
        statuses: [
            { label: "All", code: "" },
            { label: "Ongoing", code: "ongoing" },
            { label: "Completed", code: "completed" },
            { label: "On hiatus", code: "on-hiatus" },
            { label: "Cancelled", code: "cancelled" }
        ],
        genres: [
            { label: "Action", code: "action" },
            { label: "Adaptions", code: "adaptions" },
            { label: "Adult", code: "adult" },
            { label: "Adventure", code: "adventure" },
            { label: "Animals", code: "animals" },
            { label: "Comedy", code: "comedy" },
            { label: "Crime", code: "crime" },
            { label: "Drama", code: "drama" },
            { label: "Ecchi", code: "ecchi" },
            { label: "Fantasy", code: "fantasy" },
            { label: "Game", code: "game" },
            { label: "Gender Bender", code: "gender-bender" },
            { label: "Girls' Love", code: "girls-love" },
            { label: "Harem", code: "harem" },
            { label: "Hentai", code: "hentai" },
            { label: "Historical", code: "historical" },
            { label: "Horror", code: "horror" },
            { label: "Isekai", code: "isekai" },
            { label: "Josei", code: "josei" },
            { label: "Lolicon", code: "lolicon" },
            { label: "Magic", code: "magic" },
            { label: "Martial Arts", code: "martial-arts" },
            { label: "Mature", code: "mature" },
            { label: "Mecha", code: "mecha" },
            { label: "Mystery", code: "mystery" },
            { label: "Oneshot", code: "oneshot" },
            { label: "Philosophical", code: "philosophical" },
            { label: "Police", code: "police" },
            { label: "Psychological", code: "psychological" },
            { label: "Romance", code: "romance" },
            { label: "School Life", code: "school-life" },
            { label: "Sci-fi", code: "sci-fi" },
            { label: "Seinen", code: "seinen" },
            { label: "Shotacon", code: "shotacon" },
            { label: "Shoujo", code: "shoujo" },
            { label: "Shoujo Ai", code: "shoujo-ai" },
            { label: "Shounen", code: "shounen" },
            { label: "Shounen Ai", code: "shounen-ai" },
            { label: "Slice of Life", code: "slice-of-life" },
            { label: "Smut", code: "smut" },
            { label: "Sports", code: "sports" },
            { label: "Supernatural", code: "supernatural" },
            { label: "Thriller", code: "thriller" },
            { label: "Tragedy", code: "tragedy" },
            { label: "Yaoi", code: "yaoi" },
            { label: "Yuri", code: "yuri" }
        ]
    },

    // ======== Popular / Latest ========

    getPopularManga: function(page) {
        return this._search(page, { orderby: "popular" });
    },

    getLatestUpdates: function(page) {
        return this._search(page, { orderby: "updated" });
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var options = { query: String(query || "").trim(), orderby: "popular", genre: [], genreExclude: [] };
        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (!filter) continue;
                if (filter.type === "select" && filter.name === "Order by") {
                    options.orderby = this._filterCode(this.filterOptions.orders, filter.state) || "popular";
                } else if (filter.type === "select" && filter.name === "Type") {
                    options.type = this._filterCode(this.filterOptions.types, filter.state);
                } else if (filter.type === "select" && filter.name === "Status") {
                    options.status = this._filterCode(this.filterOptions.statuses, filter.state);
                } else if (filter.type === "checkBox" && filter.name === "Ascending") {
                    options.ascending = filter.state === true;
                } else if (filter.type === "select" && filter.name === "Genre match") {
                    options.inclusion = parseInt(filter.state || 0, 10) === 1 ? "AND" : "OR";
                } else if (filter.type === "group" && filter.name === "Genres" && filter.filters) {
                    for (var j = 0; j < filter.filters.length; j++) {
                        var genre = filter.filters[j];
                        var option = this.filterOptions.genres[j];
                        if (!genre || !option) continue;
                        if (genre.state === 1) options.genre.push(option.code);
                        else if (genre.state === 2) options.genreExclude.push(option.code);
                    }
                }
            }
        }
        return this._search(page, options);
    },

    // The catalogue, search and filters all go through the theme's "advanced_search" endpoint,
    // which answers an HTML fragment of result cards.
    _search: function(page, options) {
        var pageNumber = page + 1;
        var fields = [
            "page=" + pageNumber,
            "orderby=" + encodeURIComponent(options.orderby || "popular"),
            "order=" + (options.ascending ? "asc" : "desc"),
            "query=" + encodeURIComponent(options.query || ""),
            "genre=" + encodeURIComponent(JSON.stringify(options.genre || [])),
            "genre_exclude=" + encodeURIComponent(JSON.stringify(options.genreExclude || [])),
            "type=" + encodeURIComponent(JSON.stringify(options.type ? [options.type] : [])),
            "status=" + encodeURIComponent(JSON.stringify(options.status ? [options.status] : [])),
            "author=" + encodeURIComponent("[]"),
            "artist=" + encodeURIComponent("[]"),
            "project=0",
            "inclusion=" + (options.inclusion || "OR"),
            "exclusion=OR"
        ];
        var html = this._request(
            this.baseUrl + "/wp-admin/admin-ajax.php?action=advanced_search",
            fields.join("&"),
            { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }
        );
        if (!html || !html.trim()) return new MangasPage([], false);

        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return new MangasPage([], false);

        var mangas = [];
        var seen = {};
        doc.select("a[href*='/manga/']").forEach(function(link) {
            try {
                var url = this._relativeUrl(link.absUrl("href") || link.attr("href"));
                if (!/^\/manga\/[^\/]+\/?$/.test(url) || seen[url]) return;
                var image = link.selectFirst("img");
                var title = image ? String(image.attr("alt") || "").trim() : "";
                if (!title) return;
                seen[url] = true;
                var manga = SManga.create();
                manga.url = url;
                manga.title = title;
                manga.thumbnailUrl = this._absoluteUrl(image.attr("data-src") || image.attr("src"));
                mangas.push(manga);
            } catch (e) {
                bridge.log("Rawkuma list item error: " + e);
            }
        }.bind(this));
        bridge.domReleaseAll();

        // The pager is rendered as "addSingularFilter']('page', 'N')" buttons.
        var hasNext = html.indexOf("'page', '" + (pageNumber + 1) + "'") !== -1 ||
            html.indexOf("\"page\", \"" + (pageNumber + 1) + "\"") !== -1;
        return new MangasPage(mangas, hasNext);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var html = this._request(this._absoluteUrl(manga.url));
        var info = this._seriesJson(html);
        var doc = Jsoup.parse(html, this.baseUrl);

        var result = SManga.create();
        result.url = manga.url;
        result.initialized = true;

        var heading = doc ? doc.selectFirst("h1[itemprop=name], h1") : null;
        result.title = (info && info.name) || (heading ? heading.text().trim() : "") || manga.title || "";

        var image = info && info.image ? (typeof info.image === "string" ? info.image : info.image.url) : "";
        if (!image && doc) {
            var og = doc.selectFirst("meta[property=og:image]");
            image = og ? og.attr("content") : "";
        }
        result.thumbnailUrl = image ? this._absoluteUrl(image) : manga.thumbnailUrl || null;

        var author = info && info.author ? this._names(info.author) : "";
        result.author = author || null;
        result.artist = result.author;

        var genres = info && info.genre ? (info.genre instanceof Array ? info.genre : [info.genre]) : [];
        result.genre = genres.length > 0 ? genres : null;

        result.status = this._parseStatus(info ? info.creativeWorkStatus : "");

        var parts = [];
        if (info && info.description) parts.push(this._decodeEntities(String(info.description)).trim());
        if (info && info.alternateName) {
            var alt = info.alternateName instanceof Array ? info.alternateName.join(", ") : String(info.alternateName);
            if (alt.trim()) parts.push("Alternative names: " + this._decodeEntities(alt).trim());
        }
        result.description = parts.length > 0 ? parts.join("\n\n") : null;

        if (doc) bridge.domReleaseAll();
        return result;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var detailHtml = this._request(this._absoluteUrl(manga.url));
        var entries = [];
        var seen = {};

        // The full list comes from the chapter_list endpoint; the page itself renders only the
        // newest chapters, which the endpoint can lag behind, so both are merged.
        var idMatch = /manga_id=(\d+)/.exec(detailHtml);
        if (idMatch) {
            var listHtml = this._request(this.baseUrl + "/wp-admin/admin-ajax.php?manga_id=" +
                idMatch[1] + "&page=1&action=chapter_list");
            this._collectChapters(listHtml, entries, seen);
        }
        this._collectChapters(detailHtml, entries, seen);

        // Story order: oldest first.
        entries.sort(function(a, b) {
            if (a.number !== b.number) return a.number - b.number;
            return a.date - b.date;
        });
        var chapters = [];
        for (var i = 0; i < entries.length; i++) {
            var chapter = SChapter.create();
            chapter.url = entries[i].url;
            chapter.name = entries[i].name;
            chapter.dateUpload = entries[i].date;
            chapter.chapterNumber = entries[i].number;
            chapters.push(chapter);
        }
        return chapters;
    },

    _collectChapters: function(html, entries, seen) {
        if (!html || !html.trim()) return;
        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return;
        doc.select("div[data-chapter-number]").forEach(function(item) {
            var link = item.selectFirst("a[href]");
            if (!link) return;
            var url = this._relativeUrl(link.absUrl("href") || link.attr("href"));
            if (!url || seen[url]) return;
            seen[url] = true;
            var nameElement = item.selectFirst("div.font-medium span, span");
            var name = nameElement ? nameElement.text().trim() : "";
            var number = parseFloat(item.attr("data-chapter-number"));
            if (isNaN(number)) number = this._chapterNumber(name, entries.length);
            var time = item.selectFirst("time[datetime]");
            var date = time ? new Date(time.attr("datetime")).getTime() : 0;
            entries.push({
                url: url,
                name: name || ("Chapter " + number),
                number: number,
                date: isNaN(date) ? 0 : date
            });
        }.bind(this));
        bridge.domReleaseAll();
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var html = this._request(this._absoluteUrl(chapter.url));
        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return [];
        var pages = [];
        var seen = {};
        doc.select("section[data-image-data] img").forEach(function(image) {
            var imageUrl = this._absoluteUrl(image.attr("data-src") || image.attr("src"));
            if (!imageUrl || imageUrl.indexOf("data:") === 0 || seen[imageUrl]) return;
            seen[imageUrl] = true;
            pages.push(new Page(pages.length, "", imageUrl));
        }.bind(this));
        bridge.domReleaseAll();
        return pages;
    },

    // ======== Filters ========

    getFilterList: function() {
        var genres = [];
        for (var i = 0; i < this.filterOptions.genres.length; i++) {
            genres.push({ type: "triState", name: this.filterOptions.genres[i].label, state: 0 });
        }
        return [
            { type: "select", name: "Order by", values: this._filterLabels(this.filterOptions.orders), state: 0 },
            { type: "checkBox", name: "Ascending", state: false },
            { type: "select", name: "Type", values: this._filterLabels(this.filterOptions.types), state: 0 },
            { type: "select", name: "Status", values: this._filterLabels(this.filterOptions.statuses), state: 0 },
            { type: "select", name: "Genre match", values: ["Any included genre", "All included genres"], state: 0 },
            { type: "group", name: "Genres", filters: genres }
        ];
    },

    // ======== Helpers ========

    _seriesJson: function(html) {
        var pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        var match;
        while ((match = pattern.exec(String(html || ""))) !== null) {
            try {
                var data = JSON.parse(match[1]);
                var type = data && data["@type"];
                var types = type instanceof Array ? type : [type];
                if (types.indexOf("ComicSeries") !== -1 || types.indexOf("Book") !== -1) return data;
            } catch (ignored) {}
        }
        return null;
    },

    _names: function(value) {
        var list = value instanceof Array ? value : [value];
        var names = [];
        for (var i = 0; i < list.length; i++) {
            var name = list[i] && typeof list[i] === "object" ? list[i].name : list[i];
            name = String(name || "").trim();
            if (name && names.indexOf(name) === -1) names.push(name);
        }
        return names.join(", ");
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
        var value = String(url).replace(/&amp;/g, "&").trim();
        if (value.indexOf(this.baseUrl) === 0) value = value.substring(this.baseUrl.length);
        return value || "/";
    },

    _parseStatus: function(text) {
        var value = String(text || "").toLowerCase();
        if (value.indexOf("completed") !== -1) return SManga.COMPLETED;
        if (value.indexOf("ongoing") !== -1) return SManga.ONGOING;
        if (value.indexOf("hiatus") !== -1) return SManga.ON_HIATUS;
        if (value.indexOf("cancel") !== -1) return SManga.CANCELLED;
        return SManga.UNKNOWN;
    },

    _chapterNumber: function(name, fallbackIndex) {
        var match = String(name || "").match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : fallbackIndex + 1;
    },

    _decodeEntities: function(value) {
        return String(value || "")
            .replace(/&quot;/g, "\"")
            .replace(/&#0?39;|&apos;/g, "'")
            .replace(/&#8217;/g, "’")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
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
// ja.rawkuma 1.0.0: network origins are declared in the repository index.
