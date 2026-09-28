const urls = require('./urls');
const {
  test, expect, open, videos, video, center, clickBar,
  visiblePlatformMuteButtons, expectSoundSurvivesPauseResume
} = require('./fixtures');

// First rendered video on the page, scrolled into view; skips if the post no
// longer has one (fixture deleted/changed — update tests/e2e/urls.js).
async function firstVideo(page, filter = () => true) {
  const list = (await videos(page)).filter(filter);
  test.skip(list.length === 0, 'fixture has no matching video any more — update tests/e2e/urls.js');
  return center(page, list[0].i);
}

test.describe('Threads video', () => {
  test('single video: native controls replace the platform chrome and mute button', async ({ page }) => {
    await open(page, urls.threads.singleVideo);
    const v = await firstVideo(page, (x) => !x.keepChrome);
    expect(v.controls).toBe(true);
    expect(await visiblePlatformMuteButtons(page, v.i)).toBe(0);

    // Hovering hides the chrome (owner/caption overlay) so the bar is usable.
    await page.mouse.move(v.x + v.w / 2, v.y + v.h / 2);
    await page.waitForTimeout(400);
    const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y).tagName, [v.x + v.w / 2, v.y + v.h - 22]);
    expect(top).toBe('VIDEO');
  });

  test('single video: unmutes at the default volume and keeps sound through pause/resume and seek', async ({ page }) => {
    await open(page, urls.threads.singleVideo);
    const v = await firstVideo(page, (x) => !x.keepChrome);
    await expectSoundSurvivesPauseResume(page, v.i);
    await clickBar(page, v, 'timeline', { fraction: 0.3, wait: 1500 });
    expect(await video(page, v.i)).toMatchObject({ muted: false, volume: 0.1 });
  });

  test('post page: videos below the post play from the native bar (platform pauses them back)', async ({ page }) => {
    await open(page, urls.threads.singleVideo);
    const below = (await videos(page)).filter((x) => !x.keepChrome).slice(1);
    test.skip(below.length === 0, 'post page no longer lists other videos — update tests/e2e/urls.js');
    const v = await center(page, below[0].i);
    if (!v.paused) await clickBar(page, v, 'playPause');
    await clickBar(page, v, 'playPause', { wait: 1500 });
    expect((await video(page, v.i)).paused).toBe(false);
  });

  test('carousel video: the control-bar strip reaches the video, the rest keeps the overlay', async ({ page }) => {
    await open(page, urls.threads.carouselVideo);
    const v = await firstVideo(page, (x) => x.keepChrome);
    expect(v.controls).toBe(true);
    await page.waitForTimeout(800);
    const hit = (y) => page.evaluate(([x, yy]) => document.elementFromPoint(x, yy).tagName, [v.x + v.w / 2, y]);
    expect(await hit(v.y + v.h - 15)).toBe('VIDEO');
    expect(await hit(v.y + v.h / 2)).not.toBe('VIDEO');
  });

  test('switching Threads off live hands the videos back', async ({ page, settings }) => {
    await open(page, urls.threads.singleVideo);
    const v = await firstVideo(page, (x) => !x.keepChrome);
    await settings.set({ videoControlsThreads: false });
    await page.waitForTimeout(800);
    expect((await video(page, v.i)).controls).toBe(false);
    await expect(page.locator('.tar-hide-mute, [data-tar-clipped]')).toHaveCount(0);

    await settings.set({ videoControlsThreads: true });
    await page.waitForTimeout(800);
    expect((await video(page, v.i)).controls).toBe(true);
  });
});

// Each spoiler fixture is checked both ways: with reveal off the post must
// really contain a spoiler (else the fixture is stale and skips), with reveal on
// it must be gone.
test.describe('Threads spoilers', () => {
  const textSpoilers = (page) => page.locator('span[data-text-fragment="spoiler"]').count();
  // Media covers: a role="button" wrapping media plus the --x-opacity blur layer.
  const mediaSpoilers = (page) => page.evaluate(() => Array.from(document.querySelectorAll('div[role="button"]'))
    .filter((b) => b.querySelector('picture, img, video') && b.querySelector('div[style*="--x-opacity"]')).length);

  for (const url of urls.threads.spoilerText) {
    test(`reveals spoiler text: ${url}`, async ({ page, settings }) => {
      await settings.set({ revealText: false });
      await open(page, url);
      test.skip(await textSpoilers(page) === 0, 'post no longer has spoiler text — update tests/e2e/urls.js');

      await settings.set({ revealText: true });
      await expect.poll(() => textSpoilers(page), { timeout: 5000 }).toBe(0);
    });
  }

  for (const url of urls.threads.spoilerMedia) {
    test(`reveals spoiler media: ${url}`, async ({ page, settings }) => {
      await settings.set({ revealMedia: false });
      await open(page, url);
      test.skip(await mediaSpoilers(page) === 0, 'post no longer has a media spoiler — update tests/e2e/urls.js');

      await settings.set({ revealMedia: true });
      await expect.poll(() => mediaSpoilers(page), { timeout: 5000 }).toBe(0);
    });
  }
});
