/*
 * Shinsou extension content v2 executable artifact.
 *
 * This is an independently hashed migration artifact. The legacy source remains in
 * plugins/zh.manhuaren.js; this file carries the v2 declaration consumed by the host admission layer.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"zh.manhuaren","contentType":"manga","contentKinds":["IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};
// 漫画人 (Manhuaren) Plugin for Shinsou
// Crawls https://www.manhuaren.com

var source = {
    baseUrl: "https://www.manhuaren.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://www.manhuaren.com/",
        "Accept-Language": "zh-CN,zh;q=0.9,zh-TW;q=0.8,en;q=0.7",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    },

    // ======== Popular / Latest ========

    getPopularManga: function(page) {
        return this._getListPage("", page);
    },

    getLatestUpdates: function(page) {
        return this._getListPage("s2", page);
    },

    _getListPage: function(pathParts, page) {
        var url = this._listUrl(pathParts, page);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    _listUrl: function(pathParts, page) {
        var parts = pathParts ? pathParts.split("-") : [];
        var pageNumber = page + 1;
        if (pageNumber > 1) parts.push("p" + pageNumber);
        return this.baseUrl + "/manhua-list" + (parts.length ? "-" + parts.join("-") : "") + "/";
    },

    // ======== Search / Filters ========

    getSearchManga: function(page, query, filters) {
        var keyword = query ? String(query).trim() : "";
        if (keyword) return this._searchByKeyword(page, keyword);

        var sort = "";
        var status = "";

        if (filters && filters.length) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (!filter || filter.type !== "select") continue;

                if (filter.name === "排序") {
                    var sorts = ["", "s2", "s18"];
                    sort = sorts[filter.state] || "";
                } else if (filter.name === "狀態") {
                    var statuses = ["", "st1", "st2"];
                    status = statuses[filter.state] || "";
                }
            }
        }

        var parts = [];
        if (status) parts.push(status);
        if (sort) parts.push(sort);
        return this._getListPage(parts.join("-"), page);
    },

    _searchByKeyword: function(page, keyword) {
        var body = "t=7&pageindex=" + (page + 1)
            + "&f=0&title=" + encodeURIComponent(keyword);
        var jsonText = bridge.httpPost(
            this.baseUrl + "/search/pagerdata.ashx",
            body,
            {
                "Referer": this.baseUrl + "/search/?title=" + encodeURIComponent(keyword) + "&language=1",
                "X-Requested-With": "XMLHttpRequest",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            }
        );

        if (!jsonText || jsonText.error) return new MangasPage([], false);

        try {
            var data = JSON.parse(jsonText);
            var mangas = [];
            for (var i = 0; i < data.length; i++) {
                var item = data[i] || {};
                var manga = SManga.create();
                manga.url = this._cleanMangaUrl(item.Url || "");
                manga.title = item.Title || "";
                manga.thumbnailUrl = item.BigPic || item.Pic || "";
                manga.author = item.Author && item.Author.join ? item.Author.join(", ") : "";
                manga.description = item.Content || "";
                manga.genre = item.Categorys ? String(item.Categorys).split(",") : null;
                manga.status = this._statusFromText(item.Status || "");
                if (manga.url && manga.title) mangas.push(manga);
            }
            return new MangasPage(mangas, data.length >= 10);
        } catch (e) {
            bridge.log("Manhuaren search parse error: " + e);
            return new MangasPage([], false);
        }
    },

    // ======== List Parser ========

    _parseList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];
        var seen = {};

        var items = doc.select("ul.manga-list-2 > li");
        if (items.isEmpty()) items = doc.select("ul.book-list > li");

        items.forEach(function(item) {
            try {
                var link = item.selectFirst(".manga-list-2-title a, .book-list-cover a[href*='/manhua-'], a[href*='/manhua-']");
                if (!link) return;

                var manga = SManga.create();
                manga.url = this._cleanMangaUrl(link.attr("href"));

                var title = item.selectFirst(".manga-list-2-title, .book-list-info-title");
                manga.title = title ? title.text().trim() : (link.attr("title") || "").trim();

                var image = item.selectFirst(".manga-list-2-cover img, .book-list-cover img, img");
                if (image) manga.thumbnailUrl = this._imageSrc(image);

                var description = item.selectFirst(".book-list-info-desc");
                if (description) manga.description = description.text().trim();

                var genres = [];
                var genreEls = item.select(".book-list-info-bottom-item");
                genreEls.forEach(function(el) {
                    var text = el.text().trim();
                    if (text) genres.push(text);
                });
                if (genres.length) manga.genre = genres;

                var status = item.selectFirst(".book-list-info-bottom-right-font");
                if (status) manga.status = this._statusFromText(status.text());

                if (manga.url && manga.title && !seen[manga.url]) {
                    seen[manga.url] = true;
                    mangas.push(manga);
                }
            } catch (e) {
                bridge.log("Manhuaren list parse error: " + e);
            }
        }.bind(this));

        bridge.domReleaseAll();
        return new MangasPage(mangas, mangas.length >= 21);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var html = bridge.httpGetWithHeaders(this._absoluteUrl(manga.url), this.headers);
        if (!html || html.error) return manga;

        var doc = Jsoup.parse(html, this.baseUrl);
        var result = SManga.create();
        result.url = this._cleanMangaUrl(manga.url);
        result.initialized = true;

        var title = doc.selectFirst(".detail-main-info-title");
        result.title = title ? title.text().trim() : (manga.title || "");

        var cover = doc.selectFirst(".detail-main-cover img, .detail-main-bg");
        result.thumbnailUrl = cover ? this._imageSrc(cover) : (manga.thumbnailUrl || "");

        var authors = [];
        var authorEls = doc.select(".detail-main-info-author a");
        authorEls.forEach(function(el) {
            var name = el.text().trim();
            if (name) authors.push(name);
        });
        if (authors.length) result.author = authors.join(", ");

        var genres = [];
        var genreEls = doc.select(".detail-main-info-class a, .detail-main-info-class span");
        genreEls.forEach(function(el) {
            var name = el.text().trim();
            if (name && name.indexOf("漫画") === -1 && genres.indexOf(name) === -1) genres.push(name);
        });
        if (genres.length) result.genre = genres;

        var description = doc.selectFirst(".detail-desc");
        if (description) result.description = description.text().trim();

        var status = doc.selectFirst(".detail-list-title-1");
        result.status = this._statusFromText(status ? status.text() : "");
        if (result.status === SManga.UNKNOWN) {
            result.status = this._statusFromText(doc.select(".detail-list-title-1").text());
        }

        bridge.domReleaseAll();
        return result;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var html = bridge.httpGetWithHeaders(this._absoluteUrl(manga.url), this.headers);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var chapters = [];
        var seen = {};
        var chapterEls = doc.select("a.chapteritem[href^='/m']");

        chapterEls.forEach(function(el) {
            try {
                var url = el.attr("href");
                if (!url || seen[url]) return;
                seen[url] = true;

                var chapter = SChapter.create();
                chapter.url = url;

                var name = el.text().trim();
                var subtitle = el.attr("title").trim();
                chapter.name = name + (subtitle && subtitle !== name ? "：" + subtitle : "");
                chapter.chapterNumber = this._chapterNumber(name);

                if (chapter.name) chapters.push(chapter);
            } catch (e) {
                bridge.log("Manhuaren chapter parse error: " + e);
            }
        }.bind(this));

        bridge.domReleaseAll();
        return chapters;
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var url = this._absoluteUrl(chapter.url);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var scripts = doc.select("script");
        var imageUrls = [];

        scripts.forEach(function(script) {
            if (imageUrls.length) return;
            var text = script.html();
            if (text.indexOf("newImgs") === -1) return;

            var unpacked = this._unpackScript(text);
            imageUrls = this._extractImageArray(unpacked);
        }.bind(this));

        bridge.domReleaseAll();

        var pages = [];
        for (var i = 0; i < imageUrls.length; i++) {
            // The image CDN validates the reader URL, so attach a per-page Referer.
            pages.push(new Page(i, "", this._withReferer(imageUrls[i], url)));
        }
        return pages;
    },

    _unpackScript: function(script) {
        var packed = script.match(/\}\s*\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\.|[^'\\])*)'\.split\s*\(\s*'((?:\\.|[^'\\])*)'\s*\)/);
        if (!packed) return script;

        var payload = packed[1]
            .replace(/\\'/g, "'")
            .replace(/\\\//g, "/")
            .replace(/\\\\/g, "\\");
        var radix = parseInt(packed[2]);
        var count = parseInt(packed[3]);
        var keywordText = packed[4]
            .replace(/\\'/g, "'")
            .replace(/\\\//g, "/")
            .replace(/\\\\/g, "\\");
        var separator = packed[5]
            .replace(/\\'/g, "'")
            .replace(/\\\//g, "/")
            .replace(/\\\\/g, "\\");
        var keywords = keywordText.split(separator);

        while (count--) {
            if (keywords[count]) {
                var pattern = new RegExp("\\b" + this._encodePackedNumber(count, radix) + "\\b", "g");
                payload = payload.replace(pattern, keywords[count]);
            }
        }
        return payload;
    },

    _extractImageArray: function(script) {
        var match = script.match(/newImgs\s*=\s*\[([\s\S]*?)\]/);
        if (!match) return [];

        var urls = [];
        var quoted = /['"](https?:\\?\/\\?\/[^'"]+)['"]/g;
        var item;
        while ((item = quoted.exec(match[1])) !== null) {
            var url = item[1]
                .replace(/\\\//g, "/")
                .replace(/&amp;/g, "&");
            if (urls.indexOf(url) === -1) urls.push(url);
        }
        return urls;
    },

    _encodePackedNumber: function(number, radix) {
        var chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (number === 0) return "0";
        var value = "";
        while (number > 0) {
            value = chars.charAt(number % radix) + value;
            number = Math.floor(number / radix);
        }
        return value;
    },

    // ======== Helpers / Filters ========

    _chapterNumber: function(name) {
        var match = String(name || "").match(/第\s*(\d+(?:\.\d+)?)/);
        if (!match) match = String(name || "").match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : -1;
    },

    _statusFromText: function(text) {
        text = String(text || "");
        if (text.indexOf("完结") !== -1 || text.indexOf("完結") !== -1) return SManga.COMPLETED;
        if (text.indexOf("连载") !== -1 || text.indexOf("連載") !== -1) return SManga.ONGOING;
        return SManga.UNKNOWN;
    },

    _cleanMangaUrl: function(url) {
        url = String(url || "").replace(/&amp;/g, "&");
        var query = url.indexOf("?");
        if (query !== -1) url = url.substring(0, query);
        if (url.indexOf(this.baseUrl) === 0) url = url.substring(this.baseUrl.length);
        if (url && url.charAt(0) !== "/") url = "/" + url;
        return url;
    },

    _absoluteUrl: function(url) {
        url = String(url || "");
        if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
        return this.baseUrl + (url.charAt(0) === "/" ? url : "/" + url);
    },

    _imageSrc: function(image) {
        if (!image) return "";
        var url = image.attr("data-original") || image.attr("data-src") || image.attr("src") || "";
        if (url.indexOf("//") === 0) return "https:" + url;
        return url;
    },

    _withReferer: function(imageUrl, referer) {
        var separator = imageUrl.indexOf("#") === -1 ? "#" : "&";
        return imageUrl + separator + "Referer=" + encodeURIComponent(referer);
    },

    getFilterList: function() {
        return [
            { type: "select", name: "排序", values: ["最熱門", "最近更新", "最新上架"], state: 0 },
            { type: "select", name: "狀態", values: ["全部", "連載中", "已完結"], state: 0 }
        ];
    }
};

// Expose only bounded, host-audited v2 metadata; executable calls still cross the legacy adapter.
if (typeof source === "object" && source) {
    source.v2 = __shinsouExtensionV2;
}
