// Shared core (src/common.js + src/media-guard.js), with per-clip sound state:
// driven through the Facebook site script, which does not carry sound across
// clips (Instagram does — see instagram.spec.js).
// page.evaluate = platform JS, user() = the native control bar, ext() = extension.
const { test, expect } = require('@playwright/test');
const { load, ext, user, setSettings, runPasses, flush, settle, VIDEO } = require('./harness');

const SITE = 'facebook';

const video = (page, n = 0) => page.evaluate((i) => {
  const v = document.querySelectorAll('video')[i];
  return { controls: v.controls, muted: v.muted, paused: v.paused, volume: +v.volume.toFixed(3), ...v.dataset };
}, n);

const userPlay = (page) => user(page, () => document.querySelector('video').play());
const userPause = (page) => user(page, () => document.querySelector('video').pause());
const userMuted = (page, muted) => user(page, (m) => { document.querySelector('video').muted = m; }, muted);

// Platform stand-in: once window.__platformMutes is set, every play forces
// muted=true, the way IG/FB do when their own (hidden) mute state says muted.
// Registered before the extension loads, as the platform's listener is.
const PLATFORM_MUTES_ON_PLAY = `
  document.querySelector('video').addEventListener('play', (e) => {
    if (window.__platformMutes) e.target.muted = true;
  });`;

test.describe('native controls & sound', () => {
  test('enables native controls at the default volume, muted', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO(), settings: { defaultVolume: 25 } });
    const v = await video(page);
    expect(v).toMatchObject({ controls: true, controlsEnabled: 'true', muted: true, volume: 0.25, desiredVolume: '0.25' });
  });

  test('a platform jump to 100% on unmute never lands, not even for an instant', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO() });
    await userMuted(page, false);
    // Platform JS reads the volume back in the same synchronous batch.
    const seen = await page.evaluate(() => {
      const v = document.querySelector('video');
      v.volume = 1;
      return v.volume;
    });
    expect(seen).toBeCloseTo(0.1);
  });

  test('a freshly swapped-in video is pinned to the default before the pass picks it up', async ({ page }) => {
    // FB can swap in a new <video> when unmuting; the extension's pass is
    // debounced (~300ms), so media-guard must cover the gap synchronously.
    await load(page, { site: SITE, html: VIDEO() });
    const seen = await page.evaluate(() => {
      const v = document.createElement('video');
      document.body.appendChild(v);
      v.volume = 1;
      v.muted = false;
      return { volume: v.volume, managed: v.dataset.controlsEnabled || null };
    });
    expect(seen).toEqual({ volume: expect.closeTo(0.1, 3), managed: null });
  });

  test('keeps sound when the platform re-mutes on resume', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO(), beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await userPlay(page);
    await userMuted(page, false);
    await settle(page);
    await userPause(page);
    await page.evaluate(() => { window.__platformMutes = true; });
    await userPlay(page);
    await flush(page, 100);
    expect(await video(page)).toMatchObject({ paused: false, muted: false, volume: 0.1 });
  });

  test('does not unmute a fresh clip the platform mutes right before its first autoplay', async ({ page }) => {
    // No `muted` attribute: the element starts muted=false, as a freshly
    // mounted clip can, before the platform mutes it and autoplays.
    await load(page, {
      site: SITE,
      html: VIDEO().replace(' muted ', ' '),
      beforeLoad: PLATFORM_MUTES_ON_PLAY
    });
    await page.evaluate(() => {
      window.__platformMutes = true;
      return document.querySelector('video').play();
    });
    await flush(page, 100);
    expect((await video(page)).muted).toBe(true);
  });

  test('respects a user mute across pause/resume', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO(), beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await userPlay(page);
    await userMuted(page, false);
    await settle(page);
    await userMuted(page, true);
    await flush(page);
    await userPause(page);
    await page.evaluate(() => { window.__platformMutes = true; });
    await userPlay(page);
    await flush(page, 100);
    expect(await video(page)).toMatchObject({ paused: false, muted: true });
  });

  test('restores sound when the platform re-mutes after a native seek', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO() });
    await userPlay(page);
    await userMuted(page, false);
    await settle(page);
    await user(page, () => { document.querySelector('video').currentTime = 5; });
    await page.evaluate(() => { document.querySelector('video').muted = true; });
    await flush(page, 100);
    expect(await video(page)).toMatchObject({ muted: false, volume: 0.1 });
  });

  test('remembers a volume slider drag as the new level', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO(), beforeLoad: PLATFORM_MUTES_ON_PLAY });
    await userPlay(page);
    await userMuted(page, false);
    await settle(page);
    await user(page, () => { document.querySelector('video').volume = 0.5; });
    await flush(page);
    expect((await video(page)).desiredVolume).toBe('0.5');

    // ...and a later platform re-mute on resume restores that level.
    await userPause(page);
    await page.evaluate(() => { window.__platformMutes = true; });
    await userPlay(page);
    await flush(page, 100);
    expect(await video(page)).toMatchObject({ muted: false, volume: 0.5 });
  });

  test('applies a changed default volume to videos already on the page', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO() });
    await setSettings(page, { defaultVolume: 40 });
    await flush(page);
    expect(await video(page)).toMatchObject({ volume: 0.4, desiredVolume: '0.4' });
  });
});

test.describe('platform pause right after a native play', () => {
  // Platform stand-in whose player state machine still says "paused": it
  // answers every play event by pausing again (Threads post-page videos).
  const PLATFORM_PAUSES_ON_PLAY = `
    document.querySelector('video').addEventListener('play', (e) => e.target.pause());`;

  test('is ignored, so the native play button works', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO(), beforeLoad: PLATFORM_PAUSES_ON_PLAY });
    await userPlay(page);
    await flush(page, 400);
    expect((await video(page)).paused).toBe(false);
  });

  test('later platform pauses still go through', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO() });
    await userPlay(page);
    await flush(page, 400);
    await page.evaluate(() => document.querySelector('video').pause());
    expect((await video(page)).paused).toBe(true);
  });

  test('a platform play() followed by its own pause() is left alone', async ({ page }) => {
    await load(page, { site: SITE, html: VIDEO(), beforeLoad: PLATFORM_PAUSES_ON_PLAY });
    await page.evaluate(() => document.querySelector('video').play());
    await flush(page, 200);
    expect((await video(page)).paused).toBe(true);
  });
});

test.describe('platform mute button', () => {
  test('hides the mute button whatever carries its label', async ({ page }) => {
    await load(page, {
      site: SITE,
      html: `
        <div aria-label="Video player">
          <div role="button" id="svg-label"><svg aria-label="Audio is muted"></svg></div>
          <div role="button" id="svg-title"><svg><title>音訊已靜音</title></svg></div>
          <div role="button" id="button-label" aria-label="取消靜音"><svg></svg></div>
          <div role="button" id="other" aria-label="設定"><svg></svg></div>
        </div>`
    });
    for (const id of ['svg-label', 'svg-title', 'button-label']) {
      await expect(page.locator('#' + id)).toBeHidden();
    }
    await expect(page.locator('#other')).toHaveCSS('display', 'block');
  });
});

test.describe('live toggle', () => {
  // Platform chrome overlays the video, carrying a mute button and a seek
  // slider — every kind of shared DOM change the extension makes.
  const PLAYER = `
    <div style="position:relative;width:640px;height:360px">
      ${VIDEO()}
      <div aria-label="Video player" id="chrome" style="position:absolute;inset:0">
        <div role="button" id="mute" aria-label="Unmute"><svg></svg></div>
        <div role="slider" id="seek" aria-label="Change Position" style="height:4px"></div>
      </div>
    </div>`;

  // Counts the extension's volumechange registrations, to catch stacked listeners.
  const COUNT_LISTENERS = `
    const add = HTMLMediaElement.prototype.addEventListener;
    window.__vcListeners = 0;
    HTMLMediaElement.prototype.addEventListener = function (type, ...rest) {
      if (type === 'volumechange') window.__vcListeners++;
      return add.call(this, type, ...rest);
    };`;

  test('switching the site off hands everything back; switching on re-applies once', async ({ page }) => {
    await load(page, { site: SITE, html: PLAYER, extBeforeLoad: COUNT_LISTENERS });
    await expect(page.locator('#mute')).toHaveClass(/tar-hide-mute/);
    await expect(page.locator('#seek')).toHaveAttribute('data-seek-hidden', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-tar-default-volume', '0.1');

    await setSettings(page, { videoControlsFacebook: false });
    await flush(page);
    const off = await video(page);
    expect(off.controls).toBe(false);
    expect(off.controlsEnabled).toBeUndefined();
    expect(off.desiredVolume).toBeUndefined();
    await expect(page.locator('#mute')).not.toHaveClass(/tar-hide-mute/);
    await expect(page.locator('#seek')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-tar-default-volume', /.*/);

    // While off, the platform's own volume/mute writes are left alone.
    const seen = await page.evaluate(() => {
      const v = document.querySelector('video');
      v.muted = false;
      v.volume = 0.8;
      return v.volume;
    });
    expect(seen).toBeCloseTo(0.8);

    await setSettings(page, { videoControlsFacebook: true });
    await flush(page);
    expect(await video(page)).toMatchObject({ controls: true, controlsEnabled: 'true', volume: 0.1, desiredVolume: '0.1' });

    expect(await ext(page, () => window.__vcListeners)).toBe(1);
  });

  test('does nothing on a page that loads with the site already off', async ({ page }) => {
    await load(page, { site: SITE, html: PLAYER, settings: { videoControlsFacebook: false } });
    await runPasses(page);
    expect((await video(page)).controls).toBe(false);
    await expect(page.locator('#mute')).toBeVisible();
  });
});
