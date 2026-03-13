// 漫画柜 (ManHuaGui) Plugin for Mihon iOS
// Crawls https://tw.manhuagui.com

var source = {
    baseUrl: "https://tw.manhuagui.com",
    cdnUrl: "https://i.hamreus.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://tw.manhuagui.com/"
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/rank/";
        if (page > 0) {
            url = this.baseUrl + "/list/view_p" + (page + 1) + ".html";
        }
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/list/update_p" + (page + 1) + ".html";
        var html = bridge.httpGetWithHeaders(url, this.headers);
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

        var html = bridge.httpGetWithHeaders(url, this.headers);
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
            } catch(e) {}
        });

        // Pagination
        var hasNext = false;
        var nextBtn = doc.selectFirst("a.next, a:contains(下一頁)");
        if (nextBtn) {
            hasNext = true;
        }
        if (mangas.length >= 30) {
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

        var html = bridge.httpGetWithHeaders(url, this.headers);
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

                // Try to extract chapter number
                var numMatch = chapter.name.match(/(\d+(?:\.\d+)?)/);
                if (numMatch) {
                    chapter.chapterNumber = parseFloat(numMatch[1]);
                }

                if (chapter.url && chapter.name) {
                    chapters.push(chapter);
                }
            } catch(e) {}
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

        // ManHuaGui uses eval(function(p,a,c,k,e,d){...}) to pack image data
        // Then LZString.decompressFromBase64 to decode the actual image paths

        var pages = [];

        // Step 1: Extract the packed JS from the page
        var packedMatch = html.match(/\}\s*\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']+)'\.split\s*\(\s*'([^']+)'\s*\)/);

        if (packedMatch) {
            var p = packedMatch[1];
            var a = parseInt(packedMatch[2]);
            var c = parseInt(packedMatch[3]);
            var k = packedMatch[4].split(packedMatch[5]);

            // Unpack
            var unpacked = this._unpack(p, a, c, k);

            if (unpacked) {
                // Extract the LZString base64 encoded data
                var lzMatch = unpacked.match(/\(["']([A-Za-z0-9+/=]+)["']\)/);
                if (lzMatch) {
                    var decompressed = this._lzDecompress(lzMatch[1]);
                    if (decompressed) {
                        try {
                            var imgData = JSON.parse(decompressed);
                            var path = imgData.path || "";
                            var files = imgData.files || [];
                            var sl = imgData.sl || {};

                            for (var i = 0; i < files.length; i++) {
                                var imgUrl = this.cdnUrl + path + files[i];
                                if (sl.e) {
                                    imgUrl += "?e=" + sl.e + "&m=" + sl.m;
                                }
                                pages.push(new Page(i, "", imgUrl));
                            }
                        } catch(e) {
                            bridge.log("ManHuaGui JSON parse error: " + e);
                        }
                    }
                }

                // Fallback: try direct JSON extraction
                if (pages.length === 0) {
                    var jsonMatch = unpacked.match(/\{[^{]*"files"\s*:\s*\[[^\]]+\][^}]*\}/);
                    if (jsonMatch) {
                        try {
                            var data = JSON.parse(jsonMatch[0]);
                            var path2 = data.path || "";
                            var files2 = data.files || [];
                            for (var j = 0; j < files2.length; j++) {
                                pages.push(new Page(j, "", this.cdnUrl + path2 + files2[j]));
                            }
                        } catch(e2) {}
                    }
                }
            }
        }

        return pages;
    },

    // ======== p,a,c,k,e,d unpacker ========

    _unpack: function(p, a, c, k) {
        // JavaScript p,a,c,k,e,d unpacker
        while (c--) {
            if (k[c]) {
                var pattern = new RegExp("\\b" + this._itoa(c, a) + "\\b", "g");
                p = p.replace(pattern, k[c]);
            }
        }
        return p;
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
