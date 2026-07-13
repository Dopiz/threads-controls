// FB's chrome (div[aria-label="Video player"], caption bottom-anchored) covers
// the whole video. It is shrunken 60px so the caption sits above the native
// control bar, shown/hidden together with the controls on hover, and forced
// pointer-events:none so hovering anywhere on the video keeps the controls up
// (interactive children get pointer-events re-enabled below). The ::after tail
// fades the caption's black gradient out over the freed strip — without it a
// hard cut line shows.
const FB_STYLE = [
  '.tar-fb-chrome { height: calc(100% - 60px) !important; visibility: hidden; opacity: 0; transition: opacity 0.3s ease, visibility 0.3s; pointer-events: none !important; }',
  '.tar-fb-chrome.tar-fb-show { visibility: visible; opacity: 1; transition: opacity 0.1s ease, visibility 0.1s; }',
  '.tar-fb-chrome.tar-fb-show a[role="link"], .tar-fb-chrome.tar-fb-show div[role="button"] { pointer-events: auto; }',
  '.tar-fb-chrome::after { content: \'\'; position: absolute; left: 0; right: 0;',
  '  bottom: -60px; height: 60px; pointer-events: none;',
  '  background: linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0)); }'
].join('\n');

// The native controls auto-hide after ~3s of pointer idle while playing
// (browser-internal, unreadable), so an own idle timer mirrors that. React may
// swap the chrome nodes: re-find on enter, stale-node ops are harmless. Fires
// every throttled tick, so the find+add only runs on the enter transition; an
// idle mirror hides the chrome when the pointer idles on a playing video.
let idleTimer = null;
function fbHoverChrome(video, inside) {
  if (inside) {
    if (!video._tarFbChrome) {
      const chrome = TAR.findPlayerChrome(video);
      for (const el of chrome) el.classList.add('tar-fb-show');
      video._tarFbChrome = chrome;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!video.paused && video._tarFbChrome) {
        for (const el of video._tarFbChrome) el.classList.remove('tar-fb-show');
        video._tarFbChrome = null;
      }
    }, 2600);
  } else if (video._tarFbChrome) {
    for (const el of video._tarFbChrome) el.classList.remove('tar-fb-show');
    video._tarFbChrome = null;
  }
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.ensureStyle('tar-fb-style', FB_STYLE);
  TAR.watchHover(fbHoverChrome);
  TAR.hidePlatformMuteButtons();
  for (const video of document.querySelectorAll('video')) {
    if (video.getBoundingClientRect().width === 0) continue;
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
    // Re-run each pass to catch React-replaced nodes; classList.add is idempotent.
    for (const chrome of TAR.findPlayerChrome(video)) {
      chrome.classList.add('tar-fb-chrome');
    }
  }
}

TAR.register({
  settingKey: 'videoControlsFacebook',
  passes: [videoPass]
});
