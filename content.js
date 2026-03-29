const DEFAULTS = { revealText: true, revealMedia: true, textHighlight: '', videoControls: true, defaultVolume: 10 };
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

    const spoilerSpan = button.querySelector('span[data-text-fragment="spoiler"]');
    const innerSpan = spoilerSpan
      ? spoilerSpan.querySelector('span')
      : button.querySelector(':scope > div > span');
    if (!innerSpan) continue;

    button.dataset.spoilerRevealed = 'true';
    try {
      const revealed = innerSpan.cloneNode(true);
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
      video.style.objectFit = 'contain';
      video.volume = settings.defaultVolume / 100;
    }

    if (video.dataset.overlayCleared === 'true') continue;
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width === 0) continue;
    const cx = videoRect.left + videoRect.width / 2;
    const midY = videoRect.top + videoRect.height / 2;
    if (cx < 0 || cx > window.innerWidth || midY < 0 || midY > window.innerHeight) continue;

    for (const py of [midY, videoRect.bottom - 15]) {
      let el = document.elementFromPoint(cx, py);
      let attempts = 0;
      while (el && el !== video && el.tagName !== 'VIDEO' && attempts < 10) {
        if (el.contains(video)) break;
        el.style.pointerEvents = 'none';
        el = document.elementFromPoint(cx, py);
        attempts++;
      }
    }

    let muteFound = false;
    let ancestor = video.parentElement;
    for (let i = 0; i < 10 && ancestor && !muteFound; i++) {
      for (const group of ancestor.querySelectorAll('div[role="group"]')) {
        if (group.dataset.muteHidden === 'true') continue;
        if (getComputedStyle(group).position !== 'absolute') continue;
        if (!group.querySelector('svg[aria-label]')) continue;
        group.dataset.muteHidden = 'true';
        group.style.display = 'none';
        muteFound = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }

    video.dataset.overlayCleared = 'true';
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

  document.addEventListener('scroll', scheduleReveal, { capture: true, passive: true });
}
