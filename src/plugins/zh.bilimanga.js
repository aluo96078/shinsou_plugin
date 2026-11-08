/*
 * Linovelib / 嗶哩輕小說 Shinsou content v2 package.
 *
 * BiliManga is published separately as zh.bilimanga.manga.  This package uses
 * the Shinsou script contract (`var source`, getChapterText) and retains only
 * Linovelib plain-text content.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"zh.bilimanga","contentType":"novel","contentKinds":["PLAIN_TEXT"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":["command.auth.login.request"],"optional":[]},"requestedHostPermissions":["REQUEST_LOGIN_UI"]};

var BiliMangaShared = {
  pageNumber: function(value) {
    var number = Number(value);
    return isFinite(number) && number >= 0 ? Math.floor(number) + 1 : 1;
  },

  encode: function(value) {
    try { return encodeURIComponent(String(value || "")); } catch (ignored) { return ""; }
  },

  escapeRegExp: function(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  decodeEntities: function(value) {
    return String(value || "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, function(_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      })
      .replace(/&#(\d+);/g, function(_, number) {
        return String.fromCharCode(parseInt(number, 10));
      });
  },

  cleanText: function(value) {
    return this.decodeEntities(String(value || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "))
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  },

  cleanContent: function(value) {
    var text = this.decodeEntities(String(value || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<p\b[^>]*>/gi, "")
      .replace(/<\/?(?:div|section|article|li|blockquote|center)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""));
    return text
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  },

  attr: function(tag, name) {
    var pattern = new RegExp("\\b" + this.escapeRegExp(name) + "\\s*=\\s*[\\\"']([^\\\"']*)[\\\"']", "i");
    var match = pattern.exec(String(tag || ""));
    return match ? this.decodeEntities(match[1]).trim() : "";
  },

  absolute: function(value, baseUrl) {
    var url = this.decodeEntities(String(value || "")).trim();
    if (!url || /^(?:javascript|data|mailto):/i.test(url)) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.indexOf("//") === 0) return "https:" + url;

    var base = String(baseUrl || "");
    var originMatch = /^(https?:\/\/[^/]+)/i.exec(base);
    var origin = originMatch ? originMatch[1] : base.replace(/\/.*$/, "");
    if (url.charAt(0) === "/") return origin + url;

    var path = base.split(/[?#]/)[0];
    if (path.charAt(path.length - 1) !== "/") {
      var schemeEnd = path.indexOf("://");
      var lastSlash = path.lastIndexOf("/");
      path = lastSlash <= schemeEnd + 2 ? path + "/" : path.substring(0, lastSlash + 1);
    }
    var combined = path + url;
    var prefix = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(combined);
    if (!prefix) return combined;
    var parts = (prefix[2] || "/").split("/");
    var normalized = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i] || parts[i] === ".") continue;
      if (parts[i] === "..") {
        if (normalized.length) normalized.pop();
      } else {
        normalized.push(parts[i]);
      }
    }
    return prefix[1] + "/" + normalized.join("/");
  },

  request: function(sourceObject, url, extraHeaders, loginReason) {
    var headers = {};
    var key;
    for (key in (sourceObject.headers || {})) headers[key] = sourceObject.headers[key];
    for (key in (extraHeaders || {})) headers[key] = extraHeaders[key];
    try {
      if (typeof bridge !== "undefined" && bridge) {
        var response = typeof bridge.httpGetWithHeaders === "function"
          ? bridge.httpGetWithHeaders(url, headers)
          : (typeof bridge.httpGet === "function" ? bridge.httpGet(url) : "");
        if (response && typeof response === "object") {
          if (response.error) return "";
          if (typeof response.body === "string") {
            if (loginReason) this.handleLoginResponse(sourceObject, response.body, loginReason);
            return response.body;
          }
        }
        var body = String(response || "");
        if (loginReason) this.handleLoginResponse(sourceObject, body, loginReason);
        return body;
      }
    } catch (error) {
      if (typeof bridge !== "undefined" && bridge && typeof bridge.log === "function") {
        try { bridge.log("zh.bilimanga request failed: " + error); } catch (ignored) {}
      }
    }
    return "";
  },

  post: function(sourceObject, url, body, extraHeaders) {
    var headers = {};
    var key;
    for (key in (sourceObject.headers || {})) headers[key] = sourceObject.headers[key];
    for (key in (extraHeaders || {})) headers[key] = extraHeaders[key];
    try {
      if (typeof bridge !== "undefined" && bridge && typeof bridge.httpPost === "function") {
        var response = bridge.httpPost(url, String(body || ""), headers);
        if (response && typeof response === "object") {
          if (response.error) return "";
          if (typeof response.body === "string") return response.body;
        }
        return String(response || "");
      }
    } catch (error) {
      if (typeof bridge !== "undefined" && bridge && typeof bridge.log === "function") {
        try { bridge.log("zh.bilimanga POST failed: " + error); } catch (ignored) {}
      }
    }
    return "";
  },

  isChallenge: function(html) {
    return /challenge-form|cf_chl_|Just a moment|Checking your browser|Enable JavaScript and cookies|Attention Required|Sorry, you have been blocked/i.test(String(html || ""));
  },

  isLoginPage: function(html) {
    var text = String(html || "");
    return /<form\b[^>]*(?:name=["']frmlogin["']|action=["'][^"']*login\.php\?do=submit[^"']*["'])/i.test(text)
      || /<input\b[^>]*type=["']password["'][^>]*>/i.test(text) && /(?:登入|登錄|登录|login)/i.test(text);
  },

  isLoggedIn: function(html) {
    var text = String(html || "");
    // The current Linovelib/BiliManga mobile header replaces the guest
    // /login.php link with an account-avatar link to /user.php.  The public
    // footer always contains /bookcase.php, so that link alone is not proof of
    // authentication.
    return /href\s*=\s*["'][^"']*\/user\.php(?:[?#][^"']*)?["']/i.test(text)
      || /login\.php\?do=logout|logout(?:\.php)?|退出(?:登入|登錄|登录)|登出|登入成功|登錄成功|登录成功/i.test(text);
  },

  safeLoginMessage: function(value, username, password) {
    var message = this.cleanText(value);
    var user = String(username || "").trim();
    var secret = String(password || "");
    if (user) message = message.split(user).join("");
    if (secret) message = message.split(secret).join("");
    message = message.replace(/\s+/g, " ").trim();
    if (!message || this.isChallenge(message)) return "";
    return message.substring(0, 512).trim();
  },

  isAuthenticationFailureMessage: function(value) {
    var message = String(value || "");
    var subject = "(?:帳號|账号|賬號|用戶名|用户名|用戶|用户|使用者名稱|使用者名称|使用者|會員|会员|郵箱|邮箱|電郵|密碼|密码|驗證碼|验证码|登入|登录|登錄|login|username|password|account|credentials?|e-?mail|captcha|verification code)";
    var failure = "(?:錯誤|错误|失敗|失败|不正確|不正确|不匹配|不符|不存在|無效|无效|未通過|未通过|拒絕|拒绝|incorrect|invalid|failed|failure|wrong|denied)";
    var between = "[^。.!?\\r\\n]{0,80}";
    return new RegExp("(?:" + subject + between + failure + "|" + failure + between + subject + ")", "i").test(message);
  },

  authenticationFailureFragment: function(value, username, password) {
    var fragments = String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|li|p|ul|ol|form|section|article|h[1-6])\s*>/gi, "\n")
      .split(/[\r\n。.!?]+/);
    for (var i = 0; i < fragments.length; i++) {
      var candidate = this.safeLoginMessage(fragments[i], username, password);
      if (candidate && candidate.length <= 300 && this.isAuthenticationFailureMessage(candidate)) {
        return candidate;
      }
    }
    return "";
  },

  loginFailureMessage: function(html, username, password) {
    var text = String(html || "");
    var marked = /<([a-z0-9]+)\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:login[-_ ]?(?:error|message)|aui-ver-form|error|danger|alert|warning|notice|message|msg|tips?)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/ig;
    var match;
    while ((match = marked.exec(text)) !== null) {
      var markedMessage = this.authenticationFailureFragment(match[2], username, password);
      if (markedMessage) return markedMessage;
    }

    // Only accept a short authentication-failure sentence from otherwise unstructured
    // responses. Splitting at block boundaries prevents an unrelated site announcement from
    // being joined to a login form elsewhere in the document.
    return this.authenticationFailureFragment(text, username, password);
  },

  requestLogin: function(sourceObject, reason) {
    var now = new Date().getTime();
    var last = Number(sourceObject && sourceObject._lastLoginRequestAt || 0);
    if (isFinite(last) && now - last < 10000) return true;

    var message = String(reason || "此來源需要登入才能繼續。");
    try {
      if (typeof bridge !== "undefined" && bridge) {
        if (bridge.system && typeof bridge.system.requestLogin === "function") {
          bridge.system.requestLogin(message);
          if (sourceObject) sourceObject._lastLoginRequestAt = now;
          return true;
        }
        if (typeof bridge.requestLogin === "function") {
          var result = Number(bridge.requestLogin.length) <= 1
            ? bridge.requestLogin(message)
            : bridge.requestLogin(sourceObject && sourceObject.id, message);
          if (result !== false) {
            if (sourceObject) sourceObject._lastLoginRequestAt = now;
            return true;
          }
        }
      }
    } catch (ignored) {}
    return false;
  },

  handleLoginResponse: function(sourceObject, html, reason) {
    if (this.isLoginPage(html)) this.requestLogin(sourceObject, reason);
  },

  resetLoginPrompt: function(sourceObject) {
    if (sourceObject) sourceObject._lastLoginRequestAt = 0;
  },

  login: function(sourceObject, username, password) {
    var user = String(username || "").trim();
    var secret = String(password || "");
    var fallback = "登入失敗，請檢查使用者名稱與密碼。";
    if (!user || !secret) return { loggedIn: false, errorMessage: fallback };

    var loginUrl = sourceObject.baseUrl + "/login.php";
    // A browser-completed member login can be imported into the host cookie jar even when
    // Cloudflare binds its clearance to the browser's TLS fingerprint. Check that session on the
    // public home page before attempting the protected POST endpoint.
    var existingSession = this.request(sourceObject, sourceObject.baseUrl + "/", {
      "Referer": loginUrl
    }, null);
    if (existingSession && !this.isChallenge(existingSession) && this.isLoggedIn(existingSession)) {
      this.resetLoginPrompt(sourceObject);
      return { loggedIn: true };
    }

    // Keep this identical to the Linovelib member flow: submit the site's own
    // form directly and let the host network layer retain Set-Cookie headers.
    // BiliManga's submit button has no value attribute, so submit is empty.
    var body = [
      "username=" + this.encode(user),
      "password=" + this.encode(secret),
      "act=login",
      "usecookie=86400",
      "submit="
    ].join("&");
    var response = this.post(sourceObject, loginUrl + "?do=submit", body, {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": loginUrl,
      "Origin": sourceObject.baseUrl
    });
    var responseMessage = this.loginFailureMessage(response, user, secret);
    if (!response) return { loggedIn: false, errorMessage: fallback };
    if (this.isChallenge(response)) {
      return {
        loggedIn: false,
        errorMessage: "網站登入端點受 Cloudflare 瀏覽器指紋保護。請開啟「Web 驗證／Cloudflare」，在同一視窗完成網站會員登入，看到會員頁後按「Import cookies」，再回來按登入。"
      };
    }
    if (this.isLoginPage(response)) {
      return { loggedIn: false, errorMessage: responseMessage || fallback };
    }

    // POST redirects are followed by the host transport. Some deployments
    // return a generic success page without the logout link, so verify the
    // resulting session with the public home page as the novel source does.
    var account = this.request(sourceObject, sourceObject.baseUrl + "/", {
      "Referer": loginUrl
    }, null);
    var success = this.isLoggedIn(response) || (
      !!account && !this.isChallenge(account) && !this.isLoginPage(account) && this.isLoggedIn(account)
    );
    if (success) {
      this.resetLoginPrompt(sourceObject);
      return { loggedIn: true };
    }
    return {
      loggedIn: false,
      errorMessage: responseMessage || this.loginFailureMessage(account, user, secret) || fallback
    };
  },

  logout: function(sourceObject) {
    try {
      if (typeof bridge !== "undefined" && bridge && typeof bridge.clearCookies === "function") bridge.clearCookies();
    } catch (ignored) {}
    this.resetLoginPrompt(sourceObject);
  },

  result: function(items, hasNextPage) {
    if (typeof MangasPage === "function") return new MangasPage(items || [], !!hasNextPage);
    return { mangas: items || [], hasNextPage: !!hasNextPage };
  },

  classText: function(block, className) {
    var pattern = new RegExp("<([a-z0-9]+)\\b[^>]*class=[\\\"'][^\\\"']*\\b" + this.escapeRegExp(className) + "\\b[^\\\"']*[\\\"'][^>]*>([\\s\\S]*?)<\\/\\1>", "i");
    var match = pattern.exec(String(block || ""));
    return match ? this.cleanText(match[2]) : "";
  },

  elementText: function(block, tagName, className) {
    var pattern = new RegExp("<" + tagName + "\\b[^>]*class=[\\\"'][^\\\"']*\\b" + this.escapeRegExp(className) + "\\b[^\\\"']*[\\\"'][^>]*>([\\s\\S]*?)<\\/" + tagName + ">", "i");
    var match = pattern.exec(String(block || ""));
    return match ? this.cleanText(match[1]) : "";
  },

  firstText: function(block, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var match = patterns[i].exec(String(block || ""));
      if (match && match[1]) {
        var value = this.cleanText(match[1]);
        if (value) return value;
      }
    }
    return "";
  },

  image: function(block, baseUrl) {
    var pattern = /<(?:img|source)\b[^>]*(?:data-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;
    var match;
    while ((match = pattern.exec(String(block || ""))) !== null) {
      var value = this.absolute(match[1], baseUrl);
      if (value && !/book-cover-no\.svg|transparent\.gif|spacer\.(?:gif|png)/i.test(value)) return value;
    }
    return "";
  },

  tagTexts: function(block) {
    var values = [];
    var pattern = /<(?:em|a|span)\b[^>]*class=["'][^"']*\btag-small\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:em|a|span)>/gi;
    var match;
    while ((match = pattern.exec(String(block || ""))) !== null) {
      var value = this.cleanText(match[1]);
      if (value && values.indexOf(value) < 0) values.push(value);
    }
    return values;
  },

  status: function(value) {
    var text = String(value || "");
    if (/已完結|完結/.test(text)) return 2;
    if (/連載中|連載/.test(text)) return 1;
    return 0;
  },

  hasNextPage: function(html, pageNumber, minimumItems) {
    var last = /<a\b[^>]*class=["'][^"']*\blast\b[^"']*["'][^>]*>(\d+)<\/a>/i.exec(String(html || ""));
    if (last) return parseInt(last[1], 10) > pageNumber;
    return Number(minimumItems || 0) >= 40;
  },

  filterState: function(filters, name) {
    if (!Array.isArray(filters)) return 0;
    for (var i = 0; i < filters.length; i++) {
      var filter = filters[i] || {};
      if (filter.name === name) {
        var state = Number(filter.state);
        return isFinite(state) && state >= 0 ? Math.floor(state) : 0;
      }
    }
    return 0;
  },

  readParam: function(html, name) {
    var pattern = new RegExp("\\b" + this.escapeRegExp(name) + "\\s*:\\s*['\\\"]([^'\\\"]*)['\\\"]", "i");
    var match = pattern.exec(String(html || ""));
    return match ? this.decodeEntities(match[1]) : "";
  },

  chapterKey: function(url, kind) {
    var pattern = kind === "novel"
      ? /\/novel\/\d+\/([^/?#]+)\.html/i
      : /\/read\/\d+\/([^/?#]+)\.html/i;
    var match = pattern.exec(String(url || ""));
    if (!match) return "";
    return match[1].replace(/_\d+$/, "");
  },

  sameChapter: function(first, second, kind) {
    var a = this.chapterKey(first, kind);
    var b = this.chapterKey(second, kind);
    return !!a && !!b && a === b;
  },

  novelContent: function(html) {
    var match = /<div\b[^>]*id=["']acontent["'][^>]*>([\s\S]*?)<\/div>/i.exec(String(html || ""));
    return match ? this.cleanContent(match[1]) : "";
  },

  novelText: function(sourceObject, chapter) {
    var current = this.absolute(chapter && chapter.url, sourceObject.baseUrl);
    var seen = {};
    var chunks = [];
    for (var i = 0; i < 32 && current; i++) {
      if (seen[current]) break;
      seen[current] = true;
      var html = this.request(sourceObject, current, null, "小說章節內容需要登入才能閱讀。");
      if (!html) break;
      var content = this.novelContent(html);
      if (content) chunks.push(content);

      var next = this.readParam(html, "url_next");
      if (!next) {
        var prerender = /<link\b[^>]*rel=["']prerender["'][^>]*href=["']([^"']+)["']/i.exec(html);
        next = prerender ? prerender[1] : "";
      }
      next = this.absolute(next, current);
      if (!next || !this.sameChapter(current, next, "novel")) break;
      current = next;
    }
    return this.limitUtf8(chunks.join("\n\n"), 4 * 1024 * 1024);
  },

  utf8Length: function(text) {
    var length = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code < 0x80) length += 1;
      else if (code < 0x800) length += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) { length += 4; i++; }
      else length += 3;
    }
    return length;
  },

  limitUtf8: function(text, maxBytes) {
    if (text.length * 3 <= maxBytes || this.utf8Length(text) <= maxBytes) return text;
    var low = 0;
    var high = text.length;
    while (low < high) {
      var mid = Math.ceil((low + high) / 2);
      if (this.utf8Length(text.substring(0, mid)) <= maxBytes) low = mid; else high = mid - 1;
    }
    var cut = text.substring(0, low);
    var last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.substring(0, cut.length - 1);
    return cut;
  }
};

function novelBook(sourceObject, id, block, url) {
  var tags = BiliMangaShared.tagTexts(block);
  var title = BiliMangaShared.firstText(block, [
    /<h1\b[^>]*class=["'][^"']*\bbook-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<h[2-4]\b[^>]*class=["'][^"']*\bbook-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h[2-4]>/i,
    /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i,
    /<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i
  ]);
  if (!title) return null;
  var author = (BiliMangaShared.classText(block, "authorname") || BiliMangaShared.classText(block, "book-author")).replace(/^作者\s*[:：]?\s*/, "");
  var description = BiliMangaShared.classText(block, "book-intro") || BiliMangaShared.classText(block, "book-desc");
  var status = BiliMangaShared.status(block);
  return {
    sourceId: sourceObject.id,
    url: url,
    title: title,
    author: author || null,
    artist: null,
    description: description || null,
    genre: tags,
    status: status,
    thumbnailUrl: BiliMangaShared.image(block, sourceObject.baseUrl) || null,
    initialized: true
  };
}

function parseNovelList(sourceObject, html, pageNumber) {
  var results = [];
  var seen = {};
  var pattern = /<a\b[^>]*href=["']([^"']*\/novel\/(\d+)\.html[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi;
  var match;
  while ((match = pattern.exec(String(html || ""))) !== null) {
    var id = match[2];
    if (!id || seen[id]) continue;
    var url = BiliMangaShared.absolute(match[1], sourceObject.baseUrl);
    var book = novelBook(sourceObject, id, match[0], url);
    if (book) {
      results.push(book);
      seen[id] = true;
    }
  }
  return BiliMangaShared.result(results, BiliMangaShared.hasNextPage(html, pageNumber, results.length));
}

function novelDetails(sourceObject, id, html, url) {
  var book = novelBook(sourceObject, id, html, url);
  if (!book) return null;
  var content = /<content\b[^>]*>([\s\S]*?)<\/content>/i.exec(String(html || ""));
  var author = BiliMangaShared.classText(html, "authorname").replace(/^作者\s*[:：]?\s*/, "");
  var illustrator = BiliMangaShared.classText(html, "illname").replace(/^作者\s*[:：]?\s*/, "");
  book.author = author || book.author;
  book.artist = illustrator || null;
  book.description = content ? BiliMangaShared.cleanContent(content[1]) : book.description;
  book.status = BiliMangaShared.status(html);
  var detailTags = BiliMangaShared.tagTexts(html);
  if (detailTags.length) book.genre = detailTags;
  book.thumbnailUrl = BiliMangaShared.image(html, sourceObject.baseUrl) || book.thumbnailUrl;
  return book;
}

function novelId(value) {
  var match = /\/novel\/(\d+)(?:\.html|\/)/i.exec(String(value || ""));
  return match ? match[1] : (/^\d+$/.test(String(value || "").trim()) ? String(value).trim() : "");
}

function novelBookUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/novel/" + id + ".html";
}

function novelCatalogUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/novel/" + id + "/catalog";
}

function chapterDate(html) {
  var match = /(20\d{2})[-年](\d{1,2})[-月](\d{1,2})/.exec(String(html || ""));
  if (!match) return 0;
  return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)).getTime();
}

function parseNovelChapters(sourceObject, id, html) {
  var text = String(html || "");
  var result = [];
  var hasCatalogVolumes = /<div\b[^>]*class=["'][^"']*\bcatalog-volume\b[^"']*["']/i.test(text);
  var pattern = hasCatalogVolumes
    ? /<div\b[^>]*class=["'][^"']*\bcatalog-volume\b[^"']*["'][^>]*>|<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi
    : /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>|<a\b[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi;
  var match;
  var volumeNumber = 0;
  while ((match = pattern.exec(text)) !== null) {
    var token = match[0];
    if (/^<div\b/i.test(token)) {
      volumeNumber += 1;
      continue;
    }
    if (/^<h[1-6]\b/i.test(token)) {
      if (/(?:卷|volume)/i.test(BiliMangaShared.cleanText(token))) volumeNumber += 1;
      continue;
    }
    if (!/class=["'][^"']*\bchapter-li-a\b[^"']*["']/i.test(token)) continue;
    var href = /href=["']([^"']+)["']/i.exec(token);
    var body = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(token);
    var url = BiliMangaShared.absolute(href && href[1], sourceObject.baseUrl);
    var name = BiliMangaShared.cleanText(body && body[1]);
    if (!url || !name) continue;
    if (volumeNumber > 0) name = "第" + volumeNumber + "卷 · " + name;
    result.push({ sourceId: sourceObject.id, url: url, name: name, scanlator: null, dateUpload: chapterDate(html), chapterNumber: result.length + 1 });
  }
  // Linovelib exposes the catalogue in story order (oldest first), including
  // across volume boundaries. Prefixing the DOM-positioned volume number makes
  // repeated labels such as "插圖" and "序章" unambiguous without reordering.
  return result;
}

var novelSortCodes = ["lastupdate", "postdate", "weekvisit", "monthvisit", "allvisit", "goodnum"];
var novelSortLabels = ["最新更新", "最新入庫", "週點擊", "月點擊", "總點擊", "收藏榜"];
var novelTagIds = ["0", "15", "61", "96", "18", "13", "14", "16", "17", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60"];
var novelTagLabels = ["全部", "奇幻", "冒險", "魔法", "戰鬥", "愛情", "校園", "青春", "科幻", "懸疑", "推理", "治癒", "日常", "搞笑", "後宮", "異世界", "轉生", "龍傲天", "黑暗", "大逃殺", "犯罪", "歷史", "武俠", "都市", "職場", "群像", "女性視角", "百合", "耽美", "輕文學", "音樂", "美食", "旅行", "病嬌", "青梅竹馬", "妹妹", "大小姐", "人外", "末日", "超自然", "遊戲", "異能", "戰爭", "經營", "歡樂", "溫馨", "蘿莉", "正太", "性轉", "偽娘", "獵奇", "神鬼", "偵探", "冒險譚", "校園戀愛", "戀愛喜劇", "日本輕小說", "電擊文庫", "角川文庫", "GA文庫", "MF文庫", "富士見文庫"];

var source = {
  // The app overwrites id with the numeric index id (-9110000000000004).
  id: "-9110000000000004",
  name: "嗶哩輕小說（Linovelib）",
  lang: "zh",
  baseUrl: "https://tw.linovelib.com",
  // The public home page is large and injects Cloudflare's JavaScript detector. JavaFX WebKit
  // can remain in RUNNING state on that document even though the dedicated member page loads
  // immediately, so start the isolated browser at the smaller same-origin login endpoint.
  webChallengeUrl: "https://tw.linovelib.com/login.php",
  supportsLatest: true,
  supportsLogin: true,
  supportsFavorites: false,
  _lastLoginRequestAt: 0,
  headers: {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh-CN;q=0.9,en;q=0.8",
    "Referer": "https://tw.linovelib.com",
    "Cache-Control": "no-cache"
  },

  login: function(username, password) {
    return BiliMangaShared.login(this, username, password);
  },

  logout: function() {
    BiliMangaShared.logout(this);
  },

  getPopularManga: function(page) {
    var current = BiliMangaShared.pageNumber(page);
    var url = this.baseUrl + "/topfull/weekvisit/" + current + ".html";
    return parseNovelList(this, BiliMangaShared.request(this, url, null, "小說排行榜需要登入才能載入。"), current);
  },

  getLatestUpdates: function(page) {
    var current = BiliMangaShared.pageNumber(page);
    var url = this.baseUrl + "/top/lastupdate/" + current + ".html";
    var html = BiliMangaShared.request(this, url, null, "小說更新列表需要登入才能載入。");
    if (!html) html = BiliMangaShared.request(this, this.baseUrl + "/topfull/postdate/" + current + ".html", null, "小說更新列表需要登入才能載入。");
    return parseNovelList(this, html, current);
  },

  getSearchManga: function(page, query, filters) {
    var current = BiliMangaShared.pageNumber(page);
    var keyword = String(query || "").trim();
    var directId = novelId(keyword);
    if (directId && /^\d+$/.test(keyword)) {
      var direct = this.getMangaDetails({ url: novelBookUrl(this, directId), title: keyword });
      return BiliMangaShared.result(direct && direct.title ? [direct] : [], false);
    }

    var url;
    if (keyword) {
      url = this.baseUrl + "/search.php?keyword=" + BiliMangaShared.encode(keyword) + "&page=" + current;
      var html = BiliMangaShared.request(this, url, null, "小說搜尋需要登入才能載入。");
      var result = parseNovelList(this, html, current);
      if (result.mangas.length) return result;
      // Some deployments use the path form; keep it as a safe fallback.
      url = this.baseUrl + "/search/" + BiliMangaShared.encode(keyword) + "_" + current + ".html";
      return parseNovelList(this, BiliMangaShared.request(this, url, null, "小說搜尋需要登入才能載入。"), current);
    }

    var sortState = BiliMangaShared.filterState(filters, "排序");
    var tagState = BiliMangaShared.filterState(filters, "小說類型");
    var sort = novelSortCodes[sortState] || novelSortCodes[0];
    if (tagState > 0 && novelTagIds[tagState]) {
      var offset = current - 1;
      url = this.baseUrl + "/wenku/" + sort + "_" + novelTagIds[tagState] + "_0_0_0_0_0_0_1_" + offset + ".html";
    } else {
      url = this.baseUrl + "/topfull/" + sort + "/" + current + ".html";
    }
    return parseNovelList(this, BiliMangaShared.request(this, url, null, "小說分類需要登入才能載入。"), current);
  },

  getMangaDetails: function(manga) {
    var input = manga || {};
    var id = novelId(input.url || input.title);
    if (!id) return input;
    var url = novelBookUrl(this, id);
    var details = novelDetails(this, id, BiliMangaShared.request(this, url, null, "小說作品詳情需要登入才能載入。"), url);
    return details || input;
  },

  getChapterList: function(manga) {
    var id = novelId(manga && manga.url);
    if (!id) return [];
    var url = novelCatalogUrl(this, id);
    return parseNovelChapters(this, id, BiliMangaShared.request(this, url, null, "小說章節列表需要登入才能載入。"));
  },

  getChapterText: function(chapter) {
    return BiliMangaShared.novelText(this, chapter || {});
  },

  getFilterList: function() {
    return [
      { type: "select", name: "排序", values: novelSortLabels, state: 0 },
      { type: "select", name: "小說類型", values: novelTagLabels, state: 0 }
    ];
  }
};

source.v2 = __shinsouExtensionV2;
