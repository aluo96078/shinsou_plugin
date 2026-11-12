"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repoRoot = path.resolve(__dirname, "..", "src");

function attributes(markup) {
  const result = {};
  const pattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = pattern.exec(markup))) result[match[1]] = match[3];
  return result;
}

function element(markup, baseUrl) {
  const attrs = attributes(markup);
  return {
    attr(name) { return attrs[name] || ""; },
    absUrl(name) {
      const value = attrs[name] || "";
      return value ? new URL(value, baseUrl).toString() : "";
    },
    text() { return markup.replace(/<[^>]*>/g, "").trim(); },
  };
}

function elements(values) {
  values.isEmpty = () => values.length === 0;
  values.size = () => values.length;
  values.last = () => values[values.length - 1] || null;
  return values;
}

const fixtureJsoup = {
  parse(html, baseUrl) {
    return {
      select(selector) {
        if (selector.includes(".comic-contain__item")) {
          return elements(Array.from(html.matchAll(/<amp-img\b[^>]*class=["'][^"']*comic-contain__item[^"']*["'][^>]*>/gi),
            (match) => element(match[0], baseUrl)));
        }
        if (selector === "#gdt a") {
          const block = (html.match(/<div\b[^>]*id=["']gdt["'][^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
          return elements(Array.from(block.matchAll(/<a\b[^>]*>/gi), (match) => element(match[0], baseUrl)));
        }
        return elements([]);
      },
      selectFirst(selector) {
        if (selector === "#img") {
          const match = html.match(/<img\b[^>]*id=["']img["'][^>]*>/i);
          return match ? element(match[0], baseUrl) : null;
        }
        return null;
      },
    };
  },
};

function loadSource(fileName, bridge, extra = {}) {
  const context = {
    console,
    Date,
    Math,
    JSON,
    encodeURIComponent,
    decodeURIComponent,
    bridge,
    Page: function Page(index, url, imageUrl) {
      this.index = index || 0;
      this.url = url || "";
      this.imageUrl = imageUrl || null;
    },
    MangasPage: function MangasPage(mangas, hasNextPage) {
      this.mangas = mangas || [];
      this.hasNextPage = Boolean(hasNextPage);
    },
    ...extra,
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(repoRoot, "plugins", fileName), "utf8"),
    context,
    { filename: "plugins/" + fileName },
  );
  return context;
}

// Baozi must use the public redirect route before Cloudflare-protected app mirrors and must
// accept bzcdn.net paths whose internal directory does not match comic_id.
const baoziRequests = [];
const baoziFixture = [
  '<amp-img class="comic-contain__item" src="loading.gif" data-src="https://s1.bzcdn.net/scomic/internal-slug/0/1/1.jpg"></amp-img>',
  '<amp-img class="comic-contain__item" data-src="https://s1.bzcdn.net/scomic/internal-slug/0/1/2.jpg"></amp-img>',
].join("");
const baozi = loadSource("zh.baozimh.js", {
  httpGetWithHeaders(url) {
    baoziRequests.push(url);
    assert.ok(!url.includes("app.baozimh.com"), "app mirror must not run before a usable web reader");
    return baoziFixture;
  },
  domReleaseAll() {},
  log() {},
}, { Jsoup: fixtureJsoup });
const baoziPages = baozi.source.getPageList({
  url: "/user/page_direct?comic_id=public-slug&section_slot=0&chapter_slot=8",
});
assert.strictEqual(baoziRequests[0], "https://www.twmanga.com/user/page_direct?comic_id=public-slug&section_slot=0&chapter_slot=8");
assert.deepStrictEqual(Array.from(baoziPages, (page) => page.imageUrl), [
  "https://s1.bzcdn.net/scomic/internal-slug/0/1/1.jpg",
  "https://s1.bzcdn.net/scomic/internal-slug/0/1/2.jpg",
]);

// DM5 accepts a browser-imported member cookie and explains the CAPTCHA flow otherwise.
let dm5Session = false;
let dm5Cleared = false;
const dm5 = loadSource("zh.dm5.js", {
  httpGetWithHeaders(url) {
    assert.match(url, /\/dm5\.ashx\?action=getuserinfo/);
    return JSON.stringify({ isSuccess: dm5Session });
  },
  clearCookies() { dm5Cleared = true; },
});
assert.strictEqual(dm5.source.supportsLogin, true);
assert.strictEqual(dm5.source.webChallengeUrl, "https://www.dm5.com/login/");
const dm5Guest = dm5.source.login("member", "secret");
assert.strictEqual(dm5Guest.loggedIn, false);
assert.match(dm5Guest.errorMessage, /旋轉驗證碼/);
dm5Session = true;
assert.strictEqual(dm5.source.login("member", "secret").loggedIn, true);
dm5.source.logout();
assert.strictEqual(dm5Cleared, true);

// DM5's public chapterfun endpoint embeds escaped single quotes in its Dean Edwards packed
// program. The parser must treat them as part of the captured payload and extract the literal
// image URLs without evaluating the returned JavaScript.
const dm5ChapterfunFixture = String.raw`eval(function(p,a,c,k,e,d){e=function(c){return(c<a?"":e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--)d[e(c)]=k[c]||e(c);k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1;};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p;}('o 8(){1 4=3;1 a=\'9\';1 7="6://g.h.c/j/f/3";1 2=["/b.5","/e.5"];k(1 i=0;i<2.q;i++){p(/^(6?:)?\\/\\//i.l(2[i])){m}2[i]=7+2[i]+\'?4=3&a=9\'}n 2}1 d;d=8();',27,27,'|var|pvalue|1829655|cid|jpg|https|pix|dm5imagefun|b1b4e80ef94c99d47bf97f99f7ba3d4a|key|1_8524|com||2_9820|96433|manhua1041zjcdn63|cdndm5||97|for|test|continue|return|function|if|length'.split('|'),0,{}))`;
assert.deepStrictEqual(Array.from(dm5.source._evalImageScript(dm5ChapterfunFixture, "https://www.dm5.com/m1829655/")), [
  "https://manhua1041zjcdn63.cdndm5.com/97/96433/1829655/1_8524.jpg?cid=1829655&key=b1b4e80ef94c99d47bf97f99f7ba3d4a#Referer=https%3A%2F%2Fwww.dm5.com%2Fm1829655%2F",
  "https://manhua1041zjcdn63.cdndm5.com/97/96433/1829655/2_9820.jpg?cid=1829655&key=b1b4e80ef94c99d47bf97f99f7ba3d4a#Referer=https%3A%2F%2Fwww.dm5.com%2Fm1829655%2F",
]);

// Manhuagui detail pages now hide their chapter anchors in LZString-compressed __VIEWSTATE.
// Exercise the exact host flow with a deterministic decompressor fixture; the source must append
// the decoded inert markup before selecting chapters, without executing first-party scripts.
// The site splits a section into <ul> pages that run oldest page first, each listing its own
// chapters newest first; the source must return one story-order list (first chapter first).
function manhuaguiAnchor(id, title) {
  return {
    attr(name) { return name === "href" ? `/comic/12912/${id}.html` : name === "title" ? title : ""; },
    text() { return title; },
  };
}
const manhuaguiPages = [
  [manhuaguiAnchor(2, "第02話"), manhuaguiAnchor(1, "第01話")],
  [manhuaguiAnchor(4, "第04話"), manhuaguiAnchor(3, "第03話")],
];
const manhuagui = loadSource("zh.manhuagui.js", {
  httpGetWithHeaders() { return '<input id="__VIEWSTATE" value="fixture-base64">'; },
  domReleaseAll() {},
  log() {},
}, {
  Jsoup: {
    parse(html) {
      const expanded = html.includes("chapter-list-1");
      return {
        select(selector) {
          if (!expanded) return elements([]);
          if (selector.includes("chapter-list")) {
            return elements([{
              select(inner) {
                assert.strictEqual(inner, "ul");
                return elements(manhuaguiPages.map((anchors) => ({
                  select(links) {
                    assert.strictEqual(links, "li a");
                    const list = elements(anchors.slice());
                    list.get = (index) => list[index];
                    return list;
                  },
                })));
              },
            }]);
          }
          return elements([]);
        },
      };
    },
  },
  SChapter: { create() { return {}; } },
});
manhuagui.source._lzDecompress = (value) => {
  assert.strictEqual(value, "fixture-base64");
  return '<div id="chapter-list-1"><ul></ul></div>';
};
const manhuaguiChapters = manhuagui.source.getChapterList({ url: "/comic/12912/" });
assert.deepStrictEqual(
  Array.from(manhuaguiChapters, (chapter) => chapter.name),
  ["第01話", "第02話", "第03話", "第04話"],
);
assert.deepStrictEqual(Array.from(manhuaguiChapters, (chapter) => chapter.chapterNumber), [1, 2, 3, 4]);

console.log("source regressions: Baozi, DM5, and Manhuagui verified");
