// 包子漫画 Plugin for Mihon iOS
// Crawls https://cn.baozimh.com (and mirrors)

var source = {
    baseUrl: "https://www.baozimh.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://www.baozimh.com/"
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
        var items = doc.select("a.comics-card__poster");
        if (items.isEmpty()) {
            items = doc.select("div.pure-g div.comics-card");
        }

        if (!items.isEmpty()) {
            items.forEach(function(item) {
                try {
                    var manga = SManga.create();

                    // If item is an <a> tag
                    if (item.tagName() === "a") {
                        manga.url = item.attr("href");
                        var img = item.selectFirst("img");
                        if (img) {
                            manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                        }
                        var titleEl = item.selectFirst(".comics-card__title");
                        manga.title = titleEl ? titleEl.text() : "";
                    } else {
                        // Card container
                        var link = item.selectFirst("a");
                        if (link) {
                            manga.url = link.attr("href");
                        }
                        var img = item.selectFirst("img");
                        if (img) {
                            manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                        }
                        var titleEl = item.selectFirst(".comics-card__title");
                        manga.title = titleEl ? titleEl.text() : "";
                    }

                    if (manga.url && manga.title) {
                        mangas.push(manga);
                    }
                } catch(e) {
                    bridge.log("Baozi parse error: " + e);
                }
            });
        }

        // Fallback: try other selectors
        if (mangas.length === 0) {
            var cards = doc.select(".pure-u-lg-1-6, .pure-u-md-1-4, .pure-u-sm-1-2");
            cards.forEach(function(card) {
                try {
                    var link = card.selectFirst("a[href*='/comic/']");
                    if (!link) return;

                    var manga = SManga.create();
                    manga.url = link.attr("href");

                    var img = card.selectFirst("img");
                    if (img) {
                        manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                    }

                    var title = card.selectFirst(".comics-card__title");
                    if (!title) title = link;
                    manga.title = title.text().trim();

                    if (manga.url && manga.title) {
                        mangas.push(manga);
                    }
                } catch(e) {}
            });
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
        var coverMeta = doc.selectFirst("meta[property='og:image']");
        if (coverMeta) {
            result.thumbnailUrl = coverMeta.attr("content");
        }
        if (!result.thumbnailUrl) {
            var coverImg = doc.selectFirst(".comics-detail__cover img, .l-content img");
            if (coverImg) {
                result.thumbnailUrl = coverImg.attr("data-src") || coverImg.attr("src") || "";
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
        var url = chapter.url;
        if (url.indexOf("http") !== 0) {
            url = this.baseUrl + url;
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var pages = [];

        // Try to find all comic images
        var imgs = doc.select(".comic-contain img, .comic-contain amp-img, img.comic-img");

        if (imgs.isEmpty()) {
            // Fallback: all images in reader area
            imgs = doc.select("#comic-reader img, .chapter-img img");
        }

        var pageNum = 0;
        imgs.forEach(function(img) {
            var src = img.attr("data-src") || img.attr("src") || img.attr("data-original") || "";
            if (src && src.indexOf("data:image") === -1) {
                pages.push(new Page(pageNum, "", src));
                pageNum++;
            }
        });

        // If still no pages, look for next-page pattern and collect all pages
        if (pages.length === 0) {
            // Some chapters split into multiple pages
            var allPages = doc.select("img[data-page]");
            allPages.forEach(function(img, idx) {
                var src = img.attr("data-src") || img.attr("src") || "";
                if (src) {
                    pages.push(new Page(idx, "", src));
                }
            });
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
