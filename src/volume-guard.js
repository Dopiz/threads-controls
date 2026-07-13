// Runs in the page's MAIN world at document_start. The platform's JS keeps
// force-setting the volume on managed videos: 1.0 while muted / around unmute
// (in the same synchronous batch as unmuting when auto-advancing reels, so our
// async volumechange handler corrected it only after ~0.1s of audio at 100%),
// and its own remembered level (e.g. 0.5) on reel navigation, which our
// handler then mistook for a user slider drag and adopted as the new desired
// volume.
//
// The native control bar's volume slider does NOT go through this JS setter —
// the browser sets the value internally — so every write that arrives here is
// platform JS. For videos the extension manages (dataset.desiredVolume
// present), rewrite any off-desired value to the desired level synchronously;
// the audio pipeline never sees the forced value. The extension's own writes
// happen in the isolated world with its own prototype, bypassing this guard.
(() => {
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  if (!desc) return;
  Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
    get: desc.get,
    set(value) {
      const desired = this.dataset ? parseFloat(this.dataset.desiredVolume) : NaN;
      if (!isNaN(desired) && Math.abs(value - desired) > 0.005) value = desired;
      desc.set.call(this, value);
    },
    configurable: true
  });
})();
