# Threads Controls

Native video controls for Threads, Instagram and Facebook, plus spoiler auto-reveal on Threads.

## Install

[**Chrome Web Store**](https://chromewebstore.google.com/detail/ehcnpebbpcajfboepnlkmibfojccokdf)

## Features

- Enable native browser video controls (playback, seek, volume, fullscreen) on Threads, Instagram and Facebook — toggle each site independently
- Set a default volume for all videos, kept stable against the platforms' forced volume resets
- Automatically reveals hidden spoiler text, images, and videos on Threads
- Highlight revealed spoiler text with a background color to distinguish originally hidden content
- Works instantly after installation — no configuration needed

## Settings

Click the extension icon to open the popup:

### Spoiler Reveal

| Option | Description |
|--------|-------------|
| **Text** | Auto-reveal hidden spoiler text |
| **Highlight Color** | Background color for revealed spoiler text (None / Blue / Yellow / Green / Purple) |
| **Media** | Auto-reveal hidden spoiler images & videos |

### Video Controls

| Option | Description |
|--------|-------------|
| **Site icons** | Click the Threads / Instagram / Facebook icons to enable or disable native video controls per site (grayed out = disabled). Default: only Threads enabled |
| **Default Volume** | Set the default volume level (0–100%) for all videos |

Videos default to muted — when unmuted, they play at the configured volume. On Instagram and Facebook the sound carries from clip to clip: after you unmute (or mute), the next Reel or video starts the same way, at the volume you last set. Site toggles and the default volume apply immediately, without reloading the page.

## Development

Tests use [Playwright](https://playwright.dev) (Node.js 18+):

```sh
npm install
npx playwright install chromium
npm test            # unit: content scripts against synthetic DOM, offline (~3s)
npm run test:e2e    # e2e: the unpacked extension on the live sites, logged out (~3min)
HEADED=1 npm run test:e2e   # visible window (PowerShell: $env:HEADED=1; npm run test:e2e)
```

- **Unit** (`tests/unit/`) loads the content scripts into a local page with a stubbed `chrome.storage`, split across the same JS worlds as on the real sites: the page (platform) world with `media-guard.js`, the extension's isolated world, and a "user" world standing in for the browser's native control bar.
- **Store images**: `npm run store-assets` renders the Chrome Web Store screenshots (1280x800) and promo tiles (440x280, 1400x560) into `store-assets/out/`, using `store-assets/logo.png` and the real popup. Re-run after changing the popup or bumping the version.
- **E2E** (`tests/e2e/`) drives real posts listed in [`tests/e2e/urls.js`](tests/e2e/urls.js) — single/carousel videos, Reels, spoiler text and media. Third-party posts can disappear: a test whose post is gone is skipped with a note, and the file explains how to find replacements.

## Privacy

- No data is collected or sent to any server
- Only runs on `threads.com`, `instagram.com` and `facebook.com`
- Uses `chrome.storage.sync` solely for storing your preferences

## License

MIT
