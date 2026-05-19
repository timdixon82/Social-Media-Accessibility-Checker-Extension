// Runs on linkedin.com — scrapes posts and returns structured data.
// Ported from linkedin_audit.js. Guard prevents double-injection.

if (!window.__liAuditLoaded) {
  window.__liAuditLoaded = true;

  const POST_SELECTORS = [
    'div.feed-shared-update-v2',
    'div[data-urn*="activity"]',
    'li[class*="profile-creator-shared-feed-update"]',
  ];

  const POST_MEDIA_SELECTORS = [
    '[class*="update-components-image__container"] img',
    '[class*="feed-shared-image__container"] img',
    '[class*="feed-shared-article__image"] img',
    '[class*="update-components-document"] img',
  ];

  const LI_ALT_PLACEHOLDER = 'no alternative text description for this image';

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'startScrape') return false;
    scrape(msg.posts, msg.days)
      .then(sendResponse)
      .catch(e => sendResponse({ posts: [], error: e.message }));
    return true;
  });

  async function scrape(postCount, days) {
    const maxLoad = days ? 100 : postCount;
    const posts = await scrollUntilCount(maxLoad);
    const result = [];
    const dateSeqMap = {};

    for (const postEl of posts) {
      // Expand truncated text
      try {
        const seeMore = postEl.querySelector('.feed-shared-inline-show-more-text__see-more-less-toggle');
        if (seeMore) { seeMore.click(); await sleep(800); }
      } catch {}

      const data = extractPostData(postEl);

      if (days) {
        const ageDays = relTimeToDays(data.date);
        if (ageDays !== null && ageDays > days) break;
      }

      const dateKey = getDateKey(data.date) || 'unknown';
      dateSeqMap[dateKey] = (dateSeqMap[dateKey] || 0) + 1;
      const seq = dateSeqMap[dateKey];

      result.push({
        ...data,
        platform:    'LinkedIn',
        dateKey,
        seq,
        images:      extractImages(postEl),
        emojiResult: checkEmojis(data.text),
        fontResult:  checkDecorativeFonts(data.text),
      });

      if (!days && result.length >= postCount) break;
    }

    return { posts: result };
  }

  async function scrollUntilCount(count) {
    for (let attempt = 0; attempt < 30; attempt++) {
      for (const sel of POST_SELECTORS) {
        const els = [...document.querySelectorAll(sel)];
        if (els.length >= count) return els.slice(0, count);
      }
      window.scrollBy(0, 1200);
      await sleep(2000);
    }
    for (const sel of POST_SELECTORS) {
      const els = [...document.querySelectorAll(sel)];
      if (els.length > 0) return els;
    }
    return [];
  }

  function extractPostData(el) {
    const first = (selectors) => {
      for (const s of selectors) {
        const node = el.querySelector(s);
        if (node && node.textContent.trim()) return node.textContent.trim();
      }
      return null;
    };

    const author = first([
      '.update-components-actor__title span[aria-hidden="true"]',
      '.feed-shared-actor__name',
      '.update-components-actor__name',
      '[class*="actor__title"]',
      '[class*="actor__name"]',
    ]) || 'Unknown';

    const subDescEl =
      el.querySelector('.update-components-actor__sub-description') ||
      el.querySelector('[class*="actor__sub-description"]');
    const date = subDescEl?.textContent?.trim()?.split('•')[0]?.trim() || null;

    const urn = el.getAttribute('data-urn') || el.closest('[data-urn]')?.getAttribute('data-urn');
    const postUrl = urn ? `https://www.linkedin.com/feed/update/${urn}/` : null;

    const text = first([
      '.feed-shared-update-v2__description .break-words span[dir]',
      '.update-components-text .break-words span[dir]',
      '.feed-shared-text span[dir]',
      '[class*="commentary"] span[dir]',
      '.feed-shared-update-v2__description',
      '.update-components-text',
      '[class*="commentary"]',
    ]) || '';

    const hasVideo = !!(
      el.querySelector('video') ||
      el.querySelector('[class*="video-player"]') ||
      el.querySelector('[data-media-type*="video"]')
    );

    const hasImageDescInText = /image description:|alt:|^\[image/i.test(text);

    return { author, date, postUrl, text, hasVideo, hasImageDescInText };
  }

  function extractImages(el) {
    const seen = new Set();
    const imgs = [];
    for (const sel of POST_MEDIA_SELECTORS) {
      for (const img of el.querySelectorAll(sel)) {
        const src = img.src;
        if (!src || seen.has(src)) continue;
        seen.add(src);
        const alt = (img.alt || '').trim();
        const isPlaceholder = alt.toLowerCase() === LI_ALT_PLACEHOLDER;
        imgs.push({ src, alt, hasAlt: alt.length > 0 && !isPlaceholder, isPlaceholder });
      }
    }
    return imgs;
  }

  function checkEmojis(text) {
    const matches = [...(text.matchAll(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu) || [])];
    return { count: matches.length, flag: matches.length > 5, examples: matches.slice(0, 8).map(m => m[0]) };
  }

  function checkDecorativeFonts(text) {
    const matches = [...(text.matchAll(/[\u{1D400}-\u{1D7FF}]/gu) || [])];
    return { found: matches.length > 0, count: matches.length, examples: matches.slice(0, 6).map(m => m[0]) };
  }

  function parseRelativeTime(relText) {
    if (!relText) return null;
    const match = relText.trim().match(/^(\d+)\s*(s|m|h|d|w|mo|yr)$/i);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const msPerUnit = { s:1e3, m:6e4, h:36e5, d:864e5, w:6048e5, mo:30*864e5, yr:365*864e5 };
    const ms = msPerUnit[unit];
    return ms ? new Date(Date.now() - val * ms).toISOString() : null;
  }

  function relTimeToDays(relText) {
    if (!relText) return null;
    const match = relText.trim().match(/^(\d+)\s*(s|m|h|d|w|mo|yr)$/i);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const daysPerUnit = { s:1/86400, m:1/1440, h:1/24, d:1, w:7, mo:30, yr:365 };
    const factor = daysPerUnit[unit];
    return factor != null ? val * factor : null;
  }

  function getDateKey(rawDate) {
    const toKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    if (!rawDate) return null;
    const direct = new Date(rawDate);
    if (!isNaN(direct)) return toKey(direct);
    const approxIso = parseRelativeTime(rawDate);
    return approxIso ? toKey(new Date(approxIso)) : null;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
