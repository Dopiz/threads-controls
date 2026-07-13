const DEFAULTS = {
  revealText: true,
  revealMedia: true,
  textHighlight: '',
  videoControlsThreads: true,
  videoControlsInstagram: false,
  videoControlsFacebook: false,
  defaultVolume: 10
};

function videoControlsEnabled() {
  const host = location.hostname;
  if (host.includes('instagram.com')) return settings.videoControlsInstagram;
  if (host.includes('facebook.com')) return settings.videoControlsFacebook;
  return settings.videoControlsThreads;
}
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
  if (videoControlsEnabled()) enableVideoControls();
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

// Hide the platform's own mute toggle — native controls already provide one.
// The icon differs by surface: logged-out uses svg[aria-label], logged-in puts
// the label in an inner <title>; both sit inside a role="button". We hide that
// button via an injected !important class so a platform hover/re-render that sets
// an inline display can't bring it back, and re-tag every pass in case React
// swaps the node.
function hidePlatformMuteButtons() {
  if (!document.getElementById('tar-mute-style')) {
    const style = document.createElement('style');
    style.id = 'tar-mute-style';
    style.textContent = '.tar-hide-mute{display:none !important;}';
    (document.head || document.documentElement).appendChild(style);
  }
  for (const svg of document.querySelectorAll('svg')) {
    const title = svg.querySelector('title');
    const label = svg.getAttribute('aria-label') || (title && title.textContent) || '';
    if (!/靜音|mute/i.test(label)) continue;
    const button = svg.closest('div[role="button"]');
    if (button && !button.classList.contains('tar-hide-mute')) button.classList.add('tar-hide-mute');
  }
}

// Height of the native control bar strip at the bottom of a video.
const CONTROL_BAR_HEIGHT = 40;

// Reels (FB/IG) draw an overlay chrome (caption/owner info, top bar) over the
// video. It is purely visual (pointer-events: none), but it sits right on top
// of the native control bar. Hide it while the pointer is over the video —
// i.e. while the native controls are showing — and restore it on leave.
// Preferred match: the whole div[aria-label="Video player"] group covering the
// video. Fallback (other surfaces/locales): a bottom-anchored info block.
function isPlayerChrome(el, videoRect) {
  if (el.getAttribute('aria-label') !== 'Video player') return false;
  const rect = el.getBoundingClientRect();
  const overlapW = Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left);
  const overlapH = Math.min(rect.bottom, videoRect.bottom) - Math.max(rect.top, videoRect.top);
  return overlapW > 0 && overlapH > 0 &&
    overlapW * overlapH >= videoRect.width * videoRect.height * 0.5;
}

function findInfoOverlays(video) {
  const videoRect = video.getBoundingClientRect();
  const found = [];
  let ancestor = video.parentElement;
  for (let i = 0; i < 4 && ancestor; i++, ancestor = ancestor.parentElement) {
    const divs = ancestor.querySelectorAll('div');
    if (divs.length > 400) break;
    for (const el of divs) {
      if (el.contains(video)) continue;
      if (found.some(f => f.contains(el) || el.contains(f))) continue;
      if (isPlayerChrome(el, videoRect)) {
        found.push(el);
        continue;
      }
      const style = getComputedStyle(el);
      if (style.position !== 'absolute' || style.pointerEvents !== 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < videoRect.width * 0.5) continue;
      // bottom-anchored block only — never a full-cover wrapper
      if (rect.top <= videoRect.top + videoRect.height * 0.5) continue;
      if (rect.bottom <= videoRect.bottom - CONTROL_BAR_HEIGHT || rect.top >= videoRect.bottom) continue;
      if (rect.left >= videoRect.right || rect.right <= videoRect.left) continue;
      if (!(el.innerText || '').trim()) continue;
      found.push(el);
    }
    if (found.length) break;
  }
  return found;
}

function setupInfoOverlayHover(video) {
  let hidden = null;
  video.addEventListener('mouseenter', () => {
    if (hidden) return;
    hidden = findInfoOverlays(video);
    for (const el of hidden) el.style.visibility = 'hidden';
  });
  video.addEventListener('mouseleave', () => {
    if (!hidden) return;
    for (const el of hidden) el.style.visibility = '';
    hidden = null;
  });
}

function enableVideoControls() {
  hidePlatformMuteButtons();
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

      setupInfoOverlayHover(video);
    }

    if (video.dataset.overlayCleared === 'true') continue;
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width === 0) continue;
    const cx = videoRect.left + videoRect.width / 2;
    const barY = videoRect.bottom - 15;
    if (cx < 0 || cx > window.innerWidth || barY < 0 || barY > window.innerHeight) continue;

    // Make the native control bar clickable. The overlays covering the video
    // also carry the platform's own pointer handlers (e.g. the drag gesture on
    // multi-media carousels), so pointer-events:none on them would kill those.
    // Instead, clip away only the part of each overlay that covers the
    // control-bar strip, leaving the rest interactive.
    const stripTop = videoRect.bottom - CONTROL_BAR_HEIGHT;
    for (const el of document.elementsFromPoint(cx, barY)) {
      if (el === video || el.tagName === 'VIDEO' || el.contains(video)) break;
      const clipBottom = el.getBoundingClientRect().bottom - stripTop;
      if (clipBottom > 0) el.style.clipPath = 'inset(0 0 ' + Math.ceil(clipBottom) + 'px 0)';
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
