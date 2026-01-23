  function fetchXueqiu(handles) {
    currentFetchPlatform = 'xueqiu';
    tweetsContainer.innerHTML = '<div class="loading-spinner">Connecting to Xueqiu...</div>';
    statusText.textContent = 'Initializing Xueqiu...';

    // Xueqiu Search Limitation: Similar to Weibo, hard to do bulk OR search.
    // We will search for the first user for now.
    const target = handles[0];
    let searchUrl;
    
    // Check if target is a UID (all digits)
    if (/^\d+$/.test(target)) {
        // It's a UID, we need to visit profile first to resolve nickname
        searchUrl = `https://xueqiu.com/u/${target}`;
        statusText.textContent = `Resolving UID ${target}...`;
    } else {
        // It's a nickname
        searchUrl = `https://xueqiu.com/u/${encodeURIComponent(target)}`;
    }

    if (handles.length > 1) {
        statusText.textContent = `Fetching ${target} (Only first user shown - Xueqiu bulk search limited)...`;
    }

    // Clear previous results
    chrome.storage.local.remove(['cachedTweets', 'fetchStatus'], () => {
      chrome.runtime.sendMessage({ action: "START_FETCH", url: searchUrl }, (response) => {
        startPolling();
      });
    });
  }