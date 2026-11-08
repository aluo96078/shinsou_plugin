"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const code = fs.readFileSync(path.join(__dirname, "..", "src", "plugins", "zh.bilimanga.js"), "utf8");
const context = { console, Date, encodeURIComponent, decodeURIComponent, bridge: {} };
vm.createContext(context);
vm.runInContext(code, context, { filename: "zh.bilimanga.js" });
const source = context.source;

// Metadata and exported surface.
assert.strictEqual(source.baseUrl, "https://tw.linovelib.com");
assert.strictEqual(source.webChallengeUrl, "https://tw.linovelib.com/login.php");
assert.strictEqual(source.supportsLatest, true);
assert.strictEqual(source.supportsLogin, true);
assert.strictEqual(source.supportsFavorites, false);
assert.ok(source.headers && source.headers.Referer);
for (const name of ["search", "latest", "browse", "browseOptions", "chapters", "chapterText", "favorite", "bookFromAid", "aidFromText", "getPageList"]) {
  assert.strictEqual(source[name], undefined, name);
}
assert.strictEqual(context.novelSource, undefined);
assert.ok(!/__shinsou_shuyue_|ShuYue/i.test(code.replace(/^\/\*[\s\S]*?\*\//, "")));
assert.match(code, /var __shinsouExtensionV2 = (\{[^\n]+\});/);

const listHtml = [
  '<a href="/novel/10.html"><img data-src="https://img.example/c10.jpg"><h2 class="book-title">作品甲</h2><em class="tag-small">奇幻</em></a>',
  '<a href="/novel/11.html"><h2 class="book-title">作品乙</h2></a>',
].join("");
const urls = [];
function setBridge(map) {
  context.bridge = {
    httpGetWithHeaders(url) {
      urls.push(url);
      for (const key of Object.keys(map)) if (url.indexOf(key) >= 0) return map[key];
      return "";
    },
  };
}

setBridge({ "/topfull/weekvisit/1.html": listHtml });
let result = source.getPopularManga(0);
assert.strictEqual(urls[0], "https://tw.linovelib.com/topfull/weekvisit/1.html");
assert.strictEqual(result.mangas.length, 2);
assert.strictEqual(result.hasNextPage, false);
assert.strictEqual(result.mangas[0].title, "作品甲");
assert.deepStrictEqual(Array.from(result.mangas[0].genre), ["奇幻"]);
assert.strictEqual(result.mangas[0].thumbnailUrl, "https://img.example/c10.jpg");

urls.length = 0;
setBridge({ "/top/lastupdate/3.html": listHtml });
result = source.getLatestUpdates(2);
assert.strictEqual(urls[0], "https://tw.linovelib.com/top/lastupdate/3.html");
assert.strictEqual(result.mangas.length, 2);

urls.length = 0;
setBridge({ "search.php?keyword=%E7%94%B2&page=1": listHtml });
result = source.getSearchManga(0, "甲", source.getFilterList());
assert.strictEqual(urls[0], "https://tw.linovelib.com/search.php?keyword=%E7%94%B2&page=1");
assert.strictEqual(result.mangas.length, 2);

urls.length = 0;
setBridge({ "/wenku/weekvisit_15_0_0_0_0_0_0_1_2.html": listHtml });
const filters = source.getFilterList();
assert.deepStrictEqual(Array.from(filters, (f) => f.name), ["排序", "小說類型"]);
filters[0].state = 2;
filters[1].state = 1;
result = source.getSearchManga(2, "", filters);
assert.strictEqual(urls[0], "https://tw.linovelib.com/wenku/weekvisit_15_0_0_0_0_0_0_1_2.html");
assert.strictEqual(result.mangas.length, 2);

urls.length = 0;
setBridge({ "/topfull/lastupdate/1.html": listHtml });
source.getSearchManga(0, "", source.getFilterList());
assert.strictEqual(urls[0], "https://tw.linovelib.com/topfull/lastupdate/1.html");

// Details.
const detailHtml = [
  '<h1 class="book-title">作品甲</h1><span class="authorname">作者：某作者</span><span class="illname">作者：某繪師</span>',
  '<em class="tag-small">奇幻</em><em class="tag-small">冒險</em><span>連載中</span>',
  "<content>簡介<br>第二行</content>",
  '<img src="https://img.example/c10.jpg">',
].join("");
setBridge({ "/novel/10.html": detailHtml });
const details = source.getMangaDetails({ url: "https://tw.linovelib.com/novel/10.html", title: "x" });
assert.strictEqual(details.title, "作品甲");
assert.strictEqual(details.author, "某作者");
assert.strictEqual(details.artist, "某繪師");
assert.strictEqual(details.status, 1);
assert.strictEqual(details.initialized, true);
assert.deepStrictEqual(Array.from(details.genre), ["奇幻", "冒險"]);
assert.strictEqual(details.description, "簡介\n第二行");

// Chapter list.
setBridge({
  "/novel/10/catalog": '<div class="catalog-volume"></div><a href="/novel/10/100.html" class="chapter-li-a"><span>第一章</span></a><a href="/novel/10/101.html" class="chapter-li-a"><span>第二章</span></a>',
});
const chapters = source.getChapterList({ url: "https://tw.linovelib.com/novel/10.html" });
assert.strictEqual(chapters.length, 2);
assert.strictEqual(chapters[0].url, "https://tw.linovelib.com/novel/10/100.html");
assert.strictEqual(chapters[1].chapterNumber, 2);
assert.strictEqual(chapters[0].scanlator, null);

// Chapter text, following continuation pages of the same chapter.
setBridge({
  "/novel/10/100.html": '<div id="acontent"><p>第一段</p><p>第二段</p></div><script>var ReadParams = {url_next:\'/novel/10/100_2.html\'}</script>',
  "/novel/10/100_2.html": '<div id="acontent"><p>第三段</p></div><script>var ReadParams = {url_next:\'/novel/10/101.html\'}</script>',
});
const text = source.getChapterText({ url: "https://tw.linovelib.com/novel/10/100.html", name: "第一章" });
assert.strictEqual(typeof text, "string");
assert.strictEqual(text, "第一段\n第二段\n\n第三段");

// 4 MiB cap.
setBridge({ "/novel/10/200.html": '<div id="acontent">' + "字".repeat(2000000) + "</div>" });
const capped = source.getChapterText({ url: "https://tw.linovelib.com/novel/10/200.html" });
assert.ok(Buffer.byteLength(capped, "utf8") <= 4 * 1024 * 1024);

// Login success / failure.
let posted = null;
context.bridge = {
  httpGetWithHeaders() { return '<a href="/login.php" class="jsLogin"></a>'; },
  httpPost(url, body) { posted = { url, body }; return '<a href="/logout.php">登出</a>'; },
  clearCookies() { posted = "cleared"; },
};
assert.strictEqual(source.login("u", "p").loggedIn, true);
assert.strictEqual(posted.url, "https://tw.linovelib.com/login.php?do=submit");
context.bridge.httpPost = () => '<form name="frmlogin"><div class="alert">帳號或密碼錯誤</div><input type="password"></form>';
const failed = source.login("u", "p");
assert.strictEqual(failed.loggedIn, false);
assert.strictEqual(failed.errorMessage, "帳號或密碼錯誤");
source.logout();
assert.strictEqual(posted, "cleared");

console.log("zh.bilimanga shinsou regressions passed");
