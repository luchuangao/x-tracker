// sidepanel.js
// Runs inside the Side Panel

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const refreshBtn = document.getElementById('xt-refresh');
  const langToggleBtn = document.getElementById('xt-lang-toggle');
  
  // Navigation Tabs
  const navFeedBtn = document.getElementById('nav-feed');
  const navListsBtn = document.getElementById('nav-lists');
  
  // Views
  const feedView = document.getElementById('feedView');
  const listsView = document.getElementById('listsView'); 
  
  // Feed Elements
  const feedContainer = document.getElementById('feedContainer');

  // Lists Elements
  const userInput = document.getElementById('userInput');
  const addBtn = document.getElementById('addBtn');
  const userList = document.getElementById('userList');
  const listSelect = document.getElementById('listSelect');
  const editListBtn = document.getElementById('editListBtn');
  const deleteListBtn = document.getElementById('deleteListBtn');
  const listMenuBtn = document.getElementById('listMenuBtn');
  const listMenuDropdown = document.getElementById('listMenuDropdown');
  const newListBtn = document.getElementById('newListBtn');
  const inputError = document.getElementById('inputError');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importInput = document.getElementById('importInput');
  const emptyStateList = document.getElementById('emptyStateList');
  const includeReplies = document.getElementById('includeReplies');
  const fetchBtn = document.getElementById('fetchBtn');
  
  // State
  let users = [];
  let tabs = [];
  let activeTab = 'all'; // For List View
  let currentLang = 'en';
  
  const DEFAULT_TABS = [
    { id: 'all', name: 'All', type: 'system', platform: 'all' },
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
      status_done: "Done",
      
      nav_feed: "Feed",
      nav_lists: "Lists",
      
      input_placeholder: "X / Weibo / Xueqiu / Substack username or URL",
      btn_add: "Add",
      btn_import: "Import",
      btn_export: "Export",
      empty_list: "No users added yet.",
      label_include_replies: "Include Replies (X only)",
      btn_fetch: "Open Selected",
      
      msg_invalid_url: "Invalid URL/Username",
      msg_already_added: "Already added",
      msg_enter_alias: "Enter alias for this user (leave empty to use original handle):",
      msg_no_active_users: "No active users selected in this list.",
      
      btn_new_list: "+ New List",
      msg_enter_list_name: "Enter list name:",
      msg_delete_list: "Delete list '{name}' and all its users?",
      msg_rename_list: "Rename list:",
      msg_import_success: "Imported successfully!",
      msg_import_error: "Import failed: Invalid file format",

      feed_empty_state: `
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">No sources to check.</div>
        <div class="empty-state-subtext">Add users in <b>Lists</b> tab to start tracking.</div>
      `,
      
      msg_added_feed_tip: "Added! Check the Feed tab.",

      empty_list_prefix: "No users in ",
      empty_list_suffix: " list yet.",
      
      msg_select_custom_list: "Please select a custom list to add generic links.",
      msg_create_list_for_web: "Generic links cannot be added to system lists. Do you want to create a new custom list?"
    },
    zh: {
      greeting_hi: "你好",
      greeting_subtitle: "新的一天开始了。",
      status_ready: "就绪",
      status_done: "完成",
      
      nav_feed: "动态",
      nav_lists: "列表",
      
      input_placeholder: "输入 X / 微博 / 雪球 / Substack 用户名或链接",
      btn_add: "添加",
      btn_import: "导入",
      btn_export: "导出",
      empty_list: "暂无用户",
      label_include_replies: "包含回复 (仅 X)",
      btn_fetch: "打开选中项",
      
      msg_invalid_url: "无效的链接或用户名",
      msg_already_added: "已存在",
      msg_enter_alias: "请输入备注名 (留空则使用原始名称):",
      msg_no_active_users: "此列表中未选择任何用户。",
      
      btn_new_list: "+ 新建列表",
      msg_enter_list_name: "输入列表名称:",
      msg_delete_list: "删除列表 '{name}' 及其所有用户？",
      msg_rename_list: "重命名列表:",
      msg_import_success: "导入成功！",
      msg_import_error: "导入失败：文件格式无效",

      feed_empty_state: `
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">暂无动态源</div>
        <div class="empty-state-subtext">前往 <b>列表</b> 标签页添加关注对象。</div>
      `,
      
      msg_added_feed_tip: "已添加！请前往动态页面查看。",

      empty_list_prefix: "暂无 ",
      empty_list_suffix: " 列表用户。",
      
      msg_select_custom_list: "请先选择一个自定义列表以添加普通链接。",
      msg_create_list_for_web: "无法添加链接到系统列表。是否创建一个新的自定义列表？"
    }
  };

  // --- Initialization ---
  
  // Load initial state
  chrome.storage.local.get(['users', 'tabs', 'includeReplies', 'activeTab', 'lang'], (result) => {
    // Language init
    if (result.lang) {
      currentLang = result.lang;
    }
    updateLanguageUI();

    // Tabs init
    if (result.tabs && result.tabs.length > 0) {
        tabs = result.tabs;
        if (!tabs.some(t => t.id === 'all')) {
            tabs.unshift({ id: 'all', name: 'All', type: 'system', platform: 'all' });
        }
    } else {
        tabs = JSON.parse(JSON.stringify(DEFAULT_TABS));
        chrome.storage.local.set({ tabs: tabs });
    }

    if (result.activeTab) {
        if (tabs.find(t => t.id === result.activeTab)) {
            activeTab = result.activeTab;
        } else {
            activeTab = 'all';
        }
    } else {
        activeTab = 'all';
    }

    if (activeTab === 'x' && !tabs.find(t => t.id === 'x')) {
        activeTab = 'all';
    }
    
    // Render List UI
    renderTopTabs();
    listSelect.value = activeTab;

    if (result.users) {
      let needsMigration = false;
      const migratedUsers = result.users
        .filter(Boolean)
        .map((u) => {
          // Migration Logic
          if (typeof u === 'string') {
            needsMigration = true;
            return { handle: u, enabled: true, platform: 'x', alias: '', tabId: 'x', lastRead: Date.now() };
          }

          if (typeof u === 'object') {
            let handle = u.handle || u.username || u.id || '';
            const enabled = typeof u.enabled === 'boolean' ? u.enabled : true;
            let platform = u.platform || 'x';
            const alias = u.alias || '';
            let tabId = u.tabId || '';
            let lastRead = u.lastRead || 0; 
            
            if (u.lastRead === undefined) {
                lastRead = Date.now();
                needsMigration = true;
            }

            if (!handle) { needsMigration = true; return null; }

            if (!tabId) {
                needsMigration = true;
                tabId = platform; 
            }
            
            if (!platform) platform = 'x';
            
            return { handle, enabled, platform, alias, tabId, lastRead };
          }
          return null;
        })
        .filter(Boolean);

      users = migratedUsers;
      if (needsMigration) chrome.storage.local.set({ users });
    } else {
        users = [];
    }
    
    renderList(); // Render Management List
    renderFeed(); // Render Feed
    
    if (result.includeReplies !== undefined) includeReplies.checked = result.includeReplies;
  });

  // --- Event Listeners ---

  // Navigation
  navFeedBtn.addEventListener('click', () => {
      switchView('feed');
  });
  
  navListsBtn.addEventListener('click', () => {
      switchView('lists');
  });
  
  function switchView(view) {
      if (view === 'feed') {
          navFeedBtn.classList.add('active');
          navListsBtn.classList.remove('active');
          feedView.classList.remove('hidden');
          listsView.classList.add('hidden');
          renderFeed(); // Refresh feed
      } else {
          navFeedBtn.classList.remove('active');
          navListsBtn.classList.add('active');
          feedView.classList.add('hidden');
          listsView.classList.remove('hidden');
      }
  }

  const listTitleWrapper = document.querySelector('.list-title-wrapper');
  
  // List Select Logic
  listSelect.addEventListener('change', () => {
      activeTab = listSelect.value;
      chrome.storage.local.set({ activeTab: activeTab });
      renderList();
  });

  // Hover effect to show actions
  listTitleWrapper.addEventListener('mouseenter', () => {
      const tab = tabs.find(t => t.id === activeTab);
      if (tab && tab.type === 'custom') {
          editListBtn.classList.remove('hidden');
          deleteListBtn.classList.remove('hidden');
      }
  });

  listTitleWrapper.addEventListener('mouseleave', () => {
      editListBtn.classList.add('hidden');
      deleteListBtn.classList.add('hidden');
  });
  
  // New List Button
  newListBtn.addEventListener('click', createNewList);

  function createNewList() {
      const name = prompt(TRANSLATIONS[currentLang].msg_enter_list_name);
      if (name && name.trim()) {
          const id = 'custom_' + Date.now();
          tabs.push({ id, name: name.trim(), type: 'custom', platform: 'mixed' });
          chrome.storage.local.set({ tabs: tabs });
          activeTab = id;
          chrome.storage.local.set({ activeTab: activeTab });
          renderTopTabs();
          renderList();
      }
  }

  editListBtn.addEventListener('click', () => {
       const tab = tabs.find(t => t.id === activeTab);
       if (!tab || tab.type !== 'custom') return;
       
       const newName = prompt(TRANSLATIONS[currentLang].msg_rename_list, tab.name);
       if (newName && newName.trim()) {
           tab.name = newName.trim();
           chrome.storage.local.set({ tabs: tabs });
           renderTopTabs();
           renderList();
       }
  });

  deleteListBtn.addEventListener('click', () => {
      const tab = tabs.find(t => t.id === activeTab);
      if (!tab || tab.type !== 'custom') return;
      
      if (confirm(TRANSLATIONS[currentLang].msg_delete_list.replace('{name}', tab.name))) {
          // Delete users
          users = users.filter(u => u.tabId !== activeTab);
          // Delete tab
          tabs = tabs.filter(t => t.id !== activeTab);
          
          activeTab = 'all'; // Fallback to All
          
          chrome.storage.local.set({ tabs: tabs, users: users, activeTab: activeTab });
          renderTopTabs();
          renderList();
      }
  });

  // User Input Validation
  userInput.addEventListener('input', () => {
      const val = userInput.value.trim();
      if (!val) {
          inputError.classList.add('hidden');
          return;
      }
      const { username } = extractUser(val);
      if (!username) {
          inputError.textContent = TRANSLATIONS[currentLang].msg_invalid_url;
          inputError.classList.remove('hidden');
      } else {
          inputError.classList.add('hidden');
      }
  });

  // Language Toggle
  langToggleBtn.addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'zh' : 'en';
    chrome.storage.local.set({ lang: currentLang });
    updateLanguageUI();
    renderTopTabs();
    renderList();
    renderFeed();
  });

  function updateLanguageUI() {
    const t = TRANSLATIONS[currentLang];
    
    // Toggle Button Text
    langToggleBtn.querySelector('.xt-btn-text').textContent = currentLang === 'en' ? 'EN' : '中';

    // Static Elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (t[key]) el.textContent = t[key];
      // Keep active class logic separate
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      if (t[key]) el.placeholder = t[key];
    });
  }

  refreshBtn.addEventListener('click', () => {
    // Refresh feed
    renderFeed();
  });

  // Settings Logic
  addBtn.addEventListener('click', addUser);
  userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addUser(); });
  
  // List Menu Logic
  listMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      listMenuDropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
      if (!listMenuBtn.contains(e.target) && !listMenuDropdown.contains(e.target)) {
          listMenuDropdown.classList.add('hidden');
      }
  });

  listMenuDropdown.addEventListener('click', () => {
      listMenuDropdown.classList.add('hidden');
  });
  
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

  // Export
  exportBtn.addEventListener('click', () => {
    const data = {
        users: users,
        tabs: tabs,
        version: "1.6",
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `x-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  importBtn.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.users && Array.isArray(data.users)) {
                // Merge users
                const existingKeys = new Set(users.map(u => `${u.handle}-${u.platform}-${u.tabId}`));
                const newUsers = data.users.filter(u => !existingKeys.has(`${u.handle}-${u.platform}-${u.tabId}`));
                
                // Set default lastRead for imported users
                newUsers.forEach(u => { if(!u.lastRead) u.lastRead = Date.now(); });

                users = [...users, ...newUsers];
                
                // Merge tabs
                if (data.tabs && Array.isArray(data.tabs)) {
                    const existingTabIds = new Set(tabs.map(t => t.id));
                    const newTabs = data.tabs.filter(t => t.type === 'custom' && !existingTabIds.has(t.id));
                    tabs = [...tabs, ...newTabs];
                }

                chrome.storage.local.set({ users, tabs }, () => {
                    alert(TRANSLATIONS[currentLang].msg_import_success);
                    renderTopTabs();
                    renderList();
                    renderFeed();
                });
            } else {
                throw new Error("Invalid Format");
            }
        } catch (err) {
            alert(TRANSLATIONS[currentLang].msg_import_error);
        }
        importInput.value = ''; // Reset
    };
    reader.readAsText(file);
  });

  includeReplies.addEventListener('change', () => chrome.storage.local.set({ includeReplies: includeReplies.checked }));
  
  // This button is in Lists view now, acting as "Open Selected"
  fetchBtn.addEventListener('click', () => {
    startFetching(); // This opens tabs
  });

  // --- Functions ---

  function renderTopTabs() {
      listSelect.innerHTML = '';
      tabs.forEach(tab => {
          const option = document.createElement('option');
          option.value = tab.id;
          option.textContent = tab.name;
          if (tab.id === activeTab) option.selected = true;
          listSelect.appendChild(option);
      });
  }

  function showToast(message) {
      // Create Toast Element
      const toast = document.createElement('div');
      toast.className = 'xt-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      
      // Animate In
      requestAnimationFrame(() => {
          toast.classList.add('show');
      });
      
      // Remove after 3s
      setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
              document.body.removeChild(toast);
          }, 300);
      }, 3000);
  }

  function addUser() {
    const input = userInput.value.trim();
    if (!input) return;
    const { username, platform } = extractUser(input);
    if (!username) { alert(TRANSLATIONS[currentLang].msg_invalid_url); return; }
    
    // Determine Target Tab
    const currentTab = tabs.find(t => t.id === activeTab);
    let targetTabId = activeTab;

    if (activeTab === 'all') {
        const systemTab = tabs.find(t => t.type === 'system' && t.platform === platform);
        if (platform === 'web' && !systemTab) {
             if (confirm(TRANSLATIONS[currentLang].msg_create_list_for_web)) {
                 createNewList();
             }
             return;
        }
        targetTabId = systemTab ? systemTab.id : 'x';
    } else if (currentTab.type === 'system') {
        const systemTab = tabs.find(t => t.type === 'system' && t.platform === platform);
        
        if (platform === 'web' && !systemTab) {
             if (confirm(TRANSLATIONS[currentLang].msg_create_list_for_web)) {
                 createNewList();
             }
             return;
        }

        if (systemTab) {
            targetTabId = systemTab.id;
        } else {
            targetTabId = 'x';
        }
    } else {
        targetTabId = activeTab;
    }

    if (users.some(u => u.handle === username && u.platform === platform && u.tabId === targetTabId)) {
        showToast(TRANSLATIONS[currentLang].msg_already_added); 
        return; 
    }
    
    // Add user with lastRead = 0 (Just for sorting initially, though unread concept is gone)
    // Actually, better to set it to Date.now() so it's "New" but not "Ancient"
    users.push({ handle: username, enabled: true, platform: platform, alias: '', tabId: targetTabId, lastRead: Date.now() });
    saveAndRender();
    userInput.value = '';
    inputError.classList.add('hidden');
    
    showToast(TRANSLATIONS[currentLang].msg_added_feed_tip);
  }

  function extractUser(input) {
    input = input.replace(/\/$/, '');
    let platform = 'x';
    let username = null;

    if (input.includes('weibo.com')) {
      platform = 'weibo';
      try {
        const url = new URL(input);
        if (url.pathname.includes('/u/')) {
           username = url.pathname.split('/u/')[1];
        } else {
           username = url.pathname.replace('/', '');
        }
      } catch(e) {}
    } else if (input.includes('xueqiu.com')) {
      platform = 'xueqiu';
      try {
        const url = new URL(input);
        if (url.pathname.includes('/u/')) {
          username = url.pathname.split('/u/')[1];
        } else if (url.pathname.includes('/people/')) {
          username = url.pathname.split('/people/')[1];
        } else {
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
       } else if (input.startsWith('http://') || input.startsWith('https://')) {
          platform = 'web';
          username = input;
       } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(input)) {
          platform = 'web';
          username = 'https://' + input;
       } else {
          platform = 'x';
          username = input;
       }
    }

    if (username) username = decodeURIComponent(username);
    return { username, platform };
  }

  function saveAndRender(silent = false) {
    chrome.storage.local.set({ users: users }, () => {
      if (!silent) renderList();
    });
  }

  function renderList() {
    userList.innerHTML = '';
    listSelect.value = activeTab;
    editListBtn.classList.add('hidden');
    deleteListBtn.classList.add('hidden');

    let filteredUsers = [];
    if (activeTab === 'all') {
        filteredUsers = users;
    } else {
        filteredUsers = users.filter(u => u.tabId === activeTab);
    }

    if (filteredUsers.length === 0) {
      emptyStateList.classList.remove('hidden');
      const tabName = tabs.find(t => t.id === activeTab)?.name || 'Unknown';
      if (activeTab === 'all') {
         emptyStateList.textContent = TRANSLATIONS[currentLang].empty_list;
      } else {
         emptyStateList.textContent = TRANSLATIONS[currentLang].empty_list_prefix + tabName + TRANSLATIONS[currentLang].empty_list_suffix;
      }
    } else {
      emptyStateList.classList.add('hidden');
      filteredUsers.forEach((user) => {
        const index = users.indexOf(user);
        
        const li = document.createElement('li');
        li.className = 'user-item';
        
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
  }

  // --- Feed Logic ---
  
  function renderFeed() {
      feedContainer.innerHTML = '';
      
      // Show all users, regardless of enabled status (checkbox in Lists)
      // Checkbox in Lists is only for batch operations (Open Selected)
      let displayUsers = [...users]; 
      
      // Sort: Recently Browsed First (Descending)
      displayUsers.sort((a, b) => {
          const timeA = a.lastRead || 0;
          const timeB = b.lastRead || 0;
          return timeB - timeA;
      });
      
      if (displayUsers.length === 0) {
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'empty-state';
          emptyDiv.innerHTML = TRANSLATIONS[currentLang].feed_empty_state;
          feedContainer.appendChild(emptyDiv);
          return;
      }
      
      displayUsers.forEach(user => {
          const index = users.indexOf(user);
          const card = document.createElement('div');
          card.className = 'source-card'; // No unread class
          
          const displayName = user.alias || user.handle;
          const displayHandle = user.platform === 'web' ? new URL(user.handle).hostname : user.handle;
          
          // Time logic
          const timeSince = user.lastRead === 0 ? 'Never checked' : timeAgo(user.lastRead);
          
          card.innerHTML = `
            <div class="source-info">
                <div class="source-avatar" style="background-color: ${stringToColor(displayName)}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">
                    ${displayName.charAt(0).toUpperCase()}
                </div>
                <div class="source-details">
                    <div class="source-name-row">
                        <span class="source-name">${displayName}</span>
                    </div>
                    <div class="source-meta">
                        <span class="source-platform">${user.platform}</span>
                        <span>${timeSince}</span>
                    </div>
                </div>
            </div>
            <!-- No Check Button -->
          `;
          
          // Click Handler
          card.addEventListener('click', () => {
              openUserUrl(user);
              // Update lastRead
              users[index].lastRead = Date.now();
              // Save and update UI (to update "Just now" and move to top)
              saveAndRender(false); 
          });
          
          feedContainer.appendChild(card);
      });
  }
  
  function openUserUrl(user) {
      let url = '';
      const handle = user.handle;
      
      switch(user.platform) {
          case 'x': 
              url = `https://x.com/${handle}`; 
              // Check if Include Replies is checked
              if (includeReplies && includeReplies.checked) {
                  url += '/with_replies';
              }
              break;
          case 'weibo': 
            url = /^\d+$/.test(handle) ? `https://weibo.com/u/${handle}` : `https://s.weibo.com/weibo?q=nickname:${encodeURIComponent(handle)}`;
            break;
          case 'xueqiu':
            url = /^\d+$/.test(handle) ? `https://xueqiu.com/u/${handle}` : `https://xueqiu.com/u/${encodeURIComponent(handle)}`;
            break;
          case 'xiaohongshu':
            url = handle.startsWith('http') ? handle : `https://www.xiaohongshu.com/user/profile/${handle}`;
            break;
          case 'substack':
            url = handle.startsWith('http') ? handle : `https://${handle}.substack.com`;
            break;
          case 'web':
            url = handle;
            break;
          default:
            url = handle.startsWith('http') ? handle : `https://x.com/${handle}`;
      }
      
      chrome.tabs.create({ url: url });
  }

  function startFetching() {
    // Legacy function reused for "Open Selected" in Lists view
    // Logic: Open tabs for selected users in current list
    let targetUsers = [];
    if (activeTab === 'all') {
        targetUsers = users.filter(u => u.enabled);
    } else {
        targetUsers = users.filter(u => u.enabled && u.tabId === activeTab);
    }

    if (targetUsers.length === 0) { 
      showToast(TRANSLATIONS[currentLang].msg_no_active_users);
      return; 
    }
    
    let count = 0;
    targetUsers.forEach(u => {
        openUserUrl(u);
        u.lastRead = Date.now(); // Mark as read when batch opening
        count++;
    });
    
    saveAndRender(true);
  }
  
  function timeAgo(timestamp) {
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      let interval = seconds / 31536000;
      if (interval > 1) return Math.floor(interval) + "y ago";
      interval = seconds / 2592000;
      if (interval > 1) return Math.floor(interval) + "mo ago";
      interval = seconds / 86400;
      if (interval > 1) return Math.floor(interval) + "d ago";
      interval = seconds / 3600;
      if (interval > 1) return Math.floor(interval) + "h ago";
      interval = seconds / 60;
      if (interval > 1) return Math.floor(interval) + "m ago";
      return "Just now";
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
