// E-Hentai Gallery Plugin for Mihon iOS
// Crawls https://e-hentai.org

var source = {
    baseUrl: "https://e-hentai.org",
    supportsLatest: true,
    headers: {
        "Cookie": "nw=1"  // Skip content warning
    },

    // Cursor storage for pagination (e-hentai uses next=<id> instead of page=N)
    _nextSearchUrl: null,
    _nextLatestUrl: null,

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/popular";
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseGalleryList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url;
        if (page === 0 || !this._nextLatestUrl) {
            url = this.baseUrl + "/";
            this._nextLatestUrl = null;
        } else {
            url = this._nextLatestUrl;
        }
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseGalleryList(html, "_nextLatestUrl");
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var url;
        if (page === 0 || !this._nextSearchUrl) {
            var params = this._buildSearchParams(query, filters);
            url = this.baseUrl + "/?" + params;
            this._nextSearchUrl = null;
        } else {
            url = this._nextSearchUrl;
        }

        bridge.log("Search URL: " + url);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseGalleryList(html, "_nextSearchUrl");
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
    _parseGalleryList: function(html, cursorKey) {
        var self = this;
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];

        // Try extended mode (table.itg.glte), then compact (table.itg.gltc)
        var rows = doc.select("table.itg.glte > tbody > tr");
        if (rows.isEmpty()) {
            rows = doc.select("table.itg.gltc > tbody > tr");
        }

        if (!rows.isEmpty()) {
            rows.forEach(function(row) {
                try {
                    var link = row.selectFirst("a[href*='/g/']");
                    if (!link) return;

                    var manga = SManga.create();
                    manga.url = link.attr("href");

                    var glinkEl = row.selectFirst(".glink");
                    manga.title = glinkEl ? glinkEl.text() : link.text() || "";

                    var img = row.selectFirst("img");
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
            // Look for the "next >" link in the pager (id="dnext" or ">")
            var nextLink = doc.selectFirst("a#dnext, a#unext");
            if (!nextLink) {
                // Fallback: look for ">" text in pager links
                var pager = doc.selectFirst("table.ptb");
                if (pager) {
                    var links = pager.select("a");
                    links.forEach(function(a) {
                        if (a.text().indexOf(">") !== -1 && a.text().indexOf(">>") === -1) {
                            nextLink = a;
                        }
                    });
                }
            }
            if (nextLink) {
                var nextUrl = nextLink.attr("href");
                if (nextUrl) {
                    self[cursorKey] = nextUrl;
                    nextPage = true;
                    bridge.log("Next page URL: " + nextUrl);
                }
            } else {
                self[cursorKey] = null;
            }
        }

        bridge.domReleaseAll();
        return new MangasPage(mangas, nextPage);
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
