"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scriptPath = path.join(__dirname, "..", "src", "plugins", "zh.biquge.tw.js");
const scriptText = fs.readFileSync(scriptPath, "utf8");

const BASE = "https://www.biquge.tw";
const pages = {};
const requests = [];
let browserCalls = [];
let browserBody = "";

const bridge = {
  httpGet(url) { requests.push(url); return pages[url] || ""; },
  httpGetWithHeaders(url, headers) { requests.push(url); bridge.lastHeaders = headers; return pages[url] || ""; },
  browserSessionRequest(url, method, body, headers) {
    browserCalls.push({ url, method, body, headers });
    return { status: 200, body: browserBody };
  },
  log() {},
};
const context = { console, bridge, encodeURIComponent, decodeURIComponent };
vm.createContext(context);
vm.runInContext(scriptText, context, { filename: "zh.biquge.tw.js" });
const source = vm.runInContext("source", context);

// The v2 declaration stays a single line.
assert(/var __shinsouExtensionV2 = (\{[^\n]+\});/.test(scriptText));

// Metadata and exported hooks.
assert.strictEqual(source.baseUrl, BASE);
assert.strictEqual(source.webChallengeUrl, BASE);
assert.strictEqual(source.supportsLatest, true);
assert.strictEqual(source.supportsLogin, false);
assert.strictEqual(source.supportsFavorites, false);
assert(source.headers && source.headers["User-Agent"]);
for (const name of ["search", "latest", "browse", "browseOptions", "chapters", "chapterText", "favorite", "bookFromAid", "aidFromText", "login", "logout", "getFavoriteManga", "setFavorite", "getPageList"]) {
  assert.strictEqual(source[name], undefined, `${name} must not be exported`);
}
for (const name of ["getPopularManga", "getLatestUpdates", "getSearchManga", "getMangaDetails", "getChapterList", "getChapterText", "getFilterList"]) {
  assert.strictEqual(typeof source[name], "function", name);
}

// Filters.
const filters = source.getFilterList();
assert.strictEqual(filters.length, 1);
assert.strictEqual(filters[0].type, "select");
assert.strictEqual(filters[0].values[0], "搜尋");
assert.strictEqual(filters[0].values[1], "最新更新");
assert.strictEqual(filters[0].values.length, 18);
assert.strictEqual(filters[0].state, 0);

const listHtml = [
  '<div class="item"><a href="/book/12.html"><img src="https://img.biquge.tw/12.jpg"></a>',
  '<a href="/book/12.html" title="甲書">甲書</a><a href="/author/x">作者甲</a></div>',
  '<div class="item"><a href="/book/34.html">乙書</a></div>',
].join("\n");
pages[BASE + "/top/lastupdate"] = listHtml;
pages[BASE + "/top/lastupdate/2.html"] = listHtml.replace(/12/g, "56");
pages[BASE + "/sort/xuanhuan/"] = '<a href="/book/77.html" title="玄幻書">玄幻書</a>';
pages[BASE + "/search.php?keyword=" + encodeURIComponent("甲") + "&page=1"] = listHtml;

// popular / latest use 0-based pages.
let result = source.getPopularManga(0);
assert.strictEqual(result.mangas.length, 2);
assert.strictEqual(result.hasNextPage, true);
assert.strictEqual(result.mangas[0].url, BASE + "/book/12.html");
assert.strictEqual(result.mangas[0].title, "甲書");
assert.strictEqual(result.mangas[0].author, "作者甲");
assert.strictEqual(result.mangas[0].thumbnailUrl, "https://img.biquge.tw/12.jpg");
assert.strictEqual(result.mangas[0].initialized, true);
assert.strictEqual(source.getLatestUpdates(1).mangas[0].url, BASE + "/book/56.html");
assert.strictEqual(bridge.lastHeaders.Referer, BASE + "/");

// search: query, filter browse, direct id.
result = source.getSearchManga(0, "甲", filters);
assert.strictEqual(result.mangas.length, 2);
const selected = JSON.parse(JSON.stringify(filters));
selected[0].state = 10; // 玄幻魔法
assert.strictEqual(selected[0].values[10], "玄幻魔法");
result = source.getSearchManga(0, "", selected);
assert.strictEqual(result.mangas[0].url, BASE + "/book/77.html");
assert.strictEqual(source.getSearchManga(0, "", filters).mangas.length, 0);

const bookHtml = [
  "<title>測試書 - 筆趣閣</title><h1>測試書</h1>",
  '<a href="/author/abc">某作者</a>',
  '<div class="intro">這是簡介</div>',
  '<div class="cover"><img src="/cover/99.jpg"></div>',
].join("\n");
pages[BASE + "/book/99.html"] = bookHtml;
result = source.getSearchManga(0, "99", filters);
assert.strictEqual(result.mangas.length, 1);
assert.strictEqual(result.hasNextPage, false);
assert.strictEqual(result.mangas[0].title, "測試書");

// details.
const details = source.getMangaDetails({ url: BASE + "/book/99.html", title: "x" });
assert.strictEqual(details.title, "測試書");
assert.strictEqual(details.author, "某作者");
assert.strictEqual(details.description, "這是簡介");
assert.strictEqual(details.thumbnailUrl, BASE + "/cover/99.jpg");
assert.strictEqual(details.initialized, true);

// chapters.
pages[BASE + "/book/99/"] = [
  '<a href="/book/99/1.html">第一章</a>',
  '<a href="/book/99/1.html">重複</a>',
  '<a href="/book/99/2.html" title="第二章">x</a>',
  '<a href="/book/98/3.html">別本</a>',
].join("\n");
const chapters = source.getChapterList({ url: BASE + "/book/99.html", title: "測試書" });
assert.deepStrictEqual(JSON.parse(JSON.stringify(chapters)), [
  { url: BASE + "/book/99/1.html", name: "第一章", scanlator: null, dateUpload: 0, chapterNumber: 0 },
  { url: BASE + "/book/99/2.html", name: "第二章", scanlator: null, dateUpload: 0, chapterNumber: 1 },
]);

// chapter text with a split page.
pages[BASE + "/book/99/1.html"] = '<div id="chaptercontent">第一段<br><br>第二段<a id="next_url" href="/book/99/1_2.html">下一頁</a></div>';
pages[BASE + "/book/99/1_2.html"] = '<div id="chaptercontent">第三段<a id="next_url" href="/book/99/2.html">下一章</a></div>';
assert.strictEqual(source.getChapterText({ url: BASE + "/book/99/1.html", name: "第一章" }), "第一段\n\n第二段\n\n第三段");

// Cloudflare challenge: empty list, browser-session fallback.
const challenge = "<title>Just a moment...</title>";
pages[BASE + "/top/lastupdate"] = challenge;
browserBody = "";
assert.strictEqual(source.getPopularManga(0).mangas.length, 0);
pages[BASE + "/book/99/2.html"] = challenge;
assert(/Cloudflare/.test(source.getChapterText({ url: BASE + "/book/99/2.html", name: "" })));
browserBody = '<div id="chaptercontent">瀏覽器內容</div>';
browserCalls = [];
assert.strictEqual(source.getChapterText({ url: BASE + "/book/99/2.html", name: "" }), "瀏覽器內容");
assert.strictEqual(browserCalls[0].method, "GET");
assert.strictEqual(browserCalls[0].url, BASE + "/book/99/2.html");

console.log("zh.biquge.tw shinsou regressions passed");
