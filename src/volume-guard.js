// MAIN world, document_start. The platform's JS force-sets volume on managed
// videos in the same synchronous batch as unmuting, so an async volumechange
// handler always loses the race (~0.1s of audio at the wrong level). Every
// write arriving at this setter is platform JS — the native control bar's
// slider is browser-internal and the extension writes from the isolated world
// (own prototype) — so any off-desired value on a managed video
// (dataset.desiredVolume present) is rewritten synchronously.
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
