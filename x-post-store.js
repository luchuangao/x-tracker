// IndexedDB stores post snapshots and image bytes without filling storage.local.
globalThis.xPostStore = (() => {
  let database;
  const listeners = new Set(), jobs = new Map(), localUrls = new Set();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('x-tracker-posts-v1') : null;
  channel?.addEventListener('message', event => listeners.forEach(fn => fn(event.data)));
  function emit(event) { listeners.forEach(fn => fn(event)); channel?.postMessage(event); }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('x-tracker-reading', 2);
      request.onupgradeneeded = () => {
        const posts = request.result.objectStoreNames.contains('posts') ? request.transaction.objectStore('posts') : request.result.createObjectStore('posts', {keyPath:'id'});
        if (!posts.indexNames.contains('handle')) posts.createIndex('handle', 'handle');
        if (!posts.indexNames.contains('handleId')) posts.createIndex('handleId', ['handle','sortId']);
        if (!request.result.objectStoreNames.contains('media')) request.result.createObjectStore('media', {keyPath:'url'});
        // Add the paging index to existing snapshots without replacing them.
        const scan=posts.openCursor();
        scan.onsuccess=()=>{const cursor=scan.result;if(cursor){cursor.update({...cursor.value,sortId:String(cursor.value.id).padStart(25,'0')});cursor.continue();}};
      };
      request.onsuccess = () => { const value=request.result; value.onversionchange=()=>{value.close(); database=null;}; resolve(value); };
      request.onerror = () => { database=null; reject(request.error); };
      request.onblocked = () => { database=null; reject(Error('请关闭其他侧栏后重试本地存储')); };
    });
    return database;
  }
  function request(req) { return new Promise((resolve, reject) => {req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); }
  function complete(tx) {
    const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error || Error('本地存储写入失败'));tx.onerror=()=>{};});
    done.catch(()=>{}); // A request failure may be caught before the transaction aborts.
    return done;
  }
  async function get(id) { return request((await db()).transaction('posts').objectStore('posts').get(String(id))); }
  async function all(handle) {
    const store=(await db()).transaction('posts').objectStore('posts');
    return request(handle ? store.index('handle').getAll(handle) : store.getAll());
  }
  function normalize(tweet) {
    const id=String(tweet.id), handle=String(tweet.handle || '').replace(/^@/,'').toLowerCase();
    if (!/^\d{1,25}$/.test(id) || !/^[a-z0-9_]{1,15}$/.test(handle) || !Number.isFinite(Date.parse(tweet.time))) throw Error('推文数据不完整，无法存入本地');
    const imageUrl=value=>{try{const u=new URL(value);return u.protocol==='https:' && ['pbs.twimg.com','abs.twimg.com'].includes(u.hostname)?u.href:null;}catch{return null;}};
    const media=(tweet.mediaOriginal || tweet.media || []).map(imageUrl).filter(Boolean).slice(0,4);
    return {id,sortId:id.padStart(25,'0'),handle,time:tweet.time,text:String(tweet.text || ''),language:String(tweet.language || ''),name:String(tweet.name || handle),verified:!!tweet.verified,avatar:imageUrl(tweet.avatarSource || tweet.avatar) || '',media,metrics:{reply:String(tweet.metrics?.reply || ''),retweet:String(tweet.metrics?.retweet || ''),like:String(tweet.metrics?.like || ''),views:String(tweet.metrics?.views || '')},quote:tweet.quote?{name:String(tweet.quote.name || ''),text:String(tweet.quote.text || '')}:null,hasVideo:!!tweet.hasVideo,url:`https://x.com/${handle}/status/${id}`};
  }
  async function update(id, change) {
    const tx=(await db()).transaction('posts','readwrite'), done=complete(tx), store=tx.objectStore('posts');
    const old=await request(store.get(String(id)));
    const value=change(old);
    if (value) store.put(value);
    await done;
    return value;
  }
  async function remember(tweet, options={}) {
    const snapshot=normalize(tweet);
    const record=await update(snapshot.id, old=>({...old,...snapshot,
      // A fast, partly hydrated X page must not erase assets already cached
      // for the same unchanged text.
      media:!snapshot.media.length && old?.text===snapshot.text ? old.media || [] : snapshot.media,
      quote:snapshot.quote || (old?.text===snapshot.text ? old.quote : null),
      hasVideo:snapshot.hasVideo || !!(old?.text===snapshot.text && old.hasVideo),
      visitedAt:Date.now(),savedAt:old?.savedAt || 0,
      translation:old?.text===snapshot.text ? old.translation || '' : '',
      translationSource:old?.text===snapshot.text ? old.translationSource || '' : '',
      translationOriginal:old?.text===snapshot.text ? old.translationOriginal || '' : '',
      visibleWithoutReplies:old?.visibleWithoutReplies || options.replies===false}));
    // Browsing is immediately durable; image fetching continues separately.
    cacheMedia(record.media);
    return record;
  }
  async function touch(id) { return update(id,old=>old?{...old,visitedAt:Date.now()}:null); }
  async function translation(id, text, options={}) {
    const record=await update(id, old=>old && (!options.original || old.text===options.original)?{...old,translation:String(text),translationSource:options.source || '',translationOriginal:old.text}:null);
    if (!record) throw Error('推文尚未保存，请重试');
    emit({type:'post',id:record.id,savedAt:record.savedAt,translation:record.translation,translationSource:record.translationSource});
  }
  async function setSaved(tweet, saved) {
    const snapshot=normalize(tweet);
    const record=await update(snapshot.id, old=>({...old,...snapshot,visitedAt:old?.visitedAt || Date.now(),savedAt:saved?(old?.savedAt || Date.now()):0,translation:old?.translation || tweet.translation || '',translationSource:old?.text===snapshot.text ? old?.translationSource || '' : tweet.translationSource || '',translationOriginal:old?.translationOriginal || tweet.text}));
    cacheMedia(record.media);
    emit({type:'post',id:record.id,savedAt:record.savedAt});
    if (!saved) await trim();
    return record;
  }
  function byId(a,b) { return BigInt(a.id)>BigInt(b.id)?-1:BigInt(a.id)<BigInt(b.id)?1:0; }
  async function page(handle, replies, cursor, limit=20) {
    const normalized=String(handle).replace(/^@/,'').toLowerCase();
    const store=(await db()).transaction('posts').objectStore('posts');
    const range=IDBKeyRange.bound([normalized,'0'.repeat(25)],[normalized,cursor?String(cursor).padStart(25,'0'):'9'.repeat(25)]);
    // Read only the next batch, rather than materializing the entire local
    // timeline every time the user scrolls through a large cache.
    return new Promise((resolve,reject)=>{
      const tweets=[], scan=store.index('handleId').openCursor(range,'prev');
      scan.onerror=()=>reject(scan.error);
      scan.onsuccess=()=>{
        const item=scan.result;
        if (!item) {resolve({tweets,hasMore:false});return;}
        if (replies || item.value.visibleWithoutReplies) tweets.push(item.value);
        if (tweets.length>limit) {resolve({tweets:tweets.slice(0,limit),hasMore:true});return;}
        item.continue();
      };
    });
  }
  async function collection(mode, cursor, limit=20) {
    const field=mode==='saved'?'savedAt':'visitedAt';
    const records=(await all()).filter(post=>post[field]>0 && (!cursor || post[field]<cursor.at || post[field]===cursor.at && BigInt(post.id)<BigInt(cursor.id))).sort((a,b)=>b[field]-a[field] || byId(a,b));
    const tweets=records.slice(0,limit), last=tweets.at(-1);
    return {tweets,hasMore:records.length>limit,cursor:last?{at:last[field],id:last.id}:null};
  }
  let trimming=Promise.resolve();
  function trim() {
    trimming=trimming.catch(()=>{}).then(async()=>{
      const tx=(await db()).transaction(['posts','media'],'readwrite'),done=complete(tx);
      const store=tx.objectStore('posts'), media=tx.objectStore('media');
      const [records,assets]=await Promise.all([request(store.getAll()),request(media.getAllKeys())]);
      // Every browsed post and its downloaded images remain available, even
      // without a bookmark. Only remove images no snapshot references anymore.
      const references=new Set(records.flatMap(post=>post.media));
      for (const url of assets) if (!references.has(url)) media.delete(url);
      await done;
    });
    return trimming;
  }
  function cacheMedia(urls) {
    for (const url of urls) {
      if (jobs.has(url)) continue;
      const job=(async()=>{
        const existing=await request((await db()).transaction('media').objectStore('media').get(url));
        if (existing) return;
        const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(15000)});
        if (!response.ok || Number(response.headers.get('content-length'))>10*1024*1024) throw Error('图片未缓存');
        const blob=await response.blob();
        if (!blob.type.startsWith('image/') || blob.size>10*1024*1024) throw Error('图片未缓存');
        const bitmap=await createImageBitmap(blob);bitmap.close();
        const tx=(await db()).transaction('media','readwrite'),done=complete(tx);
        tx.objectStore('media').put({url,blob,updatedAt:Date.now()});await done;
      })().catch(()=>{}).finally(()=>{ jobs.delete(url); if (!jobs.size) trim().catch(()=>{}); });
      jobs.set(url,job);
    }
  }
  async function hydrate(tweet) {
    const hydrated={...tweet,mediaOriginal:tweet.media || [],media:[]};
    try {
    for (const url of tweet.media || []) {
      const asset=await request((await db()).transaction('media').objectStore('media').get(url));
      if (asset) {const local=URL.createObjectURL(asset.blob);localUrls.add(local);hydrated.media.push(local);} else hydrated.media.push(url);
    }
    hydrated.avatar=await globalThis.xAvatarCache?.resolve(tweet.handle,'').catch(()=>null) || tweet.avatar;
    return hydrated;
    } catch (error) { release(hydrated); throw error; }
  }
  function isLocalUrl(url) { return localUrls.has(url); }
  function release(tweet) { for(const url of tweet.media || []) if(localUrls.delete(url)) URL.revokeObjectURL(url); }
  async function flush() { await Promise.all([...jobs.values()]);await trim(); }
  return {get,remember,touch,translation,setSaved,page,collection,hydrate,release,isLocalUrl,onChange,flush};
})();
