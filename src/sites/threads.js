function revealSpoilerText() {
  if (!TAR.settings.revealText) return;
  const buttons = document.querySelectorAll('div[role="button"]');

  // Strategy 1 (legacy DOM): outer button carries the grey background mask
  for (const button of buttons) {
    if (button.dataset.spoilerRevealed === 'true') continue;
    const style = getComputedStyle(button);
    if (style.display !== 'inline') continue;
    if (!button.closest('span[dir="auto"]')) continue;
    if (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') continue;

    const spoilerSpan = button.querySelector('span[data-text-fragment="spoiler"]');
    const innerSpan = spoilerSpan
      ? spoilerSpan.querySelector('span')
      : button.querySelector(':scope > div > span');
    if (!innerSpan) continue;

    button.dataset.spoilerRevealed = 'true';
    swapSpoiler(button, innerSpan);
  }

  // Strategy 2 (newer DOM): outer button has transparent bg; anchor on data-text-fragment
  for (const spoilerSpan of document.querySelectorAll('span[data-text-fragment="spoiler"]')) {
    if (spoilerSpan.dataset.spoilerRevealed === 'true') continue;
    if (!spoilerSpan.closest('span[dir="auto"]')) continue;

    const innerSpan = spoilerSpan.querySelector('span');
    if (!innerSpan) continue;

    const target = spoilerSpan.closest('[role="button"]') || spoilerSpan;
    spoilerSpan.dataset.spoilerRevealed = 'true';
    swapSpoiler(target, innerSpan);
  }
}

function swapSpoiler(target, innerSpan) {
  try {
    const revealed = innerSpan.cloneNode(true);
    if (TAR.settings.textHighlight) {
      revealed.style.backgroundColor = TAR.settings.textHighlight;
      revealed.style.borderRadius = '4px';
      revealed.style.padding = '0 2px';
    }
    // Newer Threads paints the particle/grain effect via a sibling <canvas>; remove it too
    let node = target.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const canvases = node.querySelectorAll(':scope > canvas');
      if (canvases.length) {
        canvases.forEach(c => c.remove());
        break;
      }
      node = node.parentElement;
    }
    target.parentNode.replaceChild(revealed, target);
  } catch (e) {}
}

function revealSpoilerMedia() {
  if (!TAR.settings.revealMedia) return;
  for (const button of document.querySelectorAll('div[role="button"]')) {
    if (button.dataset.spoilerMediaRevealed === 'true') continue;
    if (!button.querySelector('picture, img, video')) continue;
    if (!button.querySelector('div[style*="--x-opacity"]')) continue;

    button.dataset.spoilerMediaRevealed = 'true';
    try { button.click(); } catch (e) {}
  }
}

// Threads-only: is this video a thumbnail inside a multi-media carousel? Walk up
// to 16 levels (the carousel strip sits ~14 levels above the video); at each
// level, if the parent has >=2 children, count children whose subtree contains
// a video/picture and whose rect vertically overlaps the video by >50% of its
// height (i.e. sits in the same row). >=2 such => carousel.
function isInCarousel(video) {
  const videoRect = video.getBoundingClientRect();
  let node = video.parentElement;
  for (let i = 0; i < 16 && node && node !== document.body; i++, node = node.parentElement) {
    const parent = node.parentElement;
    if (!parent) continue;
    const children = parent.children;
    if (children.length < 2) continue;
    let count = 0;
    for (const child of children) {
      if (!child.querySelector('video, picture') && child.tagName !== 'VIDEO' && child.tagName !== 'PICTURE') continue;
      const rect = child.getBoundingClientRect();
      const overlapH = Math.min(rect.bottom, videoRect.bottom) - Math.max(rect.top, videoRect.top);
      if (overlapH > videoRect.height * 0.5) count++;
    }
    if (count >= 2) return true;
  }
  return false;
}

// Carousel thumbnails keep the platform overlay visible and interactive (it
// carries the drag gesture), so the native control bar underneath would be
// unreachable. Clip only the strip of each covering overlay that sits over the
// control bar — hover/click near the bottom edge reaches the controls while
// the rest of the overlay keeps working. Re-run when the video is re-laid-out.
function clipControlBarStrip(video) {
  const rect = video.getBoundingClientRect();
  const sig = Math.round(rect.width) + 'x' + Math.round(rect.height);
  if (video.dataset.clipSig === sig) return;
  const cx = rect.left + rect.width / 2;
  const barY = rect.bottom - 15;
  if (cx < 0 || cx > window.innerWidth || barY < 0 || barY > window.innerHeight) return;
  // On narrow videos Chrome lays the controls out as two rows (buttons row
  // above the timeline), together ~60px tall — the strip must cover both or
  // moving from the timeline up to a button loses hover and hides the bar.
  const stripTop = rect.bottom - 60;
  for (const el of document.elementsFromPoint(cx, barY)) {
    if (el === video || el.tagName === 'VIDEO' || el.contains(video)) break;
    const clipBottom = el.getBoundingClientRect().bottom - stripTop;
    if (clipBottom > 0) el.style.clipPath = 'inset(0 0 ' + Math.ceil(clipBottom) + 'px 0)';
  }
  video.dataset.clipSig = sig;
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.hidePlatformMuteButtons();
  for (const video of document.querySelectorAll('video')) {
    const rect = video.getBoundingClientRect();
    if (rect.width === 0) continue;
    const mainPlayer = rect.height > window.innerHeight * 0.5;
    if (mainPlayer) {
      // Lightbox / full-screen media viewer: keep the platform chrome
      // interactive; the control bar is reachable via the clipped bottom strip.
      video.dataset.tarKeepChrome = '1';
      TAR.enableNativeControls(video);
      TAR.hideSeekSliderNear(video);
      clipControlBarStrip(video);
      continue;
    }
    if (isInCarousel(video)) {
      // Multi-media carousel thumbnail: controls on, but the platform chrome
      // stays visible/interactive so dragging keeps working; the control bar
      // is reachable via the clipped bottom strip.
      video.dataset.tarKeepChrome = '1';
      TAR.enableNativeControls(video);
      TAR.hideSeekSliderNear(video);
      clipControlBarStrip(video);
      continue;
    }
    // Single-video post: full hover-hide experience via the common watcher.
    if (video.dataset.tarKeepChrome) delete video.dataset.tarKeepChrome;
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
  }
}

TAR.register({
  settingKey: 'videoControlsThreads',
  passes: [revealSpoilerText, revealSpoilerMedia, videoPass]
});
