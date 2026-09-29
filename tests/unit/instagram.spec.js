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
