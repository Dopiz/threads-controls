// FB draws its overlay chrome (caption/owner info, bottom-anchored) inside a
// div[aria-label="Video player"] that covers the whole video. Instead of
// hiding it on hover, shrink it by the height of the native control bar — the
// caption shifts up and stays visible while the controls underneath remain
// permanently reachable. Idempotent; re-asserted every pass in case React
// re-renders the node.
const CONTROL_BAR_SPACE = '60px';

function shrinkPlayerChrome(video) {
  for (const chrome of TAR.findPlayerChrome(video)) {
    if (chrome.style.height !== 'calc(100% - ' + CONTROL_BAR_SPACE + ')') {
      chrome.style.height = 'calc(100% - ' + CONTROL_BAR_SPACE + ')';
    }
  }
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.hidePlatformMuteButtons();
  for (const video of document.querySelectorAll('video')) {
    if (video.getBoundingClientRect().width === 0) continue;
    // Chrome stays visible (shrunken above the control bar) — opt out of the
    // hover chrome-hide.
    video.dataset.tarKeepChrome = '1';
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
    shrinkPlayerChrome(video);
  }
}

TAR.register({
  settingKey: 'videoControlsFacebook',
  passes: [videoPass]
});
