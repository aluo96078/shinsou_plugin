// 筆趣閣（biquge.tw）來源插件。
//
// 網站目前使用 UTF-8 HTML，作品、目錄與正文 URL 形式分別為：
//   /book/{bookId}.html
//   /book/{bookId}/
//   /book/{bookId}/{chapterId}.html
// 部分正文會拆成 *_2.html、*_3.html 等頁面；chapterText() 會將它們接起來。
var source = {
  id: "zh.biquge.tw",
  name: "筆趣閣",
  lang: "zh",
  baseUrl: "https://www.biquge.tw",
  supportsLogin: false,
  supportsLatest: true,
  supportsFavorites: false,

  headers: {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh-CN;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache"
  },

  login: function() {
    return false;
  },

  search: function(query, page) {
    var keyword = String(query || "").trim();
    if (!keyword) return [];

    // 直接輸入作品 ID 時，避免再走搜尋頁。
    var aid = this.aidFromText(keyword);
    if (aid && /^\d+$/.test(keyword)) {
      var direct = this.bookFromAid(aid);
      return direct ? [direct] : [];
    }

    var currentPage = parseInt(page, 10) || 1;
    var url = this.baseUrl + "/search.php?keyword=" + encodeURIComponent(keyword) + "&page=" + currentPage;
    var html = this.page(url, this.baseUrl + "/");
    if (this.isBlocked(html)) return [];
    return this.parseBookLinks(html, url);
  },

  latest: function(page) {
    return this.browse("top:lastupdate", page || 1);
  },

  browseOptions: function() {
    return [
      { id: "top:lastupdate", title: "最新更新", group: "排行榜" },
      { id: "top:allvisit", title: "總點擊", group: "排行榜" },
      { id: "top:monthvisit", title: "月點擊", group: "排行榜" },
      { id: "top:weekvisit", title: "週點擊", group: "排行榜" },
      { id: "top:dayvisit", title: "日點擊", group: "排行榜" },
      { id: "top:size", title: "總字數", group: "排行榜" },
      { id: "top:goodnum", title: "收藏數", group: "排行榜" },
      { id: "top:postdate", title: "新發布", group: "排行榜" },
      { id: "sort:all", title: "全部小說", group: "書庫" },
      { id: "sort:xuanhuan", title: "玄幻魔法", group: "書庫" },
      { id: "sort:wuxia", title: "武俠修真", group: "書庫" },
      { id: "sort:dushi", title: "都市言情", group: "書庫" },
      { id: "sort:lishi", title: "歷史軍事", group: "書庫" },
      { id: "sort:kehuan", title: "科幻靈異", group: "書庫" },
      { id: "sort:youxi", title: "遊戲競技", group: "書庫" },
      { id: "sort:nvsheng", title: "女生耽美", group: "書庫" },
      { id: "sort:qita", title: "其他類型", group: "書庫" }
    ];
  },

  browse: function(optionId, page) {
    var id = String(optionId || "");
    var parts = id.split(":");
    var kind = parts[0];
    var value = parts.slice(1).join(":");
    var path;
    if (kind === "top") {
      path = "/top/" + (value || "");
    } else if (kind === "sort") {
      path = "/sort/" + (value === "all" ? "" : value + "/");
    } else {
      return [];
    }

    var currentPage = parseInt(page, 10) || 1;
    var url = this.pageUrl(path, currentPage);
    var html = this.page(url, this.baseUrl + "/");
    if (this.isBlocked(html)) return [];
    return this.parseBookLinks(html, url);
  },

  favorite: function() {
    return false;
  },

  chapters: function(book) {
    var aid = this.aidFromText(book && book.url);
    if (!aid) return [];
    var bookUrl = this.bookUrl(aid);
    var url = this.baseUrl + "/book/" + aid + "/";
    var html = this.page(url, bookUrl);
    if (this.isBlocked(html)) return [];

    var chapters = [];
    var seen = {};
    var pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = pattern.exec(html || "")) !== null) {
      var href = this.absoluteUrl(match[1], url);
      var chapterMatch = /\/book\/(\d+)\/([^/?#]+\.html)(?:[?#][^"']*)?$/i.exec(href);
      if (!chapterMatch || chapterMatch[1] !== aid) continue;
      var canonical = href.split("#")[0];
      if (seen[canonical]) continue;
      var title = this.attr(match[0], "title") || this.cleanText(match[2]);
      if (!title) continue;
      chapters.push({
        sourceId: this.id,
        bookUrl: bookUrl,
        title: title,
        url: canonical,
        index: chapters.length
      });
      seen[canonical] = true;
    }
    return chapters;
  },

  chapterText: function(chapter) {
    var currentUrl = String(chapter && chapter.url || "");
    if (!currentUrl) return "";

    var pages = [];
    var seen = {};
    for (var i = 0; i < 20 && currentUrl; i++) {
      if (seen[currentUrl]) break;
      seen[currentUrl] = true;

      var html = this.page(currentUrl, chapter.bookUrl || this.baseUrl);
      if (this.isBlocked(html)) {
        return "[無法載入章節內容，來源暫時被 Cloudflare 阻擋，請稍後再試]";
      }
      if (!html) break;

      var content = this.extractContent(html);
      if (content) pages.push(this.htmlToText(content));
      var next = this.nextPartUrl(html, currentUrl);
      if (!next || seen[next]) break;
      currentUrl = next;
    }
    return pages.filter(function(text) { return text; }).join("\n\n");
  },

  bookFromAid: function(aid) {
    var url = this.bookUrl(aid);
    var html = this.page(url, this.baseUrl + "/");
    if (!html || this.isBlocked(html)) return null;
    var block = html;
    var title = this.firstText(block, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
      || this.firstText(block, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!title) return null;
    return {
      sourceId: this.id,
      title: this.cleanTitle(title),
      url: url,
      author: this.extractAuthor(block),
      description: this.extractDescription(block),
      coverImage: this.extractCover(block, url)
    };
  },

  parseBookLinks: function(html, pageUrl) {
    var results = [];
    var seen = {};
    var pattern = /<a\b[^>]*href=["']([^"']*\/book\/(\d+)\.html(?:[?#][^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var match;
    while ((match = pattern.exec(html || "")) !== null) {
      var aid = match[2];
      if (!aid || seen[aid]) continue;
      var block = String(html || "").substring(
        Math.max(0, match.index - 1800),
        Math.min(String(html || "").length, pattern.lastIndex + 1800)
      );
      var title = this.attr(match[0], "title")
        || this.firstAttr(match[3], /<img\b[^>]+(?:alt|title)=["']([^"']+)["']/i)
        || this.cleanText(match[3]);
      // Image-only links are commonly followed by a separate title link for
      // the same book. Let that textual link provide the result metadata.
      if (!title && /<img\b/i.test(match[3])) continue;
      if (!title) title = this.firstText(block, /<h[123]\b[^>]*>([\s\S]*?)<\/h[123]>/i);
      title = this.cleanTitle(title);
      if (!title || /^(?:首頁|首页|筆趣閣|笔趣阁)$/.test(title)) continue;

      results.push({
        sourceId: this.id,
        title: title,
        url: this.bookUrl(aid),
        author: this.extractAuthor(block),
        description: this.extractDescription(block),
        // Do not fall back to the first image in `block`: that image often
        // belongs to the preceding result and creates a wrong cover match.
        coverImage: this.extractCoverNearAnchor(html, match.index, pattern.lastIndex, pageUrl, aid)
      });
      seen[aid] = true;
    }
    return results;
  },

  extractContent: function(html) {
    var text = String(html || "");
    var opening = /<(?:div|section)\b[^>]*id=["']chaptercontent["'][^>]*>/i.exec(text);
    if (!opening) opening = /<(?:div|section)\b[^>]*(?:class|id)=["'][^"']*chaptercontent[^"']*["'][^>]*>/i.exec(text);
    if (!opening) return "";
    var start = opening.index + opening[0].length;
    var tagMatch = /^<([a-z]+)/i.exec(opening[0]);
    var tag = tagMatch ? tagMatch[1] : "div";
    var tokenPattern = new RegExp("<\\/?" + tag + "\\b[^>]*>", "gi");
    tokenPattern.lastIndex = start;
    var depth = 1;
    var token;
    while ((token = tokenPattern.exec(text)) !== null) {
      if (/^<\//.test(token[0])) {
        depth -= 1;
        if (depth === 0) return text.substring(start, token.index);
      } else if (!/\/\s*>$/.test(token[0])) {
        depth += 1;
      }
    }
    return text.substring(start);
  },

  htmlToText: function(html) {
    var value = String(html || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<(?:iframe|form|noscript)\b[\s\S]*?<\/(?:iframe|form|noscript)>/gi, "")
      .replace(/<a\b[^>]*(?:id|class)=["'][^"']*(?:next[_-]?url|prev[_-]?url|chapter-nav|pagination|readbtn)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "")
      .replace(/<div\b[^>]*(?:id|class)=["'][^"']*(?:ad|ads|advert|readpage|readbtn|pagination|chapter-nav|bottom)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|section|article|li|tr|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    value = this.decodeEntities(value).replace(/\r/g, "");
    return value.split("\n").map(function(line) {
      return line.replace(/[ \t\u00a0]+/g, " ").trim();
    }).filter(function(line) {
      return line && !/^(?:上一章|下一章|上一頁|下一頁|章节目录|章節目錄)$/.test(line);
    }).join("\n\n").trim();
  },

  nextPartUrl: function(html, currentUrl) {
    var tag = /<a\b[^>]*id=["']next_url["'][^>]*>/i.exec(html || "");
    if (!tag) tag = /<a\b[^>]*href=["'][^"']+["'][^>]*id=["']next_url["'][^>]*>/i.exec(html || "");
    var href = tag ? this.attr(tag[0], "href") : "";
    if (!href) {
      var textMatch = /<a\b[^>]*href=["']([^"']+)["'][^>]*>[^<]*(?:下一頁|下一页)[^<]*<\/a>/i.exec(html || "");
      href = textMatch ? textMatch[1] : "";
    }
    if (!href || !/_\d+\.html(?:[?#]|$)/i.test(href)) return "";
    return this.absoluteUrl(href, currentUrl);
  },

  page: function(url, referer) {
    var requestHeaders = this.mergeHeaders({
      "Referer": referer || this.baseUrl + "/"
    });
    var html = bridge.httpGetWithHeaders
      ? bridge.httpGetWithHeaders(url, requestHeaders)
      : bridge.httpGet(url);
    this.log("GET " + url + " -> " + (html ? html.length : 0));
    if (html && !this.isBlocked(html)) return html;

    // Cloudflare 有時會把 challenge 回傳為空字串。iOS 的 WebView bridge
    // 能保留 JS/cookie session；只有拿到 challenge 或空回應才啟用它。
    if (bridge.webViewGetWithHeaders) {
      var browserHtml = bridge.webViewGetWithHeaders(url, requestHeaders);
      if (browserHtml) return browserHtml;
    }
    return html || "";
  },

  pageUrl: function(path, page) {
    var currentPage = parseInt(page, 10) || 1;
    if (currentPage <= 1) return this.baseUrl + path;
    var normalized = path.replace(/\/+$/, "");
    return this.baseUrl + normalized + "/" + currentPage + ".html";
  },

  bookUrl: function(aid) {
    return this.baseUrl + "/book/" + aid + ".html";
  },

  extractAuthor: function(html) {
    return this.firstText(html, /<a\b[^>]+href=["'][^"']*\/author\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i)
      || this.firstText(html, /(?:作者|作家)\s*[：:]?\s*(?:<[^>]+>\s*)*([^<\n]+)/i)
      || "";
  },

  extractDescription: function(html) {
    return this.firstText(html, /<(?:div|p)\b[^>]*(?:class|id)=["'][^"']*(?:intro|desc|summary|book-intro)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/i)
      || this.firstText(html, /(?:小说简介|小說簡介)\s*[：:]?\s*([\s\S]{0,1800}?)(?:<\/div>|<h[1-6]\b)/i)
      || "";
  },

  extractCover: function(html, pageUrl) {
    var cover = this.firstImageAttribute(html, /<(?:div|a)\b[^>]*(?:class|id)=["'][^"']*cover[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*>/i)
      || this.firstImageAttribute(html, /<img\b[^>]+(?:src|data-src|data-original)=["']([^"']*img\.biquge\.tw[^"']+)["']/i)
      || this.firstImageAttribute(html, /<img\b[^>]*>/i);
    return cover ? this.absoluteUrl(cover, pageUrl) : "";
  },

  // Search result cards do not always put the image inside the book link.
  // Pick the preceding image in that card instead of taking the first image
  // in a large surrounding block (which belongs to another book).
  extractCoverNearAnchor: function(html, start, end, pageUrl, aid) {
    var text = String(html || "");
    var anchorText = text.substring(start, end);
    var direct = this.imageAttribute(anchorText);
    if (direct) return this.absoluteUrl(direct, pageUrl);

    // A result card normally places its cover before the title link. Stop at
    // the preceding anchor so an item without a cover cannot borrow the next
    // item's image.
    var previousAnchorEnd = text.lastIndexOf("</a>", start);
    var previousAnchorStart = text.lastIndexOf("<a", Math.max(0, start - 1));
    var previousAnchor = previousAnchorStart >= 0 && previousAnchorEnd >= previousAnchorStart
      ? text.substring(previousAnchorStart, previousAnchorEnd + 4)
      : "";
    var previousAid = /\/book\/(\d+)\.html(?:[?#][^"']*)?/i.exec(previousAnchor);
    var boundary = previousAid && previousAid[1] === String(aid || "")
      ? previousAnchorStart
      : previousAnchorEnd + 4;
    var windowStart = Math.max(boundary, start - 900, 0);
    var windowText = text.substring(windowStart, start);
    var imagePattern = /<img\b[^>]*>/gi;
    var best = "";
    var bestDistance = Infinity;
    var match;
    while ((match = imagePattern.exec(windowText)) !== null) {
      var imageStart = windowStart + match.index;
      var imageEnd = imageStart + match[0].length;
      var distance = start - imageEnd;
      if (distance >= bestDistance) continue;
      var image = this.imageAttribute(match[0]);
      if (!image) continue;
      best = image;
      bestDistance = distance;
    }
    return best ? this.absoluteUrl(best, pageUrl) : "";
  },

  firstImageAttribute: function(html, pattern) {
    var match = pattern.exec(html || "");
    return match ? this.imageAttribute(match[0]) : "";
  },

  imageAttribute: function(tag) {
    return this.firstAttr(tag, /\bdata-src\s*=\s*["']([^"']+)["']/i)
      || this.firstAttr(tag, /\bdata-original\s*=\s*["']([^"']+)["']/i)
      || this.firstAttr(tag, /\bsrc\s*=\s*["']([^"']+)["']/i);
  },

  firstText: function(html, pattern) {
    var match = pattern.exec(html || "");
    return match ? this.cleanText(match[1]) : "";
  },

  firstAttr: function(html, pattern) {
    var match = pattern.exec(html || "");
    return match ? this.decodeEntities(match[1]) : "";
  },

  attr: function(html, name) {
    var pattern = new RegExp(name + "\\s*=\\s*[\\\"']([^\\\"']+)[\\\"']", "i");
    return this.firstAttr(html, pattern);
  },

  aidFromText: function(value) {
    var match = /\/book\/(\d+)(?:\.html|\/)|(?:id|aid)=?(\d+)/i.exec(String(value || ""));
    if (match) return match[1] || match[2];
    var plain = String(value || "").trim();
    return /^\d+$/.test(plain) ? plain : "";
  },

  absoluteUrl: function(url, baseUrl) {
    var value = this.decodeEntities(String(url || "")).trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.indexOf("//") === 0) return "https:" + value;
    if (/^(?:data|javascript|mailto):/i.test(value)) return "";

    var originMatch = /^(https?:\/\/[^/]+)/i.exec(this.baseUrl);
    var origin = originMatch ? originMatch[1] : this.baseUrl.replace(/\/+$/, "");
    if (value.charAt(0) === "/") return origin + value;

    var base = String(baseUrl || this.baseUrl + "/").split(/[?#]/)[0];
    if (base.charAt(base.length - 1) !== "/") {
      base = base.substring(0, base.lastIndexOf("/") + 1);
    }
    var suffixIndex = value.search(/[?#]/);
    var relativePath = suffixIndex >= 0 ? value.substring(0, suffixIndex) : value;
    var suffix = suffixIndex >= 0 ? value.substring(suffixIndex) : "";
    var combined = base + relativePath;
    var pathMatch = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(combined);
    if (!pathMatch) return combined + suffix;
    var path = pathMatch[2] || "/";
    var parts = path.split("/");
    var normalized = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i] || parts[i] === ".") continue;
      if (parts[i] === "..") {
        if (normalized.length) normalized.pop();
      } else {
        normalized.push(parts[i]);
      }
    }
    return pathMatch[1] + "/" + normalized.join("/") + suffix;
  },

  cleanTitle: function(value) {
    return this.cleanText(String(value || "").replace(/\s*[-|_]\s*(?:筆趣閣|笔趣阁).*$/i, ""));
  },

  cleanText: function(value) {
    return this.decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  },

  decodeEntities: function(value) {
    return String(value || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
      .replace(/&#(\d+);/g, function(_, number) { return String.fromCharCode(parseInt(number, 10)); });
  },

  mergeHeaders: function(headers) {
    var merged = {};
    var key;
    for (key in this.headers) merged[key] = this.headers[key];
    for (key in (headers || {})) merged[key] = headers[key];
    return merged;
  },

  isBlocked: function(html) {
    return /challenge-form|cf_chl_|Just a moment|Checking your browser|Enable JavaScript and cookies|Attention Required|Sorry, you have been blocked/i.test(String(html || ""));
  },

  log: function(message) {
    try {
      if (typeof bridge === "undefined" || !bridge || typeof bridge.log !== "function") return;
      var text = String(message == null ? "" : message);
      var arity = Number(bridge.log.length);
      if (isFinite(arity) && arity <= 1) bridge.log(text);
      else bridge.log(this.id, text);
    } catch (ignored) {}
  }
};

// Legacy Shinsou plugin compatibility. Keep the current ShuYue source API
// intact while exposing the historical get* contract used by old hosts.
(function installLegacyShinsouContract(target) {
  function pageNumber(value) {
    var number = Number(value);
    return isFinite(number) ? Math.max(1, Math.floor(number) + 1) : 1;
  }

  function legacyBook(value) {
    if (!value || typeof value !== "object") return null;
    var url = String(value.url || "");
    if (!url) return null;
    var status = typeof value.status === "number" && isFinite(value.status) ? value.status : 0;
    return {
      url: url,
      title: String(value.title || value.name || url),
      author: value.author || null,
      artist: value.artist || null,
      description: value.description || null,
      genre: value.genre || null,
      status: status,
      thumbnailUrl: value.thumbnailUrl || value.thumbnail_url || value.coverImage || value.cover || null,
      initialized: true
    };
  }

  function legacyPage(values, hasNextPage) {
    var list = Array.isArray(values) ? values : [];
    var mangas = [];
    for (var i = 0; i < list.length; i++) {
      var mapped = legacyBook(list[i]);
      if (mapped) mangas.push(mapped);
    }
    return { mangas: mangas, hasNextPage: hasNextPage === undefined ? mangas.length > 0 : !!hasNextPage };
  }

  function selectedFilter(filters) {
    if (!Array.isArray(filters)) return 0;
    for (var i = 0; i < filters.length; i++) {
      var filter = filters[i] || {};
      if (Array.isArray(filter.values)) {
        var state = Number(filter.state);
        if (isFinite(state)) return Math.max(0, Math.floor(state));
      }
      var nested = selectedFilter(filter.filters);
      if (nested > 0) return nested;
    }
    return 0;
  }

  function legacyFilters() {
    var options = typeof target.browseOptions === "function" ? target.browseOptions() : [];
    var values = ["搜尋"];
    for (var i = 0; i < options.length; i++) values.push(String(options[i].title || options[i].id || "分類"));
    return [{ type: "select", name: "分類", values: values, state: 0 }];
  }

  target.getPopularManga = function(page) {
    return legacyPage(target.latest(pageNumber(page)));
  };

  target.getLatestUpdates = function(page) {
    return legacyPage(target.latest(pageNumber(page)));
  };

  target.getSearchManga = function(page, query, filters) {
    var options = typeof target.browseOptions === "function" ? target.browseOptions() : [];
    var selected = selectedFilter(filters);
    if (selected > 0 && options[selected - 1]) {
      return legacyPage(target.browse(options[selected - 1].id, pageNumber(page)));
    }
    return legacyPage(target.search(String(query || ""), pageNumber(page)));
  };

  target.getMangaDetails = function(manga) {
    var input = manga || {};
    var aid = typeof target.aidFromText === "function" ? target.aidFromText(input.url) : "";
    var details = aid && typeof target.bookFromAid === "function" ? target.bookFromAid(aid) : null;
    return legacyBook(details || input) || legacyBook({ url: String(input.url || ""), title: String(input.title || "") });
  };

  target.getChapterList = function(manga) {
    var input = manga || {};
    var values = typeof target.chapters === "function" ? target.chapters({
      url: String(input.url || ""),
      title: String(input.title || "")
    }) : [];
    var chapters = [];
    for (var i = 0; i < values.length; i++) {
      var value = values[i] || {};
      var url = String(value.url || "");
      if (!url) continue;
      chapters.push({
        url: url,
        name: String(value.title || value.name || url),
        scanlator: null,
        dateUpload: 0,
        chapterNumber: typeof value.index === "number" ? value.index : i
      });
    }
    return chapters;
  };

  // Older Shinsou hosts only know image-oriented Page values. Preserve the
  // chapter URL and attach text/content for hosts that understand text pages.
  target.getPageList = function(chapter) {
    var input = chapter || {};
    var text = typeof target.chapterText === "function" ? target.chapterText(input) : "";
    if (!text) return [];
    return [{ index: 0, url: String(input.url || ""), imageUrl: null, text: String(text), content: String(text) }];
  };

  target.getFilterList = legacyFilters;

  target.logout = function() {
    try {
      if (typeof bridge !== "undefined" && bridge) {
        if (typeof bridge.clearCredential === "function") bridge.clearCredential();
        if (typeof bridge.clearCookies === "function") bridge.clearCookies();
      }
    } catch (ignored) {}
  };
})(source);
