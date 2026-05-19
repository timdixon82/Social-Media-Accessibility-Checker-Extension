/**
 * Scrapes recent posts from a LinkedIn company page and produces per-post
 * Markdown accessibility reports covering alt text, emoji use, decorative
 * Unicode fonts, and image colour contrast.
 *
 * Usage:
 *   node scrape_intertek_posts.js [--url <linkedin-posts-url>] [--posts <n> | --days <n>]
 *
 * Options:
 *   --url   LinkedIn company posts URL  (default: Intertek)
 *   --posts Number of most-recent posts to collect (default: 10)
 *   --days  Collect all posts from the last N days instead of a fixed count
 *
 * Examples:
 *   node scrape_intertek_posts.js --posts 20
 *   node scrape_intertek_posts.js --url "https://www.linkedin.com/company/bsi-group/posts/" --days 7
 */

const { firefox, chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { marked } = require('marked');

const PROFILE_DIR = path.join(__dirname, 'firefox_profile');
const OUTPUT_DIR = path.join(__dirname, 'output');
const CONTRAST_SCRIPT = path.join(__dirname, 'analyse_contrast.py');

const DEFAULT_URL   = 'https://www.linkedin.com/company/intertek/posts/?feedView=all';
const DEFAULT_POSTS = 10;
const MAX_POSTS_FOR_DAYS_MODE = 100; // upper bound when using --days

// LinkedIn's alt placeholder — not a genuine description, treat as missing
const LI_ALT_PLACEHOLDER = 'no alternative text description for this image';

// LinkedIn DOM selectors (tried in order; LI changes these periodically)
const POST_SELECTORS = [
  'div.feed-shared-update-v2',
  'div[data-urn*="activity"]',
  'li[class*="profile-creator-shared-feed-update"]',
];

// Selectors that identify the actual post-content media container.
// These are the images the author chose to share — not profile photos,
// reaction icons, company logos, or commenter avatars.
const POST_MEDIA_SELECTORS = [
  '[class*="update-components-image__container"] img',
  '[class*="feed-shared-image__container"] img',
  '[class*="feed-shared-article__image"] img',
  '[class*="update-components-document"] img',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

const PDF_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         color: #222; line-height: 1.45; font-size: 11pt; max-width: 820px; margin: 0 auto; padding: 0 4px; }
  h1 { font-size: 20pt; margin: 0 0 8pt; border-bottom: 2px solid #ccc; padding-bottom: 4pt; }
  h2 { font-size: 14pt; margin: 16pt 0 6pt; border-bottom: 1px solid #ddd; padding-bottom: 2pt; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; }
  p  { margin: 6pt 0; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 14pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 10pt; page-break-inside: avoid; }
  th, td { border: 1px solid #d0d0d0; padding: 4pt 6pt; text-align: left; vertical-align: middle; }
  th { background: #f4f4f4; font-weight: 600; }
  code { font-family: "SFMono-Regular", Menlo, Consolas, monospace; background: #f4f4f4;
         padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  img { max-width: 100%; height: auto; }
  img[src*="swatch_"] { width: 80px; height: 20px; border: 1px solid #ccc; vertical-align: middle; }
  img[src*="clip_"]   { max-width: 600px; border: 1px solid #ccc; margin: 4pt 0; }
  blockquote { border-left: 3px solid #bbb; padding: 4pt 10pt; margin: 10pt 0;
               color: #555; background: #fafafa; font-size: 10pt; }
  a { color: #1d4ed8; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

async function renderReportPdf(postDir, mdContent, pdfBrowser) {
  const bodyHtml = marked.parse(mdContent);
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <title>Accessibility report</title>
    <style>${PDF_CSS}</style>
  </head><body>${bodyHtml}</body></html>`;

  // Chromium blocks file:// resource loads from an about:blank origin (which
  // is what page.setContent gives us). Writing the HTML into the post folder
  // and navigating to it via file:// puts the page on the same origin as the
  // images, so relative <img src="swatch_*.png"> etc. resolve correctly.
  const tmpHtmlPath = path.join(postDir, '_report.tmp.html');
  fs.writeFileSync(tmpHtmlPath, html, 'utf8');

  const folderName = path.basename(postDir);
  const pdfPath = path.join(postDir, `Report ${folderName}.pdf`);

  const page = await pdfBrowser.newPage();
  try {
    await page.goto('file://' + tmpHtmlPath, { waitUntil: 'networkidle' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
    });
  } finally {
    await page.close();
    try { fs.unlinkSync(tmpHtmlPath); } catch { /* best-effort cleanup */ }
  }
  return pdfPath;
}

async function scrollUntilCount(page, count) {
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const sel of POST_SELECTORS) {
      const els = await page.$$(sel);
      if (els.length >= count) return { els: els.slice(0, count), sel };
    }
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(2000);
  }
  // Return whatever we managed to load
  for (const sel of POST_SELECTORS) {
    const els = await page.$$(sel);
    if (els.length > 0) return { els, sel };
  }
  return { els: [], sel: null };
}

async function extractPostData(page, postEl) {
  return page.evaluate(el => {
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

    // LinkedIn no longer uses <time datetime="…"> in the feed.
    // The post timestamp is plain text inside the sub-description span ("15h •", "2d •", etc.).
    const subDescEl =
      el.querySelector('.update-components-actor__sub-description') ||
      el.querySelector('[class*="actor__sub-description"]');
    // Strip the bullet and globe-icon text; keep only the leading time token.
    const date = subDescEl?.textContent?.trim()?.split('•')[0]?.trim() || null;

    // LinkedIn no longer links the timestamp to the post. Use the data-urn attribute
    // on the post card element to construct the permalink.
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

    const links = [
      ...new Set(
        Array.from(el.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(h => h.startsWith('http') && !h.includes('linkedin.com/in/') && !h.includes('linkedin.com/company/'))
      ),
    ];

    // Check if post text contains an explicit image description
    const hasImageDescInText = /image description:|alt:|^\[image/i.test(text);

    return { author, date, postUrl, text, hasVideo, links: links.slice(0, 5), hasImageDescInText };
  }, postEl);
}

// ---------------------------------------------------------------------------
// Accessibility checks (text-based)
// ---------------------------------------------------------------------------

function checkEmojis(text) {
  const matches = [...(text.matchAll(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu) || [])];
  return { count: matches.length, flag: matches.length > 5, examples: matches.slice(0, 8).map(m => m[0]) };
}

function checkDecorativeFonts(text) {
  // Unicode Mathematical Alphanumeric Symbols used as fake bold/italic fonts
  const mathRegex = /[\u{1D400}-\u{1D7FF}]/gu;
  const matches = [...(text.matchAll(mathRegex) || [])];
  return { found: matches.length > 0, count: matches.length, examples: matches.slice(0, 6).map(m => m[0]) };
}

// Converts LinkedIn relative time ("15h", "2d", "1w", "3mo", "1yr") to an
// approximate ISO 8601 string based on the current wall-clock time.
function parseRelativeTime(relText) {
  if (!relText) return null;
  const match = relText.trim().match(/^(\d+)\s*(s|m|h|d|w|mo|yr)$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const msPerUnit = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 30 * 864e5, yr: 365 * 864e5 };
  const ms = msPerUnit[unit];
  return ms ? new Date(Date.now() - val * ms).toISOString() : null;
}

// Converts LinkedIn relative time to fractional days. Used for --days cutoff.
function relTimeToDays(relText) {
  if (!relText) return null;
  const match = relText.trim().match(/^(\d+)\s*(s|m|h|d|w|mo|yr)$/i);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const daysPerUnit = { s: 1/86400, m: 1/1440, h: 1/24, d: 1, w: 7, mo: 30, yr: 365 };
  const factor = daysPerUnit[unit];
  return factor != null ? val * factor : null;
}

// Returns YYYY-MM-DD from a rawDate value (ISO string or LinkedIn relative text).
function getDateKey(rawDate) {
  const toKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  if (!rawDate) return null;
  const direct = new Date(rawDate);
  if (!isNaN(direct)) return toKey(direct);
  const approxIso = parseRelativeTime(rawDate);
  return approxIso ? toKey(new Date(approxIso)) : null;
}

// Returns a human-readable date string (date only, no time).
// rawDate may be an ISO 8601 string, a LinkedIn relative string ("15h"), or null.
function formatDateForDisplay(rawDate) {
  if (!rawDate) return 'Unknown date';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = d => `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const direct = new Date(rawDate);
  if (!isNaN(direct)) return fmt(direct);
  const approxIso = parseRelativeTime(rawDate);
  if (approxIso) return `${fmt(new Date(approxIso))} (approx.)`;
  return rawDate;
}

// Returns a filesystem-safe folder name using author, date, and per-day sequence.
// e.g. "intertek_2026-05-16_1", "intertek_2026-05-16_2"
function makeFolderName(author, dateKey, seqNum) {
  const safe = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  return `${safe(author) || 'unknown'}_${dateKey || 'unknown'}_${seqNum}`;
}

// ---------------------------------------------------------------------------
// Contrast analysis via Python/PIL
// ---------------------------------------------------------------------------

function runContrastAnalysis(imgPath, outputDir) {
  const result = spawnSync('python3', [CONTRAST_SCRIPT, imgPath, outputDir], { encoding: 'utf8', timeout: 60000 });
  if (result.error || result.status !== 0) {
    return { error: (result.stderr || 'analysis failed').trim() };
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: 'could not parse analysis output' };
  }
}

// ---------------------------------------------------------------------------
// Markdown report generation
// ---------------------------------------------------------------------------

function buildReport(postNum, data, altResults, emojiResult, fontResult, contrastResults) {
  const { author, date, postUrl, text, hasVideo, hasImageDescInText } = data;
  const lines = [];

  // --- Title: Author — Date/Time, then attributes ---
  const displayDate = formatDateForDisplay(date);
  lines.push(`# ${author} — ${displayDate}\n`);
  lines.push(`**Author:** ${author}  `);
  lines.push(`**Date:** ${displayDate}  `);
  if (postUrl) lines.push(`**URL:** [View on LinkedIn](${postUrl})  `);
  lines.push('');

  // --- Post text ---
  lines.push(text || '_No text content extracted_');
  lines.push('');

  // --- Attached media (images/documents, no heading) ---
  if (altResults.length > 0 || hasVideo) {
    for (const r of altResults) {
      lines.push(`![${r.filename}](${r.filename})\n`);
    }
    if (hasVideo) lines.push('_Video post — play on LinkedIn_\n');
    lines.push('');
  }

  lines.push('---\n');

  // --- Summary with anchor links to detail sections ---
  const altFail = altResults.some(r => !r.hasAlt) && !hasImageDescInText;
  const altNA = altResults.length === 0;
  const contrastNA = contrastResults.length === 0;
  const contrastFail = contrastResults.some(r => r.verdict === 'FAIL');
  const contrastNoText = !contrastFail && contrastResults.every(r => r.verdict === 'NO_TEXT' || r.error);

  lines.push('## Summary\n');
  lines.push('| Check | Result |');
  lines.push('|-------|--------|');
  lines.push(`| [Image alt text](#1-image-alt-text) | ${altNA ? '— N/A' : altFail ? '✗ FAIL' : '✓ PASS'} |`);
  lines.push(`| [Emoji usage](#2-emoji-usage) | ${emojiResult.flag ? '✗ FLAG' : '✓ PASS'} |`);
  lines.push(`| [Non-standard fonts](#3-non-standard-fonts) | ${fontResult.found ? '✗ FAIL' : '✓ PASS'} |`);
  lines.push(`| [Image contrast](#4-image-colour-contrast) | ${contrastNA || contrastNoText ? '— N/A' : contrastFail ? '✗ FAIL' : '✓ PASS'} |`);
  lines.push('');
  lines.push('---\n');

  // --- Accessibility detail ---
  lines.push('## Accessibility Detail\n');

  // 1. Alt text
  lines.push('### 1. Image Alt Text');
  if (altResults.length === 0) {
    lines.push('- No media images found in this post');
  } else {
    for (const r of altResults) {
      if (r.hasAlt) {
        lines.push(`- \`${r.filename}\`: alt="${r.alt}" ✓`);
      } else if (r.isPlaceholder) {
        lines.push(`- \`${r.filename}\`: LinkedIn placeholder alt ("No alternative text description for this image") — not a genuine description ✗`);
      } else if (hasImageDescInText) {
        lines.push(`- \`${r.filename}\`: no alt attribute — image description found in post text ⚠`);
      } else {
        lines.push(`- \`${r.filename}\`: alt="" — no image description in post text ✗`);
      }
    }
  }
  lines.push('');

  // 2. Emoji usage
  lines.push('### 2. Emoji Usage');
  if (emojiResult.flag) {
    lines.push(`- Count: ${emojiResult.count} — excessive ✗  _(threshold: >5)_`);
    if (emojiResult.examples.length) lines.push(`- Examples: ${emojiResult.examples.join(' ')}`);
  } else {
    lines.push(`- Count: ${emojiResult.count} ✓`);
  }
  lines.push('');

  // 3. Non-standard fonts
  lines.push('### 3. Non-standard Fonts');
  if (fontResult.found) {
    lines.push(`- Found ${fontResult.count} Unicode math character(s) used as decorative font — invisible to screen readers ✗`);
    if (fontResult.examples.length) lines.push(`- Examples: ${fontResult.examples.join(' ')}`);
  } else {
    lines.push('- No non-standard Unicode font characters detected ✓');
  }
  lines.push('');

  // 4. Image colour contrast
  lines.push('### 4. Image Colour Contrast');
  if (contrastResults.length === 0) {
    lines.push('- No media images to analyse');
  } else {
    for (const r of contrastResults) {
      lines.push(`**${r.filename}**`);
      if (r.error) {
        lines.push(`- Analysis error: ${r.error}`);
      } else if (r.verdict === 'NO_TEXT') {
        lines.push('- No text detected by OCR — contrast check not applicable ✓');
      } else {
        const icon = r.verdict === 'PASS' ? '✓' : '✗';
        lines.push(`- Result: ${icon} ${r.verdict} — ${r.detail}`);

        if (r.colour_pairs && r.colour_pairs.length > 0) {
          lines.push('');
          lines.push('**Colour combinations detected:**');
          lines.push('');
          lines.push('| Swatch (bg · fg) | Foreground | Background | Ratio | AA | AAA | Check | Example words |');
          lines.push('|-----------------|-----------|-----------|-------|-----|-----|-------|---------------|');
          for (const p of r.colour_pairs) {
            const aaStatus  = p.pass     ? '✓ Pass' : '✗ Fail';
            const aaaStatus = (p.pass_aaa != null ? p.pass_aaa : p.contrast_ratio >= (p.required_aaa || 7)) ? '✓ Pass' : '✗ Fail';
            const examples  = p.examples.map(w => `"${w}"`).join(', ');
            const swatch    = p.swatch_file ? `![](${p.swatch_file})` : '—';
            const fg        = p.fg_hex.replace('#', '');
            const bg        = p.bg_hex.replace('#', '');
            const webaim    = `[WebAIM ↗](https://webaim.org/resources/contrastchecker/?fcolor=${fg}&bcolor=${bg})`;
            lines.push(`| ${swatch} | \`${p.fg_hex}\` | \`${p.bg_hex}\` | ${p.contrast_ratio}:1 | ${aaStatus} | ${aaaStatus} | ${webaim} | ${examples} |`);
          }

          const failingWithClips = r.colour_pairs.filter(p => !p.pass && p.clip_file);
          if (failingWithClips.length > 0) {
            lines.push('');
            lines.push('**Failing regions:**');
            lines.push('');
            for (const p of failingWithClips) {
              lines.push(`\`${p.fg_hex}\` on \`${p.bg_hex}\` — ${p.contrast_ratio}:1`);
              lines.push('');
              lines.push(`![Failing region clip](${p.clip_file})`);
              lines.push('');
            }
          }
        }
      }
      lines.push('');
    }
    lines.push('> Contrast thresholds — AA: 4.5:1 normal / 3:1 large text · AAA: 7:1 normal / 4.5:1 large text. Large text = ≥24 px OCR box height. Checked via Tesseract OCR.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = { url: DEFAULT_URL, mode: 'posts', value: DEFAULT_POSTS };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      args.url = argv[++i];
    } else if (argv[i] === '--posts' && argv[i + 1]) {
      args.mode = 'posts';
      args.value = parseInt(argv[++i], 10);
    } else if (argv[i] === '--days' && argv[i + 1]) {
      args.mode = 'days';
      args.value = parseInt(argv[++i], 10);
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Usage: node scrape_intertek_posts.js [--url <url>] [--posts <n> | --days <n>]');
      process.exit(0);
    }
  }

  if (isNaN(args.value) || args.value < 1) {
    console.error('--posts and --days must be positive integers.');
    process.exit(1);
  }

  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  const modeLabel = args.mode === 'days'
    ? `last ${args.value} day(s)`
    : `${args.value} most-recent post(s)`;
  console.log(`Target: ${args.url}`);
  console.log(`Collect: ${modeLabel}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await firefox.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/ms-playwright/firefox-1522/firefox/firefox',
  });

  // Headless Chromium dedicated to rendering report.md → report.pdf. Firefox's
  // Playwright driver does not support page.pdf(), so we keep a separate
  // browser alive for the duration of the run. Pin the executable path to the
  // pre-installed container binary (Playwright would otherwise look for a
  // version-specific build that isn't shipped here).
  let pdfBrowser = null;
  try {
    pdfBrowser = await chromium.launch({
      headless: true,
      executablePath: '/ms-playwright/chromium_headless_shell-1224/chrome-linux/headless_shell',
    });
  } catch (err) {
    console.warn(`PDF rendering disabled: failed to launch headless Chromium — ${err.message}`);
  }

  const page = browser.pages()[0] || await browser.newPage();

  console.log(`\nNavigating...`);
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Accept cookie consent banner if present
  const cookieSelectors = [
    'button[action-type="ACCEPT"]',
    'button[data-tracking-control-name="cookie-consent-accept"]',
    'button.artdeco-global-alert__cta-btn--primary',
    'button:has-text("Accept cookies")',
    'button:has-text("Accept")',
  ];
  for (const sel of cookieSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        console.log(`Cookie banner accepted (${sel})`);
        await page.waitForTimeout(1500);
        break;
      }
    } catch { /* selector not present — continue */ }
  }

  // Detect login wall
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
    console.error('LinkedIn redirected to login — session may have expired. Re-run open_linkedin.js first.');
    if (pdfBrowser) await pdfBrowser.close();
    await browser.close();
    process.exit(1);
  }

  const loadTarget = args.mode === 'days' ? MAX_POSTS_FOR_DAYS_MODE : args.value;
  console.log(`Scrolling to load posts...`);
  const { els: posts, sel } = await scrollUntilCount(page, loadTarget);
  console.log(`Found ${posts.length} post(s) (selector: ${sel || 'none'})`);

  if (posts.length === 0) {
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'debug_page.png'), fullPage: false });
    console.error('No posts found. Saved debug_page.png — check the selector or page state.');
    if (pdfBrowser) await pdfBrowser.close();
    await browser.close();
    process.exit(1);
  }

  // dateSeqMap tracks how many posts we've processed per date key so we can
  // assign a per-day sequence number: intertek_2026-05-16_1, _2, _3 …
  const dateSeqMap = {};
  let processed = 0;

  for (let i = 0; i < posts.length; i++) {
    console.log(`\n[${i + 1}/${posts.length}] Processing...`);

    // Scroll into view and wait for lazy images
    await posts[i].scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);

    // Expand truncated post text if a "see more" button is present
    try {
      const seeMore = await posts[i].$('.feed-shared-inline-show-more-text__see-more-less-toggle');
      if (seeMore) {
        await seeMore.click();
        await page.waitForTimeout(1000);
        console.log('  Expanded post text');
      }
    } catch { /* no see-more button */ }

    // Extract text metadata (author + date needed to name the folder)
    const data = await extractPostData(page, posts[i]);
    console.log(`  Author: ${data.author}`);
    console.log(`  Date:   ${data.date || 'not found'}`);

    // --days mode: stop when the post is older than the requested window
    if (args.mode === 'days') {
      const ageDays = relTimeToDays(data.date);
      if (ageDays !== null && ageDays > args.value) {
        console.log(`  Post age (${data.date}) exceeds ${args.value}-day window — stopping.`);
        break;
      }
    }

    // Assign per-day sequence number
    const dateKey = getDateKey(data.date) || 'unknown';
    dateSeqMap[dateKey] = (dateSeqMap[dateKey] || 0) + 1;
    const seqNum = dateSeqMap[dateKey];

    const postDir = path.join(OUTPUT_DIR, makeFolderName(data.author, dateKey, seqNum));
    fs.mkdirSync(postDir, { recursive: true });

    // Collect only post-content media images using precise container selectors.
    // This excludes profile photos, company logos, reaction icons, and any other
    // LinkedIn chrome — only the images the post author deliberately shared.
    const mediaImgEls = [];
    for (const sel of POST_MEDIA_SELECTORS) {
      const els = await posts[i].$$(sel);
      mediaImgEls.push(...els);
    }
    // Deduplicate by element identity
    const seenHandles = new Set();
    const uniqueMediaImgEls = [];
    for (const el of mediaImgEls) {
      const id = await el.evaluate(e => { if (!e.__pwId) e.__pwId = Math.random(); return e.__pwId; });
      if (!seenHandles.has(id)) { seenHandles.add(id); uniqueMediaImgEls.push(el); }
    }

    const altResults = [];
    const contrastResults = [];
    let imgIdx = 0;

    for (const imgEl of uniqueMediaImgEls) {
      const meta = await page.evaluate(el => {
        return { alt: el.alt || '', src: el.src };
      }, imgEl);

      imgIdx++;
      const filename = `image_${imgIdx}.png`;
      const imgPath = path.join(postDir, filename);

      // Fetch the image by URL (uses logged-in session cookies) so we get the
      // clean CDN image without any LinkedIn sticky navigation overlaid on it.
      try {
        const imgBuffer = await page.evaluate(async (src) => {
          const resp = await fetch(src);
          const buf  = await resp.arrayBuffer();
          return Array.from(new Uint8Array(buf));
        }, meta.src);
        fs.writeFileSync(imgPath, Buffer.from(imgBuffer));
      } catch {
        console.log(`  Could not fetch image ${imgIdx} — skipping`);
        continue;
      }

      const altTrimmed = meta.alt.trim();
      const isPlaceholder = altTrimmed.toLowerCase() === LI_ALT_PLACEHOLDER;
      altResults.push({
        filename,
        alt: altTrimmed,
        hasAlt: altTrimmed.length > 0 && !isPlaceholder,
        isPlaceholder,
      });

      console.log(`  Analysing contrast for ${filename}...`);
      const cr = runContrastAnalysis(imgPath, postDir);
      contrastResults.push({ filename, ...cr });
    }

    // Text checks
    const emojiResult = checkEmojis(data.text);
    const fontResult = checkDecorativeFonts(data.text);

    // Write report (postNum used only for fallback folder names now)
    const report = buildReport(i + 1, data, altResults, emojiResult, fontResult, contrastResults);
    const folderName = path.basename(postDir);
    const mdPath = path.join(postDir, `Report ${folderName}.md`);
    fs.writeFileSync(mdPath, report, 'utf8');
    console.log(`  Saved: ${folderName}/${path.basename(mdPath)}`);

    if (pdfBrowser) {
      try {
        const pdfPath = await renderReportPdf(postDir, report, pdfBrowser);
        console.log(`  Saved: ${folderName}/${path.basename(pdfPath)}`);
      } catch (err) {
        console.warn(`  PDF render failed for ${folderName}: ${err.message}`);
      }
    }

    processed++;
  }

  console.log(`\nDone. ${processed} post(s) processed. Reports in: ${OUTPUT_DIR}`);
  if (pdfBrowser) await pdfBrowser.close();
  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
