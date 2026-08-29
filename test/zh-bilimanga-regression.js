"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..");
const scriptText = fs.readFileSync(path.join(repoRoot, "plugins/zh.bilimanga.js"), "utf8");
const context = {
  console,
  Date,
  encodeURIComponent,
  decodeURIComponent,
  bridge: {},
};
vm.createContext(context);
vm.runInContext(scriptText, context, { filename: "plugins/zh.bilimanga.js" });

const novelFixture = [
  "<div>最後更新：2026-08-24</div>",
  '<div class="catalog-volume"><ul class="volume-chapters">',
  '<li class="chapter-bar chapter-li"><a href="/novel/10/vol_100.html"><h3>作品名稱 1 幼年期</h3></a></li>',
  '<a href="/novel/10/100.html" class="chapter-li-a"><span>第一章</span></a>',
  '<a href="/novel/10/101.html" class="chapter-li-a"><span>第二章</span></a>',
  "</ul></div>",
  '<div class="catalog-volume"><ul class="volume-chapters">',
  '<li class="chapter-bar chapter-li"><a href="/novel/10/vol_102.html"><h3>作品名稱 2 少年期</h3></a></li>',
  '<a href="/novel/10/102.html" class="chapter-li-a"><span>第三章</span></a>',
  '<a href="/novel/10/103.html" class="chapter-li-a"><span>第四章</span></a>',
  "</ul></div>",
].join("\n");
const novelChapters = context.parseNovelChapters(context.novelSource, "10", novelFixture);
assert.strictEqual(
  novelChapters.map((chapter) => chapter.url).join(","),
  "https://tw.linovelib.com/novel/10/100.html,https://tw.linovelib.com/novel/10/101.html,https://tw.linovelib.com/novel/10/102.html,https://tw.linovelib.com/novel/10/103.html",
);
assert.strictEqual(novelChapters.map((chapter) => chapter.chapterNumber).join(","), "1,2,3,4");
assert.deepStrictEqual(
  Array.from(novelChapters, (chapter) => chapter.name),
  ["第1卷 · 第一章", "第1卷 · 第二章", "第2卷 · 第三章", "第2卷 · 第四章"],
);

const mangaFixture = [
  "<h2>第一卷</h2>",
  '<a href="/read/20/200.html" class="chapter-li-a"><span>第１話</span></a>',
  '<a href="javascript:cid(1)" class="chapter-li-a"><span>第２話</span></a>',
  "<h2>第二卷</h2>",
  '<a href="/read/20/202.html" class="chapter-li-a"><span>第３話</span></a>',
  '<a href="/read/20/203.html" class="chapter-li-a"><span>第４話</span></a>',
].join("\n");
const mangaChapters = context.parseMangaChapters(context.mangaSource, "20", mangaFixture);
assert.strictEqual(
  mangaChapters.map((chapter) => chapter.url).join(","),
  "https://www.bilimanga.net/read/20/200.html,https://www.bilimanga.net/read/20/201.html,https://www.bilimanga.net/read/20/202.html,https://www.bilimanga.net/read/20/203.html",
);
assert.strictEqual(mangaChapters.map((chapter) => chapter.chapterNumber).join(","), "1,2,3,4");
assert.deepStrictEqual(
  Array.from(mangaChapters, (chapter) => chapter.name),
  ["第１話", "第２話", "第３話", "第４話"],
);

context.bridge = {
  httpGetWithHeaders() {
    return [
      '<div class="imagecontent">',
      '<img data-src="https://i.motiezw.com/20/200/1.avif">',
      '<img data-src="https://i.motiezw.com/20/200/2.avif">',
      "</div>",
    ].join("");
  },
};
const pages = context.mangaSource.getPageList({ url: "/read/20/200.html" });
assert.strictEqual(pages.length, 2);
for (const page of pages) {
  assert.match(page.imageUrl, /^https:\/\/i\.motiezw\.com\/20\/200\/\d\.avif#/);
  assert.match(page.imageUrl, /Referer=https%3A%2F%2Fwww\.bilimanga\.net/);
  assert.match(page.imageUrl, /User-Agent=Mozilla%2F5\.0/);
}

let posted = null;
let cleared = false;
let novelPreflightRequests = 0;
context.bridge = {
  httpGetWithHeaders(url) {
    novelPreflightRequests += 1;
    assert.strictEqual(url, "https://tw.linovelib.com/");
    return '<form name="frmlogin" action="/login.php?do=submit"><input type="password"></form>';
  },
  httpPost(url, body, headers) {
    posted = { url, body, headers };
    return '登入成功 <a href="/logout.php">登出</a>';
  },
  clearCookies() {
    cleared = true;
  },
};
const novelLogin = context.novelSource.login("member@example.com", "secret");
assert.strictEqual(novelLogin.loggedIn, true);
assert.strictEqual(novelLogin.errorMessage, undefined);
assert.strictEqual(novelPreflightRequests, 2);
assert.strictEqual(posted.url, "https://tw.linovelib.com/login.php?do=submit");
assert.match(posted.body, /username=member%40example\.com/);
assert.match(posted.body, /password=secret/);
assert.strictEqual(posted.headers["Content-Type"], "application/x-www-form-urlencoded");
context.novelSource.logout();
assert.strictEqual(cleared, true);

let importedSessionPosts = 0;
let importedSessionChecks = 0;
context.bridge = {
  httpPost() {
    importedSessionPosts += 1;
    throw new Error("An imported member session must bypass the Cloudflare-protected POST");
  },
  httpGetWithHeaders(url) {
    importedSessionChecks += 1;
    assert.strictEqual(url, "https://www.bilimanga.net/");
    return '<header><a class="icon icon-person" href="/user.php"><img alt="頭像"></a></header>';
  },
};
const mangaLogin = context.mangaSource.login("member", "secret");
assert.strictEqual(mangaLogin.loggedIn, true);
assert.strictEqual(mangaLogin.errorMessage, undefined);
assert.strictEqual(importedSessionChecks, 1);
assert.strictEqual(importedSessionPosts, 0);

let ordinaryLoginPosts = 0;
let ordinaryLoginHomeRequests = 0;
context.bridge = {
  httpPost(url, body) {
    ordinaryLoginPosts += 1;
    assert.strictEqual(url, "https://www.bilimanga.net/login.php?do=submit");
    assert.match(body, /username=member/);
    assert.match(body, /password=secret/);
    assert.match(body, /act=login/);
    assert.match(body, /usecookie=86400/);
    assert.match(body, /submit=$/);
    return '<header><a class="icon icon-person" href="/user.php"><img alt="頭像"></a></header>';
  },
  httpGetWithHeaders(url) {
    ordinaryLoginHomeRequests += 1;
    assert.strictEqual(url, "https://www.bilimanga.net/");
    return ordinaryLoginHomeRequests === 1
      ? '<a href="/login.php" class="icon icon-person jsLogin"></a>'
      : '<header><a class="icon icon-person" href="/user.php"><img alt="頭像"></a></header>';
  },
};
const ordinaryMangaLogin = context.mangaSource.login("member", "secret");
assert.strictEqual(ordinaryMangaLogin.loggedIn, true);
assert.strictEqual(ordinaryLoginPosts, 1);
assert.strictEqual(ordinaryLoginHomeRequests, 2);
assert.strictEqual(context.novelSource.supportsLogin, true);
assert.strictEqual(context.mangaSource.supportsLogin, true);
assert.strictEqual(context.novelSource.webChallengeUrl, "https://tw.linovelib.com/login.php");
assert.strictEqual(context.mangaSource.webChallengeUrl, "https://www.bilimanga.net/login.php");

context.bridge = {
  httpPost() {
    return '<a href="/login.php" class="icon icon-person jsLogin"></a>';
  },
  httpGetWithHeaders() {
    return [
      '<a href="/login.php" class="icon icon-person jsLogin"></a>',
      '<a href="/bookcase.php" class="footer-link-a">書架</a>',
      '<a href="/bookcase.php" class="btn-primary jsLogin">登入去書架</a>',
    ].join("");
  },
};
const guestHomeLogin = context.novelSource.login("wrong-user", "wrong-password");
assert.strictEqual(guestHomeLogin.loggedIn, false);
assert.strictEqual(guestHomeLogin.errorMessage, "登入失敗，請檢查使用者名稱與密碼。");

context.bridge = {
  httpPost() {
    return '<form name="frmlogin"><div class="alert alert-danger">帳號或密碼錯誤</div><input type="password"></form>';
  },
  httpGetWithHeaders() {
    return '<a href="/login.php" class="icon icon-person jsLogin"></a>';
  },
};
const failedLogin = context.novelSource.login("wrong-user", "wrong-password");
assert.strictEqual(failedLogin.loggedIn, false);
assert.strictEqual(failedLogin.errorMessage, "帳號或密碼錯誤");

context.bridge = {
  httpPost() {
    return '<form name="frmlogin"><div class="login-message">錯誤的密碼</div><input type="password"></form>';
  },
  httpGetWithHeaders() {
    return '<a href="/login.php" class="icon icon-person jsLogin"></a>';
  },
};
const reversedFailureLogin = context.novelSource.login("wrong-user", "wrong-password");
assert.strictEqual(reversedFailureLogin.loggedIn, false);
assert.strictEqual(reversedFailureLogin.errorMessage, "錯誤的密碼");

context.bridge = {
  httpPost() {
    return [
      '<title>錯誤_嗶哩輕小說</title>',
      '<div class="aui-ver-form">',
      "該用戶不存在，請注意字母大小寫是否輸入正確！<br>",
      "</div>",
    ].join("");
  },
  httpGetWithHeaders() {
    return '<a href="/login.php" class="icon icon-person jsLogin"></a>';
  },
};
const nonexistentUserLogin = context.novelSource.login("wrong-user", "wrong-password");
assert.strictEqual(nonexistentUserLogin.loggedIn, false);
assert.strictEqual(nonexistentUserLogin.errorMessage, "該用戶不存在，請注意字母大小寫是否輸入正確！");

const announcementFixture = [
  '<div class="global-tip" style="padding:10px 20px">',
  '<ul class="text">',
  '<li class="red">如［積分廣告］連續出現，請<b>換一個瀏覽器</b> (◍•ᴗ•◍)</li>',
  '<li class="blue">如果有新資源請底部〔反饋〕給本站 💗</li>',
  "</ul>",
  "</div>",
].join("\n");
context.bridge = {
  httpPost() {
    return announcementFixture;
  },
  httpGetWithHeaders() {
    return announcementFixture;
  },
};
const announcementLogin = context.novelSource.login("wrong-user", "wrong-password");
assert.strictEqual(announcementLogin.loggedIn, false);
assert.strictEqual(announcementLogin.errorMessage, "登入失敗，請檢查使用者名稱與密碼。");

context.bridge = {
  httpPost() {
    return [
      '<div class="notice">',
      "<p>登入後可以收藏作品</p>",
      "<p>內容加載失敗！請重載或更換瀏覽器</p>",
      "</div>",
    ].join("");
  },
  httpGetWithHeaders() {
    return '<div class="notice">內容加載失敗！請重載或更換瀏覽器</div>';
  },
};
const unrelatedFailureLogin = context.novelSource.login("wrong-user", "wrong-password");
assert.strictEqual(unrelatedFailureLogin.loggedIn, false);
assert.strictEqual(unrelatedFailureLogin.errorMessage, "登入失敗，請檢查使用者名稱與密碼。");

context.bridge = {
  httpPost() {
    return '<html><title>Just a moment...</title><form id="challenge-form"></form></html>';
  },
  httpGetWithHeaders() {
    return '<a href="/login.php" class="icon icon-person jsLogin"></a>';
  },
};
const challengedLogin = context.mangaSource.login("member", "secret");
assert.strictEqual(challengedLogin.loggedIn, false);
assert.strictEqual(
  challengedLogin.errorMessage,
  "網站登入端點受 Cloudflare 瀏覽器指紋保護。請開啟「Web 驗證／Cloudflare」，在同一視窗完成網站會員登入，看到會員頁後按「Import cookies」，再回來按登入。",
);

let loginReasons = [];
context.bridge = {
  httpGetWithHeaders() {
    return '<form name="frmlogin" action="/login.php?do=submit"><input type="password"></form>';
  },
  system: {
    requestLogin(reason) {
      loginReasons.push(reason);
    },
  },
};
context.novelSource._lastLoginRequestAt = 0;
context.novelSource.getMangaDetails({ url: "https://tw.linovelib.com/novel/10.html", title: "Fallback" });
context.novelSource.getChapterList({ url: "https://tw.linovelib.com/novel/10.html" });
assert.deepStrictEqual(loginReasons, ["小說作品詳情需要登入才能載入。"]);

console.log("zh.bilimanga regression: chapter order, image headers, login errors, and logout verified");
