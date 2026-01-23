// background.js
// Handles the heavy lifting of tab management and scraping

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_FETCH") {
    handleFetch(request.url);
    sendResponse({ status: "started" });
  }

  // New: Handle Batch Fetch (e.g., for Xueqiu multiple users)
  if (request.action === "START_BATCH_FETCH") {
    handleBatchFetch(request.urls);
    sendResponse({ status: "started" });
  }
  
  // New: Handle fetch trigger from Overlay (where we don't know the URL)
  if (request.action === "TRIGGER_REFRESH_FROM_STORAGE") {
    chrome.storage.local.get(['users', 'timeRange', 'includeReplies'], (result) => {
      if (result.users && result.users.length > 0) {
        // Reconstruct URL
        const days = parseInt(result.timeRange || "1");
        const date = new Date();
        date.setDate(date.getDate() - days);
        const sinceDate = date.toISOString().split('T')[0];
        
        const fromPart = result.users.map(u => `from:${u}`).join(' OR ');
        let query = `(${fromPart}) since:${sinceDate}`;
        if (result.includeReplies === false) query += ' -filter:replies';
        
        const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
        
        handleFetch(searchUrl);
        sendResponse({ status: "started" });
      } else {
        sendResponse({ status: "error", message: "No users configured" });
      }
    });
    return true; // Async response
  }

  // New: Fetch Image as Base64 to bypass CORS/Hotlinking
  if (request.action === "FETCH_IMAGE_BASE64") {
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, data: reader.result });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error("Image fetch failed:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }
  
  // New: Handle Sidebar Ready Event (Handshake)
  if (request.action === "SIDEBAR_READY") {
    // The sidebar just loaded, so we should toggle it open
    if (sender.tab && sender.tab.id) {
       chrome.tabs.sendMessage(sender.tab.id, { action: "OPEN_SIDEBAR" });
    }
  }

  return true;
});

// Configure Side Panel to open on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

async function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 15;
    const interval = setInterval(() => {
      chrome.tabs.get(tabId, (tabInfo) => {
        if (chrome.runtime.lastError || !tabInfo) {
          clearInterval(interval);
          resolve(false);
          return;
        }
        if (tabInfo.status === 'complete') {
          clearInterval(interval);
          setTimeout(() => resolve(true), 2000); // Wait for hydration
        } else {
          attempts++;
          if (attempts >= maxAttempts) {
             clearInterval(interval);
             resolve(true); // Try anyway
          }
        }
      });
    }, 1000);
  });
}

async function handleFetch(searchUrl) {
  try {
    const tweets = await performScrape(searchUrl);
    if (tweets) {
       await updateStatus("success", "Done", tweets);
    } else {
       await updateStatus("error", "Could not find tweets. Are you logged in?");
    }
  } catch (err) {
    updateStatus("error", err.message);
  }
}

async function handleBatchFetch(urls) {
    try {
        let allTweets = [];
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            await updateStatus("connecting", `Fetching ${i + 1}/${urls.length}...`);
            
            try {
                const tweets = await performScrape(url);
                if (tweets) {
                    allTweets = allTweets.concat(tweets);
                }
            } catch (err) {
                console.error(`Failed to fetch ${url}:`, err);
                // Continue with next URL even if one fails
            }
        }
        
        if (allTweets.length > 0) {
            // Sort by time descending
            allTweets.sort((a, b) => new Date(b.time) - new Date(a.time));
            await updateStatus("success", "Done", allTweets);
        } else {
            await updateStatus("error", "No posts found from any user.");
        }

    } catch (err) {
        updateStatus("error", err.message);
    }
}

// Helper to scrape a single URL (creates tab, scrapes, closes tab)
// Returns tweets array or null
async function performScrape(searchUrl) {
    let tabId = null;
    try {
        // 1. Create hidden tab
        // Note: active: false makes it background, but for scraping to work well sometimes it needs to be loaded.
        const tab = await chrome.tabs.create({ url: searchUrl, active: false });
        tabId = tab.id;
        
        // 2. Wait for load
        await waitForTabLoad(tabId);
        
        // 3. Inject and Scrape
        return await injectAndScrape(tabId, searchUrl);

    } catch (err) {
        console.error(err);
        throw err;
    } finally {
        // Ensure tab is closed
        if (tabId) {
            try { chrome.tabs.remove(tabId); } catch(e) {}
        }
    }
}

async function injectAndScrape(tabId, url) {
    // Determine script to inject
    const isXueqiu = url.includes('xueqiu.com');
    const isWeibo = url.includes('weibo.com');
    let scriptFile = 'content.js';
    if (isXueqiu) scriptFile = 'xueqiu_content.js';
    else if (isWeibo) scriptFile = 'weibo_content.js';

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [scriptFile]
    });

    // Send message to content script
    // We retry sending the message a few times in case the script is still initializing
    let response = null;
    for (let i = 0; i < 5; i++) {
      try {
        response = await chrome.tabs.sendMessage(tabId, { action: "getTweets" });
        
        // Handle Redirect (e.g., UID -> Nickname resolution)
        if (response && response.redirect) {
           await chrome.tabs.update(tabId, { url: response.newUrl });
           
           // Wait for complete
           await waitForTabLoad(tabId);
           // Recurse
           return injectAndScrape(tabId, response.newUrl);
        }

        if (response && response.tweets) break;
      } catch (e) {
        // Content script might not be ready
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (response && response.tweets) {
      return response.tweets;
    } else {
      return null;
    }
}

async function updateStatus(state, message, data = null) {
  const update = {
    fetchStatus: {
      state: state,
      message: message,
      lastUpdated: Date.now()
    }
  };
  
  if (data) {
    update.cachedTweets = data;
  }
  
  await chrome.storage.local.set(update);
}
