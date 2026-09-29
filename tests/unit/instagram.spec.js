const { test, expect } = require('@playwright/test');
const { load, user, setSettings, flush, settle, VIDEO } = require('./harness');

const PLAYER = `
  <div style="position:relative;width:480px;height:600px">
    ${VIDEO()}
    <div aria-label="Video player" id="chrome" style="position:absolute;inset:0">
      <div role="button" id="mute"><svg aria-label="Audio is muted"></svg></div>
    </div>
  </div>`;

test('hides IG’s player chrome outright and enables native controls', async ({ page }) => {
  await load(page, { site: 'instagram', html: PLAYER });
  await expect(page.locator('#chrome')).toHaveClass(/tar-ig-chrome/);
  await expect(page.locator('#chrome')).toBeHidden();
  expect(await page.evaluate(() => document.querySelector('video').controls)).toBe(true);
});

test('leaves chrome that does not cover the video alone', async ({ page }) => {
  // e.g. an unrelated "Video player" group elsewhere on the page
  await load(page, {
    site: 'instagram',
    html: `${VIDEO()}<div aria-label="Video player" id="far" style="margin-top:400px;height:50px"></div>`
  });
  await expect(page.locator('#far')).not.toHaveClass(/tar-ig-chrome/);
});

test('switching Instagram off shows the chrome again', async ({ page }) => {
  await load(page, { site: 'instagram', html: PLAYER });
  await setSettings(page, { videoControlsInstagram: false });
  await flush(page);
  await expect(page.locator('#chrome')).not.toHaveClass(/tar-ig-chrome/);
  await expect(page.locator('#chrome')).toBeVisible();
});

// Scrolling Reels: the sound state carries from clip to clip. Two clips, the
// second one below the fold, and a platform that — like IG, whose own mute
// state stays "muted" since its button is hidden — mutes every clip it plays.
test.describe('sound carries across clips (Reels)', () => {
  const REELS = `
    ${VIDEO('id="a"')}
    <div style="height:900px"></div>
    ${VIDEO('id="b"')}
    <div style="height:900px"></div>`;
  const PLATFORM_MUTES_ON_PLAY = `
    for (const v of document.querySelectorAll('video')) {
      v.addEventListener('play', (e) => { e.target.muted = true; });
    }`;

  const state = (page, id) => page.evaluate((i) => {
    const v = document.getElementById(i);
    return { muted: v.muted, paused: v.paused, volume: +v.volume.toFixed(3) };
  }, id);
  // The user acting on clip `id` through the native bar.
  const userSet = (page, id, prop, value) =>
    user(page, ([i, p, v]) => { document.getElementById(i)[p] = v; }, [id, prop, value]);

  // User plays clip A and unmutes it through the native bar.
  async function unmuteA(page) {
    await user(page, () => document.getElementById('a').play());
    await userSet(page, 'a', 'muted', false);
    await settle(page);
  }

  // The user scrolls on: IG pauses A and plays B (muting it, see above).
  async function scrollToB(page) {
    await page.evaluate(() => {
      document.getElementById('a').pause();
      document.getElementById('b').scrollIntoView();
      return document.getElementById('b').play();
    });
    await flush(page, 100);
  }

  test('unmuting carries to the next clip, at the last level', async ({ page }) => {
    await load(page, { site: 'instagram', html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await unmuteA(page);
    await userSet(page, 'a', 'volume', 0.3);
    await flush(page);
    await scrollToB(page);
    expect(await state(page, 'b')).toMatchObject({ paused: false, muted: false, volume: 0.3 });
  });

  test('muting carries to the next clip', async ({ page }) => {
    await load(page, { site: 'instagram', html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await unmuteA(page);
    await userSet(page, 'a', 'muted', true);
    await flush(page);
    await scrollToB(page);
    expect(await state(page, 'b')).toMatchObject({ paused: false, muted: true });
  });

  test('a clip starts muted until the user unmutes once', async ({ page }) => {
    await load(page, { site: 'instagram', html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await page.evaluate(() => document.getElementById('a').play());
    await flush(page, 100);
    expect(await state(page, 'a')).toMatchObject({ paused: false, muted: true, volume: 0.1 });
  });

  test('a platform mute on a clip that is off screen does not change the carried state', async ({ page }) => {
    await load(page, { site: 'instagram', html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await unmuteA(page);
    // IG mutes the preloaded clip below the fold, and A once it has paused.
    await page.evaluate(() => {
      document.getElementById('b').muted = true;
      document.getElementById('a').pause();
      document.getElementById('a').muted = true;
    });
    await flush(page);
    expect((await state(page, 'b')).muted).toBe(true); // not unmuted while off screen
    await scrollToB(page);
    expect(await state(page, 'b')).toMatchObject({ paused: false, muted: false, volume: 0.1 });
  });

  test('the carried state resets when Instagram is switched off and on', async ({ page }) => {
    await load(page, { site: 'instagram', html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await unmuteA(page);
    await setSettings(page, { videoControlsInstagram: false });
    await setSettings(page, { videoControlsInstagram: true });
    await flush(page);
    await scrollToB(page);
    expect((await state(page, 'b')).muted).toBe(true);
  });
});
