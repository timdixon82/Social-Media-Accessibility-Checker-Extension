const urlEl     = document.getElementById('current-url');
const rangeEl   = document.getElementById('posts-range');
const valEl     = document.getElementById('posts-val');
const runBtn    = document.getElementById('run-btn');
const errorEl   = document.getElementById('error');
const versionEl = document.getElementById('version');

const { version } = chrome.runtime.getManifest();
versionEl.textContent = `v${version}`;
versionEl.setAttribute('aria-label', `Extension version ${version}`);

let activeTabId = null;

const PLATFORM_DOMAINS = {
  linkedin: 'linkedin.com',
};

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  activeTabId = tab.id;
  urlEl.textContent = tab.url || '';

  const platform = getCheckedPlatform();
  const domain = PLATFORM_DOMAINS[platform];
  if (!tab.url?.includes(domain)) {
    showError(`Navigate to a ${platformLabel(platform)} page first, then click the extension.`);
    runBtn.disabled = true;
  }
});

rangeEl.addEventListener('input', () => {
  const n = rangeEl.value;
  valEl.textContent = n;
  rangeEl.setAttribute('aria-valuenow', n);
  rangeEl.setAttribute('aria-valuetext', `${n} post${n === '1' ? '' : 's'}`);
});

runBtn.addEventListener('click', () => {
  if (!activeTabId) return;
  hideError();
  runBtn.disabled = true;
  runBtn.textContent = 'Starting...';

  runBtn.textContent = 'Opening report tab...';

  chrome.runtime.sendMessage(
    {
      type:     'startAudit',
      tabId:    activeTabId,
      platform: getCheckedPlatform(),
      posts:    parseInt(rangeEl.value, 10),
      days:     null,
    },
    (resp) => {
      if (chrome.runtime.lastError || !resp?.started) {
        showError('Failed to start audit. Please try again.');
        runBtn.disabled = false;
        runBtn.textContent = 'Run Audit';
      } else {
        runBtn.textContent = 'Audit running — see report tab';
        setTimeout(() => window.close(), 1500);
      }
    }
  );
});

function getCheckedPlatform() {
  const checked = document.querySelector('input[name="platform"]:checked');
  return checked ? checked.value : 'linkedin';
}

function platformLabel(platform) {
  return { linkedin: 'LinkedIn', twitter: 'X / Twitter', facebook: 'Facebook', instagram: 'Instagram' }[platform] || platform;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
}

function hideError() {
  errorEl.textContent = '';
  errorEl.style.display = 'none';
}
