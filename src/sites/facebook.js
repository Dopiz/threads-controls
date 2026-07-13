// FB draws its overlay chrome (caption/owner info, bottom-anchored) inside a
// div[aria-label="Video player"] that covers the whole video. We shrink that
// chrome by the height of the native control bar (via the .tar-fb-chrome class)
// so the caption shifts up above the controls, and gate its visibility on hover:
// when the pointer is off the video the whole chrome group is hidden for a clean
// frame; on hover the shrunken chrome and the native control bar appear together.
// A ::after tail fades the caption's black gradient out over the freed 60px so
// no hard cut line shows without darkening the control bar itself. The chrome
// is forced pointer-events:none so hovering anywhere on the video keeps the
// native controls up — FB's interactive children (follow, see-more) re-enable
// pointer-events explicitly, so they stay clickable. Idempotent; re-asserted
// every pass in case React re-renders the node. The chrome fades in/out in step
// with the native controls so the two transitions share the same rhythm.
const FB_STYLE = [
  '.tar-fb-chrome { height: calc(100% - 60px) !important; visibility: hidden; opacity: 0; transition: opacity 0.3s ease, visibility 0.3s; pointer-events: none !important; }',
  '.tar-fb-chrome.tar-fb-show { visibility: visible; opacity: 1; transition: opacity 0.1s ease, visibility 0.1s; }',
  '.tar-fb-chrome.tar-fb-show a[role="link"], .tar-fb-chrome.tar-fb-show div[role="button"] { pointer-events: auto; }',
  '.tar-fb-chrome::after { content: \'\'; position: absolute; left: 0; right: 0;',
  '  bottom: -60px; height: 60px; pointer-events: none;',
  '  background: linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0)); }'
].join('\n');

function injectStyle() {
  if (document.getElementById('tar-fb-style')) return;
  const style = document.createElement('style');
  style.id = 'tar-fb-style';
  style.textContent = FB_STYLE;
  (document.head || document.documentElement).appendChild(style);
}

// Install once: while the pointer is over a native-controlled FB video, reveal
// its (shrunken) chrome group so caption + native controls show together; hide
// again on leave. The native controls also auto-hide after ~3s of pointer
// idle while playing (browser-internal, unreadable), so mirror that with our
// own idle timer — the next mousemove brings the chrome straight back. React
// may swap the nodes, so re-find on every enter; operating on a detached node
// is harmless.
let hoverInstalled = false;
function installHover() {
  if (hoverInstalled) return;
  hoverInstalled = true;
  let lastMove = 0;
  let idleTimer = null;
  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastMove < 80) return;
    lastMove = now;
    for (const video of document.querySelectorAll('video')) {
      if (video.controls !== true || video.dataset.controlsEnabled !== 'true') continue;
      const rect = video.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (inside) {
        const chrome = TAR.findPlayerChrome(video);
        for (const el of chrome) el.classList.add('tar-fb-show');
        video._tarFbChrome = chrome;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          // Native controls fade out when the pointer idles on a playing
          // video (they stay up while paused) — hide the chrome in step.
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
  }, { capture: true });
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  injectStyle();
  installHover();
  TAR.hidePlatformMuteButtons();
  for (const video of document.querySelectorAll('video')) {
    if (video.getBoundingClientRect().width === 0) continue;
    // Chrome shows/hides with the native control bar on hover — opt out of
    // common.js's hover chrome-hide.
    video.dataset.tarKeepChrome = '1';
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
