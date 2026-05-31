import JSZip from 'jszip';
import { makeSwatch, makeClip } from '../render/canvas.js';
import { buildPdf } from '../export/pdf.js';
import { buildMarkdown } from '../export/markdown.js';
import { analyseImage as wcagAnalyse } from '../core/analyse.js';
import { decodeAndResize, bitmapToImageData } from '../core/image.js';

const statusEl      = document.getElementById('status-bar');
const progressWrap  = document.getElementById('progress-wrap');
const progressBar   = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
const cardsEl       = document.getElementById('cards');
const actionBar     = document.getElementById('action-bar');
const downloadBtn   = document.getElementById('download-btn');

const allPosts = [];

// ── Theme toggle ─────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('sm-a11y-theme', theme); } catch (_) {}
  if (themeToggle) {
    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    const label = themeToggle.querySelector('.theme-toggle-label');
    if (label) label.textContent = isDark ? 'Light' : 'Dark';
  }
}
(function initTheme() {
  let saved;
  try { saved = localStorage.getItem('sm-a11y-theme'); } catch (_) {}
  const preferred = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(preferred);
}());
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
}

// ---------------------------------------------------------------------------
// OCR sandbox — onnxruntime-web runs in a sandboxed extension page that is
// exempt from the extension pages CSP, avoiding the 'unsafe-eval' restriction.
// The app page communicates with it via postMessage only.
// ---------------------------------------------------------------------------

const ocrFrame = document.createElement('iframe');
ocrFrame.src = chrome.runtime.getURL('sandbox/sandbox.html');
ocrFrame.style.display = 'none';
ocrFrame.setAttribute('aria-hidden', 'true');
document.body.appendChild(ocrFrame);

// Derive the sandbox's origin from its URL so postMessage calls can be
// targeted precisely instead of using '*'.  new URL(...).origin gives the
// chrome-extension://<id> prefix that Chrome enforces.
const sandboxOrigin = new URL(ocrFrame.src).origin;

let   sandboxReady = null;
const pendingOcr   = new Map();
let   ocrMsgId     = 0;

window.addEventListener('message', (e) => {
  if (e.source !== ocrFrame.contentWindow) return; // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation — e.source check is the correct origin guard for same-extension iframes; chrome.runtime.getURL-based origin is not required here.
  const { type, id, detections, error } = e.data || {};
  if (type !== 'ocrResult') return;
  const pending = pendingOcr.get(id);
  if (!pending) return;
  pendingOcr.delete(id);
  if (error) pending.reject(new Error(error));
  else pending.resolve(detections);
});

function initSandbox() {
  if (sandboxReady) return sandboxReady;
  sandboxReady = new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
    };
    // Fail clearly after 120 s so the user sees an error instead of a hung page.
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('OCR sandbox did not respond within 120 s — model files may not have loaded.'));
    }, 120000);

    const sendInit = () => ocrFrame.contentWindow.postMessage({
      type:            'init',
      extensionOrigin: window.location.origin, // passed to sandbox so it can reply to us precisely rather than using '*'
      wasmPaths:       chrome.runtime.getURL('vendor/ort/'),
      models: {
        detectionPath:   chrome.runtime.getURL('vendor/models/ch_PP-OCRv4_det_infer.onnx'),
        recognitionPath: chrome.runtime.getURL('vendor/models/ch_PP-OCRv4_rec_infer.onnx'),
        dictionaryPath:  chrome.runtime.getURL('vendor/models/ppocr_keys_v1.txt'),
      },
    }, sandboxOrigin); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration — target is sandboxOrigin (chrome-extension://<id>), not '*'

    const onMsg = (e) => {
      if (e.source !== ocrFrame.contentWindow) return; // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation — e.source check is the correct guard for same-extension iframes
      // sandboxLoaded: sandbox script has finished executing and its message
      // listener is active — safe to send 'init' now without race conditions.
      if (e.data?.type === 'sandboxLoaded') { sendInit(); return; }
      if (e.data?.type === 'ready')         { cleanup(); resolve(); }
      if (e.data?.type === 'initError')     { cleanup(); reject(new Error(e.data.error)); }
    };
    window.addEventListener('message', onMsg);
  });
  return sandboxReady;
}

function prewarmOcr() {
  initSandbox().catch(() => {});
}

async function runOcrInSandbox(dataUrl) {
  await initSandbox();
  return new Promise((resolve, reject) => {
    const id = ++ocrMsgId;
    pendingOcr.set(id, { resolve, reject });
    ocrFrame.contentWindow.postMessage({ type: 'ocr', id, dataUrl }, sandboxOrigin); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration — target is sandboxOrigin (chrome-extension://<id>), not '*'
  });
}

// All image analysis is serialised through this chain to prevent concurrent
// calls to the shared OCR inference session.
let analysisChain = Promise.resolve();

const swPort = chrome.runtime.connect({ name: 'app-page' });
swPort.onMessage.addListener(handleMessage);

// Periodic pings prevent Chrome from terminating the MV3 service worker mid-audit.
const keepalive = setInterval(() => {
  try { swPort.postMessage({ type: 'keepalive' }); } catch (_) {}
}, 20000);

swPort.onDisconnect.addListener(() => {
  clearInterval(keepalive);
  setStatus('Connection to the audit process was lost.', 'error');
});

function handleMessage(msg) {
  switch (msg.type) {
    case 'status':
      setStatus(msg.message);
      prewarmOcr(); // start loading OCR models during scraping
      break;
    case 'error':
      setStatus(msg.message, 'error');
      hideProgress();
      break;
    case 'postStart':
      showProgress(`Processing post ${msg.index + 1} of ${msg.total}...`, msg.index, msg.total);
      break;
    case 'postDone': {
      const postIdx = allPosts.length;
      allPosts.push({ post: msg.post, imageReports: msg.images });
      const updateAnalysis = renderPost(msg.post, msg.images);
      showProgress(`Processed ${msg.index + 1} of ${msg.total} posts`, msg.index + 1, msg.total);
      // Queue OCR + contrast analysis serially so the singleton OCR session
      // is never called concurrently.
      analysisChain = analysisChain.then(async () => {
        const imageReports = [];
        for (const img of (msg.images || [])) {
          if (!img.dataUrl) { imageReports.push({ ...img, error: 'Image could not be fetched' }); continue; }
          try {
            const { report, resizedDataUrl } = await analyseOneImage(img.dataUrl);
            if (report?.colourPairs) {
              const clipCanvas = await loadToCanvas(resizedDataUrl);
              if (clipCanvas) {
                for (const pair of report.colourPairs) {
                  pair.swatchDataUrl = makeSwatch(pair.fgHex, pair.bgHex).dataUrl;
                  if ((!pair.pass || !pair.passAaa) && pair.bboxes?.length) {
                    const clip = makeClip(clipCanvas, pair.bboxes);
                    if (clip) pair.clipDataUrl = clip.dataUrl;
                  }
                }
              }
            }
            imageReports.push({ ...img, report });
          }
          catch (e) { imageReports.push({ ...img, error: e.message }); }
        }
        allPosts[postIdx].imageReports = imageReports;
        updateAnalysis(imageReports);
      });
      break;
    }
    case 'done':
      setStatus(`Audit complete — ${msg.total} post${msg.total === 1 ? '' : 's'} gathered. Running colour contrast analysis…`);
      hideProgress();
      // Wait for all queued OCR analysis to finish before showing download button.
      analysisChain.then(() => {
        setStatus(`Audit complete — ${msg.total} post${msg.total === 1 ? '' : 's'} processed.`, 'done');
        if (allPosts.length) actionBar.hidden = false;
      });
      break;
  }
}

function setStatus(text, cls = '') {
  statusEl.textContent = text;
  statusEl.className = cls;
}

function showProgress(label, value, max) {
  progressWrap.classList.add('visible');
  progressLabel.textContent = label;
  progressBar.setAttribute('max', max);
  progressBar.setAttribute('value', value);
}

function hideProgress() {
  progressWrap.classList.remove('visible');
  progressLabel.textContent = '';
  progressBar.removeAttribute('value');
  progressBar.removeAttribute('max');
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else node.setAttribute(k, v);
  }
  return node;
}

function txt(str) { return document.createTextNode(str || ''); }

const BADGE_ICONS = { pass: '✓ ', fail: '✗ ', flag: '! ', na: '' };

function badge(label, type) {
  const span = el('span', { className: `badge badge-${type}` });
  span.textContent = (BADGE_ICONS[type] || '') + label;
  return span;
}

function computeOverallBadge(post, imageReports) {
  const altFail      = imageReports.some(r => !r.hasAlt) && !post.hasImageDescInText;
  const fontFail     = post.fontResult?.found;
  const contrastFail = imageReports.some(r => r.report?.verdict === 'FAIL');
  const pending      = imageReports.length > 0 && imageReports.some(r => !r.report && !r.error);

  let type, label;
  if (altFail || fontFail || contrastFail) { type = 'fail'; label = 'Overall: Fail'; }
  else if (pending)                         { type = 'na';   label = 'Checking…'; }
  else if (post.emojiResult?.flag)          { type = 'flag'; label = 'Overall: Flag'; }
  else                                      { type = 'pass'; label = 'Overall: Pass'; }

  const b = badge(label, type);
  b.classList.add('badge-overall');
  return b;
}

function append(parent, ...children) {
  for (const child of children) {
    if (!child) continue;
    if (typeof child === 'string') parent.appendChild(txt(child));
    else parent.appendChild(child);
  }
  return parent;
}

// ---------------------------------------------------------------------------
// Analyse one image: resize (app page) → OCR (sandbox) → WCAG contrast (app page).
// Resize happens here so the imageData used for contrast and the bboxes
// returned by OCR share the same coordinate space.
// ---------------------------------------------------------------------------

async function analyseOneImage(dataUrl) {
  const comma  = dataUrl.indexOf(',');
  const mime   = dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/jpeg';
  const binary = atob(dataUrl.slice(comma + 1));
  const uint8  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) uint8[i] = binary.charCodeAt(i);
  const blob = new Blob([uint8], { type: mime });

  const bitmap = await decodeAndResize(blob);
  const { canvas, imageData } = bitmapToImageData(bitmap);
  bitmap.close?.();

  // Convert resized canvas to a data URL so the sandbox receives an image in
  // the same coordinate space as imageData (bboxes will align for contrast).
  const resizedBlob = await (canvas.convertToBlob
    ? canvas.convertToBlob({ type: 'image/png' })
    : new Promise(res => canvas.toBlob(res, 'image/png')));
  const resizedDataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(resizedBlob);
  });

  const detections = await runOcrInSandbox(resizedDataUrl);
  return { report: wcagAnalyse(imageData, detections), resizedDataUrl };
}

async function loadToCanvas(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Render one post card (collapsed by default, expandable inline)
// Returns an updateAnalysis(imageReports) function called after OCR finishes.
// ---------------------------------------------------------------------------

let cardSeq = 0;

function renderPost(post, images) {
  const displayDate = formatDate(post.date);
  const altFail = images.some(r => !r.hasAlt) && !post.hasImageDescInText;
  const altNA   = images.length === 0;
  const seq     = ++cardSeq;

  const card = el('article', {
    className: 'post-card',
    'aria-label': `Post by ${post.author}, ${displayDate}`,
  });

  // ---- Always-visible summary ----
  const summary = el('div', { className: 'card-summary' });

  const heading = el('h2');
  heading.textContent = `${post.author} — ${displayDate}`;
  summary.appendChild(heading);

  const meta = el('p', { className: 'post-meta' });
  if (post.platform) { meta.appendChild(txt(post.platform)); meta.appendChild(txt(' · ')); }
  meta.appendChild(txt(`${displayDate}`));
  if (post.postUrl) {
    meta.appendChild(txt(' · '));
    const link = el('a', { href: post.postUrl, target: '_blank', rel: 'noopener noreferrer' });
    link.textContent = 'View on LinkedIn';
    meta.appendChild(link);
  }
  summary.appendChild(meta);

  if (post.text) {
    const preview = el('p', { className: 'post-preview' });
    preview.textContent = post.text.length > 130 ? post.text.slice(0, 130) + '…' : post.text;
    summary.appendChild(preview);
  }

  // Overall result badge (updated after OCR)
  const overallWrap = el('div');
  overallWrap.appendChild(computeOverallBadge(post, images));
  summary.appendChild(overallWrap);

  // Quick status badges
  const quickStatus = el('div', { className: 'quick-status', 'aria-label': 'Quick status' });
  const mkItem = (label, badgeEl) => {
    const item = el('span', { className: 'status-item' });
    const lbl  = el('span', { className: 'status-label' });
    lbl.textContent = label + ': ';
    item.appendChild(lbl);
    item.appendChild(badgeEl);
    return item;
  };
  quickStatus.appendChild(mkItem('Emoji',     post.emojiResult?.flag ? badge('Flag', 'flag') : badge('Pass', 'pass')));
  quickStatus.appendChild(mkItem('Fonts',     post.fontResult?.found ? badge('Fail', 'fail') : badge('Pass', 'pass')));
  quickStatus.appendChild(mkItem('Alt text',  altNA ? badge('N/A', 'na') : altFail ? badge('Fail', 'fail') : badge('Pass', 'pass')));
  const contrastBadgeWrap = el('span');
  contrastBadgeWrap.appendChild(images.length === 0 ? badge('N/A', 'na') : badge('Analysing…', 'na'));
  quickStatus.appendChild(mkItem('Contrast', contrastBadgeWrap));
  summary.appendChild(quickStatus);

  // Action buttons (always visible)
  const detailsId = `post-details-${seq}`;
  const actions = el('div', { className: 'card-actions' });
  const expandBtn = el('button', { type: 'button', className: 'expand-btn' });
  expandBtn.textContent = 'Expand';
  expandBtn.setAttribute('aria-expanded', 'false');
  expandBtn.setAttribute('aria-controls', detailsId);
  const viewBtn = el('button', { className: 'view-btn', type: 'button' });
  viewBtn.textContent = 'View full report';
  append(actions, expandBtn, viewBtn);
  card.appendChild(summary);

  // ---- Expandable details (hidden by default) ----
  const details = el('div', { className: 'card-details', id: detailsId });
  details.hidden = true;

  if (post.text) {
    const textBox = el('div', { className: 'post-text', role: 'region', 'aria-label': 'Post text' });
    textBox.textContent = post.text;
    details.appendChild(textBox);
  }

  const imagesWithData = images.filter(r => r.dataUrl);
  if (imagesWithData.length) {
    const imagesDiv = el('div', { className: 'post-images', role: 'list', 'aria-label': 'Post images' });
    for (const r of imagesWithData) {
      imagesDiv.appendChild(el('img', { className: 'post-image', src: r.dataUrl, alt: r.alt || r.filename, role: 'listitem' }));
    }
    details.appendChild(imagesDiv);
  }

  // Summary table placeholder (rebuilt after OCR)
  const summaryWrap = el('div');
  details.appendChild(summaryWrap);

  details.appendChild(buildEmojiSection(post));
  details.appendChild(buildFontSection(post));
  details.appendChild(buildAltSection(post, images));

  // Contrast placeholder
  const contrastWrap = el('div');
  const contrastPlaceholder = el('section', { className: 'image-section', 'aria-labelledby': `contrast-h-${seq}` });
  contrastPlaceholder.appendChild(el('h3', { id: `contrast-h-${seq}`, textContent: 'Image colour contrast' }));
  const analysingP = el('p');
  analysingP.appendChild(badge('Analysing…', 'na'));
  analysingP.appendChild(txt(' Running OCR and colour contrast analysis. This may take a moment.'));
  contrastPlaceholder.appendChild(analysingP);
  contrastWrap.appendChild(contrastPlaceholder);
  details.appendChild(contrastWrap);

  card.appendChild(details);
  card.appendChild(actions);

  // Expand / collapse toggle
  expandBtn.addEventListener('click', () => {
    const isExpanded = expandBtn.getAttribute('aria-expanded') === 'true';
    expandBtn.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
    expandBtn.textContent = isExpanded ? 'Expand' : 'Collapse';
    details.hidden = isExpanded;
  });

  // View full report — uses a ref so it always uses the latest imageReports
  const reportRef = { imageReports: images };
  viewBtn.addEventListener('click', () => viewReport(post, reportRef.imageReports));

  cardsEl.appendChild(card);
  card.setAttribute('tabindex', '-1');
  card.focus({ preventScroll: true });

  // Called once OCR + contrast analysis completes
  function updateAnalysis(imageReports) {
    reportRef.imageReports = imageReports;

    // Refresh overall badge now that contrast results are known
    overallWrap.innerHTML = '';
    overallWrap.appendChild(computeOverallBadge(post, imageReports));

    // Update contrast summary badge
    const contrastFail = imageReports.some(r => r.report?.verdict === 'FAIL');
    const contrastNA   = imageReports.length === 0 ||
      imageReports.every(r => !r.report || r.report.verdict === 'NO_TEXT' || r.error);
    contrastBadgeWrap.innerHTML = '';
    contrastBadgeWrap.appendChild(
      contrastNA ? badge('N/A', 'na') : contrastFail ? badge('Fail', 'fail') : badge('Pass', 'pass')
    );

    // Rebuild summary table with real contrast verdict
    summaryWrap.innerHTML = '';
    summaryWrap.appendChild(el('h3', { textContent: 'Summary' }));
    summaryWrap.appendChild(buildSummaryTable(post, imageReports,
      imageReports.some(r => !r.hasAlt) && !post.hasImageDescInText,
      imageReports.length === 0,
      contrastFail, contrastNA));

    // Replace contrast placeholder with real results
    contrastWrap.innerHTML = '';
    contrastWrap.appendChild(buildContrastSection(imageReports));
  }

  // Build initial summary table (contrast unknown)
  summaryWrap.appendChild(el('h3', { textContent: 'Summary' }));
  summaryWrap.appendChild(buildSummaryTable(post, images, altFail, altNA, false, altNA));

  return updateAnalysis;
}

function buildSummaryTable(post, imageReports, altFail, altNA, contrastFail, contrastNA) {
  const table = el('table', { className: 'summary-table' });
  table.appendChild(append(el('caption'), 'Accessibility check results for this post'));
  const thead = el('thead');
  const hrow = el('tr');
  append(hrow, el('th', { scope: 'col', textContent: 'Check' }), el('th', { scope: 'col', textContent: 'Result' }));
  thead.appendChild(hrow);
  table.appendChild(thead);

  const tbody = el('tbody');
  const rows = [
    ['Emoji usage',         post.emojiResult?.flag ? badge(`Flag — ${post.emojiResult.count} emoji`, 'flag') : badge(`Pass — ${post.emojiResult?.count ?? 0} emoji`, 'pass')],
    ['Non-standard fonts',  post.fontResult?.found ? badge(`Fail — ${post.fontResult.count} characters`, 'fail') : badge('Pass', 'pass')],
    ['Image alt text',      altNA ? badge('N/A', 'na') : altFail ? badge('Fail', 'fail') : badge('Pass', 'pass')],
    ['Image contrast',      contrastNA ? badge('N/A', 'na') : contrastFail ? badge('Fail', 'fail') : badge('Pass', 'pass')],
  ];
  for (const [label, resultEl] of rows) {
    const tr = el('tr');
    const th = el('th', { scope: 'row', textContent: label });
    const td = el('td');
    td.appendChild(resultEl);
    append(tr, th, td);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function buildAltSection(post, imageReports) {
  const section = el('section', { className: 'image-section', 'aria-labelledby': 'alt-heading' });
  section.appendChild(el('h3', { id: 'alt-heading', textContent: 'Image alt text' }));
  if (imageReports.length === 0) {
    section.appendChild(el('p', { textContent: 'No media images found in this post.' }));
    return section;
  }
  const list = el('ul');
  for (const r of imageReports) {
    const item = el('li');
    const code = el('code');
    code.textContent = r.filename;
    item.appendChild(code);
    if (r.hasAlt) {
      item.appendChild(txt(': '));
      item.appendChild(badge('Pass', 'pass'));
      item.appendChild(txt(` — alt text: "${r.alt}"`));
    } else if (r.isPlaceholder) {
      item.appendChild(txt(': '));
      item.appendChild(badge('Fail', 'fail'));
      item.appendChild(txt(' — LinkedIn placeholder alt text, not a genuine description.'));
    } else if (post.hasImageDescInText) {
      item.appendChild(txt(': '));
      item.appendChild(badge('Note', 'flag'));
      item.appendChild(txt(' — No alt attribute, but image description found in post text.'));
    } else {
      item.appendChild(txt(': '));
      item.appendChild(badge('Fail', 'fail'));
      item.appendChild(txt(' — No alt text and no image description in post text.'));
    }
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

function buildEmojiSection(post) {
  const section = el('section', { className: 'image-section', 'aria-labelledby': 'emoji-heading' });
  section.appendChild(el('h3', { id: 'emoji-heading', textContent: 'Emoji usage' }));
  const p = el('p');
  if (post.emojiResult?.flag) {
    p.appendChild(badge('Flag', 'flag'));
    p.appendChild(txt(` — ${post.emojiResult.count} emoji found (threshold: more than 5).`));
    if (post.emojiResult.examples?.length) {
      const ex = el('p');
      ex.textContent = `Examples: ${post.emojiResult.examples.join(' ')}`;
      section.appendChild(p);
      section.appendChild(ex);
      return section;
    }
  } else {
    p.appendChild(badge('Pass', 'pass'));
    p.appendChild(txt(` — ${post.emojiResult?.count ?? 0} emoji found.`));
  }
  section.appendChild(p);
  return section;
}

function buildFontSection(post) {
  const section = el('section', { className: 'image-section', 'aria-labelledby': 'font-heading' });
  section.appendChild(el('h3', { id: 'font-heading', textContent: 'Non-standard Unicode fonts' }));
  const p = el('p');
  if (post.fontResult?.found) {
    p.appendChild(badge('Fail', 'fail'));
    p.appendChild(txt(` — ${post.fontResult.count} Unicode mathematical character(s) used as decorative text. These are invisible to screen readers.`));
    if (post.fontResult.examples?.length) {
      const ex = el('p');
      ex.textContent = `Examples: ${post.fontResult.examples.join(' ')}`;
      section.appendChild(p);
      section.appendChild(ex);
      return section;
    }
  } else {
    p.appendChild(badge('Pass', 'pass'));
    p.appendChild(txt(' — No non-standard Unicode font characters detected.'));
  }
  section.appendChild(p);
  return section;
}

function buildContrastSection(imageReports) {
  const section = el('section', { className: 'image-section', 'aria-labelledby': 'contrast-heading' });
  section.appendChild(el('h3', { id: 'contrast-heading', textContent: 'Image colour contrast' }));
  if (imageReports.length === 0) {
    section.appendChild(el('p', { textContent: 'No media images to analyse.' }));
    return section;
  }
  for (const r of imageReports) {
    const imgSection = el('div');
    const imgHeading = el('h4');
    imgHeading.textContent = r.filename;
    imgSection.appendChild(imgHeading);
    if (r.error) {
      const p = el('p');
      p.appendChild(badge('Error', 'fail'));
      p.appendChild(txt(` — ${r.error}`));
      imgSection.appendChild(p);
    } else if (!r.report || r.report.verdict === 'NO_TEXT') {
      imgSection.appendChild(el('p', { textContent: 'No colour contrast data could be extracted from this image.' }));
    } else {
      const p = el('p');
      p.appendChild(r.report.verdict === 'PASS' ? badge('Pass', 'pass') : badge('Fail', 'fail'));
      p.appendChild(txt(` — ${r.report.detail}`));
      imgSection.appendChild(p);
      if (r.report.colourPairs?.length) {
        imgSection.appendChild(buildContrastTable(r.report.colourPairs));
        // Failing regions — clip canvases with red-outlined bboxes (matches sister project)
        const failing = r.report.colourPairs.filter(pair => !pair.pass);
        if (failing.length) {
          const fh = el('h4', { textContent: 'Failing regions' });
          imgSection.appendChild(fh);
          for (const pair of failing) {
            const heading = el('p', { className: 'clip-heading' });
            const bgCode = el('code'); bgCode.textContent = pair.bgHex;
            const fgCode = el('code'); fgCode.textContent = pair.fgHex;
            append(heading, bgCode, ` background / `, fgCode, ` foreground — ${pair.contrast.toFixed(2)}:1`);
            imgSection.appendChild(heading);
            if (pair.clipDataUrl) {
              imgSection.appendChild(el('img', {
                className: 'clip-canvas',
                src: pair.clipDataUrl,
                alt: `Failing region: ${pair.bgHex} background, ${pair.fgHex} foreground`,
              }));
            }
          }
        }
      }
    }
    section.appendChild(imgSection);
  }
  const note = el('p');
  const em = el('em');
  em.textContent = 'Thresholds: AA 4.5:1 normal text / 3:1 large text. AAA 7:1 normal / 4.5:1 large. Large text = bounding box height 24 px or more.';
  note.appendChild(em);
  section.appendChild(note);
  return section;
}

function buildContrastTable(colourPairs) {
  const scroll = el('div', { className: 'table-scroll' });
  const table = el('table', { className: 'contrast-table' });
  const caption = el('caption');
  caption.textContent = 'Colour combinations detected in image';
  table.appendChild(caption);
  const thead = el('thead');
  const hrow = el('tr');
  for (const label of ['Swatch', 'Background', 'Foreground', 'Ratio', 'AA', 'AAA', 'Check', 'Example words']) {
    hrow.appendChild(el('th', { scope: 'col', textContent: label }));
  }
  thead.appendChild(hrow);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const p of colourPairs) {
    const tr = el('tr');
    // Canvas swatch (matches card view exactly)
    const swatchTd = el('td');
    swatchTd.appendChild(el('img', {
      className: 'swatch-img',
      src: p.swatchDataUrl ?? makeSwatch(p.fgHex, p.bgHex).dataUrl,
      alt: `Swatch: background ${p.bgHex}, foreground ${p.fgHex}`,
    }));
    tr.appendChild(swatchTd);
    // BG first, then FG (matches sister project column order)
    const bgTd = el('td'); bgTd.appendChild(el('code', { textContent: p.bgHex })); tr.appendChild(bgTd);
    const fgTd = el('td'); fgTd.appendChild(el('code', { textContent: p.fgHex })); tr.appendChild(fgTd);
    tr.appendChild(el('td', { textContent: `${p.contrast.toFixed(2)}:1` }));
    // AA / AAA as coloured text (matches sister project)
    const aaTd = el('td', { className: p.pass ? 'pass' : 'fail' });
    aaTd.textContent = p.pass ? '✓ Pass' : '✗ Fail';
    tr.appendChild(aaTd);
    const aaaTd = el('td', { className: p.passAaa ? 'pass' : 'fail' });
    aaaTd.textContent = p.passAaa ? '✓ Pass' : '✗ Fail';
    tr.appendChild(aaaTd);
    // WebAIM link
    const checkTd = el('td');
    const webaimLink = el('a', {
      href: `https://webaim.org/resources/contrastchecker/?fcolor=${p.fgHex.replace('#','')}&bcolor=${p.bgHex.replace('#','')}`,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    webaimLink.textContent = 'WebAIM ↗';
    checkTd.appendChild(webaimLink);
    tr.appendChild(checkTd);
    // Examples
    const exTd = el('td');
    exTd.textContent = p.examples.map(e => `"${e}"`).join(', ');
    tr.appendChild(exTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  scroll.appendChild(table);
  return scroll;
}

// ---------------------------------------------------------------------------
// View report in browser — opens a self-contained HTML page in a new tab
// ---------------------------------------------------------------------------

function viewReport(post, imageReports) {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const html = buildReportHtml(post, imageReports, theme);
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  if (w) {
    // The blob URL shares the chrome-extension:// origin, so the opener can
    // access the report window's DOM once loaded: wire up the print button
    // and ensure the page starts at the top.
    w.addEventListener('load', () => {
      URL.revokeObjectURL(url);
      w.scrollTo(0, 0);
      const btn = w.document.getElementById('print-btn');
      if (btn) btn.addEventListener('click', () => w.print());
    }, { once: true });
  } else {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeHtml(label, type) {
  return `<span class="badge badge-${esc(type)}">${esc(label)}</span>`;
}

function buildReportHtml(post, imageReports, theme = 'light') {
  const displayDate  = formatDate(post.date);
  const altFail      = imageReports.some(r => !r.hasAlt) && !post.hasImageDescInText;
  const altNA        = imageReports.length === 0;
  const contrastFail = imageReports.some(r => r.report?.verdict === 'FAIL');
  const contrastNA   = imageReports.length === 0 ||
    imageReports.every(r => !r.report || r.report.verdict === 'NO_TEXT' || r.error);

  const overallFail  = altFail || post.fontResult?.found || contrastFail;
  const overallFlag  = !overallFail && post.emojiResult?.flag;
  const overallType  = overallFail ? 'fail' : overallFlag ? 'flag' : 'pass';
  const overallLabel = overallFail ? 'Overall: Fail' : overallFlag ? 'Overall: Flag' : 'Overall: Pass';

  // Images — display:block + height:auto preserves aspect ratio (no squashing)
  const imagesWithData = imageReports.filter(r => r.dataUrl);
  const imagesHtml = imagesWithData.length
    ? imagesWithData.map(r =>
        `<figure><img src="${r.dataUrl}" alt="${esc(r.alt || r.filename)}" class="post-img"></figure>`
      ).join('\n')
    : '';

  // Emoji section
  let emojiHtml = '';
  if (post.emojiResult?.flag) {
    emojiHtml = `<p>${badgeHtml('Flag','flag')} &mdash; ${post.emojiResult.count} emoji found (threshold: more than 5).</p>`;
    if (post.emojiResult.examples?.length) emojiHtml += `<p>Examples: ${esc(post.emojiResult.examples.join(' '))}</p>`;
  } else {
    emojiHtml = `<p>${badgeHtml('Pass','pass')} &mdash; ${post.emojiResult?.count ?? 0} emoji found.</p>`;
  }

  // Font section
  let fontHtml = '';
  if (post.fontResult?.found) {
    fontHtml = `<p>${badgeHtml('Fail','fail')} &mdash; ${post.fontResult.count} Unicode mathematical character(s) used as decorative text. These are invisible to screen readers.</p>`;
    if (post.fontResult.examples?.length) fontHtml += `<p>Examples: ${esc(post.fontResult.examples.join(' '))}</p>`;
  } else {
    fontHtml = `<p>${badgeHtml('Pass','pass')} &mdash; No non-standard Unicode font characters detected.</p>`;
  }

  // Alt text section
  let altHtml = '';
  if (imageReports.length === 0) {
    altHtml = `<p>No media images found in this post.</p>`;
  } else {
    altHtml = `<ul>`;
    for (const r of imageReports) {
      let detail;
      if (r.hasAlt)                     detail = `${badgeHtml('Pass','pass')} &mdash; alt text: &ldquo;${esc(r.alt)}&rdquo;`;
      else if (r.isPlaceholder)         detail = `${badgeHtml('Fail','fail')} &mdash; LinkedIn placeholder alt text, not a genuine description.`;
      else if (post.hasImageDescInText) detail = `${badgeHtml('Note','flag')} &mdash; No alt attribute, but image description found in post text.`;
      else                              detail = `${badgeHtml('Fail','fail')} &mdash; No alt text and no image description in post text.`;
      altHtml += `<li><code>${esc(r.filename)}</code>: ${detail}</li>`;
    }
    altHtml += `</ul>`;
  }

  // Contrast section
  let contrastHtml = '';
  if (imageReports.length === 0) {
    contrastHtml = `<p>No media images to analyse.</p>`;
  } else {
    for (const r of imageReports) {
      contrastHtml += `<h3>${esc(r.filename)}</h3>`;
      if (r.error) {
        contrastHtml += `<p>${badgeHtml('Error','fail')} &mdash; ${esc(r.error)}</p>`;
      } else if (!r.report || r.report.verdict === 'NO_TEXT') {
        contrastHtml += `<p>No colour contrast data could be extracted from this image.</p>`;
      } else {
        contrastHtml += `<p>${r.report.verdict === 'PASS' ? badgeHtml('Pass','pass') : badgeHtml('Fail','fail')} &mdash; ${esc(r.report.detail)}</p>`;
        if (r.report.colourPairs?.length) {
          contrastHtml += `<div class="table-scroll"><table class="contrast-table">
            <thead><tr>
              <th scope="col">Swatch</th>
              <th scope="col">Background</th><th scope="col">Foreground</th>
              <th scope="col">Ratio</th><th scope="col">AA</th><th scope="col">AAA</th>
              <th scope="col">Check</th><th scope="col">Example words</th>
            </tr></thead><tbody>`;
          for (const p of r.report.colourPairs) {
            const webaimUrl = `https://webaim.org/resources/contrastchecker/?fcolor=${p.fgHex.replace('#','')}&bcolor=${p.bgHex.replace('#','')}`;
            const swatchSrc = p.swatchDataUrl ?? makeSwatch(p.fgHex, p.bgHex).dataUrl;
            contrastHtml += `<tr>
              <td><img src="${swatchSrc}" alt="Swatch: background ${esc(p.bgHex)}, foreground ${esc(p.fgHex)}" class="swatch-img"></td>
              <td><code>${esc(p.bgHex)}</code></td>
              <td><code>${esc(p.fgHex)}</code></td>
              <td>${esc(p.contrast.toFixed(2))}:1</td>
              <td class="${p.pass ? 'pass' : 'fail'}">${p.pass ? '&#x2713; Pass' : '&#x2717; Fail'}</td>
              <td class="${p.passAaa ? 'pass' : 'fail'}">${p.passAaa ? '&#x2713; Pass' : '&#x2717; Fail'}</td>
              <td><a href="${webaimUrl}" target="_blank" rel="noopener noreferrer">WebAIM &#x2197;</a></td>
              <td class="examples">${esc(p.examples.map(e => `"${e}"`).join(', '))}</td>
            </tr>`;
          }
          contrastHtml += `</tbody></table></div>`;
          // Failing regions with clip images (red-outlined bboxes)
          const failing = r.report.colourPairs.filter(p => !p.pass);
          if (failing.length) {
            contrastHtml += `<h4>Failing regions</h4>`;
            for (const p of failing) {
              contrastHtml += `<p class="clip-heading"><code>${esc(p.bgHex)}</code> background / <code>${esc(p.fgHex)}</code> foreground &mdash; ${esc(p.contrast.toFixed(2))}:1</p>`;
              if (p.clipDataUrl) {
                contrastHtml += `<img src="${p.clipDataUrl}" alt="Failing region: ${esc(p.bgHex)} background, ${esc(p.fgHex)} foreground" class="clip-canvas">`;
              }
            }
          }
        }
      }
    }
    contrastHtml += `<p><em>Thresholds: AA 4.5:1 normal text / 3:1 large text. AAA 7:1 normal / 4.5:1 large. Large text = bounding box height &ge; 24 px.</em></p>`;
  }

  return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <title>Accessibility Report &mdash; ${esc(post.author)}, ${esc(displayDate)}</title>
  <style>
    :root {
      --bg: #f4f6f8; --bg-card: #fff; --fg: #1a1a1a; --fg-muted: #4b5563;
      --border: #d1d5db; --accent: #061528; --accent-text: #fff;
      --pass: #14532d; --pass-bg: #dcfce7;
      --fail: #7f1d1d; --fail-bg: #fee2e2;
      --flag: #7c2d12; --flag-bg: #ffedd5;
      --neutral: #4b5563; --neutral-bg: #f0f2f5; --code-bg: #f0f2f5;
      --orange: #FF7C00; --radius: 10px;
      --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.05);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --bg: #061528; --bg-card: #0d2040; --fg: #fff; --fg-muted: #63D2FF;
        --border: #1a3050; --accent: #FF7C00; --accent-text: #061528;
        --pass: #4ade80; --pass-bg: rgba(21,128,61,0.22);
        --fail: #fca5a5; --fail-bg: rgba(185,28,28,0.22);
        --flag: #fdba74; --flag-bg: rgba(194,65,12,0.22);
        --neutral: #63D2FF; --neutral-bg: #1a3050; --code-bg: #1a3050;
      }
    }
    [data-theme="dark"] {
      --bg: #061528; --bg-card: #0d2040; --fg: #fff; --fg-muted: #63D2FF;
      --border: #1a3050; --accent: #FF7C00; --accent-text: #061528;
      --pass: #4ade80; --pass-bg: rgba(21,128,61,0.22);
      --fail: #fca5a5; --fail-bg: rgba(185,28,28,0.22);
      --flag: #fdba74; --flag-bg: rgba(194,65,12,0.22);
      --neutral: #63D2FF; --neutral-bg: #1a3050; --code-bg: #1a3050;
    }
    [data-theme="light"] {
      --bg: #f4f6f8; --bg-card: #fff; --fg: #1a1a1a; --fg-muted: #4b5563;
      --border: #d1d5db; --accent: #061528; --accent-text: #fff;
      --pass: #14532d; --pass-bg: #dcfce7;
      --fail: #7f1d1d; --fail-bg: #fee2e2;
      --flag: #7c2d12; --flag-bg: #ffedd5;
      --neutral: #4b5563; --neutral-bg: #f0f2f5; --code-bg: #f0f2f5;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: var(--fg); background: var(--bg); max-width: 960px; margin: 0 auto; padding: 28px 32px 48px; }
    a { color: var(--accent); }
    a:hover { color: var(--accent); text-decoration: underline; }
    h1 { font-size: 22px; margin: 0 0 6px; }
    h2 { font-size: 16px; font-weight: 700; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--border); }
    h3 { font-size: 13px; font-weight: 600; margin: 14px 0 5px; }
    h4 { font-size: 12px; font-weight: 700; margin: 12px 0 4px; color: var(--fg-muted); }
    p { margin: 5px 0 10px; font-size: 13px; line-height: 1.55; }
    ul { font-size: 13px; margin: 6px 0 12px; padding-left: 22px; line-height: 1.65; }
    li { margin-bottom: 4px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code-bg); color: var(--fg); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
    pre  { background: var(--code-bg); border-left: 3px solid var(--border); color: var(--fg); padding: 10px 14px; border-radius: 0 4px 4px 0; font-size: 12px; white-space: pre-wrap; max-height: 150px; overflow-y: auto; margin: 0 0 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); font-size: 13px; margin: 8px 0 16px; }
    th, td { border-bottom: 1px solid var(--border); padding: 8px 10px; text-align: left; vertical-align: middle; color: var(--fg); }
    th { background: var(--neutral-bg); font-weight: 700; }
    tr:last-child td { border-bottom: none; }
    .contrast-table th, .contrast-table td { font-size: 12px; padding: 6px 8px; }
    .contrast-table .pass { color: var(--pass); font-weight: 700; }
    .contrast-table .fail { color: var(--fail); font-weight: 700; }
    .contrast-table .examples { font-style: italic; color: var(--fg-muted); }
    figure { margin: 0 0 12px; }
    .post-img { display: block; max-width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--border); }
    .swatch-img { width: 80px; height: 20px; display: block; border-radius: 2px; }
    .clip-heading { margin: 10px 0 4px; font-size: 0.82rem; font-weight: 600; color: var(--fg-muted); }
    .clip-canvas { display: block; max-width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 8px; }
    .disclaimer { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; background: var(--neutral-bg); border-left: 4px solid var(--orange); border-radius: 6px; font-size: 0.82rem; color: var(--fg-muted); margin-bottom: 20px; line-height: 1.5; }
    .meta { font-size: 12px; color: var(--fg-muted); margin: 4px 0 16px; }
    .overall { margin-bottom: 18px; }
    .print-btn { display: inline-block; padding: 8px 18px; background: var(--accent); color: var(--accent-text); border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 20px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .badge-pass { background: var(--pass-bg); color: var(--pass); }
    .badge-fail { background: var(--fail-bg); color: var(--fail); }
    .badge-flag { background: var(--flag-bg); color: var(--flag); }
    .badge-na   { background: var(--neutral-bg); color: var(--neutral); }
    .badge-overall { font-size: 12px; padding: 4px 14px; border-radius: 999px; font-weight: 700; display: inline-block; }
    .badge-overall.badge-pass { background: var(--pass-bg); color: var(--pass); }
    .badge-overall.badge-fail { background: var(--fail-bg); color: var(--fail); }
    .badge-overall.badge-flag { background: var(--flag-bg); color: var(--flag); }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <div class="disclaimer">
    <strong>Automated audit:</strong> This report is generated by automated tools and may not identify all accessibility issues. Results should be verified by manual testing with assistive technology.
  </div>

  <h1>${esc(post.author)} &mdash; ${esc(displayDate)}</h1>
  <p class="meta">${post.platform ? `Platform: ${esc(post.platform)} &nbsp;|&nbsp; ` : ''}Date: ${esc(displayDate)}${post.postUrl ? ` &nbsp;|&nbsp; <a href="${esc(post.postUrl)}" target="_blank" rel="noopener noreferrer">View on LinkedIn</a>` : ''}</p>

  <div class="overall">
    <span class="badge badge-overall badge-${overallType}">${esc(overallLabel)}</span>
  </div>

  <button class="print-btn" id="print-btn">Print / Save as PDF</button>

  ${post.text ? `<h2>Post text</h2><pre>${esc(post.text)}</pre>` : ''}
  ${imagesHtml ? `<h2>Post images</h2>${imagesHtml}` : ''}

  <h2>Summary</h2>
  <table>
    <thead><tr><th scope="col">Check</th><th scope="col">Result</th></tr></thead>
    <tbody>
      <tr><th scope="row">Emoji usage</th><td>${post.emojiResult?.flag ? badgeHtml(`Flag &mdash; ${post.emojiResult.count} emoji`,'flag') : badgeHtml(`Pass &mdash; ${post.emojiResult?.count ?? 0} emoji`,'pass')}</td></tr>
      <tr><th scope="row">Non-standard fonts</th><td>${post.fontResult?.found ? badgeHtml(`Fail &mdash; ${post.fontResult.count} characters`,'fail') : badgeHtml('Pass','pass')}</td></tr>
      <tr><th scope="row">Image alt text</th><td>${altNA ? badgeHtml('N/A','na') : altFail ? badgeHtml('Fail','fail') : badgeHtml('Pass','pass')}</td></tr>
      <tr><th scope="row">Image contrast</th><td>${contrastNA ? badgeHtml('N/A','na') : contrastFail ? badgeHtml('Fail','fail') : badgeHtml('Pass','pass')}</td></tr>
    </tbody>
  </table>

  <h2>1. Emoji usage</h2>
  ${emojiHtml}

  <h2>2. Non-standard Unicode fonts</h2>
  ${fontHtml}

  <h2>3. Image alt text</h2>
  ${altHtml}

  <h2>4. Image colour contrast</h2>
  ${contrastHtml}
</body>
</html>`;
}


// ---------------------------------------------------------------------------
// ZIP download — Markdown + PDF per post
// ---------------------------------------------------------------------------

downloadBtn.addEventListener('click', async () => {
  const zip = new JSZip();
  for (const { post, imageReports } of allPosts) {
    const base = `${safeName(post.author)}_${post.dateKey || 'unknown'}_${post.seq}`;
    zip.file(`${base}.md`,  buildMarkdown(post, imageReports));
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    zip.file(`${base}.pdf`, await buildPdf({ ...post, displayDate: formatDate(post.date) }, imageReports, ts));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = el('a', { href: url, download: `accessibility-audit-${stamp()}.zip` });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatDate(rawDate) {
  if (!rawDate) return 'Unknown date';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = d => `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const direct = new Date(rawDate);
  if (!isNaN(direct)) return fmt(direct);
  const match = rawDate.trim().match(/^(\d+)\s*(s|m|h|d|w|mo|yr)$/i);
  if (match) {
    const msPerUnit = { s:1e3, m:6e4, h:36e5, d:864e5, w:6048e5, mo:30*864e5, yr:365*864e5 };
    const ms = msPerUnit[match[2].toLowerCase()];
    if (ms) return fmt(new Date(Date.now() - parseInt(match[1],10) * ms)) + ' (approx.)';
  }
  return rawDate;
}

function safeName(str) {
  return (str || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

function stamp() {
  return new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
}
