'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
for (const artifact of ['plugins/zh.wnacg.js', 'merged-shuyue/shinsou/plugins/zh.wnacg.js']) {
  const script = fs.readFileSync(path.join(root, artifact), 'utf8');
  const url = '//img5.qy0.ru/data/fixture/001.jpg?verify=fixture-token&x=1';
  const plain = 'var fast_img_host=""; var imglist=[{url: fast_img_host+' + JSON.stringify(url) + '}];';
  const wrapped = 'document.writeln(' + JSON.stringify('\t\t' + plain).replace(/\\t/g, '\t') + ');';
  for (const html of [plain, wrapped]) {
    const context = vm.createContext({
      bridge: {httpGetWithHeaders: () => html},
      Page: function(index, url, imageUrl) {Object.assign(this, {index, url, imageUrl});},
    });
    vm.runInContext(script, context);
    const pages = context.source.getPageList({url:'/photos-index-aid-1.html'});
    assert.equal(pages.length, 1);
    assert.equal(pages[0].imageUrl, 'https:' + url);
  }
}
console.log('WNACG reader: plain/wrapped gallery literals retain complete signed query');
