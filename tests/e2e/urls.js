// Live pages the e2e suite runs against, all viewable logged-out (as of
// 2026-09). Third-party posts can be deleted or change; a test whose fixture
// is gone skips with a note instead of failing — replace the URL here.
//
// Finding new ones (logged-out works):
//  - Threads spoilers: https://www.threads.com/search?q=防劇透 (or 劇透警告);
//    open the post page itself — the search results do not always render the
//    media cover. Turn off "Spoiler Reveal" in the popup to see it.
//  - IG: a public account's /reels/ tab, e.g. https://www.instagram.com/instagram/reels/
//  - FB: a public page's /videos/ tab, e.g. https://www.facebook.com/facebook/videos/
module.exports = {
  threads: {
    // Single-video post (no other media in the post).
    singleVideo: 'https://www.threads.com/@mutant_jordan/post/Dd0gbrXjV9P',
    // Multi-media carousel whose last item is a video.
    carouselVideo: 'https://www.threads.com/@__yuyu22__/post/DdzYe9_k-cY',
    // Posts with spoiler-hidden text.
    spoilerText: [
      'https://www.threads.com/@xia.0713/post/DdrC9icFOm2',
      'https://www.threads.com/@_t0ast.122_/post/Dds-bGXmNt5',
      'https://www.threads.com/@shinryuu_inori64/post/Dd0XZDnkwgG'
    ],
    // Post with a spoiler-covered image ("劇透" badge, blurred).
    spoilerMedia: [
      'https://www.threads.com/@perform_ma_nce_9._19_/post/Dd1ZGAzGrDs'
    ]
  },
  instagram: {
    // Reel page (single video, IG's side panel with caption/comments).
    reel: 'https://www.instagram.com/instagram/reel/DdwMu5VhCUn/',
    // Carousel post whose second slide is a video.
    carouselVideo: 'https://www.instagram.com/instagram/p/DduKfFmDxsG/'
  },
  facebook: {
    // Public page video (FB's own control row + caption overlay).
    video: 'https://www.facebook.com/facebook/videos/1807623153746790/'
  }
};
