// Renders the Chrome Web Store images into store-assets/out/:
//   screenshot-1-hero.png    1280x800  (screenshot)
//   screenshot-2-popup.png   1280x800  (screenshot: the real popup + callouts)
//   promo-small.png           440x280  (small promo tile)
//   promo-marquee.png        1400x560  (marquee promo tile)
// All are 24-bit PNG without alpha, as the store requires.
//
//   npm run store-assets
//
// Not part of the packaged extension (the release zip only ships
// manifest.json, icon.png and src/).
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const manifest = require(path.join(ROOT, 'manifest.json'));

const pngUri = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const LOGO = pngUri(fs.readFileSync(path.join(__dirname, 'logo.png')));

const TITLE = 'Threads Controls';
const TAGLINE = 'Native video controls & spoiler auto-reveal';
const HERO_TAGLINE = 'Native video controls for Threads, Instagram & Facebook, plus spoiler auto-reveal';

// Site glyphs, same paths as the popup (src/popup/popup.html).
const popupHtml = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');
const glyph = (id) => popupHtml.match(new RegExp(`id="${id}"[^>]*>\\s*(<svg[\\s\\S]*?</svg>)`))[1];
const SITES = [
  { svg: glyph('site-threads').replace('fill="#000000"', 'fill="#ffffff"') },
  { svg: glyph('site-instagram') },
  { svg: glyph('site-facebook') }
];

// Shared look: deep navy with layered blue waves along the bottom.
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: var(--w); height: var(--h); overflow: hidden; }
  body {
    position: relative;
    font-family: Inter, "Segoe UI", system-ui, sans-serif;
    color: #fff;
    background:
      radial-gradient(120% 80% at 50% -10%, #1a2238 0%, rgba(26,34,56,0) 60%),
      linear-gradient(180deg, #0b0e17 0%, #0d1220 55%, #111a33 100%);
  }
  .waves { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: var(--wave-h); }
  .content { position: relative; z-index: 1; }
  .logo {
    border-radius: 22.5%;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 18px 40px rgba(0,0,0,0.55);
    display: block;
  }
  .title { font-weight: 800; letter-spacing: -0.02em; }
  .tagline { color: #9aa3b8; font-weight: 400; }
  .sites { display: flex; gap: var(--site-gap); }
  .site {
    width: var(--site); height: var(--site); border-radius: 26%;
    background: rgba(255,255,255,0.08);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
  }
  .site svg { width: 56%; height: 56%; }
`;

// Three translucent wave bands; the viewBox is stretched to the canvas width.
const WAVES = `
  <svg class="waves" viewBox="0 0 1400 240" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="w1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d2b52" stop-opacity="0.55"/><stop offset="1" stop-color="#1d2b52" stop-opacity="0.9"/></linearGradient>
      <linearGradient id="w2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22346a" stop-opacity="0.55"/><stop offset="1" stop-color="#22346a" stop-opacity="0.95"/></linearGradient>
      <linearGradient id="w3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#29407e" stop-opacity="0.6"/><stop offset="1" stop-color="#1f3163" stop-opacity="1"/></linearGradient>
    </defs>
    <path fill="url(#w1)" d="M0 70 C 220 20, 420 110, 700 70 S 1150 20, 1400 60 L1400 240 L0 240 Z"/>
    <path fill="url(#w2)" d="M0 125 C 260 80, 520 165, 780 125 S 1180 85, 1400 120 L1400 240 L0 240 Z"/>
    <path fill="url(#w3)" d="M0 180 C 240 150, 560 215, 860 180 S 1220 150, 1400 175 L1400 240 L0 240 Z"/>
  </svg>`;

const sites = () => `<div class="sites">${SITES.map((s) => `<div class="site">${s.svg}</div>`).join('')}</div>`;

const FONT = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=block';
const page = ({ w, h, css, body, waveH }) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONT}"><style>
  :root { --w: ${w}px; --h: ${h}px; --wave-h: ${waveH}px; }
  ${BASE_CSS}
  ${css}
</style></head><body>${WAVES}${body}</body></html>`;

// Centered stack: logo, title, optional tagline, site badges (sizes in px).
const centered = ({ w, h, logo, title, tagline = null, taglineSize = 0, site, gap, waveH, lift = 0 }) => page({
  w, h, waveH,
  css: `
    .content { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(${-lift}px); }
    .logo { width: ${logo}px; height: ${logo}px; }
    .title { font-size: ${title}px; margin-top: ${gap}px; }
    .tagline { font-size: ${taglineSize}px; margin-top: ${Math.round(gap * 0.45)}px; }
    .sites { --site: ${site}px; --site-gap: ${Math.round(site * 0.45)}px; margin-top: ${Math.round(gap * 1.1)}px; }`,
  body: `<div class="content">
    <img class="logo" src="${LOGO}">
    <div class="title">${TITLE}</div>
    ${tagline ? `<div class="tagline">${tagline}</div>` : ''}
    ${sites()}
  </div>`
});

const ASSETS = {
  'screenshot-1-hero': {
    w: 1280, h: 800,
    html: () => centered({ w: 1280, h: 800, logo: 150, title: 64, tagline: HERO_TAGLINE, taglineSize: 22, site: 44, gap: 34, waveH: 300, lift: 40 })
  },
  'promo-small': {
    w: 440, h: 280,
    html: () => centered({ w: 440, h: 280, logo: 68, title: 32, site: 24, gap: 14, waveH: 110, lift: 6 })
  },
  'promo-marquee': {
    w: 1400, h: 560,
    html: () => page({
      w: 1400, h: 560, waveH: 230,
      css: `
        .content { height: 100%; display: flex; align-items: center; justify-content: center; gap: 56px; transform: translateY(-24px); }
        .logo { width: 210px; height: 210px; }
        .title { font-size: 76px; }
        .tagline { font-size: 26px; margin-top: 12px; }
        .sites { --site: 44px; --site-gap: 18px; margin-top: 30px; }`,
      body: `<div class="content">
        <img class="logo" src="${LOGO}">
        <div><div class="title">${TITLE}</div><div class="tagline">${TAGLINE}</div>${sites()}</div>
      </div>`
    })
  },
  'screenshot-2-popup': { w: 1280, h: 800, html: (popup) => popupShowcase(popup) }
};

// The real popup (src/popup/popup.html), rendered with a stubbed chrome API
// at 2x, plus where its rows sit, for the callouts.
async function renderPopup(browser) {
  const ctx = await browser.newContext({ viewport: { width: 280, height: 600 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.addInitScript((version) => {
    const settings = {
      revealText: true, revealMedia: true, textHighlight: 'rgba(250,204,21,0.35)',
      videoControlsThreads: true, videoControlsInstagram: true, videoControlsFacebook: true,
      defaultVolume: 10
    };
    window.chrome = {
      runtime: { getManifest: () => ({ version }) },
      // async like the real API: popup.js relies on running to completion first
      storage: { sync: { get: (d, cb) => setTimeout(() => cb({ ...d, ...settings })), set: () => {} } }
    };
  }, manifest.version);
  await p.goto('file://' + path.join(ROOT, 'src/popup/popup.html').replace(/\\/g, '/'));
  await p.waitForTimeout(200);
  const rows = await p.evaluate(() => {
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const items = document.querySelectorAll('.item');
    return {
      height: document.body.getBoundingClientRect().height,
      text: mid(items[0]), media: mid(items[1]),
      sites: mid(document.querySelector('.site-icons')),
      volume: (mid(items[2]) + mid(document.querySelector('.slider-row'))) / 2
    };
  });
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: 280, height: Math.ceil(rows.height) } });
  await ctx.close();
  return { src: pngUri(png), rows };
}

function popupShowcase({ src, rows }) {
  const scale = 1.6;
  const popupW = 280 * scale, popupH = rows.height * scale;
  const left = 150, top = Math.round((800 - popupH) / 2) - 20;
  const lineStart = left + popupW + 14, labelX = 690;
  const callouts = [
    ['text', 'Auto-reveal hidden spoiler text', 'Optional highlight marks what was hidden'],
    ['media', 'Auto-reveal hidden images & videos', 'Spoiler-covered media shows right away'],
    ['sites', 'Native video controls, per site', 'Threads, Instagram, Facebook: click to toggle'],
    ['volume', 'Default volume for every video', 'No more 100% blasts when you unmute']
  ].map(([row, head, sub]) => {
    const y = Math.round(top + rows[row] * scale);
    return `
      <div class="dot" style="left:${lineStart - 5}px; top:${y - 5}px"></div>
      <div class="line" style="left:${lineStart}px; top:${y}px; width:${labelX - lineStart - 18}px"></div>
      <div class="callout" style="left:${labelX}px; top:${y}px">
        <div class="head">${head}</div><div class="sub">${sub}</div>
      </div>`;
  }).join('');
  return page({
    w: 1280, h: 800, waveH: 260,
    css: `
      .popup {
        position: absolute; left: ${left}px; top: ${top}px; width: ${popupW}px; height: ${popupH}px;
        border-radius: 14px; overflow: hidden;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 30px 70px rgba(0,0,0,0.6);
      }
      .popup img { width: 100%; height: 100%; display: block; }
      .line { position: absolute; height: 2px; background: linear-gradient(90deg, rgba(255,255,255,0.75), rgba(255,255,255,0.25)); }
      .dot { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 4px rgba(255,255,255,0.15); }
      .callout { position: absolute; transform: translateY(-50%); }
      .callout .head { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
      .callout .sub { font-size: 17px; color: #9aa3b8; margin-top: 4px; }`,
    body: `<div class="content"><div class="popup"><img src="${src}"></div>${callouts}</div>`
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const popup = await renderPopup(browser);
  for (const [name, { w, h, html }] of Object.entries(ASSETS)) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(html(popup), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const png = await p.screenshot({ type: 'png' });
    // Store requirement: 24-bit PNG, no alpha (IHDR: bit depth 8, colour type 2).
    if (png[24] !== 8 || png[25] !== 2) throw new Error(`${name}: not a 24-bit RGB PNG`);
    if (png.readUInt32BE(16) !== w || png.readUInt32BE(20) !== h) throw new Error(`${name}: wrong size`);
    fs.writeFileSync(path.join(OUT, `${name}.png`), png);
    console.log(`${name}.png  ${w}x${h}`);
    await p.close();
  }
  await browser.close();
})();
