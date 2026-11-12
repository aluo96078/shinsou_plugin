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
    // baozimh.com (www, cn, tw and app) now answers every request with its own JavaScript
    // "gatekeeper" challenge (HTTP 403, {"error":"challenge_required"}). The official mirror
    // twmanga.com serves the same site without it and is already where chapters are read.
    baseUrl: "https://www.twmanga.com",
    // The Android app opens chapter pages on app.baozimh.com. appgb is used
    // by the app for static assets and remains as a mirror fallback.
    appBaseUrl: "https://app.baozimh.com",
    appMirrorBaseUrl: "https://appgb.baozimh.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://www.twmanga.com/",
        "Origin": "https://www.twmanga.com",
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
        var html = this._requestPage(url);
        return this._parseList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/classify?type=all&region=all&state=all&filter=*&page=" + (page + 1);
        var html = this._requestPage(url);
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

        var html = this._requestPage(url);
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
        var url = this._fixUrl(manga.url);

        var html = this._requestPage(url);

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

    // Titles saved while baozimh.com was reachable keep its absolute addresses; the mirror serves
    // the same paths.
    _mirrorUrl: function(url) {
        return String(url).replace(/^https?:\/\/(?:www|cn|tw)\.baozimh\.com(?=[\/?#]|$)/i, this.baseUrl);
    },

    _fixUrl: function(url, baseUrl) {
        if (!url) return "";
        url = String(url).replace(/&amp;/g, "&").trim();
        if (url.indexOf("//") === 0) return "https:" + url;
        if (url.indexOf("/") === 0) {
            var originMatch = String(baseUrl || this.baseUrl).match(/^(https?:\/\/[^\/?#]+)/i);
            return (originMatch ? originMatch[1] : this.baseUrl) + url;
        }
        if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return this._mirrorUrl(url);
        if (baseUrl && url.indexOf("/") !== 0) {
            var pathBase = String(baseUrl).replace(/[?#].*$/, "");
            var slash = pathBase.lastIndexOf("/");
            if (slash >= 0) return pathBase.slice(0, slash + 1) + url;
        }
        return url;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var url = this._fixUrl(manga.url);

        var html = this._requestPage(url);

        // One bounded host parse avoids two bridge calls for every chapter of long series. The
        // complete directory is preferred: the page also shows a short "latest chapters" block,
        // which would otherwise repeat chapters out of order.
        var rows = this._chapterRows(html, "#chapter-items a, #chapters_other_list a");
        if (rows.length === 0) {
            rows = this._chapterRows(html, ".comics-chapters a, a.comics-chapters__item, a[href*='/chapter/']");
        }
        var entries = [];
        var seen = {};
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var url = String(row.attr_href || "");
            var name = String(row.text || "").trim();
            if (!url || !name || seen[url]) continue;
            seen[url] = true;
            entries.push({url: url, name: name});
        }
        // Shinsou reads a chapter list in story order (the first chapter first, "next" is the
        // following entry): a list whose numbered chapters mostly count down is turned around.
        var up = 0, down = 0, previous = null;
        for (var j = 0; j < entries.length; j++) {
            var match = entries[j].name.match(/(\d+(?:\.\d+)?)/);
            if (!match) continue;
            var number = parseFloat(match[1]);
            if (previous !== null) {
                if (number > previous) up++;
                else if (number < previous) down++;
            }
            previous = number;
        }
        if (down > up) entries.reverse();
        var chapters = [];
        for (var k = 0; k < entries.length; k++) {
            chapters.push({url: entries[k].url, name: entries[k].name, chapterNumber: k + 1});
        }
        return chapters;
    },

    _chapterRows: function(html, selector) {
        var rows = bridge.parseHtml(html, selector);
        if (typeof rows === "string") rows = JSON.parse(rows);
        return rows || [];
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var info = this._chapterInfo(chapter.url);
        var pages = [];
        var lastFailure = null;
        var terminalFailure = null;

        // The public chapter route currently redirects to twmanga.com, whose
        // AMP reader contains the real bzcdn.net image URLs. Resolve that
        // route first: the app hosts are often protected by Cloudflare and
        // otherwise make every chapter wait through several failed requests.
        var webUrls = this._webChapterUrls(chapter.url, info);
        for (var w = 0; w < webUrls.length; w++) {
            var html;
            try {
                html = this._requestPage(webUrls[w], this.headers);
            } catch (e) {
                if (!this._isSourceFailure(e)) throw e;
                lastFailure = e;
                bridge.log("Baozi: reader request failed (" + e + ")");
                if (this._isTerminalSourceFailure(e)) {
                    terminalFailure = e;
                    break;
                }
                continue;
            }
            pages = this._parsePageList(html, info ? info.slug : "", webUrls[w]);
            if (pages.length > 0) {
                bridge.log("Baozi: using web chapter source for " + (info ? info.slug : "unknown chapter"));
                return pages;
            }
        }

        // Retain the Android app routes only as compatibility fallbacks for
        // mirrors that do not expose a working public reader.
        if (info && !terminalFailure) {
            var appUrls = this._appChapterUrls(info);
            for (var i = 0; i < appUrls.length; i++) {
                var appHtml;
                try {
                    appHtml = this._requestPage(appUrls[i], this.appHeaders);
                } catch (e) {
                    if (!this._isSourceFailure(e)) throw e;
                    lastFailure = e;
                    bridge.log("Baozi: reader request failed (" + e + ")");
                    if (this._isTerminalSourceFailure(e)) {
                        terminalFailure = e;
                        break;
                    }
                    continue;
                }
                pages = this._parsePageList(appHtml, info.slug, appUrls[i]);
                if (pages.length > 0) {
                    bridge.log("Baozi: using App chapter source for " + info.slug + " slot " + info.slot);
                    return pages;
                }
            }
        }

        if (terminalFailure) throw terminalFailure;
        bridge.log("Baozi: no usable comic pages found");
        throw lastFailure || "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
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
        if (/^https:\/\/s1\.baozicdn\.com\/scomic\//i.test(value)) {
            value = value.replace(/^https:\/\/s1\.baozicdn\.com\/scomic\//i,
                "https://s1.baozicdn.com/w640/scomic/");
        }
        return value;
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

    _parsePageList: function(html, slug, readerBaseUrl) {
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, readerBaseUrl || this.baseUrl);
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

            src = this._appImageUrl(this._fixUrl(src, readerBaseUrl || this.baseUrl));
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

                src = this._appImageUrl(this._fixUrl(src, readerBaseUrl || this.baseUrl));
                if (!seen[src]) {
                    seen[src] = true;
                    pages.push(new Page(pages.length, "", src));
                }
            }.bind(this));
        }

        bridge.domReleaseAll();
        return pages;
    },

    _requestPage: function(url, headers) {
        var requestHeaders = headers || this.headers;
        var structured = typeof bridge.httpGetResponse === "function";
        var response = structured
            ? bridge.httpGetResponse(url, requestHeaders)
            : bridge.httpGetWithHeaders(url, requestHeaders);
        var rawStatus = structured && response
            ? (response.status != null ? response.status : response.statusCode)
            : null;
        var status = structured ? Number(rawStatus) : 0;
        var html = structured
            ? response && (response.body != null ? response.body : response.text)
            : response;

        if (structured && (!response || response.error)) {
            throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        }
        if (structured && (!isFinite(status) || status <= 0 || Math.floor(status) !== status)) {
            throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        }
        if (typeof html !== "string" || !html.trim()) {
            throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        }

        var responseLower = html.toLowerCase();
        if (responseLower.indexOf("sorry, you have been blocked") !== -1) {
            throw "SHINSOU_SOURCE_HTTP_BLOCKED";
        }

        // A normal page can reference Cloudflare's passive resources. Require explicit
        // challenge markup, or a challenge resource paired with a transient status/title/form.
        var explicitChallenge = responseLower.indexOf("_cf_chl_opt") !== -1 ||
            responseLower.indexOf("cf-chl") !== -1 ||
            responseLower.indexOf("challenge-form") !== -1;
        var interstitialTitle = /<title\b[^>]*>[^<]*(?:just a moment|checking your browser|attention required|enable javascript and cookies)[^<]*<\/title>/i.test(html);
        var interstitialForm = /<(?:form|div)\b[^>]*(?:id|class)\s*=\s*["'][^"']*(?:challenge|cf-chl)[^"']*["']/i.test(html);
        var challengePlatform = responseLower.indexOf("challenge-platform") !== -1;
        var cfMitigated = responseLower.indexOf("cf-mitigated") !== -1;
        var transientChallengeStatus = structured && (status === 403 || status === 503);
        if (explicitChallenge ||
            ((challengePlatform || cfMitigated) && (transientChallengeStatus || interstitialTitle || interstitialForm))) {
            throw "SHINSOU_SOURCE_HTTP_CHALLENGE";
        }

        if (status === 403) throw "SHINSOU_SOURCE_HTTP_FORBIDDEN";
        if (structured && (status < 200 || status >= 300)) {
            throw "SHINSOU_SOURCE_HTTP_UNAVAILABLE";
        }
        return html;
    },

    _isSourceFailure: function(error) {
        return error === "SHINSOU_SOURCE_HTTP_UNAVAILABLE" ||
            error === "SHINSOU_SOURCE_HTTP_CHALLENGE" ||
            error === "SHINSOU_SOURCE_HTTP_BLOCKED" ||
            error === "SHINSOU_SOURCE_HTTP_FORBIDDEN";
    },

    _isTerminalSourceFailure: function(error) {
        return error === "SHINSOU_SOURCE_HTTP_CHALLENGE" ||
            error === "SHINSOU_SOURCE_HTTP_BLOCKED" ||
            error === "SHINSOU_SOURCE_HTTP_FORBIDDEN";
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
// zh.baozimh 1.0.10: network origins are declared in the repository index.
