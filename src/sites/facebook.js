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
  '  right: calc(100% + 24px) !important; width: 320px !important; background: none !important;',
  // Out beside the video it takes the pointer again and scrolls when long
  // (an expanded caption), capped at the video's height.
  '  pointer-events: auto !important; max-height: 100% !important; overflow-y: auto !important;',
  '  overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.3) transparent; }',
  '.tar-fb-reel-card [data-tar-reel-shade] { display: none !important; }',
  '.tar-fb-reel-inset [data-tar-reel-caption] { bottom: 60px !important; }',
  '.tar-fb-reel-hide { display: none !important; }',
  ':is([data-tar-reel-overlay], .tar-fb-reel-chrome) { pointer-events: none !important; }',
  ':is([data-tar-reel-overlay], .tar-fb-reel-chrome) :is(a, [role="button"], [role="link"]) { pointer-events: auto; }'
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
// play/pause, mute/volume and search buttons on the card go: the native bar
// covers those. The card clips its content for the rounded corners, so it is
// un-clipped and the video takes over the rounding. The layers over the video
// (FB's "Video player" chrome, and logged out a separate overlay) would
// swallow the hover the native bar needs, so they let the pointer through
// (their links and buttons stay clickable).
//
// Found by structure, since labels are localized and the logged-in and
// logged-out DOMs differ:
//  - card: the video's nearest overflow-clipping ancestor;
//  - caption: the outermost absolutely positioned block in the card, anchored
//    to its bottom (lower half), that holds text but not the video. Logged out
//    it carries the gradient itself; logged in the gradient is a separate,
//    empty layer ("shade"), hidden once the caption has moved out;
//  - overlay: the caption's outermost ancestor that still does not hold the
//    video.
// Logged in, FB mounts the caption (inside its "Video player" chrome) only
// while the pointer is over the Reel, so the card is handled on its own and
// the caption is tagged whenever it (re)appears — right away, from
// watchReelCaptions, so it is never painted over the video first.
const REEL_CAPTION_SPACE = 320 + 24 + 16;
const REEL_BUTTONS = /暫停|播放|靜音|音量|搜尋|pause|play|mute|volume|search/i;

function findReelCard(video) {
  if (video._tarReelCard && video._tarReelCard.isConnected && video._tarReelCard.contains(video)) {
    return video._tarReelCard;
  }
  // (A card an earlier pass un-clipped is recognized by its class.)
  const isCard = (el) => el.classList.contains('tar-fb-reel-card') || el.classList.contains('tar-fb-reel-inset') ||
    getComputedStyle(el).overflow === 'hidden';
  let card = video.parentElement;
  while (card && card !== document.body && !isCard(card)) card = card.parentElement;
  video._tarReelCard = card && card !== document.body ? card : null;
  return video._tarReelCard;
}

function tagReelCaption(video, card) {
  if (card.querySelector('[data-tar-reel-caption]')) return;
  const cardRect = card.getBoundingClientRect();
  const blocks = Array.from(card.querySelectorAll('div')).filter((el) => {
    if (el.contains(video)) return false;
    const r = el.getBoundingClientRect();
    return Math.abs(r.bottom - cardRect.bottom) < 2 && r.top > cardRect.top + cardRect.height / 2;
  });
  const isTextBlock = (el) => getComputedStyle(el).position === 'absolute' && el.innerText.trim();
  const caption = blocks.find((el) => isTextBlock(el) && !blocks.some((o) => o !== el && o.contains(el) && isTextBlock(o)));
  if (!caption) return;
  caption.dataset.tarReelCaption = '1';
  // FB turns wheel over the viewer into next/previous Reel; over a moved-out
  // caption that can scroll, the wheel scrolls the caption instead.
  caption.addEventListener('wheel', (e) => {
    if (caption.closest('.tar-fb-reel-card') && caption.scrollHeight > caption.clientHeight) e.stopPropagation();
  }, { passive: true });
  for (const el of blocks) {
    if (!el.innerText.trim() && getComputedStyle(el).backgroundImage.includes('gradient')) el.dataset.tarReelShade = '1';
  }
  let overlay = caption;
  while (overlay.parentElement !== card && !overlay.parentElement.contains(video)) overlay = overlay.parentElement;
  overlay.dataset.tarReelOverlay = '1';
}

// Returns the Reel card (once found), else null.
function layoutReel(video) {
  const card = findReelCard(video);
  if (!card) return null;
  if (!video.style.borderRadius) video.style.borderRadius = getComputedStyle(card).borderRadius;
  const room = card.getBoundingClientRect().left >= REEL_CAPTION_SPACE;
  card.classList.toggle('tar-fb-reel-card', room);
  card.classList.toggle('tar-fb-reel-inset', !room);
  tagReelCaption(video, card);
  const caption = card.querySelector('[data-tar-reel-caption]');
  for (const el of card.querySelectorAll('div[role="button"], div[role="slider"]')) {
    if ((caption && caption.contains(el)) || el.classList.contains('tar-fb-reel-hide')) continue;
    if (REEL_BUTTONS.test(el.getAttribute('aria-label') || '')) el.classList.add('tar-fb-reel-hide');
  }
  return card;
}

// Tag a (re)mounted caption in the same task it appears — MutationObserver
// callbacks run before the next paint — instead of on the debounced pass.
let reelObserver = null;
function watchReelCaptions() {
  if (reelObserver) return;
  reelObserver = new MutationObserver((mutations) => {
    if (!location.pathname.startsWith('/reel/') || !TAR.videoControlsEnabled()) return;
    for (const video of document.querySelectorAll('video')) {
      const card = video._tarReelCard;
      if (!card || !card.isConnected || card.querySelector('[data-tar-reel-caption]')) continue;
      if (mutations.some((m) => m.addedNodes.length && card.contains(m.target))) tagReelCaption(video, card);
    }
  });
  reelObserver.observe(document.body, { childList: true, subtree: true });
}

// Facebook: Reels only — the Reel viewer, and Reels elsewhere (the feed's
// Reels cards, shared Reels), recognized by a /reel/ link on the video's own
// card: its ancestors up to where they grow well past the video. Regular
// videos (feed posts, /watch, /videos) are left entirely to FB.
const inReelViewer = () => location.pathname.startsWith('/reel/');
function isReel(video) {
  if (video._tarIsReel || inReelViewer() || video.closest('a[href*="/reel/"]')) return (video._tarIsReel = true);
  const vr = video.getBoundingClientRect();
  for (let n = video.parentElement, i = 0; n && n !== document.body && i < 12; n = n.parentElement, i++) {
    const r = n.getBoundingClientRect();
    if (r.width > vr.width * 1.5 || r.height > vr.height * 1.6) break;
    if (n.querySelector('a[href*="/reel/"]')) return (video._tarIsReel = true);
  }
  return false;
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.ensureStyle('tar-fb-style', FB_STYLE);
  TAR.watchHover(fbHoverChrome);
  const inViewer = inReelViewer();
  if (inViewer) watchReelCaptions();
  for (const video of document.querySelectorAll('video')) {
    const width = video.getBoundingClientRect().width;
    if (width === 0 || !isReel(video)) continue;
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
    TAR.hidePlatformMuteButtons(TAR.findPlayerChrome(video));
    const reelCard = inViewer ? layoutReel(video) : null;
    if (!video._tarFbRestListeners) {
      video._tarFbRestListeners = true;
      video.addEventListener('play', () => restChrome(video));
      video.addEventListener('pause', () => restChrome(video));
    }
    // Re-run each pass to catch React-replaced nodes; classList.add is idempotent.
    for (const chrome of TAR.findPlayerChrome(video)) {
      hideFbControlRow(chrome);
      if (reelCard && reelCard.contains(chrome)) {
        // Holds the caption on a Reel card: stays visible (see layoutReel).
        chrome.classList.remove('tar-fb-chrome', 'tar-fb-show', 'tar-fb-compact', 'tar-fb-rest');
        chrome.classList.add('tar-fb-reel-chrome');
        continue;
      }
      chrome.classList.add('tar-fb-chrome');
      chrome.classList.toggle('tar-fb-compact', width < FB_COMPACT_WIDTH);
      chrome.classList.toggle('tar-fb-rest', width < FB_COMPACT_WIDTH && video.paused && !video._tarFbHover);
    }
  }
}

function teardown() {
  clearTimeout(idleTimer);
  for (const video of document.querySelectorAll('video')) fbHoverChrome(video, false);
  const classes = ['tar-fb-chrome', 'tar-fb-show', 'tar-fb-compact', 'tar-fb-rest', 'tar-fb-bar',
    'tar-fb-reel-card', 'tar-fb-reel-inset', 'tar-fb-reel-chrome', 'tar-fb-reel-hide'];
  for (const el of document.querySelectorAll(classes.map((c) => '.' + c).join(', '))) el.classList.remove(...classes);
  for (const el of document.querySelectorAll('[data-tar-reel-caption], [data-tar-reel-shade], [data-tar-reel-overlay]')) {
    delete el.dataset.tarReelCaption;
    delete el.dataset.tarReelShade;
    delete el.dataset.tarReelOverlay;
  }
  for (const video of document.querySelectorAll('video')) {
    video.style.borderRadius = '';
    video._tarReelCard = null;
  }
}

TAR.register({
  settingKey: 'videoControlsFacebook',
  passes: [videoPass],
  teardown,
  // Like IG: an unmute (or mute) carries to the next Reel.
  carrySound: true,
  // A swapped-in video is only known to be a Reel in the Reel viewer.
  pinUnmanaged: inReelViewer
});
