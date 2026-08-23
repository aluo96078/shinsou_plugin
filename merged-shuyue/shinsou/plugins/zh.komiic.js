// Komiic Plugin for Mihon iOS
// Crawls https://komiic.com (GraphQL API)

var source = {
    baseUrl: "https://komiic.com",
    apiUrl: "https://komiic.com/api/query",
    supportsLatest: true,
    headers: {
        "Content-Type": "application/json",
        "Referer": "https://komiic.com/"
    },

    // ======== Popular ========

    getPopularManga: function(page) {
        var query = '{"query":"query { hotComics(pagination: {limit: 30, offset: ' + (page * 30) + ', orderBy: DATE_UPDATED, asc: false}) { id title status dateUpdated imageUrl authors { id name } categories { id name } } }"}';
        return this._fetchComicList(query);
    },

    // ======== Latest ========

    getLatestUpdates: function(page) {
        var query = '{"query":"query { recentUpdate(pagination: {limit: 30, offset: ' + (page * 30) + ', orderBy: DATE_UPDATED, asc: false}) { id title status dateUpdated imageUrl authors { id name } categories { id name } } }"}';
        return this._fetchComicList(query);
    },

    // ======== Search ========

    getSearchManga: function(page, query, filters) {
        if (query && query.trim()) {
            var keyword = query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            var searchQuery = '{"query":"query { searchComicsAndAuthors(keyword: \\"' + keyword + '\\") { comics { id title status dateUpdated imageUrl authors { id name } categories { id name } } } }"}';

            var json = bridge.httpPost(this.apiUrl, searchQuery, this.headers);
            if (!json || json.error) return new MangasPage([], false);

            try {
                var resp = JSON.parse(json);
                var comics = resp.data.searchComicsAndAuthors.comics || [];
                return this._parseComics(comics, false);
            } catch(e) {
                bridge.log("Komiic search error: " + e);
                return new MangasPage([], false);
            }
        }

        // Browse with filters
        var orderBy = "DATE_UPDATED";
        var status = "";

        if (filters && filters.length > 0) {
            for (var i = 0; i < filters.length; i++) {
                var f = filters[i];
                if (!f || !f.type) continue;

                if (f.type === "select" && f.name === "Sort By") {
                    var orders = ["DATE_UPDATED", "VIEWS", "FAVORITE_COUNT"];
                    orderBy = orders[f.state] || "DATE_UPDATED";
                }

                if (f.type === "select" && f.name === "Status") {
                    var statuses = ["", "ONGOING", "END"];
                    status = statuses[f.state] || "";
                }
            }
        }

        var statusFilter = status ? ', status: "' + status + '"' : '';
        var browseQuery = '{"query":"query { hotComics(pagination: {limit: 30, offset: ' + (page * 30) + ', orderBy: ' + orderBy + ', asc: false' + statusFilter + '}) { id title status dateUpdated imageUrl authors { id name } categories { id name } } }"}';

        return this._fetchComicList(browseQuery);
    },

    // ======== Fetch & Parse Comics ========

    _fetchComicList: function(query) {
        var json = bridge.httpPost(this.apiUrl, query, this.headers);
        if (!json || json.error) return new MangasPage([], false);

        try {
            var resp = JSON.parse(json);
            if (resp.errors) {
                bridge.log("Komiic API error: " + JSON.stringify(resp.errors));
                return new MangasPage([], false);
            }
            var data = resp.data;

            // Try different response shapes
            var comics = data.hotComics || data.recentUpdate || data.comicsByCategories || [];
            return this._parseComics(comics, comics.length >= 30);
        } catch(e) {
            bridge.log("Komiic list error: " + e);
            return new MangasPage([], false);
        }
    },

    _parseComics: function(comics, hasNext) {
        if (hasNext === undefined) hasNext = comics.length >= 30;
        var mangas = [];
        var self = this;

        for (var i = 0; i < comics.length; i++) {
            var comic = comics[i];
            var manga = SManga.create();
            manga.url = "/comic/" + comic.id;
            manga.title = comic.title || "";

            if (comic.imageUrl) {
                manga.thumbnailUrl = comic.imageUrl;
                if (manga.thumbnailUrl.indexOf("http") !== 0) {
                    manga.thumbnailUrl = self.baseUrl + manga.thumbnailUrl;
                }
            }

            if (manga.title) {
                mangas.push(manga);
            }
        }

        return new MangasPage(mangas, hasNext);
    },

    // ======== Manga Details ========

    getMangaDetails: function(manga) {
        var comicId = this._extractComicId(manga.url);
        var query = '{"query":"query { comicById(comicId: \\"' + comicId + '\\") { id title status dateUpdated imageUrl authors { id name } categories { id name } } }"}';

        var json = bridge.httpPost(this.apiUrl, query, this.headers);
        if (!json || json.error) return manga;

        try {
            var resp = JSON.parse(json);
            var comic = resp.data.comicById;
            if (!comic) return manga;

            var result = SManga.create();
            result.url = manga.url;
            result.initialized = true;
            result.title = comic.title || manga.title || "";

            if (comic.imageUrl) {
                result.thumbnailUrl = comic.imageUrl;
                if (result.thumbnailUrl.indexOf("http") !== 0) {
                    result.thumbnailUrl = this.baseUrl + result.thumbnailUrl;
                }
            }

            // Authors
            if (comic.authors && comic.authors.length > 0) {
                var authorNames = [];
                for (var a = 0; a < comic.authors.length; a++) {
                    authorNames.push(comic.authors[a].name);
                }
                result.author = authorNames.join(", ");
            }

            // Categories as genres
            if (comic.categories && comic.categories.length > 0) {
                var genres = [];
                for (var c = 0; c < comic.categories.length; c++) {
                    genres.push(comic.categories[c].name);
                }
                result.genre = genres;
            }

            // Status
            if (comic.status === "ONGOING") {
                result.status = SManga.ONGOING;
            } else if (comic.status === "END") {
                result.status = SManga.COMPLETED;
            } else {
                result.status = SManga.UNKNOWN;
            }

            return result;
        } catch(e) {
            bridge.log("Komiic details error: " + e);
            return manga;
        }
    },

    // ======== Chapter List ========

    getChapterList: function(manga) {
        var comicId = this._extractComicId(manga.url);
        var query = '{"query":"query { chaptersByComicId(comicId: \\"' + comicId + '\\") { id serial type dateCreated dateUpdated size } }"}';

        var json = bridge.httpPost(this.apiUrl, query, this.headers);
        if (!json || json.error) return [];

        try {
            var resp = JSON.parse(json);
            var chapterList = resp.data.chaptersByComicId || [];
            var chapters = [];

            for (var i = 0; i < chapterList.length; i++) {
                var ch = chapterList[i];
                var chapter = SChapter.create();
                chapter.url = "/chapter/" + ch.id + "/images/all";

                var name = "";
                if (ch.type === "book") {
                    name = "卷 " + ch.serial;
                } else {
                    name = "第 " + ch.serial + " 話";
                }
                chapter.name = name;
                chapter.chapterNumber = parseFloat(ch.serial) || (i + 1);

                if (ch.dateUpdated) {
                    chapter.dateUpload = new Date(ch.dateUpdated).getTime() || 0;
                }

                chapters.push(chapter);
            }

            return chapters;
        } catch(e) {
            bridge.log("Komiic chapters error: " + e);
            return [];
        }
    },

    // ======== Page List ========

    getPageList: function(chapter) {
        var chapterId = this._extractChapterId(chapter.url);
        // Use imageTickets API to get CDN URLs with auth tickets
        var query = '{"query":"query { imageTicketsByChapterId(chapterId: \\"' + chapterId + '\\") { url ticket kid width height } }"}';

        var json = bridge.httpPost(this.apiUrl, query, this.headers);
        if (!json || json.error) return [];

        try {
            var resp = JSON.parse(json);
            var images = resp.data.imageTicketsByChapterId || [];
            var pages = [];

            for (var i = 0; i < images.length; i++) {
                var img = images[i];
                // Encode ticket in URL fragment — app extracts it as X-Image-Ticket header
                var imageUrl = img.url + "#X-Image-Ticket=" + encodeURIComponent(img.ticket);
                pages.push(new Page(i, "", imageUrl));
            }

            return pages;
        } catch(e) {
            bridge.log("Komiic pages error: " + e);
            return [];
        }
    },

    // ======== Filters ========

    getFilterList: function() {
        return [
            { type: "select", name: "Sort By", values: ["最新更新", "最多觀看", "最多收藏"], state: 0 },
            { type: "select", name: "Status", values: ["全部", "連載中", "已完結"], state: 0 }
        ];
    },

    // ======== Helpers ========

    _extractComicId: function(url) {
        var match = url.match(/\/comic\/(\d+)/);
        return match ? match[1] : url;
    },

    _extractChapterId: function(url) {
        var match = url.match(/\/chapter\/(\d+)/);
        return match ? match[1] : url;
    }
};
