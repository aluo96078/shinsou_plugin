/*
 * Shinsou extension content v2 executable artifact.
 *
 * MangaKatana (https://mangakatana.com) — English-language manga site.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"en.mangakatana","contentType":"manga","contentKinds":["IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};
// MangaKatana Plugin for Shinsou (English)
// Crawls https://mangakatana.com

var source = {
    baseUrl: "https://mangakatana.com",
    webChallengeUrl: "https://mangakatana.com/",
    supportsLatest: true,
    headers: {
        "Referer": "https://mangakatana.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
    },

    filterOptions: {
        searchBy: [
            { label: "Title", code: "book_name" },
            { label: "Author", code: "author" }
        ],
        orders: [
            { label: "Latest update", code: "latest" },
            { label: "New manga", code: "new" },
            { label: "A-Z", code: "az" },
            { label: "Number of chapters", code: "numc" }
        ],
        statuses: [
            { label: "All", code: "" },
            { label: "Ongoing", code: "1" },
            { label: "Completed", code: "2" },
            { label: "Cancelled", code: "0" }
        ],
        chapters: [
            { label: "Any", code: "" },
            { label: "Exactly 1", code: "e1" },
            { label: ">= 1", code: "1" },
            { label: ">= 5", code: "5" },
            { label: ">= 10", code: "10" },
            { label: ">= 20", code: "20" },
            { label: ">= 30", code: "30" },
            { label: ">= 50", code: "50" },
            { label: ">= 100", code: "100" },
            { label: ">= 150", code: "150" },
            { label: ">= 200", code: "200" }
        ],
        genres: [
            "4-koma", "action", "adult", "adventure", "artbook", "award-winning", "comedy", "cooking",
            "doujinshi", "drama", "ecchi", "erotica", "fantasy", "gender-bender", "gore", "harem",
            "historical", "horror", "isekai", "josei", "loli", "manhua", "manhwa", "martial-arts",
            "mecha", "medical", "music", "mystery", "one-shot", "overpowered-mc", "psychological",
            "reincarnation", "romance", "school-life", "sci-fi", "seinen", "sexual-violence", "shota",
            "shoujo", "shoujo-ai", "shounen", "shounen-ai", "slice-of-life", "sports", "super-power",
            "supernatural", "survival", "time-travel", "tragedy", "webtoon", "yaoi", "yuri"
        ]
    },

    // ======== Popular / Latest ========

    getPopularManga: function(page) {
        return this._fetchList(this.baseUrl + "/manga/page/" + (page + 1) +
            "?filter=1&include_mode=and&chapters=1&order=numc");
    },

    getLatestUpdates: function(page) {
        return this._fetchList(this.baseUrl + "/latest/page/" + (page + 1));
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var cleanQuery = String(query || "").trim();
        var searchBy = "book_name";
        var order = "latest";
        var status = "";
        var chapters = "";
        var includeMode = "and";
        var include = [];
        var exclude = [];

        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (!filter) continue;
                if (filter.type === "select" && filter.name === "Search by") {
                    searchBy = this._filterCode(this.filterOptions.searchBy, filter.state) || "book_name";
                } else if (filter.type === "select" && filter.name === "Order by") {
                    order = this._filterCode(this.filterOptions.orders, filter.state) || "latest";
                } else if (filter.type === "select" && filter.name === "Status") {
                    status = this._filterCode(this.filterOptions.statuses, filter.state);
                } else if (filter.type === "select" && filter.name === "Chapters") {
                    chapters = this._filterCode(this.filterOptions.chapters, filter.state);
                } else if (filter.type === "select" && filter.name === "Genre match") {
                    includeMode = parseInt(filter.state || 0, 10) === 1 ? "or" : "and";
                } else if (filter.type === "group" && filter.name === "Genres" && filter.filters) {
                    for (var j = 0; j < filter.filters.length; j++) {
                        var genre = filter.filters[j];
                        var slug = this.filterOptions.genres[j];
                        if (!genre || !slug) continue;
                        if (genre.state === 1) include.push(slug);
                        else if (genre.state === 2) exclude.push(slug);
                    }
                }
            }
        }

        var url;
        if (cleanQuery) {
            // The search endpoint answers an empty body for "/page/1"; page 1 is the bare root.
            // Later pages are also empty unless the referrer is the first result page (or absent).
            var search = "?search=" + encodeURIComponent(cleanQuery) + "&search_by=" + encodeURIComponent(searchBy);
            var firstPage = this.baseUrl + "/" + search;
            url = page > 0 ? this.baseUrl + "/page/" + (page + 1) + search : firstPage;
            return this._fetchList(url, { "Referer": firstPage });
        } else {
            var params = ["filter=1", "include_mode=" + includeMode, "order=" + encodeURIComponent(order)];
            if (include.length > 0) params.push("include=" + encodeURIComponent(include.join("_")));
            if (exclude.length > 0) params.push("exclude=" + encodeURIComponent(exclude.join("_")));
            if (chapters) params.push("chapters=" + encodeURIComponent(chapters));
            if (status) params.push("status=" + encodeURIComponent(status));
            url = this.baseUrl + "/manga/page/" + (page + 1) + "?" + params.join("&");
        }
        return this._fetchList(url);
    },

    _fetchList: function(url, extraHeaders) {
        return this._parseList(this._requestFilled(url, extraHeaders));
    },

    // The site intermittently answers 200 with an empty body (a search without results still
    // renders a full page), so an empty answer is asked for again before it is reported.
    _requestFilled: function(url, extraHeaders) {
        for (var attempt = 0; attempt < 3; attempt++) {
            var html = this._request(url, null, extraHeaders);
            if (html && html.trim()) return html;
        }
        throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
    },

    // ======== List Parser ========

    _parseList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return new MangasPage([], false);

        var mangas = [];
        var seen = {};

        // A search with a single hit is redirected straight to the work page.
        var single = doc.selectFirst("#single_book");
        if (single) {
            var canonical = doc.selectFirst("link[rel=canonical], meta[property=og:url]");
            var singleUrl = canonical ? (canonical.attr("href") || canonical.attr("content")) : "";
            var heading = single.selectFirst("h1.heading");
            var cover = single.selectFirst(".cover img");
            if (singleUrl && heading) {
                var only = SManga.create();
                only.url = this._relativeUrl(singleUrl);
                only.title = heading.text().trim();
                only.thumbnailUrl = cover ? this._absoluteUrl(cover.attr("src")) : null;
                mangas.push(only);
            }
            bridge.domReleaseAll();
            return new MangasPage(mangas, false);
        }

        doc.select("#book_list > div.item").forEach(function(item) {
            try {
                var link = item.selectFirst("h3.title a[href]");
                if (!link) return;
                var manga = SManga.create();
                manga.url = this._relativeUrl(link.absUrl("href") || link.attr("href"));
                manga.title = link.text().trim();
                var image = item.selectFirst(".wrap_img img");
                manga.thumbnailUrl = image ? this._absoluteUrl(image.attr("data-src") || image.attr("src")) : null;
                if (manga.url && manga.title && !seen[manga.url]) {
                    seen[manga.url] = true;
                    mangas.push(manga);
                }
            } catch (e) {
                bridge.log("MangaKatana list item error: " + e);
            }
        }.bind(this));

        var hasNext = doc.selectFirst("a.next.page-numbers") !== null;
        bridge.domReleaseAll();
        return new MangasPage(mangas, hasNext);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var html = this._requestFilled(this._absoluteUrl(manga.url));
        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return manga;

        var result = SManga.create();
        result.url = manga.url;
        result.initialized = true;

        var heading = doc.selectFirst("#single_book h1.heading, h1.heading");
        result.title = heading ? heading.text().trim() : manga.title || "";

        var cover = doc.selectFirst("#single_book .cover img");
        result.thumbnailUrl = cover ? this._absoluteUrl(cover.attr("src")) : manga.thumbnailUrl || null;

        var authors = [];
        doc.select("#single_book .authors a.author").forEach(function(link) {
            var name = link.text().trim();
            if (name && authors.indexOf(name) === -1) authors.push(name);
        });
        result.author = authors.length > 0 ? authors.join(", ") : null;
        result.artist = result.author;

        var genres = [];
        doc.select("#single_book .genres a").forEach(function(link) {
            var name = link.text().trim();
            if (name && genres.indexOf(name) === -1) genres.push(name);
        });
        result.genre = genres.length > 0 ? genres : null;

        var statusElement = doc.selectFirst("#single_book .value.status");
        result.status = this._parseStatus(statusElement ? statusElement.text() : "");

        var parts = [];
        var summary = doc.selectFirst("#single_book .summary > p");
        if (summary) parts.push(summary.text().trim());
        var altName = doc.selectFirst("#single_book .alt_name");
        if (altName && altName.text().trim()) parts.push("Alternative names: " + altName.text().trim());
        result.description = parts.length > 0 ? parts.join("\n\n") : null;

        bridge.domReleaseAll();
        return result;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var html = this._requestFilled(this._absoluteUrl(manga.url));
        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return [];

        var entries = [];
        var seen = {};
        doc.select("div.chapters tr").forEach(function(row) {
            var link = row.selectFirst(".chapter a[href]");
            if (!link) return;
            var url = this._relativeUrl(link.absUrl("href") || link.attr("href"));
            if (!url || seen[url]) return;
            seen[url] = true;
            var dateElement = row.selectFirst(".update_time");
            entries.push({
                url: url,
                name: link.text().trim() || url,
                date: this._parseDate(dateElement ? dateElement.text() : "")
            });
        }.bind(this));
        bridge.domReleaseAll();

        // The site lists the newest chapter first; Shinsou reads in story order.
        entries.reverse();
        var chapters = [];
        for (var i = 0; i < entries.length; i++) {
            var chapter = SChapter.create();
            chapter.url = entries[i].url;
            chapter.name = entries[i].name;
            chapter.dateUpload = entries[i].date;
            chapter.chapterNumber = this._chapterNumber(entries[i].name, i);
            chapters.push(chapter);
        }
        return chapters;
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var html = this._requestFilled(this._absoluteUrl(chapter.url));
        var urls = this._extractImageArray(html);
        var pages = [];
        var seen = {};
        for (var i = 0; i < urls.length; i++) {
            var imageUrl = this._absoluteUrl(urls[i]);
            if (!imageUrl || seen[imageUrl]) continue;
            seen[imageUrl] = true;
            pages.push(new Page(pages.length, "", imageUrl));
        }
        return pages;
    },

    // The reader embeds several image arrays, some of them decoys. The real one is the array
    // the page loop walks ("for(i=NAME.length-1"); the longest array is the fallback.
    _extractImageArray: function(html) {
        var arrays = {};
        var longest = [];
        var pattern = /var\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\]]*)\]/g;
        var match;
        while ((match = pattern.exec(html)) !== null) {
            var items = [];
            var itemPattern = /'([^']*)'|"([^"]*)"/g;
            var item;
            while ((item = itemPattern.exec(match[2])) !== null) {
                var value = item[1] !== undefined ? item[1] : item[2];
                if (/^(?:https?:)?\/\//.test(value)) items.push(value);
            }
            if (items.length === 0) continue;
            arrays[match[1]] = items;
            if (items.length > longest.length) longest = items;
        }
        var loop = /for\s*\(\s*i\s*=\s*([A-Za-z_$][\w$]*)\.length\s*-\s*1/.exec(html);
        if (loop && arrays[loop[1]]) return arrays[loop[1]];
        return longest;
    },

    // ======== Filters ========

    getFilterList: function() {
        var genres = [];
        for (var i = 0; i < this.filterOptions.genres.length; i++) {
            genres.push({ type: "triState", name: this._genreLabel(this.filterOptions.genres[i]), state: 0 });
        }
        return [
            { type: "header", name: "A text search ignores the filters below (except \"Search by\")" },
            { type: "select", name: "Search by", values: this._filterLabels(this.filterOptions.searchBy), state: 0 },
            { type: "separator" },
            { type: "select", name: "Order by", values: this._filterLabels(this.filterOptions.orders), state: 0 },
            { type: "select", name: "Status", values: this._filterLabels(this.filterOptions.statuses), state: 0 },
            { type: "select", name: "Chapters", values: this._filterLabels(this.filterOptions.chapters), state: 0 },
            { type: "select", name: "Genre match", values: ["All included genres", "Any included genre"], state: 0 },
            { type: "group", name: "Genres", filters: genres }
        ];
    },

    // ======== Helpers ========

    _genreLabel: function(slug) {
        if (slug === "4-koma") return "4 koma";
        if (slug === "overpowered-mc") return "Overpowered MC";
        return slug.split("-").map(function(word) {
            return word.charAt(0).toUpperCase() + word.substring(1);
        }).join(" ");
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
        if (value.indexOf("cancel") !== -1) return SManga.CANCELLED;
        return SManga.UNKNOWN;
    },

    // "Nov-17-2026"
    _parseDate: function(text) {
        var match = /([A-Za-z]{3})-(\d{1,2})-(\d{4})/.exec(String(text || ""));
        if (!match) return 0;
        var month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            .indexOf(match[1].toLowerCase());
        if (month < 0) return 0;
        return Date.UTC(parseInt(match[3], 10), month, parseInt(match[2], 10));
    },

    _chapterNumber: function(name, fallbackIndex) {
        var match = String(name || "").match(/(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i) ||
            String(name || "").match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : fallbackIndex + 1;
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
// en.mangakatana 1.0.0: network origins are declared in the repository index.
