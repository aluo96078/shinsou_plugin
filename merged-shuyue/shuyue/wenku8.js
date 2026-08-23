var source = {
  id: "zh.wenku8",
  name: "輕小說文庫（停止維護）",
  lang: "zh",
  baseUrl: "https://www.wenku8.net",
  supportsLogin: true,
  supportsLatest: true,
  supportsFavorites: true,
  // Login prompts are emitted by the plugin so the host can show its native
  // dialog. Keep a short source-level cooldown because one screen can load
  // tags, latest books and the bookcase in quick succession.
  _lastLoginRequestAt: 0,
  headers: {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "Referer": "https://www.wenku8.net/login.php"
  },

  // ShuYue passes (sourceId, message) to bridge.log, while older Shinsou
  // hosts expose a one-argument bridge.log(message). Keep diagnostics useful
  // on both hosts without requiring a new bridge API.
  log: function(message) {
    try {
      if (typeof bridge === "undefined" || !bridge || typeof bridge.log !== "function") return;
      var text = String(message == null ? "" : message);
      var arity = Number(bridge.log.length);
      if (isFinite(arity) && arity <= 1) bridge.log(text);
      else bridge.log(this.id, text);
    } catch (ignored) {}
  },

  login: function(username, password) {
    var body = [
      "username=" + encodeURIComponent(username),
      "password=" + encodeURIComponent(password),
      "checkcode=",
      "usecookie=315360000",
      "action=login"
    ].join("&");
    var headers = this.dalvikHeaders(this.baseUrl + "/login.php");
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    // The login form posts to login.php?do=submit. Posting to the plain
    // login page only renders the form again and never creates a session,
    // which made valid Android credentials look like an authentication
    // failure.
    var html = bridge.httpPost(this.baseUrl + "/login.php?do=submit", body, headers);
    this.log("Login POST returned " + (html ? html.length + " chars" : "null"));
    var response = String(html || "");
    var success = /登录成功|登入成功|登錄成功|logout(?:\.php)?|退出(?:登录|登入|登錄)/i.test(response);
    if (!success && !this.isBlocked(html) && !this.isLoginRequired(html)) {
      success = this.verifyLogin();
    }
    if (!success) {
      this.log("Login response did not prove an authenticated session.");
    } else {
      // A successful login invalidates a previous prompt cooldown. If the
      // next request really receives a login page, it must be allowed to ask
      // for credentials again.
      this._lastLoginRequestAt = 0;
    }
    return success;
  },

  search: function(query, page) {
    var keyword = String(query || "").trim();
    if (!keyword) return [];

    var aid = this.aidFromText(keyword);
    if (aid) {
      var direct = this.bookFromAid(aid);
      return direct ? [direct] : [];
    }

    var encoded = this.gbkEncode(keyword);
    var url = this.baseUrl + "/modules/article/search.php?searchtype=articlename&searchkey=" + encoded + "&page=" + (page || 1) + "&charset=gbk";
    // Search is normally an HTML endpoint, but it can also be challenged by
    // the same edge rule as the ranking pages. Start with native HTTP and let
    // cloudflarePage() fall back only for that actual endpoint response.
    var html = this.cloudflarePage(url, this.baseUrl + "/");
    if (this.isBlocked(html)) {
      this.log("Search blocked. HTML preview: " + (html || "").substring(0, 200));
      return [];
    }
    if (this.isLoginRequired(html)) {
      this.requestLogin("搜尋需要登入");
      this.log("Wenku8 search requires login. Please sign in via source settings.");
      return [];
    }
    var results = this.parseBookLinks(html);
    this.log("Search parsed " + results.length + " books from " + (html ? html.length : 0) + " chars");
    return results;
  },

  latest: function(page) {
    var currentPage = page || 1;
    // 空結果可能是 Cloudflare、網路錯誤或解析器失效，browse() 只會在
    // 明確收到登入頁時要求登入，不能把所有空結果都當成登入失效。
    return this.browse("rank:lastupdate", currentPage);
  },

  browseOptions: function() {
    var options = [
      { id: "rank:lastupdate", title: "最近更新", group: "總榜" },
      { id: "rank:allvisit", title: "總點擊榜", group: "總榜" },
      { id: "rank:monthvisit", title: "月點擊榜", group: "總榜" },
      { id: "rank:weekvisit", title: "週點擊榜", group: "總榜" },
      { id: "rank:dayvisit", title: "日點擊榜", group: "總榜" },
      { id: "rank:postdate", title: "最新入庫", group: "總榜" },
      { id: "rank:goodnum", title: "總收藏榜", group: "總榜" },
      { id: "rank:size", title: "字數排行", group: "總榜" },
      { id: "article:0", title: "全部作品", group: "書庫" },
      { id: "article:1", title: "完結作品", group: "書庫" },
      { id: "bookcase", title: "我的書架", group: "個人" }
    ];
    // This hook runs while the source catalogue is being opened. Never perform network I/O here:
    // the legacy implementation fetched the Cloudflare-sensitive tags page synchronously and
    // could hold the first frame for the full native timeout. The stable taxonomy is enough for
    // the picker; the selected tag is fetched only after the user explicitly opens it.
    return options.concat(this.fallbackTagOptions());
  },

  browse: function(optionId, page) {
    var id = String(optionId || "");
    var url = "";
    if (id === "bookcase") {
      // 書架為完整清單（非分頁），第 2 頁起回傳空陣列，避免「載入更多」重複循環。
      if ((page || 1) > 1) return [];
      return this.parseBookcase();
    } else if (id.indexOf("rank:") === 0) {
      url = this.baseUrl + "/modules/article/toplist.php?sort=" + encodeURIComponent(id.substring(5)) + "&page=" + (page || 1) + "&charset=gbk";
    } else if (id.indexOf("article:") === 0) {
      url = this.baseUrl + "/modules/article/articlelist.php?fullflag=" + encodeURIComponent(id.substring(8)) + "&page=" + (page || 1) + "&charset=gbk";
    } else if (id.indexOf("tag:") === 0) {
      var tagParts = id.substring(4).split(":");
      var view = tagParts.length > 1 ? tagParts.pop() : "0";
      var tag = tagParts.join(":");
      url = this.baseUrl + "/modules/article/tags.php?t=" + this.gbkEncode(tag) + "&v=" + encodeURIComponent(view || "0") + "&page=" + (page || 1) + "&charset=gbk";
    } else {
      return [];
    }

    // Listing endpoints are the pages Wenku8 most often places behind CF.
    // cloudflarePage() still starts with native HTTP, so ordinary responses
    // do not pay the WebView cost.
    var html = this.cloudflarePage(url, this.baseUrl + "/");
    if (this.isBlocked(html)) {
      this.log("Wenku8 browse was blocked by Cloudflare.");
      return [];
    }
    if (this.isLoginRequired(html)) {
      var reason = id === "bookcase"
        ? "收藏庫需要登入"
        : id.indexOf("rank:") === 0
          ? "最新列表需要登入"
          : "分類瀏覽需要登入";
      this.requestLogin(reason);
      this.log("Wenku8 browse requires login. Please sign in via source settings.");
      return [];
    }
    var results = this.parseBookLinks(html);
    if (!results.length) {
      this.log("Wenku8 browse parsed zero books; keeping the result as a parse/network failure, not a login failure.");
    }
    return results;
  },

  favorite: function(book) {
    var aid = this.aidFromText(book.url);
    if (!aid) return false;
    // The add-to-bookshelf action can be protected by CF. Try the normal
    // request first and only use the browser session when the response is
    // explicitly a CF challenge.
    var html = this.cloudflarePage(
      this.baseUrl + "/modules/article/addbookcase.php?bid=" + aid + "&charset=gbk",
      this.baseUrl + "/book/" + aid + ".htm"
    );
    if (this.isLoginRequired(html)) {
      this.requestLogin("收藏書籍需要登入，登入可能已失效。");
      return false;
    }
    if (this.isBlocked(html)) {
      this.log("Wenku8 favorite request was blocked or empty; keeping it as a source failure.");
      return false;
    }
    var success = /处理成功|處理成功|加入(?:了)?(?:书架|書架)|已经在您的书架|已經在您的書架|收藏成功/i.test(html || "");
    if (!html) this.log("Wenku8 favorite returned an empty response; not treating it as a login failure.");
    return success;
  },

  parseChaptersHtml: function(html, aid, bookUrl) {
    var chapters = [];
    var volumeTitle = "";
    var pattern = /<td[^>]*class=["']vcss["'][^>]*>([\s\S]*?)<\/td>|<td[^>]*class=["']ccss["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/td>/gi;
    var match;
    while ((match = pattern.exec(html || "")) !== null) {
      if (match[1]) {
        volumeTitle = this.cleanText(match[1]);
        continue;
      }
      if (!match[2]) continue;
      var href = this.absoluteUrl(match[2]);
      var chapterAid = this.queryValue(href, "aid") || aid;
      var cid = this.queryValue(href, "cid") || this.cidFromText(href);
      if (!cid) continue;
      var title = this.cleanText(match[3]);
      chapters.push({
        sourceId: this.id,
        bookUrl: bookUrl,
        title: volumeTitle ? volumeTitle + " / " + title : title,
        url: this.chapterContentUrl(chapterAid, cid),
        index: chapters.length
      });
    }
    return chapters;
  },

  // Native HTTP is the default for every normal Wenku8 page. A page that
  // explicitly returns a Cloudflare challenge may still be retried in the
  // browser; a normal response never pays the WebView cost.
  nativePage: function(url, referer) {
    return this.requestPage(url, referer, false);
  },

  // This is the only browser-backed read path. It is intentionally opt-in and
  // is used only by endpoints known to be CF-sensitive. It starts with native
  // HTTP; a challenge or a platform-reported empty response then opts into the
  // browser session.
  cloudflarePage: function(url, referer) {
    return this.requestPage(url, referer, true);
  },

  requestPage: function(url, referer, allowEmptyFallback) {
    var headers = this.dalvikHeaders(referer);
    var html = this.httpOnly(url, headers);
    // Some platform HTTP bridges expose a 403/challenge as null instead of
    // returning its HTML body. Only the explicitly CF-sensitive endpoints
    // pass allowEmptyFallback=true; a normal page keeps the empty result as a
    // network failure rather than invoking a browser for every error.
    if (html && !this.isCloudflareResponse(html)) return html;
    if (!html && !allowEmptyFallback) return html;

    if (!bridge.webViewGetWithHeaders) {
      this.log("Cloudflare response needs browser clearance, but no WebView bridge is available.");
      return html;
    }

    var browserHtml = bridge.webViewGetWithHeaders(url, this.mergeHeaders(headers));
    this.log("Cloudflare fallback returned " + (browserHtml ? browserHtml.length + " chars" : "null") + " for " + url.substring(0, 80));
    // Keep the original challenge page when the browser fallback fails so the
    // caller can report a source failure instead of parsing an empty value.
    return browserHtml || html;
  },

  chapters: function(book) {
    var aid = this.aidFromText(book.url);
    if (!aid) return [];
    var readerUrl = this.baseUrl + "/modules/article/reader.php?aid=" + aid + "&charset=gbk";
    var html = this.nativePage(readerUrl, this.baseUrl + "/book/" + aid + ".htm");
    if (this.isLoginRequired(html)) {
      this.requestLogin("章節列表需要登入。");
      return [];
    }
    if (this.isBlocked(html)) {
      this.log("Wenku8 chapter list was blocked or empty; keeping it as a source failure.");
      return [];
    }
    return this.parseChaptersHtml(html, aid, book.url);
  },

  chapterText: function(chapter) {
    var html = this.nativePage(chapter.url, chapter.bookUrl || this.baseUrl);
    if (this.isLoginRequired(html)) {
      this.requestLogin("章節內容載入失敗，登入可能已失效，請重新登入。");
      return "[無法載入章節內容，請嘗試重新登入或稍後再試]";
    }
    if (this.isBlocked(html)) {
      this.log("Wenku8 chapter content was blocked or empty; keeping it as a source failure.");
      return "[無法載入章節內容，來源暫時無法解析，請稍後再試]";
    }
    var content = this.extractContent(html);
    return this.htmlToText(content);
  },

  bookFromAid: function(aid) {
    var url = this.baseUrl + "/modules/article/articleinfo.php?id=" + aid + "&charset=gbk";
    var html = this.nativePage(url, this.baseUrl + "/");
    if (this.isLoginRequired(html)) {
      this.requestLogin("書籍資訊需要登入。");
      return null;
    }
    if (!html || this.isBlocked(html)) return null;
    var titleTag = this.firstText(html, /<title>([\s\S]*?)<\/title>/i);
    var title = (titleTag ? titleTag.split(" - ")[0] : "")
      || this.firstText(html, /<td[^>]*width=["']90%["'][\s\S]*?<b>([\s\S]*?)<\/b>/i)
      || "Wenku8 #" + aid;
    var author = this.firstText(html, /小说作者：\s*([^<\n]+)/i);
    var description = this.firstText(html, /内容简介：[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    var cover = this.firstAttr(html, /<img[^>]+src=["']([^"']*\/image\/[^"']+)["'][^>]*>/i)
      || this.firstAttr(html, /<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    return {
      sourceId: this.id,
      title: this.cleanText(title),
      url: this.baseUrl + "/book/" + aid + ".htm",
      author: this.cleanText(author || ""),
      description: this.cleanText(description || ""),
      coverImage: cover ? this.absoluteUrl(cover) : this.coverUrl(aid)
    };
  },

  verifyLogin: function() {
    var html = this.cloudflarePage(
      this.baseUrl + "/modules/article/bookcase.php#charset=gbk",
      this.baseUrl + "/"
    );
    if (!html || this.isBlocked(html) || this.isLoginRequired(html)) return false;
    return /logout(?:\.php)?|退出(?:登录|登入|登錄)|<select[^>]+name=["']?classlist|readbookcase\.php|我的书架|我的書架/i.test(html);
  },

  parseBookLinks: function(html) {
    var results = [];
    var seen = {};
    var patterns = [
      /<a[^>]+href=["']([^"']*(?:\/|\b)book\/(\d+)\.htm[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]+href=["']([^"']*(?:\/|\b)articleinfo\.php\?[^"']*\bid=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    ];
    for (var i = 0; i < patterns.length; i++) {
      var pattern = patterns[i];
      var match;
      while ((match = pattern.exec(html || "")) !== null) {
        this.pushBookLink(results, seen, html || "", match, pattern.lastIndex);
      }
    }
    return results;
  },

  pushBookLink: function(results, seen, html, match, lastIndex) {
    var aid = match[2];
    if (!aid || seen[aid]) return;
    var block = html.substring(Math.max(0, match.index - 900), Math.min(html.length, lastIndex + 900));
    var title = this.attr(match[0], "title")
      || this.attr(match[0], "data-title")
      || this.attr(match[3], "title")
      || this.attr(match[3], "alt")
      || this.cleanText(match[3]);
    if (!title || title === "小说目录" || title === "小說目錄") return;
    var aidImgRe = new RegExp('<img[^>]+src=["\']([^"\']*/' + aid + '/[^"\']+)["\'][^>]*>', 'i');
    var cover = this.firstAttr(block, aidImgRe);
    results.push({
      sourceId: this.id,
      title: title,
      url: this.baseUrl + "/book/" + aid + ".htm",
      author: this.cleanText(this.firstText(block, /小说作者：\s*([^<\n]+)/i) || this.firstText(block, /作者：\s*([^<\n]+)/i) || ""),
      description: "",
      coverImage: cover ? this.absoluteUrl(cover) : this.coverUrl(aid)
    });
    seen[aid] = true;
  },

  tagBrowseOptions: function() {
    var html = this.nativePage(this.baseUrl + "/modules/article/tags.php?charset=gbk", this.baseUrl + "/");
    if (this.isBlocked(html)) {
      this.log("Wenku8 tags were blocked by Cloudflare.");
      return this.fallbackTagOptions();
    }
    if (this.isLoginRequired(html)) {
      this.requestLogin("分類需要登入");
      this.log("Wenku8 tags require login. Please sign in via source settings.");
      return this.fallbackTagOptions();
    }
    var options = [];
    var currentGroup = "Tags";
    var ulPattern = /<ul[^>]+class=["'][^"']*ultops[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi;
    var ulMatch;
    while ((ulMatch = ulPattern.exec(html || "")) !== null) {
      var liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      var liMatch;
      while ((liMatch = liPattern.exec(ulMatch[1])) !== null) {
        var raw = this.cleanText(liMatch[1]);
        if (/Tags：?$/.test(raw)) {
          currentGroup = raw.replace(/Tags：?$/, "").replace(/系|属性|類|类/g, "") || "Tags";
          continue;
        }
        var aPattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
        var aMatch;
        while ((aMatch = aPattern.exec(liMatch[1])) !== null) {
          var tag = this.cleanText(aMatch[1]);
          if (tag) {
            options.push({ id: "tag:" + tag + ":0", title: tag, group: currentGroup });
          }
        }
      }
    }
    return options.length ? options : this.fallbackTagOptions();
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

  extractContent: function(html) {
    var lower = String(html || "").toLowerCase();
    var start = lower.indexOf('<div id="content"');
    if (start < 0) return "";
    start = String(html).indexOf(">", start);
    if (start < 0) return "";
    start += 1;
    var end = lower.indexOf('<div id="footlink"', start);
    if (end < 0) end = lower.indexOf('<div id="foottext"', start);
    if (end < 0) end = html.length;
    return html.substring(start, end);
  },

  htmlToText: function(html) {
    var self = this;
    return this.decodeEntities(String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<ul[^>]*id=["']contentdp["'][\s\S]*?<\/ul>/gi, "")
      .replace(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi, function(_, url) {
        return "\n![Image](" + self.absoluteUrl(url) + ")\n";
      })
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/div>|<\/tr>/gi, "\n")
      .replace(/<[^>]+>/g, " "))
      .replace(/\r/g, "")
      .split("\n")
      .map(function(line) { return line.replace(/[ \t\u00a0]+/g, " ").trim(); })
      .filter(function(line) { return line.length > 0; })
      .join("\n\n");
  },

  chapterContentUrl: function(aid, cid) {
    var numeric = parseInt(aid, 10) || 0;
    var folder = Math.floor(numeric / 1000);
    return this.baseUrl + "/novel/" + folder + "/" + aid + "/" + cid + ".htm";
  },

  dalvikHeaders: function(referer) {
    return {
      "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 15; Pixel 7 Pro Build/AQ3A.240905.004)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": referer || this.baseUrl + "/",
      "Connection": "keep-alive"
    };
  },

  httpOnly: function(url, headers) {
    var result = bridge.httpGetWithHeaders
      ? bridge.httpGetWithHeaders(url, headers || {})
      : bridge.httpGet(url);
    this.log("HTTP-only returned " + (result ? result.length + " chars" : "null") + " for " + url.substring(0, 80));
    return result;
  },

  get: function(url, headers) {
    // Compatibility helper for future endpoints: ordinary GETs stay native.
    // Use cloudflarePage() explicitly when an endpoint is known to need a CF
    // fallback after the native response is inspected.
    return this.httpOnly(url, this.mergeHeaders(headers));
  },

  post: function(url, body, headers) {
    return bridge.httpPost(url, body, this.mergeHeaders(headers));
  },

  gbkEncode: function(value) {
    return bridge.encodeGbkURIComponent
      ? bridge.encodeGbkURIComponent(String(value || ""))
      : encodeURIComponent(String(value || ""));
  },

  mergeHeaders: function(headers) {
    var merged = {};
    var key;
    for (key in this.headers) merged[key] = this.headers[key];
    for (key in (headers || {})) merged[key] = headers[key];
    return merged;
  },

  coverUrl: function(aid) {
    var id = parseInt(aid, 10) || 0;
    var bucket = Math.floor(id / 1000);
    return "https://img.wenku8.com/image/" + bucket + "/" + aid + "/" + aid + "s.jpg";
  },

  absoluteUrl: function(url) {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url.replace("img.wenku8.net", "img.wenku8.com").replace("http://img.wenku8.com", "https://img.wenku8.com");
    if (url.indexOf("//") === 0) return ("https:" + url).replace("img.wenku8.net", "img.wenku8.com");
    if (url.charAt(0) === "/") return this.baseUrl + url;
    return this.baseUrl.replace(/\/+$/, "") + "/" + url;
  },

  aidFromText: function(value) {
    var text = String(value || "");
    var match = /(?:book\/|id=|aid=)(\d+)/i.exec(text) || /^(\d+)$/.exec(text.trim());
    return match ? match[1] : "";
  },

  cidFromText: function(value) {
    var match = /(?:cid=|\/)(\d+)\.htm/i.exec(String(value || ""));
    return match ? match[1] : "";
  },

  queryValue: function(url, key) {
    var match = new RegExp("[?&]" + key + "=([^&#]+)", "i").exec(url || "");
    return match ? decodeURIComponent(match[1]) : "";
  },

  firstText: function(html, pattern) {
    var match = pattern.exec(html || "");
    return match ? this.cleanText(match[1]) : "";
  },

  firstAttr: function(html, pattern) {
    var match = pattern.exec(html || "");
    return match ? match[1] : "";
  },

  attr: function(html, name) {
    var match = new RegExp(name + "=[\"']([^\"']+)[\"']", "i").exec(html || "");
    return match ? this.decodeEntities(match[1]) : "";
  },

  cleanText: function(value) {
    return this.decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
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
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
      .replace(/&#(\d+);/g, function(_, num) { return String.fromCharCode(parseInt(num, 10)); });
  },

  parseBookcase: function() {
    // 關鍵：bookcase.php 帶「?charset=gbk」查詢參數會觸發 wenku8 的 Cloudflare WAF
    // 防火牆規則，被邊緣節點以 403「Attention Required / you have been blocked」硬擋，
    // 且與登入狀態、Cookie、User-Agent 完全無關（同站 toplist.php 帶 charset=gbk 卻正常，
    // 純 bookcase.php 不帶參數則回傳 200 完整書架）。
    // 解法：改用「#charset=gbk」片段——伺服器收不到該參數（避開 WAF），但原生層 decode()
    // 仍會從 URL 字串偵測到 charset=gbk 而正確以 GBK 解碼。
    var pageBase = this.baseUrl + "/modules/article/bookcase.php";
    var listUrl = pageBase + "#charset=gbk";
    // bookcase.php is the endpoint known to intermittently require CF
    // clearance. It is the only list endpoint allowed to use the fallback.
    var listHtml = this.cloudflarePage(listUrl, this.baseUrl + "/");
    if (this.isBlocked(listHtml)) {
      this.log("Wenku8 bookcase was blocked by Cloudflare.");
      return [];
    }
    if (this.isLoginRequired(listHtml)) {
      this.requestLogin("書架需要登入");
      this.log("請先登入輕小說文庫帳號以查看書架。");
      return [];
    }

    // 書架採兩層結構：頂層頁面已含全部書籍列，先解析；再逐分類 (classid) 補齊，
    // 由 seen[aid] 去重，即使頂層已含全部或某分類請求失敗也安全。
    var classes = this.parseBookcaseClasses(listHtml);
    var results = [];
    var seen = {};
    var loginRequested = false;
    this.parseBookcaseRows(listHtml, results, seen);
    for (var i = 0; i < classes.length; i++) {
      if (classes[i].id === "") continue;
      var classUrl = pageBase + "?classid=" + encodeURIComponent(classes[i].id) + "#charset=gbk";
      var classHtml = this.cloudflarePage(classUrl, pageBase);
      if (this.isLoginRequired(classHtml)) {
        if (!loginRequested) {
          this.requestLogin("收藏庫需要登入，登入可能已失效。");
          loginRequested = true;
        }
        continue;
      }
      if (this.isBlocked(classHtml)) continue;
      this.parseBookcaseRows(classHtml, results, seen);
    }

    if (!results.length) {
      this.log("bookcase debug: classes=" + classes.length + " listLen=" + (listHtml ? listHtml.length : 0));
    }
    return results;
  },

  parseBookcaseClasses: function(html) {
    var classes = [];
    var selectMatch = /<select[^>]+name=["']?classlist["']?[^>]*>([\s\S]*?)<\/select>/i.exec(html || "");
    if (!selectMatch) return classes;
    var optionPattern = /<option[^>]+value=["']([^"']*)["'][^>]*>([^<]*)<\/option>/gi;
    var optMatch;
    while ((optMatch = optionPattern.exec(selectMatch[1])) !== null) {
      var id = optMatch[1];
      var title = this.cleanText(optMatch[2]);
      if (id === "" && !title) continue;
      classes.push({ id: id, title: title || id });
    }
    return classes;
  },

  parseBookcaseRows: function(html, results, seen) {
    if (!html) return;
    var checkboxPattern = /<input[^>]+type=["']?checkbox["']?[^>]*>/gi;
    var indices = [];
    var m;
    while ((m = checkboxPattern.exec(html)) !== null) {
      indices.push(m.index);
    }
    for (var i = 0; i < indices.length; i++) {
      var start = indices[i];
      var end = i + 1 < indices.length ? indices[i + 1] : Math.min(html.length, start + 3000);
      var row = html.substring(start, end);

      var titleMatch = /<a[^>]+href=["']([^"']*(?:readbookcase|bookcase)\.php\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row);
      if (!titleMatch) continue;
      this.pushBookcaseRow(results, seen, titleMatch[1], titleMatch[2], row, titleMatch.index + titleMatch[0].length);
    }

    // Some Wenku8 layouts omit the checkbox input or render it outside the
    // row. Parse the book links themselves as a fallback. Older versions
    // also use bid= instead of aid=, which was the reason logged-in bookcases
    // could still appear empty.
    var linkPattern = /<a[^>]+href=["']([^"']*(?:readbookcase|bookcase)\.php\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    var linkMatch;
    while ((linkMatch = linkPattern.exec(html)) !== null) {
      var context = html.substring(Math.max(0, linkMatch.index - 700), Math.min(html.length, linkMatch.index + linkMatch[0].length + 1200));
      this.pushBookcaseRow(results, seen, linkMatch[1], linkMatch[2], context, linkMatch[0].length);
    }
  },

  pushBookcaseRow: function(results, seen, href, rawTitle, context, titleEnd) {
    var aid = this.queryValue(href, "aid") || this.queryValue(href, "bid");
    if (!aid || seen[aid]) return;
    var title = this.cleanText(rawTitle);
    if (!title || /^(?:删除|刪除|移除|remove)$/i.test(title)) return;

    var afterTitle = String(context || "").substring(titleEnd || 0);
    var authorMatch = /(?:作者|作家)[：:]?\s*(?:<[^>]+>\s*)*([^<\n]+)/i.exec(afterTitle);
    var author = authorMatch ? this.cleanText(authorMatch[1]) : "";
    results.push({
      sourceId: this.id,
      title: title,
      url: this.baseUrl + "/book/" + aid + ".htm",
      author: author,
      description: "",
      coverImage: this.coverUrl(aid)
    });
    seen[aid] = true;
  },

  requestLogin: function(reason) {
    var now = Date.now ? Date.now() : 0;
    if (now - this._lastLoginRequestAt < 10000) {
      this.log("Suppressed duplicate login request: " + reason);
      return false;
    }
    this._lastLoginRequestAt = now;
    try {
      if (typeof bridge !== "undefined" && bridge && typeof bridge.requestLogin === "function") {
        var arity = Number(bridge.requestLogin.length);
        if (isFinite(arity) && arity <= 1) bridge.requestLogin(reason);
        else bridge.requestLogin(this.id, reason);
        return true;
      }
    } catch (ignored) {}
    // Older Shinsou hosts do not provide a login-dialog callback. Keep the
    // protected operation safe and let the user sign in from source settings.
    return false;
  },

  isCloudflareResponse: function(html) {
    if (!html) return false;
    return /challenge-form|cf_chl_|Just a moment(?:\.\.\.|\s+checking)|Checking your browser|Enable JavaScript and cookies|Attention Required|Sorry, you have been blocked/i.test(html);
  },

  // Keep the old helper name for the endpoint parsers, but make the browser
  // fallback decision explicit through isCloudflareResponse().
  isBlocked: function(html) {
    return this.isCloudflareResponse(html);
  },

  isLoginRequired: function(html) {
    if (!html) return false;
    var text = String(html);
    var hasLoginForm = /<form\b[^>]*(?:action|id|class)=["'][^"']*login[^"']*["'][^>]*>[\s\S]{0,6000}(?:password|passwd|username|用户名|用戶名|登录|登入)/i.test(text)
      || /<form\b[\s\S]{0,6000}(?:password|passwd)[\s\S]{0,6000}(?:login\.php|登录|登入)/i.test(text);
    var hasLoginTitle = /<title[^>]*>[\s\S]{0,120}(?:登录|登入|登錄|login)[\s\S]{0,120}<\/title>/i.test(text);
    var hasExplicitMessage = /(?:请先|請先|您尚未|需要先)(?:登录|登入|登錄)|(?:登录|登入|登錄)(?:后|後)(?:才能|方可|才可)|(?:未登录|未登入|未登錄)(?:用户)?(?:无法|不能|请)|login\s+required/i.test(text);
    return hasLoginForm || hasLoginTitle || hasExplicitMessage;
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
    target._lastLoginRequestAt = 0;
  };
})(source);
