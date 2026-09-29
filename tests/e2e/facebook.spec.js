const urls = require('./urls');
const {
  test, expect, open, video, videos, firstVideo,
  visiblePlatformMuteButtons, expectSoundSurvivesPauseResume
} = require('./fixtures');

// Facebook is handled for Reels only; regular videos are left to FB.
test.describe('Facebook', () => {
  test('regular videos (/videos, /watch, feed posts) are left entirely to FB', async ({ page }) => {
    await open(page, urls.facebook.video);
    const list = await videos(page);
    test.skip(list.length === 0, 'fixture has no video any more — update tests/e2e/urls.js');
    expect(list.every((v) => !v.controls && v.desired === undefined)).toBe(true);
    await expect(page.locator('[class*="tar-fb"], .tar-hide-mute')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveAttribute('data-tar-default-volume', /.*/);
  });

  test('Reel viewer: caption moves out to the left, FB’s duplicate buttons go, the native bar is reachable', async ({ page }) => {
    await open(page, urls.facebook.reel);
    const v = await firstVideo(page);
    expect(v.controls).toBe(true);
    await expect(page.locator('.tar-fb-reel-card')).toHaveCount(1);
    const caption = await page.locator('[data-tar-reel-caption]').boundingBox();
    expect(caption.x + caption.width).toBeLessThanOrEqual(v.x);
    expect(await visiblePlatformMuteButtons(page, v.i)).toBe(0);
    await expect(page.locator('.tar-fb-reel-hide[aria-label="暫停"]')).toBeHidden();
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y).tagName, [v.x + v.w / 2, v.y + v.h - 20]);
    expect(hit).toBe('VIDEO');
  });

  test('Reel: sound survives pause/resume (FB re-mutes on play)', async ({ page }) => {
    await open(page, urls.facebook.reel);
    const v = await firstVideo(page);
    await expectSoundSurvivesPauseResume(page, v.i);
  });

  test('switching Facebook off live restores FB’s Reel player', async ({ page, settings }) => {
    await open(page, urls.facebook.reel);
    const v = await firstVideo(page);
    await settings.set({ videoControlsFacebook: false });
    await page.waitForTimeout(800);
    expect((await video(page, v.i)).controls).toBe(false);
    await expect(page.locator('[class*="tar-fb"], .tar-hide-mute, [data-tar-reel-caption]')).toHaveCount(0);

    await settings.set({ videoControlsFacebook: true });
    await page.waitForTimeout(800);
    expect((await video(page, v.i)).controls).toBe(true);
  });
});
