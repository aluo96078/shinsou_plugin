// 動漫屋 (Dm5) Plugin for Mihon iOS
// Crawls https://www.dm5.com

var source = {
    baseUrl: "https://www.dm5.com",
    supportsLatest: true,
    headers: {
        "Referer": "https://www.dm5.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": "isAdult=1;fastshow=true;ComicHistoryitem_zh=ViewType%3D1"
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/manhua-rank/?t=1&p=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/manhua-new/?p=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url;
        if (query && query.trim()) {
            url = this.baseUrl + "/search?title=" + encodeURIComponent(query.trim()) + "&language=1&page=" + (page + 1);
        } else {
            var category = "";
            var area = "";
            var status = "";

            if (filters && filters.length > 0) {
                for (var i = 0; i < filters.length; i++) {
                    var f = filters[i];
                    if (!f || !f.type) continue;

                    if (f.type === "select" && f.name === "Genre") {
                        var genres = [
                            "", "31", "26", "1", "2", "3", "4", "5", "6", "7",
                            "8", "9", "10", "11", "12", "13", "14", "15", "16",
                            "17", "18", "19", "20", "21", "22", "23", "24", "25"
                        ];
                        if (f.state > 0 && f.state < genres.length) {
                            category = genres[f.state];
                        }
                    }

                    if (f.type === "select" && f.name === "Area") {
                        var areas = ["", "35", "36", "37", "38"];
                        // 0=All, 1=日本, 2=韩国, 3=欧美, 4=国漫
                        if (f.state > 0 && f.state < areas.length) {
                            area = areas[f.state];
                        }
                    }

                    if (f.type === "select" && f.name === "Status") {
                        var statuses = ["", "2309", "2310"];
                        // 0=All, 1=连载, 2=完结
                        if (f.state > 0 && f.state < statuses.length) {
                            status = statuses[f.state];
                        }
                    }
                }
            }

            url = this.baseUrl + "/manhua-list";
            var params = [];
            if (category) params.push("tag=" + category);
            if (area) params.push("area=" + area);
            if (status) params.push("st=" + status);
            params.push("p=" + (page + 1));
            url += "?" + params.join("&");
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseList(html);
    },

    // ======== List Parser ========

    _parseList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];
        var seen = {};

        // Select <li> items from the manga list (rank, latest, search, browse)
        var items = doc.select("ul.mh-list > li");

        if (items.isEmpty()) {
            // Search results page uses different structure
            items = doc.select(".banner_detail_form .info");
        }

        items.forEach(function(item) {
            try {
                // Get the main mh-item div (not the tooltip mh-item-tip)
                var mhItem = item.selectFirst("div.mh-item");
                if (!mhItem) mhItem = item;

                // Title & URL from .mh-item-detali h2.title a
                var titleLink = mhItem.selectFirst(".mh-item-detali h2.title a");
                if (!titleLink) {
                    titleLink = mhItem.selectFirst("h2.title a, .title a");
                }
                if (!titleLink) {
                    titleLink = mhItem.selectFirst("a[href*='manhua-']");
                }
                if (!titleLink) return;

                var manga = SManga.create();
                manga.url = titleLink.attr("href");
                manga.title = titleLink.attr("title") || titleLink.text().trim();

                // Deduplicate
                if (!manga.url || !manga.title || seen[manga.url]) return;
                seen[manga.url] = true;

                // Thumbnail: dm5 uses background-image on p.mh-cover (NOT <img>)
                // Only match the direct cover, not the tooltip cover (.mh-cover.tip)
                var cover = mhItem.selectFirst("p.mh-cover:not(.tip)");
                if (cover) {
                    var style = cover.attr("style");
                    if (style) {
                        var urlMatch = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
                        if (urlMatch) {
                            manga.thumbnailUrl = urlMatch[1];
                        }
                    }
                }

                // Fallback: try <img> tag (some pages might use it)
                if (!manga.thumbnailUrl) {
                    var img = mhItem.selectFirst("img:not(.mh-tip-wrap img)");
                    if (img) {
                        manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                    }
                }

                mangas.push(manga);
            } catch(e) {
                bridge.log("Dm5 parse error: " + e);
            }
        });

        // Pagination: search/browse pages use div.page-pagination
        // Rank and latest pages load all items at once (no pagination)
        var hasNext = false;
        var paginationLinks = doc.select("div.page-pagination a");
        if (!paginationLinks.isEmpty()) {
            // The last link is the ">" (next page) button
            var lastLink = paginationLinks.last();
            if (lastLink) {
                var linkText = lastLink.text().trim();
                var linkHref = lastLink.attr("href");
                // Check if there's a next page link (text contains ">")
                if (linkText.indexOf(">") !== -1 && linkHref && linkHref.indexOf("javascript") === -1) {
                    hasNext = true;
                }
            }
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

        // Title: p.title contains title text + child spans (score etc.)
        var titleEl = doc.selectFirst(".banner_detail_form .info p.title");
        if (titleEl) {
            result.title = titleEl.ownText().trim();
        }
        if (!result.title) {
            result.title = manga.title || "";
        }

        // Cover: .banner_detail_form .cover img (actual <img> tag on detail page)
        var coverEl = doc.selectFirst(".banner_detail_form .cover img");
        if (coverEl) {
            result.thumbnailUrl = coverEl.attr("src") || coverEl.attr("data-src") || "";
        }

        // Author: p.subtitle contains "作者：" + <a> links
        var authorEls = doc.select(".banner_detail_form .info p.subtitle a");
        if (!authorEls.isEmpty()) {
            var authors = [];
            authorEls.forEach(function(a) {
                var name = a.text().trim();
                if (name) authors.push(name);
            });
            if (authors.length > 0) {
                result.author = authors.join(", ");
            }
        }

        // Description: p.content text (may have hidden span with full text)
        var descEl = doc.selectFirst(".banner_detail_form .info p.content");
        if (descEl) {
            // Remove fold buttons before extracting text
            var foldBtns = descEl.select("a.fold_open, a.fold_close");
            foldBtns.forEach(function(btn) { btn.remove(); });
            result.description = descEl.text().trim();
        }

        // Genres: p.tip span.block (second block contains genres)
        var genres = [];
        var tipBlocks = doc.select(".banner_detail_form .info p.tip span.block");
        tipBlocks.forEach(function(block) {
            var blockText = block.ownText().trim();
            if (blockText.indexOf("题材") !== -1 || blockText.indexOf("題材") !== -1) {
                var genreLinks = block.select("a span");
                genreLinks.forEach(function(span) {
                    var text = span.text().trim();
                    if (text) genres.push(text);
                });
            }
        });
        result.genre = genres.length > 0 ? genres : null;

        // Status: first span.block contains "状态：<span>连载中</span>"
        tipBlocks.forEach(function(block) {
            var blockText = block.ownText().trim();
            if (blockText.indexOf("状态") !== -1 || blockText.indexOf("狀態") !== -1) {
                var statusSpan = block.selectFirst("span");
                if (statusSpan) {
                    var statusText = statusSpan.text();
                    if (statusText.indexOf("完结") !== -1 || statusText.indexOf("完結") !== -1) {
                        result.status = SManga.COMPLETED;
                    } else if (statusText.indexOf("连载") !== -1 || statusText.indexOf("連載") !== -1) {
                        result.status = SManga.ONGOING;
                    }
                }
            }
        });

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
        var seen = {};

        // Chapter links from #chapterlistload
        // Includes both visible and hidden (ul.chapteritem) chapters
        var chapterEls = doc.select("#chapterlistload li a");

        if (chapterEls.isEmpty()) {
            // Fallback selectors
            chapterEls = doc.select("ul.view-win-list li a, .detail-list-select li a");
        }

        var num = chapterEls.size();
        chapterEls.forEach(function(el) {
            try {
                var chapterUrl = el.attr("href");
                if (!chapterUrl || seen[chapterUrl]) return;
                seen[chapterUrl] = true;

                var chapter = SChapter.create();
                chapter.url = chapterUrl;

                // Prefer title attr (cleaner), fallback to text
                var name = el.attr("title") || "";
                if (!name) {
                    // Remove page count span like "(14P)" from text
                    var textClone = el.text().trim();
                    name = textClone.replace(/\s*（\d+P）\s*$/, "").replace(/\s*\(\d+P\)\s*$/, "").trim();
                }
                chapter.name = name;
                chapter.chapterNumber = num;
                num--;

                // Extract chapter number from name
                var numMatch = chapter.name.match(/第(\d+(?:\.\d+)?)[话話卷]/);
                if (numMatch) {
                    chapter.chapterNumber = parseFloat(numMatch[1]);
                } else {
                    var simpleMatch = chapter.name.match(/(\d+(?:\.\d+)?)/);
                    if (simpleMatch) {
                        chapter.chapterNumber = parseFloat(simpleMatch[1]);
                    }
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

        // Dm5 stores image data in JavaScript
        // Look for the image list in script tags
        var pages = [];

        // Method 1: Extract from inline script
        var doc = Jsoup.parse(html, this.baseUrl);

        // Extract DM5_CID, DM5_MID, DM5_VIEWSIGN etc.
        var scripts = doc.select("script");
        var cid = "";
        var mid = "";
        var sign = "";
        var signDate = "";
        var totalPage = 0;

        scripts.forEach(function(script) {
            var text = script.html();

            var cidMatch = text.match(/DM5_CID\s*=\s*(\d+)/);
            if (cidMatch) cid = cidMatch[1];

            var midMatch = text.match(/DM5_MID\s*=\s*(\d+)/);
            if (midMatch) mid = midMatch[1];

            var signMatch = text.match(/DM5_VIEWSIGN\s*=\s*"([^"]+)"/);
            if (signMatch) sign = signMatch[1];

            var dateMatch = text.match(/DM5_VIEWSIGN_DT\s*=\s*"([^"]+)"/);
            if (dateMatch) signDate = dateMatch[1];

            var pageMatch = text.match(/DM5_IMAGE_COUNT\s*=\s*(\d+)/);
            if (pageMatch) totalPage = parseInt(pageMatch[1]);
        });

        // Detect paid/VIP chapters
        var chapterCoin = 0;
        var isPaid = false;
        scripts.forEach(function(script) {
            var text = script.html();
            var coinMatch = text.match(/DM5_CHAPTERCOIN\s*=\s*(\d+)/);
            if (coinMatch) chapterCoin = parseInt(coinMatch[1]);
        });
        if (chapterCoin > 0) isPaid = true;
        if (!totalPage && doc.selectFirst(".chapterpay_tip, .read_ban")) isPaid = true;

        bridge.domReleaseAll();

        if (isPaid) {
            bridge.log("⚠️ 此章節需要付費購買" + (chapterCoin > 0 ? "（需要 " + chapterCoin + " 金幣）" : "") + "，無法免費閱讀");
            return [];
        }

        if (cid && totalPage > 0) {
            // Fetch each page's image via AJAX API
            for (var i = 1; i <= totalPage; i++) {
                var apiUrl = url + "chapterfun.ashx?cid=" + cid + "&page=" + i
                    + "&key=&language=1&gtk=6"
                    + "&_cid=" + cid + "&_mid=" + mid
                    + "&_dt=" + encodeURIComponent(signDate)
                    + "&_sign=" + encodeURIComponent(sign);

                var apiHeaders = {
                    "Referer": url,
                    "X-Requested-With": "XMLHttpRequest"
                };

                var jsCode = bridge.httpGetWithHeaders(apiUrl, apiHeaders);
                if (jsCode && !jsCode.error) {
                    // The response is JavaScript that returns an array of image URLs
                    // eval the code to get the array
                    var imgUrls = this._evalImageScript(jsCode);
                    if (imgUrls && imgUrls.length > 0) {
                        for (var j = 0; j < imgUrls.length; j++) {
                            var imgUrl = imgUrls[j];
                            if (imgUrl && pages.length < totalPage) {
                                pages.push(new Page(pages.length, "", imgUrl));
                            }
                        }
                    }
                }

                // Break if we have enough pages
                if (pages.length >= totalPage) break;
            }
        }

        return pages;
    },

    // Evaluate the JS code returned by chapterfun.ashx to extract image URLs
    _evalImageScript: function(jsCode) {
        try {
            // Response is eval(function(p,a,c,k,e,d){...}('...',a,c,'...'.split('|'),0,{}))
            // After unpacking: function dm5imagefun(){var pix="https://..."; var pvalue=["img1","img2"]; ...}
            var packedMatch = jsCode.match(/\}\s*\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']+)'\.split\s*\(\s*'([^']+)'\s*\)/);
            if (!packedMatch) return [];

            var p = packedMatch[1];
            var a = parseInt(packedMatch[2]);
            var c = parseInt(packedMatch[3]);
            var k = packedMatch[4].split(packedMatch[5]);

            // Unpack
            while (c--) {
                if (k[c]) {
                    var pattern = new RegExp("\\b" + this._itoa(c, a) + "\\b", "g");
                    p = p.replace(pattern, k[c]);
                }
            }

            // Extract pix (base URL) and pvalue (image path array) from unpacked code
            var pixMatch = p.match(/pix\s*=\s*"([^"]+)"/);
            var pvalueMatch = p.match(/pvalue\s*=\s*\[([^\]]+)\]/);
            if (pixMatch && pvalueMatch) {
                var pix = pixMatch[1];
                var paths = pvalueMatch[1].match(/"([^"]+)"/g);
                if (paths) {
                    var urls = [];
                    for (var i = 0; i < paths.length; i++) {
                        var imgPath = paths[i].replace(/"/g, "");
                        urls.push(pix + imgPath);
                    }
                    return urls;
                }
            }

            return [];
        } catch(e) {
            bridge.log("Dm5 eval error: " + e);
            return [];
        }
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

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Genre", values: [
                "全部", "热血", "恋爱", "校园", "百合", "耽美", "冒险",
                "后宫", "科幻", "战争", "悬疑", "推理", "搞笑", "奇幻",
                "魔法", "恐怖", "神鬼", "历史", "同人", "运动", "绅士",
                "机甲", "萌系", "治愈", "美食", "杂志", "四格", "其他"
            ], state: 0 },
            { type: "select", name: "Area", values: ["全部", "日本", "韩国", "欧美", "国漫"], state: 0 },
            { type: "select", name: "Status", values: ["全部", "连载", "完结"], state: 0 }
        ];
    }
};
