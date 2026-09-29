// FB's chrome (div[aria-label="Video player"], caption bottom-anchored) covers
// the whole video. It is shrunken 60px so the caption sits above the native
// control bar, shown/hidden together with the controls on hover, and forced
// pointer-events:none so hovering anywhere on the video keeps the controls up
// (interactive children get pointer-events re-enabled below). The ::after tail
// fades the caption's black gradient out over the freed strip — without it a
// hard cut line shows — only on larger players: on small ones (the feed's
// Reels cards) the tail reads as a dark box under the bar, so it is dropped.
// FB's own control row inside the chrome is hidden outright: it fades itself
// out while playing but stays clickable, and comes back when paused, stacking
// a second control bar on top of the native one.
const FB_STYLE = [
  '.tar-fb-bar { display: none !important; }',
  '.tar-fb-chrome { height: calc(100% - 60px) !important; visibility: hidden; opacity: 0; transition: opacity 0.3s ease, visibility 0.3s; pointer-events: none !important; }',
  '.tar-fb-chrome.tar-fb-show { visibility: visible; opacity: 1; transition: opacity 0.1s ease, visibility 0.1s; }',
  '.tar-fb-chrome.tar-fb-show a[role="link"], .tar-fb-chrome.tar-fb-show div[role="button"] { pointer-events: auto; }',
  '.tar-fb-chrome::after { content: \'\'; position: absolute; left: 0; right: 0;',
  '  bottom: -60px; height: 60px; pointer-events: none;',
  '  background: linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0)); }',
  '.tar-fb-chrome.tar-fb-compact::after { content: none; }',
  // Small player at rest (paused, pointer away): FB's own look — its overlay,
  // thumbnail included, over the whole video. See restChrome below.
  '.tar-fb-chrome.tar-fb-compact.tar-fb-rest { height: 100% !important; visibility: visible; opacity: 1; transition: none; }',
  // Reel viewer (see layoutReel below).
  '.tar-fb-reel-card { overflow: visible !important; }',
  '.tar-fb-reel-card [data-tar-reel-caption] { top: auto !important; left: auto !important; bottom: 0 !important;',
  '  right: calc(100% + 24px) !important; width: 320px !important; background: none !important; }',
  '.tar-fb-reel-inset [data-tar-reel-caption] { bottom: 60px !important; }',
  '.tar-fb-reel-hide { display: none !important; }',
  '[data-tar-reel-overlay] { pointer-events: none !important; }',
  '[data-tar-reel-overlay] :is(a, [role="button"], [role="link"]) { pointer-events: auto; }'
].join('\n');

// Below this video width the player counts as small (no gradient tail).
const FB_COMPACT_WIDTH = 400;

// The native controls auto-hide after ~3s of pointer idle while playing
// (browser-internal, unreadable), so an own idle timer mirrors that. React may
// swap the chrome nodes: re-find on enter, stale-node ops are harmless. Fires
// every throttled tick, so the find+add only runs on the enter transition; an
// idle mirror hides the chrome when the pointer idles on a playing video.
let idleTimer = null;
function fbHoverChrome(video, inside) {
  if (video._tarFbHover !== inside) {
    video._tarFbHover = inside;
    restChrome(video);
  }
  if (inside) {
    if (!video._tarFbChrome) {
      const chrome = TAR.findPlayerChrome(video);
      for (const el of chrome) el.classList.add('tar-fb-show');
      video._tarFbChrome = chrome;
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
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

// Small players (the feed's Reels cards) play on hover and, on leave, pause
// and show a fixed thumbnail inside the chrome. Fading the chrome out with the
// pointer flashed that thumbnail away onto the last frame, so a small player
// at rest (paused, pointer away) keeps its whole chrome up, as FB shows it.
function restChrome(video) {
  const rest = video.paused && !video._tarFbHover;
  for (const chrome of TAR.findPlayerChrome(video)) {
    chrome.classList.toggle('tar-fb-rest', rest && chrome.classList.contains('tar-fb-compact'));
  }
}

// FB's control row (play, time, settings, fullscreen, volume) is the nearest
// ancestor of its seek slider that also holds several buttons. Labels are
// localized, so anchor on the slider's untranslated "position" label; the
// height cap keeps a mismatch from hiding the caption/owner block.
// Runs every pass for every player, so it stops once the row is tagged.
function hideFbControlRow(chrome) {
  if (chrome.querySelector('.tar-fb-bar')) return;
  for (const slider of chrome.querySelectorAll('div[role="slider"]')) {
    if (!TAR.isSeekSlider(slider)) continue;
    let row = slider.parentElement;
    while (row && row !== chrome && row.querySelectorAll('div[role="button"]').length < 2) {
      row = row.parentElement;
    }
    if (row && row !== chrome && row.getBoundingClientRect().height <= 80) {
      row.classList.add('tar-fb-bar');
    }
  }
}

// Reel viewer (/reel/<id>): its caption block — owner, text, audio ticker, on a
// bottom gradient — lies over the bottom of the video, right where the native
// control bar is, with its own gradient and show/hide timing. Like IG's
// desktop Reels, it moves out to the left of the video instead — or, when the
// viewport leaves no room there, up by the bar's height — and FB's own
// play/pause, mute/volume and search
// buttons on the card go — the native bar covers those. The card clips its
// content for the rounded corners, so it is un-clipped and the video takes
// over the rounding. The overlay layer holding the header and caption covers
// the whole video and would swallow the hover the native bar needs, so it
// lets the pointer through (its links and buttons stay clickable). Found by
// structure (labels are localized): the card is the video's nearest
// overflow-clipping ancestor; the caption is the card's bottom-anchored
// gradient block that does not hold the video; the overlay is the caption's
// outermost ancestor that still does not hold the video.
const REEL_CAPTION_SPACE = 320 + 24 + 16;
const REEL_BUTTONS = /暫停|播放|靜音|音量|搜尋|pause|play|mute|volume|search/i;
function layoutReel(video) {
  // (A card already un-clipped by an earlier pass is recognized by its class.)
  const isCard = (el) => el.classList.contains('tar-fb-reel-card') || el.classList.contains('tar-fb-reel-inset') ||
    getComputedStyle(el).overflow === 'hidden';
  let card = video.parentElement;
  while (card && card !== document.body && !isCard(card)) card = card.parentElement;
  if (!card || card === document.body) return;
  const cardRect = card.getBoundingClientRect();
  let caption = card.querySelector('[data-tar-reel-caption]');
  if (!caption) {
    caption = Array.from(card.querySelectorAll('div')).find((el) => {
      if (el.contains(video) || !getComputedStyle(el).backgroundImage.includes('gradient')) return false;
      const r = el.getBoundingClientRect();
      return Math.abs(r.bottom - cardRect.bottom) < 2 && r.top > cardRect.top + cardRect.height / 2;
    });
    if (!caption) return;
    caption.dataset.tarReelCaption = '1';
    let overlay = caption;
    while (overlay.parentElement !== card && !overlay.parentElement.contains(video)) overlay = overlay.parentElement;
    overlay.dataset.tarReelOverlay = '1';
    video.style.borderRadius = getComputedStyle(card).borderRadius;
  }
  const room = cardRect.left >= REEL_CAPTION_SPACE;
  card.classList.toggle('tar-fb-reel-card', room);
  card.classList.toggle('tar-fb-reel-inset', !room);
  for (const el of card.querySelectorAll('div[role="button"], div[role="slider"]')) {
    if (caption.contains(el) || el.classList.contains('tar-fb-reel-hide')) continue;
    if (REEL_BUTTONS.test(el.getAttribute('aria-label') || '')) el.classList.add('tar-fb-reel-hide');
  }
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.ensureStyle('tar-fb-style', FB_STYLE);
  TAR.watchHover(fbHoverChrome);
  TAR.hidePlatformMuteButtons();
  const inReelViewer = location.pathname.startsWith('/reel/');
  for (const video of document.querySelectorAll('video')) {
    const width = video.getBoundingClientRect().width;
    if (width === 0) continue;
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
    if (inReelViewer) layoutReel(video);
    if (!video._tarFbRestListeners) {
      video._tarFbRestListeners = true;
      video.addEventListener('play', () => restChrome(video));
      video.addEventListener('pause', () => restChrome(video));
    }
    // Re-run each pass to catch React-replaced nodes; classList.add is idempotent.
    for (const chrome of TAR.findPlayerChrome(video)) {
      chrome.classList.add('tar-fb-chrome');
      chrome.classList.toggle('tar-fb-compact', width < FB_COMPACT_WIDTH);
      chrome.classList.toggle('tar-fb-rest', width < FB_COMPACT_WIDTH && video.paused && !video._tarFbHover);
      hideFbControlRow(chrome);
    }
  }
}

function teardown() {
  clearTimeout(idleTimer);
  for (const video of document.querySelectorAll('video')) fbHoverChrome(video, false);
  const classes = ['tar-fb-chrome', 'tar-fb-show', 'tar-fb-compact', 'tar-fb-rest', 'tar-fb-bar', 'tar-fb-reel-card', 'tar-fb-reel-inset', 'tar-fb-reel-hide'];
  for (const el of document.querySelectorAll(classes.map((c) => '.' + c).join(', '))) el.classList.remove(...classes);
  for (const el of document.querySelectorAll('[data-tar-reel-caption], [data-tar-reel-overlay]')) {
    delete el.dataset.tarReelCaption;
    delete el.dataset.tarReelOverlay;
  }
  for (const video of document.querySelectorAll('video')) video.style.borderRadius = '';
}

TAR.register({
  settingKey: 'videoControlsFacebook',
  passes: [videoPass],
  teardown
});
