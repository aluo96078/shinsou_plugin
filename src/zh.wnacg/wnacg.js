// 紳士漫畫 (WNACG) Plugin for Mihon iOS
// Crawls https://www.wnacg.com

var source = {
    baseUrl: "https://www.wnacg.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://www.wnacg.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/albums.html?page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/albums.html?o=date_updated&page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url;

        if (query && query.trim()) {
            url = this.baseUrl + "/search/?q=" + encodeURIComponent(query.trim()) + "&p=" + (page + 1);
        } else {
            // Build category URL from filters
            var category = "";
            var sort = "";

            if (filters && filters.length > 0) {
                for (var i = 0; i < filters.length; i++) {
                    var f = filters[i];
                    if (!f || !f.type) continue;

                    if (f.type === "select" && f.name === "Category") {
                        var categories = [
                            "", "5", "6", "7", "8", "9", "10", "12", "16", "22", "23"
                        ];
                        // 0=All, 1=漢化,2=日語,3=英語,4=CG,5=同人,6=Cosplay,7=韓漫,8=3D,9=雜圖,10=Uncensored
                        if (f.state > 0 && f.state < categories.length) {
                            category = categories[f.state];
                        }
                    }

                    if (f.type === "select" && f.name === "Sort By") {
                        var sorts = ["", "date_updated", "views", "likes"];
                        sort = sorts[f.state] || "";
                    }
                }
            }

            if (category) {
                url = this.baseUrl + "/albums-index-cate-" + category + ".html?page=" + (page + 1);
            } else {
                url = this.baseUrl + "/albums.html?page=" + (page + 1);
            }

            if (sort) {
                url += (url.indexOf("?") !== -1 ? "&" : "?") + "o=" + sort;
            }
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== List Parser ========

    _parseList: function(html) {
        bridge.log("WNACG _parseList: html length=" + (html ? html.length : 0));

        var mangas = [];
        var seen = {};

        // Strategy 1: DOM-based parsing with CSS selectors
        var doc = Jsoup.parse(html, this.baseUrl);
        var links = doc.select("a[href*='photos-index-aid-']");
        bridge.log("WNACG: found " + links.size() + " gallery links via CSS selector");

        links.forEach(function(link) {
            try {
                var href = link.attr("href");
                if (!href || seen[href]) return;
                seen[href] = true;

                var manga = SManga.create();
                manga.url = href;

                // Title: prefer title attr, then text content
                var title = link.attr("title");
                if (!title) title = link.text().trim();
                manga.title = title || "";

                // Thumbnail: look for <img> inside this link or its parent
                var img = link.selectFirst("img");
                if (!img) {
                    var parent = link.parent();
                    if (parent) {
                        img = parent.selectFirst("img");
                    }
                }
                if (img) {
                    manga.thumbnailUrl = img.attr("src") || "";
                    manga.thumbnailUrl = this._fixUrl(manga.thumbnailUrl);
                }

                if (manga.url && manga.title) {
                    mangas.push(manga);
                }
            } catch(e) {
                bridge.log("WNACG parse error: " + e);
            }
        }.bind(this));

        // Strategy 2: Regex fallback if DOM parsing returned nothing
        if (mangas.length === 0) {
            bridge.log("WNACG: CSS selector found nothing, trying regex fallback");
            var pattern = /href="(\/photos-index-aid-\d+\.html)"[^>]*?(?:title="([^"]*)")?/g;
            var match;
            while ((match = pattern.exec(html)) !== null) {
                var href = match[1];
                if (seen[href]) continue;
                seen[href] = true;

                var manga = SManga.create();
                manga.url = href;
                manga.title = match[2] || "";

                // Try to find thumbnail near this link
                var imgPattern = new RegExp('src="(//[^"]*?\\.(jpg|png|webp))"', 'i');
                var nearHtml = html.substring(Math.max(0, match.index - 200), match.index + 500);
                var imgMatch = nearHtml.match(imgPattern);
                if (imgMatch) {
                    manga.thumbnailUrl = this._fixUrl(imgMatch[1]);
                }

                if (manga.url && manga.title) {
                    mangas.push(manga);
                }
            }
            bridge.log("WNACG: regex fallback found " + mangas.length + " mangas");
        }

        // Strategy 3: Even simpler regex - just find all unique gallery hrefs with titles
        if (mangas.length === 0) {
            bridge.log("WNACG: trying broad regex");
            var broadPattern = /photos-index-aid-(\d+)\.html/g;
            var ids = {};
            var match2;
            while ((match2 = broadPattern.exec(html)) !== null) {
                var aid = match2[1];
                if (ids[aid]) continue;
                ids[aid] = true;

                var manga = SManga.create();
                manga.url = "/photos-index-aid-" + aid + ".html";
                manga.title = "Gallery #" + aid;
                mangas.push(manga);
            }
            bridge.log("WNACG: broad regex found " + mangas.length + " mangas");
        }

        // Pagination
        var hasNext = false;
        var nextBtn = doc.selectFirst("a.next, a:contains(下一頁), a:contains(下一页), a:contains(Next)");
        if (nextBtn) {
            hasNext = true;
        }
        if (!hasNext && mangas.length >= 20) {
            hasNext = true;
        }

        bridge.domReleaseAll();
        bridge.log("WNACG _parseList: returning " + mangas.length + " mangas, hasNext=" + hasNext);
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

        // Title: #bodywrap h2
        var titleEl = doc.selectFirst("#bodywrap h2");
        result.title = titleEl ? titleEl.text().trim() : manga.title || "";

        // Cover: .uwthumb img
        var coverEl = doc.selectFirst(".uwthumb img");
        if (coverEl) {
            result.thumbnailUrl = coverEl.attr("src") || "";
            // Fix protocol-relative and extra slashes
            result.thumbnailUrl = this._fixUrl(result.thumbnailUrl);
        }

        // Tags: .addtags a.tagshow
        var genres = [];
        var tagEls = doc.select(".addtags a.tagshow");
        tagEls.forEach(function(tag) {
            var text = tag.text().trim();
            if (text) genres.push(text);
        });
        result.genre = genres.length > 0 ? genres : null;

        // Description from labels and paragraphs in .uwconn
        var desc = "";
        var labels = doc.select(".uwconn label");
        labels.forEach(function(label) {
            var text = label.text().trim();
            if (text) desc += text + "\n";
        });
        var descP = doc.selectFirst(".uwconn > p");
        if (descP) {
            var pText = descP.text().trim();
            if (pText) desc += pText;
        }
        result.description = desc.trim() || null;

        result.status = SManga.COMPLETED;

        bridge.domReleaseAll();
        return result;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var chapter = SChapter.create();
        chapter.url = manga.url;
        chapter.name = manga.title || "Gallery";
        chapter.chapterNumber = 1;
        chapter.dateUpload = Date.now();
        return [chapter];
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var url = chapter.url;
        if (url.indexOf("http") !== 0) {
            url = this.baseUrl + url;
        }

        // Convert detail URL to gallery URL: -index- -> -gallery-
        var galleryUrl = url.replace("-index-", "-gallery-");

        var jsContent = bridge.httpGetWithHeaders(galleryUrl, this.headers);
        if (!jsContent || jsContent.error) return [];

        var pages = [];

        // Gallery page returns JavaScript with imglist array:
        // fast_img_host+"path/to/image.jpg"
        // Extract the image paths using regex
        var hostMatch = jsContent.match(/fast_img_host\s*=\s*"([^"]+)"/);
        var imgHost = hostMatch ? hostMatch[1] : "//img5.qy0.ru";

        // Match: url: fast_img_host+"..." or url: "//host/..."
        var urlPattern = /url:\s*(?:fast_img_host\s*\+\s*)?"([^"]+)"/g;
        var match;
        var pageNum = 0;

        while ((match = urlPattern.exec(jsContent)) !== null) {
            var imgPath = match[1];
            // Skip ad/promo images
            if (imgPath.indexOf("themes/") !== -1 || imgPath.indexOf("shoucang") !== -1) continue;

            var imgUrl;
            if (imgPath.indexOf("//") === 0 || imgPath.indexOf("http") === 0) {
                imgUrl = this._fixUrl(imgPath);
            } else {
                imgUrl = this._fixUrl(imgHost + imgPath);
            }

            pages.push(new Page(pageNum, "", imgUrl));
            pageNum++;
        }

        // Fallback: try regex for any image-like URLs
        if (pages.length === 0) {
            var fallbackPattern = /\/\/[^\s"']+?\.(jpg|png|webp|gif)/gi;
            var seen = {};
            while ((match = fallbackPattern.exec(jsContent)) !== null) {
                var fallbackUrl = "https:" + match[0];
                if (!seen[fallbackUrl] && fallbackUrl.indexOf("themes/") === -1) {
                    seen[fallbackUrl] = true;
                    pages.push(new Page(pages.length, "", fallbackUrl));
                }
            }
        }

        return pages;
    },

    // ======== Helpers ========

    _fixUrl: function(url) {
        if (!url) return "";
        // Remove extra leading slashes (e.g. ////t4.qy0.ru -> //t4.qy0.ru)
        url = url.replace(/^\/\/\/+/, "//");
        // Add https: if protocol-relative
        if (url.indexOf("//") === 0) {
            url = "https:" + url;
        }
        return url;
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Category", values: [
                "全部", "漢化", "日語", "英語", "CG畫集", "同人誌", "Cosplay", "韓漫", "3D漫畫", "雜圖", "無修正"
            ], state: 0 },
            { type: "select", name: "Sort By", values: ["預設", "最新更新", "最多瀏覽", "最多喜歡"], state: 0 }
        ];
    }
};
