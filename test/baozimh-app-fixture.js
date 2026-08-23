const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {
  console,
  bridge: {
    log() {},
    domReleaseAll() {},
  },
  Jsoup: { parse() { throw new Error('DOM parsing is not part of this fixture test'); } },
  SManga: { create() { return {}; }, UNKNOWN: 0, ONGOING: 1, COMPLETED: 2 },
  SChapter: { create() { return {}; } },
  Page: function Page(index, url, imageUrl) {
    this.index = index || 0;
    this.url = url || '';
    this.imageUrl = imageUrl || null;
  },
  MangasPage: function MangasPage(mangas, hasNextPage) {
    this.mangas = mangas || [];
    this.hasNextPage = !!hasNextPage;
  },
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'zh.baozimh', 'baozimh.js'), 'utf8'),
  context,
);

const source = context.source;
const chapterUrl = 'https://www.twmanga.com/comic/chapter/jidaonuzixiaoxuesheng-gokuziyosi/0_8.html';
const info = source._chapterInfo(chapterUrl);

assert.deepEqual(JSON.parse(JSON.stringify(info)), {
  slug: 'jidaonuzixiaoxuesheng-gokuziyosi',
  section: '0',
  slot: '8',
});

const appUrls = source._appChapterUrls(info);
assert.equal(
  appUrls[0],
  'https://app.baozimh.com/baozimhapp/bzmh_android/comic/chapter/jidaonuzixiaoxuesheng-gokuziyosi/0_8.html',
);
assert.ok(appUrls.includes(
  'https://appgb.baozimh.com/baozimhapp/bzmh_android/comic/chapter/jidaonuzixiaoxuesheng-gokuziyosi/0_8.html',
));

const original = 'https://s1.baozicdn.com/scomic/jidaonuzixiaoxuesheng-gokuziyosi/0/9-xi3c/1.jpg';
const image = { attr(name) { return name === 'data-src' ? original : ''; } };
assert.equal(source._pageImageSrc(image), original);
assert.equal(
  source._appImageUrl(original),
  'https://s1.baozicdn.com/w640/scomic/jidaonuzixiaoxuesheng-gokuziyosi/0/9-xi3c/1.jpg',
);
assert.equal(source._isComicPageUrl(original, info.slug), true);
assert.equal(source._isComicPageUrl(original.replace(info.slug, 'other-comic'), info.slug), false);
assert.equal(source._isBlockedResponse('<title>Just a moment...</title>'), true);

console.log('baozimh App fixture: ok');
