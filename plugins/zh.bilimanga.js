/*
 * BiliManga / 嗶哩輕小說 content v2 package.
 *
 * The two domains are operated as one catalogue, but expose different source
 * identities so the host can keep novel text and manga image sequences
 * separate.  The parser deliberately uses the small bridge/legacy contract
 * (HTTP + plain JavaScript) rather than relying on a browser DOM.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"zh.bilimanga","contentType":"both","contentKinds":["PLAIN_TEXT","IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":["command.auth.login.request"],"optional":[]},"requestedHostPermissions":["REQUEST_LOGIN_UI"]};

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

  imageRequestUrl: function(sourceObject, imageUrl) {
    var userAgent = sourceObject && sourceObject.headers && sourceObject.headers["User-Agent"];
    var referer = sourceObject && sourceObject.baseUrl ? sourceObject.baseUrl : "";
    var metadata = [];
    if (referer) metadata.push("Referer=" + this.encode(referer));
    if (userAgent) metadata.push("User-Agent=" + this.encode(userAgent));
    return imageUrl + (metadata.length ? "#" + metadata.join("&") : "");
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
    return chunks.join("\n\n");
  },

  imagePages: function(sourceObject, chapter) {
    var url = this.absolute(chapter && chapter.url, sourceObject.baseUrl);
    var html = this.request(sourceObject, url, { "Cookie": "night=1" }, "漫畫章節內容需要登入才能閱讀。");
    if (!html) return [];
    var container = /<(?:div|section)\b[^>]*class=["'][^"']*\bimagecontent\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i.exec(html);
    var block = container ? container[1] : "";
    if (!block) {
      // A few themed pages put the marker on each image instead of on a
      // wrapper. Keep that layout compatible with the same page contract.
      var standalone = [];
      var standalonePattern = /<img\b[^>]*class=["'][^"']*\bimagecontent\b[^"']*["'][^>]*>/gi;
      var standaloneMatch;
      while ((standaloneMatch = standalonePattern.exec(html)) !== null) standalone.push(standaloneMatch[0]);
      block = standalone.join("\n");
    }
    var pattern = /<img\b[^>]*(?:data-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;
    var pages = [];
    var seen = {};
    var match;
    while ((match = pattern.exec(block || "")) !== null) {
      var imageUrl = this.absolute(match[1], url);
      if (!imageUrl || seen[imageUrl] || /book-cover-no\.svg|transparent\.gif|spacer\.(?:gif|png)/i.test(imageUrl)) continue;
      seen[imageUrl] = true;
      var requestUrl = this.imageRequestUrl(sourceObject, imageUrl);
      pages.push({ index: pages.length, url: requestUrl, imageUrl: requestUrl });
    }
    return pages;
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
    genre: tags.length ? tags.join(" ") : null,
    status: status,
    thumbnailUrl: BiliMangaShared.image(block, sourceObject.baseUrl) || null,
    initialized: true
  };
}

function mangaBook(sourceObject, id, block, url) {
  var tags = BiliMangaShared.tagTexts(block);
  var title = BiliMangaShared.firstText(block, [
    /<h1\b[^>]*class=["'][^"']*\bbook-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<h[2-4]\b[^>]*class=["'][^"']*\bbook-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h[2-4]>/i,
    /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i,
    /<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i
  ]);
  if (!title) return null;
  var author = BiliMangaShared.classText(block, "authorname").replace(/^作者\s*[:：]?\s*/, "");
  if (!author) author = BiliMangaShared.classText(block, "book-author").replace(/^作者\s*[:：]?\s*/, "");
  var artist = BiliMangaShared.classText(block, "illname").replace(/^作者\s*[:：]?\s*/, "");
  var description = BiliMangaShared.classText(block, "book-desc") || BiliMangaShared.classText(block, "book-intro");
  return {
    sourceId: sourceObject.id,
    url: url,
    title: title,
    author: author || null,
    artist: artist || author || null,
    description: description || null,
    genre: tags.length ? tags.join(" ") : null,
    status: BiliMangaShared.status(block),
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

function parseMangaList(sourceObject, html, pageNumber) {
  var results = [];
  var seen = {};
  var pattern = /<a\b[^>]*href=["']([^"']*\/detail\/(\d+)\.html[^"']*)["'][^>]*>[\s\S]*?<\/a>/gi;
  var match;
  while ((match = pattern.exec(String(html || ""))) !== null) {
    if (!/class=["'][^"']*\b(?:book-layout|module-slide-a)\b/i.test(match[0])) continue;
    var id = match[2];
    if (!id || seen[id]) continue;
    var url = BiliMangaShared.absolute(match[1], sourceObject.baseUrl);
    var book = mangaBook(sourceObject, id, match[0], url);
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
  book.genre = BiliMangaShared.tagTexts(html).join(" ") || book.genre;
  book.thumbnailUrl = BiliMangaShared.image(html, sourceObject.baseUrl) || book.thumbnailUrl;
  return book;
}

function mangaDetails(sourceObject, id, html, url) {
  var book = mangaBook(sourceObject, id, html, url);
  if (!book) return null;
  var content = /<content\b[^>]*>([\s\S]*?)<\/content>/i.exec(String(html || ""));
  var author = BiliMangaShared.classText(html, "authorname").replace(/^作者\s*[:：]?\s*/, "");
  var illustrator = BiliMangaShared.classText(html, "illname").replace(/^作者\s*[:：]?\s*/, "");
  book.author = author || book.author;
  book.artist = illustrator || book.artist;
  book.description = content ? BiliMangaShared.cleanContent(content[1]) : book.description;
  book.status = BiliMangaShared.status(html);
  book.genre = BiliMangaShared.tagTexts(html).join(" ") || book.genre;
  book.thumbnailUrl = BiliMangaShared.image(html, sourceObject.baseUrl) || book.thumbnailUrl;
  return book;
}

function novelId(value) {
  var match = /\/novel\/(\d+)(?:\.html|\/)/i.exec(String(value || ""));
  return match ? match[1] : (/^\d+$/.test(String(value || "").trim()) ? String(value).trim() : "");
}

function mangaId(value) {
  var match = /\/(?:detail|read)\/(\d+)(?:\.html|\/)/i.exec(String(value || ""));
  return match ? match[1] : (/^\d+$/.test(String(value || "").trim()) ? String(value).trim() : "");
}

function novelBookUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/novel/" + id + ".html";
}

function mangaBookUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/detail/" + id + ".html";
}

function novelCatalogUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/novel/" + id + "/catalog";
}

function mangaCatalogUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/read/" + id + "/catalog";
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

function predictedMangaChapterUrl(sourceObject, id, entries, index) {
  var before = entries[index - 1] && /\/read\/\d+\/(\d+)\.html/i.exec(entries[index - 1].url);
  var after = entries[index + 1] && /\/read\/\d+\/(\d+)\.html/i.exec(entries[index + 1].url);
  var chapter;
  if (before) chapter = parseInt(before[1], 10) + 1;
  else if (after) chapter = parseInt(after[1], 10) - 1;
  if (!isFinite(chapter) || chapter <= 0) return "";
  return sourceObject.baseUrl + "/read/" + id + "/" + chapter + ".html";
}

function parseMangaChapters(sourceObject, id, html) {
  var entries = [];
  var pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = pattern.exec(String(html || ""))) !== null) {
    if (!/class=["'][^"']*\bchapter-li-a\b[^"']*["']/i.test(match[0])) continue;
    var href = /javascript:/i.test(match[1]) ? match[1] : BiliMangaShared.absolute(match[1], sourceObject.baseUrl);
    entries.push({ url: href, name: BiliMangaShared.cleanText(match[2]) });
  }
  var result = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.url || !entry.name) continue;
    if (/javascript:/i.test(entry.url)) entry.url = predictedMangaChapterUrl(sourceObject, id, entries, i);
    if (!entry.url) continue;
    result.push({ sourceId: sourceObject.id, url: entry.url, name: entry.name, scanlator: null, dateUpload: chapterDate(html), chapterNumber: result.length + 1 });
  }
  // BiliManga also exposes chapters in reading order. Preserve the DOM order
  // so the reviewed v2 host does not invert the chapter list.
  return result;
}

var novelSortCodes = ["lastupdate", "postdate", "weekvisit", "monthvisit", "allvisit", "goodnum"];
var novelSortLabels = ["最新更新", "最新入庫", "週點擊", "月點擊", "總點擊", "收藏榜"];
var novelTagIds = ["0", "15", "61", "96", "18", "13", "14", "16", "17", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60"];
var novelTagLabels = ["全部", "奇幻", "冒險", "魔法", "戰鬥", "愛情", "校園", "青春", "科幻", "懸疑", "推理", "治癒", "日常", "搞笑", "後宮", "異世界", "轉生", "龍傲天", "黑暗", "大逃殺", "犯罪", "歷史", "武俠", "都市", "職場", "群像", "女性視角", "百合", "耽美", "輕文學", "音樂", "美食", "旅行", "病嬌", "青梅竹馬", "妹妹", "大小姐", "人外", "末日", "超自然", "遊戲", "異能", "戰爭", "經營", "歡樂", "溫馨", "蘿莉", "正太", "性轉", "偽娘", "獵奇", "神鬼", "偵探", "冒險譚", "校園戀愛", "戀愛喜劇", "日本輕小說", "電擊文庫", "角川文庫", "GA文庫", "MF文庫", "富士見文庫"];

var novelSource = {
  id: "zh.bilimanga.novel",
  name: "嗶哩輕小說（Linovelib）",
  lang: "zh",
  baseUrl: "https://tw.linovelib.com",
  // The public home page is large and injects Cloudflare's JavaScript detector. JavaFX WebKit
  // can remain in RUNNING state on that document even though the dedicated member page loads
  // immediately, so start the isolated browser at the smaller same-origin login endpoint.
  webChallengeUrl: "https://tw.linovelib.com/login.php",
  contentType: "novel",
  contentKinds: ["PLAIN_TEXT"],
  supportsLatest: true,
  supportsLogin: true,
  supportsFavorites: false,
  _lastLoginRequestAt: 0,
  headers: {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
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

  getPageList: function(chapter) {
    var input = chapter || {};
    var text = BiliMangaShared.novelText(this, input);
    if (!text) return [];
    return [{ index: 0, url: String(input.url || ""), imageUrl: null, text: text, content: text }];
  },

  chapterText: function(chapter) {
    return BiliMangaShared.novelText(this, chapter || {});
  },

  getFilterList: function() {
    return [
      { type: "select", name: "排序", values: novelSortLabels, state: 0 },
      { type: "select", name: "小說類型", values: novelTagLabels, state: 0 }
    ];
  }
};

var mangaThemeLabels = ["不限", "奇幻", "冒險", "異世界", "龍傲天", "魔法", "仙俠", "戰爭", "熱血", "戰鬥", "競技", "懸疑", "驚悚", "獵奇", "神鬼", "偵探", "校園", "日常", "JK", "JC", "青梅竹馬", "妹妹", "大小姐", "女兒", "愛情", "耽美", "百合", "NTR", "後宮", "職場", "經營", "犯罪", "旅行", "群像", "女性視角", "歷史", "武俠", "東方", "勵志", "宅系", "科幻", "機戰", "遊戲", "異能", "腦洞", "病嬌", "人外", "復仇", "鬥智", "惡役", "間諜", "治癒", "歡樂", "萌系", "末日", "大逃殺", "音樂", "美食", "性轉", "偽娘", "穿越", "童話", "轉生", "黑暗", "溫馨", "超自然", "青春"];
var mangaTypeLabels = ["全部", "奇幻冒險", "戰鬥熱血", "懸疑驚悚", "校園青春", "愛情浪漫", "職場都市", "歷史文化", "科幻未來", "奇異幻想", "治癒溫馨", "末日生存", "其他分類"];
var mangaRegionLabels = ["不限", "日本", "韓國", "港台", "歐美", "大陸"];
var mangaYearLabels = ["全部", "2026年", "2025年", "2024年", "2023年", "2022年", "2021年", "2020年", "2019年", "2018年", "2017年", "2016年", "2015年", "2014年", "2013年", "2012年", "2011年", "2010年", "00年代", "90年代", "80年代", "更早"];
var mangaSortLabels = ["最近更新", "月點擊", "周點擊", "月推薦", "周推薦", "月鮮花", "周鮮花", "字數", "收藏數", "最新入庫"];
var mangaAwardLabels = ["不限", "2027", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015", "2014", "2013", "2012", "2011", "2010", "2009", "2008", "2007", "2006"];
var mangaAnimeLabels = ["不限", "已動畫化", "未動畫化"];
var mangaNovelLabels = ["不限", "輕改漫畫", "普通漫畫"];
var mangaStatusLabels = ["不限", "連載", "完結"];
var mangaTimeLabels = ["不限", "三日內", "七日內", "半月內", "一月內"];
var mangaSortCodes = ["lastupdate", "monthvisit", "weekvisit", "monthvote", "weekvote", "monthflower", "weekflower", "words", "goodnum", "postdate"];
var mangaThemeCodes = mangaThemeLabels.map(function(_, index) { return String(index); });
var mangaTypeCodes = mangaTypeLabels.map(function(_, index) { return String(index); });
var mangaRegionCodes = ["0", "1", "2", "3", "4", "5"];
var mangaYearCodes = ["0", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015", "2014", "2013", "2012", "2011", "2010", "2000", "1990", "1980", "1970"];
var mangaAwardCodes = ["0", "2027", "2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019", "2018", "2017", "2016", "2015", "2014", "2013", "2012", "2011", "2010", "2009", "2008", "2007", "2006"];
var mangaAnimeCodes = ["0", "1", "2"];
var mangaNovelCodes = ["0", "1", "2"];
var mangaStatusCodes = ["0", "1", "2"];
var mangaTimeCodes = ["0", "1", "2", "3", "4"];

var mangaSource = {
  id: "zh.bilimanga.manga",
  name: "嗶哩漫畫（BiliManga）",
  lang: "zh",
  baseUrl: "https://www.bilimanga.net",
  // Cloudflare currently protects the member endpoint but leaves the public home page open.
  // Opening the home page cannot mint cf_clearance, so the host must start the isolated browser
  // at this same-origin URL.
  webChallengeUrl: "https://www.bilimanga.net/login.php",
  contentType: "manga",
  contentKinds: ["IMAGE_SEQUENCE"],
  supportsLatest: true,
  supportsLogin: true,
  supportsFavorites: false,
  _lastLoginRequestAt: 0,
  headers: {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh-CN;q=0.9,en;q=0.8",
    "Referer": "https://www.bilimanga.net",
    "Cookie": "night=1",
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
    return parseMangaList(this, BiliMangaShared.request(this, this.baseUrl + "/top/weekvisit/" + current + ".html", { "Cookie": "night=1" }, "漫畫排行榜需要登入才能載入。"), current);
  },

  getLatestUpdates: function(page) {
    var current = BiliMangaShared.pageNumber(page);
    return parseMangaList(this, BiliMangaShared.request(this, this.baseUrl + "/top/lastupdate/" + current + ".html", { "Cookie": "night=1" }, "漫畫更新列表需要登入才能載入。"), current);
  },

  getSearchManga: function(page, query, filters) {
    var current = BiliMangaShared.pageNumber(page);
    var keyword = String(query || "").trim();
    var url;
    if (keyword) {
      url = this.baseUrl + "/search/" + BiliMangaShared.encode(keyword) + "_" + current + ".html";
    } else {
      var theme = BiliMangaShared.filterState(filters, "作品主題");
      var type = BiliMangaShared.filterState(filters, "作品分類");
      var region = BiliMangaShared.filterState(filters, "作品地區");
      var year = BiliMangaShared.filterState(filters, "發表年代");
      var sort = BiliMangaShared.filterState(filters, "排序方式");
      var anime = BiliMangaShared.filterState(filters, "是否動畫");
      var novel = BiliMangaShared.filterState(filters, "是否輕改");
      var award = BiliMangaShared.filterState(filters, "這本漫畫真厲害");
      var status = BiliMangaShared.filterState(filters, "連載狀態");
      var time = BiliMangaShared.filterState(filters, "更新時間");
      url = this.baseUrl + "/filter/" +
        (mangaSortCodes[sort] || mangaSortCodes[0]) + "_" +
        (mangaThemeCodes[theme] || "0") + "_" +
        (mangaStatusCodes[status] || "0") + "_" +
        (mangaAnimeCodes[anime] || "0") + "_" +
        (mangaRegionCodes[region] || "0") + "_" +
        (mangaTypeCodes[type] || "0") + "_" +
        (mangaTimeCodes[time] || "0") + "_" +
        (mangaNovelCodes[novel] || "0") + "_" + current + "_0_" +
        (mangaYearCodes[year] || "0") + "_" +
        (mangaAwardCodes[award] || "0") + ".html";
    }
    var html = BiliMangaShared.request(this, url, { "Cookie": "night=1" }, keyword ? "漫畫搜尋需要登入才能載入。" : "漫畫分類需要登入才能載入。");
    if (/\/detail\/\d+\.html/i.test(url)) {
      var detailId = mangaId(url);
      var detail = mangaDetails(this, detailId, html, mangaBookUrl(this, detailId));
      return BiliMangaShared.result(detail ? [detail] : [], false);
    }
    return parseMangaList(this, html, current);
  },

  getMangaDetails: function(manga) {
    var input = manga || {};
    var id = mangaId(input.url || input.title);
    if (!id) return input;
    var url = mangaBookUrl(this, id);
    var details = mangaDetails(this, id, BiliMangaShared.request(this, url, { "Cookie": "night=1" }, "漫畫作品詳情需要登入才能載入。"), url);
    return details || input;
  },

  getChapterList: function(manga) {
    var id = mangaId(manga && manga.url);
    if (!id) return [];
    return parseMangaChapters(this, id, BiliMangaShared.request(this, mangaCatalogUrl(this, id), { "Cookie": "night=1" }, "漫畫章節列表需要登入才能載入。"));
  },

  getPageList: function(chapter) {
    return BiliMangaShared.imagePages(this, chapter || {});
  },

  getFilterList: function() {
    return [
      { type: "header", name: "篩選條件（搜尋關鍵字時無效）" },
      { type: "select", name: "作品主題", values: mangaThemeLabels, state: 0 },
      { type: "select", name: "作品分類", values: mangaTypeLabels, state: 0 },
      { type: "select", name: "作品地區", values: mangaRegionLabels, state: 0 },
      { type: "select", name: "發表年代", values: mangaYearLabels, state: 0 },
      { type: "select", name: "排序方式", values: mangaSortLabels, state: 0 },
      { type: "select", name: "是否動畫", values: mangaAnimeLabels, state: 0 },
      { type: "select", name: "是否輕改", values: mangaNovelLabels, state: 0 },
      { type: "select", name: "這本漫畫真厲害", values: mangaAwardLabels, state: 0 },
      { type: "select", name: "連載狀態", values: mangaStatusLabels, state: 0 },
      { type: "select", name: "更新時間", values: mangaTimeLabels, state: 0 }
    ];
  }
};

// Multi-source packages are selected by exact source ID.  The default keeps
// compatibility with older hosts that only understand a global `source`; v2
// hosts should select from `sources` using the requested source identifier.
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
