// Isolated page requests: no shared tweet cache or persistent scraper tabs.
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (!['X_READER_PAGE','X_READER_AVATAR','X_READER_AVATAR_WARM'].includes(request.action)) return;
  const job = request.action === 'X_READER_AVATAR_WARM' ? warmXAvatar(request.handle,request.source) : request.action === 'X_READER_AVATAR' ? repairXAvatar(request.handle) : readXPage(request);
  job.then(respond, error => respond({ error: error.message }));
  return true;
});

async function readXPage({ handle, cursor, replies, limit }) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || (cursor && !/^\d{1,25}$/.test(cursor))) {
    throw new Error('Invalid X username or cursor.');
  }
  let query = `from:${handle}`;
  if (!replies) query += ' -filter:replies';
  if (cursor) query += ` max_id:${cursor}`;
  let tab;
  try {
    tab = await chrome.tabs.create({ url: `https://x.com/search?q=${encodeURIComponent(query)}&f=live`, active: false });
    let loaded = false;
    for (let i = 0; i < 50; i++) {
      const info = await chrome.tabs.get(tab.id);
      // The committed document can be read while unrelated assets still load.
      if (info.status === 'complete' || info.url?.startsWith('https://x.com/')) {
        try {
          const [check]=await chrome.scripting.executeScript({target:{tabId:tab.id},injectImmediately:true,func:xReaderDocumentReady});
          if (check?.result===true) {loaded=true;break;}
        } catch (_) { /* Navigation may not have committed yet; retry shortly. */ }
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!loaded) throw new Error('X page timed out. Please retry.');
    const count=cursor ? Math.min(5,Math.max(1,Math.floor(Number(limit)||5))) : 1;
    await chrome.scripting.executeScript({target:{tabId:tab.id},injectImmediately:true,files:['x-native-translation.js']});
    const [execution] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, injectImmediately:true, func: scrapeXReaderPage, args: [handle, count] });
    if (!execution?.result) throw new Error('Could not read X. Please retry.');
    const result = execution.result;
    if (Array.isArray(result.tweets) && result.tweets.length) {
      const candidates = result.tweets.filter(tweet => tweet.avatarOwner?.toLowerCase() === handle.toLowerCase() && xAvatarCacheSource(tweet.avatar));
      const source = candidates.find(tweet => tweet.avatar.includes('/profile_images/'))?.avatar || candidates[0]?.avatar || '';
      // Only read stored bytes here. A separate message keeps avatar repair
      // alive in the worker without delaying delivery of the tweet text.
      const localAvatar = await globalThis.xAvatarCache?.resolve(handle, '').catch(() => null);
      if (globalThis.xAvatarCache?.inspect) result.avatarStatus = await globalThis.xAvatarCache.inspect(handle);
      for (const tweet of result.tweets) {
        tweet.avatarSource = source;
        tweet.avatar = localAvatar || source || '';
      }
    }
    return result;
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}
function xReaderDocumentReady() { return location.hostname==='x.com'; }

const xAvatarWarmJobs=new Map();
function warmXAvatar(handle,source) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle || '')) return Promise.reject(Error('Invalid X username.'));
  const key=handle.toLowerCase();
  if (!xAvatarWarmJobs.has(key)) {
    const job=(async()=>{
      const data=await globalThis.xAvatarCache?.resolve(handle,xAvatarCacheSource(source)?source:'').catch(()=>null);
      if (data) return {saved:true,data};
      return repairXAvatar(handle);
    })().finally(()=>xAvatarWarmJobs.delete(key));
    xAvatarWarmJobs.set(key,job);
  }
  return xAvatarWarmJobs.get(key);
}

async function waitForXAvatarTab(tabId) {
  for (let i = 0; i < 30; i++) {
    if ((await chrome.tabs.get(tabId)).status === 'complete') return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('X 用户页面加载超时');
}
async function repairXAvatar(handle) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw Error('无效的 X 用户名');
  const tab = await chrome.tabs.create({url: `https://x.com/${handle}`, active: false});
  try {
    await waitForXAvatarTab(tab.id);
    const result = await captureAndCacheXAvatar(tab.id, handle, '');
    const status = await globalThis.xAvatarCache.inspect(handle);
    return {...result, ...status, data: result.data || await globalThis.xAvatarCache.resolve(handle, ''), error: result.error || status.error};
  } finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}
async function captureAndCacheXAvatar(tabId, handle, source) {
  try {
    const [execution] = await chrome.scripting.executeScript({target: {tabId}, func: captureXAvatarInPage, args: [handle, source]});
    const captured = execution?.result;
    if (!captured?.data) return {error: captured?.error || '没有读取到头像图片'};
    return await globalThis.xAvatarCache.saveData(handle, captured.data, captured.source);
  } catch (error) { return {error: `头像缓存失败：${error.message}`}; }
}
// Runs in X's page context, where the avatar can already be loaded by the page.
async function captureXAvatarInPage(handle, hintedSource) {
  const normalized = handle.toLowerCase();
  let selected;
  for (let pass = 0; pass < 8; pass++) {
    if (/\/(login|i\/flow\/login)/.test(location.pathname)) return {error: '需要在当前 Chrome 中登录 X'};
    const containers = Array.from(document.querySelectorAll('[data-testid^="UserAvatar-Container-"]'));
    const own = containers.find(node => node.getAttribute('data-testid').toLowerCase() === `useravatar-container-${normalized}`);
    selected = Array.from(document.querySelectorAll('img')).find(img => {
        const source = img.currentSrc || img.src;
        if (!/https:\/\/(pbs\.twimg\.com\/(profile_images|default_profile_images)\/|abs\.twimg\.com\/sticky\/default_profile_images\/)/.test(source)) return false;
        const href = img.closest('a')?.getAttribute('href');
        try { return new URL(href, location.origin).pathname.toLowerCase().replace(/\/photo$/, '').replace(/\/$/, '') === `/${normalized}`; } catch (_) { return false; }
      }) || own?.querySelector('img');
    if (selected?.naturalWidth) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  let source = selected?.currentSrc || selected?.src || hintedSource;
  if (!source || !/^https:\/\/(pbs\.twimg\.com\/(profile_images|default_profile_images)\/|abs\.twimg\.com\/sticky\/default_profile_images\/)/.test(source)) return {error: 'X 页面未提供该用户的头像。可重试或上传本地头像。'};
  let bitmap;
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
  try {
    const response = await fetch(source, {credentials: 'omit', signal: AbortSignal.timeout(8000)});
    if (!response.ok) throw Error(`图片请求失败 (${response.status})`);
    bitmap = await createImageBitmap(await response.blob());
  } catch (_) {
    if (!selected?.naturalWidth) return {error: '头像图片无法下载，请重试或上传本地头像。'};
    bitmap = selected;
  }
  try {
    const w = bitmap.naturalWidth || bitmap.width, h = bitmap.naturalHeight || bitmap.height;
    const side = Math.min(w, h);
    canvas.getContext('2d').drawImage(bitmap, (w-side)/2, (h-side)/2, side, side, 0, 0, 96, 96);
    return {data: canvas.toDataURL('image/png'), source};
  } catch (error) { return {error: `浏览器未允许读取头像图片：${error.message}`}; }
  finally { if (bitmap !== selected) bitmap?.close(); }
}

function xAvatarCacheSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ((url.hostname === 'pbs.twimg.com' && /^\/(profile_images|default_profile_images)\//.test(url.pathname)) || (url.hostname === 'abs.twimg.com' && /^\/sticky\/default_profile_images\//.test(url.pathname)));
  } catch (_) { return false; }
}

async function scrapeXReaderPage(handle, limit) {
  const posts = new Map();
  let ready = false, assetGrace=false;
  for (let pass = 0; pass < 50; pass++) {
    let pendingMedia=false;
    if (/\/(login|i\/flow\/login)/.test(location.pathname) || document.querySelector('input[autocomplete="username"]')) {
      return { error: 'Please sign in to X in this Chrome profile, then retry.' };
    }
    if (document.querySelector('[data-testid="error-detail"], [data-testid="retry"]')) {
      return { error: 'X could not load this search. Please retry.' };
    }
    const articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of articles) {
      const time = article.querySelector('time');
      const link = time?.closest('a');
      const href = link?.getAttribute('href');
      const match = href ? new URL(href, location.origin).pathname.match(/^\/([^/]+)\/status\/(\d+)/) : null;
      if (!match || match[1].toLowerCase() !== handle.toLowerCase()) continue;
      let native = typeof xNativeText==='function' ? xNativeText(article) : {};
      const text = native.text ?? article.querySelector('[data-testid="tweetText"]')?.innerText ?? '';
      const user = article.querySelector('[data-testid="User-Name"]');
      const name = user?.innerText?.split('\n').map(value => value.trim()).find(value => value && !value.startsWith('@')) || handle;
      // Select only an image linked to this post's author. An arbitrary image
      // in the article may be a quoted account, sidebar recommendation or icon.
      const ownContainer = Array.from(article.querySelectorAll('[data-testid^="UserAvatar-Container-"]')).find(node => node.getAttribute('data-testid').toLowerCase() === `useravatar-container-${handle.toLowerCase()}`);
      const authorImage = Array.from(article.querySelectorAll('img')).find(img => {
        if (img.closest('[data-testid="quoteTweet"]') || !/^https:\/\/(pbs\.twimg\.com\/(profile_images|default_profile_images)\/|abs\.twimg\.com\/sticky\/default_profile_images\/)/.test(img.currentSrc || img.src)) return false;
        const href = img.closest('a')?.getAttribute('href');
        if (!href) return false;
        try { return new URL(href, location.origin).pathname.toLowerCase().replace(/\/photo$/, '').replace(/\/$/, '') === `/${handle.toLowerCase()}`; } catch (_) { return false; }
      });
      const avatarImage = authorImage || ownContainer?.querySelector('img');
      const avatar = avatarImage?.currentSrc || avatarImage?.src || '';
      const avatarOwner = avatar ? handle.toLowerCase() : '';
      const verified = !!user?.querySelector('[data-testid="icon-verified"]');
      const metrics = {};
      for (const key of ['reply', 'retweet', 'like']) {
        const control = article.querySelector(`[data-testid="${key}"], [data-testid="un${key}"]`);
        metrics[key] = control?.innerText?.trim() || '';
      }
      metrics.views = article.querySelector('a[href$="/analytics"]')?.innerText?.trim() || '';
      const quoteNode = article.querySelector('[data-testid="quoteTweet"]');
      const quoteTime = quoteNode?.querySelector('time');
      const quoteHref = quoteTime?.closest('a')?.getAttribute('href');
      const quote = quoteNode ? {
        name: quoteNode.querySelector('[data-testid="User-Name"]')?.innerText || '',
        text: quoteNode.querySelector('[data-testid="tweetText"]')?.innerText || '',
        url: quoteHref ? new URL(quoteHref, location.origin).href : ''
      } : null;
      posts.set(match[2], { id: match[2], text, language:native.language || '', time: time.dateTime, name, handle, avatar, avatarOwner, verified, metrics, quote,
        url: `https://x.com/${match[1]}/status/${match[2]}`,
        media: [...new Set(Array.from(article.querySelectorAll('img')).filter(img => !quoteNode?.contains(img) && (img.closest('[data-testid="tweetPhoto"]') || /pbs\.twimg\.com\/media\//.test(img.currentSrc || img.src))).map(img => img.currentSrc || img.src).filter(src => /^https:\/\/pbs\.twimg\.com\//.test(src)))],
        hasVideo: !!article.querySelector('video, [data-testid="videoPlayer"]')
      });
      const tweet=posts.get(match[2]);
      if (!Number.isFinite(Date.parse(tweet.time)) || (!tweet.text && !tweet.media.length && !tweet.quote && !tweet.hasVideo)) posts.delete(match[2]);
      if (posts.has(match[2]) && article.querySelector('[data-testid="tweetPhoto"]') && !tweet.media.length) pendingMedia=true;
    }
    if (articles.length || document.querySelector('[data-testid="emptyState"]')) ready = true;
    // Return the available small batch; scrolling the reader requests the next
    // one. Do not spend seconds scrolling X just to fill a large batch.
    if (posts.size && (!pendingMedia || assetGrace) || document.querySelector('[data-testid="emptyState"]')) break;
    if (posts.size && pendingMedia) assetGrace=true;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) return { error: 'X did not return a readable timeline. Check your login and retry.' };
  if (!posts.size && !document.querySelector('[data-testid="emptyState"]')) return { error: 'X returned a page but no readable posts for this user. Please retry.' };
  const tweets = [...posts.values()].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1).slice(0, limit);
  return { tweets, cursor: tweets.length ? (BigInt(tweets[tweets.length - 1].id) - 1n).toString() : null };
}
