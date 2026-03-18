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
    settings[key] = newValue;
  }
});

function revealSpoilers() {
  if (settings.revealText)  revealSpoilerText();
  if (settings.revealMedia) revealSpoilerImg();
  if (settings.revealMedia) revealSpoilerVideo();
}

function triggerReveal(button) {
  const rect = button.getBoundingClientRect();
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
    buttons: 1
  };

  for (const name of ['pointerdown', 'pointerup']) {
    button.dispatchEvent(new PointerEvent(name, { ...eventInit, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  }
  for (const name of ['mousedown', 'mouseup', 'click']) {
    button.dispatchEvent(new MouseEvent(name, eventInit));
  }
  button.click();
}

function revealSpoilerText() {
  const autoSpans = document.querySelectorAll('span[dir="auto"]');

  autoSpans.forEach((autoSpan) => {
    const buttons = autoSpan.querySelectorAll(':scope > div[role="button"][tabindex="0"]');

    buttons.forEach((button) => {
      if (button.dataset.spoilerTextRevealed === 'true') return;

      const innerDiv = button.querySelector(':scope > div');
      if (!innerDiv) return;

      const span = innerDiv.querySelector(':scope > span');
      if (!span) return;

      button.dataset.spoilerTextRevealed = 'true';

      try {
        const spanClone = span.cloneNode(true);
        button.parentNode.replaceChild(spanClone, button);
      } catch (e) {}
    });
  });
}

function revealSpoilerImg() {
  for (const span of document.querySelectorAll('span[dir="auto"]')) {
    const button = span.closest('[role="button"]');
    if (!button || !button.querySelector('img, picture')) continue;
    if (button.dataset.spoilerImgRevealed === 'true') continue;

    button.dataset.spoilerImgRevealed = 'true';
    try { triggerReveal(button); } catch (e) {}
  }
}

function revealSpoilerVideo() {
  for (const span of document.querySelectorAll('span[dir="auto"]')) {
    const button = span.closest('[role="button"]');
    if (!button || !button.querySelector('video')) continue;
    if (button.dataset.spoilerVideoRevealed === 'true') continue;

    button.dataset.spoilerVideoRevealed = 'true';
    try { triggerReveal(button); } catch (e) {}
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
