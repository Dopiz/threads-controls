// Runs the content scripts against synthetic DOM, with the same three-way split
// of JS worlds they meet on the real sites:
//  - main world      = the platform's page JS. media-guard.js is loaded here, as
//                      the manifest does; page.evaluate() acts as the platform.
//  - "extension" world (isolated) = common.js + the site script, with a stubbed
//                      chrome.storage. Drive it with ext().
//  - "user" world (isolated) = stands in for the browser's native control bar:
//                      its media writes bypass the main-world guards and carry
//                      no stamp, exactly like a click on the real bar. Use user().
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8');

const DEFAULT_SETTINGS = require('../settings');

// chrome.storage stub: get() answers async like the real API (and resolves
// window.__tarReady once the extension's first pass has run); set() updates the
// store and fires onChanged listeners with { key: { oldValue, newValue } }.
function chromeStub(settings) {
  window.__store = settings;
  window.__onChanged = [];
  let ready;
  window.__tarReady = new Promise((r) => { ready = r; });
  window.chrome = {
    storage: {
      sync: {
        get(defaults, cb) {
          setTimeout(() => {
            cb({ ...defaults, ...window.__store });
            ready();
          });
        },
        set(items, cb) {
          const changes = {};
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: window.__store[key], newValue: value };
            window.__store[key] = value;
          }
          setTimeout(() => {
            for (const fn of window.__onChanged) fn(changes, 'sync');
            if (cb) cb();
          });
        }
      },
      onChanged: { addListener(fn) { window.__onChanged.push(fn); } }
    }
  };
}

const worlds = new WeakMap();

async function evaluateIn(page, world, source) {
  const { cdp, contexts } = worlds.get(page);
  const r = await cdp.send('Runtime.evaluate', {
    expression: source,
    contextId: contexts[world],
    awaitPromise: true,
    returnByValue: true
  });
  if (r.exceptionDetails) {
    throw new Error(`[${world} world] ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  }
  return r.result.value;
}

const call = (fn, arg) => `(${fn})(${arg === undefined ? '' : JSON.stringify(arg)})`;

/** Evaluate fn(arg) in the extension's isolated world (TAR lives there). */
const ext = (page, fn, arg) => evaluateIn(page, 'extension', call(fn, arg));
/** Evaluate fn(arg) as the user acting through the native control bar. */
const user = (page, fn, arg) => evaluateIn(page, 'user', call(fn, arg));

/**
 * Render `html` into the page, then load the extension like the manifest does.
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {'threads'|'instagram'|'facebook'|null} opts.site  null: media-guard.js only
 * @param {string} [opts.html]
 * @param {object} [opts.settings]    overrides of DEFAULT_SETTINGS
 * @param {string} [opts.beforeLoad]  platform JS run before the extension loads
 *                                    (e.g. listeners that must precede its own)
 * @param {string} [opts.extBeforeLoad] JS run in the extension world just
 *                                    before its scripts (instrumentation)
 * @param {string} [opts.url]         serve the page at this URL (e.g. a Threads
 *                                    /media viewer path) instead of about:blank
 */
async function load(page, { site, html = '', settings = {}, beforeLoad = '', extBeforeLoad = '', url = null }) {
  const doc = `<!doctype html><html><head></head><body style="margin:0">${html}</body></html>`;
  if (url) {
    await page.route(url, (route) => route.fulfill({ contentType: 'text/html', body: doc }));
    await page.goto(url);
  } else {
    await page.setContent(doc);
  }

  const cdp = await page.context().newCDPSession(page);
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const contexts = {};
  for (const world of ['extension', 'user']) {
    const r = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: `tar-${world}` });
    contexts[world] = r.executionContextId;
  }
  worlds.set(page, { cdp, contexts });

  // document_start in the manifest: before any platform code touches media.
  await page.addScriptTag({ content: read('media-guard.js') });
  if (beforeLoad) await page.addScriptTag({ content: beforeLoad });
  if (!site) return;

  // One evaluation for stub + both files, like the manifest's content_scripts
  // entry: the async storage callback (first pass run) must not fire before
  // the site script has registered its passes.
  await evaluateIn(page, 'extension', [
    call(chromeStub, { ...DEFAULT_SETTINGS, ...settings }),
    extBeforeLoad,
    read('common.js'),
    read(`sites/${site}.js`)
  ].join(';\n'));
  await ext(page, () => window.__tarReady);
}

// Write settings through the stub so onChanged fires like a popup change.
async function setSettings(page, items) {
  await ext(page, (i) => new Promise((r) => chrome.storage.sync.set(i, r)), items);
}

async function runPasses(page) {
  await ext(page, () => TAR.runPasses());
}

// Let queued media events (volumechange is dispatched async) run.
async function flush(page, ms = 30) {
  await page.waitForTimeout(ms);
}

// Wait out the extension's 600ms post-unmute window, so later volume changes
// count as the user's own.
const settle = (page) => flush(page, 700);

// 20s of silence as 8kHz 8-bit mono WAV: a real, playable source, so paused /
// play() / pause() behave for real (the unit project disables the autoplay
// gesture requirement, so unmuted playback is allowed too).
const SILENCE = (() => {
  const samples = 8000 * 20;
  const b = Buffer.alloc(44 + samples, 0x80);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36); b.writeUInt32LE(samples, 40);
  return 'data:audio/wav;base64,' + b.toString('base64');
})();

// A sized, muted <video> with a playable source (starts paused).
const VIDEO = (attrs = '') =>
  `<video ${attrs} src="${SILENCE}" loop muted style="display:block;width:640px;height:360px"></video>`;

module.exports = { load, ext, user, setSettings, runPasses, flush, settle, VIDEO };
