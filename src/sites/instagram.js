// IG's Video player overlay chrome is hidden outright — the native controls
// replace it. Unlike other sites we don't do hover-to-reveal here: hide the
// chrome groups directly via an injected style + a re-tagged class each pass.
// Sound carries from clip to clip (carrySound): scrolling Reels/the feed keeps
// the user's last mute/unmute and level, like IG's own player does.

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

function teardown() {
  for (const el of document.querySelectorAll('.tar-ig-chrome')) el.classList.remove('tar-ig-chrome');
}

TAR.register({
  settingKey: 'videoControlsInstagram',
  passes: [videoPass],
  teardown,
  carrySound: true
});
