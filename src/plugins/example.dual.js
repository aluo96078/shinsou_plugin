/*
 * Shinsou Extension v2 dual-platform reference artifact.
 *
 * This fixture is intentionally offline: it shows how one package can expose
 * one novel source and one manga source without making network requests. The
 * source IDs are opaque on purpose; the host must select by exact ID.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"example.dual","contentType":"both","contentKinds":["PLAIN_TEXT","IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};

function examplePageNumber(value) {
  var page = Number(value);
  return isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function examplePage(values, page) {
  var current = examplePageNumber(page);
  var size = 20;
  var start = (current - 1) * size;
  return {
    mangas: values.slice(start, start + size),
    hasNextPage: start + size < values.length
  };
}

function exampleText(value) {
  return String(value || "").trim().toLowerCase();
}

function exampleMatches(book, query) {
  var key = exampleText(query);
  if (!key) return true;
  return exampleText(book.title).indexOf(key) >= 0 ||
    exampleText(book.author).indexOf(key) >= 0 ||
    exampleText(book.genre).indexOf(key) >= 0;
}

function exampleFilterState(filters) {
  if (!Array.isArray(filters)) return 0;
  for (var i = 0; i < filters.length; i++) {
    var filter = filters[i] || {};
    var state = Number(filter.state);
    if (isFinite(state)) return Math.max(0, Math.floor(state));
  }
  return 0;
}

function exampleFilterBooks(items, filters, labels) {
  var state = exampleFilterState(filters);
  if (state <= 0 || !labels[state]) return items.slice();
  var wanted = labels[state];
  var result = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].genre === wanted) result.push(items[i]);
  }
  return result;
}

function exampleManga(book, sourceId, baseUrl) {
  return {
    sourceId: sourceId,
    url: baseUrl + "/works/" + book.id,
    title: book.title,
    author: book.author,
    artist: book.author,
    description: book.description,
    genre: book.genre,
    status: book.status,
    thumbnailUrl: book.thumbnailUrl || null,
    initialized: true
  };
}

var novelFilterLabels = ["全部", "科幻", "奇幻", "校園"];
var novelBooks = [
  {
    id: "novel-001",
    title: "星海書頁",
    author: "林澄",
    genre: "科幻",
    status: 1,
    description: "一名修復師在失重圖書館尋找失落的航行日誌。",
    chapters: [
      { id: "novel-001-01", title: "第一章　無重力的紙張", content: "紙張在穹頂下緩慢旋轉，林澄伸手接住了第一頁。這是離開母星以前，最後一本完整的航行日誌。" },
      { id: "novel-001-02", title: "第二章　星門背面", content: "星門只在午夜開啟。她把修復好的書頁貼回封面，聽見遠方傳來像潮汐一樣的引擎聲。" }
    ]
  },
  {
    id: "novel-002",
    title: "霧城的魔法課",
    author: "周未央",
    genre: "奇幻",
    status: 2,
    description: "在每天下霧的城市，轉學生學會把故事變成咒語。",
    chapters: [
      { id: "novel-002-01", title: "第一課　借來的火", content: "老師說，魔法不是把火變出來，而是向夜色借一點光。" },
      { id: "novel-002-02", title: "第二課　會說話的鐘", content: "鐘在午休時開口，提醒所有人：真正的考試從放學以後才開始。" }
    ]
  },
  {
    id: "novel-003",
    title: "夏日交換日記",
    author: "白川",
    genre: "校園",
    status: 1,
    description: "兩位無法碰面的同學，用一本日記交換各自的夏天。",
    chapters: [
      { id: "novel-003-01", title: "第一章　窗邊的座位", content: "我們約定每天只寫一頁，卻在第一天就把整個下午寫完了。" },
      { id: "novel-003-02", title: "第二章　雨停以前", content: "雨聲把操場分成兩個世界，日記本在課桌下悄悄完成交接。" }
    ]
  }
];

var novelSource = {
  id: "example.dual.novel",
  name: "範例小說",
  lang: "zh",
  baseUrl: "https://example.invalid/novel",
  contentType: "novel",
  contentKinds: ["PLAIN_TEXT"],
  supportsLatest: true,
  supportsLogin: false,
  supportsFavorites: false,

  getPopularManga: function(page) {
    var values = [];
    for (var i = 0; i < novelBooks.length; i++) values.push(exampleManga(novelBooks[i], this.id, this.baseUrl));
    return examplePage(values, page);
  },

  getLatestUpdates: function(page) {
    return this.getPopularManga(page);
  },

  getSearchManga: function(page, query, filters) {
    var values = exampleFilterBooks(novelBooks, filters, novelFilterLabels);
    var results = [];
    for (var i = 0; i < values.length; i++) {
      if (exampleMatches(values[i], query)) results.push(exampleManga(values[i], this.id, this.baseUrl));
    }
    return examplePage(results, page);
  },

  getMangaDetails: function(manga) {
    var input = manga || {};
    for (var i = 0; i < novelBooks.length; i++) {
      if (String(input.url || "").indexOf(novelBooks[i].id) >= 0) {
        return exampleManga(novelBooks[i], this.id, this.baseUrl);
      }
    }
    return input;
  },

  getChapterList: function(manga) {
    var input = manga || {};
    var book = null;
    for (var i = 0; i < novelBooks.length; i++) {
      if (String(input.url || "").indexOf(novelBooks[i].id) >= 0) book = novelBooks[i];
    }
    if (!book) return [];
    var chapters = [];
    for (var j = 0; j < book.chapters.length; j++) {
      var chapter = book.chapters[j];
      chapters.push({
        url: this.baseUrl + "/chapters/" + chapter.id,
        name: chapter.title,
        scanlator: null,
        dateUpload: 0,
        chapterNumber: j + 1
      });
    }
    return chapters;
  },

  getPageList: function(chapter) {
    var input = chapter || {};
    var chapterUrl = String(input.url || "");
    for (var i = 0; i < novelBooks.length; i++) {
      for (var j = 0; j < novelBooks[i].chapters.length; j++) {
        var value = novelBooks[i].chapters[j];
        if (chapterUrl.indexOf(value.id) >= 0) {
          return [{ index: 0, url: chapterUrl, imageUrl: null, text: value.content, content: value.content }];
        }
      }
    }
    return [];
  },

  getFilterList: function() {
    return [{ type: "select", name: "小說分類", values: novelFilterLabels, state: 0 }];
  }
};

var mangaFilterLabels = ["全部", "冒險", "懸疑", "日常"];
var mangaBooks = [
  {
    id: "manga-001",
    title: "雲端偵探社",
    author: "夏野",
    genre: "懸疑",
    status: 1,
    description: "偵探們在雲端城市追查一宗沒有受害者的案件。",
    thumbnailUrl: "https://example.invalid/assets/manga-001-cover.jpg",
    chapters: [
      { id: "manga-001-01", title: "File 01　無人的房間", pages: ["https://example.invalid/assets/manga-001-01-01.jpg", "https://example.invalid/assets/manga-001-01-02.jpg"] },
      { id: "manga-001-02", title: "File 02　倒轉的雨", pages: ["https://example.invalid/assets/manga-001-02-01.jpg"] }
    ]
  },
  {
    id: "manga-002",
    title: "風之郵差",
    author: "栗子",
    genre: "冒險",
    status: 2,
    description: "郵差帶著一封不能寄出的信，穿越會移動的群島。",
    thumbnailUrl: "https://example.invalid/assets/manga-002-cover.jpg",
    chapters: [
      { id: "manga-002-01", title: "第一話　起風的港口", pages: ["https://example.invalid/assets/manga-002-01-01.jpg", "https://example.invalid/assets/manga-002-01-02.jpg"] },
      { id: "manga-002-02", title: "第二話　浮島之間", pages: ["https://example.invalid/assets/manga-002-02-01.jpg"] }
    ]
  },
  {
    id: "manga-003",
    title: "貓與午後三點",
    author: "米粒",
    genre: "日常",
    status: 1,
    description: "一隻貓每天準時拜訪同一間咖啡店，店員開始記錄牠的秘密。",
    thumbnailUrl: "https://example.invalid/assets/manga-003-cover.jpg",
    chapters: [
      { id: "manga-003-01", title: "第 1 話　奶泡", pages: ["https://example.invalid/assets/manga-003-01-01.jpg"] },
      { id: "manga-003-02", title: "第 2 話　窗台", pages: ["https://example.invalid/assets/manga-003-02-01.jpg"] }
    ]
  }
];

var mangaSource = {
  id: "example.dual.manga",
  name: "範例漫畫",
  lang: "zh",
  baseUrl: "https://example.invalid/manga",
  contentType: "manga",
  contentKinds: ["IMAGE_SEQUENCE"],
  supportsLatest: true,
  supportsLogin: false,
  supportsFavorites: false,

  getPopularManga: function(page) {
    var values = [];
    for (var i = 0; i < mangaBooks.length; i++) values.push(exampleManga(mangaBooks[i], this.id, this.baseUrl));
    return examplePage(values, page);
  },

  getLatestUpdates: function(page) {
    return this.getPopularManga(page);
  },

  getSearchManga: function(page, query, filters) {
    var values = exampleFilterBooks(mangaBooks, filters, mangaFilterLabels);
    var results = [];
    for (var i = 0; i < values.length; i++) {
      if (exampleMatches(values[i], query)) results.push(exampleManga(values[i], this.id, this.baseUrl));
    }
    return examplePage(results, page);
  },

  getMangaDetails: function(manga) {
    var input = manga || {};
    for (var i = 0; i < mangaBooks.length; i++) {
      if (String(input.url || "").indexOf(mangaBooks[i].id) >= 0) {
        return exampleManga(mangaBooks[i], this.id, this.baseUrl);
      }
    }
    return input;
  },

  getChapterList: function(manga) {
    var input = manga || {};
    var book = null;
    for (var i = 0; i < mangaBooks.length; i++) {
      if (String(input.url || "").indexOf(mangaBooks[i].id) >= 0) book = mangaBooks[i];
    }
    if (!book) return [];
    var chapters = [];
    for (var j = 0; j < book.chapters.length; j++) {
      var chapter = book.chapters[j];
      chapters.push({
        url: this.baseUrl + "/chapters/" + chapter.id,
        name: chapter.title,
        scanlator: "範例工作室",
        dateUpload: 0,
        chapterNumber: j + 1
      });
    }
    return chapters;
  },

  getPageList: function(chapter) {
    var input = chapter || {};
    var chapterUrl = String(input.url || "");
    for (var i = 0; i < mangaBooks.length; i++) {
      for (var j = 0; j < mangaBooks[i].chapters.length; j++) {
        var value = mangaBooks[i].chapters[j];
        if (chapterUrl.indexOf(value.id) >= 0) {
          var pages = [];
          for (var k = 0; k < value.pages.length; k++) {
            pages.push({ index: k, url: value.pages[k], imageUrl: value.pages[k] });
          }
          return pages;
        }
      }
    }
    return [];
  },

  getFilterList: function() {
    return [{ type: "select", name: "漫畫分類", values: mangaFilterLabels, state: 0 }];
  }
};

// Multi-source packages are selected by exact source ID by the host runtime.
var sources = [novelSource, mangaSource];
var source = sources[0];
if (typeof __shinsouRequestedSourceId !== "undefined") {
  for (var sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
    if (String(sources[sourceIndex].id) === String(__shinsouRequestedSourceId)) source = sources[sourceIndex];
  }
}
for (var metadataIndex = 0; metadataIndex < sources.length; metadataIndex++) {
  sources[metadataIndex].v2 = __shinsouExtensionV2;
}
source.v2 = __shinsouExtensionV2;
