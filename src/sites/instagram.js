function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.hidePlatformMuteButtons();
  for (const video of document.querySelectorAll('video')) {
    if (video.getBoundingClientRect().width === 0) continue;
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
  }
}

TAR.register({
  settingKey: 'videoControlsInstagram',
  passes: [videoPass]
});
