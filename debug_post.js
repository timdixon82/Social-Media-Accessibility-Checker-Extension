/**
 * Diagnostic: dumps time elements, datetime attributes, and LinkedIn links
 * from the first post on Intertek's LinkedIn feed, so we can fix the selectors.
 */
const { firefox } = require('playwright');
const path = require('path');

const PROFILE_DIR = path.join(__dirname, 'firefox_profile');
const TARGET_URL = 'https://www.linkedin.com/company/intertek/posts/?feedView=all';
const POST_SELECTORS = [
  'div.feed-shared-update-v2',
  'div[data-urn*="activity"]',
  'li[class*="profile-creator-shared-feed-update"]',
];

async function scrollUntilOne(page) {
  for (let attempt = 0; attempt < 20; attempt++) {
    for (const sel of POST_SELECTORS) {
      const els = await page.$$(sel);
      if (els.length >= 1) return els[0];
    }
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
  }
  return null;
}

(async () => {
  const browser = await firefox.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/ms-playwright/firefox-1522/firefox/firefox',
  });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Accept cookies if present
  for (const sel of ['button[action-type="ACCEPT"]', 'button:has-text("Accept cookies")', 'button:has-text("Accept")']) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) { await btn.click(); await page.waitForTimeout(1000); break; }
    } catch {}
  }

  const postEl = await scrollUntilOne(page);
  if (!postEl) { console.error('No post found'); await browser.close(); return; }

  await postEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  const info = await page.evaluate(el => {
    // 1. data-urn on the element itself, its parents, and any child
    const selfUrn   = el.getAttribute('data-urn');
    const parentUrn = el.parentElement?.getAttribute('data-urn') ||
                      el.parentElement?.parentElement?.getAttribute('data-urn') ||
                      el.closest('[data-urn]')?.getAttribute('data-urn');
    const childUrn  = el.querySelector('[data-urn]')?.getAttribute('data-urn');

    // 2. Sub-description text (where "15h •" lives)
    const subDescEl = el.querySelector('.update-components-actor__sub-description') ||
                      el.querySelector('[class*="actor__sub-description"]') ||
                      el.querySelector('[class*="sub-description"]');
    const subDescText  = subDescEl?.textContent?.trim() || null;
    const subDescHTML  = subDescEl?.innerHTML?.slice(0, 600) || null;

    // 3. Any <a> wrapping the sub-description (sometimes the timestamp IS a link)
    const subDescLink = subDescEl?.querySelector('a[href]')?.href ||
                        subDescEl?.closest('a[href]')?.href || null;

    // 4. Look for a[href*="activity"] or a[href*="/posts/"] anywhere in the post
    const activityLink = el.querySelector('a[href*="activity"]')?.href ||
                         el.querySelector('a[href*="/posts/"]')?.href || null;

    // 5. All data-urn attributes anywhere in the post subtree
    const allUrns = Array.from(el.querySelectorAll('[data-urn]')).map(e => ({
      tag: e.tagName,
      urn: e.getAttribute('data-urn'),
      cls: e.className?.slice(0, 80),
    }));

    return { selfUrn, parentUrn, childUrn, allUrns, subDescText, subDescHTML, subDescLink, activityLink };
  }, postEl);

  console.log('\n=== URN VALUES ===');
  console.log('self:', info.selfUrn);
  console.log('parent:', info.parentUrn);
  console.log('child:', info.childUrn);
  console.log('all urns in subtree:', JSON.stringify(info.allUrns, null, 2));

  console.log('\n=== SUB-DESCRIPTION ===');
  console.log('text:', info.subDescText);
  console.log('link:', info.subDescLink);
  console.log('html:', info.subDescHTML);

  console.log('\n=== ACTIVITY/POSTS LINK ===');
  console.log(info.activityLink);

  // Also dump the full outer element's data attributes
  const outerAttrs = await page.evaluate(el => {
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value;
    // Also check the immediate parent
    const parentAttrs = {};
    for (const a of (el.parentElement?.attributes || [])) parentAttrs[a.name] = a.value;
    return { self: attrs, parent: parentAttrs };
  }, postEl);

  console.log('\n=== POST ELEMENT ATTRIBUTES ===');
  console.log('self:', JSON.stringify(outerAttrs.self, null, 2));
  console.log('parent:', JSON.stringify(outerAttrs.parent, null, 2));

  await browser.close();
})();
