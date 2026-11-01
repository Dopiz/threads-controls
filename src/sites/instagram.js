// IG's Video player overlay chrome is hidden outright — the native controls
// replace it. Unlike other sites we don't do hover-to-reveal here: hide the
// chrome groups directly via an injected style + a re-tagged class each pass.
// Sound carries from clip to clip (carrySound): scrolling Reels/the feed keeps
// the user's last mute/unmute and level, like IG's own player does.
//
// Stories (/stories/) stay IG's: its own sound button and tap areas run them, so
// no native bar and no carried sound there. They only take the default level
// (media-guard pins videos the extension doesn't manage), which would leave IG's
// volume track dead, so it is hidden: the track only, since the sound button is
// inside the same div[role="slider"].
const inStories = () => location.pathname.startsWith('/stories/');

// Reels viewer (/reels/, /reels/<id>/: the swipeable feed): each clip is lit
// (TAR.ambientLight) from behind its rounded card, the nearest clipping ancestor.
const inReelsViewer = () => location.pathname.startsWith('/reels/');
function reelCard(video) {
  let card = video.parentElement;
  while (card && card !== document.body && getComputedStyle(card).overflow !== 'hidden') card = card.parentElement;
  return card && card !== document.body ? card : null;
}

function videoPass() {
  if (!TAR.videoControlsEnabled()) return;
  TAR.ensureStyle('tar-ig-style', '.tar-ig-chrome, .tar-ig-stories [role="slider"] > div > :not([role="button"]) { display: none !important; }');
  const stories = inStories();
  document.documentElement.classList.toggle('tar-ig-stories', stories);
  if (stories) {
    for (const video of document.querySelectorAll('video')) TAR.releaseVideo(video);
    TAR.ambientLight([]);
    return;
  }
  TAR.hidePlatformMuteButtons();
  const lit = [];
  for (const video of document.querySelectorAll('video')) {
    if (video.getBoundingClientRect().width === 0) continue;
    if (inReelsViewer()) {
      const card = video._tarReelCard && video._tarReelCard.contains(video) ? video._tarReelCard : reelCard(video);
      video._tarReelCard = card;
      if (card) lit.push([video, card]);
    }
    TAR.enableNativeControls(video);
    TAR.hideSeekSliderNear(video);
    for (const chrome of TAR.findPlayerChrome(video)) {
      chrome.classList.add('tar-ig-chrome');
    }
  }
  TAR.ambientLight(lit);
}

function teardown() {
  document.documentElement.classList.remove('tar-ig-stories');
  for (const el of document.querySelectorAll('.tar-ig-chrome')) el.classList.remove('tar-ig-chrome');
}

TAR.register({
  settingKey: 'videoControlsInstagram',
  passes: [videoPass],
  teardown,
  carrySound: true
});
