// 禁漫天堂 (JinmanTiantang / 18comic) Plugin for Mihon iOS
// Crawls https://18comic.vip

var source = {
    baseUrl: "https://18comic.vip",
    supportsLatest: true,
    headers: {
        "Referer": "https://18comic.vip/"
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/albums?o=mv&page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/albums?o=mr&page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url;

        if (query && query.trim()) {
            url = this.baseUrl + "/search/photos?search_query=" + encodeURIComponent(query.trim()) + "&page=" + (page + 1);
        } else {
            var sort = "mv";
            var category = "";

            if (filters && filters.length > 0) {
                for (var i = 0; i < filters.length; i++) {
                    var f = filters[i];
                    if (!f || !f.type) continue;

                    if (f.type === "select" && f.name === "Sort By") {
                        var sorts = ["mv", "mr", "mp", "md", "tf"];
                        // 0=Most Viewed, 1=Most Recent, 2=Most Popular, 3=Most Downloaded, 4=Top Favorites
                        sort = sorts[f.state] || "mv";
                    }

                    if (f.type === "select" && f.name === "Category") {
                        var categories = [
                            "", "doujin", "single", "short",
                            "another", "hanman", "meiman", "cosplay",
                            "3D"
                        ];
                        if (f.state > 0 && f.state < categories.length) {
                            category = categories[f.state];
                        }
                    }

                    // Tag search
                    if (f.type === "text" && f.name === "Tag") {
                        var tag = f.state.trim();
                        if (tag) {
                            url = this.baseUrl + "/search/photos?search_query=" + encodeURIComponent(tag) + "&page=" + (page + 1);
                        }
                    }
                }
            }

            if (!url) {
                if (category) {
                    url = this.baseUrl + "/albums/" + category + "?o=" + sort + "&page=" + (page + 1);
                } else {
                    url = this.baseUrl + "/albums?o=" + sort + "&page=" + (page + 1);
                }
            }
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== List Parser ========

    _parseList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];

        // Main gallery items
        var items = doc.select(".well.well-sm, div[id^='album_'], .list-col");

        if (items.isEmpty()) {
            // Alternative layout
            items = doc.select(".row .col-xs-6.col-sm-4.col-md-3, .row .col-xs-6.col-md-3");
        }

        items.forEach(function(item) {
            try {
                var link = item.selectFirst("a[href*='/album/']");
                if (!link) return;

                var manga = SManga.create();
                manga.url = link.attr("href");

                // Title
                var titleEl = item.selectFirst(".title-truncate a, span.video-title, .hidden-xs");
                if (titleEl) {
                    manga.title = titleEl.text().trim();
                } else {
                    manga.title = link.attr("title") || "";
                }

                // Thumbnail
                var img = item.selectFirst("img");
                if (img) {
                    manga.thumbnailUrl = img.attr("data-original") || img.attr("data-src") || img.attr("src") || "";
                    // Fix protocol
                    if (manga.thumbnailUrl.indexOf("//") === 0) {
                        manga.thumbnailUrl = "https:" + manga.thumbnailUrl;
                    }
                }

                if (manga.url && manga.title) {
                    mangas.push(manga);
                }
            } catch(e) {
                bridge.log("Jinman parse error: " + e);
            }
        });

        // Pagination
        var hasNext = false;
        var nextBtn = doc.selectFirst("a.prevnext:contains(下一頁), a.prevnext:contains(Next), ul.pagination li:last-child:not(.active) a");
        if (nextBtn && nextBtn.attr("href")) {
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
        var titleEl = doc.selectFirst("h1[itemprop='name'], .panel-heading [itemprop='name'], div[itemprop='name'] h1");
        result.title = titleEl ? titleEl.text().trim() : manga.title || "";

        // Cover
        var coverEl = doc.selectFirst(".thumb-overlay img, .panel-body img[id='album_photo_cover'], img[itemprop='image']");
        if (coverEl) {
            result.thumbnailUrl = coverEl.attr("data-original") || coverEl.attr("src") || "";
            if (result.thumbnailUrl.indexOf("//") === 0) {
                result.thumbnailUrl = "https:" + result.thumbnailUrl;
            }
        }

        // Author / Artist
        var authorEl = doc.selectFirst("div[itemprop='author'], .panel-body .tag-block a[href*='author']");
        if (authorEl) {
            result.author = authorEl.text().trim();
        }

        // Tags
        var genres = [];
        var tagEls = doc.select("span[itemprop='genre'] a, a[href*='/search/photos?search_query='], .tag-block a[data-type='tag']");
        tagEls.forEach(function(el) {
            var text = el.text().trim();
            if (text && text !== "+" && text !== "-") {
                genres.push(text);
            }
        });
        result.genre = genres.length > 0 ? genres : null;

        // Description
        var descParts = [];
        var descEl = doc.selectFirst(".p-t-5.p-b-5:not(:has(a)), div[itemprop='description']");
        if (descEl) {
            descParts.push(descEl.text().trim());
        }

        // Additional info (views, likes, etc.)
        var infoEls = doc.select(".p-t-5.p-b-5");
        infoEls.forEach(function(el) {
            var text = el.text().trim();
            if (text.indexOf("觀看") !== -1 || text.indexOf("点赞") !== -1 || text.indexOf("更新") !== -1) {
                descParts.push(text);
            }
        });

        result.description = descParts.join("\n").trim() || null;
        result.status = SManga.UNKNOWN;

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

        // Multi-chapter albums have chapter links
        var chapterEls = doc.select("ul.btn-toolbar a[href*='/photo/'], .episode a[href*='/photo/'], a.episode");

        if (!chapterEls.isEmpty()) {
            var num = chapterEls.size();
            chapterEls.forEach(function(el) {
                try {
                    var chapter = SChapter.create();
                    chapter.url = el.attr("href");
                    chapter.name = el.text().trim() || "Chapter " + num;
                    chapter.chapterNumber = num;
                    num--;

                    if (chapter.url) {
                        chapters.push(chapter);
                    }
                } catch(e) {}
            });
        }

        // If no chapters found, treat as single chapter
        if (chapters.length === 0) {
            var chapter = SChapter.create();
            // Convert album URL to photo URL
            chapter.url = manga.url.replace("/album/", "/photo/");
            chapter.name = manga.title || "Gallery";
            chapter.chapterNumber = 1;
            chapter.dateUpload = Date.now();
            chapters.push(chapter);
        }

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

        // Images are in .scramble-page or directly in the reader
        var imgs = doc.select(".scramble-page img[id^='album_photo_'], img[data-original][id^='album_photo_'], .center-block.img-responsive");

        if (imgs.isEmpty()) {
            imgs = doc.select("img.lazy_img, img[data-original]");
        }

        var pageNum = 0;
        imgs.forEach(function(img) {
            var src = img.attr("data-original") || img.attr("data-src") || img.attr("src") || "";
            if (src && src.indexOf("blank.") === -1 && src.indexOf("logo") === -1) {
                if (src.indexOf("//") === 0) {
                    src = "https:" + src;
                }
                pages.push(new Page(pageNum, "", src));
                pageNum++;
            }
        });

        bridge.domReleaseAll();
        return pages;
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Sort By", values: [
                "最多觀看", "最新", "最多圖片", "最多下載", "最多收藏"
            ], state: 0 },

            { type: "separator" },
            { type: "header", name: "Category" },
            { type: "select", name: "Category", values: [
                "全部", "同人誌", "單本", "短篇",
                "其他", "韓漫", "美漫", "Cosplay",
                "3D"
            ], state: 0 },

            { type: "separator" },
            { type: "header", name: "Tag Search" },
            { type: "text", name: "Tag", state: "" }
        ];
    }
};
