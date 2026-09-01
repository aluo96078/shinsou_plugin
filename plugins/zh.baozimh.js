/*
 * Shinsou extension content v2 executable artifact.
 *
 * This is an independently hashed migration artifact. The legacy source remains in
 * plugins/zh.baozimh.js; this file carries the v2 declaration consumed by the host admission layer.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"zh.baozimh","contentType":"manga","contentKinds":["IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};
// 包子漫画 Plugin for Mihon iOS
// Crawls https://cn.baozimh.com (and mirrors)

var source = {
    baseUrl: "https://www.baozimh.com",
    // The Android app opens chapter pages on app.baozimh.com. appgb is used
    // by the app for static assets and remains as a mirror fallback.
    appBaseUrl: "https://app.baozimh.com",
    appMirrorBaseUrl: "https://appgb.baozimh.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://www.baozimh.com/",
        "Origin": "https://www.baozimh.com",
        "Accept": "*/*",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
    },
    appHeaders: {
        "Referer": "https://app.baozimh.com/",
        "Origin": "https://app.baozimh.com",
        "Accept": "*/*",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/classify?type=all&region=all&state=all&filter=*&page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/classify?type=all&region=all&state=all&filter=*&page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url;
        if (query && query.trim()) {
            url = this.baseUrl + "/search?q=" + encodeURIComponent(query.trim());
        } else {
            // Use classify with filter params
            var type = "all";
            var region = "all";
            var state = "all";

            if (filters && filters.length > 0) {
                for (var i = 0; i < filters.length; i++) {
                    var f = filters[i];
                    if (!f || !f.type) continue;

                    if (f.type === "select" && f.name === "Type") {
                        var types = ["all", "lianzan", "wanjie"];
                        type = types[f.state] || "all";
                    }
                    if (f.type === "select" && f.name === "Region") {
                        var regions = ["all", "cn", "jp", "kr", "en"];
                        region = regions[f.state] || "all";
                    }
                    if (f.type === "select" && f.name === "Status") {
                        var states = ["all", "serial", "pub"];
                        state = states[f.state] || "all";
                    }
                }
            }

            url = this.baseUrl + "/classify?type=" + type + "&region=" + region + "&state=" + state + "&filter=*&page=" + (page + 1);
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== List Parser ========

    _parseList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];

        // Main manga cards
        var items = doc.select("div.comics-card");

        if (!items.isEmpty()) {
            items.forEach(function(item) {
                try {
                    var manga = SManga.create();

                    var link = item.selectFirst("a.comics-card__poster, a[href*='/comic/']");
                    if (link) {
                        manga.url = link.attr("href");
                    }

                    var img = item.selectFirst("a.comics-card__poster amp-img[src], a.comics-card__poster img, amp-img[src], img");
                    if (img) {
                        manga.thumbnailUrl = this._fixUrl(this._imageSrc(img));
                    }

                    var titleEl = item.selectFirst(".comics-card__title");
                    manga.title = titleEl ? titleEl.text().trim() : "";
                    if (!manga.title && link) {
                        manga.title = link.attr("title") || link.attr("aria-label") || "";
                    }

                    if (manga.url && manga.title) {
                        mangas.push(manga);
                    }
                } catch(e) {
                    bridge.log("Baozi parse error: " + e);
                }
            }.bind(this));
        }

        // Fallback: poster anchors without a parent card
        if (mangas.length === 0) {
            var posters = doc.select("a.comics-card__poster[href*='/comic/'], a[href*='/comic/']");
            posters.forEach(function(link) {
                try {
                    var manga = SManga.create();
                    manga.url = link.attr("href");
                    manga.title = link.attr("title") || link.attr("aria-label") || link.text().trim();

                    var img = link.selectFirst("amp-img[src], img");
                    if (img) {
                        manga.thumbnailUrl = this._fixUrl(this._imageSrc(img));
                    }

                    if (manga.url && manga.title) {
                        mangas.push(manga);
                    }
                } catch(e) {}
            }.bind(this));
        }

        // Pagination
        var hasNext = false;
        var nextBtn = doc.selectFirst("a.next, .pagination .next");
        if (nextBtn) {
            hasNext = true;
        }
        // Also check if we have enough items (usually 36 per page)
        if (mangas.length >= 36) {
            hasNext = true;
        }

        bridge.domReleaseAll();
        return new MangasPage(mangas, hasNext);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var url = manga.url;
        if (url.indexOf("http") !== 0) {
            url = this.baseUrl + url;
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return manga;

        var doc = Jsoup.parse(html, this.baseUrl);
        var result = SManga.create();
        result.url = manga.url;
        result.initialized = true;

        // Title
        var titleEl = doc.selectFirst(".comics-detail__title");
        result.title = titleEl ? titleEl.text() : manga.title || "";

        // Author
        var authorEl = doc.selectFirst(".comics-detail__author");
        if (authorEl) {
            result.author = authorEl.text().trim();
        }

        // Description
        var descEl = doc.selectFirst(".comics-detail__desc");
        if (descEl) {
            result.description = descEl.text().trim();
        }

        // Cover
        var coverMeta = doc.selectFirst("meta[property='og:image'], meta[name='og:image']");
        if (coverMeta) {
            result.thumbnailUrl = this._fixUrl(coverMeta.attr("content"));
        }
        if (!result.thumbnailUrl) {
            var coverImg = doc.selectFirst(".comics-detail__cover amp-img[src], .comics-detail__cover img, .l-content amp-img[src], .l-content img");
            if (coverImg) {
                result.thumbnailUrl = this._fixUrl(this._imageSrc(coverImg));
            }
        }

        // Genres/Tags
        var genres = [];
        var tagEls = doc.select(".tag-list a, .comics-detail__tag span");
        tagEls.forEach(function(tag) {
            var text = tag.text().trim();
            if (text) genres.push(text);
        });
        result.genre = genres.length > 0 ? genres : null;

        // Status
        var statusText = "";
        var statusEl = doc.selectFirst(".comics-detail__update, .tag-list .tag");
        if (statusEl) {
            statusText = statusEl.text();
        }
        if (statusText.indexOf("完结") !== -1 || statusText.indexOf("完結") !== -1) {
            result.status = SManga.COMPLETED;
        } else if (statusText.indexOf("连载") !== -1 || statusText.indexOf("連載") !== -1) {
            result.status = SManga.ONGOING;
        } else {
            result.status = SManga.UNKNOWN;
        }

        bridge.domReleaseAll();
        return result;
    },

    _imageSrc: function(img) {
        if (!img) return "";
        return img.attr("data-original") || img.attr("data-src") || img.attr("src") || "";
    },

    _fixUrl: function(url) {
        if (!url) return "";
        url = String(url).replace(/&amp;/g, "&").trim();
        if (url.indexOf("//") === 0) return "https:" + url;
        if (url.indexOf("/") === 0) return this.baseUrl + url;
        return url;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var url = manga.url;
        if (url.indexOf("http") !== 0) {
            url = this.baseUrl + url;
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var chapters = [];

        // Chapter links
        var chapterEls = doc.select("#chapter-items a, #chapters_other_list a, .comics-chapters a, a.comics-chapters__item, a[href*='/chapter/']");

        var chapterNum = chapterEls.size();
        chapterEls.forEach(function(el) {
            try {
                var chapter = SChapter.create();
                chapter.url = el.attr("href");
                chapter.name = el.text().trim();
                chapter.chapterNumber = chapterNum;
                chapterNum--;

                if (chapter.url && chapter.name) {
                    chapters.push(chapter);
                }
            } catch(e) {
                bridge.log("Baozi chapter error: " + e);
            }
        });

        bridge.domReleaseAll();
        return chapters;
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var info = this._chapterInfo(chapter.url);
        var pages = [];

        // The public chapter route currently redirects to twmanga.com, whose
        // AMP reader contains the real bzcdn.net image URLs. Resolve that
        // route first: the app hosts are often protected by Cloudflare and
        // otherwise make every chapter wait through several failed requests.
        var webUrls = this._webChapterUrls(chapter.url, info);
        for (var w = 0; w < webUrls.length; w++) {
            var html = bridge.httpGetWithHeaders(webUrls[w], this.headers);
            if (!html || html.error || this._isBlockedResponse(html)) continue;

            pages = this._parsePageList(html, info ? info.slug : "");
            if (pages.length > 0) {
                bridge.log("Baozi: using web chapter source for " + (info ? info.slug : "unknown chapter"));
                return pages;
            }
        }

        // Retain the Android app routes only as compatibility fallbacks for
        // mirrors that do not expose a working public reader.
        if (info) {
            var appUrls = this._appChapterUrls(info);
            for (var i = 0; i < appUrls.length; i++) {
                var appHtml = bridge.httpGetWithHeaders(appUrls[i], this.appHeaders);
                if (!appHtml || appHtml.error) {
                    bridge.log("Baozi: App request failed for " + appUrls[i] + ": " + (appHtml && appHtml.error ? appHtml.error : "empty response"));
                    continue;
                }
                if (this._isBlockedResponse(appHtml)) {
                    bridge.log("Baozi: App request blocked/challenged for " + appUrls[i]);
                    continue;
                }

                pages = this._parsePageList(appHtml, info.slug);
                if (pages.length > 0) {
                    bridge.log("Baozi: using App chapter source for " + info.slug + " slot " + info.slot);
                    return pages;
                }
            }
        }

        bridge.log("Baozi: no usable comic pages found for " + (info ? info.slug : "unknown chapter"));
        return [];
    },

    _webChapterUrls: function(chapterUrl, info) {
        var urls = [];
        var seen = {};
        var original = this._fixUrl(chapterUrl);
        if (original) {
            seen[original] = true;
            urls.push(original);
        }
        if (info) {
            var direct = this.baseUrl + "/user/page_direct?comic_id=" + encodeURIComponent(info.slug) +
                "&section_slot=" + encodeURIComponent(info.section) +
                "&chapter_slot=" + encodeURIComponent(info.slot);
            if (!seen[direct]) {
                seen[direct] = true;
                urls.push(direct);
            }
            var canonical = "https://www.twmanga.com/comic/chapter/" + encodeURIComponent(info.slug) +
                "/" + encodeURIComponent(info.section) + "_" + encodeURIComponent(info.slot) + ".html";
            if (!seen[canonical]) urls.push(canonical);
        }
        return urls;
    },

    _queryParam: function(url, name) {
        if (!url) return "";
        var match = String(url).match(new RegExp("[?&]" + name + "=([^&#]*)"));
        if (!match) return "";
        try {
            return decodeURIComponent(match[1].replace(/\+/g, " "));
        } catch(e) {
            return match[1];
        }
    },

    _chapterInfo: function(url) {
        var value = String(url || "");
        var slug = this._queryParam(value, "comic_id");
        var section = this._queryParam(value, "section_slot");
        var slot = this._queryParam(value, "chapter_slot");

        // Also accept the normal /comic/chapter/{slug}/{section}_{slot}.html
        // form used by Baozi's redirect target and older saved chapters.
        if (!slug) {
            var path = value.match(/\/comic\/chapter\/([^\/?#]+)\/([^_/?#]+)_([0-9]+)\.html/);
            if (path) {
                slug = path[1];
                section = path[2];
                slot = path[3];
            }
        }

        if (!slug || slot === "") return null;
        return {
            slug: slug,
            section: section || "0",
            slot: slot
        };
    },

    _appChapterUrls: function(info) {
        var query = "?comic_id=" + encodeURIComponent(info.slug) +
            "&section_slot=" + encodeURIComponent(info.section) +
            "&chapter_slot=" + encodeURIComponent(info.slot);
        var chapterPath = "/" + info.section + "_" + info.slot + ".html";
        var paths = [
            // This is the route used by the Android WebView. The captured
            // page loads its Android assets from /baozimhapp/bzmh_android/.
            "/baozimhapp/bzmh_android/comic/chapter/" + info.slug + chapterPath,
            "/baozimhapp/bzmh_android/chapter" + query,
            // Keep the non-Android routes as compatibility fallbacks for
            // older app builds and mirrors.
            "/baozimhapp/comic/chapter/" + info.slug + chapterPath,
            "/baozimhapp/chapter" + query
        ];
        var bases = [this.appBaseUrl, this.appMirrorBaseUrl];
        var urls = [];
        var seen = {};
        for (var i = 0; i < bases.length; i++) {
            if (!bases[i]) continue;
            for (var j = 0; j < paths.length; j++) {
                var url = bases[i] + paths[j];
                if (!seen[url]) {
                    seen[url] = true;
                    urls.push(url);
                }
            }
        }
        return urls;
    },

    _pageImageSrc: function(img) {
        if (!img) return "";
        // The Android App initially uses loading.gif in src and stores the
        // actual comic URL in data-src. Its JS promotes data-src to w640.
        return img.attr("data-src") || img.attr("data-original") || img.attr("src") || "";
    },

    _appImageUrl: function(url) {
        if (!url) return "";
        var value = String(url).replace(/&amp;/g, "&").trim();
        // Match the Android App's loading_img():
        //   https://s1.baozicdn.com/scomic/... ->
        //   https://s1.baozicdn.com/w640/scomic/...
        if (value.indexOf("/w640/scomic/") === -1) {
            value = value.replace(".com/scomic/", ".com/w640/scomic/");
        }
        return value;
    },

    _isBlockedResponse: function(html) {
        var text = String(html || "").slice(0, 16000).toLowerCase();
        return text.indexOf("just a moment") !== -1 ||
            text.indexOf("cf-mitigated") !== -1 ||
            text.indexOf("challenge-platform") !== -1 ||
            text.indexOf("enable javascript and cookies to continue") !== -1;
    },

    _isComicPageUrl: function(url, slug) {
        if (!url || url.indexOf("data:image") === 0) return false;
        var value = String(url).replace(/&amp;/g, "&").trim();
        if (value.indexOf("/scomic/") === -1) return false;
        // CDN directory names do not always match comic_id. For example, a
        // current Baozi chapter can redirect to a bzcdn.net /scomic/ path
        // inherited from a different internal slug. Reader-area selection is
        // the reliable boundary; requiring comic_id here drops valid pages.
        return true;
    },

    _parsePageList: function(html, slug) {
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var pages = [];
        var seen = {};

        // Try to find all comic images
        var imgs = doc.select(".comic-contain__item, .comic-contain img, .comic-contain amp-img, img.comic-img");
        if (imgs.isEmpty()) {
            // Fallback: all images in reader area
            imgs = doc.select("#comic-reader img, .chapter-img img");
        }

        imgs.forEach(function(img) {
            var src = this._pageImageSrc(img);
            if (!this._isComicPageUrl(src, slug)) return;

            src = this._appImageUrl(this._fixUrl(src));
            if (!seen[src]) {
                seen[src] = true;
                pages.push(new Page(pages.length, "", src));
            }
        }.bind(this));

        // If still no pages, look for next-page pattern and collect all pages.
        if (pages.length === 0) {
            var allPages = doc.select("img[data-page]");
            allPages.forEach(function(img) {
                var src = this._pageImageSrc(img);
                if (!this._isComicPageUrl(src, slug)) return;

                src = this._appImageUrl(this._fixUrl(src));
                if (!seen[src]) {
                    seen[src] = true;
                    pages.push(new Page(pages.length, "", src));
                }
            }.bind(this));
        }

        bridge.domReleaseAll();
        return pages;
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Type", values: ["All", "连载中", "已完结"], state: 0 },
            { type: "select", name: "Region", values: ["All", "国漫", "日漫", "韩漫", "欧美"], state: 0 },
            { type: "select", name: "Status", values: ["All", "连载中", "已完结"], state: 0 }
        ];
    }
};

// Expose only bounded, host-audited v2 metadata; executable calls still cross the legacy adapter.
if (typeof source === "object" && source) {
    source.v2 = __shinsouExtensionV2;
}
