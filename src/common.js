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
// A site may also pass `teardown`, run (after the shared teardown) when its
// video-controls toggle is switched off live, to undo its own DOM changes,
// `carrySound: true` to carry the user's sound state from clip to clip (below),
// and `pinUnmanaged()` to limit where media-guard pins videos the pass has not
// picked up yet (default: everywhere the site's controls are on).
const TAR = {
  settings: { ...DEFAULTS },
  // Page-wide sound state for carrySound sites, else null: whether the user
  // last muted or unmuted, and the level they last set (null = default).
  sound: null,
  _settingKey: null,
  _passes: [],
  _teardown: null,
  _carrySound: false,
  _pinUnmanaged: () => true,
  _videoActive: false,
  _timer: null,

  register({ settingKey, passes, teardown, carrySound, pinUnmanaged }) {
    this._settingKey = settingKey;
    this._passes = passes;
    this._teardown = teardown || null;
    this._carrySound = !!carrySound;
    if (pinUnmanaged) this._pinUnmanaged = pinUnmanaged;
    this.resetSound();
  },

  resetSound() {
    this.sound = this._carrySound ? { muted: true, volume: null } : null;
  },

  videoControlsEnabled() {
    return this.settings[this._settingKey];
  },

  defaultLevel() {
    return this.settings.defaultVolume / 100;
  },

  runPasses() {
    if (this.videoControlsEnabled()) {
      this._videoActive = true;
      // Published for media-guard.js (MAIN world): the level to pin videos the
      // debounced pass has not picked up yet. Written only on change — this
      // runs every pass, and the platforms observe <html>.
      const html = document.documentElement.dataset;
      const level = this._pinUnmanaged() ? String(this.defaultLevel()) : undefined;
      if (html.tarDefaultVolume !== level) {
        if (level === undefined) delete html.tarDefaultVolume;
        else html.tarDefaultVolume = level;
      }
    } else if (this._videoActive) {
      this._videoActive = false;
      this.resetSound();
      try { TAR.teardownVideoControls(); } catch (e) {}
      try { if (this._teardown) this._teardown(); } catch (e) {}
    }
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
  window.addEventListener('resize', () => TAR.schedule(), { passive: true });
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in DEFAULTS) TAR.settings[key] = newValue;
  }
  // A new default volume applies to the videos already on the page too, not
  // only to ones that appear later.
  if ('defaultVolume' in changes) {
    if (TAR.sound) TAR.sound.volume = null;
    for (const video of document.querySelectorAll('video')) {
      if (video.dataset.controlsEnabled === 'true') TAR.setLevel(video, TAR.defaultLevel());
    }
  }
  TAR.runPasses();
});

// Inject a <style> with the given id once; no-op if it already exists.
TAR.ensureStyle = function (id, css) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
};

// Hide the platform's own mute toggle — native controls already provide one.
// The label differs by surface: logged-out uses svg[aria-label], logged-in puts
// it in an inner <title>, and FB may label the role="button" itself (bare svg).
// We hide that button via an injected !important class so a platform
// hover/re-render that sets an inline display can't bring it back, and re-tag
// every pass in case React swaps the node.
// `groups` limits the scan to those player groups (a site that manages only
// some of its videos passes theirs).
TAR.hidePlatformMuteButtons = function (groups = null) {
  TAR.ensureStyle('tar-mute-style', '.tar-hide-mute{display:none !important;}');
  // The platform mute button lives inside the Video player group on all three
  // sites. Scan only those groups' svgs (a page has hundreds of icons and this
  // runs every 300ms); fall back to a full-page scan on older DOM without them.
  if (groups) {
    if (!groups.length) return;
  } else {
    groups = document.querySelectorAll('div[aria-label="Video player"]');
  }
  const svgs = groups.length
    ? Array.from(groups, (g) => g.querySelectorAll('svg')).flatMap((n) => Array.from(n))
    : document.querySelectorAll('svg');
  for (const svg of svgs) {
    const title = svg.querySelector('title');
    let label = svg.getAttribute('aria-label') || (title && title.textContent);
    // closest() only when needed: this runs for every icon in every player.
    let button = null;
    if (!label) {
      button = svg.closest('div[role="button"]');
      label = button && button.getAttribute('aria-label');
    }
    if (!/靜音|mute/i.test(label || '')) continue;
    button = button || svg.closest('div[role="button"]');
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

// Install once: on pointer move, for every native-controlled video, call the
// callback with (video, inside) where inside is whether the pointer is over the
// video. The callback fires on every throttled tick (not just on enter/leave
// transitions), so it must track its own enter/exit state. Each site registers
// exactly one callback (one site per page), so a single once-guard suffices.
let hoverWatcherInstalled = false;
TAR.watchHover = function (callback) {
  if (hoverWatcherInstalled) return;
  hoverWatcherInstalled = true;
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
      callback(video, inside);
    }
  }, { capture: true });
};

// Single shared fullscreen handler (installed once at module load). Per-video
// listeners on document would accumulate and pin detached videos in their
// closures for the life of the session.
let fullscreenVideo = null;
const onFullscreenChange = () => {
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  if (fullscreenVideo && fullscreenVideo !== fs) {
    fullscreenVideo.style.objectFit = 'cover';
    fullscreenVideo = null;
  }
  if (fs && fs.tagName === 'VIDEO' && fs.dataset.controlsEnabled === 'true') {
    fullscreenVideo = fs;
    fs.style.objectFit = 'contain';
  }
};
document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

// Per-video sound bookkeeping, only read here in the isolated world (the MAIN
// world sees just the dataset keys controlsEnabled, desiredVolume and
// tarJsMuteAt). prevMuted: the muted state as of the last volumechange
// handled; seekAt/playAt/unmuteAt/selfAt: when a seek, a play, an unmute or an
// extension-side write last happened (ms).
const soundState = (video) => video._tarSound || (video._tarSound = {
  prevMuted: video.muted, seekAt: 0, playAt: 0, unmuteAt: 0, selfAt: 0
});

// Where the latest `muted` flip came from. media-guard.js stamps every page-JS
// (platform) write and markSelfWrite the extension's own; a flip with neither
// stamp came from the browser's native control bar — the user.
TAR.mutedChangeOrigin = function (video) {
  const now = Date.now();
  if (now - soundState(video).selfAt < 150) return 'self';
  if (now - Number(video.dataset.tarJsMuteAt || 0) < 150) return 'platform';
  return 'user';
};

// Stamp an extension-side `muted` write so the flip is not read as the user's.
TAR.markSelfWrite = function (video) {
  soundState(video).selfAt = Date.now();
};

// Set the level a video should hold (media-guard pins platform writes to it).
TAR.setLevel = function (video, level) {
  video.dataset.desiredVolume = String(level);
  video.volume = level;
};

// Whether at least half of the video is inside the viewport.
TAR.onScreen = function (video) {
  const r = video.getBoundingClientRect();
  const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
  const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
  return w > 0 && h > 0 && w * h >= r.width * r.height * 0.5;
};

// carrySound sites: put the page-wide sound state on a clip — muted or not as
// the user last chose, at their last level.
TAR.applyCarriedSound = function (video) {
  const state = soundState(video);
  TAR.setLevel(video, TAR.sound.volume ?? TAR.defaultLevel());
  TAR.markSelfWrite(video);
  video.muted = TAR.sound.muted;
  state.prevMuted = video.muted;
  if (!video.muted) state.unmuteAt = Date.now();
};

// Whether a clip should take the carried state now. A carried mute goes on any
// clip at once — muting never doubles up audio — including one that starts
// playing while still sliding in (Reels start the next clip mid-transition). A
// carried unmute only goes on a clip playing on screen, so a preloaded one
// never sounds in the background; one that starts off screen gets it from
// carryObserver as it scrolls in.
TAR.wantsCarriedSound = function (video) {
  if (!TAR.sound || video.muted === TAR.sound.muted) return false;
  return TAR.sound.muted || (!video.paused && TAR.onScreen(video));
};

let carryObserver = null;
function observeCarry(video) {
  if (!carryObserver) {
    carryObserver = new IntersectionObserver((entries) => {
      for (const { target, intersectionRatio } of entries) {
        if (intersectionRatio >= 0.5 && target.dataset.controlsEnabled === 'true' &&
            TAR.wantsCarriedSound(target)) TAR.applyCarriedSound(target);
      }
    }, { threshold: 0.5 });
  }
  carryObserver.observe(video);
}

TAR.enableNativeControls = function (video) {
  video.controls = true;
  if (video.dataset.controlsEnabled === 'true') return;
  video.dataset.controlsEnabled = 'true';
  video.style.objectFit = 'cover';
  video._tarSound = null; // fresh bookkeeping, also after a live toggle-off/on
  TAR.setLevel(video, TAR.defaultLevel());
  if (TAR.sound) {
    observeCarry(video);
    if (TAR.wantsCarriedSound(video)) TAR.applyCarriedSound(video);
  }

  // Listeners go on once per element: a live toggle-off (teardown) resets the
  // state above, and a later re-enable must not stack duplicates.
  if (video._tarListeners) return;
  video._tarListeners = true;

  video.addEventListener('seeking', () => { soundState(video).seekAt = Date.now(); });

  // Keep the sound behaving predictably against the platform, which likes to
  // force muted=true / volume=100% (e.g. on unmute, after a native seek, or on
  // resume). "desiredVolume" is the level to hold: the default, a carried or
  // changed default level, or the user's latest slider drag. Per-video,
  // transient — a brand new clip still starts muted at the default, so nothing
  // is remembered across clips — unless the site carries sound (TAR.sound), in
  // which case each clip picks up the page-wide state (see wantsCarriedSound).
  const restoreSound = () => {
    soundState(video).unmuteAt = Date.now();
    TAR.markSelfWrite(video);
    video.muted = false;
    video.volume = Number(video.dataset.desiredVolume);
  };

  // IG/FB keep their own mute state, which stays "muted" because their mute
  // button is hidden and the user unmuted through the native bar — so every
  // play (resume after pause, scroll back into view) they force muted=true
  // again. They mute before the play event reaches us, while prevMuted still
  // records that the user had sound; undo it here. unmuteAt proves the clip was
  // unmuted at some point — a fresh element can start muted=false and get muted
  // by the platform right before its first (muted) autoplay.
  const hadSound = () => !soundState(video).prevMuted && soundState(video).unmuteAt > 0;
  video.addEventListener('play', () => {
    if (video.dataset.controlsEnabled !== 'true') return;
    soundState(video).playAt = Date.now();
    if (TAR.sound) {
      if (TAR.wantsCarriedSound(video)) TAR.applyCarriedSound(video);
    } else if (video.muted && hadSound()) {
      restoreSound();
    }
  });

  video.addEventListener('volumechange', () => {
    if (video.dataset.controlsEnabled !== 'true') return;
    const state = soundState(video);
    const desired = Number(video.dataset.desiredVolume);
    const offDesired = Math.abs(video.volume - desired) > 0.005;
    const now = Date.now();

    if (TAR.sound && video.muted !== state.prevMuted) {
      const origin = TAR.mutedChangeOrigin(video);
      if (origin === 'user') {
        // The user's own mute/unmute sets the state the next clips carry.
        TAR.sound.muted = video.muted;
      } else if (origin === 'platform' && TAR.wantsCarriedSound(video)) {
        TAR.applyCarriedSound(video);
        return;
      }
    }

    if (video.muted) {
      // A native-control seek or a resume makes the platform re-mute; undo it
      // to keep sound.
      if ((!state.prevMuted && now - state.seekAt < 1000) ||
          (hadSound() && now - state.playAt < 500)) {
        restoreSound();
      } else if (offDesired) {
        // The platform keeps forcing volume=1.0 while muted; pin it to the
        // desired level NOW so the instant of unmuting never plays at 100%
        // (the volumechange event fires async, after audio already output).
        TAR.setLevel(video, desired);
      }
    } else if (state.prevMuted) {
      // Just unmuted (user click, or platform after a seek): the platform tends
      // to jump volume to 100%, so pin it back to the user's desired level.
      state.unmuteAt = now;
      if (offDesired) TAR.setLevel(video, desired);
    } else if (now - state.unmuteAt < 600) {
      // Platform's delayed volume bump right after an unmute → pin to desired.
      if (offDesired) TAR.setLevel(video, desired);
    } else if (offDesired) {
      // Genuine user slider drag → remember it as the new desired volume (and,
      // on carrySound sites, the level the next clips start at).
      video.dataset.desiredVolume = String(video.volume);
      if (TAR.sound) TAR.sound.volume = video.volume;
    }
    state.prevMuted = video.muted;
  });
};

TAR.disableNativeControls = function (video) {
  if (video.controls === true) video.controls = false;
};

// The site's toggle was switched off live: hand every video and the shared
// DOM tweaks back to the platform. Dropping desiredVolume/tarDefaultVolume also
// releases the MAIN-world guards; the per-video listeners stay but go inert.
TAR.teardownVideoControls = function () {
  delete document.documentElement.dataset.tarDefaultVolume;
  for (const video of document.querySelectorAll('video')) {
    if (video.dataset.controlsEnabled !== 'true') continue;
    video.controls = false;
    video._tarSound = null;
    for (const key of ['controlsEnabled', 'desiredVolume', 'tarJsMuteAt']) delete video.dataset[key];
  }
  for (const el of document.querySelectorAll('.tar-hide-mute')) el.classList.remove('tar-hide-mute');
  for (const slider of document.querySelectorAll('div[role="slider"][data-seek-hidden="true"]')) {
    slider.style.display = '';
    delete slider.dataset.seekHidden;
  }
};

// The platform's own seek/progress slider: a div[role="slider"] whose label
// (left untranslated by the platforms) names it a position control.
TAR.isSeekSlider = function (slider) {
  return /position/i.test(slider.getAttribute('aria-label') || '');
};

// Hide the platform's own seek/progress slider — the native control bar already
// provides one, so it would otherwise sit on top of it. Search up to 12 levels
// up from the video for it.
TAR.hideSeekSliderNear = function (video) {
  let ancestor = video.parentElement;
  for (let i = 0; i < 12 && ancestor; i++) {
    for (const slider of ancestor.querySelectorAll('div[role="slider"]')) {
      if (slider.dataset.seekHidden === 'true' || !TAR.isSeekSlider(slider)) continue;
      slider.dataset.seekHidden = 'true';
      slider.style.display = 'none';
      return;
    }
    ancestor = ancestor.parentElement;
  }
};
