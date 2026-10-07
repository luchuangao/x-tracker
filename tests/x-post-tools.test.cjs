const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs'), path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','x-post-tools.js'),'utf8');
const tweet={handle:'naval',id:'200',text:'Original English'};
function tools(Translator) {
 const ctx=vm.createContext({window:{},Translator,chrome:{runtime:{sendMessage(){throw Error('Must not request X translation');}}}});
 vm.runInContext(source,ctx);return ctx.window.xPostTools;
}
test('translation restores the old Chrome API and keeps a shared translator',async()=>{
 let created=0,received=[];
 const api=tools({create(options){created++;assert.equal(options.sourceLanguage,'en');assert.equal(options.targetLanguage,'zh');return Promise.resolve({translate:async text=>{received.push(text);return '中文译文';}});}});
 assert.equal(await api.translate(tweet),'中文译文');assert.equal(await api.translate('Another original'),'中文译文');
 assert.equal(created,1);assert.deepEqual(received,['Original English','Another original']);
});
test('model creation occurs immediately during the user click and progress is forwarded',async()=>{
 let created=false,progress=[];
 const api=tools({create(options){created=true;options.monitor({addEventListener(event,handler){assert.equal(event,'downloadprogress');handler({loaded:.5});}});return Promise.resolve({translate:async()=> '中文'});}});
 const result=api.translate(tweet,value=>progress.push(value));assert.equal(created,true);
 assert.equal(await result,'中文');assert.match(progress[0],/50%/);
});
test('a failed language package initialization can be retried',async()=>{
 let count=0;
 const api=tools({create(){return count++?Promise.resolve({translate:async()=> '重试译文'}):Promise.reject(Error('Download failed'));}});
 await assert.rejects(api.translate(tweet),/Download failed/);assert.equal(await api.translate(tweet),'重试译文');
});
test('translation failures retain the engine and allow another attempt',async()=>{
 let count=0;
 const api=tools({create:async()=>({translate:async()=>{if(!count++)throw Error('Translation failed');return '译文';}})});
 await assert.rejects(api.translate(tweet),/Translation failed/);assert.equal(await api.translate(tweet),'译文');
});
test('missing Chrome API, empty input and empty output are explicit errors',async()=>{
 await assert.rejects(tools(undefined).translate(tweet),/未提供内置翻译接口/);
 await assert.rejects(tools(undefined).translate({text:' '}),/没有可翻译/);
 await assert.rejects(tools({create:async()=>({translate:async()=> ' '})}).translate(tweet),/未返回译文/);
});
