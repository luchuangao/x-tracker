// weibo_content.js
// Runs inside weibo.com / s.weibo.com to scrape posts

console.log('X-Tracker Weibo Content Script Loaded');

function scrapeWeibo() {
  // 1. Check for Login / Security Check
  if (document.querySelector('.gn_login_list') ||
      document.querySelector('a[href*="login.php"]') ||
      (document.title || '').includes('登录') ||
      document.body.innerText.includes('扫描二维码登录') ||
      document.body.innerText.includes('账号登录') ||
      document.querySelector('.visitor_box')) {
    return [{ error: 'login_required' }];
  }

  // 2. Check if we are on weibo.com (Profile Page) for UID resolution or direct scraping
  if (window.location.hostname === 'weibo.com') {
    const profileTweets = scrapeWeiboProfile();
    if (profileTweets.length > 0) return profileTweets;

    const nickname = resolveWeiboNickname();
    if (nickname) return [{ redirect: true, nickname }];

    return [{ error: 'uid_resolution_failed' }];
  }

  // 3. Otherwise, scrape search results (s.weibo.com)
  return scrapeWeiboSearch();
}

function resolveWeiboNickname() {
  const title = document.title || '';
  const match = title.match(/^(.*?)的微博/);
  if (match && match[1]) return match[1].trim();

  const domName =
    document.querySelector('a.WB_name') ||
    document.querySelector('.ProfileHeader__name') ||
    document.querySelector('.ProfileHeader_name') ||
    document.querySelector('a[node-type="feed_list_originNick"]') ||
    document.querySelector('a.name');

  const text = domName ? (domName.textContent || domName.innerText || '').trim() : '';
  return text || null;
}

function scrapeWeiboProfile() {
  // Try multiple feed item selectors
  let items = document.querySelectorAll('div[action-type="feed_list_item"]');
  if (items.length === 0) items = document.querySelectorAll('div.WB_cardwrap[action-type="feed_list_item"]');
  if (items.length === 0) items = document.querySelectorAll('div.card-wrap');
  if (items.length === 0) return [];

  const tweets = [];

  items.forEach((item) => {
    try {
      // Extract text content
      const textEl =
        item.querySelector('div[node-type="feed_list_content_full"]') ||
        item.querySelector('div[node-type="feed_list_content"]') ||
        item.querySelector('.WB_text') ||
        item.querySelector('.content .txt') ||
        item.querySelector('p.txt');
      const text = textEl ? (textEl.innerText || '').trim() : '';

      // Extract user name
      const nameEl =
        item.querySelector('a[node-type="feed_list_originNick"]') ||
        item.querySelector('a.WB_name') ||
        item.querySelector('.WB_info a[nick-name]') ||
        item.querySelector('.info a.name');
      const name = nameEl ? (nameEl.textContent || nameEl.innerText || '').trim() : '';
      if (!name) return;

      // Extract avatar
      const avatarEl =
        item.querySelector('img.W_face_radius') ||
        item.querySelector('.WB_face img') ||
        item.querySelector('.avator img') ||
        item.querySelector('.avatar img');
      const avatarUrl = avatarEl ? avatarEl.src : '';

      // Extract time and permalink
      const timeLink =
        item.querySelector('a[node-type="feed_list_item_date"]') ||
        item.querySelector('.WB_from a[node-type="feed_list_item_date"]') ||
        item.querySelector('.from a[target="_blank"]') ||
        item.querySelector('.WB_from a');
      
      let tweetUrl = '';
      let time = '';
      if (timeLink) {
        const href = timeLink.getAttribute('href') || '';
        tweetUrl = href ? new URL(href, window.location.origin).toString() : '';
        const t = (timeLink.getAttribute('title') || timeLink.textContent || '').trim();
        time = parseWeiboTime(t);
      }

      // Extract media
      const mediaUrls = [];
      const imgs = item.querySelectorAll(
        'div[node-type="feed_list_media_prev"] img, .WB_media_wrap img, .media img'
      );
      imgs.forEach((img) => {
        let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!src) return;
        if (src.startsWith('//')) src = 'https:' + src;
        if (src.includes('orj360')) src = src.replace('orj360', 'mw690');
        if (src.includes('thumb150')) src = src.replace('thumb150', 'mw690');
        mediaUrls.push(src);
      });

      if (!text && mediaUrls.length === 0) return;

      tweets.push({
        name,
        handle: name,
        time,
        avatarUrl,
        text,
        mediaUrls,
        tweetUrl,
        isReply: false,
        platform: 'weibo'
      });
    } catch (e) {
      console.error('Error parsing weibo profile item:', e);
    }
  });

  return tweets;
}

function scrapeWeiboSearch() {
  if (document.querySelector('div.card-no-result') || document.body.innerText.includes('抱歉，未找到')) {
    return [{ error: 'no_results' }];
  }

  let cards = document.querySelectorAll('div.card-wrap');
  if (cards.length === 0) cards = document.querySelectorAll('div.card');
  if (cards.length === 0) cards = document.querySelectorAll('div[action-type="feed_list_item"]');

  const tweets = [];

  cards.forEach((card) => {
    try {
      const hasMid = card.getAttribute('mid');
      const hasContent = card.querySelector('.content') || card.querySelector('.txt');
      if (!hasMid && !hasContent) return;

      const infoDiv = card.querySelector('.info');
      let name = 'Unknown';
      let handle = '';
      let avatarUrl = '';

      if (infoDiv) {
        const nameLink = infoDiv.querySelector('a.name') || infoDiv.querySelector('a.nick-name');
        if (nameLink) {
          name = nameLink.textContent || nameLink.innerText;
          handle = name;
        }
      } else {
        const nameLink = card.querySelector('.name');
        if (nameLink) {
          name = nameLink.textContent;
          handle = name;
        }
      }

      if (name === 'Unknown') return;

      const avatarImg = card.querySelector('.avator img') || card.querySelector('.avatar img');
      if (avatarImg) avatarUrl = avatarImg.src;

      const textDiv = card.querySelector('.content .txt') || card.querySelector('p.txt');
      let text = '';
      if (textDiv) {
        const fullTextDiv = card.querySelector('[node-type="feed_list_content_full"]');
        text = (fullTextDiv ? fullTextDiv.innerText : textDiv.innerText) || '';
      }

      const fromDiv = card.querySelector('.from');
      let time = '';
      let tweetUrl = '';
      if (fromDiv) {
        const link = fromDiv.querySelector('a[target="_blank"]');
        if (link) {
          tweetUrl = link.href;
          time = parseWeiboTime(link.textContent.trim());
        }
      }

      const mediaDiv = card.querySelector('.media');
      const mediaUrls = [];
      if (mediaDiv) {
        const imgs = mediaDiv.querySelectorAll('img');
        imgs.forEach((img) => {
          let src = img.src;
          if (src.includes('orj360')) src = src.replace('orj360', 'mw690');
          if (src.includes('thumb150')) src = src.replace('thumb150', 'mw690');
          mediaUrls.push(src);
        });
      }

      let isReply = false;
      if (card.querySelector('.card-comment') || card.querySelector('.card_comment')) {
        isReply = true;
      }

      if (text || mediaUrls.length > 0) {
        tweets.push({
          name,
          handle,
          time,
          avatarUrl,
          text,
          mediaUrls,
          tweetUrl,
          isReply,
          platform: 'weibo'
        });
      }
    } catch (e) {
      console.error('Error parsing weibo card:', e);
    }
  });

  if (tweets.length === 0) {
    if (cards.length > 0) return [{ error: 'parsing_error', details: 'Selectors mismatch' }];
    return [{ error: 'parsing_error', details: 'Unknown page structure' }];
  }

  return tweets;
}

function parseWeiboTime(timeStr) {
  if (!timeStr) return new Date().toISOString();

  const now = new Date();

  if (/\d{4}-\d{1,2}-\d{1,2}/.test(timeStr)) {
    const d = new Date(timeStr.replace(/-/g, '/'));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  
  // "Just now" or "x seconds ago"
  if (timeStr.includes('刚刚') || timeStr.includes('秒前')) {
    return now.toISOString();
  }

  // "x minutes ago"
  if (timeStr.includes('分钟前')) {
    const min = parseInt(timeStr);
    now.setMinutes(now.getMinutes() - min);
    return now.toISOString();
  }

  // "Today HH:MM" -> "今天 12:30"
  if (timeStr.includes('今天')) {
    const timePart = timeStr.split(' ')[1]; // 12:30
    const [h, m] = timePart.split(':');
    now.setHours(parseInt(h), parseInt(m), 0, 0);
    return now.toISOString();
  }

  // "Month-Day HH:MM" -> "01月22日 12:30" (Current Year)
  if (timeStr.match(/\d+月\d+日/)) {
    let year = now.getFullYear();
    // If it looks like a full date "YYYY年MM月DD日", handle separately
    if (timeStr.includes('年')) {
       // "2023年12月01日 12:30" or just date
       const parts = timeStr.match(/(\d+)年(\d+)月(\d+)日/);
       if (parts) {
         year = parseInt(parts[1]);
         const month = parseInt(parts[2]) - 1;
         const day = parseInt(parts[3]);
         let h = 0, m = 0;
         if (timeStr.includes(':')) {
            const timePart = timeStr.split(' ')[1];
            if (timePart) {
               [h, m] = timePart.split(':').map(n => parseInt(n));
            }
         }
         return new Date(year, month, day, h, m).toISOString();
       }
    } else {
       // "01月22日 12:30"
       const parts = timeStr.match(/(\d+)月(\d+)日/);
       const month = parseInt(parts[1]) - 1;
       const day = parseInt(parts[2]);
       let h = 0, m = 0;
       if (timeStr.includes(':')) {
          const timePart = timeStr.split(' ')[1];
          if (timePart) {
             [h, m] = timePart.split(':').map(n => parseInt(n));
          }
       }
       return new Date(year, month, day, h, m).toISOString();
    }
  }

  if (timeStr.match(/^\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}/)) {
    const [md, hm] = timeStr.split(/\s+/);
    const [month, day] = md.split('-').map((n) => parseInt(n, 10));
    const [h, m] = hm.split(':').map((n) => parseInt(n, 10));
    const d = new Date(now.getFullYear(), month - 1, day, h, m, 0, 0);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  // Fallback
  return new Date().toISOString();
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTweets") {
    // Wait for content
    let attempts = 0;
    const maxAttempts = 10;
    
    const interval = setInterval(() => {
      const tweets = scrapeWeibo();
      
      // Check for redirect instruction
      if (tweets.length > 0 && tweets[0].redirect) {
          clearInterval(interval);
          const nickname = tweets[0].nickname;
          const newUrl = `https://s.weibo.com/weibo?q=nickname:${encodeURIComponent(nickname)}`;
          console.log(`Redirecting to ${newUrl}`);
          sendResponse({ redirect: true, newUrl: newUrl });
          return;
      }

      if (tweets.length > 0 || attempts >= maxAttempts) {
        clearInterval(interval);
        console.log(`Returning ${tweets.length} weibo posts`);
        if (tweets.length === 0) {
          sendResponse({ tweets: [{ error: 'timeout' }] });
        } else {
          sendResponse({ tweets: tweets });
        }
      }
      attempts++;
    }, 500);

    return true;
  }
});