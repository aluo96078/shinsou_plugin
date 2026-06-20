// 禁漫天堂 (JinmanTiantang / 18comic) Plugin for Mihon iOS
// Crawls https://18comic.vip

var source = {
    baseUrl: "https://18comic.vip",
    supportsLatest: true,
    headers: {
        "Referer": "https://18comic.vip/"
    },
    categoryFilters: [
        { label: "全部" },
        { label: "類別 / 最新A漫", path: "/albums", fixedSort: "mr" },
        { label: "類別 / 角色扮演", path: "/albums/another/sub/cosplay" },
        { label: "類別 / 3D", query: "3D" },

        { label: "漫畫分類 / 韓漫", path: "/albums/hanman" },
        { label: "漫畫分類 / 一般向韓漫", path: "/albums/hanmansfw" },
        { label: "漫畫分類 / 單本", path: "/albums/single" },
        { label: "漫畫分類 / 同人", path: "/albums/doujin" },
        { label: "漫畫分類 / 短篇", path: "/albums/short" },
        { label: "漫畫分類 / English Manga", path: "/albums/meiman" },
        { label: "漫畫分類 / 其他類", path: "/albums/another" },

        { label: "漫畫排行榜 / 總排行", path: "/albums", fixedSort: "mv" },
        { label: "漫畫排行榜 / 月排行", path: "/albums", fixedSort: "mv", period: "m" },
        { label: "漫畫排行榜 / 周排行", path: "/albums", fixedSort: "mv", period: "w" },
        { label: "漫畫排行榜 / 天排行", path: "/albums", fixedSort: "mv", period: "t" },

        { label: "主題A漫 / 無修正", query: "無修正" },
        { label: "主題A漫 / 劇情向", query: "劇情向" },
        { label: "主題A漫 / 青年漫", query: "青年漫" },
        { label: "主題A漫 / 校服", query: "校服" },
        { label: "主題A漫 / 純愛", query: "純愛" },
        { label: "主題A漫 / 人妻", query: "人妻" },
        { label: "主題A漫 / 教師", query: "教師" },
        { label: "主題A漫 / 百合", query: "百合" },
        { label: "主題A漫 / Yaoi", query: "Yaoi" },
        { label: "主題A漫 / 性轉", query: "性轉" },
        { label: "主題A漫 / NTR", query: "NTR" },
        { label: "主題A漫 / 女裝", query: "女裝" },
        { label: "主題A漫 / 癡女", query: "癡女" },
        { label: "主題A漫 / 全彩", query: "全彩" },
        { label: "主題A漫 / 女性向", query: "女性向" },
        { label: "主題A漫 / 完結", query: "完結" },
        { label: "主題A漫 / 禁漫漢化組", query: "禁漫漢化組" },

        { label: "角色 / 御姐", query: "御姐" },
        { label: "角色 / 熟女", query: "熟女" },
        { label: "角色 / 巨乳", query: "巨乳" },
        { label: "角色 / 貧乳", query: "貧乳" },
        { label: "角色 / 女性支配", query: "女性支配" },
        { label: "角色 / 教師", query: "教師" },
        { label: "角色 / 女僕", query: "女僕" },
        { label: "角色 / 護士", query: "護士" },
        { label: "角色 / 泳裝", query: "泳裝" },
        { label: "角色 / 眼鏡", query: "眼鏡" },
        { label: "角色 / 連褲襪", query: "連褲襪" },
        { label: "角色 / 其他制服", query: "其他制服" },
        { label: "角色 / 兔女郎", query: "兔女郎" },

        { label: "特殊PLAY / 群交", query: "群交" },
        { label: "特殊PLAY / 足交", query: "足交" },
        { label: "特殊PLAY / 束縛", query: "束縛" },
        { label: "特殊PLAY / 肛交", query: "肛交" },
        { label: "特殊PLAY / 阿黑顏", query: "阿黑顏" },
        { label: "特殊PLAY / 藥物", query: "藥物" },
        { label: "特殊PLAY / 扶他", query: "扶他" },
        { label: "特殊PLAY / 調教", query: "調教" },
        { label: "特殊PLAY / 野外露出", query: "野外露出" },
        { label: "特殊PLAY / 催眠", query: "催眠" },
        { label: "特殊PLAY / 自慰", query: "自慰" },
        { label: "特殊PLAY / 觸手", query: "觸手" },
        { label: "特殊PLAY / 獸交", query: "獸交" },
        { label: "特殊PLAY / 亞人", query: "亞人" },
        { label: "特殊PLAY / 怪物女孩", query: "怪物女孩" },
        { label: "特殊PLAY / 皮物", query: "皮物" },
        { label: "特殊PLAY / ryona", query: "ryona" },
        { label: "特殊PLAY / 騎大車", query: "騎大車" },

        { label: "其他 / CG", query: "CG" },
        { label: "其他 / 重口", query: "重口" },
        { label: "其他 / 獵奇", query: "獵奇" },
        { label: "其他 / 非H", query: "非H" },
        { label: "其他 / 血腥暴力", query: "血腥暴力" },
        { label: "其他 / 站長推薦", query: "站長推薦" }
    ],

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
            var category = null;

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
                        var categories = this.categoryFilters;
                        if (f.state > 0 && f.state < categories.length) {
                            category = categories[f.state];
                        }
                    }

                    // Tag search
                    if (f.type === "text" && f.name === "Tag") {
                        var tag = String(f.state || "").trim();
                        if (tag) {
                            url = this.baseUrl + "/search/photos?search_query=" + encodeURIComponent(tag) + "&page=" + (page + 1);
                        }
                    }
                }
            }

            if (!url) {
                if (category) {
                    url = this._buildCategoryUrl(category, sort, page);
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

    _buildCategoryUrl: function(category, sort, page) {
        var pageNum = page + 1;
        var selectedSort = category.fixedSort || sort;

        if (category.query) {
            return this.baseUrl + "/search/photos?search_query=" + encodeURIComponent(category.query) + "&o=" + selectedSort + "&page=" + pageNum;
        }

        var path = category.path || "/albums";
        var url = this.baseUrl + path;
        var sep = path.indexOf("?") === -1 ? "?" : "&";
        url += sep + "o=" + selectedSort;
        if (category.period) {
            url += "&t=" + encodeURIComponent(category.period);
        }
        return url + "&page=" + pageNum;
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

        result.thumbnailUrl = this._extractDetailThumbnail(manga.thumbnailUrl, url, doc);

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

    _extractDetailThumbnail: function(existingUrl, pageUrl, doc) {
        var albumId = this._extractAlbumId(pageUrl);
        if (this._isUsableAlbumThumbnail(existingUrl, albumId)) {
            return existingUrl;
        }

        var candidates = doc.select(".thumb-overlay img, img[src*='/media/albums/'], img[data-original*='/media/albums/'], img[data-src*='/media/albums/']");
        for (var i = 0; i < candidates.size(); i++) {
            var img = candidates.get(i);
            var src = img.attr("data-original") || img.attr("data-src") || img.attr("src") || "";
            src = this._absoluteUrl(src);
            if (this._isUsableAlbumThumbnail(src, albumId)) {
                return src;
            }
            var normalized = this._normalizeAlbumThumbnail(src, albumId);
            if (this._isUsableAlbumThumbnail(normalized, albumId)) {
                return normalized;
            }
        }

        if (albumId) {
            return this.baseUrl + "/media/albums/" + albumId + "_3x4.jpg";
        }
        return existingUrl || "";
    },

    _extractAlbumId: function(url) {
        var match = String(url || "").match(/\/album\/(\d+)/);
        return match && match[1] ? match[1] : "";
    },

    _normalizeAlbumThumbnail: function(url, albumId) {
        if (!url || !albumId || url.indexOf("/media/albums/") === -1) return "";
        var albumMatch = url.match(/\/media\/albums\/(\d+)/);
        if (!albumMatch || albumMatch[1] !== String(albumId)) return "";
        if (url.indexOf("_3x4.") !== -1) return url;

        var match = url.match(/^(.*\/media\/albums\/)(\d+)(\.[a-zA-Z0-9]+)(?:[?&][uv]=([^&#]+))?/);
        if (!match || match[2] !== String(albumId)) return "";

        var ext = match[3] || ".jpg";
        var version = match[4] ? "?v=" + match[4] : "";
        return match[1] + albumId + "_3x4" + ext + version;
    },

    _isUsableAlbumThumbnail: function(url, albumId) {
        if (!url) return false;
        var candidate = String(url);
        if (candidate.indexOf("blank.") !== -1) return false;
        if (candidate.indexOf("/static/resources/") !== -1) return false;
        if (candidate.indexOf("/templates/") !== -1) return false;
        if (candidate.indexOf("/media/logo/") !== -1) return false;
        if (candidate.indexOf("/media/photos/") !== -1) return false;
        if (candidate.indexOf("/media/albums/") === -1) return false;
        if (albumId) {
            var match = candidate.match(/\/media\/albums\/(\d+)/);
            if (!match || match[1] !== String(albumId)) return false;
        }
        return true;
    },

    _absoluteUrl: function(url) {
        if (!url) return "";
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
        var photoId = this._extractPhotoId(url, html);
        var scrambleId = this._extractScrambleId(html);

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
                src = source._appendScrambleInfo(src, photoId, scrambleId);
                pages.push(new Page(pageNum, "", src));
                pageNum++;
            }
        });

        bridge.domReleaseAll();
        return pages;
    },

    _extractPhotoId: function(url, html) {
        var match = String(url || "").match(/\/photo\/(\d+)/);
        if (match && match[1]) return match[1];

        match = String(html || "").match(/<meta[^>]+property=["']og:url["'][^>]+content=["'][^"']*\/photo\/(\d+)/);
        if (match && match[1]) return match[1];

        return "";
    },

    _extractScrambleId: function(html) {
        var match = String(html || "").match(/var\s+scramble_id\s*=\s*(\d+)/);
        return match && match[1] ? match[1] : "220980";
    },

    _appendScrambleInfo: function(url, photoId, scrambleId) {
        if (!url || !photoId || !scrambleId) return url;

        var clean = url.split("#")[0].split("?")[0];
        var filename = clean.substring(clean.lastIndexOf("/") + 1);
        var dot = filename.lastIndexOf(".");
        var basename = dot >= 0 ? filename.substring(0, dot) : filename;
        if (!basename) return url;

        var sep = url.indexOf("#") === -1 ? "#" : "&";
        return url + sep +
            "Shinsou-JM-Scramble-Id=" + encodeURIComponent(scrambleId) +
            "&Shinsou-JM-Photo-Id=" + encodeURIComponent(photoId) +
            "&Shinsou-JM-Filename=" + encodeURIComponent(basename);
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Sort By", values: [
                "最多觀看", "最新", "最多圖片", "最多下載", "最多收藏"
            ], state: 0 },

            { type: "separator" },
            { type: "header", name: "Category" },
            { type: "select", name: "Category", values: this._categoryFilterLabels(), state: 0 },

            { type: "separator" },
            { type: "header", name: "Tag Search" },
            { type: "text", name: "Tag", state: "" }
        ];
    },

    _categoryFilterLabels: function() {
        var values = [];
        this.categoryFilters.forEach(function(item) {
            values.push(item.label);
        });
        return values;
    }
};
