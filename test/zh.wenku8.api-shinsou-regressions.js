"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scriptPath = path.join(__dirname, "..", "src", "plugins", "zh.wenku8.api.js");
const scriptText = fs.readFileSync(scriptPath, "utf8");

function load(bridge) {
  const context = { console, Date, bridge, unescape, encodeURIComponent };
  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: "plugins/zh.wenku8.api.js" });
  return context.source;
}

const RELAY = "https://wenku8-relay.mewx.org/";
const BOOK = "https://wenku8-relay.mewx.org/book/";
const HTML_BASE = "https://www.wenku8.net";

// Relay stub: decodes the base64 `request` form field and answers by action.
function decodeRequest(body) {
  const match = /&request=([^&]*)&/.exec(body);
  return Buffer.from(decodeURIComponent(match[1]), "base64").toString("utf8");
}

function makeBridge(handlers) {
  const bridge = {
    requests: [],
    htmlGets: [],
    logins: [],
    log() {},
    requestLogin(reason) { bridge.logins.push(reason); return true; },
    httpPost(url, body) {
      assert.strictEqual(url, RELAY);
      const request = decodeRequest(body);
      bridge.requests.push(request);
      for (const [needle, response] of handlers.relay || []) {
        if (request.includes(needle)) return typeof response === "function" ? response(request) : response;
      }
      return "";
    },
    httpGetWithHeaders(url) {
      bridge.htmlGets.push(url);
      for (const [needle, response] of handlers.html || []) if (url.includes(needle)) return response;
      return "";
    },
  };
  return bridge;
}

const itemsXml = [
  "<result>",
  '<item aid="11"><data name="Title" value="第一本書"/><data name="Author" value="作者甲"/></item>',
  '<item aid="22"><data name="Title" value="第二本書"/><data name="Author" value="作者乙"/></item>',
  "</result>",
].join("");
const infoXml = '<metadata><data name="Title" value="測試小說"/><data name="Author" value="測試作者"/><data name="BookStatus" value="連載"/></metadata>';
const chaptersXml = [
  '<package><volume vid="1"><![CDATA[第一卷]]>',
  '<chapter cid="701"><![CDATA[序章]]></chapter>',
  '<chapter cid="702"><![CDATA[第一章]]></chapter>',
  "</volume></package>",
].join("");
const htmlList = '<a href="/book/55.htm" title="x">標籤書</a> 小说作者：標籤作者';

// Metadata and exported hook surface.
{
  const source = load({});
  assert.strictEqual(source.baseUrl, RELAY);
  assert.strictEqual(source.supportsLogin, true);
  assert.strictEqual(source.supportsLatest, true);
  assert.strictEqual(source.supportsFavorites, false);
  assert.strictEqual(source.webChallengeUrl, undefined);
  for (const hook of ["getPopularManga", "getLatestUpdates", "getSearchManga", "getMangaDetails", "getChapterList", "getChapterText", "getFilterList", "login", "logout"]) {
    assert.strictEqual(typeof source[hook], "function", hook);
  }
  // The app-local library is used: no remote bookcase surface at all.
  assert.strictEqual(source.getFavoriteManga, undefined);
  assert.strictEqual(source.setFavorite, undefined);
  for (const legacy of ["search", "latest", "browse", "browseOptions", "chapters", "chapterText", "favorite", "bookFromAid", "aidFromText", "getPageList"]) {
    assert.strictEqual(source[legacy], undefined, `ShuYue hook ${legacy} must not be exported`);
  }
  assert.ok(!/__shinsou_shuyue_/.test(scriptText));
  assert.ok(!/action=bookcase/.test(scriptText));
  assert.ok(!/getFavoriteManga\s*=/.test(scriptText));
  assert.ok(!/favorite:\s*function\s*\(/.test(scriptText));
  assert.ok(/var __shinsouExtensionV2 = (\{[^\n]+\});/.test(scriptText));
}

// Popular / latest / filters / search.
{
  const bridge = makeBridge({
    relay: [["action=articlelist", itemsXml], ["action=search", itemsXml], ["do=bookinfo", infoXml], ["do=intro", "簡介文字"]],
    html: [["tags.php", htmlList], ["articlelist.php", htmlList]],
  });
  const source = load(bridge);

  const popular = source.getPopularManga(0);
  assert.strictEqual(popular.mangas.length, 2);
  assert.strictEqual(popular.hasNextPage, true);
  assert.strictEqual(popular.mangas[0].url, BOOK + "11");
  assert.strictEqual(popular.mangas[0].title, "第一本書");
  assert.strictEqual(popular.mangas[0].author, "作者甲");
  assert.strictEqual(popular.mangas[0].thumbnailUrl, "https://img.wenku8.com/image/0/11/11s.jpg");
  source.getLatestUpdates(1);
  assert.ok(bridge.requests[0].includes("action=articlelist&sort=lastupdate&page=1"), bridge.requests[0]);
  assert.ok(bridge.requests[1].includes("action=articlelist&sort=lastupdate&page=2"), bridge.requests[1]);

  const filters = source.getFilterList();
  assert.strictEqual(filters[0].type, "select");
  assert.strictEqual(filters[0].values[0], "搜尋");
  assert.strictEqual(filters[0].state, 0);

  const found = source.getSearchManga(0, "魔法", filters);
  assert.strictEqual(found.mangas.length, 2);
  assert.strictEqual(found.hasNextPage, false);
  assert.ok(bridge.requests.some((r) => r.includes("action=search&searchtype=articlename&searchkey=")));
  assert.strictEqual(source.getSearchManga(1, "魔法", filters).mangas.length, 0);

  // Selected rank filter with an empty query.
  filters[0].state = filters[0].values.indexOf("週點擊榜");
  assert.ok(filters[0].state > 0);
  const ranked = source.getSearchManga(2, "", filters);
  assert.strictEqual(ranked.mangas.length, 2);
  assert.ok(bridge.requests[bridge.requests.length - 1].includes("sort=weekvisit&page=3"));

  // Selected full-work list and tag use the read-only HTML endpoints.
  filters[0].state = filters[0].values.indexOf("完結作品");
  const full = source.getSearchManga(0, "", filters);
  assert.strictEqual(full.mangas[0].url, HTML_BASE + "/book/55.htm");
  assert.ok(/articlelist\.php\?fullflag=1&page=1&/.test(bridge.htmlGets[0]), bridge.htmlGets[0]);
  filters[0].state = filters[0].values.indexOf("異世界");
  source.getSearchManga(0, "", filters);
  assert.ok(/tags\.php\?t=.+&v=0&page=1&/.test(bridge.htmlGets[1]), bridge.htmlGets[1]);

  // Direct id search.
  const direct = source.getSearchManga(0, "33", [{ type: "select", name: "分類", values: ["搜尋"], state: 0 }]);
  assert.strictEqual(direct.mangas.length, 1);
  assert.strictEqual(direct.mangas[0].url, BOOK + "33");
}

// Details, chapters and chapter text.
{
  const bridge = makeBridge({
    relay: [
      ["do=bookinfo", infoXml],
      ["do=intro", "簡介文字"],
      ["do=list", chaptersXml],
      ["do=text", "第一段\n<!--image-->//img.wenku8.com/a.jpg<!--image-->\n第二段"],
    ],
  });
  const source = load(bridge);
  const details = source.getMangaDetails({ url: BOOK + "33", title: "x" });
  assert.strictEqual(details.initialized, true);
  assert.strictEqual(details.title, "測試小說");
  assert.strictEqual(details.author, "測試作者");
  assert.strictEqual(details.description, "簡介文字");
  assert.ok(Array.isArray(details.genre));

  const chapters = source.getChapterList({ url: BOOK + "33", title: "x" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(chapters)), [
    { url: BOOK + "33/chapter/701", name: "第一卷 / 序章", scanlator: null, dateUpload: 0, chapterNumber: 0 },
    { url: BOOK + "33/chapter/702", name: "第一卷 / 第一章", scanlator: null, dateUpload: 0, chapterNumber: 1 },
  ]);
  const text = source.getChapterText({ url: chapters[1].url, name: chapters[1].name });
  assert.strictEqual(text, "第一段\n\n![Image](https://img.wenku8.com/a.jpg)\n\n第二段");
  assert.ok(bridge.requests.some((r) => r.includes("action=book&do=text&aid=33&cid=702")));

  const failing = load(makeBridge({ relay: [["do=text", "0"]] }));
  assert.ok(failing.getChapterText({ url: BOOK + "33/chapter/702", name: "x" }).startsWith("[無法載入章節內容"));
}

// Authentication-required responses request login and degrade to empty results.
{
  const bridge = makeBridge({ relay: [["action=articlelist", "4"], ["do=list", "4"]] });
  const source = load(bridge);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(source.getLatestUpdates(0))), { mangas: [], hasNextPage: false });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(source.getChapterList({ url: BOOK + "33", title: "x" }))), []);
  assert.strictEqual(bridge.logins.length, 1, "login prompt is rate limited");
}

// Login success, email fallback and failure.
{
  const ok = makeBridge({ relay: [["action=login&", "1"]] });
  assert.strictEqual(load(ok).login("user", "p&ss"), true);
  assert.ok(ok.requests[0].startsWith("action=login&username=user&password=p%26ss"), ok.requests[0]);

  const email = makeBridge({ relay: [["action=loginemail", "1"], ["action=login&", "2"]] });
  assert.strictEqual(load(email).login("a@b.c", "pw"), true);
  assert.strictEqual(email.requests.length, 2);

  const bad = makeBridge({ relay: [["action=login", "2"]] });
  assert.strictEqual(load(bad).login("user", "bad"), false);
  assert.strictEqual(bad.requests.length, 2);
}

console.log("zh.wenku8.api shinsou regressions passed");
