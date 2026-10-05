// Apply the saved theme before the stylesheet loads. Storage may be unavailable.
(() => {
  let saved;
  try { saved = localStorage.getItem('rebar-studio-landing-theme'); } catch { /* Use system preference. */ }
  const theme = saved === 'light' || saved === 'dark'
    ? saved
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
})();
