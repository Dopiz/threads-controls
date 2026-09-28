const { test, expect } = require('@playwright/test');
const { load, VIDEO } = require('./harness');

// media-guard.js runs in the page's MAIN world, so every media call it sees
// comes from platform JS; managed videos (data-desired-volume) are pinned.

test('pins platform volume writes on a managed video to its desired level', async ({ page }) => {
  await load(page, { site: null, html: VIDEO('data-desired-volume="0.2"') });
  const volume = await page.evaluate(() => {
    const v = document.querySelector('video');
    v.volume = 1;
    return v.volume;
  });
  expect(volume).toBeCloseTo(0.2);
});

test('leaves unmanaged videos alone', async ({ page }) => {
  await load(page, { site: null, html: VIDEO() });
  const volume = await page.evaluate(() => {
    const v = document.querySelector('video');
    v.volume = 0.7;
    return v.volume;
  });
  expect(volume).toBeCloseTo(0.7);
});

test('stops pinning once the extension drops desiredVolume (site toggled off)', async ({ page }) => {
  await load(page, { site: null, html: VIDEO('data-desired-volume="0.2"') });
  const volume = await page.evaluate(() => {
    const v = document.querySelector('video');
    delete v.dataset.desiredVolume;
    v.volume = 0.9;
    return v.volume;
  });
  expect(volume).toBeCloseTo(0.9);
});

test('pins an unmanaged video to the published page default, before it is audible', async ({ page }) => {
  await load(page, { site: null, html: VIDEO() });
  const volume = await page.evaluate(() => {
    document.documentElement.dataset.tarDefaultVolume = '0.15';
    const v = document.querySelector('video');
    v.volume = 1;
    return v.volume;
  });
  expect(volume).toBeCloseTo(0.15);
});

test('stamps platform mute writes so the extension can tell them from the user’s', async ({ page }) => {
  await load(page, { site: null, html: VIDEO() });
  const stamped = await page.evaluate(() => {
    const v = document.querySelector('video');
    v.muted = false;
    return !!v.dataset.tarJsMuteAt;
  });
  expect(stamped).toBe(true);
});
