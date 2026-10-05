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

const languageLink = document.querySelector('.language-link');
// Keep the reader at the same section when switching language.
languageLink.addEventListener('click', () => {
  const destination = new URL(languageLink.href);
  destination.hash = location.hash;
  languageLink.href = destination.href;
});

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
