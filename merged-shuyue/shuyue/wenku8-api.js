// Wenku8's relay API source.
//
// This is deliberately a separate source from wenku8.js.  The latter talks to
// the public HTML site; this source uses the first-party relay used by the
// Android application and therefore keeps the two implementations installable
// side by side.
var source = {
  id: "zh.wenku8.api",
  name: "輕小說文庫",
  lang: "zh",
  baseUrl: "https://wenku8-relay.mewx.org/",
  htmlBaseUrl: "https://www.wenku8.net",
  supportsLogin: true,
  supportsLatest: true,
  supportsFavorites: true,
  _lastLoginRequestAt: 0,
  _appverCache: "",
  _appverMinute: 0,
  _language: 1,
  _loginInProgress: false,
  _bookInfoCache: {},

  // ShuYue scopes credentials by source id; older Shinsou bridge methods are
  // already bound to the current source and accept no argument.
  credential: function(method) {
    try {
      if (typeof bridge === "undefined" || !bridge || typeof bridge[method] !== "function") return "";
      var getter = bridge[method];
      var arity = Number(getter.length);
      return isFinite(arity) && arity <= 0 ? (getter() || "") : (getter(this.id) || "");
    } catch (ignored) {
      return "";
    }
  },

  login: function(username, password) {
    this._loginInProgress = true;
    var first = this.relay("action=login&username=" + this.urlEncode(username) +
      "&password=" + this.urlEncode(password));
    var status = this.statusCode(first);
    // The relay has a separate login action for email accounts.  Trying it
    // after a normal username failure mirrors the Android client's behaviour.
    if (status !== 1) {
      var second = this.relay("action=loginemail&username=" + this.urlEncode(username) +
        "&password=" + this.urlEncode(password));
      status = this.statusCode(second);
    }
    this._loginInProgress = false;
    if (status === 1) {
      this._lastLoginRequestAt = 0;
      return true;
    }
    return false;
  },

  search: function(query, page) {
    var key = String(query || "").trim();
    if (!key) return [];
    var aid = this.aidFromText(key);
    if (aid) {
      var direct = this.bookFromAid(aid);
      return direct ? [direct] : [];
    }
    var response = this.relay("action=search&searchtype=articlename&searchkey=" +
      this.urlEncode(key) + "&t=" + this.languageFlag());
    if (this.handleAuth(response, "搜尋需要登入")) return [];
    return this.parseResultBooks(response);
  },

  latest: function(page) {
    return this.list("lastupdate", page || 1, false);
  },

  browseOptions: function() {
    // Do not synchronously fetch the legacy HTML tags page while opening the
    // category picker. That page is Cloudflare-sensitive and can consume the
    // native HTTP timeout before the UI receives any options. The old source
    // already has a stable fallback taxonomy, so expose it immediately here.
    return [
      { id: "rank:lastupdate", title: "最近更新", group: "排行榜" },
      { id: "rank:allvisit", title: "總點擊榜", group: "排行榜" },
      { id: "rank:monthvisit", title: "月點擊榜", group: "排行榜" },
      { id: "rank:weekvisit", title: "週點擊榜", group: "排行榜" },
      { id: "rank:dayvisit", title: "日點擊榜", group: "排行榜" },
      { id: "rank:postdate", title: "最新入庫", group: "排行榜" },
      { id: "rank:goodnum", title: "總收藏榜", group: "排行榜" },
      { id: "rank:size", title: "字數排行", group: "排行榜" },
      { id: "article:0", title: "全部作品", group: "作品列表" },
      { id: "article:1", title: "完結作品", group: "作品列表" },
      { id: "bookcase", title: "我的收藏庫", group: "個人" }
    ].concat(this.fallbackTagOptions());
  },

  browse: function(optionId, page) {
    var id = String(optionId || "");
    var currentPage = page || 1;
    if (id === "bookcase") {
      if (currentPage > 1) return [];
      var bookcaseResponse = this.relay("action=bookcase&do=list&t=" + this.languageFlag());
      if (this.handleAuth(bookcaseResponse, "收藏庫需要登入，登入可能已失效。")) return [];
      return this.parseBookcase(bookcaseResponse);
    }
    if (id.indexOf("rank:") === 0) return this.list(id.substring(5), currentPage, false);
    if (id === "article:0" || id === "article:1") return this.browseHtmlArticle(id.substring(8), currentPage);
    if (id.indexOf("tag:") === 0) return this.browseTag(id, currentPage);
    return [];
  },

  // The Relay API does not expose the old tag taxonomy as a documented
  // action. Keep the legacy tag browser available through its read-only HTML
  // endpoint, while all account/book/chapter operations remain on Relay.
  browseTag: function(optionId, page) {
    var parts = String(optionId || "").substring(4).split(":");
    var view = parts.pop() || "0";
    var tag = parts.join(":");
    var url = this.htmlBaseUrl + "/modules/article/tags.php?t=" + this.gbkEncode(tag) +
      "&v=" + this.urlEncode(view) + "&page=" + (page || 1) + "&charset=gbk";
    var html = this.htmlGet(url);
    if (this.isLoginHtml(html)) {
      this.requestLogin("分類瀏覽需要登入。");
      return [];
    }
    return this.parseHtmlBookLinks(html);
  },

  browseHtmlArticle: function(fullFlag, page) {
    var url = this.htmlBaseUrl + "/modules/article/articlelist.php?fullflag=" +
      this.urlEncode(fullFlag) + "&page=" + (page || 1) + "&charset=gbk";
    var html = this.htmlGet(url);
    if (this.isLoginHtml(html)) {
      this.requestLogin("作品列表需要登入。");
      return [];
    }
    return this.parseHtmlBookLinks(html);
  },

  fallbackTagOptions: function() {
    var tags = [
      ["奇幻", "魔法"], ["奇幻", "異世界"], ["奇幻", "轉生"], ["奇幻", "冒險"],
      ["校園", "校園"], ["校園", "青春"], ["校園", "戀愛"], ["校園", "日常"],
      ["屬性", "戰鬥"], ["屬性", "後宮"], ["屬性", "喜劇"], ["屬性", "科幻"],
      ["狀態", "完結"], ["狀態", "動畫化"]
    ];
    return tags.map(function(item) {
      return { id: "tag:" + item[1] + ":0", title: item[1], group: item[0] };
    });
  },

  tagBrowseOptions: function() {
    var html = this.htmlGet(this.htmlBaseUrl + "/modules/article/tags.php?charset=gbk");
    if (!html || this.isLoginHtml(html)) return this.fallbackTagOptions();
    var options = [], currentGroup = "Tags";
    var ulPattern = /<ul[^>]+class=["'][^"']*ultops[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
    var ulMatch, liPattern, liMatch, aPattern, aMatch;
    while ((ulMatch = ulPattern.exec(html)) !== null) {
      liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      while ((liMatch = liPattern.exec(ulMatch[1])) !== null) {
        var raw = this.cleanText(liMatch[1]);
        if (/Tags：?$/.test(raw)) {
          currentGroup = raw.replace(/Tags：?$/, "").replace(/系|属性|類|类/g, "") || "Tags";
          continue;
        }
        aPattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
        while ((aMatch = aPattern.exec(liMatch[1])) !== null) {
          var tag = this.cleanText(aMatch[1]);
          if (tag) options.push({ id: "tag:" + tag + ":0", title: tag, group: currentGroup });
        }
      }
    }
    return options.length ? options : this.fallbackTagOptions();
  },

  parseHtmlBookLinks: function(html) {
    var rows = [], seen = {}, text = String(html || ""), patterns = [
      /<a[^>]+href=["']([^"']*(?:\/|\b)book\/(\d+)\.htm[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]+href=["']([^"']*articleinfo\.php\?[^"']*\bid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    ];
    for (var p = 0; p < patterns.length; p++) {
      var pattern = patterns[p], match;
      while ((match = pattern.exec(text)) !== null) {
        var aid = match[2];
        if (!aid || seen[aid]) continue;
        var title = this.cleanText(match[3]);
        if (!title || title === "小說目錄" || title === "小说目录") continue;
        var block = text.substring(Math.max(0, match.index - 900), Math.min(text.length, pattern.lastIndex + 900));
        rows.push({
          sourceId: this.id,
          title: title,
          url: this.htmlBaseUrl + "/book/" + aid + ".htm",
          author: this.cleanText(this.firstText(block, /(?:小說作者|小说作者|作者)：?\s*([^<\n]+)/i) || ""),
          description: "",
          coverImage: this.coverUrl(aid)
        });
        seen[aid] = true;
      }
    }
    return rows;
  },

  htmlGet: function(url) {
    var headers = {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 15; Pixel 7 Pro Build/AQ3A.240905.004)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"
    };
    var html = bridge.httpGetWithHeaders ? bridge.httpGetWithHeaders(url, headers) : bridge.httpGet(url);
    if (html && !this.isCloudflareHtml(html)) return html;
    if (bridge.webViewGetWithHeaders) {
      return bridge.webViewGetWithHeaders(url, headers) || html || "";
    }
    return html || "";
  },

  gbkEncode: function(value) {
    return bridge.encodeGbkURIComponent
      ? bridge.encodeGbkURIComponent(String(value || ""))
      : encodeURIComponent(String(value || ""));
  },

  firstText: function(html, pattern) {
    var match = pattern.exec(String(html || ""));
    return match ? this.cleanText(match[1]) : "";
  },

  isLoginHtml: function(html) {
    return /<title[^>]*>[\s\S]{0,120}(?:登录|登入|登錄|login)[\s\S]{0,120}<\/title>/i.test(String(html || "")) ||
      /(?:请先|請先|您尚未)(?:登录|登入|登錄)|login\s+required/i.test(String(html || ""));
  },

  isCloudflareHtml: function(html) {
    return /challenge-form|cf_chl_|Just a moment|Checking your browser|Enable JavaScript and cookies|Attention Required|Sorry, you have been blocked/i.test(String(html || ""));
  },

  favorite: function(book) {
    var aid = this.aidFromText(book && book.url);
    if (!aid) return false;
    var response = this.relay("action=bookcase&do=add&aid=" + aid);
    if (this.handleAuth(response, "收藏書籍需要登入，登入可能已失效。")) return false;
    var status = this.statusCode(response);
    return status === 1 || status === 5;
  },

  chapters: function(book) {
    var aid = this.aidFromText(book && book.url);
    if (!aid) return [];
    var response = this.relay("action=book&do=list&aid=" + aid + "&t=" + this.languageFlag());
    if (this.handleAuth(response, "章節列表需要登入。")) return [];
    return this.parseChapters(response, aid, book.url);
  },

  chapterText: function(chapter) {
    var aid = this.aidFromText(chapter && chapter.bookUrl) || this.aidFromText(chapter && chapter.url);
    var cid = this.cidFromText(chapter && chapter.url);
    if (!aid || !cid) return "[無法載入章節內容]";
    var response = this.relay("action=book&do=text&aid=" + aid + "&cid=" + cid +
      "&t=" + this.languageFlag());
    if (this.handleAuth(response, "章節內容載入失敗，登入可能已失效。")) {
      return "[無法載入章節內容，請重新登入或稍後再試]";
    }
    if (this.statusCode(response) === 0 || response === "") {
      return "[無法載入章節內容，來源暫時無法解析，請稍後再試]";
    }
    return this.textWithImages(response);
  },

  list: function(sort, page, articleList) {
    // articlelist is the stable paged endpoint for rankings and the all/full
    // work lists.  The newer mewx_articlelist response is intentionally not
    // used here because v1.29 only calls it for a fixed goodnum view.
    var response = this.relay("action=articlelist&sort=" + this.urlEncode(sort) +
      "&page=" + (page || 1));
    if (this.handleAuth(response, "列表需要登入。")) return [];
    return this.parseResultBooks(response);
  },

  bookFromAid: function(aid) {
    var info = this.bookInfo(aid);
    if (!info) return null;
    var intro = this.relay("action=book&do=intro&aid=" + aid + "&t=" + this.languageFlag());
    if (!this.handleAuth(intro, "書籍介紹需要登入。") && intro && !/^\d+$/.test(String(intro).trim())) {
      info.description = String(intro).trim();
    }
    return this.toBook(aid, info);
  },

  bookInfo: function(aid) {
    var cacheKey = this.languageFlag() + ":" + String(aid);
    var cached = this._bookInfoCache[cacheKey];
    if (cached) return cached;
    var response = this.relay("action=book&do=bookinfo&aid=" + aid + "&t=" + this.languageFlag());
    if (this.handleAuth(response, "書籍資訊需要登入。")) return null;
    var info = this.parseBookInfo(response, aid);
    if (info && (info.title || info.author)) this._bookInfoCache[cacheKey] = info;
    return info;
  },

  parseResultBooks: function(xml) {
    var rows = [];
    var seen = {};
    var aids = [];
    var text = String(xml || "");
    var tagPattern = /<item\b([^>]*)>/gi;
    var match;
    while ((match = tagPattern.exec(text)) !== null) {
      var attrs = match[1] || "";
      var aid = this.attr(attrs, "aid");
      if (!aid || seen[aid]) continue;
      var body = "";
      if (!/\/\s*$/.test(attrs)) {
        var close = text.indexOf("</item", tagPattern.lastIndex);
        if (close >= 0) body = text.substring(tagPattern.lastIndex, close);
      }
      var info = this.parseBookInfo(body, aid);
      if (info.title || info.author) rows.push(this.toBook(aid, info));
      else aids.push(aid);
      seen[aid] = true;
    }
    var infos = this.bookInfoBatch(aids);
    for (var i = 0; i < aids.length; i++) rows.push(this.toBook(aids[i], infos[aids[i]] || {}));
    return rows;
  },

  parseBookcase: function(xml) {
    var rows = [];
    var seen = {};
    var aids = [];
    var match;
    var pattern = /<book\b[^>]*\baid\s*=\s*["'](\d+)["'][^>]*\/?\s*>/gi;
    while ((match = pattern.exec(String(xml || ""))) !== null) {
      var aid = match[1];
      if (seen[aid]) continue;
      seen[aid] = true;
      aids.push(aid);
    }
    var infos = this.bookInfoBatch(aids);
    for (var i = 0; i < aids.length; i++) {
      rows.push(this.toBook(aids[i], infos[aids[i]] || {}));
    }
    return rows;
  },

  bookInfoBatch: function(aids) {
    var infos = {}, unique = [], seen = {};
    for (var i = 0; i < (aids || []).length; i++) {
      var aid = String(aids[i] || "");
      if (aid && !seen[aid]) { seen[aid] = true; unique.push(aid); }
    }
    var missing = [];
    for (var j = 0; j < unique.length; j++) {
      var key = this.languageFlag() + ":" + unique[j];
      if (this._bookInfoCache[key]) infos[unique[j]] = this._bookInfoCache[key];
      else missing.push(unique[j]);
    }
    if (!missing.length) return infos;
    var responses = this.relayBatch(missing.map(function(aid) {
      return "action=book&do=bookinfo&aid=" + aid + "&t=" + this.languageFlag();
    }, this));
    if (!responses) {
      for (var k = 0; k < missing.length; k++) {
        var fallback = this.bookInfo(missing[k]);
        if (fallback) infos[missing[k]] = fallback;
      }
      return infos;
    }
    for (var n = 0; n < missing.length; n++) {
      var response = responses[n] || "";
      if (this.handleAuth(response, "收藏庫需要登入，登入可能已失效。")) continue;
      var info = this.parseBookInfo(response, missing[n]);
      if (info && (info.title || info.author)) {
        this._bookInfoCache[this.languageFlag() + ":" + missing[n]] = info;
        infos[missing[n]] = info;
      }
    }
    return infos;
  },

  parseBookInfo: function(xml, aid) {
    var text = String(xml || "");
    var result = { title: "", author: "", description: "", status: "", lastUpdate: "" };
    var data = this.dataValues(text);
    result.title = data.Title || data.title || "";
    result.author = data.Author || data.author || "";
    result.description = data.IntroPreview || data.Intro || data.intro || "";
    result.status = data.BookStatus || "";
    result.lastUpdate = data.LastUpdate || "";
    result.latestSection = data.LatestSection || "";
    result.bookStatus = result.status;
    // A list item may use attributes instead of nested data elements.
    if (!result.title) result.title = this.attr(text, "title") || this.attr(text, "name");
    if (!result.author) result.author = this.attr(text, "author");
    return result;
  },

  dataValues: function(xml) {
    var values = {};
    var pattern = /<data\b([^>]*)\/\s*>|<data\b([^>]*)>([\s\S]*?)<\/data\s*>/gi;
    var match;
    while ((match = pattern.exec(String(xml || ""))) !== null) {
      var attrs = match[1] || match[2] || "";
      var name = this.attr(attrs, "name");
      if (!name) continue;
      var value = match[3] !== undefined && this.cleanText(match[3])
        ? match[3]
        : this.attr(attrs, "value");
      values[name] = this.cleanText(value || "");
    }
    return values;
  },

  parseChapters: function(xml, aid, bookUrl) {
    var chapters = [];
    var volumePattern = /<volume\b([^>]*)>([\s\S]*?)<\/volume\s*>/gi;
    var volumeMatch;
    while ((volumeMatch = volumePattern.exec(String(xml || ""))) !== null) {
      var volumeBody = volumeMatch[2] || "";
      var firstChapter = volumeBody.search(/<chapter\b/i);
      var volumeText = firstChapter >= 0 ? volumeBody.substring(0, firstChapter) : volumeBody;
      volumeText = volumeText.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
      var volumeTitle = this.attr(volumeMatch[1], "name") || this.attr(volumeMatch[1], "title") || this.cleanText(volumeText);
      var chapterPattern = /<chapter\b([^>]*)\bcid\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/chapter\s*>|<chapter\b([^>]*)\bcid\s*=\s*["'](\d+)["'][^>]*\/>/gi;
      var chapterMatch;
      while ((chapterMatch = chapterPattern.exec(volumeMatch[2])) !== null) {
        var attrs = chapterMatch[1] || chapterMatch[4] || "";
        var cid = chapterMatch[2] || chapterMatch[5];
        var title = this.cleanText(chapterMatch[3] || this.attr(attrs, "name") || this.attr(attrs, "title") || "第" + (chapters.length + 1) + "章");
        if (volumeTitle) title = volumeTitle + " / " + title;
        chapters.push({
          sourceId: this.id,
          bookUrl: bookUrl,
          title: title,
          url: this.chapterUrl(aid, cid),
          index: chapters.length
        });
      }
    }
    // Be liberal with malformed responses that omit volume wrappers.
    if (!chapters.length) {
      var loose = /<chapter\b([^>]*)\bcid\s*=\s*["'](\d+)["'][^>]*>([\s\S]*?)<\/chapter\s*>/gi;
      var looseMatch;
      while ((looseMatch = loose.exec(String(xml || ""))) !== null) {
        chapters.push({ sourceId: this.id, bookUrl: bookUrl,
          title: this.cleanText(looseMatch[3]), url: this.chapterUrl(aid, looseMatch[2]), index: chapters.length });
      }
    }
    return chapters;
  },

  toBook: function(aid, info) {
    info = info || {};
    return {
      sourceId: this.id,
      title: info.title || "Wenku8 #" + aid,
      url: "https://wenku8-relay.mewx.org/book/" + aid,
      author: info.author || "",
      description: info.description || "",
      coverImage: this.coverUrl(aid)
    };
  },

  relay: function(inner) {
    var response = this.relayRaw(inner);
    if (this.statusCode(response) === 4 && !this._loginInProgress) {
      var username = this.credential("getCredentialUsername");
      var password = this.credential("getCredentialPassword");
      if (username && password) {
        this._loginInProgress = true;
        var loginResponse = this.relayRaw("action=login&username=" + this.urlEncode(username) + "&password=" + this.urlEncode(password));
        if (this.statusCode(loginResponse) !== 1) {
          loginResponse = this.relayRaw("action=loginemail&username=" + this.urlEncode(username) + "&password=" + this.urlEncode(password));
        }
        this._loginInProgress = false;
        if (this.statusCode(loginResponse) === 1) response = this.relayRaw(inner);
      }
    }
    return response;
  },

  relayRaw: function(inner) {
    var body = "&appver=" + this.appver() + "&request=" + this.base64Utf8(inner) +
      "&timetoken=" + String(new Date().getTime());
    var headers = { "Accept-Encoding": "gzip", "Accept": "*/*" };
    return bridge.httpPost(this.baseUrl, body, headers) || "";
  },

  relayBatch: function(inners) {
    if (!bridge.httpPostBatch || !inners || !inners.length) return null;
    var urls = [], bodies = [], headers = { "Accept-Encoding": "gzip", "Accept": "*/*" };
    for (var i = 0; i < inners.length; i++) {
      urls.push(this.baseUrl);
      bodies.push("&appver=" + this.appver() + "&request=" + this.base64Utf8(inners[i]) +
        "&timetoken=" + String(new Date().getTime() + i));
    }
    try {
      var raw = bridge.httpPostBatch(urls, bodies, headers);
      var parsed = JSON.parse(raw || "[]");
      return parsed instanceof Array ? parsed : null;
    } catch (error) {
      return null;
    }
  },

  appver: function() {
    var minute = Math.floor(new Date().getTime() / 60000);
    if (this._appverCache && this._appverMinute === minute) return this._appverCache;
    var payload = "1.29|digital-bento|" + minute;
    var digest = this.hmacSha256Hex("digital-bento", payload);
    this._appverMinute = minute;
    this._appverCache = "1.29-digital-bento-" + digest.substring(12, 20);
    return this._appverCache;
  },

  statusCode: function(response) {
    var value = String(response || "").trim();
    return /^\d+$/.test(value) ? parseInt(value, 10) : -1;
  },

  handleAuth: function(response, reason) {
    if (this.statusCode(response) !== 4) return false;
    var now = new Date().getTime();
    if (now - this._lastLoginRequestAt > 10000) {
      this._lastLoginRequestAt = now;
      this.requestLogin(reason);
    }
    return true;
  },

  requestLogin: function(reason) {
    try {
      if (typeof bridge !== "undefined" && bridge && typeof bridge.requestLogin === "function") {
        var arity = Number(bridge.requestLogin.length);
        if (isFinite(arity) && arity <= 1) bridge.requestLogin(reason);
        else bridge.requestLogin(this.id, reason);
        return true;
      }
    } catch (ignored) {}
    return false;
  },

  languageFlag: function() { return this._language === 0 ? 0 : 1; },
  setLanguage: function(language) { this._language = Number(language) === 0 ? 0 : 1; },
  urlEncode: function(value) {
    return encodeURIComponent(String(value || ""))
      .replace(/[!'()]/g, function(ch) { return "%" + ch.charCodeAt(0).toString(16).toUpperCase(); })
      .replace(/%20/g, "+")
      .replace(/~/g, "%7E");
  },
  aidFromText: function(value) {
    var match = /(?:book\/|aid=|id=)(\d+)/i.exec(String(value || "")) || /^(\d+)$/.exec(String(value || "").trim());
    return match ? match[1] : "";
  },
  cidFromText: function(value) {
    var match = /(?:cid=|chapter\/)(\d+)/i.exec(String(value || ""));
    return match ? match[1] : "";
  },
  chapterUrl: function(aid, cid) { return "https://wenku8-relay.mewx.org/book/" + aid + "/chapter/" + cid; },
  coverUrl: function(aid) {
    var id = parseInt(aid, 10) || 0;
    return "https://img.wenku8.com/image/" + Math.floor(id / 1000) + "/" + aid + "/" + aid + "s.jpg";
  },
  attr: function(text, name) {
    var match = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']", "i").exec(String(text || ""));
    return match ? this.decode(match[1]) : "";
  },
  cleanText: function(value) { return this.decode(String(value || "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); },
  decode: function(value) {
    return String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function(_, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(parseInt(n, 10)); });
  },
  textWithImages: function(value) {
    var text = String(value || "").replace(/\r\n/g, "\n");
    return text.replace(/<!--image-->([\s\S]*?)<!--image-->/gi, function(_, url) {
      var raw = String(url || "");
      var htmlImage = /(?:src|data-src)\s*=\s*["']([^"']+)["']/i.exec(raw);
      var normalized = (htmlImage ? htmlImage[1] : raw)
        .replace(/<[^>]+>/g, "")
        .replace(/[\r\n]+/g, "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\\\//g, "/")
        .trim();
      if (/^\/\//.test(normalized)) normalized = "https:" + normalized;
      if (/^\//.test(normalized)) normalized = "https://img.wenku8.com" + normalized;
      return normalized ? "\n![Image](" + normalized + ")\n" : "\n";
    }).replace(/\n{3,}/g, "\n\n").trim();
  },

  // Synchronous SHA-256/HMAC implementation keeps the plugin compatible with
  // the host's synchronous bridge (WebCrypto is promise-based).
  hmacSha256Hex: function(key, message) {
    var block = 64, keyBytes = this.utf8Bytes(key), msg = this.utf8Bytes(message), i;
    if (keyBytes.length > block) keyBytes = this.sha256Bytes(keyBytes);
    while (keyBytes.length < block) keyBytes.push(0);
    var inner = [], outer = [];
    for (i = 0; i < block; i++) { inner.push(keyBytes[i] ^ 0x36); outer.push(keyBytes[i] ^ 0x5c); }
    return this.hex(this.sha256Bytes(outer.concat(this.sha256Bytes(inner.concat(msg)))));
  },
  utf8Bytes: function(value) {
    var encoded = unescape(encodeURIComponent(String(value || ""))), bytes = [], i;
    for (i = 0; i < encoded.length; i++) bytes.push(encoded.charCodeAt(i));
    return bytes;
  },
  base64Utf8: function(value) {
    var bytes = this.utf8Bytes(value), alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out = "", i;
    for (i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      var d = i + 2 < bytes.length ? bytes[i + 2] : 0;
      var n = (a << 16) | (b << 8) | d;
      out += alphabet.charAt((n >>> 18) & 63) + alphabet.charAt((n >>> 12) & 63);
      out += i + 1 < bytes.length ? alphabet.charAt((n >>> 6) & 63) : "=";
      out += i + 2 < bytes.length ? alphabet.charAt(n & 63) : "=";
    }
    return out;
  },
  hex: function(bytes) {
    var out = "", i;
    for (i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return out;
  },
  sha256Bytes: function(input) {
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2], H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], words, w, a,b,c,d,e,f,g,h,t1,t2,i,j;
    var bytes = input.slice(0), bitLen = bytes.length * 8;
    bytes.push(0x80); while ((bytes.length % 64) !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / Math.pow(2, i * 8)) & 255);
    for (i = 0; i < bytes.length; i += 64) {
      w = [];
      for (j = 0; j < 16; j++) { var p = i + j * 4; w[j] = ((bytes[p] << 24) | (bytes[p+1] << 16) | (bytes[p+2] << 8) | bytes[p+3]) | 0; }
      for (j = 16; j < 64; j++) {
        var s0 = this.rotr(w[j-15],7) ^ this.rotr(w[j-15],18) ^ (w[j-15] >>> 3);
        var s1 = this.rotr(w[j-2],17) ^ this.rotr(w[j-2],19) ^ (w[j-2] >>> 10);
        w[j] = (w[j-16] + s0 + w[j-7] + s1) | 0;
      }
      a=H[0]; b=H[1]; c=H[2]; d=H[3]; e=H[4]; f=H[5]; g=H[6]; h=H[7];
      for (j = 0; j < 64; j++) {
        var S1 = this.rotr(e,6) ^ this.rotr(e,11) ^ this.rotr(e,25);
        var ch = (e & f) ^ (~e & g);
        t1 = (h + S1 + ch + K[j] + w[j]) | 0;
        var S0 = this.rotr(a,2) ^ this.rotr(a,13) ^ this.rotr(a,22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        t2 = (S0 + maj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    var out=[];
    for (i=0;i<H.length;i++) { out.push((H[i]>>>24)&255,(H[i]>>>16)&255,(H[i]>>>8)&255,H[i]&255); }
    return out;
  },
  rotr: function(value, bits) { return (value >>> bits) | (value << (32 - bits)); }
};

// Legacy Shinsou plugin compatibility.  ShuYue keeps the small
// search/latest/browse/chapters/chapterText API above, while older Shinsou
// hosts discover the historical get* methods below.  The adapter is kept in
// this package (rather than only in a host shim) so the same script can be
// inspected and executed by either runtime.
(function installLegacyShinsouContract(target) {
  function pageNumber(value) {
    var number = Number(value);
    return isFinite(number) ? Math.max(1, Math.floor(number) + 1) : 1;
  }

  function legacyBook(value) {
    if (!value || typeof value !== "object") return null;
    var url = String(value.url || "");
    if (!url) return null;
    var title = String(value.title || value.name || url);
    var status = typeof value.status === "number" && isFinite(value.status) ? value.status : 0;
    return {
      url: url,
      title: title,
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
      var values = filter.values;
      if (Array.isArray(values)) {
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

  target.getFavoriteManga = function(page) {
    return legacyPage(target.browse("bookcase", pageNumber(page)), false);
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

  // Legacy Shinsou is image-oriented and has no text-page type.  Keep the
  // chapter text in an extra field for hosts that understand it, while still
  // returning the historical Page-shaped array to older hosts.
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
    target._bookInfoCache = {};
    target._loginInProgress = false;
  };
})(source);
