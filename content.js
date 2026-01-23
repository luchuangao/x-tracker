// content.js
// Runs inside x.com to scrape tweets

console.log('X-Tracker Content Script Loaded');

function scrapeTweets() {
  // X uses different selectors often. We need to be robust.
  // Primary: article[data-testid="tweet"]
  const articles = document.querySelectorAll('article[data-testid="tweet"]');
  const tweets = [];

  console.log(`Found ${articles.length} articles`);

  articles.forEach(article => {
    try {
      // 1. User Info
      const userElement = article.querySelector('div[data-testid="User-Name"]');
      
      // Improved Avatar Selector: Look for the specific testid, then any image inside it
      let avatarUrl = '';
      const avatarContainer = article.querySelector('div[data-testid="Tweet-User-Avatar"]');
      if (avatarContainer) {
        const img = avatarContainer.querySelector('img');
        // Prefer bigger images if available (X sometimes loads small ones first)
        if (img) {
           avatarUrl = img.src;
        }
      }
      
      // Fallback 2: Look for the specific class often used for avatars (css-9pa8cd) - but classes change.
      // Better Fallback: Find the first image in the article header that is NOT an emoji
      if (!avatarUrl && userElement) {
         // Go up to the header container
         const header = userElement.closest('div[data-testid="User-Name"]').parentElement.parentElement.parentElement;
         if (header) {
            const images = header.querySelectorAll('img');
            for (let img of images) {
               if (img.src.includes('profile_images')) {
                  avatarUrl = img.src;
                  break;
               }
            }
         }
      }

      let name = 'Unknown';
      let handle = '@unknown';
      let time = '';

      if (userElement) {
        const textContent = userElement.innerText || '';
        const parts = textContent.split(/[\n·]/).map(s => s.trim()).filter(s => s);
        // Usually: Name, @handle, time
        if (parts.length >= 2) {
          name = parts[0];
          handle = parts[1];
        }
      }
      
      const timeEl = article.querySelector('time');
      if (timeEl) time = timeEl.getAttribute('datetime');
      
      // 2. Tweet Content
      const textElement = article.querySelector('div[data-testid="tweetText"]');
      const text = textElement ? textElement.innerText : '';
      
      // 3. Images/Media
      const photos = article.querySelectorAll('div[data-testid="tweetPhoto"] img');
      const mediaUrls = Array.from(photos).map(img => img.src);

      // 4. Link
      const linkElement = article.querySelector('a[href*="/status/"]');
      const tweetUrl = linkElement ? `https://x.com${linkElement.getAttribute('href')}` : '';

      // 5. Detect if Reply
      let isReply = false;
      // Check if there is a "Replying to @..." line
      const replyElement = article.querySelector('div[data-testid="socialContext"]'); // Often used for "Replying to"
      if (replyElement && replyElement.innerText.includes('Replying to')) {
         isReply = true;
      }

      // Only add valid tweets
      if (text || mediaUrls.length > 0) {
        tweets.push({
          name,
          handle,
          time,
          avatarUrl,
          text,
          mediaUrls,
          tweetUrl,
          isReply
        });
      }
    } catch (e) {
      console.error('Error parsing tweet:', e);
    }
  });

  return tweets;
}

async function scrollAndFetchTweets() {
    let allTweets = [];
    const MAX_SCROLLS = 4; // Scroll a few times to get a mix of users
    const SCROLL_DELAY = 2000; // X is slow to load new items
    let previousHeight = 0;
    
    // Initial wait for first load
    await new Promise(r => setTimeout(r, 2500));

    for (let i = 0; i < MAX_SCROLLS; i++) {
        const tweets = scrapeTweets();
        
        // Add unique tweets
        let newCount = 0;
        tweets.forEach(t => {
            if (!allTweets.some(existing => existing.tweetUrl === t.tweetUrl)) {
                allTweets.push(t);
                newCount++;
            }
        });
        
        console.log(`Scrape #${i+1}: Found ${tweets.length} visible. Added ${newCount} new. Total: ${allTweets.length}`);

        if (allTweets.length >= 50) break; // Target reached

        // Scroll
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(r => setTimeout(r, SCROLL_DELAY));
        
        // Check for end of content (height didn't change)
        if (document.body.scrollHeight === previousHeight) {
             console.log('Reached bottom or no new content loaded.');
             // Break if truly stuck, but X sometimes lags.
             // If we have 0 tweets, we MUST wait longer.
             if (allTweets.length === 0 && i === 0) {
                 await new Promise(r => setTimeout(r, 2000));
                 continue;
             }
             break;
        }
        previousHeight = document.body.scrollHeight;
    }
    
    // One last scrape to be sure
    const finalTweets = scrapeTweets();
    finalTweets.forEach(t => {
        if (!allTweets.some(existing => existing.tweetUrl === t.tweetUrl)) {
            allTweets.push(t);
        }
    });
    
    return allTweets;
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTweets") {
    console.log("Starting scroll and fetch sequence...");
    scrollAndFetchTweets().then(tweets => {
        console.log(`Returning ${tweets.length} total tweets`);
        sendResponse({ tweets: tweets });
    });
    return true; // Keep channel open for async response
  }
});
