const { test, expect } = require('@playwright/test');
const { load, setSettings, flush, VIDEO } = require('./harness');

// FB layout: the "Video player" chrome is a sibling overlay covering the video,
// holding the caption/owner block and FB's own control row (buttons + a seek
// slider labelled "Change Position", which FB does not translate).
const PLAYER = `
  <div style="position:relative;width:640px;height:360px">
    ${VIDEO()}
    <div aria-label="Video player" id="chrome" style="position:absolute;inset:0">
      <a role="link" id="owner" href="#">Owner</a>
      <div id="row" style="position:absolute;left:0;right:0;bottom:0;height:44px">
        <div role="button" aria-label="暫停" id="pause">⏸</div>
        <div><div><div role="slider" aria-label="Change Position" id="seek"></div></div></div>
        <div role="button" aria-label="設定" id="settings">⚙</div>
        <div role="button" aria-label="取消靜音" id="mute"><svg></svg></div>
      </div>
    </div>
  </div>`;

test('hides FB’s own control row and mute button, keeps the caption/owner block', async ({ page }) => {
  await load(page, { site: 'facebook', html: PLAYER });
  await expect(page.locator('#chrome')).toHaveClass(/tar-fb-chrome/);
  await expect(page.locator('#row')).toHaveClass(/tar-fb-bar/);
  await expect(page.locator('#row')).toHaveCSS('display', 'none');
  await expect(page.locator('#mute')).toHaveClass(/tar-hide-mute/);
  await expect(page.locator('#chrome')).not.toHaveClass(/tar-fb-bar/);
  expect(await page.evaluate(() => document.querySelector('video').controls)).toBe(true);
});

test('never hides a tall block as the control row', async ({ page }) => {
  // A caption area that happens to wrap the slider must not be taken for the row.
  const tall = PLAYER.replace('height:44px', 'height:200px');
  await load(page, { site: 'facebook', html: tall });
  await expect(page.locator('#row')).not.toHaveClass(/tar-fb-bar/);
});

test('reveals the chrome while the pointer is over the video', async ({ page }) => {
  await load(page, { site: 'facebook', html: PLAYER });
  await expect(page.locator('#chrome')).not.toHaveClass(/tar-fb-show/);
  await page.mouse.move(320, 150);
  await flush(page, 100);
  await page.mouse.move(330, 160); // past the 80ms throttle
  await expect(page.locator('#chrome')).toHaveClass(/tar-fb-show/);
  await page.mouse.move(900, 600);
  await flush(page, 100);
  await page.mouse.move(910, 610);
  await expect(page.locator('#chrome')).not.toHaveClass(/tar-fb-show/);
});

test('large players keep the gradient tail under the caption; small ones (Reels cards) drop it', async ({ page }) => {
  const small = PLAYER.replace(/640px/g, '240px').replace('width:640px', 'width:240px');
  await load(page, { site: 'facebook', html: PLAYER + small.replace('id="chrome"', 'id="small-chrome"').replace(/id="(row|owner|pause|seek|settings|mute)"/g, 'id="small-$1"') });
  const tail = (id) => page.evaluate((i) => getComputedStyle(document.getElementById(i), '::after').content, id);
  expect(await tail('chrome')).not.toBe('none');
  await expect(page.locator('#small-chrome')).toHaveClass(/tar-fb-compact/);
  expect(await tail('small-chrome')).toBe('none');
});

test('switching Facebook off removes every FB class', async ({ page }) => {
  await load(page, { site: 'facebook', html: PLAYER });
  await page.mouse.move(320, 150);
  await setSettings(page, { videoControlsFacebook: false });
  await flush(page);
  await expect(page.locator('.tar-fb-chrome, .tar-fb-bar, .tar-fb-show, .tar-hide-mute')).toHaveCount(0);
  await expect(page.locator('#row')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('video').controls)).toBe(false);
});
