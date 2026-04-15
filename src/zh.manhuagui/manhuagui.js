// 漫画柜 (ManHuaGui) Plugin for Mihon iOS
// Crawls https://tw.manhuagui.com

var source = {
    baseUrl: "https://tw.manhuagui.com",
    cdnUrl: "https://i.hamreus.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://tw.manhuagui.com/"
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
            url = this.baseUrl + "/list/update_p" + (page + 1) + ".html";
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
        var nextBtn = doc.selectFirst("a.next");
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
        return [];
    }
};
