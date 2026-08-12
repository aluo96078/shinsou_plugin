// MangaCopy (拷貝漫畫) plugin for Shinsou
// Uses MangaCopy's public v3 API, with the desktop site as a catalogue fallback.

var source = {
    baseUrl: "https://www.mangacopy.com",
    apiUrl: "https://api.manga2026.xyz",
    supportsLatest: true,
    supportsLogin: false,
    headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
        "Referer": "https://www.mangacopy.com/"
    },

    _apiHeaders: {
        "User-Agent": "COPY/3.0.0",
        "Accept": "application/json",
        "version": "2025.08.15",
        "platform": "1",
        "webp": "1",
        "region": "1"
    },
    _aesKey: "op0zzpvv.nmn.00p",
    _chapterLimit: 500,
    _apiMirrors: [
        "https://mapi.hotmangasg.com",
        "https://mapi.hotmangasd.com",
        "https://mapi.hotmangasf.com",
        "https://mapi.elfgjfghkk.club",
        "https://mapi.fgjfghkkcenter.club",
        "https://mapi.fgjfghkk.club",
        "https://api.copy202602.com"
    ],
    _mirrors: [
        "https://www.2026copy.com",
        "https://www.copy3000.com",
        "https://www.copy20.com"
    ],

    // ======== Catalogue ========

    getPopularManga: function(page) {
        return this._getApiCataloguePage(page, "-popular");
    },

    getLatestUpdates: function(page) {
        return this._getApiCataloguePage(page, "-datetime_updated");
    },

    _getApiCataloguePage: function(page, ordering) {
        var limit = 50;
        var offset = page * limit;
        var path = "/api/v3/comics?ordering=" + encodeURIComponent(ordering) +
            "&offset=" + offset + "&limit=" + limit;
        var body = this._getApi(path);
        if (!body) return this._getCataloguePage(page, ordering);

        try {
            var json = JSON.parse(body);
            if (!this._isSuccessfulResponse(json)) {
                return this._getCataloguePage(page, ordering);
            }
            return this._mangasPageFromResults(json.results, offset, limit);
        } catch (e) {
            this._log("API catalogue parse failed", e);
            return this._getCataloguePage(page, ordering);
        }
    },

    _getCataloguePage: function(page, ordering) {
        var limit = 50;
        var offset = page * limit;
        var path = "/comics?ordering=" + ordering +
            "&offset=" + offset + "&limit=" + limit;
        var html = this._get(this.baseUrl, path);
        if (!html) return new MangasPage([], false);

        var doc = null;
        try {
            doc = Jsoup.parse(html, this.baseUrl);
            var box = doc.selectFirst(".exemptComic-box[list]");
            if (!box) return new MangasPage([], false);

            var rawList = box.attr("list") || "";
            var items = this._parsePythonLiteral(this._decodeHtmlEntities(rawList));
            if (!this._isArray(items)) items = [];

            var mangas = [];
            for (var i = 0; i < items.length; i++) {
                var manga = this._mangaFromItem(items[i]);
                if (manga) mangas.push(manga);
            }

            var total = parseInt(box.attr("total"), 10);
            var hasNext = isNaN(total) ? items.length >= limit : offset + items.length < total;
            return new MangasPage(mangas, hasNext);
        } catch (e) {
            this._log("catalogue parse failed", e);
            return new MangasPage([], false);
        } finally {
            if (doc) this._releaseDom();
        }
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var keyword = query == null ? "" : String(query).trim();
        if (!keyword) return this._getApiCataloguePage(page, "-popular");

        var limit = 12;
        var offset = page * limit;
        var apiPath = "/api/v3/search/comic?offset=" + offset +
            "&limit=" + limit + "&q=" + encodeURIComponent(keyword) + "&q_type=";
        var apiBody = this._getApi(apiPath);
        if (apiBody) {
            try {
                var apiResponse = JSON.parse(apiBody);
                if (this._isSuccessfulResponse(apiResponse) && apiResponse.results) {
                    return this._mangasPageFromResults(apiResponse.results, offset, limit);
                }
            } catch (e) {
                this._log("API search parse failed", e);
            }
        }

        var webPath = "/api/kb/web/searchci/comics?offset=" + offset +
            "&platform=2&limit=" + limit + "&q=" + encodeURIComponent(keyword) + "&q_type=";
        var webBody = this._get(this.baseUrl, webPath, true);
        if (!webBody) return new MangasPage([], false);

        try {
            var webResponse = JSON.parse(webBody);
            if (!this._isSuccessfulResponse(webResponse)) return new MangasPage([], false);
            return this._mangasPageFromResults(webResponse.results, offset, limit);
        } catch (e) {
            this._log("search fallback parse failed", e);
            return new MangasPage([], false);
        }
    },

    _mangasPageFromResults: function(results, fallbackOffset, fallbackLimit) {
        results = results || {};
        var items = this._isArray(results.list) ? results.list : [];
        var mangas = [];
        for (var i = 0; i < items.length; i++) {
            var manga = this._mangaFromItem(items[i]);
            if (manga) mangas.push(manga);
        }

        var total = Number(results.total);
        var offset = Number(results.offset);
        var limit = Number(results.limit);
        if (isNaN(offset)) offset = fallbackOffset;
        if (isNaN(limit) || limit <= 0) limit = fallbackLimit;
        var hasNext = isNaN(total) ? items.length >= limit : offset + items.length < total;
        return new MangasPage(mangas, hasNext);
    },

    _mangaFromItem: function(item) {
        if (!item || !item.path_word || !item.name) return null;

        var manga = SManga.create();
        manga.url = "/comic/" + encodeURIComponent(String(item.path_word));
        manga.title = String(item.name);
        manga.thumbnailUrl = this._fixUrl(item.cover || "", this.baseUrl);
        manga.author = this._authorNames(item.author);

        if (item.status === 0 || item.status === "0") {
            manga.status = SManga.ONGOING;
        } else if (item.status === 1 || item.status === "1") {
            manga.status = SManga.COMPLETED;
        } else {
            manga.status = SManga.UNKNOWN;
        }
        return manga;
    },

    _authorNames: function(authors) {
        if (!this._isArray(authors)) return null;
        var names = [];
        for (var i = 0; i < authors.length; i++) {
            var name = authors[i] && authors[i].name;
            if (name) names.push(String(name));
        }
        return names.length ? names.join("、") : null;
    },

    // ======== Manga details ========

    getMangaDetails: function(manga) {
        var pathWord = this._mangaPath(manga && manga.url);
        if (!pathWord) return manga;

        var body = this._getApi("/api/v3/comic/" + encodeURIComponent(pathWord));
        if (body) {
            try {
                var json = JSON.parse(body);
                var comic = json && json.results && json.results.comic;
                if (this._isSuccessfulResponse(json) && comic) {
                    return this._mangaDetailsFromApi(comic, manga, pathWord);
                }
            } catch (e) {
                this._log("API details parse failed", e);
            }
        }

        return this._getMangaDetailsFromWeb(manga, pathWord);
    },

    _mangaDetailsFromApi: function(comic, manga, pathWord) {
        var result = SManga.create();
        result.url = "/comic/" + encodeURIComponent(pathWord);
        result.initialized = true;
        result.title = comic.name ? String(comic.name) : (manga.title || "");
        result.thumbnailUrl = this._fixUrl(comic.cover || "", this.baseUrl) ||
            manga.thumbnailUrl || null;
        result.author = this._authorNames(comic.author) || manga.author || null;
        result.description = comic.brief ? String(comic.brief) : (manga.description || null);

        var genres = [];
        var themes = this._isArray(comic.theme) ? comic.theme : [];
        for (var i = 0; i < themes.length; i++) {
            var name = themes[i] && themes[i].name;
            if (name && genres.indexOf(String(name)) === -1) genres.push(String(name));
        }
        result.genre = genres.length ? genres : (manga.genre || []);

        var statusValue = comic.status && comic.status.value;
        if (statusValue === 0 || statusValue === "0") result.status = SManga.ONGOING;
        else if (statusValue === 1 || statusValue === "1") result.status = SManga.COMPLETED;
        else result.status = this._statusFromText(comic.status && comic.status.display);
        if (result.status === SManga.UNKNOWN && manga.status != null) result.status = manga.status;
        return result;
    },

    _getMangaDetailsFromWeb: function(manga, pathWord) {
        var path = "/comic/" + encodeURIComponent(pathWord);
        var html = this._get(this.baseUrl, path);
        if (!html) return manga;

        var doc = null;
        try {
            doc = Jsoup.parse(html, this.baseUrl);
            var result = SManga.create();
            result.url = path;
            result.initialized = true;

            var titleEl = doc.selectFirst(".comicParticulars-title-right h6");
            result.title = titleEl ? titleEl.text().trim() : (manga.title || "");

            var coverEl = doc.selectFirst(".comicParticulars-title-left img");
            var cover = coverEl ? (coverEl.attr("data-src") || coverEl.attr("src")) : "";
            result.thumbnailUrl = this._fixUrl(cover, this.baseUrl) || manga.thumbnailUrl || null;

            var authorEls = doc.select(".comicParticulars-title-right a[href*='/author/']");
            var authorNames = [];
            authorEls.forEach(function(authorEl) {
                var authorName = authorEl.text().trim();
                if (authorName && authorNames.indexOf(authorName) === -1) authorNames.push(authorName);
            });
            result.author = authorNames.length ? authorNames.join("、") : (manga.author || null);

            var genreEls = doc.select(".comicParticulars-tag a");
            var genres = [];
            genreEls.forEach(function(genreEl) {
                var genre = genreEl.text().replace(/^#/, "").trim();
                if (genre && genres.indexOf(genre) === -1) genres.push(genre);
            });
            result.genre = genres;

            var introEl = doc.selectFirst("p.intro");
            result.description = introEl ? introEl.text().trim() : (manga.description || null);

            var statusText = "";
            var rows = doc.select(".comicParticulars-title-right li");
            rows.forEach(function(row) {
                if (statusText) return;
                var rowText = row.text();
                if (rowText.indexOf("狀態") !== -1 || rowText.indexOf("状态") !== -1) {
                    statusText = rowText;
                }
            });
            result.status = this._statusFromText(statusText);
            if (result.status === SManga.UNKNOWN && manga.status != null) result.status = manga.status;
            return result;
        } catch (e) {
            this._log("details parse failed", e);
            return manga;
        } finally {
            if (doc) this._releaseDom();
        }
    },

    _statusFromText: function(text) {
        text = text || "";
        if (text.indexOf("完結") !== -1 || text.indexOf("完结") !== -1 ||
            text.indexOf("已完") !== -1) {
            return SManga.COMPLETED;
        }
        if (text.indexOf("連載") !== -1 || text.indexOf("连载") !== -1) {
            return SManga.ONGOING;
        }
        return SManga.UNKNOWN;
    },

    // ======== Chapters ========

    getChapterList: function(manga) {
        var pathWord = this._mangaPath(manga && manga.url);
        if (!pathWord) return [];

        var apiChapters = this._getChapterListFromApi(pathWord);
        if (apiChapters !== null) return apiChapters;
        return this._getChapterListFromWeb(pathWord);
    },

    _getChapterListFromApi: function(pathWord) {
        var detailBody = this._getApi("/api/v3/comic/" + encodeURIComponent(pathWord));
        if (!detailBody) return null;

        try {
            var detail = JSON.parse(detailBody);
            if (!this._isSuccessfulResponse(detail)) return null;

            var groups = detail.results && detail.results.groups;
            if (!groups || typeof groups !== "object" || this._isArray(groups)) return null;

            var chapters = [];
            var seenUrls = {};
            var groupKeys = Object.keys(groups);
            for (var i = 0; i < groupKeys.length; i++) {
                var groupKey = groupKeys[i];
                var group = groups[groupKey] || {};
                var groupPath = group.path_word ? String(group.path_word) : groupKey;
                var scanlator = group.name ? String(group.name) : groupPath;
                var groupChapters = this._getAllApiChapters(pathWord, groupPath);
                if (groupChapters === null) return null;
                for (var j = 0; j < groupChapters.length; j++) {
                    var item = groupChapters[j];
                    var chapter = this._chapterFromApiItem(item, pathWord, scanlator);
                    if (!chapter || seenUrls[chapter.url]) continue;
                    seenUrls[chapter.url] = true;
                    chapters.push({ chapter: chapter, order: chapters.length, item: item });
                }
            }

            chapters.sort(function(left, right) {
                var orderedLeft = Number(left.item.ordered);
                var orderedRight = Number(right.item.ordered);
                if (!isNaN(orderedLeft) && !isNaN(orderedRight) && orderedLeft !== orderedRight) {
                    return orderedRight - orderedLeft;
                }
                var indexLeft = Number(left.item.index);
                var indexRight = Number(right.item.index);
                if (!isNaN(indexLeft) && !isNaN(indexRight) && indexLeft !== indexRight) {
                    return indexRight - indexLeft;
                }
                return left.order - right.order;
            });

            var sorted = [];
            for (var k = 0; k < chapters.length; k++) sorted.push(chapters[k].chapter);
            return sorted;
        } catch (e) {
            this._log("chapter data failed", e);
            return null;
        }
    },

    _getAllApiChapters: function(pathWord, groupPath) {
        var chapters = [];
        var offset = 0;
        var limit = this._chapterLimit;
        var pageCount = 0;

        while (pageCount < 1000) {
            pageCount++;
            var path = "/api/v3/comic/" + encodeURIComponent(pathWord) +
                "/group/" + encodeURIComponent(groupPath) + "/chapters?limit=" + limit +
                "&offset=" + offset;
            var body = this._getApi(path);
            if (!body) return null;

            var response;
            try {
                response = JSON.parse(body);
            } catch (e) {
                this._log("chapter group parse failed for " + groupPath, e);
                return null;
            }
            if (!this._isSuccessfulResponse(response)) return null;

            var results = response.results || {};
            if (!this._isArray(results.list)) return null;
            var items = results.list;
            var responseOffset = Number(results.offset);
            if (!isNaN(responseOffset) && responseOffset !== offset) return null;
            for (var i = 0; i < items.length; i++) chapters.push(items[i]);

            var total = Number(results.total);
            var hasTotal = !isNaN(total) && total >= 0;
            var nextOffset = offset + items.length;
            if (!items.length) {
                return hasTotal && offset < total ? null : chapters;
            }
            if (nextOffset <= offset) return null;
            if (hasTotal && nextOffset >= total) return chapters;
            if (!hasTotal && items.length < limit) return chapters;
            offset = nextOffset;
        }
        this._log("chapter pagination exceeded the safety limit for " + groupPath);
        return null;
    },

    _getChapterListFromWeb: function(pathWord) {
        var bases = this._candidateBases();
        var path = "/comicdetail/" + encodeURIComponent(pathWord) + "/chapters";
        for (var i = 0; i < bases.length; i++) {
            var body = this._get(bases[i], path, true);
            if (!body) continue;

            try {
                var response = JSON.parse(body);
                if (!response || typeof response.results !== "string") continue;
                var decrypted = this._decryptPayload(response.results);
                var data = JSON.parse(decrypted);
                var chapters = this._chaptersFromData(data, pathWord);
                if (chapters.length) return chapters;
            } catch (e) {
                this._log("chapter fallback failed on " + bases[i], e);
            }
        }
        return [];
    },

    _chaptersFromData: function(data, fallbackPathWord) {
        if (!data || !data.groups || typeof data.groups !== "object") return [];

        var pathWord = data.build && data.build.path_word ?
            String(data.build.path_word) : fallbackPathWord;
        var chapters = [];
        var seenUrls = {};
        var groupKeys = Object.keys(data.groups);

        for (var i = 0; i < groupKeys.length; i++) {
            var group = data.groups[groupKeys[i]];
            if (!group || !this._isArray(group.chapters)) continue;
            var scanlator = group.name ? String(group.name) : String(groupKeys[i]);

            // The desktop endpoint returns each group oldest first.
            for (var j = group.chapters.length - 1; j >= 0; j--) {
                var item = group.chapters[j];
                if (!item || !item.id || !item.name) continue;

                var chapter = SChapter.create();
                chapter.url = "/comic/" + encodeURIComponent(pathWord) +
                    "/chapter/" + encodeURIComponent(String(item.id));
                if (seenUrls[chapter.url]) continue;
                seenUrls[chapter.url] = true;
                chapter.name = String(item.name);
                chapter.scanlator = scanlator || null;
                chapter.chapterNumber = this._chapterNumber(chapter.name);
                chapter.dateUpload = this._dateTimestamp(item.datetime_created);
                chapters.push({ chapter: chapter, order: chapters.length });
            }
        }

        chapters.sort(function(left, right) {
            var numberOrder = right.chapter.chapterNumber - left.chapter.chapterNumber;
            return numberOrder || left.order - right.order;
        });

        var sorted = [];
        for (var k = 0; k < chapters.length; k++) sorted.push(chapters[k].chapter);
        return sorted;
    },

    _chapterFromApiItem: function(item, fallbackPathWord, scanlator) {
        if (!item || !item.uuid || !item.name) return null;

        var pathWord = item.comic_path_word ? String(item.comic_path_word) : fallbackPathWord;
        var chapter = SChapter.create();
        chapter.url = "/comic/" + encodeURIComponent(pathWord) +
            "/chapter/" + encodeURIComponent(String(item.uuid));
        chapter.name = String(item.name);
        chapter.scanlator = scanlator || null;
        chapter.chapterNumber = this._chapterNumber(chapter.name);
        chapter.dateUpload = this._dateTimestamp(item.datetime_created);
        return chapter;
    },

    _chapterNumber: function(name) {
        var text = String(name || "");
        var match = text.match(/(?:第\s*)?(\d+(?:\.\d+)?)\s*(?:話|话|卷|回|章)/);
        if (!match && /番外/.test(text)) match = text.match(/番外(?:篇|篇章|章)?\s*(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : -1;
    },

    _dateTimestamp: function(value) {
        if (!value) return 0;
        var timestamp = new Date(String(value).replace(/-/g, "/")).getTime();
        return isNaN(timestamp) ? 0 : timestamp;
    },

    // ======== Reader pages ========

    getPageList: function(chapter) {
        var parts = this._chapterParts(chapter && chapter.url);
        if (!parts) return [];

        var apiPath = "/api/v3/comic/" + encodeURIComponent(parts.pathWord) +
            "/chapter/" + encodeURIComponent(parts.chapterId);
        var apiBody = this._getApi(apiPath);
        if (apiBody) {
            try {
                var response = JSON.parse(apiBody);
                var apiImages = response && response.results && response.results.chapter &&
                    response.results.chapter.contents;
                if (this._isSuccessfulResponse(response) && this._isArray(apiImages)) {
                    var apiPages = this._pagesFromImages(apiImages, this.apiUrl);
                    if (apiPages.length) return apiPages;
                }
            } catch (e) {
                this._log("API page data failed", e);
            }
        }

        var path = "/comic/" + encodeURIComponent(parts.pathWord) +
            "/chapter/" + encodeURIComponent(parts.chapterId);
        var bases = this._candidateBases();

        for (var i = 0; i < bases.length; i++) {
            var html = this._get(bases[i], path);
            if (!html) continue;

            try {
                var match = html.match(/\bcontentKey\s*=\s*['\"]([^'\"]+)['\"]/);
                if (!match || !match[1]) continue;

                var decrypted = this._decryptPayload(match[1]);
                var images = JSON.parse(decrypted);
                if (!this._isArray(images) || !images.length) continue;

                var pages = this._pagesFromImages(images, bases[i]);
                if (pages.length) return pages;
            } catch (e) {
                this._log("page data failed on " + bases[i], e);
            }
        }
        return [];
    },

    _pagesFromImages: function(images, base) {
        var pages = [];
        for (var i = 0; i < images.length; i++) {
            var imageUrl = images[i] && (images[i].url || images[i].imageUrl);
            imageUrl = this._fixUrl(imageUrl || "", base);
            if (imageUrl) pages.push(new Page(pages.length, "", imageUrl));
        }
        return pages;
    },

    // ======== Network and URL helpers ========

    _candidateBases: function() {
        var bases = [this.baseUrl];
        for (var i = 0; i < this._mirrors.length; i++) bases.push(this._mirrors[i]);
        return bases;
    },

    _getApi: function(path) {
        var bases = [this.apiUrl];
        for (var i = 0; i < this._apiMirrors.length; i++) bases.push(this._apiMirrors[i]);

        for (var j = 0; j < bases.length; j++) {
            try {
                var response = bridge.httpGetWithHeaders(bases[j] + path, this._apiHeaders);
                if (!response || response.error) continue;
                var body = String(response);
                var parsed = JSON.parse(body);
                if (!this._isSuccessfulResponse(parsed) || !parsed.results) continue;
                return body;
            } catch (e) {
                this._log("API request failed for " + bases[j] + path, e);
            }
        }
        return null;
    },

    _isSuccessfulResponse: function(response) {
        if (!response) return false;
        if (!Object.prototype.hasOwnProperty.call(response, "code")) return true;
        return Number(response.code) === 200;
    },

    _get: function(base, path, wantsJson) {
        try {
            var headers = {
                "User-Agent": this.headers["User-Agent"],
                "Accept": wantsJson ? "application/json,text/plain,*/*" : this.headers.Accept,
                "Accept-Language": this.headers["Accept-Language"],
                "Referer": base + "/"
            };
            var response = bridge.httpGetWithHeaders(base + path, headers);
            if (!response || response.error) return null;
            return String(response);
        } catch (e) {
            this._log("request failed for " + base + path, e);
            return null;
        }
    },

    _mangaPath: function(url) {
        var match = String(url || "").match(/\/comic\/([^\/?#]+)/);
        if (!match) return "";
        return this._safeDecode(match[1]);
    },

    _chapterParts: function(url) {
        var match = String(url || "").match(/\/comic\/([^\/?#]+)\/chapter\/([^\/?#]+)/);
        if (!match) return null;
        return {
            pathWord: this._safeDecode(match[1]),
            chapterId: this._safeDecode(match[2])
        };
    },

    _safeDecode: function(value) {
        try {
            return decodeURIComponent(value);
        } catch (e) {
            return value;
        }
    },

    _fixUrl: function(url, base) {
        if (!url) return "";
        url = String(url).replace(/&amp;/g, "&").trim();
        if (url.indexOf("//") === 0) return "https:" + url;
        if (url.charAt(0) === "/") return (base || this.baseUrl) + url;
        return url;
    },

    _log: function(message, error) {
        if (typeof bridge !== "undefined" && bridge.log) {
            bridge.log("MangaCopy: " + message + (error ? " (" + error + ")" : ""));
        }
    },

    _releaseDom: function() {
        if (typeof bridge !== "undefined" && bridge.domReleaseAll) bridge.domReleaseAll();
    },

    _isArray: function(value) {
        return Object.prototype.toString.call(value) === "[object Array]";
    },

    // ======== Python-literal list parser ========

    _decodeHtmlEntities: function(value) {
        var text = String(value || "");
        for (var pass = 0; pass < 2; pass++) {
            text = text.replace(/&#x([0-9a-f]+);/gi, function(_, hex) {
                return String.fromCharCode(parseInt(hex, 16));
            });
            text = text.replace(/&#(\d+);/g, function(_, decimal) {
                return String.fromCharCode(parseInt(decimal, 10));
            });
            text = text.replace(/&quot;/gi, "\"")
                .replace(/&apos;/gi, "'")
                .replace(/&lt;/gi, "<")
                .replace(/&gt;/gi, ">")
                .replace(/&amp;/gi, "&");
        }
        return text;
    },

    _parsePythonLiteral: function(input) {
        var text = String(input || "");
        var index = 0;
        var length = text.length;

        function skipWhitespace() {
            while (index < length && /\s/.test(text.charAt(index))) index++;
        }

        function parseString() {
            var quote = text.charAt(index++);
            var output = "";
            while (index < length) {
                var ch = text.charAt(index++);
                if (ch === quote) return output;
                if (ch !== "\\") {
                    output += ch;
                    continue;
                }
                if (index >= length) throw new Error("unterminated escape");
                var escaped = text.charAt(index++);
                if (escaped === "n") output += "\n";
                else if (escaped === "r") output += "\r";
                else if (escaped === "t") output += "\t";
                else if (escaped === "b") output += "\b";
                else if (escaped === "f") output += "\f";
                else if (escaped === "u" || escaped === "U" || escaped === "x") {
                    var count = escaped === "U" ? 8 : (escaped === "u" ? 4 : 2);
                    var hex = text.substr(index, count);
                    if (!new RegExp("^[0-9a-fA-F]{" + count + "}$").test(hex)) {
                        throw new Error("invalid hex escape");
                    }
                    var codePoint = parseInt(hex, 16);
                    if (escaped === "U") {
                        if (codePoint > 1114111 || (codePoint >= 55296 && codePoint <= 57343)) {
                            throw new Error("invalid Unicode escape");
                        }
                        if (codePoint > 65535) {
                            codePoint -= 65536;
                            output += String.fromCharCode(
                                55296 + (codePoint >> 10),
                                56320 + (codePoint & 1023)
                            );
                        } else {
                            output += String.fromCharCode(codePoint);
                        }
                    } else {
                        output += String.fromCharCode(codePoint);
                    }
                    index += count;
                } else {
                    output += escaped;
                }
            }
            throw new Error("unterminated string");
        }

        function parseNumber() {
            var match = text.substring(index).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
            if (!match) throw new Error("invalid number");
            index += match[0].length;
            return Number(match[0]);
        }

        function parseIdentifier() {
            var match = text.substring(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
            if (!match) throw new Error("invalid identifier");
            index += match[0].length;
            if (match[0] === "None" || match[0] === "null") return null;
            if (match[0] === "True" || match[0] === "true") return true;
            if (match[0] === "False" || match[0] === "false") return false;
            return match[0];
        }

        function parseArray() {
            var result = [];
            index++;
            skipWhitespace();
            if (text.charAt(index) === "]") {
                index++;
                return result;
            }
            while (index < length) {
                result.push(parseValue());
                skipWhitespace();
                if (text.charAt(index) === "]") {
                    index++;
                    return result;
                }
                if (text.charAt(index) !== ",") throw new Error("expected array comma");
                index++;
                skipWhitespace();
                if (text.charAt(index) === "]") {
                    index++;
                    return result;
                }
            }
            throw new Error("unterminated array");
        }

        function parseObject() {
            var result = {};
            index++;
            skipWhitespace();
            if (text.charAt(index) === "}") {
                index++;
                return result;
            }
            while (index < length) {
                skipWhitespace();
                var key;
                var ch = text.charAt(index);
                if (ch === "'" || ch === "\"") key = parseString();
                else key = String(parseIdentifier());
                skipWhitespace();
                if (text.charAt(index) !== ":") throw new Error("expected object colon");
                index++;
                var value = parseValue();
                if (key !== "__proto__" && key !== "prototype" && key !== "constructor") {
                    result[key] = value;
                }
                skipWhitespace();
                if (text.charAt(index) === "}") {
                    index++;
                    return result;
                }
                if (text.charAt(index) !== ",") throw new Error("expected object comma");
                index++;
                skipWhitespace();
                if (text.charAt(index) === "}") {
                    index++;
                    return result;
                }
            }
            throw new Error("unterminated object");
        }

        function parseValue() {
            skipWhitespace();
            var ch = text.charAt(index);
            if (ch === "[" ) return parseArray();
            if (ch === "{") return parseObject();
            if (ch === "'" || ch === "\"") return parseString();
            if (ch === "-" || /\d/.test(ch)) return parseNumber();
            return parseIdentifier();
        }

        try {
            var result = parseValue();
            skipWhitespace();
            if (index !== length) throw new Error("unexpected trailing data");
            return result;
        } catch (e) {
            this._log("catalogue literal parse failed", e);
            return null;
        }
    },

    // ======== AES-128-CBC / PKCS#7 ========

    _decryptPayload: function(payload) {
        payload = String(payload || "");
        if (payload.length <= 16) throw new Error("encrypted payload is empty");

        var ivText = payload.substring(0, 16);
        var cipherHex = payload.substring(16);
        if (!/^[0-9a-fA-F]+$/.test(cipherHex) || cipherHex.length % 32 !== 0) {
            throw new Error("invalid AES ciphertext");
        }

        var key = this._asciiBytes(this._aesKey);
        var iv = this._asciiBytes(ivText);
        if (key.length !== 16 || iv.length !== 16) throw new Error("AES key or IV is not 16 bytes");

        var roundKeys = this._expandAesKey(key);
        var previous = iv;
        var plaintext = [];

        for (var offset = 0; offset < cipherHex.length; offset += 32) {
            var block = [];
            for (var i = 0; i < 32; i += 2) {
                block.push(parseInt(cipherHex.substr(offset + i, 2), 16));
            }
            var decrypted = this._aesDecryptBlock(block, roundKeys);
            for (var j = 0; j < 16; j++) plaintext.push(decrypted[j] ^ previous[j]);
            previous = block;
        }

        var padding = plaintext[plaintext.length - 1];
        if (padding < 1 || padding > 16 || padding > plaintext.length) {
            throw new Error("invalid PKCS#7 padding");
        }
        for (var p = plaintext.length - padding; p < plaintext.length; p++) {
            if (plaintext[p] !== padding) throw new Error("invalid PKCS#7 padding");
        }
        plaintext.length -= padding;
        return this._utf8Decode(plaintext);
    },

    _asciiBytes: function(text) {
        var bytes = [];
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code > 255) throw new Error("non-byte AES input");
            bytes.push(code);
        }
        return bytes;
    },

    _expandAesKey: function(key) {
        var sbox = this._aesSbox;
        var expanded = key.slice(0);
        var rcon = 1;
        var temp = [0, 0, 0, 0];

        while (expanded.length < 176) {
            for (var i = 0; i < 4; i++) temp[i] = expanded[expanded.length - 4 + i];
            if (expanded.length % 16 === 0) {
                var first = temp.shift();
                temp.push(first);
                for (var j = 0; j < 4; j++) temp[j] = sbox[temp[j]];
                temp[0] ^= rcon;
                rcon = this._aesXtime(rcon);
            }
            for (var k = 0; k < 4; k++) {
                expanded.push(expanded[expanded.length - 16] ^ temp[k]);
            }
        }
        return expanded;
    },

    _aesDecryptBlock: function(block, roundKeys) {
        var state = block.slice(0);
        this._aesAddRoundKey(state, roundKeys, 10);

        for (var round = 9; round >= 1; round--) {
            this._aesInvShiftRows(state);
            this._aesInvSubBytes(state);
            this._aesAddRoundKey(state, roundKeys, round);
            this._aesInvMixColumns(state);
        }

        this._aesInvShiftRows(state);
        this._aesInvSubBytes(state);
        this._aesAddRoundKey(state, roundKeys, 0);
        return state;
    },

    _aesAddRoundKey: function(state, roundKeys, round) {
        var start = round * 16;
        for (var i = 0; i < 16; i++) state[i] ^= roundKeys[start + i];
    },

    _aesInvSubBytes: function(state) {
        for (var i = 0; i < 16; i++) state[i] = this._aesInvSbox[state[i]];
    },

    _aesInvShiftRows: function(state) {
        var copy = state.slice(0);
        state[1] = copy[13]; state[5] = copy[1]; state[9] = copy[5]; state[13] = copy[9];
        state[2] = copy[10]; state[6] = copy[14]; state[10] = copy[2]; state[14] = copy[6];
        state[3] = copy[7]; state[7] = copy[11]; state[11] = copy[15]; state[15] = copy[3];
    },

    _aesInvMixColumns: function(state) {
        for (var column = 0; column < 4; column++) {
            var i = column * 4;
            var a0 = state[i];
            var a1 = state[i + 1];
            var a2 = state[i + 2];
            var a3 = state[i + 3];
            state[i] = this._aesMultiply(a0, 14) ^ this._aesMultiply(a1, 11) ^
                this._aesMultiply(a2, 13) ^ this._aesMultiply(a3, 9);
            state[i + 1] = this._aesMultiply(a0, 9) ^ this._aesMultiply(a1, 14) ^
                this._aesMultiply(a2, 11) ^ this._aesMultiply(a3, 13);
            state[i + 2] = this._aesMultiply(a0, 13) ^ this._aesMultiply(a1, 9) ^
                this._aesMultiply(a2, 14) ^ this._aesMultiply(a3, 11);
            state[i + 3] = this._aesMultiply(a0, 11) ^ this._aesMultiply(a1, 13) ^
                this._aesMultiply(a2, 9) ^ this._aesMultiply(a3, 14);
        }
    },

    _aesMultiply: function(a, b) {
        var result = 0;
        while (b) {
            if (b & 1) result ^= a;
            a = this._aesXtime(a);
            b >>>= 1;
        }
        return result & 255;
    },

    _aesXtime: function(value) {
        return ((value << 1) ^ ((value & 128) ? 27 : 0)) & 255;
    },

    _utf8Decode: function(bytes) {
        var output = "";
        for (var i = 0; i < bytes.length;) {
            var first = bytes[i++];
            if (first < 128) {
                output += String.fromCharCode(first);
            } else if (first >= 194 && first <= 223 && i < bytes.length) {
                output += String.fromCharCode(((first & 31) << 6) | (bytes[i++] & 63));
            } else if (first >= 224 && first <= 239 && i + 1 < bytes.length) {
                output += String.fromCharCode(((first & 15) << 12) |
                    ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
            } else if (first >= 240 && first <= 244 && i + 2 < bytes.length) {
                var codePoint = ((first & 7) << 18) | ((bytes[i++] & 63) << 12) |
                    ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
                codePoint -= 65536;
                output += String.fromCharCode(55296 + (codePoint >> 10), 56320 + (codePoint & 1023));
            } else {
                output += "\uFFFD";
            }
        }
        return output;
    },

    _aesSbox: [
        99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,
        202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,
        183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,
        4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,
        9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,
        83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,
        208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,
        81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,
        205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,
        96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,
        224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,
        231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,
        186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,
        112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,
        225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,
        140,161,137,13,191,230,66,104,65,153,45,15,176,84,187,22
    ],

    _aesInvSbox: [
        82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,
        124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,
        84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,
        8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37,
        114,248,246,100,134,104,152,22,212,164,92,204,93,101,182,146,
        108,112,72,80,253,237,185,218,94,21,70,87,167,141,157,132,
        144,216,171,0,140,188,211,10,247,228,88,5,184,179,69,6,
        208,44,30,143,202,63,15,2,193,175,189,3,1,19,138,107,
        58,145,17,65,79,103,220,234,151,242,207,206,240,180,230,115,
        150,172,116,34,231,173,53,133,226,249,55,232,28,117,223,110,
        71,241,26,113,29,41,197,137,111,183,98,14,170,24,190,27,
        252,86,62,75,198,210,121,32,154,219,192,254,120,205,90,244,
        31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,
        96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,
        160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,
        23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125
    ]
};
