/*
 * BiliManga / 嗶哩漫畫 Shinsou content v2 package.
 *
 * This package intentionally uses the generic legacy Shinsou manga contract,
 * matching Bika's host path for catalogue, details, chapters and image pages.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"zh.bilimanga.manga","contentType":"manga","contentKinds":["IMAGE_SEQUENCE"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":["command.auth.login.request"],"optional":[]},"requestedHostPermissions":["REQUEST_LOGIN_UI"]};

var BiliManga = {
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
        try { bridge.log("zh.bilimanga.manga request failed: " + error); } catch (ignored) {}
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
        try { bridge.log("zh.bilimanga.manga POST failed: " + error); } catch (ignored) {}
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
      if (candidate && candidate.length <= 300 && this.isAuthenticationFailureMessage(candidate)) return candidate;
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
    var existingSession = this.request(sourceObject, sourceObject.baseUrl + "/", {
      "Referer": loginUrl
    }, null);
    if (existingSession && !this.isChallenge(existingSession) && this.isLoggedIn(existingSession)) {
      this.resetLoginPrompt(sourceObject);
      return { loggedIn: true };
    }

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
    if (this.isLoginPage(response)) return { loggedIn: false, errorMessage: responseMessage || fallback };

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
  }
};

function mangaBook(sourceObject, block, url) {
  var tags = BiliManga.tagTexts(block);
  var title = BiliManga.firstText(block, [
    /<h1\b[^>]*class=["'][^"']*\bbook-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<h[2-4]\b[^>]*class=["'][^"']*\bbook-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h[2-4]>/i,
    /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i,
    /<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i
  ]);
  if (!title) return null;
  var author = BiliManga.classText(block, "authorname").replace(/^作者\s*[:：]?\s*/, "");
  if (!author) author = BiliManga.classText(block, "book-author").replace(/^作者\s*[:：]?\s*/, "");
  var artist = BiliManga.classText(block, "illname").replace(/^作者\s*[:：]?\s*/, "");
  var description = BiliManga.classText(block, "book-desc") || BiliManga.classText(block, "book-intro");
  return {
    sourceId: sourceObject.id,
    url: url,
    title: title,
    author: author || null,
    artist: artist || author || null,
    description: description || null,
    genre: tags.length ? tags.join(" ") : null,
    status: BiliManga.status(block),
    thumbnailUrl: BiliManga.image(block, sourceObject.baseUrl) || null,
    initialized: true
  };
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
    var url = BiliManga.absolute(match[1], sourceObject.baseUrl);
    var book = mangaBook(sourceObject, match[0], url);
    if (book) {
      results.push(book);
      seen[id] = true;
    }
  }
  return BiliManga.result(results, BiliManga.hasNextPage(html, pageNumber, results.length));
}

function mangaDetails(sourceObject, html, url) {
  var book = mangaBook(sourceObject, html, url);
  if (!book) return null;
  var content = /<content\b[^>]*>([\s\S]*?)<\/content>/i.exec(String(html || ""));
  var author = BiliManga.classText(html, "authorname").replace(/^作者\s*[:：]?\s*/, "");
  var illustrator = BiliManga.classText(html, "illname").replace(/^作者\s*[:：]?\s*/, "");
  book.author = author || book.author;
  book.artist = illustrator || book.artist;
  book.description = content ? BiliManga.cleanContent(content[1]) : book.description;
  book.status = BiliManga.status(html);
  book.genre = BiliManga.tagTexts(html).join(" ") || book.genre;
  book.thumbnailUrl = BiliManga.image(html, sourceObject.baseUrl) || book.thumbnailUrl;
  return book;
}

function mangaId(value) {
  var match = /\/(?:detail|read)\/(\d+)(?:\.html|\/)/i.exec(String(value || ""));
  return match ? match[1] : (/^\d+$/.test(String(value || "").trim()) ? String(value).trim() : "");
}

function mangaBookUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/detail/" + id + ".html";
}

function mangaCatalogUrl(sourceObject, id) {
  return sourceObject.baseUrl + "/read/" + id + "/catalog";
}

function chapterDate(html) {
  var match = /(20\d{2})[-年](\d{1,2})[-月](\d{1,2})/.exec(String(html || ""));
  if (!match) return 0;
  return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)).getTime();
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
    var href = /javascript:/i.test(match[1]) ? match[1] : BiliManga.absolute(match[1], sourceObject.baseUrl);
    entries.push({ url: href, name: BiliManga.cleanText(match[2]) });
  }
  var result = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry.url || !entry.name) continue;
    if (/javascript:/i.test(entry.url)) entry.url = predictedMangaChapterUrl(sourceObject, id, entries, i);
    if (!entry.url) continue;
    result.push({
      sourceId: sourceObject.id,
      url: entry.url,
      name: entry.name,
      scanlator: null,
      dateUpload: chapterDate(html),
      chapterNumber: result.length + 1
    });
  }
  return result;
}

function imagePages(sourceObject, chapter) {
  var url = BiliManga.absolute(chapter && chapter.url, sourceObject.baseUrl);
  var html = BiliManga.request(sourceObject, url, { "Cookie": "night=1" }, "漫畫章節內容需要登入才能閱讀。");
  if (!html) return [];
  var container = /<(?:div|section)\b[^>]*class=["'][^"']*\bimagecontent\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/i.exec(html);
  var block = container ? container[1] : "";
  if (!block) {
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
    var imageUrl = BiliManga.absolute(match[1], url);
    if (!imageUrl || seen[imageUrl] || /book-cover-no\.svg|transparent\.gif|spacer\.(?:gif|png)/i.test(imageUrl)) continue;
    seen[imageUrl] = true;
    // Referer is carried as bounded legacy page metadata. User-Agent is supplied by the host so
    // each device uses the same identity as its own browser/Web Challenge session.
    var requestUrl = imageUrl + "#Referer=" + BiliManga.encode(sourceObject.baseUrl);
    pages.push({ index: pages.length, url: requestUrl, imageUrl: requestUrl });
  }
  return pages;
}

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

var source = {
  id: "7289707411592168382",
  name: "嗶哩漫畫（BiliManga）",
  lang: "zh",
  baseUrl: "https://www.bilimanga.net",
  webChallengeUrl: "https://www.bilimanga.net/login.php",
  supportsLatest: true,
  supportsLogin: true,
  supportsFavorites: false,
  _lastLoginRequestAt: 0,
  headers: {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh-CN;q=0.9,en;q=0.8",
    "Referer": "https://www.bilimanga.net",
    "Cookie": "night=1",
    "Cache-Control": "no-cache"
  },

  login: function(username, password) {
    return BiliManga.login(this, username, password);
  },

  logout: function() {
    BiliManga.logout(this);
  },

  getPopularManga: function(page) {
    var current = BiliManga.pageNumber(page);
    return parseMangaList(this, BiliManga.request(this, this.baseUrl + "/top/weekvisit/" + current + ".html", { "Cookie": "night=1" }, "漫畫排行榜需要登入才能載入。"), current);
  },

  getLatestUpdates: function(page) {
    var current = BiliManga.pageNumber(page);
    return parseMangaList(this, BiliManga.request(this, this.baseUrl + "/top/lastupdate/" + current + ".html", { "Cookie": "night=1" }, "漫畫更新列表需要登入才能載入。"), current);
  },

  getSearchManga: function(page, query, filters) {
    var current = BiliManga.pageNumber(page);
    var keyword = String(query || "").trim();
    var url;
    if (keyword) {
      url = this.baseUrl + "/search/" + BiliManga.encode(keyword) + "_" + current + ".html";
    } else {
      var theme = BiliManga.filterState(filters, "作品主題");
      var type = BiliManga.filterState(filters, "作品分類");
      var region = BiliManga.filterState(filters, "作品地區");
      var year = BiliManga.filterState(filters, "發表年代");
      var sort = BiliManga.filterState(filters, "排序方式");
      var anime = BiliManga.filterState(filters, "是否動畫");
      var novel = BiliManga.filterState(filters, "是否輕改");
      var award = BiliManga.filterState(filters, "這本漫畫真厲害");
      var status = BiliManga.filterState(filters, "連載狀態");
      var time = BiliManga.filterState(filters, "更新時間");
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
    var html = BiliManga.request(this, url, { "Cookie": "night=1" }, keyword ? "漫畫搜尋需要登入才能載入。" : "漫畫分類需要登入才能載入。");
    if (/\/detail\/\d+\.html/i.test(url)) {
      var detailId = mangaId(url);
      var detail = mangaDetails(this, html, mangaBookUrl(this, detailId));
      return BiliManga.result(detail ? [detail] : [], false);
    }
    return parseMangaList(this, html, current);
  },

  getMangaDetails: function(manga) {
    var input = manga || {};
    var id = mangaId(input.url || input.title);
    if (!id) return input;
    var url = mangaBookUrl(this, id);
    var details = mangaDetails(this, BiliManga.request(this, url, { "Cookie": "night=1" }, "漫畫作品詳情需要登入才能載入。"), url);
    return details || input;
  },

  getChapterList: function(manga) {
    var id = mangaId(manga && manga.url);
    if (!id) return [];
    return parseMangaChapters(this, id, BiliManga.request(this, mangaCatalogUrl(this, id), { "Cookie": "night=1" }, "漫畫章節列表需要登入才能載入。"));
  },

  getPageList: function(chapter) {
    return imagePages(this, chapter || {});
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

source.v2 = __shinsouExtensionV2;
