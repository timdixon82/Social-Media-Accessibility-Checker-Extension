// MV3 service worker — message routing and image fetching.
// Image analysis (OCR + WCAG contrast) runs in the app page, which has
// cross-origin isolation and full SharedArrayBuffer access needed by
// onnxruntime-web. The offscreen document is no longer used.

let appPort = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'app-page') return;
  appPort = port;
  port.onMessage.addListener(() => {}); // keepalive pings from app page extend SW lifetime
  port.onDisconnect.addListener(() => { appPort = null; });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'startAudit') return false;
  runAudit(msg).catch(err => sendToApp({ type: 'error', message: err.message }));
  sendResponse({ started: true });
  return false;
});

function sendToApp(data) {
  if (appPort) appPort.postMessage(data);
}

async function runAudit({ tabId, posts, days }) {
  const appTab = await chrome.tabs.create({ url: chrome.runtime.getURL('app/app.html') });
  await waitForAppPort(appTab.id);

  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content_script.js'] });
  sendToApp({ type: 'status', message: 'Gathering posts from LinkedIn...' });

  let scrapeResult;
  try {
    scrapeResult = await Promise.race([
      chrome.tabs.sendMessage(tabId, { type: 'startScrape', posts, days }),
      new Promise((_, reject) => setTimeout(() => reject(new Error(
        'Gathering timed out after 3 minutes. Make sure you are on a LinkedIn company posts page with posts visible.'
      )), 180000)),
    ]);
  } catch (e) {
    sendToApp({ type: 'error', message: `Could not gather posts: ${e.message}` });
    return;
  }

  if (scrapeResult?.error) {
    sendToApp({ type: 'error', message: `Could not gather posts: ${scrapeResult.error}` });
    return;
  }

  const { posts: scrapedPosts } = scrapeResult;
  if (!scrapedPosts || scrapedPosts.length === 0) {
    sendToApp({ type: 'error', message: 'No posts found. Make sure you are on a LinkedIn company posts page.' });
    return;
  }

  sendToApp({ type: 'status', message: `Found ${scrapedPosts.length} post(s). Fetching images...` });

  for (let i = 0; i < scrapedPosts.length; i++) {
    const post = scrapedPosts[i];
    sendToApp({ type: 'postStart', index: i, total: scrapedPosts.length, post });

    const images = [];
    for (let j = 0; j < post.images.length; j++) {
      const img = post.images[j];
      let dataUrl = null;
      try { dataUrl = await fetchImageAsDataUrl(img.src); } catch (_) {}
      images.push({
        filename:      `image_${j + 1}.png`,
        alt:           img.alt,
        hasAlt:        img.hasAlt,
        isPlaceholder: img.isPlaceholder,
        src:           img.src,
        dataUrl,
      });
    }

    sendToApp({ type: 'postDone', index: i, total: scrapedPosts.length, post, images });
  }

  sendToApp({ type: 'done', total: scrapedPosts.length });
}

async function fetchImageAsDataUrl(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching image`);
  const buffer = await resp.arrayBuffer();
  const uint8  = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i += 8192) {
    binary += String.fromCharCode(...uint8.subarray(i, Math.min(i + 8192, uint8.length)));
  }
  const type = resp.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${btoa(binary)}`;
}

function waitForAppPort() {
  return new Promise((resolve) => {
    if (appPort) { resolve(); return; }
    const handler = (port) => {
      if (port.name !== 'app-page') return;
      chrome.runtime.onConnect.removeListener(handler);
      appPort = port;
      port.onMessage.addListener(() => {});
      port.onDisconnect.addListener(() => { appPort = null; });
      resolve();
    };
    chrome.runtime.onConnect.addListener(handler);
    setTimeout(resolve, 30000);
  });
}
