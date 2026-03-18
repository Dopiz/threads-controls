const DEFAULTS = { revealText: true, revealMedia: true, textHighlight: '', videoControls: true, defaultVolume: 0 };
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
  if (settings.videoControls) enableVideoControls();
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
      const revealed = span.cloneNode(true);
      if (settings.textHighlight) {
        revealed.style.backgroundColor = settings.textHighlight;
        revealed.style.borderRadius = '4px';
        revealed.style.padding = '0 2px';
      }
      button.parentNode.replaceChild(revealed, button);
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

function enableVideoControls() {
  for (const video of document.querySelectorAll('video')) {
    if (video.dataset.controlsEnabled !== 'true') {
      video.dataset.controlsEnabled = 'true';
      video.controls = true;
      video.volume = settings.defaultVolume / 100;
    }

    // Hide overlays scoped to this video's container
    const container = video.closest('div[role="button"]') ?? video.parentElement;
    if (!container) continue;
    for (const group of container.querySelectorAll('div[role="group"]')) {
      if (group.dataset.overlayHidden === 'true') continue;
      if (getComputedStyle(group).position !== 'absolute') continue;
      if (!group.querySelector('svg[aria-label]')) continue;
      group.dataset.overlayHidden = 'true';
      group.style.pointerEvents = 'none';
      group.style.display = 'none';
    }
  }
}

function scheduleReveal() {
  if (revealTimer) clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    revealSpoilers();
  }, 300);
}

function observePageChanges() {
  new MutationObserver(scheduleReveal).observe(document.body, {
    childList: true,
    subtree: true
  });
}
