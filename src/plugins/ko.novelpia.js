/*
 * Shinsou extension content v2 executable artifact (Shinsou format).
 *
 * Plain-text novel source for novelpia.com (Korean web novels). The script exports the generic
 * Shinsou hooks (getPopularManga / getLatestUpdates / getSearchManga / getMangaDetails /
 * getChapterList / getChapterText / getFilterList / login); the site access lives in the
 * private `Novelpia` helper.
 */
var __shinsouExtensionV2 = {"contractVersion":2,"contentContract":"extension-content-v2","packageId":"ko.novelpia","contentType":"novel","contentKinds":["PLAIN_TEXT"],"systemEvents":{"protocol":"dev.shinsou.system","minVersion":1,"maxVersion":1,"required":[],"optional":[]},"requestedHostPermissions":[]};
// Novelpia（노벨피아）來源插件。
//
// 網站結構（2026-11 實測）：
//   作品頁        GET  /novel/{novelNo}
//   章節列表      POST /proc/episode_list   novel_no, sort=DOWN（第一話在前）, page（0 起算，每頁 20 話）
//   章節正文      POST /proc/viewer_data/{episodeNo} → {"s":[{"text":"..."}], ...}
//   搜尋          GET  /proc/novel?cmd=novel_search&search_val=...（JSON，每頁 30 部）
//   列表          GET  /plus/all/{date|view|vote}/{page}/?main_genre=N、/freestory/all/...（HTML，每頁 30 部）
//
// 免費章節不需登入即可閱讀。PLUS 章節需要已訂閱 PLUS 的帳號（未登入時正文回傳空白）；
// 19 禁作品需要通過成人驗證的帳號，這個來源不列出 19 禁作品。
var Novelpia = {
  id: "ko.novelpia",
  baseUrl: "https://novelpia.com",
  pageSize: 30,
  episodesPerPage: 20,
  episodePagesPerBatch: 40,
  sitePagesPerChapterPage: 5,

  headers: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept": "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6"
  },

  lists: [
    { title: "PLUS 最新更新", path: "/plus/all/date/" },
    { title: "PLUS 觀看數", path: "/plus/all/view/" },
    { title: "PLUS 推薦數", path: "/plus/all/vote/" },
    { title: "自由連載 最新更新", path: "/freestory/all/date/" },
    { title: "自由連載 觀看數", path: "/freestory/all/view/" },
    { title: "自由連載 推薦數", path: "/freestory/all/vote/" }
  ],

  genres: [
    { title: "全部類型", id: "" },
    { title: "奇幻（판타지）", id: "1" },
    { title: "武俠（무협）", id: "2" },
    { title: "現代（현대）", id: "3" },
    { title: "愛情（로맨스）", id: "6" },
    { title: "現代奇幻（현대판타지）", id: "12" },
    { title: "輕小說（라이트노벨）", id: "13" },
    { title: "恐怖（공포）", id: "14" },
    { title: "科幻（SF）", id: "9" },
    { title: "運動（스포츠）", id: "8" },
    { title: "架空歷史（대체역사）", id: "7" },
    { title: "其他（기타）", id: "10" }
  ],

  searchSorts: [
    { title: "最近更新", id: "last_viewdate" },
    { title: "觀看數", id: "count_view" },
    { title: "推薦數", id: "count_good" }
  ],

  // ---- catalogue ------------------------------------------------------------------------

  list: function(listIndex, genreIndex, page) {
    var entry = this.lists[listIndex] || this.lists[0];
    var genre = this.genres[genreIndex] || this.genres[0];
    var url = this.baseUrl + entry.path + page + "/?main_genre=" + genre.id;
    var html = this.get(url, this.baseUrl + "/");
    var books = this.parseCards(html);
    return { books: books.visible, hasNext: books.total >= this.pageSize };
  },

  // One card per work: the desktop block; the mobile copy that follows is ignored.
  parseCards: function(html) {
    var text = String(html || "");
    var visible = [];
    var total = 0;
    var pattern = /novelbox mobile_hidden novel_(\d+)/g;
    var starts = [];
    var match;
    while ((match = pattern.exec(text)) !== null) starts.push({ id: match[1], at: match.index });
    for (var i = 0; i < starts.length; i++) {
      var end = i + 1 < starts.length ? starts[i + 1].at : text.length;
      var block = text.substring(starts[i].at, end);
      var mobileAt = block.indexOf("mobile_show mobile_m_box");
      if (mobileAt > 0) block = block.substring(0, mobileAt);
      total++;
      if (/class="b_19\b/.test(block)) continue; // adult works are not offered by this source
      var title = this.firstText(block, /class="name_st"[^>]*>([\s\S]*?)<\/b>/i);
      if (!title) continue;
      var tags = [];
      var tagPattern = /class='hash_tag_off'[^>]*>#?([^<]+)</g;
      var tag;
      while ((tag = tagPattern.exec(block)) !== null) tags.push(this.cleanText(tag[1]));
      visible.push({
        url: this.novelUrl(starts[i].id),
        title: title,
        author: this.firstText(block, /onclick="location='\/user\/\d+';">([\s\S]*?)<\/b>/i),
        description: this.firstBlockText(block, /<span class="info_font ">([\s\S]*?)<\/span>/i),
        genre: tags.join(", "),
        status: /class="b_comp\b/.test(block) ? 2 : 1,
        thumbnailUrl: this.imageUrl(this.firstAttr(block, /<img\s+src\s*=\s*"([^"]+)"\s+class="cover_style/i))
      });
    }
    return { visible: visible, total: total };
  },

  search: function(keyword, sortIndex, page) {
    var sort = this.searchSorts[sortIndex] || this.searchSorts[0];
    var url = this.baseUrl + "/proc/novel?cmd=novel_search&search_type=all" +
      "&search_val=" + encodeURIComponent(keyword) +
      "&page=" + page + "&rows=" + this.pageSize +
      "&novel_type=&start_count_book=&end_count_book=&novel_age=&start_days=" +
      "&sort_col=" + sort.id +
      "&novel_genre=&block_out=0&block_stop=0&is_contest=0&is_complete=&is_challenge=0&list_display=list";
    var json = this.parseJson(this.get(url, this.baseUrl + "/search"));
    var list = json && json.list instanceof Array ? json.list : [];
    var books = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i] || {};
      if (!item.novel_no || Number(item.novel_age) === 19) continue;
      var genres = item.novel_genre_arr instanceof Array ? item.novel_genre_arr.join(", ") : "";
      books.push({
        url: this.novelUrl(item.novel_no),
        title: String(item.novel_name || ""),
        author: String(item.writer_nick || ""),
        description: String(item.novel_story || "").replace(/\r/g, ""),
        genre: genres,
        status: Number(item.is_complete) === 1 ? 2 : 1,
        thumbnailUrl: this.imageUrl(item.cover_url)
      });
    }
    var totalCount = json ? Number(json.total_cnt) || 0 : 0;
    return { books: books, hasNext: page * this.pageSize < totalCount };
  },

  // ---- one work -------------------------------------------------------------------------

  details: function(novelNo) {
    var url = this.novelUrl(novelNo);
    var html = this.get(url, this.baseUrl + "/");
    var title = this.firstAttr(html, /<meta\s+name="twitter:title"\s+content="([^"]*)"/i)
      .replace(/^.*?웹소설로 꿈꾸는 세상!\s*-\s*/, "");
    if (!title) title = this.firstText(html, /<title>([\s\S]*?)<\/title>/i).replace(/^.*?웹소설로 꿈꾸는 세상!\s*-\s*/, "");
    if (!title || html.indexOf("epnew-novel-info") < 0) throw new Error("找不到這部作品，或 Novelpia 的頁面格式已變更。");
    var tags = [];
    var seen = {};
    var tagPattern = /class="tag"[^>]*>#?([^<]+)</g;
    var tag;
    while ((tag = tagPattern.exec(html)) !== null) {
      var name = this.cleanText(tag[1]);
      if (name && !seen[name]) { seen[name] = true; tags.push(name); }
    }
    var cover = this.firstAttr(html, /class="epnew-cover-box">[\s\S]{0,300}?<img[^>]*\bsrc="([^"]+)"/i);
    if (!cover || /adult_cover_img|readycover/.test(cover)) {
      cover = this.firstAttr(html, /<meta\s+name="twitter:image"\s+content="([^"]*)"/i);
    }
    return {
      adult: /class="in-badge">[\s\S]{0,1500}?class="b_19\b/.test(html),
      url: url,
      title: this.cleanText(title),
      author: this.firstText(html, /<a\s+class="writer-name"[^>]*>([\s\S]*?)<\/a>/i),
      description: this.firstBlockText(html, /<div class="synopsis">([\s\S]*?)<\/div>/i),
      genre: tags.join(", "),
      status: /class="in-badge">[\s\S]{0,1500}?class="b_comp\b/.test(html) ? 2 : 1,
      thumbnailUrl: this.imageUrl(cover)
    };
  },

  chapters: function(novelNo) {
    var first = this.episodePage(novelNo, 0);
    var lastPage = this.lastEpisodePage(first, novelNo);
    var pages = [first];
    if (lastPage > 0) pages = pages.concat(this.episodePages(novelNo, 1, lastPage));
    var chapters = [];
    var seen = {};
    for (var i = 0; i < pages.length; i++) {
      var rows = this.parseEpisodes(pages[i]);
      for (var j = 0; j < rows.length; j++) {
        if (seen[rows[j].episodeNo]) continue;
        seen[rows[j].episodeNo] = true;
        chapters.push(rows[j]);
      }
    }
    return chapters;
  },

  // One page of the list as the app asks for it: five of the site's pages, 100 episodes. A work
  // opened while browsing shows these at once; the rest is fetched only when it is asked for.
  chapterPage: function(novelNo, page) {
    var from = page * this.sitePagesPerChapterPage;
    var first = this.episodePage(novelNo, from);
    var lastPage = this.lastEpisodePage(first, novelNo);
    // Past the end the site repeats its last page: that is no page of ours.
    if (from > lastPage) return { chapters: [], hasNext: false, offset: from * this.episodesPerPage };
    var to = Math.min(lastPage, from + this.sitePagesPerChapterPage - 1);
    var pages = [first];
    if (to > from) pages = pages.concat(this.episodePages(novelNo, from + 1, to));
    var chapters = [];
    var seen = {};
    for (var i = 0; i < pages.length; i++) {
      var rows = this.parseEpisodes(pages[i]);
      for (var j = 0; j < rows.length; j++) {
        if (seen[rows[j].episodeNo]) continue;
        seen[rows[j].episodeNo] = true;
        chapters.push(rows[j]);
      }
    }
    return { chapters: chapters, hasNext: chapters.length > 0 && lastPage > to, offset: from * this.episodesPerPage };
  },

  episodeBody: function(novelNo, page) {
    return "novel_no=" + encodeURIComponent(novelNo) + "&sort=DOWN&page=" + page;
  },

  episodePage: function(novelNo, page) {
    return this.post(this.baseUrl + "/proc/episode_list", this.episodeBody(novelNo, page), this.novelUrl(novelNo));
  },

  // The remaining pages in one batch where the app offers it: a long serial has hundreds.
  episodePages: function(novelNo, from, to) {
    var results = [];
    var headers = this.formHeaders(this.novelUrl(novelNo));
    var page = from;
    while (page <= to) {
      var urls = [];
      var bodies = [];
      // A page is about 72 KB and a batch may return 4 MiB in all: more than this many pages
      // and the whole batch is refused, leaving every page to be fetched one by one.
      for (var k = 0; k < this.episodePagesPerBatch && page <= to; k++, page++) {
        urls.push(this.baseUrl + "/proc/episode_list");
        bodies.push(this.episodeBody(novelNo, page));
      }
      var batch = null;
      if (typeof bridge.httpPostBatch === "function") {
        try {
          var parsed = JSON.parse(bridge.httpPostBatch(urls, bodies, headers) || "[]");
          if (parsed instanceof Array && parsed.length === urls.length) batch = parsed;
        } catch (ignored) {}
      }
      for (var i = 0; i < urls.length; i++) {
        var html = batch ? batch[i] : null;
        if (html && typeof html === "object") html = html.body;
        // The batch call reports no status: a page that is not an episode table is asked for again, checked.
        if (!html || typeof html !== "string" || html.indexOf('id="episode_table"') < 0) {
          html = this.post(urls[i], bodies[i], this.novelUrl(novelNo));
        }
        results.push(html);
      }
    }
    return results;
  },

  lastEpisodePage: function(html, novelNo) {
    var pattern = new RegExp("novel_page_" + novelNo + "'\\] = '(\\d+)'", "g");
    var last = 0;
    var match;
    while ((match = pattern.exec(String(html || ""))) !== null) last = Math.max(last, parseInt(match[1], 10) || 0);
    return Math.min(last, 1000);
  },

  parseEpisodes: function(html) {
    var rows = String(html || "").split(/<tr class="ep_style5"/).slice(1);
    var episodes = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var no = /data-episode-no="(\d+)"/.exec(row);
      if (!no) continue;
      var title = this.firstText(row, /id="bookmark_\d+"><\/i>([\s\S]*?)<\/b>/i);
      var number = /EP\.(\d+)/.exec(row);
      var kind = /class="b_plus\b/.test(row) ? "PLUS" : (/class="b_free\b/.test(row) ? "免費" : null);
      if (/class="b_19\b/.test(row)) kind = kind ? kind + "・19" : "19";
      episodes.push({
        episodeNo: no[1],
        url: this.baseUrl + "/viewer/" + no[1],
        // The reader lists chapters by name only, so what needs a subscription says so there.
        name: (/class="b_plus\b/.test(row) ? "[PLUS] " : "") + (title || ("EP." + (number ? number[1] : no[1]))),
        kind: kind,
        number: number ? parseInt(number[1], 10) : -1,
        date: this.episodeDate(row)
      });
    }
    return episodes;
  },

  // "20.08.13" (yy.mm.dd, Korean time); recent episodes show a relative time, left unknown.
  episodeDate: function(row) {
    var match = /color: #333333;'>\s*(\d{2})\.(\d{2})\.(\d{2})\s*</.exec(row);
    if (!match) return 0;
    var time = Date.UTC(2000 + parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10)) - 9 * 3600 * 1000;
    return isFinite(time) ? time : 0;
  },

  chapterText: function(episodeNo) {
    var url = this.baseUrl + "/proc/viewer_data/" + episodeNo;
    var raw = this.post(url, "", this.baseUrl + "/viewer/" + episodeNo);
    var text = String(raw || "").trim();
    // Failures are thrown, never returned: returned text would be stored as the chapter.
    if (!text) {
      throw new Error("這一話需要有閱讀權限的 Novelpia 帳號（PLUS 訂閱或已購買）。請在來源設定登入，或用「在瀏覽器中驗證」登入後再試。");
    }
    var json = this.parseJson(text);
    if (!json || !(json.s instanceof Array)) {
      if (/alert_modal/.test(text)) {
        var reason = this.firstText(text, /<p class="mg-b-5">([\s\S]*?)<\/p>/i);
        throw new Error("無法載入本話：" + (reason || "需要登入或成人驗證"));
      }
      throw new Error("無法載入本話：來源回應無法解析，請稍後再試。");
    }
    var parts = [];
    for (var i = 0; i < json.s.length; i++) parts.push(String((json.s[i] && json.s[i].text) || ""));
    var body = this.htmlToText(parts.join(""));
    if (!body) throw new Error("無法載入本話：來源沒有回傳正文。");
    return body;
  },

  htmlToText: function(html) {
    var value = String(html || "")
      .replace(/<div class='cover-wrapper'>[\s\S]*?<\/div>\s*<\/div>/gi, "")
      .replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, "")
      .replace(/<img\b[^>]*>/gi, "")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    value = this.decodeEntities(value).replace(/\r/g, "");
    return value.split("\n").map(function(line) {
      return line.replace(/[ \t\u00a0\u200b]+/g, " ").trim();
    }).filter(function(line) { return line; }).join("\n\n").trim();
  },

  // ---- login ----------------------------------------------------------------------------

  // The site's own e-mail login form. A refusal comes back as an alert dialog.
  login: function(email, password) {
    var body = "redirectrurl=&email=" + encodeURIComponent(email) + "&wd=" + encodeURIComponent(password);
    var html;
    try {
      html = String(this.post(this.baseUrl + "/proc/login", body, this.baseUrl + "/") || "");
    } catch (error) {
      this.log("Login request failed: " + error);
      return false;
    }
    if (/alert_modal/.test(html)) {
      this.log("Login refused: " + this.firstText(html, /<p class="mg-b-5">([\s\S]*?)<\/p>/i));
      return false;
    }
    if (/captcha/i.test(html)) {
      this.log("Login needs a captcha; sign in on the website first and try again later.");
      return false;
    }
    return this.signedIn();
  },

  // A visitor's pages carry the e-mail login form; a signed-in member's do not. Anything that
  // is not clearly a Novelpia page without that form counts as not signed in.
  signedIn: function() {
    var home;
    try {
      home = this.get(this.baseUrl + "/", this.baseUrl + "/");
    } catch (error) {
      this.log("Could not confirm the login: " + error);
      return false;
    }
    if (home.indexOf("노벨피아") < 0 || home.indexOf("/proc/logout") < 0) return false;
    return !/id="login_box"/.test(home);
  },

  // ---- plumbing -------------------------------------------------------------------------

  novelUrl: function(novelNo) {
    return this.baseUrl + "/novel/" + novelNo;
  },

  novelNo: function(value) {
    var match = /\/novel\/(\d+)/.exec(String(value || ""));
    if (match) return match[1];
    var plain = String(value || "").trim();
    return /^\d+$/.test(plain) ? plain : "";
  },

  episodeNo: function(value) {
    var match = /\/viewer\/(\d+)/.exec(String(value || ""));
    return match ? match[1] : "";
  },

  imageUrl: function(value) {
    var url = String(value || "").trim();
    if (!url) return "";
    if (url.indexOf("//") === 0) return "https:" + url;
    if (url.charAt(0) === "/") return "https://images.novelpia.com" + url;
    return /^https:\/\//i.test(url) ? url : "";
  },

  // Transport, HTTP and challenge failures are thrown: an error page must never be parsed as
  // a catalogue, a work or a chapter.
  checked: function(method, url, response) {
    var status = response && typeof response === "object" ? Number(response.status) : NaN;
    var body = response && typeof response === "object" ? response.body : null;
    this.log(method + " " + url + " -> " + status + " " + (typeof body === "string" ? body.length : 0));
    if (!isFinite(status) || typeof body !== "string") throw new Error("Novelpia 連線失敗，請稍後再試。");
    if (status < 200 || status > 299) throw new Error("Novelpia 回應 HTTP " + status + "，請稍後再試。");
    if (this.isChallenge(body)) throw new Error("Novelpia 暫時要求瀏覽器驗證，請稍後再試。");
    return body;
  },

  isChallenge: function(body) {
    return /cf_chl_|challenge-form|Just a moment|Checking your browser|Attention Required/i.test(String(body || "").substring(0, 4000));
  },

  get: function(url, referer) {
    var headers = this.mergeHeaders({ "Referer": referer || this.baseUrl + "/" });
    return this.checked("GET", url, bridge.httpGetResponse(url, headers));
  },

  formHeaders: function(referer) {
    return this.mergeHeaders({
      "Referer": referer || this.baseUrl + "/",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    });
  },

  post: function(url, body, referer) {
    return this.checked("POST", url, bridge.httpPostResponse(url, body, this.formHeaders(referer)));
  },

  parseJson: function(text) {
    try {
      var value = JSON.parse(String(text || ""));
      return value && typeof value === "object" ? value : null;
    } catch (ignored) {
      return null;
    }
  },

  firstText: function(html, pattern) {
    var match = pattern.exec(html || "");
    return match ? this.cleanText(match[1]) : "";
  },

  // Like firstText, but keeps the line breaks of a synopsis.
  firstBlockText: function(html, pattern) {
    var match = pattern.exec(html || "");
    if (!match) return "";
    return this.decodeEntities(match[1].replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, ""))
      .replace(/\r/g, "")
      .split("\n").map(function(line) { return line.trim(); }).join("\n")
      .replace(/\n{3,}/g, "\n\n").trim();
  },

  firstAttr: function(html, pattern) {
    var match = pattern.exec(html || "");
    return match ? this.decodeEntities(match[1]) : "";
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
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, function(_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
      .replace(/&#(\d+);/g, function(_, number) { return String.fromCharCode(parseInt(number, 10)); })
      .replace(/&amp;/gi, "&");
  },

  mergeHeaders: function(headers) {
    var merged = {};
    var key;
    for (key in this.headers) merged[key] = this.headers[key];
    for (key in (headers || {})) merged[key] = headers[key];
    return merged;
  },

  log: function(message) {
    try {
      if (typeof bridge === "undefined" || !bridge || typeof bridge.log !== "function") return;
      bridge.log(String(message == null ? "" : message));
    } catch (ignored) {}
  }
};

function novelpiaPageNumber(value) {
  var number = Number(value);
  return isFinite(number) && number >= 0 ? Math.floor(number) + 1 : 1;
}

function novelpiaBook(value) {
  if (!value || typeof value !== "object" || !value.url) return null;
  return {
    url: String(value.url),
    title: String(value.title || value.url),
    author: value.author || null,
    artist: null,
    description: value.description || null,
    genre: value.genre || null,
    status: typeof value.status === "number" && isFinite(value.status) ? value.status : 0,
    thumbnailUrl: value.thumbnailUrl || null,
    initialized: true
  };
}

function novelpiaPage(result) {
  var list = result && result.books instanceof Array ? result.books : [];
  var mangas = [];
  for (var i = 0; i < list.length; i++) {
    var mapped = novelpiaBook(list[i]);
    if (mapped) mangas.push(mapped);
  }
  return { mangas: mangas, hasNextPage: !!(result && result.hasNext) };
}

// The chosen index of the select filter called `name`; 0 when it is absent.
function novelpiaFilter(filters, name) {
  if (!Array.isArray(filters)) return 0;
  for (var i = 0; i < filters.length; i++) {
    var filter = filters[i] || {};
    if (filter.name === name && Array.isArray(filter.values)) {
      var state = Number(filter.state);
      return isFinite(state) && state >= 0 ? Math.floor(state) : 0;
    }
    if (Array.isArray(filter.filters)) {
      var nested = novelpiaFilter(filter.filters, name);
      if (nested > 0) return nested;
    }
  }
  return 0;
}

function novelpiaTitles(entries) {
  var titles = [];
  for (var i = 0; i < entries.length; i++) titles.push(entries[i].title);
  return titles;
}

function novelpiaChapters(values, offset) {
  var chapters = [];
  for (var i = 0; i < values.length; i++) {
    chapters.push({
      url: values[i].url,
      name: values[i].name,
      scanlator: values[i].kind,
      dateUpload: values[i].date,
      chapterNumber: values[i].number > 0 ? values[i].number : offset + i + 1
    });
  }
  return chapters;
}

var source = {
  id: "ko.novelpia",
  name: "Novelpia（노벨피아）",
  lang: "ko",
  baseUrl: "https://novelpia.com",
  // Signing in through the app's browser (source settings) brings the site's session cookies
  // over; that also covers accounts the e-mail form here cannot sign in.
  webChallengeUrl: "https://novelpia.com/",
  supportsLatest: true,
  supportsLogin: true,
  supportsFavorites: false,
  headers: Novelpia.headers,

  getPopularManga: function(page) {
    return novelpiaPage(Novelpia.list(1, 0, novelpiaPageNumber(page)));
  },

  getLatestUpdates: function(page) {
    return novelpiaPage(Novelpia.list(0, 0, novelpiaPageNumber(page)));
  },

  getSearchManga: function(page, query, filters) {
    var current = novelpiaPageNumber(page);
    var keyword = String(query || "").trim();
    if (!keyword) {
      return novelpiaPage(Novelpia.list(novelpiaFilter(filters, "列表"), novelpiaFilter(filters, "類型"), current));
    }
    // A work number or a pasted work address goes straight to that work.
    var direct = /^\d+$/.test(keyword) || /novelpia\.com\/novel\/\d+/.test(keyword) ? Novelpia.novelNo(keyword) : "";
    if (direct) {
      var details = Novelpia.details(direct);
      // Adult works are not offered by this source, by number or address either.
      return novelpiaPage({ books: details && !details.adult ? [details] : [], hasNext: false });
    }
    return novelpiaPage(Novelpia.search(keyword, novelpiaFilter(filters, "搜尋排序"), current));
  },

  getMangaDetails: function(manga) {
    var input = manga || {};
    var novelNo = Novelpia.novelNo(input.url);
    if (!novelNo) throw new Error("不是 Novelpia 的作品網址。");
    return novelpiaBook(Novelpia.details(novelNo));
  },

  getChapterList: function(manga) {
    var novelNo = Novelpia.novelNo((manga || {}).url);
    if (!novelNo) return [];
    return novelpiaChapters(Novelpia.chapters(novelNo), 0);
  },

  // The app asks for the list page by page (0-based) when this hook exists.
  getChapterListPage: function(manga, page) {
    var novelNo = Novelpia.novelNo((manga || {}).url);
    if (!novelNo) return { chapters: [], hasNextPage: false };
    var number = Number(page);
    var result = Novelpia.chapterPage(novelNo, isFinite(number) && number > 0 ? Math.floor(number) : 0);
    return { chapters: novelpiaChapters(result.chapters, result.offset), hasNextPage: result.hasNext };
  },

  getChapterText: function(chapter) {
    var episodeNo = Novelpia.episodeNo((chapter || {}).url);
    if (!episodeNo) return "";
    return String(Novelpia.chapterText(episodeNo) || "");
  },

  getFilterList: function() {
    return [
      { type: "header", name: "未輸入關鍵字時顯示所選列表" },
      { type: "select", name: "列表", values: novelpiaTitles(Novelpia.lists), state: 0 },
      { type: "select", name: "類型", values: novelpiaTitles(Novelpia.genres), state: 0 },
      { type: "separator" },
      { type: "select", name: "搜尋排序", values: novelpiaTitles(Novelpia.searchSorts), state: 0 }
    ];
  },

  // Started by the app with the saved account: the e-mail address and password of a Novelpia account.
  login: function(username, password) {
    return Novelpia.login(String(username || ""), String(password || ""));
  },

  logout: function() {
    if (typeof bridge.clearCookies === "function") bridge.clearCookies();
  }
};

// Expose only bounded, host-audited v2 metadata; executable calls still cross the legacy adapter.
if (typeof source === "object" && source) {
    source.v2 = __shinsouExtensionV2;
}
