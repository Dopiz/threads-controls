const urls = require('./urls');
const {
  test, expect, open, videos, video, firstVideo, rewind, clickBar,
  visiblePlatformMuteButtons, expectSoundSurvivesPauseResume
} = require('./fixtures');

test.describe('Instagram', () => {
  test('reel: IG chrome hidden, native controls on, no platform mute button', async ({ page }) => {
    await open(page, urls.instagram.reel);
    const v = await firstVideo(page);
    expect(v.controls).toBe(true);
    await expect(page.locator('.tar-ig-chrome').first()).toBeHidden();
    expect(await visiblePlatformMuteButtons(page, v.i)).toBe(0);
  });

  test('reel: sound survives pause/resume (IG re-mutes on play) and a native seek', async ({ page }) => {
    await open(page, urls.instagram.reel);
    const v = await firstVideo(page);
    await expectSoundSurvivesPauseResume(page, v.i);
    await clickBar(page, v, 'timeline', { fraction: 0.2, wait: 1500 });
    expect(await video(page, v.i)).toMatchObject({ muted: false, volume: 0.1 });
  });

  test('reel: a user mute sticks across pause/resume', async ({ page }) => {
    await open(page, urls.instagram.reel);
    let v = await firstVideo(page);
    await rewind(page, v.i);
    if ((await video(page, v.i)).paused) await clickBar(page, v, 'playPause');
    await clickBar(page, v, 'mute'); // unmute
    await page.waitForTimeout(1200);
    await clickBar(page, v, 'mute'); // mute again
    expect((await video(page, v.i)).muted).toBe(true);
    await clickBar(page, v, 'playPause');
    await clickBar(page, v, 'playPause', { wait: 1500 });
    v = await video(page, v.i);
    expect(v).toMatchObject({ paused: false, muted: true });
  });

  test('carousel: the video slide gets native controls', async ({ page }) => {
    await open(page, urls.instagram.carouselVideo);
    // Step through the slides until a video is in the media frame.
    for (let i = 0; i < 6; i++) {
      const inFrame = (await videos(page)).find((v) => v.x >= 0 && v.x + v.w <= 720 && v.controls);
      if (inFrame) break;
      const next = page.locator('button[aria-label="下一步"], button[aria-label="Next"]').first();
      if (!(await next.count())) break;
      await next.click({ force: true });
      await page.waitForTimeout(1200);
    }
    const v = (await videos(page)).find((x) => x.x >= 0 && x.x + x.w <= 720);
    test.skip(!v, 'carousel no longer has a video slide — update tests/e2e/urls.js');
    expect(v.controls).toBe(true);
    expect(await visiblePlatformMuteButtons(page, v.i)).toBe(0);
  });

  test('switching Instagram off live shows IG’s chrome again', async ({ page, settings }) => {
    await open(page, urls.instagram.reel);
    const v = await firstVideo(page);
    await settings.set({ videoControlsInstagram: false });
    await page.waitForTimeout(800);
    expect((await video(page, v.i)).controls).toBe(false);
    await expect(page.locator('.tar-ig-chrome, .tar-hide-mute')).toHaveCount(0);
  });
});
