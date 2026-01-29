// sidepanel.js
// Runs inside the Side Panel

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const refreshBtn = document.getElementById('xt-refresh');
  const settingsBtn = document.getElementById('xt-settings-toggle');
  const langToggleBtn = document.getElementById('xt-lang-toggle');
  
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
  
  // List Management Elements
  const newListBtn = document.getElementById('newListBtn');
  const tabsListContainer = document.getElementById('tabsList');

  // State
  let users = [];
  let tabs = [];
  let statusPoll = null;
  let currentFetchPlatform = 'x';
  let activeTab = 'x'; // This is now a Tab ID
  let currentLang = 'en';

  const DEFAULT_TABS = [
    { id: 'x', name: 'X', type: 'system', platform: 'x' },
    { id: 'weibo', name: 'Weibo', type: 'system', platform: 'weibo' },
    { id: 'xueqiu', name: 'Xueqiu', type: 'system', platform: 'xueqiu' },
    { id: 'xiaohongshu', name: 'Xiaohongshu', type: 'system', platform: 'xiaohongshu' },
    { id: 'substack', name: 'Substack', type: 'system', platform: 'substack' }
  ];

  const TRANSLATIONS = {
    en: {
      greeting_hi: "Hi",
      greeting_subtitle: "It’s a new day.",
      status_ready: "Ready",
      status_initializing_x: "Initializing X...",
      status_connecting_x: "Connecting to X...",
      status_opening_weibo: "Opening pages...",
      status_opening_xueqiu: "Initializing Xueqiu...",
      status_connecting_xueqiu: "Connecting to Xueqiu...",
      status_opening_xhs: "Opening pages...",
      status_opening_substack: "Opening pages...",
      status_done: "Done",
      status_updated: "Updated: {time}",
      status_last_updated: "Last updated: {time}",
      
      input_placeholder: "X / Weibo / Xueqiu / Substack username or URL",
      btn_add: "Add",
      label_following: "Following",
      btn_clear_all: "Clear All",
      empty_list: "No users added yet.",
      label_time_range: "Time Range:",
      option_24h: "Last 24 Hours",
      option_3d: "Last 3 Days",
      option_1w: "Last Week",
      label_include_replies: "Include Replies",
      btn_fetch: "Fetch & Show Tweets",
      
      msg_invalid_url: "Invalid URL/Username",
      msg_already_added: "Already added",
      msg_enter_alias: "Enter alias for this user (leave empty to use original handle):",
      msg_remove_all: "Remove all users in this list?",
      msg_no_active_users: "No active users selected in this list.",
      
      label_lists: "Lists",
      btn_new_list: "+ New List",
      msg_enter_list_name: "Enter list name:",
      msg_delete_list: "Delete list '{name}' and all its users?",
      msg_rename_list: "Rename list:",

      feed_empty_state: `
        No tweets loaded.<br><br>
        1. Click <b>Settings (⚙️)</b> to add users.<br>
        2. Ensure users are <b>checked</b> (✅).<br>
        3. Click <b>Fetch & Show Tweets</b>.
      `,
      
      weibo_empty_state: `
        <div class="empty-state">
            <p>Opened {count} Weibo page{s} in new tabs.</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (Weibo automated scraping is temporarily disabled)
            </p>
        </div>
      `,
      
      xhs_empty_state: `
        <div class="empty-state">
            <p>Opened {count} Xiaohongshu page{s} in new tabs.</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (Xiaohongshu automated scraping is not supported yet)
            </p>
        </div>
      `,
      
      substack_empty_state: `
        <div class="empty-state">
            <p>Opened {count} Substack page{s} in new tabs.</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (Substack automated scraping is not supported yet)
            </p>
        </div>
      `,
      
      feed_loading_x: '<div class="loading-spinner">Connecting to X...</div>',
      feed_loading_xueqiu: '<div class="loading-spinner">Connecting to Xueqiu...</div>',
      feed_opening_weibo: '<div class="empty-state">Opening Weibo pages...</div>',
      feed_opening_xhs: '<div class="empty-state">Opening Xiaohongshu pages...</div>',
      feed_opening_substack: '<div class="empty-state">Opening Substack pages...</div>',

      empty_list_prefix: "No users in ",
      empty_list_suffix: " list yet."
    },
    zh: {
      greeting_hi: "你好",
      greeting_subtitle: "新的一天开始了。",
      status_ready: "就绪",
      status_initializing_x: "正在初始化 X...",
      status_connecting_x: "正在连接 X...",
      status_opening_weibo: "正在打开页面...",
      status_opening_xueqiu: "正在初始化雪球...",
      status_connecting_xueqiu: "正在连接雪球...",
      status_opening_xhs: "正在打开页面...",
      status_opening_substack: "正在打开页面...",
      status_done: "完成",
      status_updated: "更新于: {time}",
      status_last_updated: "上次更新: {time}",
      
      input_placeholder: "输入 X / 微博 / 雪球 / Substack 用户名或链接",
      btn_add: "添加",
      label_following: "关注列表",
      btn_clear_all: "清空",
      empty_list: "暂无用户",
      label_time_range: "时间范围:",
      option_24h: "过去 24 小时",
      option_3d: "过去 3 天",
      option_1w: "过去 1 周",
      label_include_replies: "包含回复",
      btn_fetch: "获取并显示动态",
      
      msg_invalid_url: "无效的链接或用户名",
      msg_already_added: "已存在",
      msg_enter_alias: "请输入备注名 (留空则使用原始名称):",
      msg_remove_all: "确定要移除此列表中的所有用户吗？",
      msg_no_active_users: "此列表中未选择任何用户。",
      
      label_lists: "列表",
      btn_new_list: "+ 新建列表",
      msg_enter_list_name: "输入列表名称:",
      msg_delete_list: "删除列表 '{name}' 及其所有用户？",
      msg_rename_list: "重命名列表:",

      feed_empty_state: `
        暂无动态。<br><br>
        1. 点击 <b>设置 (⚙️)</b> 添加用户。<br>
        2. 确保用户已被 <b>勾选</b> (✅)。<br>
        3. 点击 <b>获取并显示动态</b>。
      `,
      
      weibo_empty_state: `
        <div class="empty-state">
            <p>已在新标签页打开 {count} 个微博页面。</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (微博自动抓取暂时不可用)
            </p>
        </div>
      `,
      
      xhs_empty_state: `
        <div class="empty-state">
            <p>已在新标签页打开 {count} 个小红书页面。</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (小红书自动抓取暂不支持)
            </p>
        </div>
      `,
      
      substack_empty_state: `
        <div class="empty-state">
            <p>已在新标签页打开 {count} 个 Substack 页面。</p>
            <p style="font-size: 12px; color: #999; margin-top: 8px;">
                (Substack 自动抓取暂不支持)
            </p>
        </div>
      `,
      
      feed_loading_x: '<div class="loading-spinner">正在连接 X...</div>',
      feed_loading_xueqiu: '<div class="loading-spinner">正在连接雪球...</div>',
      feed_opening_weibo: '<div class="empty-state">正在打开微博页面...</div>',
      feed_opening_xhs: '<div class="empty-state">正在打开小红书页面...</div>',
      feed_opening_substack: '<div class="empty-state">正在打开 Substack 页面...</div>',

      empty_list_prefix: "暂无 ",
      empty_list_suffix: " 列表用户。"
    }
  };

  // --- Initialization ---
  
  // Load initial state
  chrome.storage.local.get(['users', 'tabs', 'timeRange', 'includeReplies', 'cachedTweets', 'fetchStatus', 'activeTab', 'lang'], (result) => {
    // Language init
    if (result.lang) {
      currentLang = result.lang;
    }
    updateLanguageUI();

    // Tabs init
    if (result.tabs && result.tabs.length > 0) {
        tabs = result.tabs;
    } else {
        tabs = JSON.parse(JSON.stringify(DEFAULT_TABS));
        chrome.storage.local.set({ tabs: tabs });
    }

    if (result.activeTab) {
        // Verify activeTab exists
        if (tabs.find(t => t.id === result.activeTab)) {
            activeTab = result.activeTab;
        } else {
            activeTab = 'x';
        }
    } else {
        activeTab = 'x';
    }
    
    // Render Tabs
    renderTopTabs();
    renderManageLists();

    if (result.users) {
      let needsMigration = false;
      const migratedUsers = result.users
        .filter(Boolean)
        .map((u) => {
          // V1 -> V2 Migration
          if (typeof u === 'string') {
            needsMigration = true;
            return { handle: u, enabled: true, platform: 'x', alias: '', tabId: 'x' };
          }

          if (typeof u === 'object') {
            const handle = typeof u.handle === 'string' ? u.handle : '';
            const enabled = typeof u.enabled === 'boolean' ? u.enabled : true;
            const platform = typeof u.platform === 'string' ? u.platform : 'x';
            const alias = typeof u.alias === 'string' ? u.alias : '';
            let tabId = typeof u.tabId === 'string' ? u.tabId : '';

            if (!handle) { needsMigration = true; return null; }

            // Migration: Assign tabId if missing
            if (!tabId) {
                needsMigration = true;
                tabId = platform; // Default to platform ID for system tabs
            }
            
            return { handle, enabled, platform, alias, tabId };
          }
          return null;
        })
        .filter(Boolean);

      users = migratedUsers;
      if (needsMigration) chrome.storage.local.set({ users: users });
      renderList();
    }
    
    if (result.timeRange) timeRange.value = result.timeRange;
    if (result.includeReplies !== undefined) includeReplies.checked = result.includeReplies;
    
    // Check cache
    if (result.cachedTweets && result.cachedTweets.length > 0) {
      renderTweets(result.cachedTweets);
      statusText.textContent = TRANSLATIONS[currentLang].status_last_updated.replace('{time}', new Date(result.fetchStatus?.lastUpdated || Date.now()).toLocaleTimeString());
    }
    
    // Resume polling if needed
    if (result.fetchStatus && (Date.now() - result.fetchStatus.lastUpdated < 30000) && result.fetchStatus.state !== 'success' && result.fetchStatus.state !== 'error') {
       startPolling();
    }
  });

  // --- Event Listeners ---

  // Platform Tabs (Top Bar)
  const topTabContainer = document.createElement('div');
  topTabContainer.className = 'platform-tabs';
  userList.parentNode.insertBefore(topTabContainer, userList); // Insert in settings view as per original design?
  // Wait, original design inserted it into settingsView. But we want to use it to switch lists.
  // The tabs should be persistent or visible. 
  // For now, let's keep it where it was (inside Settings View) but also replicate or move it if needed.
  // Actually, let's move it to the Header or top of Content so it's visible in both views?
  // Current design: Tabs are ONLY in settings view. When in feed view, you can't switch tabs.
  // This is acceptable.

  topTabContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (btn) {
          activeTab = btn.dataset.tab;
          renderTopTabs();
          renderManageLists();
          chrome.storage.local.set({ activeTab: activeTab });
          renderList();
      }
  });

  // Language Toggle
  langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'zh' : 'en';
    chrome.storage.local.set({ lang: currentLang });
    updateLanguageUI();
    renderTopTabs(); // Re-render to update names if needed (though names are user-defined mostly)
    renderList();
  });

  function updateLanguageUI() {
    const t = TRANSLATIONS[currentLang];
    
    // Toggle Button Text
    langToggleBtn.querySelector('.xt-btn-text').textContent = currentLang === 'en' ? 'EN' : '中';

    // Static Elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (t[key]) el.textContent = t[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      if (t[key]) el.placeholder = t[key];
    });

    if (statusText.textContent === 'Ready' || statusText.textContent === '就绪') {
        statusText.textContent = t.status_ready;
    }
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
      const newAlias = prompt(TRANSLATIONS[currentLang].msg_enter_alias, user.alias || user.handle);
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
    if (confirm(TRANSLATIONS[currentLang].msg_remove_all)) {
      // Only remove users in active tab
      users = users.filter(u => u.tabId !== activeTab);
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

  // List Management Events
  newListBtn.addEventListener('click', () => {
      const name = prompt(TRANSLATIONS[currentLang].msg_enter_list_name);
      if (name && name.trim()) {
          const id = 'custom_' + Date.now();
          tabs.push({ id, name: name.trim(), type: 'custom', platform: 'mixed' });
          chrome.storage.local.set({ tabs: tabs });
          activeTab = id;
          chrome.storage.local.set({ activeTab: activeTab });
          renderTopTabs();
          renderManageLists();
          renderList();
      }
  });

  tabsListContainer.addEventListener('click', (e) => {
      // Select Tab
      const chip = e.target.closest('.tab-chip');
      if (!chip) return;
      
      // If clicking action button, handle that instead
      if (e.target.closest('.delete-list-btn')) {
          const tabId = chip.dataset.tab;
          const tab = tabs.find(t => t.id === tabId);
          if (confirm(TRANSLATIONS[currentLang].msg_delete_list.replace('{name}', tab.name))) {
              // Delete users
              users = users.filter(u => u.tabId !== tabId);
              // Delete tab
              tabs = tabs.filter(t => t.id !== tabId);
              
              if (activeTab === tabId) activeTab = 'x'; // Fallback
              
              chrome.storage.local.set({ tabs: tabs, users: users, activeTab: activeTab });
              renderTopTabs();
              renderManageLists();
              renderList();
          }
          return;
      }
      
      if (e.target.closest('.rename-list-btn')) { // Rename
           const tabId = chip.dataset.tab;
           const tab = tabs.find(t => t.id === tabId);
           const newName = prompt(TRANSLATIONS[currentLang].msg_rename_list, tab.name);
           if (newName && newName.trim()) {
               tab.name = newName.trim();
               chrome.storage.local.set({ tabs: tabs });
               renderTopTabs();
               renderManageLists();
           }
           return;
      }

      // Select logic
      activeTab = chip.dataset.tab;
      renderTopTabs();
      renderManageLists();
      chrome.storage.local.set({ activeTab: activeTab });
      renderList();
  });

  // --- Functions ---

  function renderTopTabs() {
      topTabContainer.innerHTML = '';
      tabs.forEach(tab => {
          const btn = document.createElement('button');
          btn.className = `tab-btn ${tab.id === activeTab ? 'active' : ''}`;
          btn.dataset.tab = tab.id;
          btn.textContent = tab.name;
          topTabContainer.appendChild(btn);
      });
  }

  function renderManageLists() {
      tabsListContainer.innerHTML = '';
      tabs.forEach(tab => {
          const chip = document.createElement('div');
          chip.className = `tab-chip ${tab.id === activeTab ? 'active' : ''}`;
          chip.dataset.tab = tab.id;
          
          let actions = '';
          // Allow renaming all tabs. Allow deleting only custom tabs.
          const editBtn = `<div class="tab-action-btn rename-list-btn" title="Rename">✎</div>`;
          const deleteBtn = tab.type === 'custom' ? `<div class="tab-action-btn delete-list-btn" title="Delete">×</div>` : '';
          
          actions = `<div class="tab-chip-actions">${editBtn}${deleteBtn}</div>`;
          
          chip.innerHTML = `<span>${tab.name}</span>${actions}`;
          tabsListContainer.appendChild(chip);
      });
  }

  function addUser() {
    const input = userInput.value.trim();
    if (!input) return;
    const { username, platform } = extractUser(input);
    if (!username) { alert(TRANSLATIONS[currentLang].msg_invalid_url); return; }
    
    // Determine Target Tab
    const currentTab = tabs.find(t => t.id === activeTab);
    let targetTabId = activeTab;

    if (currentTab.type === 'system') {
        // In system tab mode, users are forced to their platform's system tab
        // to maintain the "All Users" behavior of system tabs.
        // E.g. Adding Weibo user while in 'x' tab -> goes to 'weibo' tab.
        // Find system tab for this platform
        const systemTab = tabs.find(t => t.type === 'system' && t.platform === platform);
        if (systemTab) {
            targetTabId = systemTab.id;
        } else {
            // Fallback (shouldn't happen for supported platforms)
            targetTabId = 'x';
        }
    } else {
        // In custom tab, user stays in this tab regardless of platform
        targetTabId = activeTab;
    }

    if (users.some(u => u.handle === username && u.platform === platform && u.tabId === targetTabId)) {
        alert(TRANSLATIONS[currentLang].msg_already_added); 
        return; 
    }
    
    users.push({ handle: username, enabled: true, platform: platform, alias: '', tabId: targetTabId });
    saveAndRender();
    userInput.value = '';
    
    // Feedback if added to a different tab
    if (targetTabId !== activeTab) {
        // Maybe switch tab? Or just alert?
        // Let's just switch to it so user sees it.
        activeTab = targetTabId;
        chrome.storage.local.set({ activeTab: activeTab });
        renderTopTabs();
        renderManageLists();
        renderList();
    }
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
    } else if (input.includes('substack.com')) {
       platform = 'substack';
       try {
         const url = new URL(input);
         if (url.hostname.endsWith('.substack.com') && !url.hostname.startsWith('www.')) {
            username = url.hostname.split('.')[0];
         } else if (url.pathname.startsWith('/@')) {
            username = url.pathname.split('/')[1]; 
         } else if (url.pathname.startsWith('/profile/')) {
             username = url.pathname.split('/profile/')[1];
         }
       } catch(e) {}
    } else if (input.includes('xiaohongshu.com') || input.includes('xhslink.com')) {
      platform = 'xiaohongshu';
      try {
        const url = new URL(input);
        if (url.pathname.includes('/user/profile/')) {
          username = url.pathname.split('/user/profile/')[1];
        } else {
          if (/^[a-f0-9]{24}$/.test(input)) {
             username = input;
          }
        }
      } catch(e) {}
       if (!username) {
          if (/^[a-f0-9]{24}$/.test(input)) {
             username = input;
          } else if (input.startsWith('http')) {
             username = input;
          }
       }
     } else {
       if (/^@/.test(input)) {
          platform = 'x';
          username = input.substring(1);
       } else if (/[\u4e00-\u9fa5]/.test(input)) {
          platform = 'xueqiu';
          username = input;
       } else {
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
    const filteredUsers = users.filter(u => u.tabId === activeTab);

    if (filteredUsers.length === 0) {
      emptyStateList.classList.remove('hidden');
      const currentTab = tabs.find(t => t.id === activeTab);
      const tabName = currentTab ? currentTab.name : 'Unknown';
      emptyStateList.textContent = TRANSLATIONS[currentLang].empty_list_prefix + tabName + TRANSLATIONS[currentLang].empty_list_suffix;
    } else {
      emptyStateList.classList.add('hidden');
      filteredUsers.forEach((user) => {
        // Find original index
        const index = users.indexOf(user);
        
        const li = document.createElement('li');
        li.className = 'user-item';
        
        // Show platform icon or label if in mixed list?
        // For now, simple text.
        
        li.innerHTML = `
          <div class="user-item-left">
            <input type="checkbox" class="user-checkbox" data-index="${index}" ${user.enabled ? 'checked' : ''}>
            <div class="user-info-container">
                <div class="user-alias-row">
                    <span class="user-alias" title="${user.handle}">${user.alias || user.handle}</span>
                    <button class="edit-btn" data-index="${index}" title="Edit Alias">✎</button>
                </div>
                <span class="user-handle" title="${user.platform}">${user.platform}</span>
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
    // Get users in active tab
    const targetUsers = users.filter(u => u.enabled && u.tabId === activeTab);

    if (targetUsers.length === 0) { 
      const currentTab = tabs.find(t => t.id === activeTab);
      tweetsContainer.innerHTML = `<div class="empty-state">${TRANSLATIONS[currentLang].msg_no_active_users}</div>`;
      return; 
    }

    // Group by platform
    const groups = {};
    targetUsers.forEach(u => {
        if (!groups[u.platform]) groups[u.platform] = [];
        groups[u.platform].push(u.handle);
    });

    // Reset UI
    tweetsContainer.innerHTML = '';
    
    // Execute Actions
    let handledFeed = false;

    // 1. Open Tabs (Background actions)
    let openedTabsCount = 0;
    
    if (groups.weibo && groups.weibo.length > 0) {
        fetchWeibo(groups.weibo, true); // true = silent/append mode (don't clear UI)
        openedTabsCount += groups.weibo.length;
    }
    if (groups.xiaohongshu && groups.xiaohongshu.length > 0) {
        fetchXiaohongshu(groups.xiaohongshu, true);
        openedTabsCount += groups.xiaohongshu.length;
    }
    if (groups.substack && groups.substack.length > 0) {
        fetchSubstack(groups.substack, true);
        openedTabsCount += groups.substack.length;
    }

    // 2. Load Feed (Primary Content)
    // Prioritize X, then Xueqiu
    if (groups.x && groups.x.length > 0) {
        fetchX(groups.x);
        handledFeed = true;
    } else if (groups.xueqiu && groups.xueqiu.length > 0) {
        fetchXueqiu(groups.xueqiu);
        handledFeed = true;
    }
    
    // If we only opened tabs and no feed to show
    if (!handledFeed && openedTabsCount > 0) {
        tweetsContainer.innerHTML = `<div class="empty-state">Opened ${openedTabsCount} pages in background tabs.</div>`;
        statusText.textContent = TRANSLATIONS[currentLang].status_done;
    }
  }

  function fetchX(handles) {
    currentFetchPlatform = 'x';
    tweetsContainer.innerHTML = TRANSLATIONS[currentLang].feed_loading_x;
    statusText.textContent = TRANSLATIONS[currentLang].status_initializing_x;

    const days = parseInt(timeRange.value);
    const date = new Date();
    date.setDate(date.getDate() - days);
    const sinceDate = date.toISOString().split('T')[0];
    
    const fromPart = handles.map(u => `from:${u}`).join(' OR ');
    let query = `(${fromPart}) since:${sinceDate}`;
    if (!includeReplies.checked) query += ' -filter:replies';
    
    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;

    chrome.storage.local.remove(['cachedTweets', 'fetchStatus'], () => {
      chrome.runtime.sendMessage({ action: "START_FETCH", url: searchUrl }, (response) => {
        startPolling();
      });
    });
  }

  function fetchWeibo(handles, silent = false) {
    if (!silent) {
        currentFetchPlatform = 'weibo';
        tweetsContainer.innerHTML = TRANSLATIONS[currentLang].feed_opening_weibo;
        statusText.textContent = TRANSLATIONS[currentLang].status_opening_weibo;
    }

    let count = 0;
    handles.forEach(target => {
        let url;
        if (/^\d+$/.test(target)) {
            url = `https://weibo.com/u/${target}`;
        } else {
            url = `https://s.weibo.com/weibo?q=nickname:${encodeURIComponent(target)}`;
        }
        chrome.tabs.create({ url: url, active: false });
        count++;
    });

    if (!silent) {
        tweetsContainer.innerHTML = TRANSLATIONS[currentLang].weibo_empty_state.replace('{count}', count).replace('{s}', count > 1 ? 's' : '');
        statusText.textContent = TRANSLATIONS[currentLang].status_done;
    }
  }

  function fetchXueqiu(handles) {
    currentFetchPlatform = 'xueqiu';
    tweetsContainer.innerHTML = TRANSLATIONS[currentLang].feed_loading_xueqiu;
    statusText.textContent = TRANSLATIONS[currentLang].status_initializing_xueqiu;

    const urls = handles.map(target => {
        if (/^\d+$/.test(target)) {
            return `https://xueqiu.com/u/${target}`;
        } else {
            return `https://xueqiu.com/u/${encodeURIComponent(target)}`;
        }
    });

    chrome.storage.local.remove(['cachedTweets', 'fetchStatus'], () => {
      chrome.runtime.sendMessage({ action: "START_BATCH_FETCH", urls: urls }, (response) => {
        startPolling();
      });
    });
  }

  function fetchXiaohongshu(handles, silent = false) {
    if (!silent) {
        currentFetchPlatform = 'xiaohongshu';
        tweetsContainer.innerHTML = TRANSLATIONS[currentLang].feed_opening_xhs;
        statusText.textContent = TRANSLATIONS[currentLang].status_opening_xhs;
    }

    let count = 0;
    handles.forEach(target => {
        let url;
        if (target.startsWith('http')) {
             url = target;
        } else {
             url = `https://www.xiaohongshu.com/user/profile/${target}`;
        }
        chrome.tabs.create({ url: url, active: false });
        count++;
    });

    if (!silent) {
        tweetsContainer.innerHTML = TRANSLATIONS[currentLang].xhs_empty_state.replace('{count}', count).replace('{s}', count > 1 ? 's' : '');
        statusText.textContent = TRANSLATIONS[currentLang].status_done;
    }
  }

  function fetchSubstack(handles, silent = false) {
    if (!silent) {
        currentFetchPlatform = 'substack';
        tweetsContainer.innerHTML = TRANSLATIONS[currentLang].feed_opening_substack;
        statusText.textContent = TRANSLATIONS[currentLang].status_opening_substack;
    }

    let count = 0;
    handles.forEach(target => {
        let url;
        if (target.startsWith('http')) {
             url = target;
        } else if (target.startsWith('@')) {
             url = `https://substack.com/${target}`;
        } else {
             url = `https://${target}.substack.com`;
        }
        chrome.tabs.create({ url: url, active: false });
        count++;
    });

    if (!silent) {
        tweetsContainer.innerHTML = TRANSLATIONS[currentLang].substack_empty_state.replace('{count}', count).replace('{s}', count > 1 ? 's' : '');
        statusText.textContent = TRANSLATIONS[currentLang].status_done;
    }
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
          
          const days = parseInt(timeRange.value || '1');
          const date = new Date();
          date.setDate(date.getDate() - days);
          const sinceTime = date.getTime();
          
          let filteredTweets = result.cachedTweets;
          if (currentFetchPlatform !== 'x') {
             filteredTweets = result.cachedTweets.filter(t => {
                 if (!t.time) return true;
                 const tweetTime = new Date(t.time).getTime();
                 return tweetTime >= sinceTime;
             });
          }

          renderTweets(filteredTweets);
          statusText.textContent = TRANSLATIONS[currentLang].status_updated.replace('{time}', new Date().toLocaleTimeString());
        } else if (status.state === 'error') {
          clearInterval(statusPoll);
          tweetsContainer.innerHTML = `<div class="empty-state" style="color:red;">Error: ${status.message}</div>`;
        } else {
          if (!tweetsContainer.querySelector('.loading-spinner')) {
             tweetsContainer.innerHTML = `<div class="loading-spinner">${status.message}</div>`;
          }
        }
      });
    }, 500);
  }

  function renderTweets(tweets) {
    tweetsContainer.innerHTML = '';
    
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
      tweetsContainer.innerHTML = currentFetchPlatform === 'x'
          ? TRANSLATIONS[currentLang].feed_empty_state
          : '<div class="empty-state">No posts found.</div>';
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

      let replyBadge = '';
      if (tweet.isReply) {
        replyBadge = `<span class="reply-badge">Replying</span>`;
      }

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
            ${tweet.platform === 'weibo' ? 'View on Weibo' : tweet.platform === 'xueqiu' ? 'View on Xueqiu' : tweet.platform === 'xiaohongshu' ? 'View on Xiaohongshu' : tweet.platform === 'substack' ? 'View on Substack' : 'View on X'}
          </a>
        </div>
      `;
      
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
      
      const avatarImg = card.querySelector('.avatar');
      if (tweet.avatarUrl) {
        chrome.runtime.sendMessage({ 
          action: "FETCH_IMAGE_BASE64", 
          url: tweet.avatarUrl 
        }, (response) => {
          if (response && response.success) {
            avatarImg.src = response.data;
          } else {
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
