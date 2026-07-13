// IG's Video player overlay chrome is hidden outright — the native controls
// replace it. Unlike other sites we don't do hover-to-reveal here: hide the
// chrome groups directly via an injected style + a re-tagged class each pass.

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.ensureStyle('tar-ig-style', '.tar-ig-chrome { display: none !important; }');
  TAR.hidePlatformMuteButtons();
  for (const video of document.querySelectorAll('video')) {
    if (video.getBoundingClientRect().width === 0) continue;
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
