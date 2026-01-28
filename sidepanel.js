// sidepanel.js
// Runs inside the Side Panel

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const refreshBtn = document.getElementById('xt-refresh');
  const settingsBtn = document.getElementById('xt-settings-toggle');
  
  // Views
  const feedView = document.getElementById('feedView');
  const settingsView = document.getElementById('settingsView');
  
  // Feed Elements
  const tweetsContainer = document.getElementById('tweetsContainer');
  const statusText = document.getElementById('statusText');

  // Settings Elements
  const userInput = document.getElementById('userInput');
  const addBtn = document.getElementById('addBtn');
  const userList = document.getElementById('userList');
  const countSpan = document.getElementById('count');
  const clearBtn = document.getElementById('clearBtn');
  const emptyStateList = document.getElementById('emptyStateList');
  const timeRange = document.getElementById('timeRange');
  const includeReplies = document.getElementById('includeReplies');
  const fetchBtn = document.getElementById('fetchBtn');

  // State
  let users = [];
  let statusPoll = null;
  let currentFetchPlatform = 'x';
  let activeTab = 'x'; // 'x' or 'xueqiu' or 'weibo'

  // --- Initialization ---
  
  // Load initial state
  chrome.storage.local.get(['users', 'timeRange', 'includeReplies', 'cachedTweets', 'fetchStatus', 'activeTab'], (result) => {
    if (result.activeTab) {
        activeTab = result.activeTab;
        updateTabUI();
    } else {
        updateTabUI(); // Default to X
    }

    if (result.users) {
      let needsMigration = false;
      const migratedUsers = result.users
        .filter(Boolean)
        .map((u) => {
          if (typeof u === 'string') {
            needsMigration = true;
            return { handle: u, enabled: true };
          }

          if (typeof u === 'object') {
            const handle = typeof u.handle === 'string' ? u.handle : '';
            const enabled = typeof u.enabled === 'boolean' ? u.enabled : true;
            const platform = typeof u.platform === 'string' ? u.platform : 'x'; // Default to x
            const alias = typeof u.alias === 'string' ? u.alias : ''; // Add alias migration
            
            // Keep Weibo users
            // if (platform === 'weibo') return null;

            if (!u.handle || typeof u.enabled !== 'boolean') needsMigration = true;
            return { handle, enabled, platform, alias };
          }

          needsMigration = true;
          return { handle: '', enabled: true, platform: 'x', alias: '' };
        })
        .filter(Boolean) // Filter out nulls (removed weibo users)
        .filter((u) => u.handle);

      users = migratedUsers;
      if (needsMigration) chrome.storage.local.set({ users: users });
      renderList();
    }
    if (result.timeRange) timeRange.value = result.timeRange;
    if (result.includeReplies !== undefined) includeReplies.checked = result.includeReplies;
    
    // Check cache
    if (result.cachedTweets && result.cachedTweets.length > 0) {
      renderTweets(result.cachedTweets);
      statusText.textContent = `Last updated: ${new Date(result.fetchStatus?.lastUpdated || Date.now()).toLocaleTimeString()}`;
    }
    
    // Resume polling if needed
    if (result.fetchStatus && (Date.now() - result.fetchStatus.lastUpdated < 30000) && result.fetchStatus.state !== 'success' && result.fetchStatus.state !== 'error') {
       startPolling();
    }
  });

  // --- Event Listeners ---

  // Platform Tabs
  const tabContainer = document.createElement('div');
  tabContainer.className = 'platform-tabs';
  tabContainer.innerHTML = `
    <button class="tab-btn active" data-tab="x">X</button>
    <button class="tab-btn" data-tab="weibo">Weibo</button>
    <button class="tab-btn" data-tab="xueqiu">Xueqiu</button>
    <button class="tab-btn" data-tab="xiaohongshu">Xiaohongshu</button>
  `;
  
  // Insert tabs before user list
  userList.parentNode.insertBefore(tabContainer, userList);

  // Tab Events
  tabContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-btn')) {
          activeTab = e.target.dataset.tab;
          updateTabUI();
          chrome.storage.local.set({ activeTab: activeTab });
          renderList();
      }
  });

  function updateTabUI() {
      const tabs = document.querySelectorAll('.tab-btn');
      tabs.forEach(tab => {
          if (tab.dataset.tab === activeTab) {
              tab.classList.add('active');
          } else {
              tab.classList.remove('active');
          }
      });
  }

  // Header Controls
  settingsBtn.addEventListener('click', () => {
    if (settingsView.classList.contains('hidden')) {
      settingsView.classList.remove('hidden');
      feedView.classList.add('hidden');
      settingsBtn.style.color = '#1d9bf0'; // Active color
    } else {
      settingsView.classList.add('hidden');
      feedView.classList.remove('hidden');
      settingsBtn.style.color = '';
    }
  });

  refreshBtn.addEventListener('click', () => {
    // Switch to feed view if not already
    settingsView.classList.add('hidden');
    feedView.classList.remove('hidden');
    settingsBtn.style.color = '';
    startFetching();
  });

  // Settings Logic
  addBtn.addEventListener('click', addUser);
  userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addUser(); });
  
  userList.addEventListener('click', (e) => {
    // Delete User
    if (e.target.classList.contains('delete-btn')) {
      users.splice(e.target.dataset.index, 1);
      saveAndRender();
      return;
    }

    // Edit Alias
    if (e.target.classList.contains('edit-btn')) {
      const index = e.target.dataset.index;
      const user = users[index];
      const newAlias = prompt('Enter alias for this user (leave empty to use original handle):', user.alias || user.handle);
      if (newAlias !== null) {
          user.alias = newAlias.trim();
          saveAndRender();
      }
      return;
    }
  });

  userList.addEventListener('change', (e) => {
    if (e.target.classList.contains('user-checkbox')) {
      const index = parseInt(e.target.dataset.index, 10);
      if (!Number.isNaN(index) && users[index]) {
        users[index].enabled = e.target.checked;
        chrome.storage.local.set({ users: users });
      }
    }
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Remove all users?')) {
      users = [];
      saveAndRender();
    }
  });

  timeRange.addEventListener('change', () => chrome.storage.local.set({ timeRange: timeRange.value }));
  includeReplies.addEventListener('change', () => chrome.storage.local.set({ includeReplies: includeReplies.checked }));
  
  fetchBtn.addEventListener('click', () => {
    settingsView.classList.add('hidden');
    feedView.classList.remove('hidden');
    settingsBtn.style.color = '';
    startFetching();
  });

  // --- Functions ---

  function addUser() {
    const input = userInput.value.trim();
    if (!input) return;
    const { username, platform } = extractUser(input);
    if (!username) { alert('Invalid URL/Username'); return; }
    if (users.some(u => u.handle === username && u.platform === platform)) { alert('Already added'); return; }
    users.push({ handle: username, enabled: true, platform: platform, alias: '' });
    saveAndRender();
    userInput.value = '';
  }

  function extractUser(input) {
    input = input.replace(/\/$/, '');
    let platform = 'x';
    let username = null;

    // Check for Weibo
    if (input.includes('weibo.com')) {
      platform = 'weibo';
      try {
        const url = new URL(input);
        if (url.pathname.includes('/u/')) {
           // weibo.com/u/123456
           username = url.pathname.split('/u/')[1];
        } else {
           // weibo.com/nickname
           username = url.pathname.replace('/', '');
        }
      } catch(e) {}
    } else if (input.includes('xueqiu.com')) {
      platform = 'xueqiu';
      try {
        const url = new URL(input);
        if (url.pathname.includes('/u/')) {
          // xueqiu.com/u/123456
          username = url.pathname.split('/u/')[1];
        } else if (url.pathname.includes('/people/')) {
          // xueqiu.com/people/123456
          username = url.pathname.split('/people/')[1];
        } else {
          // xueqiu.com/nickname
          username = url.pathname.replace('/', '');
        }
      } catch(e) {}
    } else if (input.includes('twitter.com') || input.includes('x.com')) {
       platform = 'x';
       try {
        const url = new URL(input);
        username = url.pathname.split('/').filter(p => p)[0];
       } catch(e) {}
    } else if (input.includes('xiaohongshu.com') || input.includes('xhslink.com')) {
      platform = 'xiaohongshu';
      try {
        // If it's a short link or other format, we might just keep the URL or try to resolve it later.
        // For now, let's assume standard profile URL: https://www.xiaohongshu.com/user/profile/ID
        const url = new URL(input);
        if (url.pathname.includes('/user/profile/')) {
          username = url.pathname.split('/user/profile/')[1];
        } else {
          // Fallback: just store the ID if provided directly, or maybe we can't parse it easily without full URL
          // If input is just ID (usually 24 hex chars)
          if (/^[a-f0-9]{24}$/.test(input)) {
             username = input;
          }
        }
      } catch(e) {}
      
      // If we couldn't parse username but it looks like a valid ID string
       if (!username) {
          if (/^[a-f0-9]{24}$/.test(input)) {
             username = input;
          } else if (input.startsWith('http')) {
             // If it's a full URL (like xhslink.com), just use the URL as the handle
             username = input;
          }
       }
     } else {
       // Heuristic: if input contains non-ascii, likely xueqiu nickname
       // Or if input starts with @ -> X
       if (/^@/.test(input)) {
          platform = 'x';
          username = input.substring(1);
       } else if (/[\u4e00-\u9fa5]/.test(input)) {
          platform = 'xueqiu';
          username = input;
       } else {
          // Default to X if simple alphanumeric
          platform = 'x';
          username = input;
       }
    }

    if (username) username = decodeURIComponent(username);
    
    return { username, platform };
  }

  function saveAndRender() {
    chrome.storage.local.set({ users: users }, () => {
      renderList();
    });
  }

  function renderList() {
    userList.innerHTML = '';
    const filteredUsers = users.filter(u => {
        if (activeTab === 'x') return u.platform === 'x' || !u.platform;
        if (activeTab === 'weibo') return u.platform === 'weibo';
        if (activeTab === 'xueqiu') return u.platform === 'xueqiu';
        if (activeTab === 'xiaohongshu') return u.platform === 'xiaohongshu';
        return false;
    });

    if (filteredUsers.length === 0) {
      emptyStateList.classList.remove('hidden');
      emptyStateList.textContent = `No ${activeTab === 'x' ? 'X' : activeTab === 'weibo' ? 'Weibo' : activeTab === 'xueqiu' ? 'Xueqiu' : 'Xiaohongshu'} users added yet.`;
    } else {
      emptyStateList.classList.add('hidden');
      filteredUsers.forEach((user) => {
        // Find original index
        const index = users.indexOf(user);
        
        const li = document.createElement('li');
        li.className = 'user-item';
        
        li.innerHTML = `
          <div class="user-item-left">
            <input type="checkbox" class="user-checkbox" data-index="${index}" ${user.enabled ? 'checked' : ''}>
            <div class="user-info-container">
                <span class="username" title="${user.handle}">${user.alias || user.handle}</span>
                <button class="edit-btn" data-index="${index}" title="Edit Alias">✎</button>
            </div>
          </div>
          <button class="delete-btn" data-index="${index}">×</button>
        `;
        userList.appendChild(li);
      });
    }
    countSpan.textContent = filteredUsers.length;
  }

  function startFetching() {
    const activeUsers = users.filter(u => u.enabled);
    
    // Filter by active tab
    const targetUsers = activeUsers.filter(u => {
        if (activeTab === 'x') return u.platform === 'x' || !u.platform;
        if (activeTab === 'weibo') return u.platform === 'weibo';
        if (activeTab === 'xueqiu') return u.platform === 'xueqiu';
        if (activeTab === 'xiaohongshu') return u.platform === 'xiaohongshu';
        return false;
    });

    if (targetUsers.length === 0) { 
      tweetsContainer.innerHTML = `<div class="empty-state">No active ${activeTab === 'x' ? 'X' : activeTab === 'weibo' ? 'Weibo' : activeTab === 'xueqiu' ? 'Xueqiu' : 'Xiaohongshu'} users selected.</div>`;
      return; 
    }

    const handles = targetUsers.map(u => u.handle);

    if (activeTab === 'x') {
        fetchX(handles);
    } else if (activeTab === 'weibo') {
        fetchWeibo(handles);
    } else if (activeTab === 'xueqiu') {
        fetchXueqiu(handles);
    } else {
        fetchXiaohongshu(handles);
    }
  }

  function fetchX(handles) {
    currentFetchPlatform = 'x';
    tweetsContainer.innerHTML = '<div class="loading-spinner">Connecting to X...</div>';
    statusText.textContent = 'Initializing X...';

    // Construct URL
    const days = parseInt(timeRange.value);
    const date = new Date();
    date.setDate(date.getDate() - days);
    const sinceDate = date.toISOString().split('T')[0];
    
    const fromPart = handles.map(u => `from:${u}`).join(' OR ');
    let query = `(${fromPart}) since:${sinceDate}`;
    if (!includeReplies.checked) query += ' -filter:replies';
    
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;

    // Clear previous results
    chrome.storage.local.remove(['cachedTweets', 'fetchStatus'], () => {
      chrome.runtime.sendMessage({ action: "START_FETCH", url: searchUrl }, (response) => {
        startPolling();
      });
    });
  }

  function fetchWeibo(handles) {
    currentFetchPlatform = 'weibo';
    tweetsContainer.innerHTML = '<div class="empty-state">Opening Weibo pages...</div>';
    statusText.textContent = 'Opening pages...';

    let count = 0;
    handles.forEach(target => {
        let url;
        if (/^\d+$/.test(target)) {
            // UID
            url = `https://weibo.com/u/${target}`;
        } else {
            // Nickname - Use search for better accuracy
            url = `https://s.weibo.com/weibo?q=nickname:${encodeURIComponent(target)}`;
        }
        
        chrome.tabs.create({ url: url, active: false });
        count++;
    });

    tweetsContainer.innerHTML = `
        <div class="empty-state">
            <p>Opened ${count} Weibo page${count > 1 ? 's' : ''} in new tabs.</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (Weibo automated scraping is temporarily disabled)
            </p>
        </div>
    `;
    statusText.textContent = 'Done';
  }

  function fetchXueqiu(handles) {
    currentFetchPlatform = 'xueqiu';
    tweetsContainer.innerHTML = '<div class="loading-spinner">Connecting to Xueqiu...</div>';
    statusText.textContent = 'Initializing Xueqiu...';

    const urls = handles.map(target => {
        if (/^\d+$/.test(target)) {
            // UID
            return `https://xueqiu.com/u/${target}`;
        } else {
            // Nickname
            return `https://xueqiu.com/u/${encodeURIComponent(target)}`;
        }
    });

    // Clear previous results
    chrome.storage.local.remove(['cachedTweets', 'fetchStatus'], () => {
      chrome.runtime.sendMessage({ action: "START_BATCH_FETCH", urls: urls }, (response) => {
        startPolling();
      });
    });
  }

  function fetchXiaohongshu(handles) {
    currentFetchPlatform = 'xiaohongshu';
    tweetsContainer.innerHTML = '<div class="empty-state">Opening Xiaohongshu pages...</div>';
    statusText.textContent = 'Opening pages...';

    let count = 0;
    handles.forEach(target => {
        let url;
        // Check if target is a full URL or ID
        if (target.startsWith('http')) {
             url = target;
        } else {
             // Assume ID
             url = `https://www.xiaohongshu.com/user/profile/${target}`;
        }
        
        chrome.tabs.create({ url: url, active: false });
        count++;
    });

    tweetsContainer.innerHTML = `
        <div class="empty-state">
            <p>Opened ${count} Xiaohongshu page${count > 1 ? 's' : ''} in new tabs.</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (Xiaohongshu automated scraping is not supported yet)
            </p>
        </div>
    `;
    statusText.textContent = 'Done';
  }

  function startPolling() {
    if (statusPoll) clearInterval(statusPoll);
    
    statusPoll = setInterval(() => {
      chrome.storage.local.get(['fetchStatus', 'cachedTweets'], (result) => {
        const status = result.fetchStatus;
        if (!status) return;

        statusText.textContent = status.message;

        if (status.state === 'success') {
          clearInterval(statusPoll);
          
          // Filter tweets by time range if configured
          const days = parseInt(timeRange.value || '1');
          const date = new Date();
          date.setDate(date.getDate() - days);
          const sinceTime = date.getTime();
          
          let filteredTweets = result.cachedTweets;
          if (currentFetchPlatform !== 'x') { // X is already filtered by query
             filteredTweets = result.cachedTweets.filter(t => {
                 if (!t.time) return true; // Keep if no time
                 const tweetTime = new Date(t.time).getTime();
                 return tweetTime >= sinceTime;
             });
          }

          renderTweets(filteredTweets);
          statusText.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
        } else if (status.state === 'error') {
          clearInterval(statusPoll);
          tweetsContainer.innerHTML = `<div class="empty-state" style="color:red;">Error: ${status.message}</div>`;
        } else {
          // Still loading
          if (!tweetsContainer.querySelector('.loading-spinner')) {
             tweetsContainer.innerHTML = `<div class="loading-spinner">${status.message}</div>`;
          }
        }
      });
    }, 500);
  }

  function renderTweets(tweets) {
    tweetsContainer.innerHTML = '';
    
    // Check for explicit errors from scraper
    if (tweets && tweets.length === 1 && tweets[0].error) {
        const err = tweets[0];
        if (err.error === 'login_required') {
             tweetsContainer.innerHTML = `
                <div class="empty-state">
                    <p>Login Required</p>
                    <p>Please login to the target platform first.</p>
                </div>`;
        } else if (err.error === 'uid_resolution_failed') {
             tweetsContainer.innerHTML = '<div class="empty-state">Could not read Weibo profile info (UID resolution failed). Please make sure you are logged in, then retry.</div>';
        } else if (err.error === 'no_results') {
             tweetsContainer.innerHTML = '<div class="empty-state">No results found for this user.</div>';
        } else if (err.error === 'timeout') {
             tweetsContainer.innerHTML = '<div class="empty-state">Weibo page did not load posts in time. Please retry.</div>';
        } else {
             tweetsContainer.innerHTML = `<div class="empty-state">Error: ${err.error}</div>`;
        }
        return;
    }

    if (!tweets || tweets.length === 0) {
      tweetsContainer.innerHTML = currentFetchPlatform === 'xueqiu'
        ? '<div class="empty-state">No posts found.</div>'
        : currentFetchPlatform === 'weibo'
        ? '<div class="empty-state">No posts found.</div>'
        : currentFetchPlatform === 'xiaohongshu'
        ? '<div class="empty-state">No posts found.</div>'
        : '<div class="empty-state">No tweets found in this time range.</div>';
      return;
    }

    tweets.forEach(tweet => {
      const card = document.createElement('div');
      card.className = 'tweet-card';
      
      let mediaHtml = '';
      if (tweet.mediaUrls && tweet.mediaUrls.length > 0) {
        mediaHtml = `<div class="tweet-media">
          ${tweet.mediaUrls.map(url => `<img src="${url}" loading="lazy">`).join('')}
        </div>`;
      }

      // Add Reply Badge if needed
      let replyBadge = '';
      if (tweet.isReply) {
        replyBadge = `<span class="reply-badge">Replying</span>`;
      }

      // Check if text is long
      const isLongText = tweet.text && tweet.text.length > 150;
      const textClass = isLongText ? 'tweet-text collapsed' : 'tweet-text';
      const viewMoreBtn = isLongText ? '<button class="view-more-btn">View More</button>' : '';

      card.innerHTML = `
        <div class="tweet-header">
          <img data-src="${tweet.avatarUrl}" class="avatar" src="icons/avatar-fallback.svg">
          <div class="user-info">
            <div class="name-row">
              <span class="name">${tweet.name}</span>
              ${replyBadge}
            </div>
            <div class="time">${tweet.time ? new Date(tweet.time).toLocaleString() : ''}</div>
          </div>
        </div>
        <div class="${textClass}">${tweet.text}</div>
        ${viewMoreBtn}
        ${mediaHtml}
        <div class="tweet-footer">
          <a href="${escapeHtml(tweet.tweetUrl)}" target="_blank">
            ${tweet.platform === 'weibo' ? 'View on Weibo' : tweet.platform === 'xueqiu' ? 'View on Xueqiu' : tweet.platform === 'xiaohongshu' ? 'View on Xiaohongshu' : 'View on X'}
          </a>
        </div>
      `;
      
      // Add event listener for View More button
      if (isLongText) {
        const btn = card.querySelector('.view-more-btn');
        const textDiv = card.querySelector('.tweet-text');
        btn.addEventListener('click', () => {
          const isCollapsed = textDiv.classList.contains('collapsed');
          if (isCollapsed) {
            textDiv.classList.remove('collapsed');
            btn.textContent = 'Show Less';
          } else {
            textDiv.classList.add('collapsed');
            btn.textContent = 'View More';
          }
        });
      }
      
      // Load avatar via background
      const avatarImg = card.querySelector('.avatar');
      if (tweet.avatarUrl) {
        chrome.runtime.sendMessage({ 
          action: "FETCH_IMAGE_BASE64", 
          url: tweet.avatarUrl 
        }, (response) => {
          if (response && response.success) {
            avatarImg.src = response.data;
          } else {
             // Retry with original URL directly if base64 fails (sometimes caching works)
             // Or fallback to text
             if (tweet.avatarUrl) {
                avatarImg.src = tweet.avatarUrl;
                avatarImg.onerror = () => showTextAvatar(card, tweet.name);
             } else {
                showTextAvatar(card, tweet.name);
             }
          }
        });
      } else {
         showTextAvatar(card, tweet.name);
      }
      
      tweetsContainer.appendChild(card);
    });
  }

  function showTextAvatar(card, name) {
    const img = card.querySelector('.avatar');
    if (img) {
      const div = document.createElement('div');
      div.className = 'avatar text-avatar';
      div.textContent = (name || '?').charAt(0).toUpperCase();
      div.style.backgroundColor = stringToColor(name || 'user');
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.justifyContent = 'center';
      div.style.color = 'white';
      div.style.fontWeight = 'bold';
      div.style.fontSize = '20px';
      img.replaceWith(div);
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  }
});
