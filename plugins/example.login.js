// ============================================================
// 範例插件：展示登入、Cookie、偏好設定等進階 API
// Example Plugin: demonstrates login, cookies, preferences
// ============================================================
//
// 此檔案僅作開發參考，不是可用的漫畫來源。
// This file is for development reference only; it is not a functional source.

var source = {
    baseUrl: "https://example.com",
    supportsLatest: true,

    // 宣告支援登入功能，App 設定畫面會顯示帳號密碼欄位與登入按鈕
    supportsLogin: true,

    // 自訂 HTTP 標頭（所有請求預設攜帶）
    headers: {
        "Referer": "https://example.com/",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
    },

    // ======== 登入 / 登出 ========

    /**
     * 當使用者在 App 設定畫面按下「登入」時呼叫。
     * @param {string} username - 使用者名稱
     * @param {string} password - 密碼
     * @returns {boolean} true = 登入成功, false = 失敗
     *
     * 說明：
     * - bridge.httpPost() 發出的請求會自動攜帶此來源的 cookies
     * - 伺服器回應的 Set-Cookie 會自動儲存到此來源的 cookie jar
     * - 登入成功後 App 會自動呼叫 bridge.setCredential() 儲存帳密
     */
    login: function(username, password) {
        var body = "username=" + encodeURIComponent(username)
                 + "&password=" + encodeURIComponent(password);

        var result = bridge.httpPost(
            this.baseUrl + "/api/login",
            body,
            { "Content-Type": "application/x-www-form-urlencoded" }
        );

        if (!result || result.error) return false;

        try {
            var json = JSON.parse(result);
            if (json.success) {
                // 伺服器回應的 Set-Cookie 已自動儲存，不需手動處理
                // 但如果需要手動設定 cookie（例如從 JSON body 取得 token）：
                if (json.token) {
                    bridge.setCookie(
                        "auth_token",       // cookie 名稱
                        json.token,         // cookie 值
                        ".example.com",     // 網域
                        "/",                // 路徑
                        86400 * 30          // 有效秒數（30 天），0 = session cookie
                    );
                }
                return true;
            }
        } catch(e) {
            bridge.log("Login parse error: " + e);
        }
        return false;
    },

    /**
     * 當使用者按下「登出」時呼叫。
     * App 會自動呼叫 bridge.clearCredential() 清除帳密。
     */
    logout: function() {
        // 清除此來源的所有 cookies
        bridge.clearCookies();
        bridge.log("已登出");
    },

    // ======== Cookie API 範例 ========

    /**
     * 展示所有可用的 Cookie API。
     */
    _cookieExamples: function() {
        // 取得特定 cookie 值
        var token = bridge.getCookie("auth_token", this.baseUrl);
        bridge.log("auth_token = " + token);

        // 取得某 URL 下所有 cookies（回傳 {name: value, ...} 物件）
        var all = bridge.getCookies(this.baseUrl);
        bridge.log("session_id = " + all["session_id"]);

        // 手動設定 cookie
        bridge.setCookie(
            "cf_clearance",         // 名稱
            "abc123def456",         // 值
            ".example.com",         // 網域（通常以 . 開頭以涵蓋子域名）
            "/",                    // 路徑
            0                       // 有效秒數，0 = session cookie
        );

        // 刪除特定 cookie
        bridge.deleteCookie("auth_token", ".example.com");

        // 清除此來源所有 cookies
        bridge.clearCookies();
    },

    // ======== 偏好設定 API 範例 ========

    /**
     * 展示偏好設定 API（存取 UserDefaults）。
     * 使用者可在 App 設定畫面的「偏好設定」區塊修改這些值。
     */
    _preferenceExamples: function() {
        // 讀取偏好設定（key 前面會自動加上 source.<id>. 前綴）
        var lang = bridge.getPreference("language");
        if (!lang) {
            // 設定預設值
            bridge.setPreference("language", "zh-TW");
        }

        var showNsfw = bridge.getPreference("show_nsfw");
        bridge.log("Language: " + lang + ", NSFW: " + showNsfw);
    },

    // ======== 憑證 API 範例 ========

    /**
     * 展示憑證存取 API。
     * 即使插件不宣告 supportsLogin，使用者也可在設定畫面儲存帳密，
     * 插件可透過這些 API 讀取。
     */
    _credentialExamples: function() {
        // 檢查是否有已儲存的帳密
        if (bridge.hasCredential()) {
            var user = bridge.getCredentialUsername();
            var pass = bridge.getCredentialPassword();
            bridge.log("Logged in as: " + user);

            // 手動設定帳密（通常不需要，App 登入成功後會自動儲存）
            // bridge.setCredential("newuser", "newpass");

            // 清除帳密
            // bridge.clearCredential();
        }
    },

    // ======== 在請求中使用登入狀態 ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/popular?page=" + page;

        // 檢查是否已登入，決定 URL
        if (bridge.hasCredential()) {
            url = this.baseUrl + "/popular?page=" + page + "&member=1";
        }

        // bridge.httpGet 會自動攜帶此來源的 cookies（包含登入時取得的 session）
        var html = bridge.httpGet(url);
        if (!html || html.error) return new MangasPage([], false);

        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];

        doc.select(".manga-item").forEach(function(item) {
            var manga = SManga.create();
            var link = item.selectFirst("a.title");
            if (!link) return;

            manga.url = link.attr("href");
            manga.title = link.text().trim();

            var img = item.selectFirst("img");
            if (img) {
                manga.thumbnailUrl = img.attr("data-src") || img.attr("src");
            }

            mangas.push(manga);
        });

        var hasNext = !doc.select("a.next-page").isEmpty();
        bridge.domReleaseAll();
        return new MangasPage(mangas, hasNext);
    },

    getLatestUpdates: function(page) {
        return this.getPopularManga(page);
    },

    getSearchManga: function(page, query, filters) {
        var url = this.baseUrl + "/search?q=" + encodeURIComponent(query) + "&page=" + page;
        var html = bridge.httpGet(url);
        if (!html || html.error) return new MangasPage([], false);

        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];
        doc.select(".manga-item").forEach(function(item) {
            var manga = SManga.create();
            var link = item.selectFirst("a.title");
            if (!link) return;
            manga.url = link.attr("href");
            manga.title = link.text().trim();
            mangas.push(manga);
        });

        bridge.domReleaseAll();
        return new MangasPage(mangas, false);
    },

    getMangaDetails: function(manga) {
        var url = manga.url.indexOf("http") === 0 ? manga.url : this.baseUrl + manga.url;
        var html = bridge.httpGet(url);
        if (!html || html.error) return manga;

        var doc = Jsoup.parse(html, this.baseUrl);
        var result = SManga.create();
        result.url = manga.url;
        result.initialized = true;
        result.title = doc.selectFirst("h1").text();
        result.author = doc.selectFirst(".author").text();
        result.description = doc.selectFirst(".synopsis").text();
        result.thumbnailUrl = doc.selectFirst(".cover img").attr("src");

        bridge.domReleaseAll();
        return result;
    },

    getChapterList: function(manga) {
        var url = manga.url.indexOf("http") === 0 ? manga.url : this.baseUrl + manga.url;
        var html = bridge.httpGet(url);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var chapters = [];
        doc.select(".chapter-list a").forEach(function(el) {
            var ch = SChapter.create();
            ch.url = el.attr("href");
            ch.name = el.text().trim();
            chapters.push(ch);
        });

        bridge.domReleaseAll();
        return chapters;
    },

    getPageList: function(chapter) {
        var url = chapter.url.indexOf("http") === 0 ? chapter.url : this.baseUrl + chapter.url;
        var html = bridge.httpGet(url);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var pages = [];
        doc.select(".page-img img").forEach(function(img, i) {
            pages.push(new Page(i, "", img.attr("data-src") || img.attr("src")));
        });

        bridge.domReleaseAll();
        return pages;
    },

    getFilterList: function() {
        return [];
    }
};
