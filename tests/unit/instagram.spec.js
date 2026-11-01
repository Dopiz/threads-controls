const { test, expect } = require('@playwright/test');
const { load, setSettings, flush, VIDEO } = require('./harness');

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
