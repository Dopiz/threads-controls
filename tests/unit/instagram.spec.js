const { test, expect } = require('@playwright/test');
const { load, setSettings, runPasses, flush, VIDEO } = require('./harness');

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

test('ambient light: only the clip on screen is lit, and it relights on the way back', async ({ page }) => {
  const clip = (id) => `<div style="overflow:hidden;width:640px">${VIDEO(`id="${id}"`)}</div>`;
  await load(page, {
    site: 'instagram',
    url: 'https://www.instagram.com/reels/abc/',
    html: `<div style="margin-left:300px">${clip('a')}<div style="height:900px"></div>${clip('b')}<div style="height:900px"></div></div>`
  });
  const lit = () => page.evaluate(() => Array.from(document.querySelectorAll('canvas[data-tar-ambient="lit"]'),
    (glow) => glow.nextElementSibling.querySelector('video').id));
  const showClip = (id) => page.evaluate((i) => {
    const video = document.getElementById(i);
    video.scrollIntoView();
    return video.play();
  }, id);

  await showClip('a');
  await expect.poll(lit).toEqual(['a']);
  await showClip('b');
  await expect.poll(lit).toEqual(['b']);
  await showClip('a');
  await expect.poll(lit).toEqual(['a']);
});

test.describe('Stories', () => {
  const url = 'https://www.instagram.com/stories/someone/123/';
  // IG's sound control: the button and the volume track share one slider element,
  // with the track first or last depending on where the control is.
  const STORY = `${VIDEO('id="v"')}
    <div role="slider" aria-label="調整音量"><div>
      <div id="track" style="width:32px;height:8px"></div>
      <div role="button" id="speaker" style="width:32px;height:32px"></div>
    </div></div>
    <div role="slider" aria-label="調整音量"><div>
      <div role="button" id="speaker2" style="width:32px;height:32px"></div>
      <div id="track2" style="width:32px;height:8px"></div>
    </div></div>`;
  const video = (page) => page.evaluate(() => {
    const { muted, volume, controls } = document.getElementById('v');
    return { muted, volume: +volume.toFixed(3), controls };
  });
  const igSpeaker = (page, muted) => page.evaluate((m) => { document.getElementById('v').muted = m; }, muted);

  test('stay IG’s: no native bar, its sound button works, at the default volume', async ({ page }) => {
    await load(page, { site: 'instagram', url, html: STORY });
    await igSpeaker(page, false);
    await flush(page, 100);
    expect(await video(page)).toEqual({ muted: false, volume: 0.1, controls: false });
    await igSpeaker(page, true);
    await flush(page, 100);
    expect((await video(page)).muted).toBe(true);
  });

  test('IG’s volume track goes, it could not change the level anyway; its sound button stays', async ({ page }) => {
    await load(page, { site: 'instagram', url, html: STORY });
    for (const id of ['track', 'track2']) await expect(page.locator('#' + id)).toBeHidden();
    for (const id of ['speaker', 'speaker2']) await expect(page.locator('#' + id)).toBeVisible();
  });

  test('a video the extension already manages is handed back on entering Stories', async ({ page }) => {
    await load(page, { site: 'instagram', url: 'https://www.instagram.com/reels/abc/', html: STORY });
    expect((await video(page)).controls).toBe(true);
    await expect(page.locator('#track')).toBeVisible();
    await page.evaluate(() => history.pushState({}, '', '/stories/someone/123/'));
    await runPasses(page);
    expect((await video(page)).controls).toBe(false);
    await expect(page.locator('#track')).toBeHidden();
    await igSpeaker(page, false);
    await flush(page, 100);
    expect((await video(page)).muted).toBe(false);
  });

  test('switching Instagram off gives the track back', async ({ page }) => {
    await load(page, { site: 'instagram', url, html: STORY });
    await setSettings(page, { videoControlsInstagram: false });
    await flush(page);
    await expect(page.locator('#track')).toBeVisible();
  });
});
