// A request generation prevents a late response from replacing another user's feed.
window.xReader = (() => {
  let state = null;
  let generation = 0;
  let preferredFrame = 'mist';
  let view, posts, status, more, root;
  const words = {
    zh: { saved:'收藏', noSaved:'暂无收藏', local:'本地缓存', more:'加载', back: '← 返回动态', recent: '最新一条推文', older: '加载', loading: '加载中…', empty: 'X 未返回此用户的推文。', retry: '重试', end: '没有更多可读取的推文', original: '查看原文', hint: '向下滚动加载', error: '获取失败。请确认当前 Chrome 已登录 X，然后重试。' },
    en: { saved:'Saved', noSaved:'No saved posts yet', local:'Local cache', more:'Load', back: '← Back to Feed', recent: 'Latest post', older: 'Load', loading: 'Loading…', empty: 'X returned no posts for this user.', retry: 'Retry', end: 'No more readable posts', original: 'View original', hint: 'Scroll to load', error: 'Could not fetch posts. Check that you are signed in to X in Chrome, then retry.' }
  };
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function initialize() {
    if (view) return;
    window.xPostStore?.onChange?.(event => {
      if (!state || event.type !== 'post') return;
      const entry = state.savedEntries.get(event.id);
      if (event.savedAt !== undefined) entry?.savedState(!!event.savedAt);
      if (event.translationSource === 'chrome') entry?.applyTranslation(event.translation);
      if (entry && state.collection === 'saved' && event.savedAt === 0) {
        entry.article.remove(); state.savedEntries.delete(event.id);
        if (!posts.children.length) { if (!state.end) load(); else status.textContent = words[state.lang].noSaved; }
      }
    });
    root = document.getElementById('xt-content');
    window.xAvatarCache?.onChange?.((handle, data) => {
      if (data && state) state.applyAvatar?.(handle, data);
    });
    chrome.storage?.local?.get('cardFrameStyle').then(result => {
      if (['mist','ivory','glacier','bamboo','midnight','plain'].includes(result.cardFrameStyle)) preferredFrame = result.cardFrameStyle;
    }).catch(() => {});
    view = element('section', '', 'x-reader hidden');
    view.setAttribute('aria-label', 'X posts');
    root.append(view);
    root.addEventListener('scroll', () => {
      if (state && !state.busy && !state.failed && !state.end && root.scrollHeight - root.scrollTop - root.clientHeight < 180) load();
    }, { passive: true });
    // A single short post may not overflow the panel; wheel/touch gestures
    // still request older posts without waiting for a scroll event.
    root.addEventListener('wheel', event => {
      if (event.deltaY > 0 && state && !state.busy && !state.failed && !state.end && root.scrollHeight - root.scrollTop - root.clientHeight < 180) load();
    }, { passive: true });
    let touchY = null;
    root.addEventListener('touchstart', event => { touchY = event.touches[0]?.clientY; }, { passive: true });
    root.addEventListener('touchmove', event => {
      const y = event.touches[0]?.clientY;
      if (touchY !== null && touchY - y > 30 && state && !state.busy && !state.failed && !state.end && root.scrollHeight - root.scrollTop - root.clientHeight < 180) { touchY = y; load(); }
    }, { passive: true });
  }
  function open(user, replies, lang, options = {}) {
    initialize();
    document.querySelector('.xt-container')?.classList.add('x-reading');
    if (state) releaseMedia(state);
    const token = ++generation;
    state = { user, replies:!!replies, lang: words[lang] ? lang : 'en', cursor: null, first: true, busy: false, failed: false, end: false, seen: new Set(), avatarEntries: [], savedEntries: new Map(), timeEntries: [], hydrated: [], collection:options.collection || null, collectionCursor:null, interacted:false, networkUntil:null, avatarWarmStarted:false, token };
    const t = words[state.lang];
    for (const button of document.querySelectorAll?.('.nav-tab-btn') || []) button.classList.toggle('active', button.id === (options.collection ? 'nav-saved' : 'nav-feed'));
    document.getElementById('feedView').classList.add('hidden');
    document.getElementById('listsView').classList.add('hidden');
    view.classList.remove('hidden');
    view.replaceChildren();
    const back = element('button', '', 'x-reader-back');
    back.type = 'button';
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
    back.setAttribute('aria-label', t.back);
    back.title = t.back;
    back.addEventListener('click', close);
    const header = element('div', '', 'x-reader-header');
    const title = element('div', '', 'x-reader-title');
    title.append(element('h2', options.collection ? t.saved : user.alias || user.handle));
    if (!options.collection) title.append(element('div', `@${user.handle}`, 'x-reader-meta'));
    const owner = state; owner.back = back;
    function applyAvatar(handle, data) {
      if (state !== owner) return;
      for (const entry of owner.avatarEntries) {
        if ((entry.tweet.handle || owner.user.handle).replace(/^@/, '').toLowerCase() !== handle) continue;
        entry.tweet.avatar = data; entry.tweet.avatarSource = '';
        const image = element('img'); image.src = data; image.alt = '';
        entry.node.replaceChildren(image);
      }
    }
    owner.applyAvatar = applyAvatar;
    header.append(back, title);
    posts = element('div');
    status = element('p', '', 'x-reader-status');
    status.setAttribute('role', 'status');
    more = element('button', t.older, 'x-reader-button x-reader-more');
    more.addEventListener('click', () => load());
    if (!options.collection) view.append(header);
    view.append(posts, status, more);
    root.scrollTop = 0;
    load();
  }
  function safeUrl(value, image = false) {
    try {
      if (image && window.xPostStore?.isLocalUrl(value)) return value;
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      if (image ? ['pbs.twimg.com', 'abs.twimg.com'].includes(url.hostname) : url.hostname === 'x.com') return url.href;
    } catch (_) { /* Untrusted scraped URLs are ignored. */ }
    return null;
  }
  function releaseMedia(current) { for (const tweet of current.hydrated) window.xPostStore?.release(tweet); current.hydrated = []; }
  function resetPosts(current) {
    releaseMedia(current); posts.replaceChildren(); current.seen.clear(); current.avatarEntries=[]; current.savedEntries.clear(); current.timeEntries=[];
  }
  async function renderTweets(current, tweets) {
    const t = words[current.lang];
    let added = 0;
      for (const raw of tweets) {
        if (current.seen.has(raw.id)) continue;
        let tweet = raw;
        if (window.xPostStore) {
          try { tweet = await window.xPostStore.hydrate(raw); } catch (error) { current.cacheError=error.message; }
        }
        if (state !== current) { window.xPostStore?.release(tweet); return added; }
        current.hydrated.push(tweet);
        if (!current.collection) window.xPostStore?.touch(tweet.id).catch(() => {});
        const timestamp = Date.parse(tweet.time);
        if (!Number.isFinite(timestamp)) continue;
        current.seen.add(tweet.id);
        added++;
        const article = element('article', '', 'x-reader-post');
        article.setAttribute('data-post-id', tweet.id);
        const avatar = element('div', '', 'x-post-avatar');
        current.avatarEntries.push({tweet, node: avatar});
        const avatarUrl = window.xAvatarCache?.validData(tweet.avatar) ? tweet.avatar : safeUrl(tweet.avatar, true);
        if (avatarUrl) {
          const image = element('img');
          image.src = avatarUrl;
          image.alt = '';
          let recovered = false;
          image.addEventListener('error', async () => {
            if (!recovered) {
              recovered = true;
              const cached = await window.xAvatarCache?.resolve(tweet.handle || current.user.handle, tweet.avatarSource || tweet.avatar).catch(() => null);
              if (cached && cached !== image.src) { tweet.avatar = cached; image.src = cached; return; }
            }
            avatar.replaceChildren(element('span', (tweet.name || current.user.handle).charAt(0).toUpperCase()));
          });
          avatar.append(image);
        } else avatar.append(element('span', (tweet.name || current.user.handle).charAt(0).toUpperCase()));
        const body = element('div', '', 'x-post-body');
        const top = element('div', '', 'x-post-top');
        const date = new Date(timestamp);
        const time = element('time', shortTime(timestamp, current.lang), 'x-reader-meta');
        current.timeEntries.push({time, timestamp});
        time.dateTime = tweet.time;
        time.title = date.toLocaleString();
        top.append(element('strong', tweet.name || current.user.alias || current.user.handle, 'x-post-name'), element('span', `@${tweet.handle || current.user.handle}`, 'x-post-handle'), element('span', '·', 'x-reader-meta'), time);
        const original = element('p', tweet.text, 'x-reader-text');
        original.lang = tweet.language || 'en';
        original.translate = false;
        body.append(top, original);
        const bilingual = element('div', '', 'x-post-translation');
        bilingual.lang = 'zh-CN';
        bilingual.hidden = true;
        body.append(bilingual);
        // Legacy on-device results stay in storage but are not reused as X text.
        let translated = (tweet.translationSource === 'chrome' || !tweet.translationSource) ? tweet.translation || '' : '';
        let translationHiddenByUser = false;
        if (translated) { bilingual.append(element('p', translated, 'x-reader-text')); bilingual.hidden = false; }
        const media = element('div', '', 'x-post-media');
        for (const url of (tweet.media || []).slice(0, 4)) {
          const src = safeUrl(url, true);
          if (!src) continue;
          const image = element('img');
          image.src = src;
          image.alt = current.lang === 'zh' ? '推文图片' : 'Post image';
          image.loading = 'lazy';
          media.append(image);
        }
        if (media.children.length) {
          media.className += ` x-media-${media.children.length}`;
          body.append(media);
        }
        if (tweet.quote) {
          const quote = element('div', '', 'x-post-quote');
          quote.append(element('strong', tweet.quote.name), element('p', tweet.quote.text, 'x-reader-text'));
          body.append(quote);
        }
        const href = safeUrl(tweet.url);
        if (tweet.hasVideo && href) {
          const video = element('a', current.lang === 'zh' ? '▶ 在 X 播放视频' : '▶ Play video on X', 'x-post-video');
          video.href = href;
          video.target = '_blank';
          video.rel = 'noopener noreferrer';
          body.append(video);
        }
        const footer = element('div', '', 'x-post-footer');
        for (const [key, icon, label] of [['reply', '♡', current.lang === 'zh' ? '回复' : 'Replies'], ['retweet', '⇄', current.lang === 'zh' ? '转发' : 'Reposts'], ['like', '♡', current.lang === 'zh' ? '喜欢' : 'Likes']]) {
          const metric = element('span', `${key === 'reply' ? '☏' : icon} ${tweet.metrics?.[key] || ''}`, `x-post-metric x-metric-${key}`);
          const paths = {
            reply: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H5l-3 2v-9.5A8.5 8.5 0 0 1 10.5 4h2a8.5 8.5 0 0 1 8.5 7.5Z"/>',
            retweet: '<path d="m3 8 4-4 4 4M7 4v12a3 3 0 0 0 3 3h3m8-3-4 4-4-4m4 4V8a3 3 0 0 0-3-3h-3"/>',
            like: '<path d="M12 21 3.5 12.5a5.3 5.3 0 0 1 7.5-7.5L12 6l1-1a5.3 5.3 0 0 1 7.5 7.5Z"/>'
          };
          const glyph = element('span');
          glyph.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[key]}</svg>`;
          metric.textContent = '';
          metric.append(glyph, element('span', tweet.metrics?.[key] || ''));
          metric.title = label;
          metric.setAttribute('aria-label', `${label} ${tweet.metrics?.[key] || ''}`);
          footer.append(metric);
        }
        if (href) {
          const link = element('a', '↗', 'x-post-original');
          link.title = t.original;
          link.setAttribute('aria-label', t.original);
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          footer.append(link);
        }
        body.append(footer);
        const actions = element('div', '', 'x-post-actions');
        function tool(label, path) {
          const button = element('button', '', 'x-icon-button');
          button.type = 'button'; button.title = label;
          button.setAttribute('aria-label', label);
          button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
          return button;
        }
        const translateButton = tool('翻译', '<path d="M3 4h12M9 2v2m-3 0c0 5 4 9 8 11M13 4C12 9 8 13 3 15m12 6 4-11 4 11m-6-4h4"/>');
        translateButton.disabled = !tweet.text?.trim();
        translateButton.setAttribute('aria-pressed', String(!bilingual.hidden));
        const saveButton = tool('预览卡片', '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h10M7 12h10M7 16h6"/>');
        const notice = element('div', '', 'x-post-tool-status');
        notice.setAttribute('role', 'status');
        translateButton.addEventListener('click', async () => {
          current.interacted = true;
          translateButton.disabled = true;
          translateButton.classList.add('x-tool-busy');
          notice.textContent = '';
          try {
            const hadTranslation = !!translated;
            if (!translated) translated = await window.xPostTools.translate({...tweet,handle:tweet.handle || current.user.handle});
            if (window.xPostStore) await window.xPostStore.translation(tweet.id, translated,{source:'chrome',original:tweet.text});
            bilingual.replaceChildren(element('p', translated, 'x-reader-text'));
            bilingual.hidden = hadTranslation ? !bilingual.hidden : false;
            translationHiddenByUser = bilingual.hidden;
            translateButton.setAttribute('aria-pressed', String(!bilingual.hidden));
          } catch (error) { notice.textContent = `翻译失败：${error.message}`; }
          finally {
            translateButton.disabled = false;
            translateButton.classList.remove('x-tool-busy');
          }
        });
        saveButton.addEventListener('click', async () => {
          current.interacted = true;
          saveButton.disabled = true;
          notice.textContent = '';
          try {
            await window.xPostTools.preview(tweet, bilingual.hidden ? '' : translated, current.user.handle, {
              style: preferredFrame,
              onStyleChange(style) {
                preferredFrame = style;
                chrome.storage?.local?.set({cardFrameStyle: style}).catch(() => {});
              }
            });
          } catch (error) { notice.textContent = `预览失败：${error.message}`; }
          finally { saveButton.disabled = false; saveButton.focus?.({preventScroll: true}); }
        });
        const savedButton = tool('收藏', '<path d="M6 3h12v18l-6-4-6 4Z"/>');
        let saved = !!tweet.savedAt;
        function savedState(value) {
          saved = value;
          savedButton.setAttribute('aria-pressed', String(value));
          savedButton.title = value ? '取消收藏' : '收藏';
          savedButton.setAttribute('aria-label', savedButton.title);
          savedButton.classList.toggle('x-saved', value);
        }
        savedState(saved);
        function applyTranslation(text) {
          if (state !== current || !text) return;
          translated = text; tweet.translation = text; tweet.translationSource = 'chrome';
          if (notice.textContent?.startsWith('翻译失败')) notice.textContent = '';
          bilingual.replaceChildren(element('p', translated, 'x-reader-text'));
          bilingual.hidden = translationHiddenByUser;
          translateButton.setAttribute('aria-pressed', String(!bilingual.hidden));
        }
        current.savedEntries.set(tweet.id, {savedState, article, applyTranslation});
        savedButton.addEventListener('click', async () => {
          current.interacted = true; savedButton.disabled = true; notice.textContent = '';
          try {
            await window.xPostStore.setSaved({...tweet,translation:translated,translationSource:translated?'chrome':tweet.translationSource}, !saved);
          } catch (error) { notice.textContent = `收藏失败：${error.message}`; }
          finally { savedButton.disabled = false; }
        });
        actions.append(translateButton, saveButton, savedButton);
        footer.append(actions);
        body.append(notice);
        article.append(avatar, body);
        posts.append(article);
      }
    return added;
  }
  function finishPage(current, wasFirst, response, collection = false) {
    const ids=[...current.seen];
    const oldest=ids.length?ids.reduce((a,b)=>BigInt(a)<BigInt(b)?a:b):null;
    const next=oldest?(BigInt(oldest)-1n).toString():null;
    if (collection) {
      current.collectionCursor=response.cursor;
      current.end=!response.hasMore;
    } else { current.cursor=next; current.end=!response.tweets.length || !next; }
    current.first=false;
    status.textContent=!current.seen.size ? (current.collection?words[current.lang].noSaved:words[current.lang].empty) : '';
    more.textContent=current.collection?words[current.lang].more:words[current.lang].older;
    more.hidden=current.end;
  }
  async function livePage(current,cursor,limit) {
    const response=await chrome.runtime.sendMessage({action:'X_READER_PAGE',handle:current.user.handle.replace(/^@/,''),replies:current.replies,cursor,limit});
    if (state!==current || current.token!==generation) return null;
    if (!response || response.error || !Array.isArray(response.tweets)) throw Error(response?.error || 'No response');
    if (response.avatarStatus?.saved===false && !current.avatarWarmStarted) {
      current.avatarWarmStarted=true;
      // This independent worker request updates the shared avatar cache when
      // ready. Neither reading nor scrolling waits for the image download.
      chrome.runtime.sendMessage({action:'X_READER_AVATAR_WARM',handle:current.user.handle.replace(/^@/,''),source:response.tweets[0]?.avatarSource || ''}).catch(()=>{});
    }
    const tweets=[];
    for (const tweet of response.tweets.slice(0,limit)) {
      if (state!==current) return null;
      try { tweets.push(window.xPostStore ? await window.xPostStore.remember({...tweet,handle:tweet.handle || current.user.handle},{replies:current.replies}) : tweet); }
      catch (error) { current.cacheError=error.message; tweets.push(tweet); }
    }
    return state===current ? {tweets} : null;
  }
  async function refreshLatest(current,previous) {
    let updating=false;
    try {
      const response=await livePage(current,null,1);
      if (!response?.tweets.length || state!==current || current.busy || current.interacted || current.seen.size!==1) return;
      // If new posts appeared since the last visit, read the live gap before
      // continuing with older local pages. A sparse cache must not skip it.
      current.networkUntil=BigInt(response.tweets[0].id)>BigInt(previous.id)?previous.id:null;
      updating=true; current.busy=true; more.disabled=true;
      resetPosts(current);
      await renderTweets(current,response.tweets);
      if (state!==current) return;
      finishPage(current,true,response);
    } catch (_) { /* Cached reading remains available during refresh failures. */ }
    finally { if (updating && state===current) {current.busy=false;more.disabled=false;} }
  }
  async function load() {
    const current=state;
    if (!current || current.busy || current.end) return;
    const t=words[current.lang], wasFirst=current.first, cursor=current.cursor, limit=wasFirst?1:5;
    if (!wasFirst) current.interacted=true;
    current.busy=true; current.failed=false; more.disabled=true; more.textContent=t.loading; status.textContent='';
    let cached=null;
    try {
      if (current.collection) {
        const response=await window.xPostStore.collection(current.collection,current.collectionCursor,5);
        if (state!==current) return;
        await renderTweets(current,response.tweets);
        if (state!==current) return;
        finishPage(current,wasFirst,response,true);
        return;
      }
      if (window.xPostStore) {
        try { cached=await window.xPostStore.page(current.user.handle,current.replies,cursor,limit); }
        catch (error) { if (navigator.onLine===false) throw error; current.cacheError=error.message; }
        if (state!==current) return;
        if (wasFirst && cached?.tweets.length) {
          await renderTweets(current,cached.tweets);
          if (state!==current) return;
          finishPage(current,wasFirst,cached);
          if (navigator.onLine!==false) refreshLatest(current,cached.tweets[0]);
          return;
        }
        if (navigator.onLine===false || cached?.tweets.length && !current.networkUntil) {
          await renderTweets(current,cached.tweets);
          if (state!==current) return;
          finishPage(current,wasFirst,cached);
          return;
        }
      }
      const response=await livePage(current,cursor,limit);
      if (!response || state!==current) return;
      let tweets=response.tweets;
      if (current.networkUntil && (!tweets.length || tweets.some(tweet=>BigInt(tweet.id)<=BigInt(current.networkUntil)))) current.networkUntil=null;
      // An empty X search is not evidence that previously read posts vanished.
      // Continue paging through local snapshots when the live page is empty.
      if (!tweets.length && cached?.tweets.length) {
        if (!wasFirst) await renderTweets(current,cached.tweets);
        if (state!==current) return;
        finishPage(current,wasFirst,cached);
        return;
      }
      // Restore previously read posts missing from this live result, but stay
      // inside its ID range so a sparse cache cannot skip unseen live pages.
      if (!wasFirst && tweets.length && cached?.tweets.length) {
        const oldest=tweets.reduce((id,tweet)=>BigInt(tweet.id)<BigInt(id)?tweet.id:id,tweets[0].id);
        const merged=new Map(cached.tweets.filter(tweet=>BigInt(tweet.id)>=BigInt(oldest)).map(tweet=>[tweet.id,tweet]));
        for (const tweet of tweets) merged.set(tweet.id,tweet);
        tweets=[...merged.values()].sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:BigInt(a.id)<BigInt(b.id)?1:0).slice(0,limit);
      }
      const added=await renderTweets(current,tweets);
      if (state!==current) return;
      finishPage(current,wasFirst,{tweets});
      if (current.cacheError) status.textContent=`本地缓存失败：${current.cacheError}`;
      if (!wasFirst && !added && cached?.tweets.length) {
        await renderTweets(current,cached.tweets);
        if (state!==current) return;
        finishPage(current,wasFirst,cached);
      } else if (!wasFirst && !added) { current.end=true; more.hidden=true; }
    } catch (error) {
      if (state!==current) return;
      if (cached?.tweets.length) {
        if (!wasFirst) await renderTweets(current,cached.tweets);
        if (state!==current) return;
        current.networkUntil=null;
        finishPage(current,wasFirst,cached);
      } else {
        current.failed=true;
        status.textContent=current.collection?`本地读取失败：${error.message}`:`${t.error} ${error.message}`;
        more.textContent=t.retry; more.hidden=false;
      }
    } finally { if (state===current) {current.busy=false;more.disabled=false;} }
  }
  function shortTime(timestamp, lang) {
    const date = new Date(timestamp), age = Math.max(0, Date.now() - timestamp);
    return age < 3600000 ? `${Math.max(1, Math.floor(age / 60000))}${lang === 'zh' ? '分钟' : 'm'}` : age < 86400000 ? `${Math.floor(age / 3600000)}${lang === 'zh' ? '小时' : 'h'}` : date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {month:'short',day:'numeric',...(date.getFullYear() !== new Date().getFullYear() ? {year:'numeric'} : {})});
  }
  function setLanguage(lang) {
    if (!state || !words[lang]) return;
    state.lang = lang;
    const t = words[lang];
    state.back.title = t.back; state.back.setAttribute('aria-label', t.back);
    for (const entry of state.timeEntries) entry.time.textContent = shortTime(entry.timestamp, lang);
    more.textContent = state.busy ? t.loading : state.failed ? t.retry : state.collection ? t.more : t.older;
    if (!posts.children.length && !state.busy && !state.failed) status.textContent = state.collection ? t.noSaved : t.empty;
  }
  function close() {
    generation++;
    if (state) releaseMedia(state);
    state = null;
    document.querySelector('.xt-container')?.classList.remove('x-reading');
    if (view) view.classList.add('hidden');
    document.getElementById('feedView').classList.remove('hidden');
    for (const button of document.querySelectorAll?.('.nav-tab-btn') || []) button.classList.remove('active');
    document.getElementById('nav-feed')?.classList.add('active');
  }
  return { open, close, setLanguage, openCollection: (collection, lang) => { if (collection === 'saved') open({handle:''},true,lang,{collection}); }, active: () => !!state, refresh: () => { if (state) open(state.user, state.replies, state.lang,{collection:state.collection}); } };
})();
