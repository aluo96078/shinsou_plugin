// Bika / Pica Web plugin for Shinsou.
//
// The web client is a signed API client.  This source mirrors the small
// request envelope used by https://manhuabika.com rather than scraping the
// client-rendered HTML shell.

var source = {
    baseUrl: "https://manhuabika.com",
    webChallengeUrl: "https://manhuabika.com/",
    webChallengeLocalStorageKeys: ["token", "nonce"],
    requiredWebChallengeLocalStorageKeys: ["token", "nonce"],
    apiUrl: "https://picaapi.go2778.com",
    apiMirrors: [],
    supportsLatest: true,
    supportsLogin: true,
    headers: {
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
        "Origin": "https://manhuabika.com",
        "Referer": "https://manhuabika.com/"
    },

    _appHeaders: {
        "app-channel": "1",
        "app-uuid": "webUUIDv2",
        "app-version": "20251017",
        "accept": "application/vnd.picacomic.com.v1+json",
        "app-platform": "android",
        "Content-Type": "application/json; charset=UTF-8",
        "image-quality": "medium"
    },
    _signatureSalt: "C69BAF41DA5ABD1FFEDC6D2FEA56B",
    _signatureKey: "~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn",
    _nonce: null,

    // This is the classification list exposed by Pica Web's advanced
    // search.  The first entry is the framework's reset/no-filter option.
    _categoryValues: [
        "全部", "嗶咔漢化", "全彩", "長篇", "同人", "短篇", "圓神領域", "碧藍幻想",
        "CG雜圖", "英語 ENG", "生肉", "純愛", "百合花園", "耽美花園", "偽娘哲學",
        "後宮閃光", "扶他樂園", "單行本", "姐姐系", "妹妹系", "SM", "性轉換", "足の恋",
        "人妻", "NTR", "強暴", "非人類", "艦隊收藏", "Love Live", "SAO 刀劍神域", "Fate",
        "東方", "WEBTOON", "禁書目錄", "歐美", "Cosplay", "重口地帶"
    ],

    // ======== Authentication ========

    login: function() {
        if (this._getToken()) return { loggedIn: true };
        return {
            loggedIn: false,
            errorMessage: "嗶咔已停用直接帳密登入以避免觸發 API 限流。請使用「在瀏覽器登入」並匯入瀏覽器工作階段。"
        };
    },

    logout: function() {
        this._setToken("");
        return true;
    },

    // ======== Catalogue ========

    getPopularManga: function(page) {
        return this._getCatalogue(page, "vd");
    },

    getLatestUpdates: function(page) {
        return this._getCatalogue(page, "dd");
    },

    getSearchManga: function(page, query, filters) {
        page = this._pageNumber(page);
        var keyword = query == null ? "" : String(query).trim();
        var sort = this._sortValue(filters);
        var criteria = {
            category: this._categoryFilterValue(this._filterValue(filters, ["分類", "Category", "category"])),
            tag: this._filterValue(filters, ["標籤", "Tag", "tag"]),
            author: this._filterValue(filters, ["作者", "Author", "author"]),
            translator: this._filterValue(filters, ["翻譯團隊", "翻譯者", "Translator", "translator"]),
            creator: this._filterValue(filters, ["創作者", "創作者 ID", "Creator", "creator"])
        };
        if (!keyword) return this._getCatalogue(page, sort, criteria);

        var response = this._request("/comics/advanced-search?page=" + page + "&s=" + encodeURIComponent(sort), "POST", {
            keyword: keyword,
            sort: sort,
            categories: this._splitValues(criteria.category)
        });
        return this._mangasPageFromResponse(response, page);
    },

    _getCatalogue: function(page, sort, criteria) {
        page = this._pageNumber(page);
        var path = "/comics?page=" + page + "&s=" + encodeURIComponent(sort || "dd");
        if (typeof criteria === "string") criteria = { category: criteria };
        criteria = criteria || {};
        var queryFields = [
            ["c", criteria.category],
            ["t", criteria.tag],
            ["a", criteria.author],
            ["ct", criteria.translator],
            ["ca", criteria.creator]
        ];
        for (var i = 0; i < queryFields.length; i++) {
            var field = queryFields[i];
            if (field[1] && String(field[1]) !== "最近更新") {
                path += "&" + field[0] + "=" + encodeURIComponent(String(field[1]));
            }
        }
        var response = this._request(path, "GET");
        return this._mangasPageFromResponse(response, page);
    },

    _mangasPageFromResponse: function(response, fallbackPage) {
        this._requireApiData(response, "comics", "漫畫目錄");
        var data = response && response.data;
        var comics = data && data.comics;
        var docs = comics && this._isArray(comics.docs) ? comics.docs : [];
        var mangas = [];
        for (var i = 0; i < docs.length; i++) {
            var manga = this._mangaFromItem(docs[i]);
            if (manga) mangas.push(manga);
        }

        var page = Number(comics && comics.page);
        var pages = Number(comics && comics.pages);
        if (isNaN(page) || page < 1) page = fallbackPage || 1;
        if (isNaN(pages) || pages < 1) pages = page + (docs.length ? 1 : 0);
        return new MangasPage(mangas, page < pages);
    },

    _mangaFromItem: function(item) {
        if (!item) return null;
        var id = item._id || item.id;
        if (!id || !item.title) return null;

        var manga = SManga.create();
        manga.url = "/comic/" + encodeURIComponent(String(id));
        manga.title = String(item.title);
        manga.author = this._authorName(item.author);
        manga.artist = this._authorName(item._author);
        manga.description = item.description ? String(item.description) : null;
        manga.thumbnailUrl = this._mediaUrl(item.thumb);
        manga.genre = this._genres(item);
        manga.status = item.finished === true ? SManga.COMPLETED :
            (item.finished === false ? SManga.ONGOING : SManga.UNKNOWN);
        return manga;
    },

    _filterValue: function(filters, names) {
        var filter = this._findFilter(filters, names);
        if (!filter) return "";
        var value = filter.state;
        if (value == null) value = filter.value;
        if (value == null) value = filter.text;
        if (value && typeof value === "object" && value.value != null) value = value.value;
        return value == null ? "" : String(value).trim();
    },

    _categoryFilterValue: function(value) {
        if (value == null) return "";
        var text = String(value).trim();
        if (!text || text === "全部" || text === "未選擇") return "";

        // Select filters normally expose the selected option as an index.
        // Keep accepting a label (and comma-separated labels for callers that
        // use the advanced-search API directly) for compatibility.
        if (/^\d+$/.test(text)) {
            var index = Number(text);
            if (index >= 0 && index < this._categoryValues.length) {
                return index === 0 ? "" : this._categoryValues[index];
            }
        }
        return text;
    },

    _findFilter: function(filters, names) {
        if (!filters) return null;
        if (!this._isArray(names)) names = [names];
        if (this._isArray(filters)) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (!filter || !filter.name) continue;
                for (var j = 0; j < names.length; j++) {
                    if (String(filter.name) === String(names[j])) return filter;
                }
            }
            return null;
        }
        for (var n = 0; n < names.length; n++) {
            if (filters[names[n]] != null) return { state: filters[names[n]] };
        }
        return null;
    },

    _sortValue: function(filters) {
        var filter = this._findFilter(filters, ["排序", "Sort By", "sort"]);
        var values = ["dd", "da", "ld", "vd"];
        if (!filter) return values[0];
        var value = filter.state;
        if (typeof value === "string" && values.indexOf(value) !== -1) return value;
        var index = Number(value);
        return !isNaN(index) && values[index] ? values[index] : values[0];
    },

    _splitValues: function(value) {
        if (!value) return [];
        var parts = String(value).split(/[\u002c\uFF0C;；|]+/);
        var values = [];
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (part && values.indexOf(part) === -1) values.push(part);
        }
        return values;
    },

    // ======== Manga details ========

    getMangaDetails: function(manga) {
        var id = this._comicId(manga && manga.url);
        if (!id) return manga;
        var response = this._request("/comics/" + encodeURIComponent(id), "GET");
        this._requireApiData(response, "comic", "漫畫詳情");
        var item = response && response.data && response.data.comic;
        if (!item) return manga;

        var result = this._mangaFromItem(item) || SManga.create();
        result.url = "/comic/" + encodeURIComponent(id);
        result.initialized = true;
        if (!result.title) result.title = manga.title || "";
        if (!result.thumbnailUrl) result.thumbnailUrl = manga.thumbnailUrl || null;
        if (!result.author) result.author = manga.author || null;
        if (!result.description) result.description = manga.description || null;
        if (!result.genre || !result.genre.length) result.genre = manga.genre || [];
        if (result.status === SManga.UNKNOWN && manga.status != null) result.status = manga.status;
        return result;
    },

    // ======== Chapters ========

    getChapterList: function(manga) {
        var id = this._comicId(manga && manga.url);
        if (!id) return [];

        var chapters = [];
        var page = 1;
        var pages = 1;
        while (page <= pages && page <= 1000) {
            var response = this._request("/comics/" + encodeURIComponent(id) + "/eps?page=" + page, "GET");
            this._requireApiData(response, "eps", "章節列表");
            var eps = response && response.data && response.data.eps;
            var docs = eps && this._isArray(eps.docs) ? eps.docs : [];
            for (var i = 0; i < docs.length; i++) {
                var item = docs[i] || {};
                var order = Number(item.order);
                if (isNaN(order) || order <= 0) order = chapters.length + 1;
                var chapter = SChapter.create();
                chapter.url = "/comic/" + encodeURIComponent(id) + "/chapter/" + encodeURIComponent(String(order));
                chapter.name = item.title ? String(item.title) : "第" + order + "話";
                chapter.chapterNumber = order;
                chapter.dateUpload = this._dateTimestamp(item.created_at || item.updated_at);
                chapters.push(chapter);
            }
            var reportedPages = Number(eps && eps.pages);
            pages = isNaN(reportedPages) || reportedPages < 1 ?
                (docs.length ? page + 1 : page) : reportedPages;
            if (!docs.length) break;
            page++;
        }

        chapters.sort(function(left, right) {
            return Number(right.chapterNumber || 0) - Number(left.chapterNumber || 0);
        });
        return chapters;
    },

    // ======== Reader pages ========

    getPageList: function(chapter) {
        var parts = this._chapterParts(chapter && chapter.url);
        if (!parts) return [];

        var pages = [];
        var apiPage = 1;
        var apiPages = 1;
        while (apiPage <= apiPages && apiPage <= 1000) {
            var path = "/comics/" + encodeURIComponent(parts.comicId) +
                "/order/" + encodeURIComponent(parts.order) + "/pages?page=" + apiPage;
            var response = this._request(path, "GET");
            this._requireApiData(response, "pages", "漫畫頁面");
            var data = response && response.data;
            var pageData = data && data.pages;
            var docs = pageData && this._isArray(pageData.docs) ? pageData.docs : [];
            for (var i = 0; i < docs.length; i++) {
                var imageUrl = this._mediaUrl(docs[i] && (docs[i].media || docs[i]));
                if (imageUrl) pages.push(new Page(pages.length, "", imageUrl));
            }
            var reportedPages = Number(pageData && pageData.pages);
            apiPages = isNaN(reportedPages) || reportedPages < 1 ?
                (docs.length ? apiPage + 1 : apiPage) : reportedPages;
            if (!docs.length) break;
            apiPage++;
        }
        return pages;
    },

    // ======== Optional filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "排序", values: ["新到舊", "舊到新", "最多愛心", "最多紳士指名次數"], state: 0 },
            { type: "select", name: "分類", values: this._categoryValues.slice(0), state: 0 },
            { type: "text", name: "標籤", state: "" },
            { type: "text", name: "作者", state: "" },
            { type: "text", name: "翻譯團隊", state: "" },
            { type: "text", name: "創作者 ID", state: "" }
        ];
    },

    // ======== API transport ========

    _request: function(path, method, body) {
        method = String(method || "GET").toUpperCase();
        var isLoginRequest = this._isLoginRequest(path);
        if (!isLoginRequest && !this._getToken()) {
            this._requestLogin();
            return null;
        }

        var bases = [this.apiUrl].concat(this.apiMirrors || []);
        var lastError = null;
        for (var i = 0; i < bases.length; i++) {
            try {
                var timestamp = String(Math.floor(new Date().getTime() / 1000));
                var nonce = this._requestNonce();
                var headers = this._requestHeaders(path, method, timestamp, nonce);
                var raw;
                var url = bases[i] + path;
                if (typeof bridge.browserSessionRequest === "function") {
                    raw = bridge.browserSessionRequest(
                        url,
                        method,
                        body == null ? "" : JSON.stringify(body),
                        headers
                    );
                } else if (method === "GET" && typeof bridge.httpGetResponse === "function") {
                    raw = bridge.httpGetResponse(url, headers);
                } else if (method === "GET") {
                    raw = bridge.httpGetWithHeaders(url, headers);
                } else if (typeof bridge.httpPostResponse === "function") {
                    raw = bridge.httpPostResponse(url, body == null ? "" : JSON.stringify(body), headers);
                } else {
                    raw = bridge.httpPost(url, body == null ? "" : JSON.stringify(body), headers);
                }
                if (!raw) {
                    lastError = { transportError: "API 未返回任何回應。" };
                    continue;
                }
                if (raw && typeof raw === "object" && raw.error) {
                    lastError = { transportError: this._safeErrorText(raw.error) };
                    continue;
                }
                var httpStatus = raw && typeof raw === "object" ? Number(raw.status) : 0;
                var text = typeof raw === "string" ? raw :
                    (raw.body != null ? String(raw.body) : String(raw));
                if (!text && httpStatus > 0) {
                    lastError = { transportError: "HTTP " + httpStatus, httpStatus: httpStatus };
                    continue;
                }
                var response;
                try {
                    response = JSON.parse(text);
                } catch (parseError) {
                    lastError = {
                        transportError: this._safeErrorText(text, httpStatus),
                        httpStatus: httpStatus
                    };
                    continue;
                }
                if (response && typeof response === "object" && httpStatus > 0) {
                    response.httpStatus = httpStatus;
                }
                var responseCode = Number(response && response.code);
                var httpSucceeded = !httpStatus || (httpStatus >= 200 && httpStatus < 300);
                if (response && httpSucceeded && (responseCode === 200 || responseCode === 201)) return response;
                if (response && responseCode === 401) {
                    if (!isLoginRequest) {
                        this._setToken("");
                        this._requestLogin("嗶咔瀏覽器工作階段已失效，請重新登入並匯入。");
                    }
                    throw new Error("嗶咔瀏覽器工作階段已失效，請重新登入並匯入。");
                }
                if (response && (!isNaN(responseCode) && responseCode > 0 ||
                    response.message || response.error || response.data)) {
                    throw new Error(this._apiErrorMessage(response, httpStatus));
                }
                lastError = {
                    transportError: "嗶咔 API 回應格式不完整" +
                        (httpStatus > 0 ? "（HTTP " + httpStatus + "）" : "") + "。",
                    httpStatus: httpStatus
                };
            } catch (e) {
                var caught = this._safeErrorText(e && e.message ? e.message : e, httpStatus);
                lastError = {
                    transportError: caught || "嗶咔 API 請求失敗。",
                    httpStatus: httpStatus
                };
                this._log("Bika API request failed for " + bases[i] + path, e);
            }
        }
        throw new Error(this._apiErrorMessage(lastError));
    },

    _isLoginRequest: function(path) {
        return /^\/auth\/sign-in(?:[\/?#]|$)/.test(String(path || ""));
    },

    // New clients turn this into a source-scoped login dialog.  Older
    // clients do not expose the method, so capability detection and a silent
    // catch are both required for backwards-compatible plugin updates.
    _requestLogin: function(reason) {
        try {
            if (typeof bridge !== "undefined" && bridge) {
                if (bridge.system && typeof bridge.system.requestLogin === "function") {
                    bridge.system.requestLogin(reason);
                    return;
                }
                if (typeof bridge.requestLogin === "function") {
                    bridge.requestLogin(reason);
                }
            }
        } catch (e) {}
    },

    _requestHeaders: function(path, method, timestamp, nonce) {
        var headers = {};
        var key;
        for (key in this.headers) headers[key] = this.headers[key];
        for (key in this._appHeaders) headers[key] = this._appHeaders[key];
        headers.time = timestamp;
        headers.nonce = nonce;
        // Pica signs the API path without the leading slash.  The slash is
        // still required in the actual request URL, but including it here
        // makes the server silently return a success envelope without data.
        var signaturePath = String(path || "").replace(/^\/+/, "");
        headers.signature = this._hmacSha256(
            (signaturePath + timestamp + nonce + method + this._signatureSalt).toLowerCase(),
            this._signatureKey
        );
        var token = this._getToken();
        if (token) headers.authorization = token;
        return headers;
    },

    _requestNonce: function() {
        try {
            var stored = bridge.getPreference("nonce");
            if (stored && /^[A-Za-z0-9]{32}$/.test(String(stored))) {
                this._nonce = String(stored);
                return this._nonce;
            }
        } catch (e) {}
        if (this._nonce && /^[a-z0-9]{32}$/.test(this._nonce)) return this._nonce;
        var alphabet = "ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
        var nonce = "";
        for (var i = 0; i < 32; i++) nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        this._nonce = nonce.toLowerCase();
        try { bridge.setPreference("nonce", this._nonce); } catch (e) {}
        return this._nonce;
    },

    _requireApiData: function(response, field, operation) {
        var data = response && response.data;
        if (data && data[field] != null) return data[field];
        if (response && (Number(response.code) !== 200 && Number(response.code) !== 201 ||
            response.message || response.error || response.transportError)) {
            throw new Error(this._apiErrorMessage(response, response.httpStatus));
        }
        throw new Error("嗶咔 API 成功回應缺少" + operation + "資料，請重新匯入瀏覽器工作階段後再試。");
    },

    _apiErrorMessage: function(response, httpStatus) {
        if (!response || typeof response !== "object") return "嗶咔 API 請求失敗。";
        var data = response.data && typeof response.data === "object" ? response.data : null;
        var status = Number(httpStatus || response.httpStatus);
        var candidates = [
            response.message, response.detail, response.error, response.transportError,
            data && data.message, data && data.detail, data && data.error
        ];
        for (var i = 0; i < candidates.length; i++) {
            var message = this._safeErrorText(candidates[i], status);
            if (message) return message;
        }
        var code = Number(response.code);
        if (!isNaN(code) && code > 0) {
            return "嗶咔 API 錯誤代碼：" + String(code).slice(0, 40) +
                (!isNaN(status) && status > 0 && status !== code ? "（HTTP " + status + "）" : "") + "。";
        }
        if (!isNaN(status) && status > 0) return "嗶咔 API HTTP " + status + "。";
        return "嗶咔 API 請求失敗。";
    },

    _safeErrorText: function(value, httpStatus) {
        if (value == null) return "";
        var original = String(value);
        var status = Number(httpStatus);
        var statusLabel = !isNaN(status) && status > 0 ? "HTTP " + String(status).slice(0, 3) : "";
        if (/too many requests/i.test(original)) {
            if (status === 400) {
                return "嗶咔 API 以 HTTP 400 回傳限流訊息（too many requests）。這不是 Cloudflare Worker Proxy 的 HTTP 429；請稍候後再試。";
            }
            return "嗶咔 API 回傳請求過於頻繁" +
                (statusLabel ? "（" + statusLabel + "：too many requests）" : "（too many requests）") +
                "。請稍候後再試。";
        }
        if (/NSURLErrorDomain[\s\S]*Code=-1003|specified hostname could not be found/i.test(original)) {
            return "找不到嗶咔 API 主機（DNS -1003）。請檢查網路或 DNS 後再試。";
        }
        if (/<!doctype\s+html|<html\b/i.test(original)) {
            return "嗶咔 API 返回了網頁而非 JSON" +
                (statusLabel ? "（" + statusLabel + "）" : "") + "。";
        }
        var message = original
            .replace(/[\u0000-\u001f\u007f]+/g, " ")
            .replace(/\s+/g, " ")
            .replace(/\b(authorization|cookie|set-cookie|password)\s*[:=]\s*[^,;\s]+/gi, "$1=[redacted]")
            .trim();
        return message.slice(0, 200);
    },

    _getToken: function() {
        try {
            return bridge.getPreference("token") || "";
        } catch (e) {
            return this._token || "";
        }
    },

    _setToken: function(token) {
        this._token = token || "";
        try {
            bridge.setPreference("token", this._token);
        } catch (e) {}
    },

    // ======== Data helpers ========

    _mediaUrl: function(media) {
        if (!media) return "";
        if (typeof media === "string") return this._fixUrl(media);
        var direct = media.url || media.proxyUrl || media.src;
        if (direct) return this._fixUrl(String(direct));
        var fileServer = media.fileServer || media.server || "";
        var path = media.path || "";
        if (!path) return "";
        if (/^https?:\/\//i.test(String(path))) return String(path);
        if (!fileServer || fileServer === "local") return "";
        fileServer = String(fileServer).replace(/\/$/, "");
        if (fileServer.indexOf("/static") === -1) fileServer += "/static";
        return this._fixUrl(fileServer + "/" + String(path).replace(/^\//, ""));
    },

    _fixUrl: function(value) {
        var url = String(value || "");
        if (!url) return "";
        if (/^https?:\/\//i.test(url)) return url;
        if (url.indexOf("//") === 0) return "https:" + url;
        return this.baseUrl + (url.charAt(0) === "/" ? url : "/" + url);
    },

    _authorName: function(value) {
        if (!value) return null;
        if (typeof value === "string") return value;
        if (this._isArray(value)) {
            var names = [];
            for (var i = 0; i < value.length; i++) {
                var name = this._authorName(value[i]);
                if (name && names.indexOf(name) === -1) names.push(name);
            }
            return names.length ? names.join("、") : null;
        }
        return value.name ? String(value.name) : null;
    },

    _genres: function(item) {
        var values = [];
        var fields = [item && item.categories, item && item.tags];
        for (var i = 0; i < fields.length; i++) {
            var list = fields[i];
            if (!this._isArray(list)) continue;
            for (var j = 0; j < list.length; j++) {
                var value = typeof list[j] === "string" ? list[j] : (list[j] && (list[j].title || list[j].name));
                if (value && values.indexOf(String(value)) === -1) values.push(String(value));
            }
        }
        return values;
    },

    _comicId: function(url) {
        var match = String(url || "").match(/\/comic\/([^/]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    },

    _chapterParts: function(url) {
        var text = String(url || "");
        var match = text.match(/\/comic\/([^/]+)\/chapter\/([^/]+)/);
        if (!match) match = text.match(/\/comic\/reader\/([^/]+)\/([^/]+)/);
        if (!match) return null;
        return { comicId: decodeURIComponent(match[1]), order: decodeURIComponent(match[2]) };
    },

    _dateTimestamp: function(value) {
        if (!value) return 0;
        var timestamp = new Date(String(value)).getTime();
        if (isNaN(timestamp)) timestamp = new Date(String(value).replace(/-/g, "/")).getTime();
        return isNaN(timestamp) ? 0 : timestamp;
    },

    _pageNumber: function(page) {
        var number = Number(page);
        if (isNaN(number) || number < 0) return 1;
        // Shinsou catalogue pages are zero-based, while Bika is one-based.
        return Math.floor(number) + 1;
    },

    _isArray: function(value) {
        return Object.prototype.toString.call(value) === "[object Array]";
    },

    _log: function(message, error) {
        try {
            if (bridge.log) bridge.log(String(message) + (error && error.message ? ": " + error.message : ""));
        } catch (e) {}
    },

    // ======== SHA-256 / HMAC-SHA-256 ========

    _hmacSha256: function(message, key) {
        var keyBytes = this._utf8Bytes(key);
        if (keyBytes.length > 64) keyBytes = this._sha256Bytes(keyBytes);
        while (keyBytes.length < 64) keyBytes.push(0);
        var inner = [], outer = [];
        for (var i = 0; i < 64; i++) {
            inner.push(keyBytes[i] ^ 54);
            outer.push(keyBytes[i] ^ 92);
        }
        var innerHash = this._sha256Bytes(inner.concat(this._utf8Bytes(message)));
        return this._hex(this._sha256Bytes(outer.concat(innerHash)));
    },

    _sha256Bytes: function(input) {
        var K = [
            1116352408, 1899447441, 3049323471, 3921009573, 961987163, 1508970993, 2453635748, 2870763221,
            3624381080, 310598401, 607225278, 1426881987, 1925078388, 2162078206, 2614888103, 3248222580,
            3835390401, 4022224774, 264347078, 604807628, 770255983, 1249150122, 1555081692, 1996064986,
            2554220882, 2821834349, 2952996808, 3210313671, 3336571891, 3584528711, 113926993, 338241895,
            666307205, 773529912, 1294757372, 1396182291, 1695183700, 1986661051, 2177026350, 2456956037,
            2730485921, 2820302411, 3259730800, 3345764771, 3516065817, 3600352804, 4094571909, 275423344,
            430227734, 506948616, 659060556, 883997877, 958139571, 1322822218, 1537002063, 1747873779,
            1955562222, 2024104815, 2227730452, 2361852424, 2428436474, 2756734187, 3204031479, 3329325298
        ];
        var H = [1779033703, 3144134277, 1013904242, 2773480762, 1359893119, 2600822924, 528734635, 1541459225];
        var bytes = input.slice(0);
        var bitLength = bytes.length * 8;
        bytes.push(128);
        while ((bytes.length % 64) !== 56) bytes.push(0);
        bytes.push(0, 0, 0, 0, (bitLength >>> 24) & 255, (bitLength >>> 16) & 255,
            (bitLength >>> 8) & 255, bitLength & 255);
        for (var offset = 0; offset < bytes.length; offset += 64) {
            var W = [];
            for (var i = 0; i < 16; i++) {
                var j = offset + i * 4;
                W[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
            }
            for (var t = 16; t < 64; t++) {
                var s0 = this._rotr(W[t - 15], 7) ^ this._rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
                var s1 = this._rotr(W[t - 2], 17) ^ this._rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
                W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
            }
            var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
            for (var round = 0; round < 64; round++) {
                var S1 = this._rotr(e, 6) ^ this._rotr(e, 11) ^ this._rotr(e, 25);
                var ch = (e & f) ^ (~e & g);
                var temp1 = (h + S1 + ch + K[round] + W[round]) >>> 0;
                var S0 = this._rotr(a, 2) ^ this._rotr(a, 13) ^ this._rotr(a, 22);
                var maj = (a & b) ^ (a & c) ^ (b & c);
                var temp2 = (S0 + maj) >>> 0;
                h = g; g = f; f = e; e = (d + temp1) >>> 0;
                d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
            }
            H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
            H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
            H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
        }
        var output = [];
        for (var n = 0; n < H.length; n++) output.push((H[n] >>> 24) & 255, (H[n] >>> 16) & 255,
            (H[n] >>> 8) & 255, H[n] & 255);
        return output;
    },

    _utf8Bytes: function(value) {
        var text = String(value || "");
        var bytes = [];
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code < 128) bytes.push(code);
            else if (code < 2048) bytes.push(192 | (code >> 6), 128 | (code & 63));
            else if (code >= 55296 && code <= 56319 && i + 1 < text.length) {
                var next = text.charCodeAt(++i);
                var point = 65536 + ((code - 55296) << 10) + (next - 56320);
                bytes.push(240 | (point >> 18), 128 | ((point >> 12) & 63), 128 | ((point >> 6) & 63), 128 | (point & 63));
            } else bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
        }
        return bytes;
    },

    _rotr: function(value, bits) {
        return (value >>> bits) | (value << (32 - bits));
    },

    _hex: function(bytes) {
        var output = "";
        for (var i = 0; i < bytes.length; i++) output += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
        return output;
    }
};
