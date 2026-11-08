"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scriptPath = path.join(__dirname, "..", "src", "plugins", "zh.wenku8.js");
const scriptText = fs.readFileSync(scriptPath, "utf8");

function load(bridge) {
  const context = { console, Date, bridge };
  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: "plugins/zh.wenku8.js" });
  return context.source;
}

const BASE = "https://www.wenku8.net";
const listHtml = [
  '<div><a href="/book/11.htm" title="第一本書">第一本書</a> 小说作者：作者甲<br>',
  '<img src="https://img.wenku8.com/image/0/11/11s.jpg"></div>',
  '<div><a href="/book/22.htm" title="第二本書">第二本書</a> 小说作者：作者乙</div>',
].join("\n");
const infoHtml = [
  "<html><head><title>測試小說 - 輕小說文庫</title></head><body>",
  "小说作者：測試作者<br>",
  '内容简介：<span class="hottext">一段簡介</span>',
  '<img src="https://img.wenku8.net/image/0/33/33s.jpg">',
  "</body></html>",
].join("\n");
const readerHtml = [
  '<table><tr><td class="vcss" vid="1">第一卷</td></tr>',
  '<tr><td class="ccss"><a href="/modules/article/reader.php?aid=33&cid=701">序章</a></td>',
  '<td class="ccss"><a href="/novel/0/33/702.htm">第一章</a></td></tr></table>',
].join("\n");
const chapterHtml = '<html><body><div id="content">甲<br>乙<ul id="contentdp">x</ul></div><div id="foottext">foot</div></body></html>';
const bookcaseHtml = [
  '<select name="classlist"><option value="">全部</option></select>',
  '<input type="checkbox" name="checkid[]" value="1"><a href="/modules/article/readbookcase.php?aid=44&bid=9">書架書</a> 作者：<a>某人</a>',
].join("\n");
const loginPage = '<html><head><title>用户登录</title></head><body><form action="/login.php?do=submit"><input name="username"><input name="password"></form></body></html>';
const challengePage = "<html><head><title>Just a moment...</title></head><body>challenge-form</body></html>";

function makeBridge(routes) {
  const calls = [];
  const bridge = {
    calls,
    log() {},
    requestLogin(reason) { calls.push(["requestLogin", reason]); return true; },
    httpGetWithHeaders(url) {
      calls.push(["get", url]);
      for (const [needle, body] of routes) if (url.includes(needle)) return typeof body === "function" ? body(url) : body;
      return "";
    },
    httpPost(url, body) {
      calls.push(["post", url, body]);
      for (const [needle, response] of routes.post || []) if (url.includes(needle)) return response;
      return "";
    },
  };
  return bridge;
}

const getUrls = (bridge) => bridge.calls.filter((c) => c[0] === "get").map((c) => c[1]);

// Metadata and exported hook surface.
{
  const source = load({});
  assert.strictEqual(source.baseUrl, BASE);
  assert.strictEqual(source.webChallengeUrl, BASE);
  assert.strictEqual(source.supportsLogin, true);
  assert.strictEqual(source.supportsLatest, true);
  assert.strictEqual(source.supportsFavorites, true);
  assert.strictEqual(typeof source.headers["User-Agent"], "string");
  for (const hook of ["getPopularManga", "getLatestUpdates", "getSearchManga", "getMangaDetails", "getChapterList", "getChapterText", "getFilterList", "getFavoriteManga", "setFavorite", "login", "logout"]) {
    assert.strictEqual(typeof source[hook], "function", hook);
  }
  for (const legacy of ["search", "latest", "browse", "browseOptions", "chapters", "chapterText", "favorite", "bookFromAid", "aidFromText", "getPageList"]) {
    assert.strictEqual(source[legacy], undefined, `ShuYue hook ${legacy} must not be exported`);
  }
  assert.ok(!/__shinsou_shuyue_/.test(scriptText));
  assert.ok(/var __shinsouExtensionV2 = (\{[^\n]+\});/.test(scriptText));
}

// Popular / latest use 0-based pages mapped to the site's 1-based pages.
{
  const bridge = makeBridge([["toplist.php", listHtml]]);
  const source = load(bridge);
  const popular = source.getPopularManga(0);
  assert.strictEqual(popular.mangas.length, 2);
  assert.strictEqual(popular.hasNextPage, true);
  assert.strictEqual(popular.mangas[0].url, BASE + "/book/11.htm");
  assert.strictEqual(popular.mangas[0].title, "第一本書");
  assert.strictEqual(popular.mangas[0].author, "作者甲");
  assert.strictEqual(popular.mangas[0].thumbnailUrl, "https://img.wenku8.com/image/0/11/11s.jpg");
  assert.strictEqual(popular.mangas[1].thumbnailUrl, "https://img.wenku8.com/image/0/22/22s.jpg");
  source.getLatestUpdates(2);
  const urls = getUrls(bridge);
  assert.ok(/toplist\.php\?sort=lastupdate&page=1&/.test(urls[0]), urls[0]);
  assert.ok(/toplist\.php\?sort=lastupdate&page=3&/.test(urls[1]), urls[1]);
}

// Search: keyword, selected category with empty query, direct id.
{
  const bridge = makeBridge([["search.php", listHtml], ["articlelist.php", listHtml], ["articleinfo.php", infoHtml]]);
  const source = load(bridge);
  const filters = source.getFilterList();
  assert.strictEqual(filters.length, 1);
  assert.strictEqual(filters[0].type, "select");
  assert.strictEqual(filters[0].state, 0);
  assert.strictEqual(filters[0].values[0], "搜尋");
  assert.ok(filters[0].values.indexOf("完結作品") > 0);
  assert.ok(filters[0].values.indexOf("我的書架") < 0, "bookcase is exposed through getFavoriteManga");

  const found = source.getSearchManga(0, "魔法", filters);
  assert.strictEqual(found.mangas.length, 2);
  assert.ok(/search\.php\?searchtype=articlename&searchkey=.+&page=1&charset=gbk/.test(getUrls(bridge)[0]));

  filters[0].state = filters[0].values.indexOf("完結作品");
  const browsed = source.getSearchManga(1, "", filters);
  assert.strictEqual(browsed.mangas.length, 2);
  assert.ok(/articlelist\.php\?fullflag=1&page=2&/.test(getUrls(bridge)[1]), getUrls(bridge)[1]);

  filters[0].state = 0;
  const direct = source.getSearchManga(0, "33", filters);
  assert.strictEqual(direct.mangas.length, 1);
  assert.strictEqual(direct.mangas[0].url, BASE + "/book/33.htm");
  assert.strictEqual(direct.hasNextPage, false);
  assert.strictEqual(source.getSearchManga(0, "", filters).mangas.length, 0);
}

// Details, chapter list and chapter text.
{
  const bridge = makeBridge([["articleinfo.php", infoHtml], ["reader.php?aid=33", readerHtml], ["/novel/0/33/702.htm", chapterHtml]]);
  const source = load(bridge);
  const details = source.getMangaDetails({ url: BASE + "/book/33.htm", title: "x" });
  assert.strictEqual(details.initialized, true);
  assert.strictEqual(details.title, "測試小說");
  assert.strictEqual(details.author, "測試作者");
  assert.strictEqual(details.description, "一段簡介");
  assert.strictEqual(details.thumbnailUrl, "https://img.wenku8.com/image/0/33/33s.jpg");
  assert.ok(Array.isArray(details.genre));

  const chapters = source.getChapterList({ url: BASE + "/book/33.htm", title: "x" });
  assert.strictEqual(chapters.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(chapters[0])), {
    url: BASE + "/novel/0/33/701.htm", name: "第一卷 / 序章", scanlator: null, dateUpload: 0, chapterNumber: 0,
  });
  assert.strictEqual(chapters[1].url, BASE + "/novel/0/33/702.htm");

  const text = source.getChapterText({ url: chapters[1].url, name: chapters[1].name });
  assert.strictEqual(text, "甲\n\n乙");
}

// Login-required pages ask for login and degrade to empty results.
{
  const bridge = makeBridge([["toplist.php", loginPage]]);
  const source = load(bridge);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(source.getLatestUpdates(0))), { mangas: [], hasNextPage: false });
  assert.deepStrictEqual(bridge.calls.filter((c) => c[0] === "requestLogin").length, 1);
}

// Cloudflare challenge falls back to the browser session when present, and degrades without it.
{
  const bridge = makeBridge([["toplist.php", challengePage]]);
  let browserCall = null;
  bridge.browserSessionRequest = (url, method, body, headers) => { browserCall = [url, method, body, headers]; return { status: 200, body: listHtml }; };
  const source = load(bridge);
  assert.strictEqual(source.getPopularManga(0).mangas.length, 2);
  assert.ok(/toplist\.php\?sort=lastupdate/.test(browserCall[0]));
  assert.strictEqual(browserCall[1], "GET");

  const plain = makeBridge([["toplist.php", challengePage]]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(load(plain).getPopularManga(0))), { mangas: [], hasNextPage: false });

  const denied = makeBridge([["toplist.php", challengePage]]);
  denied.browserSessionRequest = () => { throw new Error("PERMISSION_DENIED"); };
  assert.strictEqual(load(denied).getPopularManga(0).mangas.length, 0);
}

// Login success and failure.
{
  const okBridge = makeBridge([]);
  okBridge.httpPost = (url, body) => { okBridge.calls.push(["post", url, body]); return "<html>登录成功 logout.php</html>"; };
  assert.strictEqual(load(okBridge).login("user name", "p&ss"), true);
  const post = okBridge.calls.find((c) => c[0] === "post");
  assert.ok(post[1].endsWith("/login.php?do=submit"));
  assert.ok(post[2].includes("username=user%20name") && post[2].includes("password=p%26ss"));

  const badBridge = makeBridge([["bookcase.php", loginPage]]);
  badBridge.httpPost = () => loginPage;
  assert.strictEqual(load(badBridge).login("u", "bad"), false);
}

// Bookcase and add-to-bookcase.
{
  const bridge = makeBridge([["addbookcase.php", "处理成功"], ["bookcase.php", bookcaseHtml]]);
  const source = load(bridge);
  const bookcase = source.getFavoriteManga(0);
  assert.strictEqual(bookcase.hasNextPage, false);
  assert.strictEqual(bookcase.mangas.length, 1);
  assert.strictEqual(bookcase.mangas[0].url, BASE + "/book/44.htm");
  assert.strictEqual(bookcase.mangas[0].title, "書架書");
  assert.strictEqual(bookcase.mangas[0].author, "某人");
  assert.ok(getUrls(bridge)[0].endsWith("/modules/article/bookcase.php#charset=gbk"));
  assert.strictEqual(source.getFavoriteManga(1).mangas.length, 0);

  const before = getUrls(bridge).length;
  assert.strictEqual(source.setFavorite({ url: BASE + "/book/44.htm", title: "x" }, false), false);
  assert.strictEqual(getUrls(bridge).length, before, "removal must not hit the site");
  assert.strictEqual(source.setFavorite({ url: BASE + "/book/44.htm", title: "x" }, true), true);
  assert.ok(/addbookcase\.php\?bid=44&/.test(getUrls(bridge)[getUrls(bridge).length - 1]));

  const rejected = makeBridge([["addbookcase.php", "<html>出错了</html>"]]);
  assert.strictEqual(load(rejected).setFavorite({ url: BASE + "/book/44.htm", title: "x" }, true), false);
  const needLogin = makeBridge([["addbookcase.php", loginPage]]);
  assert.strictEqual(load(needLogin).setFavorite({ url: BASE + "/book/44.htm", title: "x" }, true), false);
  assert.strictEqual(needLogin.calls.filter((c) => c[0] === "requestLogin").length, 1);
}

console.log("zh.wenku8 shinsou regressions passed");
