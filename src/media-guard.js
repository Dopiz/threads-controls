// MAIN world, document_start. Guards that must run synchronously inside the
// platform's own media calls — an isolated-world event handler only reacts
// after the fact, when the audio is already out or the video already stopped.
// Every call reaching these wrappers is platform JS: the native control bar is
// browser-internal, and the extension writes from the isolated world (its own
// prototypes). A video is "managed" once the extension set data-controls-enabled.
(() => {
  const proto = HTMLMediaElement.prototype;
  const volumeDesc = Object.getOwnPropertyDescriptor(proto, 'volume');
  const mutedDesc = Object.getOwnPropertyDescriptor(proto, 'muted');
  if (!volumeDesc || !mutedDesc) return;
  const nativePlay = proto.play;
  const nativePause = proto.pause;

  const isVideo = (el) => el instanceof HTMLVideoElement;
  const managed = (el) => el.dataset && el.dataset.controlsEnabled === 'true';

  // The level a video should play at: its own desired level once managed;
  // before that, the page default the extension publishes on <html> while the
  // site's controls are on (absent when off, so nothing is touched).
  const levelFor = (el) => {
    const desired = el.dataset ? parseFloat(el.dataset.desiredVolume) : NaN;
    if (!isNaN(desired)) return desired;
    if (!isVideo(el)) return NaN;
    return parseFloat(document.documentElement.dataset.tarDefaultVolume);
  };

  // 1. Volume: the platform force-sets volume (often 100%) in the same batch as
  //    unmuting; rewrite any off-level value. This also covers a freshly
  //    swapped-in <video> the extension's debounced pass hasn't picked up yet
  //    (~300ms at 100% otherwise — the burst when FB swaps players on unmute).
  const pin = (el) => {
    const level = levelFor(el);
    if (!isNaN(level) && Math.abs(volumeDesc.get.call(el) - level) > 0.005) volumeDesc.set.call(el, level);
  };
  Object.defineProperty(proto, 'volume', {
    get: volumeDesc.get,
    set(value) {
      const level = levelFor(this);
      if (!isNaN(level) && Math.abs(value - level) > 0.005) value = level;
      volumeDesc.set.call(this, value);
    },
    configurable: true
  });
  // An element never written to starts at 100%: pin before it becomes audible.
  // Each actual flip is also stamped (data-tar-js-mute-at) so the extension can
  // tell a platform mute/unmute from the user's own click on the native bar,
  // which never passes through here. No-op writes are not stamped: the platform
  // re-asserts muted=true all the time, and a stamp from one of those must not
  // swallow the user's unmute right after.
  Object.defineProperty(proto, 'muted', {
    get: mutedDesc.get,
    set(value) {
      if (!value) pin(this);
      if (isVideo(this) && !!value !== mutedDesc.get.call(this)) {
        this.dataset.tarJsMuteAt = String(Date.now());
      }
      mutedDesc.set.call(this, value);
    },
    configurable: true
  });

  // 2. Pause right after a native play: the platform's player state machine
  //    may still hold "paused" (e.g. Threads post-page videos it never
  //    autoplayed) and answers the play event by pausing again, so the native
  //    play button seems dead. A play with no JS play() call just before it came
  //    from the native bar (or media keys); ignore platform pause() calls on that
  //    video for a moment afterwards.
  proto.play = function () {
    this.__tarJsPlayAt = performance.now();
    pin(this);
    return nativePlay.apply(this, arguments);
  };
  proto.pause = function () {
    if (managed(this) && performance.now() - (this.__tarUserPlayAt || -Infinity) < 300) return;
    return nativePause.apply(this, arguments);
  };
  // Capture on window runs before any platform listener on the video.
  window.addEventListener('play', (e) => {
    const el = e.target;
    if (!isVideo(el)) return;
    pin(el);
    if (managed(el) && performance.now() - (el.__tarJsPlayAt || -Infinity) > 100) {
      el.__tarUserPlayAt = performance.now();
    }
  }, true);
})();
