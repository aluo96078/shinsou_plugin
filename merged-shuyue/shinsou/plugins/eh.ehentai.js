// E-Hentai Gallery Plugin for Mihon iOS
// Crawls https://e-hentai.org

var source = {
    baseUrl: "https://e-hentai.org",
    supportsLatest: true,
    headers: {
        "Cookie": "nw=1"  // Skip content warning
    },

    // Cursor storage for pagination (e-hentai uses next=<id> instead of page=N)
    _nextPopularUrl: null,
    _nextSearchUrl: null,
    _nextLatestUrl: null,
    _popularPageUrls: {},
    _latestPageUrls: {},
    _searchPageUrls: {},
    _searchStateKey: null,

    // ======== Popular ========

    getPopularManga: function(page) {
        var url;
        if (page === 0) {
            // /popular is a finite "currently popular" page with no next cursor.
            // Use it for the first page, then continue with the normal front-page cursor.
            url = this.baseUrl + "/popular";
            this._popularPageUrls = {};
            this._nextPopularUrl = this.baseUrl + "/";
            this._saveCursor("_nextPopularUrl");
        } else {
            url = this._popularPageUrls[page] || this._nextPopularUrl || this._loadCursor("_nextPopularUrl") || this.baseUrl + "/";
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        if (page === 0) {
            var result = this._parseGalleryList(html);
            return new MangasPage(result.mangas, result.mangas.length > 0);
        }

        var popularPage = this._parseGalleryList(html, "_nextPopularUrl", this._popularPageUrls, page + 1);
        this._saveCursor("_nextPopularUrl");
        return popularPage;
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url;
        if (page === 0) {
            url = this.baseUrl + "/";
            this._latestPageUrls = {};
            this._nextLatestUrl = null;
            this._clearCursor("_nextLatestUrl");
        } else {
            url = this._latestPageUrls[page] || this._nextLatestUrl || this._loadCursor("_nextLatestUrl");
            if (!url) {
                bridge.log("Latest cursor missing for page " + page);
                return new MangasPage([], false);
            }
        }
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        var latestPage = this._parseGalleryList(html, "_nextLatestUrl", this._latestPageUrls, page + 1);
        this._saveCursor("_nextLatestUrl");
        return latestPage;
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url;
        var stateKey = this._searchStateKeyFor(query, filters);
        var savedStateKey = this._getPreference("eh.search.stateKey");
        if (page === 0) {
            url = this.baseUrl + "/?" + stateKey;
            this._searchPageUrls = {};
            this._nextSearchUrl = null;
            this._searchStateKey = stateKey;
            this._setPreference("eh.search.stateKey", stateKey);
            this._clearCursor("_nextSearchUrl");
        } else {
            if (this._searchStateKey !== stateKey && savedStateKey === stateKey) {
                this._searchStateKey = stateKey;
            }

            if (this._searchStateKey !== stateKey) {
                if (this._nextSearchUrl || this._searchPageUrls[page]) {
                    bridge.log("Search state changed for page " + page + "; continuing with active cursor");
                    this._searchStateKey = stateKey;
                } else {
                    bridge.log("Search state mismatch for page " + page);
                    return new MangasPage([], false);
                }
            }

            url = this._searchPageUrls[page] || this._nextSearchUrl || this._loadCursor("_nextSearchUrl", stateKey);
            if (!url) {
                bridge.log("Search cursor missing for page " + page);
                return new MangasPage([], false);
            }
        }

        bridge.log("Search URL: " + url);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        var searchPage = this._parseGalleryList(html, "_nextSearchUrl", this._searchPageUrls, page + 1);
        this._saveCursor("_nextSearchUrl", stateKey);
        return searchPage;
    },

    _searchStateKeyFor: function(query, filters) {
        try {
            return this._buildSearchParams(query, filters);
        } catch(e) {
            return "f_search=" + encodeURIComponent(query || "");
        }
    },

    _cursorPreferenceKey: function(cursorKey) {
        if (cursorKey === "_nextPopularUrl") return "eh.popular.nextUrl";
        if (cursorKey === "_nextLatestUrl") return "eh.latest.nextUrl";
        if (cursorKey === "_nextSearchUrl") return "eh.search.nextUrl";
        return "eh.cursor." + cursorKey;
    },

    _getPreference: function(key) {
        try {
            var value = bridge.getPreference(key);
            return value && value.length > 0 ? value : null;
        } catch(e) {
            return null;
        }
    },

    _setPreference: function(key, value) {
        try {
            bridge.setPreference(key, value || "");
        } catch(e) {}
    },

    _loadCursor: function(cursorKey, stateKey) {
        if (cursorKey === "_nextSearchUrl") {
            var savedStateKey = this._getPreference("eh.search.stateKey");
            if (savedStateKey !== stateKey) return null;
        }
        return this._getPreference(this._cursorPreferenceKey(cursorKey));
    },

    _saveCursor: function(cursorKey, stateKey) {
        if (cursorKey === "_nextSearchUrl") {
            this._setPreference("eh.search.stateKey", stateKey || this._searchStateKey || "");
        }
        this._setPreference(this._cursorPreferenceKey(cursorKey), this[cursorKey] || "");
    },

    _clearCursor: function(cursorKey) {
        this._setPreference(this._cursorPreferenceKey(cursorKey), "");
    },

    // ======== Build search URL from filters ========

    _buildSearchParams: function(query, filters) {
        var searchTerms = query || "";
        var hasAdvanced = false;
        var tagTerms = [];

        // Category bitmask: each bit EXCLUDES a category
        var categoryMap = {
            "Doujinshi": 2,
            "Manga": 4,
            "Artist CG": 8,
            "Game CG": 16,
            "Western": 512,
            "Non-H": 256,
            "Image Set": 32,
            "Cosplay": 64,
            "Asian Porn": 128,
            "Misc": 1
        };

        // Language tag mapping
        var languageMap = {
            "Japanese": "japanese",
            "English": "english",
            "Chinese": "chinese",
            "Korean": "korean",
            "French": "french",
            "German": "german",
            "Spanish": "spanish",
            "Italian": "italian",
            "Russian": "russian",
            "Thai": "thai",
            "Vietnamese": "vietnamese",
            "Polish": "polish",
            "Portuguese": "portuguese",
            "Hungarian": "hungarian",
            "Dutch": "dutch",
            "Arabic": "arabic",
            "Czech": "czech",
            "Indonesian": "indonesian",
            "Filipino": "filipino",
            "Turkish": "turkish"
        };

        var f_cats = 0;  // 0 = show all
        var advParams = "";

        if (!filters || filters.length === 0) {
            return "f_search=" + encodeURIComponent(searchTerms);
        }

        for (var i = 0; i < filters.length; i++) {
            var f = filters[i];
            if (!f || !f.type) continue;

            // Category checkboxes: unchecked = exclude (add bit)
            if (f.type === "checkBox" && categoryMap[f.name] !== undefined) {
                if (!f.state) {
                    f_cats |= categoryMap[f.name];
                }
                continue;
            }

            // Language select
            if (f.type === "select" && f.name === "Language") {
                if (f.state > 0) {
                    var langValues = Object.keys(languageMap);
                    var selectedLang = langValues[f.state - 1]; // index 0 = Any
                    if (selectedLang && languageMap[selectedLang]) {
                        tagTerms.push('language:' + languageMap[selectedLang]);
                    }
                }
                continue;
            }

            // Tag text input
            if (f.type === "text" && f.name === "Tags") {
                var tagInput = f.state.trim();
                if (tagInput.length > 0) {
                    // Support comma-separated tags
                    var tags = tagInput.split(",");
                    for (var t = 0; t < tags.length; t++) {
                        var tag = tags[t].trim();
                        if (tag.length > 0) {
                            tagTerms.push(tag);
                        }
                    }
                }
                continue;
            }

            // Excluded tags
            if (f.type === "text" && f.name === "Excluded Tags") {
                var exInput = f.state.trim();
                if (exInput.length > 0) {
                    var exTags = exInput.split(",");
                    for (var e = 0; e < exTags.length; e++) {
                        var exTag = exTags[e].trim();
                        if (exTag.length > 0) {
                            tagTerms.push('-' + exTag);
                        }
                    }
                }
                continue;
            }

            // Search In
            if (f.type === "checkBox" && f.name === "Search Gallery Name") {
                if (f.state) { advParams += "&f_sname=on"; hasAdvanced = true; }
                continue;
            }
            if (f.type === "checkBox" && f.name === "Search Gallery Tags") {
                if (f.state) { advParams += "&f_stags=on"; hasAdvanced = true; }
                continue;
            }
            if (f.type === "checkBox" && f.name === "Search Gallery Description") {
                if (f.state) { advParams += "&f_sdesc=on"; hasAdvanced = true; }
                continue;
            }
            if (f.type === "checkBox" && f.name === "Search Torrent Filenames") {
                if (f.state) { advParams += "&f_storr=on"; hasAdvanced = true; }
                continue;
            }

            // Advanced Options
            if (f.type === "checkBox" && f.name === "Only Show Galleries With Torrents") {
                if (f.state) { advParams += "&f_sto=on"; hasAdvanced = true; }
                continue;
            }
            if (f.type === "checkBox" && f.name === "Show Expunged Galleries") {
                if (f.state) { advParams += "&f_sh=on"; hasAdvanced = true; }
                continue;
            }
            if (f.type === "checkBox" && f.name === "Search Downvoted Tags") {
                if (f.state) { advParams += "&f_sdt1=on"; hasAdvanced = true; }
                continue;
            }

            // Minimum Rating
            if (f.type === "select" && f.name === "Minimum Rating") {
                if (f.state > 0) {
                    var ratingValue = f.state + 1;
                    advParams += "&f_sr=on&f_srdd=" + ratingValue;
                    hasAdvanced = true;
                }
                continue;
            }

            // Page Range
            if (f.type === "text" && f.name === "Minimum Pages") {
                var minPages = f.state.trim();
                if (minPages.length > 0) {
                    advParams += "&f_sp=on&f_spf=" + encodeURIComponent(minPages);
                    hasAdvanced = true;
                }
                continue;
            }
            if (f.type === "text" && f.name === "Maximum Pages") {
                var maxPages = f.state.trim();
                if (maxPages.length > 0) {
                    if (advParams.indexOf("f_sp=on") === -1) {
                        advParams += "&f_sp=on&f_spf=";
                    }
                    advParams += "&f_spt=" + encodeURIComponent(maxPages);
                    hasAdvanced = true;
                }
                continue;
            }

            // Disable default filters
            if (f.type === "checkBox" && f.name === "Disable Language Filter") {
                if (f.state) { advParams += "&f_sfl=on"; hasAdvanced = true; }
                continue;
            }
            if (f.type === "checkBox" && f.name === "Disable Uploader Filter") {
                if (f.state) { advParams += "&f_sfu=on"; hasAdvanced = true; }
                continue;
            }
            if (f.type === "checkBox" && f.name === "Disable Tags Filter") {
                if (f.state) { advParams += "&f_sft=on"; hasAdvanced = true; }
                continue;
            }
        }

        // Combine search query with tag terms
        var fullSearch = searchTerms;
        if (tagTerms.length > 0) {
            var tagStr = tagTerms.map(function(t) {
                // Wrap multi-word tags in quotes if they contain a colon (namespace:tag)
                if (t.indexOf(":") !== -1 && t.indexOf("\"") === -1) {
                    return '"' + t + '$"';
                }
                return t;
            }).join(" ");
            fullSearch = fullSearch ? fullSearch + " " + tagStr : tagStr;
        }

        var params = "f_search=" + encodeURIComponent(fullSearch);

        // Category filter
        if (f_cats > 0) {
            params += "&f_cats=" + f_cats;
        }

        // Advanced params
        params += advParams;
        if (hasAdvanced) {
            params += "&advsearch=1";
        }

        return params;
    },

    // ======== Gallery List Parser ========

    // cursorKey: property name to store next page URL (e.g. "_nextSearchUrl"), or falsy for no pagination
    _parseGalleryList: function(html, cursorKey, pageUrls, nextPageIndex) {
        var self = this;
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];

        // All table list modes use table.itg; rows without gallery links are headers/navigation.
        var rows = doc.select("table.itg tr");

        if (!rows.isEmpty()) {
            rows.forEach(function(row) {
                try {
                    var link = row.selectFirst("a[href*='/g/']");
                    if (!link) return;

                    var manga = SManga.create();
                    manga.url = link.attr("href");

                    var glinkEl = row.selectFirst(".glink");
                    manga.title = glinkEl ? glinkEl.text() : link.text() || "";

                    var img = row.selectFirst(".glthumb img");
                    if (!img) img = row.selectFirst("img[alt][title]");
                    if (!img) img = row.selectFirst("img");
                    if (img) {
                        manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                    }

                    if (manga.url && manga.title) {
                        mangas.push(manga);
                    }
                } catch(e) {
                    bridge.log("Error parsing row: " + e);
                }
            });
        }

        // Thumbnail mode fallback
        if (mangas.length === 0) {
            var thumbs = doc.select("div.gl1t");
            thumbs.forEach(function(el) {
                try {
                    var link = el.selectFirst("a[href*='/g/']");
                    if (!link) return;

                    var manga = SManga.create();
                    manga.url = link.attr("href");

                    var titleEl = el.selectFirst(".glink");
                    manga.title = titleEl ? titleEl.text() : link.attr("title") || "";

                    var img = el.selectFirst("img");
                    if (img) {
                        manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                    }

                    if (manga.url && manga.title) {
                        mangas.push(manga);
                    }
                } catch(e) {
                    bridge.log("Error parsing thumb: " + e);
                }
            });
        }

        // Check for next page using the "next" navigation link (cursor-based)
        var nextPage = false;
        if (cursorKey) {
            var nextUrl = this._extractNextPageUrl(doc, html);
            if (nextUrl) {
                self[cursorKey] = nextUrl;
                if (pageUrls && nextPageIndex !== undefined) {
                    pageUrls[nextPageIndex] = nextUrl;
                }
                nextPage = true;
                bridge.log("Next page URL: " + nextUrl);
            } else {
                self[cursorKey] = null;
            }
        }

        bridge.domReleaseAll();
        return new MangasPage(mangas, nextPage && mangas.length > 0);
    },

    _extractNextPageUrl: function(doc, html) {
        var match = html.match(/var\s+nexturl\s*=\s*"([^"]+)"/);
        if (match && match[1]) {
            return this._absoluteUrl(this._decodeHtml(match[1]));
        }

        var nextLink = doc.selectFirst("a#dnext");
        if (!nextLink) nextLink = doc.selectFirst("a#unext");

        if (!nextLink) {
            var navLinks = doc.select(".searchnav a");
            navLinks.forEach(function(a) {
                var text = a.text();
                if (!nextLink && text.indexOf("Next") !== -1 && text.indexOf("Last") === -1) {
                    nextLink = a;
                }
            });
        }

        if (!nextLink) {
            var pager = doc.selectFirst("table.ptb");
            if (pager) {
                var links = pager.select("a");
                links.forEach(function(a) {
                    var text = a.text();
                    if (!nextLink && text.indexOf(">") !== -1 && text.indexOf(">>") === -1) {
                        nextLink = a;
                    }
                });
            }
        }

        if (nextLink) {
            return this._absoluteUrl(nextLink.attr("href"));
        }

        return null;
    },

    _absoluteUrl: function(url) {
        if (!url) return null;
        url = this._decodeHtml(url);
        if (url.indexOf("http") === 0) return url;
        if (url.charAt(0) === "/") return this.baseUrl + url;
        return this.baseUrl + "/" + url;
    },

    _decodeHtml: function(text) {
        return text ? text.replace(/&amp;/g, "&") : text;
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

        // Title (Japanese title fallback to English)
        var titleEl = doc.selectFirst("#gn");
        result.title = titleEl ? titleEl.text() : manga.title || "";

        // Japanese title as alternate
        var jpTitleEl = doc.selectFirst("#gj");
        if (jpTitleEl && jpTitleEl.text()) {
            result.description = "Japanese: " + jpTitleEl.text() + "\n";
        } else {
            result.description = "";
        }

        // Thumbnail from cover div background-image
        var coverEl = doc.selectFirst("#gd1 div");
        if (coverEl) {
            var style = coverEl.attr("style");
            var urlMatch = style.match(/url\(([^)]+)\)/);
            if (urlMatch && urlMatch[1]) {
                result.thumbnailUrl = urlMatch[1];
            }
        }
        if (!result.thumbnailUrl) {
            var coverImg = doc.selectFirst("#gd1 img");
            if (coverImg) {
                result.thumbnailUrl = coverImg.attr("src");
            }
        }

        // Tags
        var genres = [];
        var author = null;
        var artist = null;

        // Category
        var categoryEl = doc.selectFirst("#gdc a");
        if (!categoryEl) {
            categoryEl = doc.selectFirst("#gdc div, #gdc");
        }
        if (categoryEl) {
            genres.push(categoryEl.text());
        }

        var tagRows = doc.select("#taglist tr");
        tagRows.forEach(function(tr) {
            var category = tr.selectFirst("td.tc");
            if (!category) return;
            var catName = category.text().replace(":", "").trim().toLowerCase();

            var tags = tr.select("td:nth-child(2) a");
            tags.forEach(function(tag) {
                var tagText = tag.text();
                genres.push(catName + ":" + tagText);

                if (catName === "artist") {
                    artist = artist ? artist + ", " + tagText : tagText;
                }
                if (catName === "group") {
                    author = author ? author + ", " + tagText : tagText;
                }
            });
        });

        result.genre = genres;
        result.author = author;
        result.artist = artist;

        // Metadata from info table
        var metaRows = doc.select("#gdd tr");
        metaRows.forEach(function(tr) {
            var label = tr.selectFirst(".gdt1");
            var value = tr.selectFirst(".gdt2");
            if (label && value) {
                var lbl = label.text().trim();
                var val = value.text().trim();
                result.description += lbl + " " + val + "\n";
            }
        });

        // Rating
        var ratingEl = doc.selectFirst("#rating_label");
        if (ratingEl) {
            result.description += ratingEl.text() + "\n";
        }

        // Uploader comment
        var commentEl = doc.selectFirst("#comment_0 .c6");
        if (commentEl) {
            result.description += "\n" + commentEl.text();
        }

        result.description = result.description.trim() || null;
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

        var pages = [];
        var pageNum = 0;
        var currentUrl = url;

        // Collect all viewer page URLs from gallery pages (fast — no image resolution)
        while (currentUrl) {
            var html = bridge.httpGetWithHeaders(currentUrl, this.headers);
            if (!html || html.error) break;

            var doc = Jsoup.parse(html, this.baseUrl);

            var thumbs = doc.select("#gdt a");
            thumbs.forEach(function(thumb) {
                var pageUrl = thumb.attr("href");
                if (pageUrl) {
                    pages.push(new Page(pageNum, pageUrl, null));
                    pageNum++;
                }
            });

            // Next gallery page
            var nextLink = doc.selectFirst("table.ptb td.ptds + td a");
            if (nextLink) {
                currentUrl = nextLink.absUrl("href");
            } else {
                currentUrl = null;
            }

            bridge.domReleaseAll();
        }

        return pages;
    },

    // Called by Swift to resolve a single page's image URL (parallel-friendly)
    resolveImageUrl: function(pageUrl) {
        try {
            var html = bridge.httpGetWithHeaders(pageUrl, this.headers);
            if (!html || html.error) return null;

            var doc = Jsoup.parse(html, this.baseUrl);
            var img = doc.selectFirst("#img");
            var imageUrl = img ? img.attr("src") : null;

            bridge.domReleaseAll();
            return imageUrl;
        } catch(e) {
            bridge.log("Error resolving image: " + e);
            return null;
        }
    },

    // ======== Filters (Advanced Search) ========

    getFilterList: function() {
        return [
            // --- Language ---
            { type: "select", name: "Language", values: [
                "Any",
                "Japanese", "English", "Chinese", "Korean",
                "French", "German", "Spanish", "Italian", "Russian",
                "Thai", "Vietnamese", "Polish", "Portuguese", "Hungarian",
                "Dutch", "Arabic", "Czech", "Indonesian", "Filipino", "Turkish"
            ], state: 0 },

            // --- Tags ---
            { type: "separator" },
            { type: "header", name: "Tags" },
            { type: "text", name: "Tags", state: "" },
            { type: "text", name: "Excluded Tags", state: "" },

            // --- Categories ---
            { type: "separator" },
            { type: "header", name: "Categories" },
            { type: "checkBox", name: "Doujinshi", state: true },
            { type: "checkBox", name: "Manga", state: true },
            { type: "checkBox", name: "Artist CG", state: true },
            { type: "checkBox", name: "Game CG", state: true },
            { type: "checkBox", name: "Western", state: true },
            { type: "checkBox", name: "Non-H", state: true },
            { type: "checkBox", name: "Image Set", state: true },
            { type: "checkBox", name: "Cosplay", state: true },
            { type: "checkBox", name: "Asian Porn", state: true },
            { type: "checkBox", name: "Misc", state: true },

            // --- Search In ---
            { type: "separator" },
            { type: "header", name: "Search In" },
            { type: "checkBox", name: "Search Gallery Name", state: true },
            { type: "checkBox", name: "Search Gallery Tags", state: true },
            { type: "checkBox", name: "Search Gallery Description", state: false },
            { type: "checkBox", name: "Search Torrent Filenames", state: false },

            // --- Advanced Options ---
            { type: "separator" },
            { type: "header", name: "Advanced Options" },
            { type: "checkBox", name: "Only Show Galleries With Torrents", state: false },
            { type: "checkBox", name: "Show Expunged Galleries", state: false },
            { type: "checkBox", name: "Search Downvoted Tags", state: false },
            { type: "select", name: "Minimum Rating", values: ["Any", "2 Stars", "3 Stars", "4 Stars", "5 Stars"], state: 0 },

            // --- Page Range ---
            { type: "separator" },
            { type: "header", name: "Page Range" },
            { type: "text", name: "Minimum Pages", state: "" },
            { type: "text", name: "Maximum Pages", state: "" },

            // --- Disable Default Filters ---
            { type: "separator" },
            { type: "header", name: "Disable Default Filters" },
            { type: "checkBox", name: "Disable Language Filter", state: false },
            { type: "checkBox", name: "Disable Uploader Filter", state: false },
            { type: "checkBox", name: "Disable Tags Filter", state: false }
        ];
    }
};
