const DEFAULTS = {
  revealText: true,
  revealMedia: true,
  textHighlight: '',
  videoControlsThreads: true,
  videoControlsInstagram: false,
  videoControlsFacebook: false,
  defaultVolume: 10
};

// Shared core for all site scripts. A site file synchronously calls
// TAR.register() with its storage key and passes; common then loads settings
// (async) and drives the pass runs, so register always precedes the first run.
const TAR = {
  settings: { ...DEFAULTS },
  _settingKey: null,
  _passes: [],
  _timer: null,

  register({ settingKey, passes }) {
    this._settingKey = settingKey;
    this._passes = passes;
  },

  videoControlsEnabled() {
    return this.settings[this._settingKey];
  },

  runPasses() {
    for (const pass of this._passes) {
      try { pass(); } catch (e) {}
    }
  },

  schedule() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.runPasses(), 300);
  }
};

chrome.storage.sync.get(DEFAULTS, (stored) => {
  TAR.settings = stored;
  TAR.runPasses();

  new MutationObserver(() => TAR.schedule()).observe(document.body, {
    childList: true,
    subtree: true
  });
  document.addEventListener('scroll', () => TAR.schedule(), { capture: true, passive: true });
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in DEFAULTS) TAR.settings[key] = newValue;
  }
  TAR.runPasses();
});

// Hide the platform's own mute toggle — native controls already provide one.
// The icon differs by surface: logged-out uses svg[aria-label], logged-in puts
// the label in an inner <title>; both sit inside a role="button". We hide that
// button via an injected !important class so a platform hover/re-render that sets
// an inline display can't bring it back, and re-tag every pass in case React
// swaps the node.
TAR.hidePlatformMuteButtons = function () {
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
};

// Return all div[aria-label="Video player"] chrome groups that cover the video
// (excluding ancestors of the video), overlapping at least 50% of its area.
TAR.findPlayerChrome = function (video) {
  const videoRect = video.getBoundingClientRect();
  const found = [];
  for (const el of document.querySelectorAll('div[aria-label="Video player"]')) {
    if (el.contains(video)) continue;
    const rect = el.getBoundingClientRect();
    const overlapW = Math.min(rect.right, videoRect.right) - Math.max(rect.left, videoRect.left);
    const overlapH = Math.min(rect.bottom, videoRect.bottom) - Math.max(rect.top, videoRect.top);
    if (overlapW > 0 && overlapH > 0 &&
        overlapW * overlapH >= videoRect.width * videoRect.height * 0.5) {
      found.push(el);
    }
  }
  return found;
};

// Install once: while the pointer is over a native-controlled video, hide the
// div[aria-label="Video player"] chrome (caption/owner info, top bar) so it does
// not sit on top of the native control bar; restore on leave. React may swap the
// nodes, so we re-find on every enter; restoring a detached node is harmless.
let hoverChromeInstalled = false;
TAR.installHoverChromeHide = function () {
  if (hoverChromeInstalled) return;
  hoverChromeInstalled = true;
  let lastMove = 0;
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMove < 80) return;
    lastMove = now;
    for (const video of document.querySelectorAll('video')) {
      if (video.controls !== true) continue;
      const rect = video.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inside && !video._tarChrome) {
        const chrome = TAR.findPlayerChrome(video);
        for (const el of chrome) el.style.visibility = 'hidden';
        video._tarChrome = chrome;
      } else if (!inside && video._tarChrome) {
        for (const el of video._tarChrome) el.style.visibility = '';
        video._tarChrome = null;
      }
    }
  }, { capture: true });
};

TAR.enableNativeControls = function (video) {
  video.controls = true;
  if (video.dataset.controlsEnabled === 'true') return;
  video.dataset.controlsEnabled = 'true';
  video.style.objectFit = 'cover';
  video.volume = TAR.settings.defaultVolume / 100;
  video.dataset.desiredVolume = String(TAR.settings.defaultVolume / 100);
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

  TAR.installHoverChromeHide();
};

TAR.disableNativeControls = function (video) {
  if (video.controls === true) video.controls = false;
};

// Hide the platform's own seek/progress slider — the native control bar already
// provides one, so it would otherwise sit on top of it. Search up to 12 levels
// up from the video for a div[role="slider"] labelled as a position control.
TAR.hideSeekSliderNear = function (video) {
  let ancestor = video.parentElement;
  for (let i = 0; i < 12 && ancestor; i++) {
    for (const slider of ancestor.querySelectorAll('div[role="slider"]')) {
      if (slider.dataset.seekHidden === 'true') continue;
      if (!/position/i.test(slider.getAttribute('aria-label') || '')) continue;
      slider.dataset.seekHidden = 'true';
      slider.style.display = 'none';
      return;
    }
    ancestor = ancestor.parentElement;
  }
};
