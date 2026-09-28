// Shared e2e setup: a fresh Chromium profile per test with the unpacked
// extension loaded, settings reset through the popup page, plus helpers for
// the logged-out login walls and for clicking Chrome's native control bar.
const path = require('path');
const { test: base, chromium, expect } = require('@playwright/test');

const EXTENSION = path.resolve(__dirname, '..', '..');

const SETTINGS = {
  revealText: true,
  revealMedia: true,
  textHighlight: '',
  videoControlsThreads: true,
  videoControlsInstagram: true,
  videoControlsFacebook: true,
  defaultVolume: 10
};

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      // The "chromium" channel runs new headless, which supports extensions.
      // HEADED=1 opens a visible window for debugging.
      channel: 'chromium',
      headless: !process.env.HEADED,
      locale: 'zh-TW',
      viewport: { width: 1280, height: 720 },
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`]
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto('chrome://extensions');
    const id = await page.evaluate(() => new Promise((resolve) => {
      chrome.management.getAll((list) => resolve(list.find((e) => e.name === 'Threads Controls').id));
    }));
    await page.close();
    await use(id);
  },

  // settings.set({...}) writes chrome.storage.sync from the popup page, the same
  // path a user's click in the popup takes; running tabs get onChanged live.
  settings: async ({ context, extensionId }, use) => {
    const set = async (items) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
      await popup.evaluate((i) => new Promise((r) => chrome.storage.sync.set(i, r)), items);
      await popup.close();
    };
    await set(SETTINGS);
    await use({ set });
  },

  page: async ({ context, settings }, use) => {
    void settings; // settings must be reset before the page navigates
    const page = context.pages()[0] || await context.newPage();
    await use(page);
  }
});

// Close (or, on Threads, hide) the logged-out sign-up dialogs. A dialog that
// holds a video is a media viewer, never a wall, and is left alone.
async function dismissLoginWalls(page) {
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (dialog.querySelector('video')) continue;
      const close = dialog.querySelector('[aria-label="關閉"], [aria-label="Close"]');
      if (close) {
        (close.closest('[role="button"], button') || close)
          .dispatchEvent(new MouseEvent('click', { bubbles: true }));
        continue;
      }
      let root = dialog;
      while (root.parentElement && root.parentElement !== document.body) root = root.parentElement;
      if (!root.querySelector('video')) root.style.display = 'none';
    }
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await dismissLoginWalls(page);
  await page.waitForTimeout(500);
  await dismissLoginWalls(page);
}

// Snapshot of every rendered <video> with the state the tests assert on.
async function videos(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('video'))
    .map((v, i) => {
      const r = v.getBoundingClientRect();
      return {
        i, x: r.left, y: r.top, w: r.width, h: r.height,
        controls: v.controls, paused: v.paused, muted: v.muted,
        volume: +v.volume.toFixed(3), desired: v.dataset.desiredVolume,
        keepChrome: v.dataset.tarKeepChrome === '1'
      };
    })
    .filter((v) => v.w > 0));
}

async function video(page, i) {
  return (await videos(page)).find((v) => v.i === i);
}

// Scroll a video to the viewport centre and let a pass run (they are debounced).
async function center(page, i) {
  await page.evaluate((n) => document.querySelectorAll('video')[n].scrollIntoView({ block: 'center', inline: 'center' }), i);
  await page.waitForTimeout(1200);
  return video(page, i);
}

// Chrome's native control bar (one-row layout, >= ~300px wide): buttons row
// ~49px above the bottom edge, timeline ~22px above it; play/pause at the left,
// mute 120px from the right edge.
const bar = {
  playPause: (v) => ({ x: v.x + 24, y: v.y + v.h - 49 }),
  mute: (v) => ({ x: v.x + v.w - 120, y: v.y + v.h - 49 }),
  timeline: (v, fraction) => ({ x: v.x + 26 + (v.w - 52) * fraction, y: v.y + v.h - 22 })
};

async function click(page, point, wait = 1000) {
  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(wait);
}

// Hover the video so the native bar shows, then click one of its parts.
async function clickBar(page, v, which, { fraction = 0, wait = 1000 } = {}) {
  await page.mouse.move(v.x + v.w / 2, v.y + v.h / 2);
  await page.waitForTimeout(300);
  await click(page, bar[which](v, fraction), wait);
}

// Mute-labelled platform buttons that are still visible over the given video.
async function visiblePlatformMuteButtons(page, i) {
  return page.evaluate((n) => {
    const vr = document.querySelectorAll('video')[n].getBoundingClientRect();
    return Array.from(document.querySelectorAll('div[role="button"]')).filter((b) => {
      const svg = b.querySelector('svg');
      const title = svg && svg.querySelector('title');
      const label = b.getAttribute('aria-label') || (svg && svg.getAttribute('aria-label')) || (title && title.textContent) || '';
      if (!/靜音|mute/i.test(label)) return false;
      const r = b.getBoundingClientRect();
      const inside = r.width > 0 && r.left >= vr.left - 1 && r.right <= vr.right + 1 && r.top >= vr.top - 1 && r.bottom <= vr.bottom + 1;
      return inside && getComputedStyle(b).visibility !== 'hidden' && +getComputedStyle(b).opacity > 0.1;
    }).length;
  }, i);
}

// Seek back to the start so a short clip (IG Reels do not loop logged-out)
// cannot end halfway through a multi-step interaction.
async function rewind(page, i) {
  await page.evaluate((n) => { document.querySelectorAll('video')[n].currentTime = 0; }, i);
  await page.waitForTimeout(1200); // clear the post-seek window before acting
}

// Unmute through the native bar, then pause and resume: the platform must not
// win back the mute, and the volume must stay at the default (10%).
async function expectSoundSurvivesPauseResume(page, i) {
  await rewind(page, i);
  let v = await video(page, i);
  if (v.paused) await clickBar(page, v, 'playPause');
  await clickBar(page, v, 'mute');
  v = await video(page, i);
  expect(v, 'unmuted through the native bar').toMatchObject({ muted: false, volume: 0.1 });

  await clickBar(page, v, 'playPause');
  expect((await video(page, i)).paused).toBe(true);
  await clickBar(page, v, 'playPause', { wait: 1500 });
  v = await video(page, i);
  expect(v, 'still audible after pause/resume').toMatchObject({ paused: false, muted: false, volume: 0.1 });
}

module.exports = {
  test, expect, SETTINGS,
  open, dismissLoginWalls, videos, video, center, rewind, bar, click, clickBar,
  visiblePlatformMuteButtons, expectSoundSurvivesPauseResume
};
