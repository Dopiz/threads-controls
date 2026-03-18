const DEFAULTS = { revealText: true, revealMedia: true };

const toggleText  = document.getElementById('toggle-text');
const toggleMedia = document.getElementById('toggle-media');

chrome.storage.sync.get(DEFAULTS, (settings) => {
  toggleText.checked  = settings.revealText;
  toggleMedia.checked = settings.revealMedia;
});

toggleText.addEventListener('change', () => {
  chrome.storage.sync.set({ revealText: toggleText.checked });
});

toggleMedia.addEventListener('change', () => {
  chrome.storage.sync.set({ revealMedia: toggleMedia.checked });
});
