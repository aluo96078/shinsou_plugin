const fs = require('fs'), vm = require('vm'), assert = require('assert');
const script = fs.readFileSync(require("path").join(__dirname, "../plugins/zh.baozimh.js"), 'utf8');
function load(reply) {
  const requests = [];
  const empty = () => Object.assign([], { isEmpty() { return true; }, size() { return 0; } });
  const context = {
    bridge: { httpGetResponse(url) { requests.push(url); return reply(url); }, log() {}, domReleaseAll() {} },
    Jsoup: { parse() { return { select: empty, selectFirst() { return null; } }; } },
    MangasPage: function(items, next) { this.items = items; this.next = next; },
  };
  vm.createContext(context); vm.runInContext(script, context);
  return { source: context.source, requests };
}
const chapter = { url: '/user/page_direct?comic_id=test&section_slot=0&chapter_slot=1' };
for (const [status, body, marker] of [
  [200, '<script>window._cf_chl_opt={}</script>', 'CHALLENGE'],
  [403, 'denied', 'FORBIDDEN'],
  [403, 'sorry, you have been blocked', 'BLOCKED'],
]) {
  const run = load(() => ({ status, body }));
  assert.throws(() => run.source.getPageList(chapter), new RegExp('SHINSOU_SOURCE_HTTP_' + marker));
  assert.equal(run.requests.length, 1, 'Terminal failure must not fan out to mirrors');
}
for (const reply of [() => ({ error: 'mock network failure' }), () => ({ status: 200, body: '<html>No reader</html>' })]) {
  const run = load(reply);
  assert.throws(() => run.source.getPageList(chapter), /SHINSOU_SOURCE_HTTP_UNAVAILABLE/);
  assert.ok(run.requests.length <= 11, 'Existing finite routes only');
  assert.equal(new Set(run.requests).size, run.requests.length, 'No duplicate request URLs');
}
const emptySearch = load(() => ({ status: 200, body: '<html>No matching books</html>' }));
assert.equal(emptySearch.source.getSearchManga(0, 'no-match', []).items.length, 0);
const source = emptySearch.source;
assert.equal(source._appImageUrl('https://s1.baozicdn.com/scomic/a.jpg'), 'https://s1.baozicdn.com/w640/scomic/a.jpg');
assert.equal(source._appImageUrl('https://s1.baozicdn.com/w640/scomic/a.jpg'), 'https://s1.baozicdn.com/w640/scomic/a.jpg');
assert.equal(source._appImageUrl('https://other.com/scomic/a.jpg'), 'https://other.com/scomic/a.jpg');
assert.equal(source._appImageUrl('https://s1.bzcdn.net/scomic/a.jpg'), 'https://s1.bzcdn.net/scomic/a.jpg');
console.log('Baozi reader errors, bounded fallback, empty search and exact CDN mapping passed');
