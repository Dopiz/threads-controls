const DEFAULTS = {
  revealText: true,
  revealMedia: true,
  textHighlight: '',
  videoControlsThreads: true,
  videoControlsInstagram: false,
  videoControlsFacebook: false,
  defaultVolume: 10
};

const toggleText = document.getElementById('toggle-text');
const toggleMedia = document.getElementById('toggle-media');
const swatch = document.getElementById('text-color-swatch');
const dropdown = document.getElementById('text-color-dropdown');
const SITE_TOGGLES = [
  { button: document.getElementById('site-threads'), key: 'videoControlsThreads' },
  { button: document.getElementById('site-instagram'), key: 'videoControlsInstagram' },
  { button: document.getElementById('site-facebook'), key: 'videoControlsFacebook' }
];
const sliderVolume = document.getElementById('slider-volume');
const volumeValue = document.getElementById('volume-value');

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

chrome.storage.sync.get(DEFAULTS, (settings) => {
  toggleText.checked = settings.revealText;
  toggleMedia.checked = settings.revealMedia;
  updateSwatch(settings.textHighlight);
  for (const { button, key } of SITE_TOGGLES) {
    button.classList.toggle('off', !settings[key]);
  }
  sliderVolume.value = settings.defaultVolume;
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

for (const { button, key } of SITE_TOGGLES) {
  button.addEventListener('click', () => {
    const enabled = button.classList.contains('off');
    button.classList.toggle('off', !enabled);
    chrome.storage.sync.set({ [key]: enabled });
  });
}

sliderVolume.addEventListener('input', () => {
  volumeValue.textContent = sliderVolume.value + '%';
});

sliderVolume.addEventListener('change', () => {
  chrome.storage.sync.set({ defaultVolume: parseInt(sliderVolume.value) });
});
