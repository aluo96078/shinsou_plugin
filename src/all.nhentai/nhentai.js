// NHentai Plugin for Mihon iOS
// Crawls https://nhentai.net

var source = {
    baseUrl: "https://nhentai.net",
    supportsLatest: true,
    headers: {
        "Referer": "https://nhentai.net/"
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var url = this.baseUrl + "/?page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseGalleryList(html);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var url = this.baseUrl + "/?page=" + (page + 1);
        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseGalleryList(html);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var searchQuery = query || "";
        var sort = "";

        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var f = filters[i];
                if (!f || !f.type) continue;

                // Sort
                if (f.type === "select" && f.name === "Sort By") {
                    var sortOptions = ["", "popular-today", "popular-week", "popular"];
                    sort = sortOptions[f.state] || "";
                    continue;
                }

                // Language
                if (f.type === "select" && f.name === "Language") {
                    var langTags = ["", "language:english", "language:japanese", "language:chinese"];
                    if (f.state > 0) {
                        searchQuery = (searchQuery + " " + langTags[f.state]).trim();
                    }
                    continue;
                }

                // Tags (include)
                if (f.type === "text" && f.name === "Tags") {
                    var tagInput = f.state.trim();
                    if (tagInput.length > 0) {
                        var tags = tagInput.split(",");
                        for (var t = 0; t < tags.length; t++) {
                            var tag = tags[t].trim();
                            if (tag.length > 0) {
                                searchQuery = (searchQuery + " tag:\"" + tag + "\"").trim();
                            }
                        }
                    }
                    continue;
                }

                // Excluded Tags
                if (f.type === "text" && f.name === "Excluded Tags") {
                    var exInput = f.state.trim();
                    if (exInput.length > 0) {
                        var exTags = exInput.split(",");
                        for (var e = 0; e < exTags.length; e++) {
                            var exTag = exTags[e].trim();
                            if (exTag.length > 0) {
                                searchQuery = (searchQuery + " -tag:\"" + exTag + "\"").trim();
                            }
                        }
                    }
                    continue;
                }

                // Pages range
                if (f.type === "text" && f.name === "Minimum Pages") {
                    var minPages = f.state.trim();
                    if (minPages.length > 0) {
                        searchQuery = (searchQuery + " pages:>=" + minPages).trim();
                    }
                    continue;
                }
                if (f.type === "text" && f.name === "Maximum Pages") {
                    var maxPages = f.state.trim();
                    if (maxPages.length > 0) {
                        searchQuery = (searchQuery + " pages:<=" + maxPages).trim();
                    }
                    continue;
                }
            }
        }

        var url;
        if (searchQuery.trim()) {
            url = this.baseUrl + "/search/?q=" + encodeURIComponent(searchQuery.trim()) + "&page=" + (page + 1);
            if (sort) {
                url += "&sort=" + sort;
            }
        } else {
            url = this.baseUrl + "/?page=" + (page + 1);
        }

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return new MangasPage([], false);
        return this._parseGalleryList(html);
    },

    // ======== Gallery List Parser ========

    _parseGalleryList: function(html) {
        var doc = Jsoup.parse(html, this.baseUrl);
        var mangas = [];

        var containers = doc.select("div.gallery");
        containers.forEach(function(el) {
            try {
                var link = el.selectFirst("a.cover");
                if (!link) return;

                var manga = SManga.create();
                manga.url = link.attr("href");

                var caption = el.selectFirst("div.caption");
                manga.title = caption ? caption.text() : "";

                var img = link.selectFirst("img.lazyload");
                if (img) {
                    manga.thumbnailUrl = img.attr("data-src") || img.attr("src") || "";
                }
                if (!manga.thumbnailUrl) {
                    var img2 = link.selectFirst("img");
                    if (img2) {
                        manga.thumbnailUrl = img2.attr("data-src") || img2.attr("src") || "";
                    }
                }

                if (manga.url && manga.title) {
                    mangas.push(manga);
                }
            } catch(e) {
                bridge.log("NHentai parse error: " + e);
            }
        });

        // Check for next page
        var hasNext = false;
        var nextBtn = doc.selectFirst("a.next");
        if (nextBtn) {
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
        var titleEl = doc.selectFirst("#info h1");
        result.title = titleEl ? titleEl.text() : manga.title || "";

        // Subtitle (Japanese)
        var subEl = doc.selectFirst("#info h2");
        if (subEl && subEl.text()) {
            result.description = subEl.text();
        }

        // Cover
        var coverEl = doc.selectFirst("#cover img");
        if (coverEl) {
            result.thumbnailUrl = coverEl.attr("data-src") || coverEl.attr("src") || "";
        }

        // Tags
        var genres = [];
        var artists = [];
        var groups = [];
        var languages = [];
        var categories = [];
        var parodies = [];
        var characters = [];

        var tagSections = doc.select("#tags .tag-container.field-name");
        tagSections.forEach(function(section) {
            var label = section.ownText().trim().replace(":", "").toLowerCase();
            var tagEls = section.select("a.tag span.name");

            tagEls.forEach(function(tagEl) {
                var tagName = tagEl.text();
                if (label === "tags" || label === "tag") {
                    genres.push(tagName);
                } else if (label === "artists" || label === "artist") {
                    artists.push(tagName);
                } else if (label === "groups" || label === "group") {
                    groups.push(tagName);
                } else if (label === "languages" || label === "language") {
                    languages.push(tagName);
                } else if (label === "categories" || label === "category") {
                    categories.push(tagName);
                } else if (label === "parodies" || label === "parody") {
                    parodies.push(tagName);
                } else if (label === "characters" || label === "character") {
                    characters.push(tagName);
                }
            });
        });

        // Add language and category to genres
        for (var l = 0; l < languages.length; l++) {
            genres.unshift("language:" + languages[l]);
        }
        for (var c = 0; c < categories.length; c++) {
            genres.unshift("category:" + categories[c]);
        }

        result.genre = genres;
        result.artist = artists.length > 0 ? artists.join(", ") : null;
        result.author = groups.length > 0 ? groups.join(", ") : (artists.length > 0 ? artists.join(", ") : null);

        // Pages count and upload date
        var desc = result.description || "";
        var pageCount = doc.selectFirst("#tags .tag-container:has(span:contains(pages)) a.tag span.name");
        if (pageCount) {
            desc += "\nPages: " + pageCount.text();
        }
        var uploadDate = doc.selectFirst("#tags time");
        if (uploadDate) {
            desc += "\nUploaded: " + uploadDate.attr("datetime");
        }
        if (parodies.length > 0) {
            desc += "\nParodies: " + parodies.join(", ");
        }
        if (characters.length > 0) {
            desc += "\nCharacters: " + characters.join(", ");
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

        var html = bridge.httpGetWithHeaders(url, this.headers);
        if (!html || html.error) return [];

        var doc = Jsoup.parse(html, this.baseUrl);
        var pages = [];

        // Extract media ID and page info from gallery script
        var scripts = doc.select("script");
        var galleryData = null;

        scripts.forEach(function(script) {
            var text = script.html();
            if (text.indexOf("gallery") !== -1 && text.indexOf("media_id") !== -1) {
                // Try to extract JSON.parse(...)
                var match = text.match(/JSON\.parse\s*\(\s*'([^']+)'\s*\)/);
                if (match) {
                    try {
                        // Unescape the string
                        var jsonStr = match[1].replace(/\\u0022/g, '"').replace(/\\u0027/g, "'").replace(/\\\\u/g, "\\u");
                        galleryData = JSON.parse(jsonStr);
                    } catch(e) {
                        bridge.log("JSON parse error: " + e);
                    }
                }
                if (!galleryData) {
                    // Try direct gallery assignment
                    var match2 = text.match(/var\s+gallery\s*=\s*(\{[^;]+\});/);
                    if (match2) {
                        try {
                            galleryData = JSON.parse(match2[1]);
                        } catch(e2) {}
                    }
                }
            }
        });

        if (galleryData && galleryData.images && galleryData.images.pages) {
            var mediaId = galleryData.media_id;
            var imgPages = galleryData.images.pages;

            for (var i = 0; i < imgPages.length; i++) {
                var ext = "jpg";
                var imgType = imgPages[i].t;
                if (imgType === "p") ext = "png";
                else if (imgType === "g") ext = "gif";
                else if (imgType === "w") ext = "webp";

                var imageUrl = "https://i.nhentai.net/galleries/" + mediaId + "/" + (i + 1) + "." + ext;
                pages.push(new Page(i, "", imageUrl));
            }
        }

        // Fallback: parse thumbnail links
        if (pages.length === 0) {
            var thumbs = doc.select("#thumbnail-container .thumb-container a");
            thumbs.forEach(function(thumb, idx) {
                var img = thumb.selectFirst("img");
                if (img) {
                    // Convert thumbnail URL to full image URL
                    // t.nhentai.net/galleries/MEDIA_ID/1t.jpg -> i.nhentai.net/galleries/MEDIA_ID/1.jpg
                    var thumbUrl = img.attr("data-src") || img.attr("src") || "";
                    var fullUrl = thumbUrl.replace("t.nhentai.net", "i.nhentai.net")
                        .replace(/(\d+)t\.(\w+)$/, "$1.$2");
                    if (fullUrl) {
                        pages.push(new Page(idx, "", fullUrl));
                    }
                }
            });
        }

        bridge.domReleaseAll();
        return pages;
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Sort By", values: ["Recent", "Popular Today", "Popular This Week", "All Time Popular"], state: 0 },

            { type: "separator" },
            { type: "header", name: "Language" },
            { type: "select", name: "Language", values: ["Any", "English", "Japanese", "Chinese"], state: 0 },

            { type: "separator" },
            { type: "header", name: "Tags" },
            { type: "text", name: "Tags", state: "" },
            { type: "text", name: "Excluded Tags", state: "" },

            { type: "separator" },
            { type: "header", name: "Pages" },
            { type: "text", name: "Minimum Pages", state: "" },
            { type: "text", name: "Maximum Pages", state: "" }
        ];
    }
};
