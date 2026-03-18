const DEFAULTS = { revealText: true, revealMedia: true, textHighlight: '' };

const toggleText  = document.getElementById('toggle-text');
const toggleMedia = document.getElementById('toggle-media');
const swatch      = document.getElementById('text-color-swatch');
const dropdown    = document.getElementById('text-color-dropdown');

chrome.storage.sync.get(DEFAULTS, (settings) => {
  toggleText.checked  = settings.revealText;
  toggleMedia.checked = settings.revealMedia;
  updateSwatch(settings.textHighlight);
});

toggleText.addEventListener('change', () => {
  chrome.storage.sync.set({ revealText: toggleText.checked });
});

toggleMedia.addEventListener('change', () => {
  chrome.storage.sync.set({ revealMedia: toggleMedia.checked });
});

// Color picker
swatch.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdown.classList.toggle('open');
});

document.addEventListener('click', () => dropdown.classList.remove('open'));

const colorBtns = dropdown.querySelectorAll('.color-option');

for (const btn of colorBtns) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const color = btn.dataset.color;
    chrome.storage.sync.set({ textHighlight: color });
    updateSwatch(color);
    dropdown.classList.remove('open');
  });
}

function updateSwatch(color) {
  if (color) {
    swatch.classList.add('has-color');
    swatch.style.setProperty('--swatch-color', color);
  } else {
    swatch.classList.remove('has-color');
  }
  for (const btn of colorBtns) {
    btn.classList.toggle('selected', btn.dataset.color === color);
  }
}
