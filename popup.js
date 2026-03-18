const DEFAULTS = { revealText: true, revealMedia: true, textHighlight: '', videoControls: true, defaultVolume: 0 };

const toggleText  = document.getElementById('toggle-text');
const toggleMedia = document.getElementById('toggle-media');
const swatch      = document.getElementById('text-color-swatch');
const dropdown    = document.getElementById('text-color-dropdown');
const toggleVideo = document.getElementById('toggle-video');
const sliderVolume = document.getElementById('slider-volume');
const volumeValue  = document.getElementById('volume-value');

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

chrome.storage.sync.get(DEFAULTS, (settings) => {
  toggleText.checked  = settings.revealText;
  toggleMedia.checked = settings.revealMedia;
  updateSwatch(settings.textHighlight);
  toggleVideo.checked = settings.videoControls;
  sliderVolume.value  = settings.defaultVolume;
  volumeValue.textContent = settings.defaultVolume + '%';
});

toggleText.addEventListener('change', () => {
  chrome.storage.sync.set({ revealText: toggleText.checked });
});

toggleMedia.addEventListener('change', () => {
  chrome.storage.sync.set({ revealMedia: toggleMedia.checked });
});

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

toggleVideo.addEventListener('change', () => {
  chrome.storage.sync.set({ videoControls: toggleVideo.checked });
});

sliderVolume.addEventListener('input', () => {
  volumeValue.textContent = sliderVolume.value + '%';
});

sliderVolume.addEventListener('change', () => {
  chrome.storage.sync.set({ defaultVolume: parseInt(sliderVolume.value) });
});
