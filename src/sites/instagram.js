// IG's Video player overlay chrome is hidden outright — the native controls
// replace it. Unlike other sites we don't do hover-to-reveal here: opt each
// video out of common.js's hover watcher (tarKeepChrome) and hide the chrome
// groups directly via an injected style + a re-tagged class each pass.

function injectStyle() {
  if (document.getElementById('tar-ig-style')) return;
  const style = document.createElement('style');
  style.id = 'tar-ig-style';
  style.textContent = '.tar-ig-chrome { display: none !important; }';
  (document.head || document.documentElement).appendChild(style);
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  injectStyle();
  TAR.hidePlatformMuteButtons();
  for (const video of document.querySelectorAll('video')) {
    if (video.getBoundingClientRect().width === 0) continue;
    video.dataset.tarKeepChrome = '1';
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
    for (const chrome of TAR.findPlayerChrome(video)) {
      chrome.classList.add('tar-ig-chrome');
    }
  }
}

TAR.register({
  settingKey: 'videoControlsInstagram',
  passes: [videoPass]
});
