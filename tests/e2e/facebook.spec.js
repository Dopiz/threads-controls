const urls = require('./urls');
const {
  test, expect, open, video, firstVideo, clickBar,
  visiblePlatformMuteButtons, expectSoundSurvivesPauseResume
} = require('./fixtures');

// FB's own control buttons (anything but links) still visible over the video.
const visibleFbButtons = (page, i) => page.evaluate((n) => {
  const vr = document.querySelectorAll('video')[n].getBoundingClientRect();
  return Array.from(document.querySelectorAll('div[aria-label="Video player"] div[role="button"]')).filter((b) => {
    const r = b.getBoundingClientRect();
    if (!r.width || r.top < vr.top || r.bottom > vr.bottom) return false;
    let op = 1;
    for (let el = b; el; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      op *= +cs.opacity;
    }
    return op > 0.1;
  }).map((b) => b.getAttribute('aria-label'));
}, i);

test.describe('Facebook', () => {
  test('one control bar: FB’s own row and mute button are hidden, playing or paused', async ({ page }) => {
    await open(page, urls.facebook.video);
    const v = await firstVideo(page);
    expect(v.controls).toBe(true);
    await expect(page.locator('.tar-fb-bar').first()).toBeHidden();
    expect(await visiblePlatformMuteButtons(page, v.i)).toBe(0);

    // Paused + hovered is when FB used to bring its row back over the native one.
    if (!(await video(page, v.i)).paused) await clickBar(page, v, 'playPause');
    await page.mouse.move(v.x + v.w / 2 + 5, v.y + v.h / 2);
    await page.waitForTimeout(600);
    expect(await visibleFbButtons(page, v.i)).toEqual([]);
  });

  test('sound survives pause/resume (FB re-mutes on play)', async ({ page }) => {
    await open(page, urls.facebook.video);
    const v = await firstVideo(page);
    await expectSoundSurvivesPauseResume(page, v.i);
  });

  test('Reel viewer: caption moves out to the left, FB’s duplicate buttons go, the native bar is reachable', async ({ page }) => {
    await open(page, urls.facebook.reel);
    const v = await firstVideo(page);
    await expect(page.locator('.tar-fb-reel-card')).toHaveCount(1);
    const caption = await page.locator('[data-tar-reel-caption]').boundingBox();
    expect(caption.x + caption.width).toBeLessThanOrEqual(v.x);
    expect(await visiblePlatformMuteButtons(page, v.i)).toBe(0);
    await expect(page.locator('.tar-fb-reel-hide[aria-label="暫停"]')).toBeHidden();
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y).tagName, [v.x + v.w / 2, v.y + v.h - 20]);
    expect(hit).toBe('VIDEO');
  });

  test('switching Facebook off live restores FB’s player', async ({ page, settings }) => {
    await open(page, urls.facebook.video);
    const v = await firstVideo(page);
    await settings.set({ videoControlsFacebook: false });
    await page.waitForTimeout(800);
    expect((await video(page, v.i)).controls).toBe(false);
    await expect(page.locator('.tar-fb-chrome, .tar-fb-bar, .tar-hide-mute')).toHaveCount(0);

    await settings.set({ videoControlsFacebook: true });
    await page.waitForTimeout(800);
    expect((await video(page, v.i)).controls).toBe(true);
  });
});
