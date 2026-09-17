'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
let response, requests = [];
const context = {
  bridge: {httpPost(url, body) {requests.push(JSON.parse(body)); return response;}, log() {}},
  MangasPage: function(mangas, hasNextPage) {Object.assign(this, {mangas, hasNextPage});},
  SManga: {create: () => ({})}, SChapter: {create: () => ({})},
  Page: function(index, url, imageUrl) {Object.assign(this, {index, url, imageUrl});}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../plugins/zh.komiic.js'), 'utf8'), context);
const source = context.source;
for (const state of [0,1,2]) {
  response = JSON.stringify({data: {hotComics: [{id:'1', title:'Fixture', imageUrl:'/cover.jpg'}]}});
  assert.equal(source.getSearchManga(0,'',[{type:'select',name:'Status',state}]).mangas.length, 1);
  const query = requests.at(-1).query;
  if (state) assert.ok(query.includes('status: "' + ['','ONGOING','END'][state] + '"'));
  else assert.ok(!query.includes('status:'));
}
for (const term of ['fixture', 'quote"text', 'line\ntext', 'slash\\text']) {
  response=JSON.stringify({data:{searchComicsAndAuthors:{comics:[]}}});
  source.getSearchManga(0,term,[]);
  assert.ok(requests.at(-1).query.includes('keyword: ' + JSON.stringify(term)));
}
const calls = [
  () => source.getPopularManga(0), () => source.getLatestUpdates(0),
  () => source.getSearchManga(0,'fixture',[]),
  () => source.getMangaDetails({url:'/comic/1'}),
  () => source.getChapterList({url:'/comic/1'}),
  () => source.getPageList({url:'/chapter/2/images/all'})
];
for (const value of ['', '<html>temporary failure</html>', '{}', 'null', JSON.stringify({errors:[{message:'PRIVATE_TICKET'}],data:{imageTicketsByChapterId:[]}})]) {
  response=value;
  for(const call of calls) assert.throws(call, e => /Komiic API/.test(e.message) && !e.message.includes('PRIVATE_TICKET'));
}
response=JSON.stringify({data:{imageTicketsByChapterId:[]}});
assert.equal(source.getPageList({url:'/chapter/2/images/all'}).length,0);
for (const data of [null, {imageTicketsByChapterId:[]}]) {
  response=JSON.stringify({data, errors:[{message:'PRIVATE_TICKET',extensions:{code:'QUOTA_EXCEEDED'}}]});
  for (const call of calls) assert.throws(call, e => e.message === 'SHINSOU_SOURCE_QUOTA_EXCEEDED');
}
response=JSON.stringify({errors:[{message:'QUOTA_EXCEEDED PRIVATE_TICKET',extensions:{code:'UNKNOWN'}}]});
assert.throws(calls.at(-1), e => /Komiic API/.test(e.message) && !e.message.includes('PRIVATE_TICKET'));
response=JSON.stringify({data:{imageTicketsByChapterId:[{url:'https://img.komiic.com/fixture.jpg',ticket:'fixture&token'}]}});
const page=source.getPageList({url:'/chapter/2/images/all'})[0];
assert.equal(page.imageUrl,'https://img.komiic.com/fixture.jpg#X-Image-Ticket=fixture%26token');
console.log('Komiic regression: filter JSON, API failures, empty success, image ticket PASS');
