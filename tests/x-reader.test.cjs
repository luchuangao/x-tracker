const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function installBackground(ctx) {
  const execute=ctx.chrome.scripting?.executeScript;
  if(execute) ctx.chrome.scripting.executeScript=options=>options.files?Promise.resolve([]):options.func.name==='xReaderDocumentReady'?Promise.resolve([{result:true}]):execute(options);
  vm.runInContext(source('x-reader-background.js'),ctx);
}
function background(fail = false) {
  const calls = [];
  const ctx = vm.createContext({ chrome: { runtime: { onMessage: { addListener() {} } }, tabs: {
    async create(options) { calls.push(options); return { id: 12 }; },
    async get() { return { status: 'complete' }; },
    async remove(id) { calls.push({ removed: id }); }
  }, scripting: { async executeScript() { if (fail) throw Error('Failure'); return [{ result: { tweets: [], cursor: null } }]; } } }, setTimeout, Date });
  installBackground(ctx);
  return { ctx, calls };
}
test('fetch uses an inactive tab, reply filter and cursor, then closes it', async () => {
  const { ctx, calls } = background();
  await ctx.readXPage({ handle: 'someone', cursor: '1234', replies: false });
  assert.equal(calls[0].active, false);
  assert.match(new URL(calls[0].url).searchParams.get('q'), /from:someone -filter:replies max_id:1234/);
  assert.equal(calls.at(-1).removed, 12);
});
test('scraping failures also close the temporary tab', async () => {
  const { ctx, calls } = background(true);
  await assert.rejects(ctx.readXPage({ handle: 'someone' }), /Failure/);
  assert.equal(calls.at(-1).removed, 12);
});
test('rejects usernames that could inject search operators', async () => {
  const { ctx, calls } = background();
  await assert.rejects(ctx.readXPage({ handle: 'someone OR from:other' }), /Invalid/);
  assert.equal(calls.length, 0);
});
test('background honors a small page size and reads a committed loading page', async () => {
  const {ctx}=background();
  const scripts=[];
  ctx.chrome.tabs.get=async()=>({status:'loading',url:'https://x.com/search?q=from%3Asomeone'});
  ctx.chrome.scripting.executeScript=async options=>{if(options.files)return [];if(options.func.name==='xReaderDocumentReady')return [{result:true}];scripts.push(options);return [{result:{tweets:[]}}];};
  await ctx.readXPage({handle:'someone',cursor:'200',limit:3});
  await ctx.readXPage({handle:'someone',cursor:'100',limit:999});
  assert.equal(scripts[0].args[1],3);
  assert.equal(scripts[1].args[1],5);
});
class Element {
  constructor() { this.children = []; this.classList = { add() {}, remove() {}, toggle() {} }; this.handlers = {}; this.scrollHeight = 1000; this.clientHeight = 500; this.scrollTop = 0; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, fn) { this.handlers[name] = fn; }
}
function reader() {
  const elements = Object.fromEntries(['xt-content', 'feedView', 'listsView'].map(id => [id, new Element()]));
  const pending = [];
  const ctx = vm.createContext({ window: {}, document: { getElementById: id => elements[id], querySelector: () => null, createElement: () => new Element() }, chrome: { runtime: { sendMessage: request => new Promise(resolve => pending.push({ request, resolve })) } }, Date, URL });
  vm.runInContext(source('x-reader.js'), ctx);
  return { api: ctx.window.xReader, elements, pending, ctx };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('initial view shows one latest post without date restriction; scroll loads older posts', async () => {
  const { api, elements, pending } = reader();
  api.open({ handle: 'someone' }, false, 'zh');
  pending[0].resolve({ tweets: [{ id: '200', time: new Date().toISOString(), text: 'new', media: [] }, { id: '100', time: new Date(Date.now() - 2 * 86400000).toISOString(), text: 'old', media: [] }], cursor: '99' });
  await flush();
  const view = elements['xt-content'].children[0];
  assert.equal(view.children[1].children.length, 1);
  elements['xt-content'].scrollTop = 450;
  elements['xt-content'].handlers.scroll();
  assert.equal(pending[1].request.cursor, '199');
  assert.equal(pending[0].request.limit, 1);
  assert.equal(pending[0].request.since, undefined);
  assert.equal(pending[1].request.limit, 5);
  pending[1].resolve({ tweets: [{ id: '100', time: new Date(Date.now() - 2 * 86400000).toISOString(), text: 'old', media: [] }], cursor: '99' });
  await flush();
  assert.equal(view.children[1].children.length, 2);
});
test('late responses cannot replace the next user and errors are retryable', async () => {
  const { api, elements, pending } = reader();
  api.open({ handle: 'first' }, false, 'en');
  api.open({ handle: 'second' }, false, 'en');
  pending[0].resolve({ tweets: [{ id: '200', time: new Date().toISOString(), text: 'wrong', media: [] }], cursor: '199' });
  pending[1].resolve({ error: 'Login required' });
  await flush();
  const view = elements['xt-content'].children[0];
  assert.equal(view.children[1].children.length, 0);
  assert.equal(view.children[3].textContent, 'Retry');
  view.children[3].handlers.click();
  assert.equal(pending[2].request.handle, 'second');
  assert.equal(pending[2].request.limit, 1);
});

test('a latest post older than 24h is displayed and wheel loads more in a short panel', async () => {
  const { api, elements, pending } = reader();
  api.open({ handle: 'someone' }, false, 'zh');
  pending[0].resolve({ tweets: [{ id: '100', time: new Date(Date.now() - 7 * 86400000).toISOString(), text: 'last week', media: [] }], cursor: '99' });
  await flush();
  const root = elements['xt-content'];
  assert.equal(root.children[0].children[1].children.length, 1);
  root.scrollHeight = root.clientHeight;
  root.handlers.wheel({ deltaY: 50 });
  assert.equal(pending[1].request.cursor, '99');
  root.handlers.wheel({ deltaY: 50 });
  assert.equal(pending.length, 2);
});

test('translation preserves English and PNG export receives the displayed Chinese', async () => {
  const { api, elements, pending, ctx } = reader();
  let saved;
  ctx.window.xPostTools = { translate: async () => '中文译文', preview: async (tweet, chinese, handle, options) => { saved = { tweet, chinese, options }; } };
  api.open({ handle: 'someone' }, false, 'en');
  pending[0].resolve({ tweets: [{ id: '100', time: new Date().toISOString(), text: 'Original English', media: [] }], cursor: '99' });
  await flush();
  const body = elements['xt-content'].children[0].children[1].children[0].children[1];
  const actions = body.children.find(child => child.className === 'x-post-footer').children.find(child => child.className === 'x-post-actions');
  await actions.children[0].handlers.click();
  assert.equal(body.children[1].textContent, 'Original English');
  assert.equal(body.children[2].children[0].textContent, '中文译文');
  assert.equal(body.children[2].hidden, false);
  await actions.children[1].handlers.click();
  assert.equal(saved.chinese, '中文译文');
  assert.equal(saved.tweet.text, 'Original English');
  assert.equal(saved.options.style, 'mist');
  await actions.children[0].handlers.click();
  await actions.children[1].handlers.click();
  assert.equal(saved.chinese, '');
});

test('scraper returns ready text immediately and captures available author/media assets', async () => {
  let passes = 0;
  const photo = { currentSrc: 'https://pbs.twimg.com/media/photo.jpg', src: '', closest: () => null };
  const avatar = { currentSrc: 'https://pbs.twimg.com/profile_images/avatar.jpg', src: '', closest: selector => selector === 'a' ? ({getAttribute: () => '/someone'}) : null };
  const article = {
    querySelector(selector) {
      if (selector === 'time') return { dateTime: new Date().toISOString(), closest: () => ({ getAttribute: () => '/someone/status/200' }) };
      if (selector === '[data-testid="User-Name"]') return { innerText: 'Someone\n@someone', querySelector: () => ({}) };
      if (selector === '[data-testid="tweetText"]') return { innerText: 'Post text' };
      if (selector === 'a[href$="/analytics"]') return { innerText: '101K' };
      return null;
    },
    querySelectorAll(selector) { return selector === 'img' ? [avatar, photo] : []; }
  };
  const ctx = vm.createContext({ chrome: { runtime: { onMessage: { addListener() {} } } }, location: { pathname: '/search', origin: 'https://x.com' }, document: { querySelector: () => null, querySelectorAll: () => [article] }, URL, Date, setTimeout: callback => { passes++; callback(); }, window: { scrollBy: () => { throw Error('Should not scroll past latest post while images hydrate'); } } });
  installBackground(ctx);
  const result = await ctx.scrapeXReaderPage('someone', 1);
  assert.equal(passes, 0);
  assert.equal(result.tweets[0].avatar, avatar.currentSrc);
  assert.equal(result.tweets[0].media[0], photo.currentSrc);
  assert.equal(result.tweets[0].verified, true);
  assert.equal(result.tweets[0].metrics.views, '101K');
});

test('one cached avatar is attached to every post, including posts without avatar URLs', async () => {
  const calls = [];
  const local = 'data:image/png;base64,aGVsbG8=';
  const ctx = vm.createContext({ chrome: { runtime: { onMessage: { addListener() {} } }, tabs: {create: async () => ({id: 1}), get: async () => ({status: 'complete'}), remove: async () => {}}, scripting: {executeScript: async () => [{result: {tweets: [{avatar: '', id: '20'}, {avatar: 'https://pbs.twimg.com/profile_images/1/avatar.jpg', avatarOwner:'someone', id: '10'}]}}]} }, URL, Date,
    xAvatarCache: {resolve: async (handle, url) => {calls.push({handle, url}); return local;}}
  });
  installBackground(ctx);
  const result = await ctx.readXPage({handle: 'someone'});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].handle, 'someone');
  assert.equal(result.tweets[0].avatar, local);
  assert.equal(result.tweets[1].avatar, local);
});

test('avatar profile failures do not discard successfully fetched tweets', async () => {
  const ctx = vm.createContext({ chrome: { runtime: { onMessage: { addListener() {} } }, tabs: {create: async () => ({id: 1}), get: async () => ({status: 'complete'}), update: async () => {throw Error('profile unavailable')}, remove: async () => {}}, scripting: {executeScript: async request => request.func.name === 'scrapeXReaderPage' ? [{result: {tweets: [{avatar: '', id: '20', text: 'Keep this tweet'}]}}] : [{result: {error: 'missing avatar'}}]} }, URL, Date,
    xAvatarCache: {resolve: async () => null, inspect: async () => ({saved: false})}
  });
  installBackground(ctx);
  const result = await ctx.readXPage({handle: 'someone'});
  assert.equal(result.tweets[0].text, 'Keep this tweet');
  assert.equal(result.avatarError, undefined);
  assert.equal(result.avatarStatus.saved, false);
});
test('homepage repair reports its real error and closes the background tab', async () => {
  let removed = false;
  const ctx = vm.createContext({ chrome: { runtime: { onMessage: { addListener() {} } }, tabs: {create: async () => ({id: 1}), get: async () => ({status: 'complete'}), remove: async () => {removed = true}}, scripting: {executeScript: async () => [{result: {error: 'Login required'}}]} }, URL, Date,
    xAvatarCache: {resolve: async () => null, inspect: async () => ({saved: false, error: null})}
  });
  installBackground(ctx);
  const result = await ctx.repairXAvatar('someone');
  assert.equal(result.error, 'Login required');
  assert.equal(result.saved, false);
  assert.equal(removed, true);
});

test('scraper skips unrelated and quoted avatars and binds only the author image', async () => {
  const makeImage = (src, owner, quoted = false) => ({src, closest: selector => selector === 'a' ? {getAttribute: () => `/${owner}`} : selector === '[data-testid="quoteTweet"]' && quoted ? {} : null});
  const other = makeImage('https://pbs.twimg.com/profile_images/1/other.jpg', 'other');
  const quote = makeImage('https://pbs.twimg.com/profile_images/2/quote.jpg', 'someone', true);
  const author = makeImage('https://pbs.twimg.com/profile_images/3/author.jpg', 'someone');
  const article = {
    querySelector(selector) { return selector === 'time' ? {dateTime:new Date().toISOString(),closest:()=>({getAttribute:()=>'/someone/status/200'})} : selector === '[data-testid="tweetText"]' ? {innerText:'Author post'} : null; },
    querySelectorAll(selector) { return selector === 'img' ? [other, quote, author] : []; }
  };
  const ctx = vm.createContext({chrome:{runtime:{onMessage:{addListener(){}}}},location:{pathname:'/search',origin:'https://x.com'}, document:{querySelector:()=>null,querySelectorAll:()=>[article]},URL,Date,setTimeout:callback=>callback(),window:{scrollBy(){}}});
  installBackground(ctx);
  const result = await ctx.scrapeXReaderPage('someone',1);
  assert.equal(result.tweets[0].avatar, author.src);
  assert.equal(result.tweets[0].avatarOwner,'someone');
});

test('an avatar without verified account ownership is never returned as this account image', async () => {
  const calls=[];
  const ctx = vm.createContext({chrome:{runtime:{onMessage:{addListener(){}}},tabs:{create:async()=>({id:1}),get:async()=>({status:'complete'}),update:async()=>{},remove:async()=>{}},scripting:{executeScript:async request=>[{result:request.func.name==='scrapeXReaderPage'?{tweets:[{id:'20',avatar:'https://pbs.twimg.com/profile_images/1/other.jpg',avatarOwner:'other'}]}:{error:'no author image'}}]}},URL,Date,xAvatarCache:{resolve:async(handle,url)=>{calls.push(url);return null},inspect:async()=>({saved:false})}});
  installBackground(ctx);
  const result=await ctx.readXPage({handle:'someone'});
  assert.equal(calls[0],'');
  assert.equal(result.tweets[0].avatar,'');
});

test('cached content appears before the network and survives a login failure', async () => {
  const {api,elements,pending,ctx}=reader();
  const tweet={id:'200',handle:'someone',time:new Date().toISOString(),text:'Cached English',media:[],translation:'缓存译文',translationSource:'chrome'};
  ctx.navigator={onLine:true};
  ctx.window.xPostStore={page:async()=>({tweets:[tweet]}),hydrate:async value=>value,touch:async()=>{},release(){}};
  api.open({handle:'someone'},false,'zh');
  await flush();
  const view=elements['xt-content'].children[0];
  assert.equal(view.children[1].children.length,1);
  assert.equal(view.children[1].children[0].children[1].children[2].children[0].textContent,'缓存译文');
  pending[0].resolve({error:'Login required'});
  await flush();
  assert.equal(view.children[1].children.length,1);
  assert.equal(view.children[2].textContent,'');
});

test('late cache hydration cannot alter the next account or its paging controls', async () => {
  const {api,elements,pending,ctx}=reader();
  let finishHydration;
  const held=new Promise(resolve=>finishHydration=resolve);
  const first={id:'200',handle:'first',time:new Date().toISOString(),text:'Old account',media:[]};
  ctx.navigator={onLine:true};
  ctx.window.xPostStore={page:async handle=>({tweets:handle==='first'?[first]:[]}),hydrate:async value=>value.handle==='first'?held:value,remember:async value=>value,touch:async()=>{},release(){}};
  api.open({handle:'first'},false,'en');await flush();
  api.open({handle:'second'},false,'zh');await flush();
  pending[0].resolve({tweets:[{...first,id:'100',handle:'second',text:'Current account'}]});await flush();
  finishHydration(first);await flush();
  const view=elements['xt-content'].children[0];
  assert.equal(view.children[1].children.length,1);
  assert.equal(view.children[1].children[0].children[1].children[1].textContent,'Current account');
  assert.equal(view.children[3].textContent,'加载');
  elements['xt-content'].scrollTop=450;elements['xt-content'].handlers.scroll();await flush();
  assert.equal(pending[1].request.handle,'second');
  assert.equal(pending[1].request.cursor,'99');
});

test('every older page is persisted and remains readable when X returns empty', async () => {
  const {api,elements,pending,ctx}=reader();
  const records=new Map();
  const make=id=>({id:String(id),handle:'someone',time:new Date().toISOString(),text:`Post ${id}`,media:[]});
  ctx.navigator={onLine:true};
  ctx.window.xPostStore={
    page:async(handle,replies,cursor,limit)=>({tweets:[...records.values()].filter(t=>!cursor || BigInt(t.id)<=BigInt(cursor)).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,limit)}),
    remember:async tweet=>{records.set(tweet.id,tweet);return tweet;},
    hydrate:async tweet=>tweet,touch:async()=>{},release(){}
  };
  api.open({handle:'someone'},false,'zh');await flush();
  pending[0].resolve({tweets:[make(200),make(190)]});await flush();
  assert.deepEqual([...records.keys()],['200']);
  const view=elements['xt-content'].children[0];
  view.children[3].handlers.click();await flush();
  pending[1].resolve({tweets:[make(190),make(180)]});await flush();
  view.children[3].handlers.click();await flush();
  pending[2].resolve({tweets:[make(170),make(160)]});await flush();
  assert.deepEqual([...records.keys()],['200','190','180','170','160']);
  assert.equal(view.children[1].children.length,5);
  api.refresh();await flush();
  pending[3].resolve({tweets:[]});await flush();
  assert.equal(view.children[1].children.length,1);
  view.children[3].handlers.click();await flush();
  assert.equal(pending.length,4);
  assert.equal(view.children[1].children.length,5);
  assert.equal(view.children[2].textContent,'');
});

test('offline browsing reads all local pages after the initial single post', async () => {
  const {api,elements,pending,ctx}=reader();
  const records=Array.from({length:46},(_,i)=>({id:String(200-i),handle:'someone',time:new Date().toISOString(),text:`Cached ${i}`,media:[]}));
  ctx.navigator={onLine:false};
  ctx.window.xPostStore={page:async(handle,replies,cursor,limit)=>({tweets:records.filter(t=>!cursor || BigInt(t.id)<=BigInt(cursor)).slice(0,limit)}),hydrate:async tweet=>tweet,touch:async()=>{},release(){}};
  api.open({handle:'someone'},false,'zh');await flush();
  const view=elements['xt-content'].children[0];
  assert.equal(view.children[1].children.length,1);
  for (const count of [6,11,16,21,26,31,36,41,46]) {
    view.children[3].handlers.click();await flush();
    assert.equal(view.children[1].children.length,count);
  }
  view.children[3].handlers.click();await flush();
  assert.equal(view.children[3].hidden,true);
  assert.equal(pending.length,0);
});

test('new live posts bridge the gap before local history is used', async () => {
  const {api,elements,pending,ctx}=reader();
  const make=id=>({id:String(id),handle:'someone',time:new Date().toISOString(),text:`Post ${id}`,media:[]});
  const records=[200,190,180,170,100].map(make);
  ctx.navigator={onLine:true};
  ctx.window.xPostStore={page:async(handle,replies,cursor,limit)=>({tweets:records.filter(t=>!cursor || BigInt(t.id)<=BigInt(cursor)).slice(0,limit)}),remember:async tweet=>tweet,hydrate:async tweet=>tweet,touch:async()=>{},release(){}};
  api.open({handle:'someone'},false,'zh');await flush();
  pending[0].resolve({tweets:[make(210)]});await flush();
  const view=elements['xt-content'].children[0];
  view.children[3].handlers.click();await flush();
  assert.equal(pending[1].request.cursor,'209');
  pending[1].resolve({tweets:[make(205),make(200)]});await flush();
  assert.deepEqual(view.children[1].children.map(article=>article.children[1].children[1].textContent),['Post 210','Post 205','Post 200']);
  view.children[3].handlers.click();await flush();
  assert.equal(pending.length,2);
  assert.deepEqual(view.children[1].children.slice(-4).map(article=>article.children[1].children[1].textContent),['Post 190','Post 180','Post 170','Post 100']);
});

test('a stalled online refresh cannot block scrolling through cached posts', async () => {
  const {api,elements,pending,ctx}=reader();
  const records=Array.from({length:12},(_,i)=>({id:String(200-i),handle:'someone',time:new Date().toISOString(),text:`Cached ${i}`,media:[]}));
  ctx.navigator={onLine:true};
  ctx.window.xPostStore={page:async(handle,replies,cursor,limit)=>({tweets:records.filter(t=>!cursor || BigInt(t.id)<=BigInt(cursor)).slice(0,limit)}),hydrate:async tweet=>tweet,remember:async tweet=>tweet,touch:async()=>{},release(){}};
  api.open({handle:'someone'},false,'zh');await flush();
  const view=elements['xt-content'].children[0];
  assert.equal(pending.length,1);
  assert.equal(view.children[3].disabled,false);
  for (const count of [6,11,12]) {
    elements['xt-content'].handlers.wheel({deltaY:50});await flush();
    // The mock panel's bottom scroll position is needed for subsequent pages.
    if(view.children[1].children.length<count) {view.children[3].handlers.click();await flush();}
    assert.equal(view.children[1].children.length,count);
    assert.equal(view.children[3].textContent,'加载');
  }
  assert.equal(pending.length,1);
  pending[0].resolve({tweets:[{...records[0],id:'300',text:'Fresh result'}]});await flush();
  assert.equal(view.children[1].children.length,12);
  assert.equal(view.children[1].children[0].children[1].children[1].textContent,'Cached 0');
});

test('avatar warming starts independently and never blocks the returned posts', async () => {
  const {api,elements,pending,ctx}=reader();
  ctx.navigator={onLine:true};
  api.open({handle:'someone'},false,'zh');
  pending[0].resolve({tweets:[{id:'200',handle:'someone',time:new Date().toISOString(),text:'Ready text',media:[],avatarSource:'https://pbs.twimg.com/profile_images/1/avatar.jpg'}],avatarStatus:{saved:false}});
  await flush();
  assert.equal(elements['xt-content'].children[0].children[1].children.length,1);
  assert.equal(elements['xt-content'].children[0].children[3].disabled,false);
  assert.equal(pending[1].request.action,'X_READER_AVATAR_WARM');
  assert.equal(pending[1].request.source,'https://pbs.twimg.com/profile_images/1/avatar.jpg');
});

test('a pending photo gets one short hydration pass without filling a large batch', async () => {
  let passes=0;const waits=[];
  const photo={src:'https://pbs.twimg.com/media/photo.jpg',closest:()=>null};
  const article={
    querySelector:selector=>selector==='time'?{dateTime:new Date().toISOString(),closest:()=>({getAttribute:()=>'/someone/status/200'})}:selector==='[data-testid="tweetText"]'?{innerText:'Photo post'}:selector==='[data-testid="tweetPhoto"]'?{}:null,
    querySelectorAll:selector=>selector==='img' && passes?[photo]:[]
  };
  const ctx=vm.createContext({chrome:{runtime:{onMessage:{addListener(){}}}},location:{pathname:'/search',origin:'https://x.com'},document:{querySelector:()=>null,querySelectorAll:()=>[article]},URL,Date,setTimeout:(callback,ms)=>{passes++;waits.push(ms);callback();},window:{scrollBy(){throw Error('Do not scroll X to fill this batch');}}});
  installBackground(ctx);
  const result=await ctx.scrapeXReaderPage('someone',5);
  assert.equal(result.tweets.length,1);
  assert.equal(result.tweets[0].media[0],photo.src);
  assert.deepEqual(waits,[200]);
});

test('Chrome translations update saved rows and card previews without removing favorites',async()=>{
 const {api,elements,ctx}=reader();let notify,exported;
 const post={id:'200',handle:'someone',time:new Date().toISOString(),text:'English',media:[],translation:'Cached X text',translationSource:'x',savedAt:1};
 ctx.window.xPostStore={onChange:fn=>{notify=fn;},collection:async()=>({tweets:[post],hasMore:false}),hydrate:async p=>p,release(){}};
 ctx.window.xPostTools={preview:async(p,zh)=>{exported=zh;}};
 api.openCollection('saved','zh');await flush();
 const body=elements['xt-content'].children[0].children[0].children[0].children[1];
 assert.equal(body.children[2].hidden,true);
 notify({type:'post',id:'200',translation:'Chrome 的中文',translationSource:'chrome'});
 assert.equal(body.children[2].hidden,false);assert.equal(body.children[2].children[0].textContent,'Chrome 的中文');
 const footer=body.children.find(n=>n.className==='x-post-footer');
 await footer.children.find(n=>n.className==='x-post-actions').children[1].handlers.click();assert.equal(exported,'Chrome 的中文');
 assert.equal(elements['xt-content'].children[0].children[0].children.length,1);
});
