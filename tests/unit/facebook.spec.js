const { test, expect } = require('@playwright/test');
const { load, setSettings, flush, VIDEO } = require('./harness');

// FB layout: the "Video player" chrome is a sibling overlay covering the video,
// holding the caption/owner block and FB's own control row (buttons + a seek
// slider labelled "Change Position", which FB does not translate). FB is
// handled for Reels only; the /reel/ link on the card makes this one.
const VIDEO_POST = `
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
const PLAYER = VIDEO_POST.replace('<a role="link" id="owner" href="#">', '<a role="link" id="owner" href="/reel/123/">');

test('regular (non-Reel) videos are left entirely to FB', async ({ page }) => {
  await load(page, { site: 'facebook', html: VIDEO_POST });
  expect(await page.evaluate(() => document.querySelector('video').controls)).toBe(false);
  await expect(page.locator('#chrome')).not.toHaveClass(/tar-fb/);
  await expect(page.locator('#mute')).toBeVisible();
  await expect(page.locator('#row')).toBeVisible();
  // ...and media-guard does not pin its volume (only the Reel viewer publishes a default).
  await expect(page.locator('html')).not.toHaveAttribute('data-tar-default-volume', /.*/);
  expect(await page.evaluate(() => { const v = document.querySelector('video'); v.volume = 1; return v.volume; })).toBe(1);
});

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
  const small = PLAYER.replace(/640px/g, '240px');
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

test.describe('small players (feed Reels cards)', () => {
  const SMALL = PLAYER.replace(/640px/g, '240px').replace(/360px/g, '420px');
  const chromeClasses = (page) => page.locator('#chrome').getAttribute('class');

  test('at rest (paused, pointer away) the whole chrome stays up, thumbnail and all', async ({ page }) => {
    await load(page, { site: 'facebook', html: SMALL });
    expect(await chromeClasses(page)).toMatch(/tar-fb-rest/);
    await expect(page.locator('#chrome')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.getElementById('chrome').getBoundingClientRect().height)).toBe(420);
  });

  test('hover clears the rest state; leaving while paused restores it at once', async ({ page }) => {
    await load(page, { site: 'facebook', html: SMALL });
    await page.mouse.move(120, 200);
    await flush(page, 100);
    await page.mouse.move(125, 205);
    expect(await chromeClasses(page)).not.toMatch(/tar-fb-rest/);
    await page.mouse.move(900, 600);
    await flush(page, 100);
    await page.mouse.move(905, 605);
    expect(await chromeClasses(page)).toMatch(/tar-fb-rest/);
    await expect(page.locator('#chrome')).toHaveCSS('transition-duration', '0s');
  });

  test('a playing small player is not at rest', async ({ page }) => {
    await load(page, { site: 'facebook', html: SMALL });
    await page.evaluate(() => document.querySelector('video').play());
    await flush(page, 100);
    expect(await chromeClasses(page)).not.toMatch(/tar-fb-rest/);
  });

  test('large players never rest', async ({ page }) => {
    await load(page, { site: 'facebook', html: PLAYER });
    expect(await chromeClasses(page)).not.toMatch(/tar-fb-rest/);
  });
});

test.describe('Reel viewer (/reel/<id>)', () => {
  // The card clips its content (rounded corners); an overlay layer over the
  // whole card holds the header (owner, FB's pause/mute/search, more) and the
  // bottom caption block on a gradient.
  const REEL = `
    <div id="card" style="position:absolute;left:500px;top:40px;width:350px;height:620px;overflow:hidden;border-radius:8px">
      ${VIDEO().replace(/640px/, '350px').replace(/360px/, '620px')}
      <div id="overlay" style="position:absolute;inset:0">
        <div style="position:absolute;top:10px;right:10px;display:flex">
          <div role="button" aria-label="暫停" id="pause">⏸</div>
          <div role="button" aria-label="取消靜音" id="mute">🔇</div>
          <div role="button" aria-label="搜尋" id="search">🔍</div>
          <div role="button" aria-label="更多選項" id="more">⋯</div>
        </div>
        <div id="caption" style="position:absolute;left:0;right:0;bottom:0;height:160px;background:linear-gradient(transparent, rgba(0,0,0,.6))">
          <a role="link" href="#" id="owner">Owner</a><div role="button" id="see-more">See more</div>
        </div>
      </div>
    </div>`;
  const url = 'https://www.facebook.com/reel/123/';

  test('moves the caption out to the left and hides FB’s duplicate buttons', async ({ page }) => {
    await load(page, { site: 'facebook', url, html: REEL });
    await expect(page.locator('#card')).toHaveClass(/tar-fb-reel-card/);
    const caption = await page.locator('#caption').boundingBox();
    expect(caption.x + caption.width).toBeLessThanOrEqual(500 - 20);
    await expect(page.locator('#caption')).toBeVisible();
    for (const id of ['pause', 'mute', 'search']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.locator('#more')).toBeVisible();
  });

  test('lets the pointer through the overlay to the video, links stay clickable', async ({ page }) => {
    await load(page, { site: 'facebook', url, html: REEL });
    const hit = (x, y) => page.evaluate(([a, b]) => document.elementFromPoint(a, b).id || document.elementFromPoint(a, b).tagName, [x, y]);
    expect(await hit(675, 640)).toBe('VIDEO');
    const more = await page.locator('#more').boundingBox();
    expect(await hit(more.x + more.width / 2, more.y + more.height / 2)).toBe('more');
  });

  test('without room on the left, the caption stays inside, lifted above the bar', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 720 });
    await load(page, { site: 'facebook', url, html: REEL.replace('left:500px', 'left:200px') });
    await expect(page.locator('#card')).toHaveClass(/tar-fb-reel-inset/);
    const caption = await page.locator('#caption').boundingBox();
    expect(caption.x).toBe(200);
    expect(caption.y + caption.height).toBe(40 + 620 - 60);
  });

  test('outside /reel/ the layout is left alone', async ({ page }) => {
    await load(page, { site: 'facebook', url: 'https://www.facebook.com/watch/', html: REEL });
    await expect(page.locator('#card')).not.toHaveClass(/tar-fb-reel/);
    await expect(page.locator('#search')).toBeVisible();
  });

  test('switching Facebook off restores the card', async ({ page }) => {
    await load(page, { site: 'facebook', url, html: REEL });
    await setSettings(page, { videoControlsFacebook: false });
    await flush(page);
    await expect(page.locator('.tar-fb-reel-card, .tar-fb-reel-hide, [data-tar-reel-caption], [data-tar-reel-overlay]')).toHaveCount(0);
    await expect(page.locator('#search')).toBeVisible();
    await expect(page.locator('#card')).toHaveCSS('overflow', 'hidden');
  });
});
