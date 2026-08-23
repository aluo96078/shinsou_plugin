// 漫画柜 (ManHuaGui) Plugin for Mihon iOS
// Crawls https://tw.manhuagui.com

var source = {
    baseUrl: "https://tw.manhuagui.com",
    cdnUrl: "https://i.hamreus.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://tw.manhuagui.com/"
    },
    filterOptions: {
        regions: [
            { label: "全部", code: "" },
            { label: "日本", code: "japan" },
            { label: "港臺", code: "hongkong" },
            { label: "其它", code: "other" },
            { label: "歐美", code: "europe" },
            { label: "內地", code: "china" },
            { label: "韓國", code: "korea" }
        ],
        genres: [
            { label: "全部", code: "" },
            { label: "熱血", code: "rexue" },
            { label: "冒險", code: "maoxian" },
            { label: "魔幻", code: "mohuan" },
            { label: "神鬼", code: "shengui" },
            { label: "搞笑", code: "gaoxiao" },
            { label: "萌系", code: "mengxi" },
            { label: "愛情", code: "aiqing" },
            { label: "科幻", code: "kehuan" },
            { label: "魔法", code: "mofa" },
            { label: "格鬥", code: "gedou" },
            { label: "武俠", code: "wuxia" },
            { label: "機戰", code: "jizhan" },
            { label: "戰爭", code: "zhanzheng" },
            { label: "競技", code: "jingji" },
            { label: "體育", code: "tiyu" },
            { label: "校園", code: "xiaoyuan" },
            { label: "生活", code: "shenghuo" },
            { label: "勵志", code: "lizhi" },
            { label: "歷史", code: "lishi" },
            { label: "偽娘", code: "weiniang" },
            { label: "宅男", code: "zhainan" },
            { label: "腐女", code: "funv" },
            { label: "耽美", code: "danmei" },
            { label: "百合", code: "baihe" },
            { label: "後宮", code: "hougong" },
            { label: "治癒", code: "zhiyu" },
            { label: "美食", code: "meishi" },
            { label: "推理", code: "tuili" },
            { label: "懸疑", code: "xuanyi" },
            { label: "恐怖", code: "kongbu" },
            { label: "四格", code: "sige" },
            { label: "職場", code: "zhichang" },
            { label: "偵探", code: "zhentan" },
            { label: "社會", code: "shehui" },
            { label: "音樂", code: "yinyue" },
            { label: "舞蹈", code: "wudao" },
            { label: "雜誌", code: "zazhi" },
            { label: "黑道", code: "heidao" }
        ],
        audiences: [
            { label: "全部", code: "" },
            { label: "少女", code: "shaonv" },
            { label: "少年", code: "shaonian" },
            { label: "青年", code: "qingnian" },
            { label: "兒童", code: "ertong" },
            { label: "通用", code: "tongyong" }
        ],
        years: [
            { label: "全部", code: "" },
            { label: "2026年", code: "2026" },
            { label: "2025年", code: "2025" },
            { label: "2024年", code: "2024" },
            { label: "2023年", code: "2023" },
            { label: "2022年", code: "2022" },
            { label: "2021年", code: "2021" },
            { label: "2020年", code: "2020" },
            { label: "2019年", code: "2019" },
            { label: "2018年", code: "2018" },
            { label: "2017年", code: "2017" },
            { label: "2016年", code: "2016" },
            { label: "2015年", code: "2015" },
            { label: "2014年", code: "2014" },
            { label: "2013年", code: "2013" },
            { label: "2012年", code: "2012" },
            { label: "2011年", code: "2011" },
            { label: "2010年", code: "2010" },
            { label: "00年代", code: "200x" },
            { label: "90年代", code: "199x" },
            { label: "80年代", code: "198x" },
            { label: "更早", code: "197x" }
        ],
        letters: [
            { label: "全部", code: "" },
            { label: "A", code: "a" },
            { label: "B", code: "b" },
            { label: "C", code: "c" },
            { label: "D", code: "d" },
            { label: "E", code: "e" },
            { label: "F", code: "f" },
            { label: "G", code: "g" },
            { label: "H", code: "h" },
            { label: "I", code: "i" },
            { label: "J", code: "j" },
            { label: "K", code: "k" },
            { label: "L", code: "l" },
            { label: "M", code: "m" },
            { label: "N", code: "n" },
            { label: "O", code: "o" },
            { label: "P", code: "p" },
            { label: "Q", code: "q" },
            { label: "R", code: "r" },
            { label: "S", code: "s" },
            { label: "T", code: "t" },
            { label: "U", code: "u" },
            { label: "V", code: "v" },
            { label: "W", code: "w" },
            { label: "X", code: "x" },
            { label: "Y", code: "y" },
            { label: "Z", code: "z" },
            { label: "0-9", code: "0-9" }
        ],
        statuses: [
            { label: "全部", code: "" },
            { label: "連載", code: "lianzai" },
            { label: "完結", code: "wanjie" }
        ],
        sorts: [
            { label: "最新發布", code: "index" },
            { label: "最新更新", code: "update" },
            { label: "人氣最旺", code: "view" },
            { label: "評分最高", code: "rate" }
        ]
    },

    // Small FIFO cache to collapse repeat requests for the same URL.
    // - Manga detail pages: 60s TTL covers "open detail -> load chapters".
    // - List pages: 15s TTL covers "browse list -> open manga -> return" without
    //   serving noticeably stale updates.
    _htmlCache: {},
    _htmlCacheOrder: [],
    _HTML_CACHE_MAX: 4,
    _MANGA_CACHE_TTL_MS: 60000,
    _LIST_CACHE_TTL_MS: 15000,

    _getCachedHtml: function(url, ttl) {
        var now = Date.now();
        var entry = this._htmlCache[url];
        if (entry && entry.expiresAt > now) {
            return entry.html;
        }
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return html;

        this._htmlCache[url] = { html: html, expiresAt: now + ttl };
        var order = this._htmlCacheOrder;
        var idx = order.indexOf(url);
        if (idx !== -1) order.splice(idx, 1);
        order.push(url);
        while (order.length > this._HTML_CACHE_MAX) {
            var evicted = order.shift();
            delete this._htmlCache[evicted];
        }
        return html;
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/list/view_p" + (page + 1) + ".html";
        var html = this._getCachedHtml(url, this._LIST_CACHE_TTL_MS);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/list/update_p" + (page + 1) + ".html";
        var html = this._getCachedHtml(url, this._LIST_CACHE_TTL_MS);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url;

        if (query && query.trim()) {
            url = this.baseUrl + "/s/" + encodeURIComponent(query.trim()) + "_p" + (page + 1) + ".html";
        } else {
            url = this._buildFilteredListUrl(page, filters);
        }

        var html = this._getCachedHtml(url, this._LIST_CACHE_TTL_MS);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== List Parser ========

    _parseList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];

        // Rank page items
        var items = doc.select("ul#contList li, .book-list li, li.cf");

        if (items.isEmpty()) {
            items = doc.select(".rank-list li");
        }

        items.forEach(function(item) {
            try {
                var link = item.selectFirst("a[href*='/comic/']");
                if (!link) return;

                var manga = SManga.create();
                manga.url = link.attr("href");

                // Title
                manga.title = link.attr("title") || link.text().trim();

                // Thumbnail
                var img = item.selectFirst("img");
                if (img) {
                    manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                    if (manga.thumbnailUrl && manga.thumbnailUrl.indexOf("//") === 0) {
                        manga.thumbnailUrl = "https:" + manga.thumbnailUrl;
                    }
                }

                if (manga.url && manga.title) {
                    mangas.push(manga);
                }
            } catch(e) {
                bridge.log("manhuagui list item parse failed: " + e);
            }
        });

        // Pagination: rely solely on the explicit "next" link with an href.
        // Avoid count-based heuristics, which over-request on exact-30 tail pages.
        var hasNext = false;
        var nextBtn = doc.selectFirst("a.next, a.prev:contains(下一頁), a:contains(下一頁), a:contains(下一页)");
        if (nextBtn && nextBtn.hasAttr("href")) {
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

        var html = this._getCachedHtml(url, this._MANGA_CACHE_TTL_MS);
        if (!html || html.error) return manga;

        var doc = Jsoup.parse(html, this.baseUrl);
        var result = SManga.create();
        result.url = manga.url;
        result.initialized = true;

        // Title
        var titleEl = doc.selectFirst(".book-title h1");
        result.title = titleEl ? titleEl.text().trim() : manga.title || "";

        // Cover
        var coverEl = doc.selectFirst("p.hcover img");
        if (coverEl) {
            result.thumbnailUrl = coverEl.attr("data-src") || coverEl.attr("src") || "";
            if (result.thumbnailUrl && result.thumbnailUrl.indexOf("//") === 0) {
                result.thumbnailUrl = "https:" + result.thumbnailUrl;
            }
        }

        // Author
        var detailList = doc.select("ul.detail-list li");
        detailList.forEach(function(li) {
            var label = li.selectFirst("span:first-child strong");
            if (!label) return;
            var labelText = label.text().trim();

            if (labelText.indexOf("作者") !== -1 || labelText.indexOf("漫畫作者") !== -1) {
                var authorLinks = li.select("span:nth-child(2) a");
                var authors = [];
                authorLinks.forEach(function(a) {
                    authors.push(a.text().trim());
                });
                if (authors.length > 0) {
                    result.author = authors.join(", ");
                }
            }

            if (labelText.indexOf("類型") !== -1 || labelText.indexOf("漫畫類型") !== -1) {
                var genreLinks = li.select("span:first-child a");
                var genres = [];
                genreLinks.forEach(function(a) {
                    genres.push(a.text().trim());
                });
                if (genres.length > 0) {
                    result.genre = genres;
                }
            }
        });

        // Status
        var statusEl = doc.selectFirst("li.status span span");
        if (statusEl) {
            var statusText = statusEl.text();
            if (statusText.indexOf("完結") !== -1 || statusText.indexOf("完结") !== -1) {
                result.status = SManga.COMPLETED;
            } else if (statusText.indexOf("連載") !== -1 || statusText.indexOf("连载") !== -1) {
                result.status = SManga.ONGOING;
            }
        }

        // Description
        var descEl = doc.selectFirst("#intro-all, #intro-cut");
        if (descEl) {
            result.description = descEl.text().trim();
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

        var html = this._getCachedHtml(url, this._MANGA_CACHE_TTL_MS);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var chapters = [];

        // Chapter sections
        var chapterLinks = doc.select("div[id*='chapter-list'] ul li a");

        if (chapterLinks.isEmpty()) {
            chapterLinks = doc.select(".chapter-list a");
        }

        var num = chapterLinks.size();
        chapterLinks.forEach(function(el) {
            try {
                var chapter = SChapter.create();
                chapter.url = el.attr("href");
                chapter.name = el.attr("title") || el.text().trim();
                chapter.chapterNumber = num;
                num--;

                // Only override the descending sequence number when the name
                // carries an explicit chapter marker (話/话/章/回). This avoids
                // collisions from volume entries ("第01卷") and incidental
                // digits (year numbers, subtitles) that the old greedy match
                // used to treat as chapter numbers.
                var numMatch = chapter.name.match(/第?\s*(\d+(?:\.\d+)?)\s*[話话章回]/);
                if (numMatch) {
                    chapter.chapterNumber = parseFloat(numMatch[1]);
                }

                if (chapter.url && chapter.name) {
                    chapters.push(chapter);
                }
            } catch(e) {
                bridge.log("manhuagui chapter parse failed: " + e);
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

        // ManHuaGui packs image data with eval(function(p,a,c,k,e,d){...})
        // The k array is LZString base64 compressed, split via custom String.prototype.splic method
        // After unpacking, result is: SMH.imgData({...}).preInit();

        var pages = [];

        // Extract packed JS components: p template, a (radix), c (count), k data (LZString base64)
        // Handles both .split('|') and hex-escaped ['\x73\x70\x6c\x69\x63']('\x7c') formats
        var packedMatch = html.match(/\}\s*\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']+)'/);

        if (!packedMatch) {
            bridge.log("manhuagui: packed image data not found in chapter page");
        }

        if (packedMatch) {
            var p = packedMatch[1];
            var a = parseInt(packedMatch[2]);
            var c = parseInt(packedMatch[3]);
            var kRaw = packedMatch[4];

            // The k data is LZString base64 compressed; decompress then split by '|'
            var decompressed = this._lzDecompress(kRaw);
            var k;
            if (decompressed && decompressed.indexOf("|") !== -1) {
                k = decompressed.split("|");
            } else {
                // Fallback: plain '|'-separated data
                k = kRaw.split("|");
            }

            // Unpack p template with k word array
            var unpacked = this._unpack(p, a, c, k);

            if (unpacked) {
                // Extract JSON from: SMH.imgData({...}).preInit();
                var start = unpacked.indexOf("({");
                var end = unpacked.indexOf("})");
                if (start !== -1 && end !== -1) {
                    try {
                        var imgData = JSON.parse(unpacked.substring(start + 1, end + 1));
                        var path = imgData.path || "";
                        var files = imgData.files || [];
                        var sl = imgData.sl || {};

                        // Encode path segments (may contain un-encoded Chinese characters)
                        // but preserve '/' separators so the URL stays valid.
                        var encodedPath = path.split('/').map(function(seg) {
                            return seg ? encodeURIComponent(seg) : '';
                        }).join('/');

                        for (var i = 0; i < files.length; i++) {
                            // files[i] is already percent-encoded from the packed JS
                            var imgUrl = this.cdnUrl + encodedPath + files[i];
                            if (sl.e) {
                                imgUrl += "?e=" + sl.e + "&m=" + (sl.m || "");
                            }
                            pages.push(new Page(i, "", imgUrl));
                        }
                    } catch(e) {
                        bridge.log("ManHuaGui JSON parse error: " + e);
                    }
                }
            }
        }

        return pages;
    },

    // ======== p,a,c,k,e,d unpacker ========

    _unpack: function(p, a, c, k) {
        // Build token -> value map once, then do a single tokenized pass over p.
        // O(|p|) instead of O(c * |p|) — meaningful when c reaches thousands.
        var map = {};
        for (var i = 0; i < c; i++) {
            if (k[i]) {
                map[this._itoa(i, a)] = k[i];
            }
        }
        return p.replace(/\b\w+\b/g, function(token) {
            var v = map[token];
            return v !== undefined ? v : token;
        });
    },

    _itoa: function(num, radix) {
        var result = "";
        var digits = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (num === 0) return "0";

        while (num > 0) {
            result = digits.charAt(num % radix) + result;
            num = Math.floor(num / radix);
        }
        return result;
    },

    // ======== LZString Base64 decompression ========

    _lzDecompress: function(input) {
        if (!input || input === "") return "";

        var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        var reverseDict = {};
        for (var i = 0; i < keyStr.length; i++) {
            reverseDict[keyStr.charAt(i)] = i;
        }

        // Convert base64 to data stream
        var length = input.length;
        var resetValue = 32;
        var getNextValue = function(index) {
            return reverseDict[input.charAt(index)];
        };

        var dictionary = {};
        var enlargeIn = 4;
        var dictSize = 4;
        var numBits = 3;
        var entry = "";
        var result = [];
        var w = "";
        var c = "";

        var data_val = getNextValue(0);
        var data_position = resetValue;
        var data_index = 1;

        var bits, resb, maxpower, power;

        for (var ii = 0; ii < 3; ii++) {
            dictionary[ii] = ii;
        }

        // Read first entry
        bits = 0;
        maxpower = Math.pow(2, 2);
        power = 1;
        while (power !== maxpower) {
            resb = data_val & data_position;
            data_position >>= 1;
            if (data_position === 0) {
                data_position = resetValue;
                data_val = getNextValue(data_index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
        }

        switch (bits) {
            case 0:
                bits = 0;
                maxpower = Math.pow(2, 8);
                power = 1;
                while (power !== maxpower) {
                    resb = data_val & data_position;
                    data_position >>= 1;
                    if (data_position === 0) {
                        data_position = resetValue;
                        data_val = getNextValue(data_index++);
                    }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                c = String.fromCharCode(bits);
                break;
            case 1:
                bits = 0;
                maxpower = Math.pow(2, 16);
                power = 1;
                while (power !== maxpower) {
                    resb = data_val & data_position;
                    data_position >>= 1;
                    if (data_position === 0) {
                        data_position = resetValue;
                        data_val = getNextValue(data_index++);
                    }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                c = String.fromCharCode(bits);
                break;
            case 2:
                return "";
        }

        dictionary[3] = c;
        w = c;
        result.push(c);

        while (true) {
            if (data_index > length) return "";

            bits = 0;
            maxpower = Math.pow(2, numBits);
            power = 1;
            while (power !== maxpower) {
                resb = data_val & data_position;
                data_position >>= 1;
                if (data_position === 0) {
                    data_position = resetValue;
                    data_val = getNextValue(data_index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
            }

            var cc = bits;
            switch (cc) {
                case 0:
                    bits = 0;
                    maxpower = Math.pow(2, 8);
                    power = 1;
                    while (power !== maxpower) {
                        resb = data_val & data_position;
                        data_position >>= 1;
                        if (data_position === 0) {
                            data_position = resetValue;
                            data_val = getNextValue(data_index++);
                        }
                        bits |= (resb > 0 ? 1 : 0) * power;
                        power <<= 1;
                    }
                    dictionary[dictSize++] = String.fromCharCode(bits);
                    cc = dictSize - 1;
                    enlargeIn--;
                    break;
                case 1:
                    bits = 0;
                    maxpower = Math.pow(2, 16);
                    power = 1;
                    while (power !== maxpower) {
                        resb = data_val & data_position;
                        data_position >>= 1;
                        if (data_position === 0) {
                            data_position = resetValue;
                            data_val = getNextValue(data_index++);
                        }
                        bits |= (resb > 0 ? 1 : 0) * power;
                        power <<= 1;
                    }
                    dictionary[dictSize++] = String.fromCharCode(bits);
                    cc = dictSize - 1;
                    enlargeIn--;
                    break;
                case 2:
                    return result.join("");
            }

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits++;
            }

            if (dictionary[cc]) {
                entry = dictionary[cc];
            } else {
                if (cc === dictSize) {
                    entry = w + w.charAt(0);
                } else {
                    return null;
                }
            }
            result.push(entry);

            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn--;

            if (enlargeIn === 0) {
                enlargeIn = Math.pow(2, numBits);
                numBits++;
            }

            w = entry;
        }
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "排序", values: this._filterLabels(this.filterOptions.sorts), state: 0 },

            { type: "separator" },
            { type: "header", name: "分類篩選" },
            { type: "select", name: "地區", values: this._filterLabels(this.filterOptions.regions), state: 0 },
            { type: "select", name: "劇情", values: this._filterLabels(this.filterOptions.genres), state: 0 },
            { type: "select", name: "受眾", values: this._filterLabels(this.filterOptions.audiences), state: 0 },
            { type: "select", name: "年份", values: this._filterLabels(this.filterOptions.years), state: 0 },
            { type: "select", name: "字母", values: this._filterLabels(this.filterOptions.letters), state: 0 },
            { type: "select", name: "進度", values: this._filterLabels(this.filterOptions.statuses), state: 0 }
        ];
    },

    _buildFilteredListUrl: function(page, filters) {
        var sort = "index";
        var segments = [];
        var region = "";
        var genre = "";
        var audience = "";
        var year = "";
        var letter = "";
        var status = "";

        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var f = filters[i];
                if (!f || f.type !== "select") continue;

                if (f.name === "排序") {
                    sort = this._filterCode(this.filterOptions.sorts, f.state) || "index";
                } else if (f.name === "地區") {
                    region = this._filterCode(this.filterOptions.regions, f.state);
                } else if (f.name === "劇情") {
                    genre = this._filterCode(this.filterOptions.genres, f.state);
                } else if (f.name === "受眾") {
                    audience = this._filterCode(this.filterOptions.audiences, f.state);
                } else if (f.name === "年份") {
                    year = this._filterCode(this.filterOptions.years, f.state);
                } else if (f.name === "字母") {
                    letter = this._filterCode(this.filterOptions.letters, f.state);
                } else if (f.name === "進度") {
                    status = this._filterCode(this.filterOptions.statuses, f.state);
                }
            }
        }

        if (region) segments.push(region);
        if (genre) segments.push(genre);
        if (audience) segments.push(audience);
        if (year) segments.push(year);
        if (letter) segments.push(letter);
        if (status) segments.push(status);

        var slug = segments.join("_");
        var base = this.baseUrl + "/list/" + (slug ? slug + "/" : "");
        var pageNum = page + 1;

        if (pageNum <= 1) {
            return sort === "index" ? base : base + sort + ".html";
        }
        return base + sort + "_p" + pageNum + ".html";
    },

    _filterCode: function(options, state) {
        var idx = parseInt(state || 0, 10);
        if (idx < 0 || idx >= options.length) return "";
        return options[idx].code || "";
    },

    _filterLabels: function(options) {
        var values = [];
        options.forEach(function(item) {
            values.push(item.label);
        });
        return values;
    }
};
