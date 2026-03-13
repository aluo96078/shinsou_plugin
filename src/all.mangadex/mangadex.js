// MangaDex Plugin for Mihon iOS
// Uses MangaDex REST API v5: https://api.mangadex.org

var source = {
    baseUrl: "https://mangadex.org",
    apiUrl: "https://api.mangadex.org",
    cdnUrl: "https://uploads.mangadex.org",
    supportsLatest: true,
    headers: {},

    // ======== Popular ========

    getPopularManga: function(page) {
        var limit = 20;
        var offset = page * limit;
        var url = this.apiUrl + "/manga?limit=" + limit + "&offset=" + offset
            + "&order[followedCount]=desc"
            + "&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica"
            + "&includes[]=cover_art&includes[]=author&includes[]=artist";
        return this._fetchMangaList(url);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var limit = 20;
        var offset = page * limit;
        var url = this.apiUrl + "/manga?limit=" + limit + "&offset=" + offset
            + "&order[latestUploadedChapter]=desc"
            + "&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica"
            + "&includes[]=cover_art&includes[]=author&includes[]=artist"
            + "&hasAvailableChapters=true";
        return this._fetchMangaList(url);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        var limit = 20;
        var offset = page * limit;
        var url = this.apiUrl + "/manga?limit=" + limit + "&offset=" + offset
            + "&includes[]=cover_art&includes[]=author&includes[]=artist";

        if (query && query.trim()) {
            url += "&title=" + encodeURIComponent(query.trim());
        }

        // Default content ratings
        var hasContentRating = false;
        var hasStatus = false;
        var hasDemographic = false;
        var hasLang = false;
        var orderField = null;
        var orderDir = "desc";

        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var f = filters[i];
                if (!f || !f.type) continue;

                // Content Rating checkboxes
                if (f.type === "checkBox" && f.name === "Safe") {
                    if (f.state) { url += "&contentRating[]=safe"; hasContentRating = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Suggestive") {
                    if (f.state) { url += "&contentRating[]=suggestive"; hasContentRating = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Erotica") {
                    if (f.state) { url += "&contentRating[]=erotica"; hasContentRating = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Pornographic") {
                    if (f.state) { url += "&contentRating[]=pornographic"; hasContentRating = true; }
                    continue;
                }

                // Status checkboxes
                if (f.type === "checkBox" && f.name === "Ongoing") {
                    if (f.state) { url += "&status[]=ongoing"; hasStatus = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Completed") {
                    if (f.state) { url += "&status[]=completed"; hasStatus = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Hiatus") {
                    if (f.state) { url += "&status[]=hiatus"; hasStatus = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Cancelled") {
                    if (f.state) { url += "&status[]=cancelled"; hasStatus = true; }
                    continue;
                }

                // Demographic checkboxes
                if (f.type === "checkBox" && f.name === "Shounen") {
                    if (f.state) { url += "&publicationDemographic[]=shounen"; hasDemographic = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Shoujo") {
                    if (f.state) { url += "&publicationDemographic[]=shoujo"; hasDemographic = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Seinen") {
                    if (f.state) { url += "&publicationDemographic[]=seinen"; hasDemographic = true; }
                    continue;
                }
                if (f.type === "checkBox" && f.name === "Josei") {
                    if (f.state) { url += "&publicationDemographic[]=josei"; hasDemographic = true; }
                    continue;
                }

                // Language filter
                if (f.type === "select" && f.name === "Original Language") {
                    var langs = ["", "ja", "ko", "zh", "zh-hk", "en"];
                    if (f.state > 0 && f.state < langs.length) {
                        url += "&originalLanguage[]=" + langs[f.state];
                    }
                    continue;
                }

                // Translated language
                if (f.type === "select" && f.name === "Translated Language") {
                    var tlangs = ["", "en", "zh", "zh-hk", "ja", "ko", "fr", "de", "es", "pt-br", "ru", "it"];
                    if (f.state > 0 && f.state < tlangs.length) {
                        url += "&availableTranslatedLanguage[]=" + tlangs[f.state];
                        hasLang = true;
                    }
                    continue;
                }

                // Sort order
                if (f.type === "select" && f.name === "Sort By") {
                    var sortOptions = [
                        "followedCount", "relevance", "latestUploadedChapter",
                        "createdAt", "updatedAt", "title", "rating", "year"
                    ];
                    if (f.state < sortOptions.length) {
                        orderField = sortOptions[f.state];
                    }
                    continue;
                }

                // Sort direction
                if (f.type === "select" && f.name === "Sort Direction") {
                    var dirs = ["desc", "asc"];
                    orderDir = dirs[f.state] || "desc";
                    continue;
                }

                // Tags (text input, comma separated)
                if (f.type === "text" && f.name === "Include Tags") {
                    var tagInput = f.state.trim();
                    if (tagInput.length > 0) {
                        var tags = tagInput.split(",");
                        for (var t = 0; t < tags.length; t++) {
                            var tag = tags[t].trim().toLowerCase();
                            var tagId = this._findTagId(tag);
                            if (tagId) {
                                url += "&includedTags[]=" + tagId;
                            }
                        }
                    }
                    continue;
                }

                if (f.type === "text" && f.name === "Exclude Tags") {
                    var exInput = f.state.trim();
                    if (exInput.length > 0) {
                        var exTags = exInput.split(",");
                        for (var e = 0; e < exTags.length; e++) {
                            var exTag = exTags[e].trim().toLowerCase();
                            var exTagId = this._findTagId(exTag);
                            if (exTagId) {
                                url += "&excludedTags[]=" + exTagId;
                            }
                        }
                    }
                    continue;
                }
            }
        }

        // Apply defaults if not set by filters
        if (!hasContentRating) {
            url += "&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica";
        }

        // Sort order
        if (orderField) {
            url += "&order[" + orderField + "]=" + orderDir;
        } else if (!query || !query.trim()) {
            url += "&order[followedCount]=desc";
        }

        return this._fetchMangaList(url);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var mangaId = this._extractMangaId(manga.url);
        var url = this.apiUrl + "/manga/" + mangaId
            + "?includes[]=cover_art&includes[]=author&includes[]=artist";

        var json = bridge.httpGet(url);
        if (!json || json.error) return manga;

        try {
            var resp = JSON.parse(json);
            if (resp.result !== "ok") return manga;

            var data = resp.data;
            var attrs = data.attributes;
            var result = SManga.create();
            result.url = manga.url;
            result.initialized = true;

            // Title (prefer en, then ja, then first available)
            result.title = this._getLocalizedString(attrs.title) || manga.title || "";

            // Description
            result.description = this._getLocalizedString(attrs.description) || null;

            // Alt titles
            if (attrs.altTitles && attrs.altTitles.length > 0) {
                var altNames = [];
                for (var i = 0; i < attrs.altTitles.length; i++) {
                    var alt = this._getLocalizedString(attrs.altTitles[i]);
                    if (alt) altNames.push(alt);
                }
                if (altNames.length > 0 && result.description) {
                    result.description = "Alt: " + altNames.slice(0, 3).join(", ") + "\n\n" + result.description;
                }
            }

            // Status
            var statusMap = {
                "ongoing": SManga.ONGOING,
                "completed": SManga.COMPLETED,
                "hiatus": SManga.ON_HIATUS,
                "cancelled": SManga.CANCELLED
            };
            result.status = statusMap[attrs.status] || SManga.UNKNOWN;

            // Tags/genres
            var genres = [];
            if (attrs.publicationDemographic) {
                genres.push(attrs.publicationDemographic);
            }
            if (attrs.contentRating && attrs.contentRating !== "safe") {
                genres.push(attrs.contentRating);
            }
            if (attrs.tags) {
                for (var t = 0; t < attrs.tags.length; t++) {
                    var tagName = this._getLocalizedString(attrs.tags[t].attributes.name);
                    if (tagName) genres.push(tagName);
                }
            }
            result.genre = genres;

            // Author and Artist from relationships
            var authors = [];
            var artists = [];
            var coverFile = null;

            if (data.relationships) {
                for (var r = 0; r < data.relationships.length; r++) {
                    var rel = data.relationships[r];
                    if (rel.type === "author" && rel.attributes) {
                        authors.push(rel.attributes.name);
                    }
                    if (rel.type === "artist" && rel.attributes) {
                        artists.push(rel.attributes.name);
                    }
                    if (rel.type === "cover_art" && rel.attributes) {
                        coverFile = rel.attributes.fileName;
                    }
                }
            }

            result.author = authors.length > 0 ? authors.join(", ") : null;
            result.artist = artists.length > 0 ? artists.join(", ") : null;

            // Cover
            if (coverFile) {
                result.thumbnailUrl = this.cdnUrl + "/covers/" + mangaId + "/" + coverFile + ".512.jpg";
            }

            return result;
        } catch(e) {
            bridge.log("MangaDex getMangaDetails error: " + e);
            return manga;
        }
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var mangaId = this._extractMangaId(manga.url);
        var chapters = [];
        var limit = 100;
        var offset = 0;
        var total = 1; // will be updated

        while (offset < total) {
            var url = this.apiUrl + "/manga/" + mangaId + "/feed"
                + "?limit=" + limit + "&offset=" + offset
                + "&order[chapter]=desc&order[volume]=desc"
                + "&includes[]=scanlation_group"
                + "&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic";

            var json = bridge.httpGet(url);
            if (!json || json.error) break;

            try {
                var resp = JSON.parse(json);
                if (resp.result !== "ok") break;

                total = resp.total || 0;

                for (var i = 0; i < resp.data.length; i++) {
                    var ch = resp.data[i];
                    var attrs = ch.attributes;

                    var chapter = SChapter.create();
                    chapter.url = "/chapter/" + ch.id;

                    // Build chapter name
                    var name = "";
                    if (attrs.volume) {
                        name += "Vol." + attrs.volume + " ";
                    }
                    if (attrs.chapter) {
                        name += "Ch." + attrs.chapter;
                    }
                    if (attrs.title) {
                        name += (name ? " - " : "") + attrs.title;
                    }
                    if (!name) {
                        name = "Oneshot";
                    }

                    // Add language tag
                    if (attrs.translatedLanguage) {
                        name += " [" + attrs.translatedLanguage + "]";
                    }

                    chapter.name = name;

                    // Chapter number
                    if (attrs.chapter) {
                        chapter.chapterNumber = parseFloat(attrs.chapter) || -1;
                    }

                    // Scanlation group
                    if (ch.relationships) {
                        for (var r = 0; r < ch.relationships.length; r++) {
                            if (ch.relationships[r].type === "scanlation_group" && ch.relationships[r].attributes) {
                                chapter.scanlator = ch.relationships[r].attributes.name;
                                break;
                            }
                        }
                    }

                    // Date
                    if (attrs.publishAt) {
                        chapter.dateUpload = new Date(attrs.publishAt).getTime() || 0;
                    }

                    chapters.push(chapter);
                }

                offset += limit;
            } catch(e) {
                bridge.log("MangaDex getChapterList error: " + e);
                break;
            }
        }

        return chapters;
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var chapterId = this._extractChapterId(chapter.url);
        var url = this.apiUrl + "/at-home/server/" + chapterId;

        var json = bridge.httpGet(url);
        if (!json || json.error) return [];

        try {
            var resp = JSON.parse(json);
            if (resp.result !== "ok") return [];

            var serverBaseUrl = resp.baseUrl;
            var hash = resp.chapter.hash;
            var files = resp.chapter.data; // full quality
            var pages = [];

            for (var i = 0; i < files.length; i++) {
                var imageUrl = serverBaseUrl + "/data/" + hash + "/" + files[i];
                pages.push(new Page(i, "", imageUrl));
            }

            return pages;
        } catch(e) {
            bridge.log("MangaDex getPageList error: " + e);
            return [];
        }
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            // Sort
            { type: "select", name: "Sort By", values: [
                "Popularity", "Relevance", "Latest Upload",
                "Newest", "Recently Updated", "Title", "Rating", "Year"
            ], state: 0 },
            { type: "select", name: "Sort Direction", values: ["Descending", "Ascending"], state: 0 },

            // Language
            { type: "separator" },
            { type: "header", name: "Language" },
            { type: "select", name: "Original Language", values: [
                "Any", "Japanese", "Korean", "Chinese (Simplified)", "Chinese (Traditional)", "English"
            ], state: 0 },
            { type: "select", name: "Translated Language", values: [
                "Any", "English", "Chinese (Simplified)", "Chinese (Traditional)",
                "Japanese", "Korean", "French", "German", "Spanish", "Portuguese (BR)", "Russian", "Italian"
            ], state: 0 },

            // Content Rating
            { type: "separator" },
            { type: "header", name: "Content Rating" },
            { type: "checkBox", name: "Safe", state: true },
            { type: "checkBox", name: "Suggestive", state: true },
            { type: "checkBox", name: "Erotica", state: true },
            { type: "checkBox", name: "Pornographic", state: false },

            // Publication Status
            { type: "separator" },
            { type: "header", name: "Publication Status" },
            { type: "checkBox", name: "Ongoing", state: false },
            { type: "checkBox", name: "Completed", state: false },
            { type: "checkBox", name: "Hiatus", state: false },
            { type: "checkBox", name: "Cancelled", state: false },

            // Demographic
            { type: "separator" },
            { type: "header", name: "Demographic" },
            { type: "checkBox", name: "Shounen", state: false },
            { type: "checkBox", name: "Shoujo", state: false },
            { type: "checkBox", name: "Seinen", state: false },
            { type: "checkBox", name: "Josei", state: false },

            // Tags
            { type: "separator" },
            { type: "header", name: "Tags (comma separated)" },
            { type: "text", name: "Include Tags", state: "" },
            { type: "text", name: "Exclude Tags", state: "" }
        ];
    },

    // ======== Private Helpers ========

    _fetchMangaList: function(url) {
        var json = bridge.httpGet(url);
        if (!json || json.error) return new MangasPage([], false);

        try {
            var resp = JSON.parse(json);
            if (resp.result !== "ok") return new MangasPage([], false);

            var mangas = [];
            for (var i = 0; i < resp.data.length; i++) {
                var item = resp.data[i];
                var attrs = item.attributes;

                var manga = SManga.create();
                manga.url = "/manga/" + item.id;
                manga.title = this._getLocalizedString(attrs.title) || "";

                // Find cover from relationships
                if (item.relationships) {
                    for (var r = 0; r < item.relationships.length; r++) {
                        var rel = item.relationships[r];
                        if (rel.type === "cover_art" && rel.attributes) {
                            manga.thumbnailUrl = this.cdnUrl + "/covers/" + item.id + "/" + rel.attributes.fileName + ".256.jpg";
                            break;
                        }
                    }
                }

                if (manga.title) {
                    mangas.push(manga);
                }
            }

            var hasNext = (resp.offset + resp.limit) < resp.total;
            return new MangasPage(mangas, hasNext);
        } catch(e) {
            bridge.log("MangaDex parse error: " + e);
            return new MangasPage([], false);
        }
    },

    _getLocalizedString: function(obj) {
        if (!obj) return null;
        // Priority: zh > zh-hk > en > ja > ko > first available
        var priorities = ["zh", "zh-hk", "en", "ja", "ko"];
        for (var i = 0; i < priorities.length; i++) {
            if (obj[priorities[i]]) return obj[priorities[i]];
        }
        // Return first available
        var keys = Object.keys(obj);
        return keys.length > 0 ? obj[keys[0]] : null;
    },

    _extractMangaId: function(url) {
        // url format: /manga/{uuid} or https://mangadex.org/manga/{uuid}
        var match = url.match(/\/manga\/([a-f0-9-]+)/);
        return match ? match[1] : url;
    },

    _extractChapterId: function(url) {
        var match = url.match(/\/chapter\/([a-f0-9-]+)/);
        return match ? match[1] : url;
    },

    // Tag name -> UUID mapping (common tags)
    _tagMap: null,
    _findTagId: function(tagName) {
        if (!this._tagMap) {
            this._tagMap = {};
            // Fetch tag list from API (cached after first call)
            var json = bridge.httpGet(this.apiUrl + "/manga/tag");
            if (json && !json.error) {
                try {
                    var resp = JSON.parse(json);
                    if (resp.data) {
                        for (var i = 0; i < resp.data.length; i++) {
                            var tag = resp.data[i];
                            var names = tag.attributes.name;
                            var keys = Object.keys(names);
                            for (var k = 0; k < keys.length; k++) {
                                this._tagMap[names[keys[k]].toLowerCase()] = tag.id;
                            }
                        }
                    }
                } catch(e) {
                    bridge.log("Failed to load tags: " + e);
                }
            }
        }
        return this._tagMap[tagName] || null;
    }
};
