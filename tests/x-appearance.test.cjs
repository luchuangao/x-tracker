const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','x-appearance.js'),'utf8'),ctx);
const api=ctx.xAppearance;
test('invalid stored colors cannot inject styles and valid custom colors survive normalization',()=>{
 const normalized=api.normalize({logoColor:'url(https://example.com)',backgroundColor:'#fff; color:red'});
 assert.equal(normalized.logoColor,api.defaults.logoColor);assert.equal(normalized.backgroundColor,api.defaults.backgroundColor);
 assert.equal(api.normalize({logoColor:'#ABCDEF',backgroundColor:'#123456'}).logoColor,'#abcdef');
 assert.equal(api.normalize(null).backgroundColor,api.defaults.backgroundColor);
});
function luminance(hex){const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('main and secondary text remain readable across preset and arbitrary backgrounds',()=>{
 const colors=[...api.backgroundColors,'#000000','#ffffff','#707070','#777777','#808080','#ff0000','#0000ff','#00ff00','#ffaa00'];
 for(let i=0;i<128;i++)colors.push('#'+((i*131071)%0xffffff).toString(16).padStart(6,'0'));
 for(const backgroundColor of colors){const theme=api.theme({backgroundColor});for(const key of ['--xt-ink','--xt-muted'])assert.ok(contrast(theme['--xt-surface'],theme[key])>=4.5,`${backgroundColor} ${key}`);}
});
