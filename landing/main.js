// SPDX-License-Identifier: GPL-3.0-or-later · Copyright (C) 2026 hblabs
document.documentElement.classList.add('js');

const themeToggle = document.querySelector('.theme-toggle');
const systemTheme = matchMedia('(prefers-color-scheme: dark)');

function updateThemeControls() {
  const light = document.documentElement.dataset.theme === 'light';
  const label = light ? themeToggle.dataset.darkLabel : themeToggle.dataset.lightLabel;
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
  document.querySelector('meta[name="theme-color"]').content = light ? '#f5f6f7' : '#0f172a';
}

updateThemeControls();
themeToggle.hidden = false;
themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('rebar-studio-landing-theme', theme); } catch { /* Keep the current page usable. */ }
  updateThemeControls();
});
systemTheme.addEventListener('change', () => {
  try {
    const saved = localStorage.getItem('rebar-studio-landing-theme');
    if (saved === 'light' || saved === 'dark') return;
  } catch { /* Follow the system when storage is unavailable. */ }
  document.documentElement.dataset.theme = systemTheme.matches ? 'dark' : 'light';
  updateThemeControls();
});

// Keep the reader at the same section when switching language.
for (const languageLink of document.querySelectorAll('.language-link')) {
  languageLink.addEventListener('click', () => {
    const destination = new URL(languageLink.href);
    destination.hash = location.hash;
    languageLink.href = destination.href;
  });
}

const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menu.hidden = false;

function closeMenu() {
  menu.setAttribute('aria-expanded', 'false');
  navigation.dataset.open = 'false';
}

menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  navigation.dataset.open = String(open);
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    closeMenu();
    menu.focus();
  }
});

const previews = {
  editor: { image: document.querySelector('#editor-preview') },
  document: { image: document.querySelector('#document-preview') },
};
const previewButtons = document.querySelectorAll('[data-preview]');
previewButtons.forEach((button) => {
  button.disabled = false;
  button.addEventListener('click', () => {
    const selected = button.dataset.preview;
    Object.entries(previews).forEach(([name, preview]) => { preview.image.hidden = name !== selected; });
    previewButtons.forEach((item) => { item.setAttribute('aria-pressed', String(item === button)); });
    document.querySelector('#preview-caption').textContent = button.dataset.caption;
  });
});

// Owner settings. Until a value is filled in, the page keeps its email fallbacks,
// hides WhatsApp links and loads no analytics.
const SITE = {
  bookingUrl: 'BOOKING_URL',
  whatsappNumber: 'WHATSAPP_NUMBER', // digits only, with country code, e.g. 9745XXXXXXX
  umamiScript: 'https://stats.hblabs.xyz/script.js', // self-hosted; its host is allowed in the Caddyfile CSP
  umamiWebsiteId: '12758932-e55d-4165-baad-a143d7a0045b',
};
const isSet = value => !/^[A-Z_]+$/.test(value);

// Campaign parameters follow the visitor into booking, email and WhatsApp links.
const utm = [...new URLSearchParams(location.search)].filter(([key]) => key.startsWith('utm_'));
const utmNote = utm.map(([key, value]) => `${key}=${value}`).join('&');

for (const link of document.querySelectorAll('[data-cta="booking"]')) {
  if (!isSet(SITE.bookingUrl)) continue;
  const url = new URL(SITE.bookingUrl);
  for (const [key, value] of utm) url.searchParams.set(key, value);
  link.href = url.href;
}
for (const link of document.querySelectorAll('a[href^="mailto:"]')) {
  if (!utmNote) break;
  const url = new URL(link.href);
  const body = url.searchParams.get('body') || '';
  url.searchParams.set('body', `${body}\n\nRef: ${utmNote}`);
  link.href = url.href.replace(/\+/g, '%20');
}
for (const link of document.querySelectorAll('[data-whatsapp]')) {
  if (!isSet(SITE.whatsappNumber)) continue;
  const url = new URL(`https://wa.me/${SITE.whatsappNumber}`);
  if (utmNote) url.searchParams.set('text', `Rebar Studio (${utmNote})`);
  link.href = url.href;
  link.hidden = false;
}
if (isSet(SITE.umamiScript) && isSet(SITE.umamiWebsiteId)) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = SITE.umamiScript;
  script.dataset.websiteId = SITE.umamiWebsiteId;
  document.head.append(script);
  for (const note of document.querySelectorAll('[data-analytics-note]')) note.hidden = false;
}
