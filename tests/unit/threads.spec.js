const { test, expect } = require('@playwright/test');
const { load, setSettings, runPasses, flush } = require('./harness');

test.describe('spoiler text', () => {
  // Current DOM: the hidden text sits in span[data-text-fragment="spoiler"]
  // inside a role="button", with a sibling <canvas> painting the grain effect.
  const MODERN = `
    <span dir="auto" id="post">Before
      <span><div role="button" style="display:inline"><span data-text-fragment="spoiler"><span>THE SECRET</span></span></div><canvas></canvas></span>
      after</span>`;
  // Legacy DOM: an inline role="button" with a grey mask background.
  const LEGACY = `
    <span dir="auto" id="post"><div role="button" style="display:inline;background-color:rgb(80, 80, 80)"><div><span>OLD SECRET</span></div></div></span>`;

  test('reveals current-DOM spoilers and removes the grain canvas', async ({ page }) => {
    await load(page, { site: 'threads', html: MODERN });
    await expect(page.locator('#post')).toContainText('THE SECRET');
    await expect(page.locator('#post [role="button"]')).toHaveCount(0);
    await expect(page.locator('#post canvas')).toHaveCount(0);
  });

  test('reveals legacy-DOM spoilers', async ({ page }) => {
    await load(page, { site: 'threads', html: LEGACY });
    await expect(page.locator('#post')).toContainText('OLD SECRET');
    await expect(page.locator('#post [role="button"]')).toHaveCount(0);
  });

  test('applies the highlight colour to revealed text', async ({ page }) => {
    await load(page, { site: 'threads', html: MODERN, settings: { textHighlight: 'rgb(255, 235, 59)' } });
    await expect(page.getByText('THE SECRET', { exact: true })).toHaveCSS('background-color', 'rgb(255, 235, 59)');
  });

  test('leaves spoilers hidden when text reveal is off', async ({ page }) => {
    await load(page, { site: 'threads', html: MODERN, settings: { revealText: false } });
    await expect(page.locator('#post span[data-text-fragment="spoiler"]')).toHaveCount(1);
    await expect(page.locator('#post canvas')).toHaveCount(1);
  });
});

test.describe('spoiler media', () => {
  // The media spoiler is a role="button" wrapping the media plus a blur layer
  // styled with --x-opacity; clicking it is how the platform reveals it.
  const MEDIA = `
    <div role="button" id="spoiler"><picture><img width="100" height="100"></picture><div style="--x-opacity:1"></div></div>
    <div role="button" id="plain"><img width="100" height="100"></div>`;
  const COUNT_CLICKS = `
    window.__clicks = {};
    document.addEventListener('click', (e) => {
      const id = e.target.closest('[id]').id;
      window.__clicks[id] = (window.__clicks[id] || 0) + 1;
    });`;

  test('clicks each spoiler cover once, and nothing else', async ({ page }) => {
    await load(page, { site: 'threads', html: MEDIA, beforeLoad: COUNT_CLICKS });
    await runPasses(page); // a second pass must not click again
    expect(await page.evaluate(() => window.__clicks)).toEqual({ spoiler: 1 });
  });

  test('does not click when media reveal is off', async ({ page }) => {
    await load(page, { site: 'threads', html: MEDIA, beforeLoad: COUNT_CLICKS, settings: { revealMedia: false } });
    expect(await page.evaluate(() => window.__clicks)).toEqual({});
  });
});

test.describe('video', () => {
  // Single-video post: player chrome overlays the video; nothing else media-ish
  // shares its row.
  const SINGLE = `
    <div style="position:relative;width:640px;height:320px">
      <video style="display:block;width:640px;height:320px" muted></video>
      <div aria-label="Video player" id="chrome" style="position:absolute;inset:0"></div>
    </div>`;

  // Carousel: two media side by side; the first is a video under an overlay
  // that carries the platform's drag gesture.
  const CAROUSEL = `
    <div style="display:flex;gap:6px;margin:40px">
      <div style="position:relative;width:210px;height:280px">
        <video style="display:block;width:210px;height:280px" muted></video>
        <div aria-label="Video player" id="overlay" style="position:absolute;inset:0"></div>
      </div>
      <div style="width:210px;height:280px"><picture><img style="display:block;width:210px;height:280px"></picture></div>
    </div>`;

  test('single video: hovering hides the player chrome, leaving restores it', async ({ page }) => {
    await load(page, { site: 'threads', html: SINGLE });
    expect(await page.evaluate(() => document.querySelector('video').dataset.tarKeepChrome)).toBeUndefined();
    await page.mouse.move(300, 150);
    await expect(page.locator('#chrome')).toHaveCSS('visibility', 'hidden');
    await flush(page, 100);
    await page.mouse.move(900, 600);
    await expect(page.locator('#chrome')).toHaveCSS('visibility', 'visible');
  });

  test('carousel: keeps the overlay but clips it off the control-bar strip', async ({ page }) => {
    await load(page, { site: 'threads', html: CAROUSEL });
    expect(await page.evaluate(() => document.querySelector('video').dataset.tarKeepChrome)).toBe('1');
    await expect(page.locator('#overlay')).toHaveAttribute('data-tar-clipped', '1');
    await expect(page.locator('#overlay')).toHaveCSS('clip-path', 'inset(0px 0px 60px)');
    // The bottom strip now reaches the video (its native control bar)...
    const bottom = await page.evaluate(() => {
      const r = document.querySelector('video').getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.bottom - 15).tagName;
    });
    expect(bottom).toBe('VIDEO');
    // ...while the rest still hits the overlay (drag gesture intact).
    const middle = await page.evaluate(() => {
      const r = document.querySelector('video').getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).id;
    });
    expect(middle).toBe('overlay');
  });

  test('media viewer: an off-centre preloaded neighbour gets no controls', async ({ page }) => {
    await load(page, {
      site: 'threads',
      url: 'https://www.threads.com/@someone/post/ABC/media',
      html: '<video muted style="position:absolute;left:900px;top:0;width:500px;height:600px"></video>'
    });
    expect(await page.evaluate(() => document.querySelector('video').controls)).toBe(false);
  });

  test('post page: a tall video is a normal post video, not the media viewer', async ({ page }) => {
    await load(page, {
      site: 'threads',
      url: 'https://www.threads.com/@someone/post/ABC',
      html: SINGLE.replace(/320px/g, '480px')
    });
    const v = await page.evaluate(() => {
      const el = document.querySelector('video');
      return { controls: el.controls, keep: el.dataset.tarKeepChrome || null };
    });
    expect(v).toEqual({ controls: true, keep: null });
  });

  test('switching Threads off un-clips overlays and restores hidden chrome', async ({ page }) => {
    await load(page, { site: 'threads', html: SINGLE + CAROUSEL });
    await page.mouse.move(300, 150); // hide the single post's chrome
    await expect(page.locator('#chrome')).toHaveCSS('visibility', 'hidden');
    await setSettings(page, { videoControlsThreads: false });
    await flush(page);
    await expect(page.locator('#chrome')).toHaveCSS('visibility', 'visible');
    await expect(page.locator('#overlay')).not.toHaveAttribute('data-tar-clipped', /.*/);
    await expect(page.locator('#overlay')).toHaveCSS('clip-path', 'none');
    expect(await page.evaluate(() => Array.from(document.querySelectorAll('video'), (v) => v.controls))).toEqual([false, false]);
  });
});
