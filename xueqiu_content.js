// xueqiu_content.js
// Runs inside xueqiu.com to scrape posts

console.log('X-Tracker Xueqiu Content Script Loaded');

function scrapeXueqiu() {
  // Check for Login / Security Check
  if (document.querySelector('.login-btn') ||
      document.querySelector('a[href*="/login"]') ||
      document.body.innerText.includes('登录雪球') ||
      document.title.includes('登录')) {
    return [{ error: 'login_required' }];
  }

  // Check if we are on xueqiu.com profile page
  if (window.location.hostname === 'xueqiu.com' && window.location.pathname.includes('/u/')) {
    const profileTweets = scrapeXueqiuProfile();
    if (profileTweets.length > 0) return profileTweets;

    const nickname = resolveXueqiuNickname();
    if (nickname) return [{ redirect: true, nickname }];

    return [{ error: 'uid_resolution_failed' }];
  }

  // Otherwise, scrape timeline/search results
  return scrapeXueqiuTimeline();
}

function resolveXueqiuNickname() {
  // Try to extract nickname from profile page
  const nameEl = document.querySelector('.user-name') ||
                 document.querySelector('.nickname') ||
                 document.querySelector('[data-name]') ||
                 document.querySelector('h1.user-name');
  
  if (nameEl) {
    return nameEl.textContent || nameEl.getAttribute('data-name') || '';
  }

  // Fallback to title
  const title = document.title || '';
  const match = title.match(/^(.*?)的个人主页/);
  if (match && match[1]) return match[1].trim();
  
  return null;
}

function scrapeXueqiuProfile() {
  // Look for timeline items - Xueqiu uses various selectors
  let items = document.querySelectorAll('.timeline__item');
  if (items.length === 0) items = document.querySelectorAll('.status-item');
  if (items.length === 0) items = document.querySelectorAll('.tweet-item');
  if (items.length === 0) items = document.querySelectorAll('[data-type="status"]');
  if (items.length === 0) return [];

  const tweets = [];

  items.forEach((item) => {
    try {
      // Extract text content
      const textEl = 
        item.querySelector('.timeline__text') ||
        item.querySelector('.status-content') ||
        item.querySelector('.tweet-text') ||
        item.querySelector('.content') ||
        item.querySelector('[data-text]');
      const text = textEl ? (textEl.innerText || '').trim() : '';

      // Extract user name
      const nameEl = 
        item.querySelector('.user-name') ||
        item.querySelector('.nickname') ||
        item.querySelector('[data-user-name]') ||
        item.querySelector('.author-name');
      const name = nameEl ? (nameEl.textContent || nameEl.getAttribute('data-user-name') || '').trim() : '';
      if (!name) return;

      // Extract avatar
      const avatarEl = 
        item.querySelector('.user-avatar img') ||
        item.querySelector('.avatar img') ||
        item.querySelector('[data-avatar]');
      const avatarUrl = avatarEl ? (avatarEl.src || avatarEl.getAttribute('data-avatar') || '') : '';

      // Extract time and permalink
      const timeLink = 
        item.querySelector('.time') ||
        item.querySelector('.timestamp') ||
        item.querySelector('[data-time]') ||
        item.querySelector('a[href*="/status/"]');
      
      let time = '';
      let tweetUrl = '';
      if (timeLink) {
        const href = timeLink.getAttribute('href') || '';
        tweetUrl = href ? new URL(href, window.location.origin).toString() : '';
        const timeText = timeLink.getAttribute('data-time') || timeLink.textContent || '';
        time = parseXueqiuTime(timeText);
      }

      // Extract media
      const mediaUrls = [];
      const imgs = item.querySelectorAll(
        '.timeline__media img, .status-media img, .tweet-media img, .content img'
      );
      imgs.forEach((img) => {
        let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!src) return;
        if (src.startsWith('//')) src = 'https:' + src;
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
        platform: 'xueqiu'
      });
    } catch (e) {
      console.error('Error parsing xueqiu item:', e);
    }
  });

  return tweets;
}

function scrapeXueqiuTimeline() {
  // Check for no results
  if (document.querySelector('.empty-state') || 
      document.body.innerText.includes('暂无动态') ||
      document.body.innerText.includes('没有更多内容')) {
    return [{ error: 'no_results' }];
  }

  // Look for timeline items
  let items = document.querySelectorAll('.timeline__item');
  if (items.length === 0) items = document.querySelectorAll('.status-item');
  if (items.length === 0) items = document.querySelectorAll('.tweet-item');
  if (items.length === 0) items = document.querySelectorAll('[data-type="status"]');

  const tweets = [];

  items.forEach((item) => {
    try {
      const textEl = 
        item.querySelector('.timeline__text') ||
        item.querySelector('.status-content') ||
        item.querySelector('.tweet-text') ||
        item.querySelector('.content') ||
        item.querySelector('[data-text]');
      const text = textEl ? (textEl.innerText || '').trim() : '';

      const nameEl = 
        item.querySelector('.user-name') ||
        item.querySelector('.nickname') ||
        item.querySelector('[data-user-name]') ||
        item.querySelector('.author-name');
      const name = nameEl ? (nameEl.textContent || nameEl.getAttribute('data-user-name') || '').trim() : '';
      if (!name) return;

      const avatarEl = 
        item.querySelector('.user-avatar img') ||
        item.querySelector('.avatar img') ||
        item.querySelector('[data-avatar]');
      const avatarUrl = avatarEl ? (avatarEl.src || avatarEl.getAttribute('data-avatar') || '') : '';

      const timeLink = 
        item.querySelector('.time') ||
        item.querySelector('.timestamp') ||
        item.querySelector('[data-time]') ||
        item.querySelector('a[href*="/status/"]');
      
      let time = '';
      let tweetUrl = '';
      if (timeLink) {
        const href = timeLink.getAttribute('href') || '';
        tweetUrl = href ? new URL(href, window.location.origin).toString() : '';
        const timeText = timeLink.getAttribute('data-time') || timeLink.textContent || '';
        time = parseXueqiuTime(timeText);
      }

      const mediaUrls = [];
      const imgs = item.querySelectorAll(
        '.timeline__media img, .status-media img, .tweet-media img, .content img'
      );
      imgs.forEach((img) => {
        let src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!src) return;
        if (src.startsWith('//')) src = 'https:' + src;
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
        platform: 'xueqiu'
      });
    } catch (e) {
      console.error('Error parsing xueqiu item:', e);
    }
  });

  if (tweets.length === 0) {
    if (items.length > 0) return [{ error: 'parsing_error', details: 'Selectors mismatch' }];
    return [{ error: 'parsing_error', details: 'Unknown page structure' }];
  }

  return tweets;
}

function parseXueqiuTime(timeStr) {
  if (!timeStr) return new Date().toISOString();

  const now = new Date();

  // Handle relative time formats
  if (timeStr.includes('刚刚')) return now.toISOString();
  if (timeStr.includes('分钟前')) {
    const min = parseInt(timeStr);
    now.setMinutes(now.getMinutes() - min);
    return now.toISOString();
  }
  if (timeStr.includes('小时前')) {
    const hours = parseInt(timeStr);
    now.setHours(now.getHours() - hours);
    return now.toISOString();
  }
  if (timeStr.includes('天前')) {
    const days = parseInt(timeStr);
    now.setDate(now.getDate() - days);
    return now.toISOString();
  }

  // Handle absolute time formats
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(timeStr)) {
    const d = new Date(timeStr.replace(/-/g, '/'));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  if (/\d{1,2}月\d{1,2}日/.test(timeStr)) {
    const year = now.getFullYear();
    const parts = timeStr.match(/(\d{1,2})月(\d{1,2})日/);
    if (parts) {
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const d = new Date(year, month, day);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }

  // Fallback
  return now.toISOString();
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTweets") {
    let attempts = 0;
    const maxAttempts = 10;
    
    const interval = setInterval(() => {
      const tweets = scrapeXueqiu();
      
      // Check for redirect instruction
      if (tweets.length > 0 && tweets[0].redirect) {
        clearInterval(interval);
        const nickname = tweets[0].nickname;
        const newUrl = `https://xueqiu.com/u/${nickname}`;
        console.log(`Redirecting to ${newUrl}`);
        sendResponse({ redirect: true, newUrl: newUrl });
        return;
      }

      if (tweets.length > 0 || attempts >= maxAttempts) {
        clearInterval(interval);
        console.log(`Returning ${tweets.length} xueqiu posts`);
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