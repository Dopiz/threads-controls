// Instagram and Facebook carry the user's sound state from clip to clip
// (TAR.sound): after an unmute (or mute), the next Reel / feed video starts
// the same way, at the level last set. Threads keeps it per clip (common.spec).
const { test, expect } = require('@playwright/test');
const { load, user, setSettings, flush, settle, VIDEO } = require('./harness');

// Scrolling Reels: two clips, the second one below the fold, and a platform
// that — like IG and FB, whose own mute state stays "muted" since their mute
// button is hidden — mutes every clip it plays.
for (const [site, key] of [['instagram', 'videoControlsInstagram'], ['facebook', 'videoControlsFacebook']]) {
  test.describe(`${site}: sound carries across clips (Reels)`, () => {
    // (The /reel/ links mark them as Reels for Facebook, which handles only those.)
    const REELS = `
      <div style="width:640px">${VIDEO('id="a"')}<a href="/reel/a/">a</a></div>
      <div style="height:900px"></div>
      <div style="width:640px">${VIDEO('id="b"')}<a href="/reel/b/">b</a></div>
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
      await load(page, { site, html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
      await unmuteA(page);
      await userSet(page, 'a', 'volume', 0.3);
      await flush(page);
      await scrollToB(page);
      expect(await state(page, 'b')).toMatchObject({ paused: false, muted: false, volume: 0.3 });
    });

    test('muting carries to the next clip', async ({ page }) => {
      await load(page, { site, html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
      await unmuteA(page);
      await userSet(page, 'a', 'muted', true);
      await flush(page);
      await scrollToB(page);
      expect(await state(page, 'b')).toMatchObject({ paused: false, muted: true });
    });

    test('a clip starts muted until the user unmutes once', async ({ page }) => {
      await load(page, { site, html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
      await page.evaluate(() => document.getElementById('a').play());
      await flush(page, 100);
      expect(await state(page, 'a')).toMatchObject({ paused: false, muted: true, volume: 0.1 });
    });

    test('a platform mute on a clip that is off screen does not change the carried state', async ({ page }) => {
      await load(page, { site, html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
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

    // Reels start the next clip while it is still sliding in, with whatever
    // sound state the platform holds.
    test('a mute carries even to a clip that starts playing before it is on screen', async ({ page }) => {
      await load(page, { site, html: REELS });
      await unmuteA(page);
      await userSet(page, 'a', 'muted', true);
      await flush(page);
      await page.evaluate(() => {
        document.getElementById('a').pause();
        const b = document.getElementById('b');
        b.muted = false; // the platform's own state says "sound on"
        return b.play();
      });
      await flush(page, 100);
      expect(await state(page, 'b')).toMatchObject({ paused: false, muted: true });
    });

    test('an unmute carries once a clip that started off screen scrolls in', async ({ page }) => {
      await load(page, { site, html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
      await unmuteA(page);
      await page.evaluate(() => {
        document.getElementById('a').pause();
        return document.getElementById('b').play();
      });
      await flush(page, 100);
      expect((await state(page, 'b')).muted).toBe(true); // off screen: no sound yet
      await page.evaluate(() => document.getElementById('b').scrollIntoView());
      await flush(page, 200);
      expect(await state(page, 'b')).toMatchObject({ paused: false, muted: false, volume: 0.1 });
    });

    test('the carried state resets when the site is switched off and on', async ({ page }) => {
      await load(page, { site, html: REELS, beforeLoad: PLATFORM_MUTES_ON_PLAY });
      await unmuteA(page);
      await setSettings(page, { [key]: false });
      await setSettings(page, { [key]: true });
      await flush(page);
      await scrollToB(page);
      expect((await state(page, 'b')).muted).toBe(true);
    });
  });
}
