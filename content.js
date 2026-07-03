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
  // Strategy 1 (legacy DOM): outer button carries the grey background mask
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
    swapSpoiler(button, innerSpan);
  }

  // Strategy 2 (newer DOM): outer button has transparent bg; anchor on data-text-fragment
  for (const spoilerSpan of document.querySelectorAll('span[data-text-fragment="spoiler"]')) {
    if (spoilerSpan.dataset.spoilerRevealed === 'true') continue;
    if (!spoilerSpan.closest('span[dir="auto"]')) continue;

    const innerSpan = spoilerSpan.querySelector('span');
    if (!innerSpan) continue;

    const target = spoilerSpan.closest('[role="button"]') || spoilerSpan;
    spoilerSpan.dataset.spoilerRevealed = 'true';
    swapSpoiler(target, innerSpan);
  }
}

function swapSpoiler(target, innerSpan) {
  try {
    const revealed = innerSpan.cloneNode(true);
    if (settings.textHighlight) {
      revealed.style.backgroundColor = settings.textHighlight;
      revealed.style.borderRadius = '4px';
      revealed.style.padding = '0 2px';
    }
    // Newer Threads paints the particle/grain effect via a sibling <canvas>; remove it too
    let node = target.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const canvases = node.querySelectorAll(':scope > canvas');
      if (canvases.length) {
        canvases.forEach(c => c.remove());
        break;
      }
      node = node.parentElement;
    }
    target.parentNode.replaceChild(revealed, target);
  } catch (e) {}
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
      video.style.objectFit = 'cover';
      video.volume = settings.defaultVolume / 100;
      video.dataset.desiredVolume = String(settings.defaultVolume / 100);
      video.dataset.prevMuted = video.muted ? '1' : '0';

      const onFs = () => {
        const fs = document.fullscreenElement || document.webkitFullscreenElement;
        video.style.objectFit = fs === video ? 'contain' : 'cover';
      };
      document.addEventListener('fullscreenchange', onFs);
      document.addEventListener('webkitfullscreenchange', onFs);

      video.addEventListener('seeking', () => { video.dataset.seekAt = String(Date.now()); });

      // Keep the sound behaving predictably against the platform, which likes to
      // force muted=true / volume=100% (e.g. on unmute or after a native seek).
      // "desiredVolume" tracks the user's chosen level (starts at the default and
      // only updates on a genuine slider drag). Per-video, transient — a brand new
      // clip still starts muted at the default, so nothing is remembered across clips.
      const applySound = (fn) => { video.dataset.applyingSound = '1'; fn(); video.dataset.applyingSound = ''; };
      video.addEventListener('volumechange', () => {
        if (video.dataset.applyingSound === '1') return;
        const desired = Number(video.dataset.desiredVolume);
        const prevMuted = video.dataset.prevMuted === '1';
        const offDesired = Math.abs(video.volume - desired) > 0.005;

        if (video.muted) {
          // A native-control seek makes the platform re-mute; undo it to keep sound.
          if (!prevMuted && Date.now() - Number(video.dataset.seekAt || 0) < 1000) {
            video.dataset.unmuteAt = String(Date.now());
            applySound(() => { video.muted = false; video.volume = desired; });
          }
        } else if (prevMuted) {
          // Just unmuted (user click, or platform after a seek): the platform tends
          // to jump volume to 100%, so pin it back to the user's desired level.
          video.dataset.unmuteAt = String(Date.now());
          if (offDesired) applySound(() => { video.volume = desired; });
        } else if (Date.now() - Number(video.dataset.unmuteAt || 0) < 600) {
          // Platform's delayed volume bump right after an unmute → pin to desired.
          if (offDesired) applySound(() => { video.volume = desired; });
        } else if (offDesired) {
          // Genuine user slider drag → remember it as the new desired volume.
          video.dataset.desiredVolume = String(video.volume);
        }
        video.dataset.prevMuted = video.muted ? '1' : '0';
      });
    }

    // Hide the platform's redundant mute toggle (native controls provide one). It
    // can render lazily, so retry each pass until we find and hide it.
    if (video.dataset.muteBtnHidden !== 'true') {
      let a = video.parentElement;
      for (let i = 0; i < 10 && a; i++) {
        const svg = [...a.querySelectorAll('svg[aria-label]')]
          .find(s => /靜音|mute/i.test(s.getAttribute('aria-label')));
        if (svg) {
          const target = svg.closest('div[role="group"]') || svg.closest('div[role="button"]')
            || (svg.parentElement && svg.parentElement.parentElement);
          if (target) {
            target.style.display = 'none';
            video.dataset.muteBtnHidden = 'true';
          }
          break;
        }
        a = a.parentElement;
      }
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

    // Hide the platform's own seek/progress slider — the native control bar
    // already provides one, so it would otherwise sit on top of it.
    let seekFound = false;
    let ancestor = video.parentElement;
    for (let i = 0; i < 12 && ancestor && !seekFound; i++) {
      for (const slider of ancestor.querySelectorAll('div[role="slider"]')) {
        if (slider.dataset.seekHidden === 'true') continue;
        if (!/position/i.test(slider.getAttribute('aria-label') || '')) continue;
        slider.dataset.seekHidden = 'true';
        slider.style.display = 'none';
        seekFound = true;
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
