const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const path = require("node:path");
const pluginPath = path.join(__dirname, "../src/zh.manhuaren/manhuaren.js");
const pluginCode = fs.readFileSync(pluginPath, "utf8");
const context = {
    bridge: { log: function() {} },
    SManga: { UNKNOWN: 0, ONGOING: 1, COMPLETED: 2 },
    console: console
};

vm.createContext(context);
vm.runInContext(pluginCode, context, { filename: pluginPath });

const source = context.source;
assert.ok(source, "plugin exports source");

assert.equal(source._listUrl("", 0), "https://www.manhuaren.com/manhua-list/");
assert.equal(source._listUrl("s2", 1), "https://www.manhuaren.com/manhua-list-s2-p2/");
assert.equal(source._listUrl("st2-s18", 1), "https://www.manhuaren.com/manhua-list-st2-s18-p2/");

const packedScript = String.raw`eval(function(p,a,c,k,e,d){e=function(c){return(c<a?"":e(parseInt(c/a)))+((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))};if(!''.replace(/^/,String)){while(c--)d[e(c)]=k[c]||e(c);k=[function(e){return d[e]}];e=function(){return'\\w+'};c=1;};while(c--)if(k[c])p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c]);return p;}('l h=[\'4://5.6.2/8/3/0/i.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/k.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/j.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/d.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/e.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/g.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/f.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/q.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/p.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/s.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/r.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/m.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/n.7?c=0&b=9&a=1\',\'4://5.6.2/8/3/0/o.7?c=0&b=9&a=1\'];',29,29,'1817752||com|97720|https|manhua1041zjcdn63|cdndm5|jpg|98|fdfba36af7580227f2c25c66e7048f79|type|key|cid|4_8864|5_9650|7_4282|6_1813|newImgs|1_7845|3_4897|2_2667|var|12_4413|13_3578|14_6941|9_7314|8_3543|11_7994|10_3328'.split('|'),0,{}))`;
const unpacked = source._unpackScript(packedScript);
const imageUrls = source._extractImageArray(unpacked);
assert.equal(imageUrls.length, 14);
assert.equal(
    imageUrls[0],
    "https://manhua1041zjcdn63.cdndm5.com/98/97720/1817752/1_7845.jpg?cid=1817752&key=fdfba36af7580227f2c25c66e7048f79&type=1"
);

const withReferer = source._withReferer(imageUrls[0], "https://www.manhuaren.com/m1817752/");
assert.match(withReferer, /#Referer=https%3A%2F%2Fwww\.manhuaren\.com%2Fm1817752%2F$/);

assert.equal(source._chapterNumber("第17.5话"), 17.5);
assert.equal(source._statusFromText("连载中"), 1);
assert.equal(source._statusFromText("已完结"), 2);

console.log("Manhuaren smoke tests passed");
