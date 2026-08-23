// MyComic Plugin for Shinsou
// Crawls https://mycomic.com

var source = {
    baseUrl: "https://mycomic.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://mycomic.com/",
        "Origin": "https://mycomic.com",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    },

    filterOptions: {
        sorts: [
            { label: "最新上架", code: "" },
            { label: "最近更新", code: "-update" },
            { label: "最高人氣", code: "-views" },
            { label: "日排行", code: "rank|" },
            { label: "週排行", code: "rank|-week" },
            { label: "月排行", code: "rank|-month" },
            { label: "歷史排行", code: "rank|-views" }
        ],
        regions: [
            { label: "所有", code: "" },
            { label: "日本", code: "japan" },
            { label: "港台", code: "hongkong" },
            { label: "歐美", code: "europe" },
            { label: "內地", code: "china" },
            { label: "韓國", code: "korea" },
            { label: "其他", code: "other" }
        ],
        tags: [
            { label: "所有", code: "" },
            { label: "魔幻", code: "mohuan" },
            { label: "魔法", code: "mofa" },
            { label: "熱血", code: "rexue" },
            { label: "冒險", code: "maoxian" },
            { label: "懸疑", code: "xuanyi" },
            { label: "偵探", code: "zhentan" },
            { label: "愛情", code: "aiqing" },
            { label: "校園", code: "xiaoyuan" },
            { label: "搞笑", code: "gaoxiao" },
            { label: "四格", code: "sige" },
            { label: "科幻", code: "kehuan" },
            { label: "神鬼", code: "shengui" },
            { label: "舞蹈", code: "wudao" },
            { label: "音樂", code: "yinyue" },
            { label: "百合", code: "baihe" },
            { label: "後宮", code: "hougong" },
            { label: "機戰", code: "jizhan" },
            { label: "格鬥", code: "gedou" },
            { label: "恐怖", code: "kongbu" },
            { label: "萌系", code: "mengxi" },
            { label: "武俠", code: "wuxia" },
            { label: "社會", code: "shehui" },
            { label: "歷史", code: "lishi" },
            { label: "耽美", code: "danmei" },
            { label: "勵志", code: "lizhi" },
            { label: "職場", code: "zhichang" },
            { label: "生活", code: "shenghuo" },
            { label: "治癒", code: "zhiyu" },
            { label: "偽娘", code: "weiniang" },
            { label: "黑道", code: "heidao" },
            { label: "戰爭", code: "zhanzheng" },
            { label: "競技", code: "jingji" },
            { label: "體育", code: "tiyu" },
            { label: "美食", code: "meishi" },
            { label: "腐女", code: "funv" },
            { label: "宅男", code: "zhainan" },
            { label: "推理", code: "tuili" },
            { label: "雜誌", code: "zazhi" }
        ],
        audiences: [
            { label: "所有", code: "" },
            { label: "少女", code: "shaonv" },
            { label: "少年", code: "shaonian" },
            { label: "青年", code: "qingnian" },
            { label: "兒童", code: "ertong" },
            { label: "通用", code: "tongyong" }
        ],
        years: [
            { label: "所有", code: "" },
            { label: "2026", code: "2026" },
            { label: "2025", code: "2025" },
            { label: "2024", code: "2024" },
            { label: "2023", code: "2023" },
            { label: "2022", code: "2022" },
            { label: "2021", code: "2021" },
            { label: "2020", code: "2020" },
            { label: "2019", code: "2019" },
            { label: "2018", code: "2018" },
            { label: "2017", code: "2017" },
            { label: "2016", code: "2016" },
            { label: "2015", code: "2015" },
            { label: "2014", code: "2014" },
            { label: "2013", code: "2013" },
            { label: "2012", code: "2012" },
            { label: "2011", code: "2011" },
            { label: "2010", code: "2010" },
            { label: "00年代", code: "200x" },
            { label: "90年代", code: "199x" },
            { label: "80年代", code: "198x" },
            { label: "70年代或更早", code: "197x" }
        ],
        statuses: [
            { label: "所有", code: "" },
            { label: "連載中", code: "0" },
            { label: "已完結", code: "1" }
        ]
    },

    // ======== Popular / Latest ========

    getPopularManga: function(page) {
        return this._fetchList(this._buildListUrl(page, "", [], "-views"));
    },

    getLatestUpdates: function(page) {
        return this._fetchList(this._buildListUrl(page, "", [], "-update"));
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url = this._buildListUrl(page, query, filters || [], null);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error || this._isBlocked(html)) {
            return new MangasPage([], false);
        }
        return url.indexOf("/rank") !== -1 ? this._parseRankList(html) : this._parseList(html);
    },

    _fetchList: function(url) {
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error || this._isBlocked(html)) {
            return new MangasPage([], false);
        }
        return this._parseList(html);
    },

    _buildListUrl: function(page, query, filters, forcedSort) {
        var sort = forcedSort === null ? "" : (forcedSort || "");
        var region = "";
        var tag = "";
        var audience = "";
        var year = "";
        var status = "";

        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var filter = filters[i];
                if (!filter || filter.type !== "select") continue;

                if (filter.name === "排序" && forcedSort === null) {
                    sort = this._filterCode(this.filterOptions.sorts, filter.state);
                } else if (filter.name === "作品地區") {
                    region = this._filterCode(this.filterOptions.regions, filter.state);
                } else if (filter.name === "作品類型") {
                    tag = this._filterCode(this.filterOptions.tags, filter.state);
                } else if (filter.name === "適合受眾") {
                    audience = this._filterCode(this.filterOptions.audiences, filter.state);
                } else if (filter.name === "出品年份") {
                    year = this._filterCode(this.filterOptions.years, filter.state);
                } else if (filter.name === "目前進度") {
                    status = this._filterCode(this.filterOptions.statuses, filter.state);
                }
            }
        }

        var rankPrefix = "rank|";
        var isRank = sort.indexOf(rankPrefix) === 0;
        var url = this.baseUrl + (isRank ? "/rank" : "/comics");
        var params = [];
        var cleanQuery = String(query || "").trim();
        var sortValue = isRank ? sort.substring(rankPrefix.length) : sort;

        if (!isRank && cleanQuery) params.push("q=" + encodeURIComponent(cleanQuery));
        if (sortValue) params.push("sort=" + encodeURIComponent(sortValue));
        if (region) params.push("filter%5Bcountry%5D=" + encodeURIComponent(region));
        if (tag) params.push("filter%5Btag%5D=" + encodeURIComponent(tag));
        if (audience) params.push("filter%5Baudience%5D=" + encodeURIComponent(audience));
        if (year) params.push("filter%5Byear%5D=" + encodeURIComponent(year));
        if (status !== "") params.push("filter%5Bend%5D=" + encodeURIComponent(status));
        if (!isRank && page > 0) params.push("page=" + (page + 1));

        return params.length > 0 ? url + "?" + params.join("&") : url;
    },

    // ======== List Parsers ========

    _parseList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return new MangasPage([], false);

        var mangas = [];
        var seen = {};
        var items = doc.select("div.grid > div.group");

        items.forEach(function(item) {
            try {
                var link = item.selectFirst("a[href*='/comics/']");
                var image = item.selectFirst("img");
                if (!link || !image) return;

                var manga = SManga.create();
                manga.url = this._relativeUrl(link.absUrl("href") || link.attr("href"));
                manga.title = image.attr("alt").trim();
                if (!manga.title) {
                    var titleElement = item.selectFirst("[data-flux-subheading]");
                    manga.title = titleElement ? titleElement.text().trim() : "";
                }
                manga.thumbnailUrl = this._imageUrl(image);

                if (manga.url && manga.title && !seen[manga.url]) {
                    seen[manga.url] = true;
                    mangas.push(manga);
                }
            } catch (e) {
                bridge.log("MyComic list item error: " + e);
            }
        }.bind(this));

        var hasNext = doc.selectFirst("nav[role=navigation] a[rel=next], a[rel=next]") !== null;
        bridge.domReleaseAll();
        return new MangasPage(mangas, hasNext);
    },

    _parseRankList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return new MangasPage([], false);

        var mangas = [];
        var seen = {};
        var links = doc.select("table > tbody > tr > td:nth-child(2) a[href*='/comics/']");

        links.forEach(function(link) {
            var manga = SManga.create();
            manga.url = this._relativeUrl(link.absUrl("href") || link.attr("href"));
            manga.title = link.text().trim();
            if (manga.url && manga.title && !seen[manga.url]) {
                seen[manga.url] = true;
                mangas.push(manga);
            }
        }.bind(this));

        bridge.domReleaseAll();
        return new MangasPage(mangas, false);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var html = bridge.httpGetWithHeaders(this._absoluteUrl(manga.url), this.headers);
        if (!html || html.error || this._isBlocked(html)) return manga;

        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return manga;

        var card = doc.selectFirst("div[data-flux-card]");
        if (!card) {
            bridge.domReleaseAll();
            return manga;
        }

        var result = SManga.create();
        result.url = manga.url;
        result.initialized = true;

        var titleElement = card.selectFirst("[data-flux-heading]");
        result.title = titleElement ? titleElement.text().trim() : manga.title || "";

        var cover = card.selectFirst("img.object-cover, img");
        result.thumbnailUrl = cover ? this._imageUrl(cover) : manga.thumbnailUrl || null;

        var statusElement = card.selectFirst("[data-flux-badge]");
        result.status = this._parseStatus(statusElement ? statusElement.text() : "");

        var authors = [];
        var authorLinks = card.select("a[href*='filter%5Bauthor%5D'], a[href*='filter[author]']");
        authorLinks.forEach(function(link) {
            var name = link.text().trim();
            if (name && authors.indexOf(name) === -1) authors.push(name);
        });
        result.author = authors.length > 0 ? authors.join(", ") : null;

        var genres = [];
        var genreLinks = card.select(
            "a[href*='filter%5Btag%5D'], a[href*='filter[tag]'], " +
            "a[href*='filter%5Baudience%5D'], a[href*='filter[audience]'], " +
            "a[href*='filter%5Bcountry%5D'], a[href*='filter[country]']"
        );
        genreLinks.forEach(function(link) {
            var name = link.text().trim();
            if (name && genres.indexOf(name) === -1) genres.push(name);
        });
        result.genre = genres.length > 0 ? genres : null;

        var description = doc.selectFirst("meta[name=description]");
        result.description = description ? description.attr("content").trim() : null;

        bridge.domReleaseAll();
        return result;
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var html = bridge.httpGetWithHeaders(this._absoluteUrl(manga.url), this.headers);
        if (!html || html.error || this._isBlocked(html)) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return [];

        var chapters = [];
        var seen = {};
        var dateUpload = this._parseDate(doc.selectFirst("time[datetime]"));
        var groups = doc.select("div[data-flux-card] + div div[x-data]");

        groups.forEach(function(group) {
            try {
                var groupName = "";
                var heading = group.selectFirst("> div:first-child > div:first-child");
                if (heading) groupName = heading.text().trim();

                var chapterData = this._extractChapterData(group.attr("x-data"));
                for (var i = 0; i < chapterData.length; i++) {
                    var data = chapterData[i];
                    var chapterUrl = "/chapters/" + data.id;
                    if (!data.id || seen[chapterUrl]) continue;
                    seen[chapterUrl] = true;

                    var chapter = SChapter.create();
                    chapter.url = chapterUrl;
                    chapter.name = String(data.title || "").trim() || ("Chapter " + data.id);
                    chapter.scanlator = groupName || null;
                    chapter.dateUpload = dateUpload;
                    chapter.chapterNumber = this._chapterNumber(chapter.name, chapters.length);
                    chapters.push(chapter);
                }
            } catch (e) {
                bridge.log("MyComic chapter group error: " + e);
            }
        }.bind(this));

        // Future-proof fallback for server-rendered chapter links.
        if (chapters.length === 0) {
            var links = doc.select("div[data-flux-card] + div a[href*='/chapters/']");
            links.forEach(function(link, index) {
                var chapterUrl = this._relativeUrl(link.absUrl("href") || link.attr("href"));
                var name = link.text().trim();
                if (!chapterUrl || !name || seen[chapterUrl]) return;
                seen[chapterUrl] = true;

                var chapter = SChapter.create();
                chapter.url = chapterUrl;
                chapter.name = name;
                chapter.dateUpload = dateUpload;
                chapter.chapterNumber = this._chapterNumber(name, index);
                chapters.push(chapter);
            }.bind(this));
        }

        bridge.domReleaseAll();
        return chapters;
    },

    _extractChapterData: function(xData) {
        var value = this._decodeEntities(String(xData || ""));
        var match = value.match(/chapters\s*:\s*(\[\{[\s\S]*?\}\])/);
        if (!match || !match[1]) return [];

        try {
            var data = JSON.parse(match[1]);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            bridge.log("MyComic chapter JSON error: " + e);
            return [];
        }
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var html = bridge.httpGetWithHeaders(this._absoluteUrl(chapter.url), this.headers);
        if (!html || html.error || this._isBlocked(html)) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        if (!doc) return [];

        var pages = [];
        var seen = {};
        var images = doc.select("img[x-ref], img.page");

        images.forEach(function(image) {
            var imageUrl = this._imageUrl(image);
            if (!imageUrl || imageUrl.indexOf("data:image") === 0 || seen[imageUrl]) return;
            seen[imageUrl] = true;
            pages.push(new Page(pages.length, "", imageUrl));
        }.bind(this));

        bridge.domReleaseAll();
        return pages;
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "排序", values: this._filterLabels(this.filterOptions.sorts), state: 0 },
            { type: "separator" },
            { type: "header", name: "分類篩選" },
            { type: "select", name: "作品地區", values: this._filterLabels(this.filterOptions.regions), state: 0 },
            { type: "select", name: "作品類型", values: this._filterLabels(this.filterOptions.tags), state: 0 },
            { type: "select", name: "適合受眾", values: this._filterLabels(this.filterOptions.audiences), state: 0 },
            { type: "select", name: "出品年份", values: this._filterLabels(this.filterOptions.years), state: 0 },
            { type: "select", name: "目前進度", values: this._filterLabels(this.filterOptions.statuses), state: 0 }
        ];
    },

    // ======== Helpers ========

    _filterCode: function(options, state) {
        var index = parseInt(state || 0, 10);
        if (index < 0 || index >= options.length) return "";
        return options[index].code || "";
    },

    _filterLabels: function(options) {
        var labels = [];
        for (var i = 0; i < options.length; i++) labels.push(options[i].label);
        return labels;
    },

    _imageUrl: function(image) {
        if (!image) return "";
        var url = image.attr("data-src") || image.attr("src") || "";
        if (url && url.indexOf("data:image") === 0) {
            url = image.attr("data-src") || "";
        }
        return this._absoluteUrl(url);
    },

    _absoluteUrl: function(url) {
        if (!url) return "";
        var value = String(url).replace(/&amp;/g, "&").trim();
        if (value.indexOf("//") === 0) return "https:" + value;
        if (value.indexOf("http://") === 0 || value.indexOf("https://") === 0) return value;
        if (value.charAt(0) !== "/") value = "/" + value;
        return this.baseUrl + value;
    },

    _relativeUrl: function(url) {
        if (!url) return "";
        var value = String(url).replace(/&amp;/g, "&").trim();
        if (value.indexOf(this.baseUrl) === 0) value = value.substring(this.baseUrl.length);
        return value || "/";
    },

    _parseStatus: function(text) {
        var value = String(text || "");
        if (value.indexOf("已完結") !== -1 || value.indexOf("已完结") !== -1) return SManga.COMPLETED;
        if (value.indexOf("連載中") !== -1 || value.indexOf("连载中") !== -1) return SManga.ONGOING;
        return SManga.UNKNOWN;
    },

    _parseDate: function(timeElement) {
        if (!timeElement) return 0;
        var value = timeElement.attr("datetime") || timeElement.text();
        if (!value) return 0;
        var timestamp = new Date(value + (value.length === 10 ? "T00:00:00Z" : "")).getTime();
        return isNaN(timestamp) ? 0 : timestamp;
    },

    _chapterNumber: function(name, fallbackIndex) {
        var match = String(name || "").match(/(?:第|連載|连载)?\s*(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : fallbackIndex + 1;
    },

    _decodeEntities: function(value) {
        return String(value || "")
            .replace(/&quot;/g, "\"")
            .replace(/&#34;/g, "\"")
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
    },

    _isBlocked: function(html) {
        var value = String(html || "").toLowerCase();
        var blocked = value.indexOf("sorry, you have been blocked") !== -1 ||
            (value.indexOf("cloudflare") !== -1 && value.indexOf("cf-error-details") !== -1);
        if (blocked) {
            bridge.log("MyComic is blocked by Cloudflare. Complete browser verification or enable the source proxy, then retry.");
        }
        return blocked;
    }
};
