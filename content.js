const DEFAULTS = { revealText: true, revealMedia: true };
let settings = { ...DEFAULTS };
let revealTimer = null;

chrome.storage.sync.get(DEFAULTS, (stored) => {
  settings = stored;
  revealSpoilers();
  observePageChanges();
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in DEFAULTS) settings[key] = newValue;
  }
  revealSpoilers();
});

function revealSpoilers() {
  const buttons = document.querySelectorAll('div[role="button"]');
  if (settings.revealText)  revealSpoilerText(buttons);
  if (settings.revealMedia) revealSpoilerMedia(buttons);
}

function revealSpoilerText(buttons) {
  for (const button of buttons) {
    if (button.dataset.spoilerRevealed === 'true') continue;
    const style = getComputedStyle(button);
    if (style.display !== 'inline') continue;
    if (!button.closest('span[dir="auto"]')) continue;
    if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') continue;

    const innerDiv = button.querySelector(':scope > div');
    if (!innerDiv) continue;

    const span = innerDiv.querySelector(':scope > span');
    if (!span) continue;

    button.dataset.spoilerRevealed = 'true';
    try {
      button.parentNode.replaceChild(span.cloneNode(true), button);
    } catch (e) {}
  }
}

function revealSpoilerMedia(buttons) {
  for (const button of buttons) {
    if (button.dataset.spoilerMediaRevealed === 'true') continue;
    if (!button.querySelector('picture, img, video')) continue;
    if (!button.querySelector('div[style*="--x-opacity"]')) continue;

    button.dataset.spoilerMediaRevealed = 'true';
    try { button.click(); } catch (e) {}
  }
}

function observePageChanges() {
  const observer = new MutationObserver(() => {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      revealSpoilers();
    }, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}
