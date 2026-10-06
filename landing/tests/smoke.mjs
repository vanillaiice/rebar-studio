// Verify the deployed Caddy behavior and the landing experience without changing app data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.LANDING_URL || 'http://127.0.0.1:4183';
const appUrl = 'https://vanillaiice.github.io/rebar-studio/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

try {
  for (const path of ['/', '/fr.html', '/theme.js', '/theme.css', '/up', '/robots.txt', '/sitemap.xml', '/assets/editor.webp', '/assets/document.webp', '/assets/social-fr.png']) {
    const response = await fetch(new URL(path, origin));
    assert.equal(response.status, 200, `${path} should return 200`);
    if (path === '/') {
      assert.equal(response.headers.get('cache-control'), 'no-cache');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    }
  }
  assert.equal((await fetch(new URL('/assets/missing.js', origin))).status, 404);
  // The app is hosted on GitHub Pages; this server must not pretend to serve it.
  assert.equal((await fetch(new URL('/app/', origin))).status, 404);

  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const externalRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(origin).origin) externalRequests.push(request.url());
  });
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 940 });
    await page.goto(origin);
    await page.locator('#editor-preview').waitFor();
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('main').count(), 1);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://studio.rebarhq.app/');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    assert.ok(await page.locator('#editor-preview').evaluate((image) => image.complete && image.naturalWidth > 0));
    assert.equal(await page.getByRole('button', { name: /Menu/ }).isVisible(), width <= 1100);
    for (const link of await page.getByRole('link', { name: 'Open Studio', exact: false }).all()) {
      assert.equal(await link.getAttribute('href'), appUrl);
    }
  }
  await page.getByRole('button', { name: 'Document workspace' }).click();
  assert.equal(await page.locator('#editor-preview').isVisible(), false);
  assert.equal(await page.locator('#document-preview').isVisible(), true);
  assert.equal(await page.getByRole('button', { name: 'Document workspace' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Template editor' }).click();
  assert.equal(await page.locator('#editor-preview').isVisible(), true);

  await page.setViewportSize({ width: 360, height: 800 });
  const menu = page.getByRole('button', { name: /Menu/ });
  await menu.click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  assert.equal(await menu.evaluate((element) => element === document.activeElement), true);
  await menu.click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Downloads', exact: true }).click();
  assert.equal(await menu.getAttribute('aria-expanded'), 'false');
  await page.getByText('How do I back up my work?', { exact: false }).click();
  assert.ok(await page.locator('details[open]').innerText().then((text) => text.includes('Keep a backup before clearing browser data.')));

  // Tab from the top exposes a skip link and enters the page content.
  await page.goto(origin);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.skip-link').evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#main');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  assert.equal(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((items) => items.length)), 0);

  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(origin);
  assert.ok(await staticPage.getByRole('navigation', { name: 'Main navigation' }).isVisible());
  assert.ok(await staticPage.locator('#editor-preview').isVisible());
  assert.equal(await staticPage.locator('a[href^="https://github.com/vanillaiice/rebar-studio/releases/download/"]').count(), 4);
  for (const link of await staticPage.getByRole('link', { name: 'Open Studio', exact: false }).all()) {
    assert.equal(await link.getAttribute('href'), appUrl);
  }
  await staticPage.getByText('Do I need an account?', { exact: false }).click();
  assert.equal(await staticPage.locator('details[open]').count(), 1);
  assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // The theme choice survives reloads and language navigation, including section anchors.
  await page.goto(origin);
  await page.evaluate(() => localStorage.setItem('rebar-studio-landing-theme', 'dark'));
  await page.reload();
  await page.getByRole('button', { name: 'Use light theme' }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.evaluate(() => { location.hash = '#features'; });
  await page.getByRole('link', { name: 'Français', exact: true }).click();
  assert.equal(new URL(page.url()).pathname, '/fr.html');
  assert.equal(new URL(page.url()).hash, '#features');
  assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://studio.rebarhq.app/fr.html');
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  assert.equal(await page.locator('#preview-caption').innerText(), 'Remplissez un document et calculez les totaux à partir du même modèle.');
  await page.getByRole('button', { name: 'Activer le thème sombre' }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByRole('link', { name: 'English', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');

  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('rebar-studio-landing-theme', value), theme);
    for (const path of ['/', '/fr.html']) {
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 940 });
        await page.goto(new URL(path, origin).href);
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} ${theme} at ${width}px`);
      }
    }
  }
  await staticPage.goto(new URL('/fr.html', origin).href);
  assert.equal(await staticPage.locator('html').getAttribute('lang'), 'fr');
  assert.ok(await staticPage.getByRole('navigation', { name: 'Navigation principale' }).isVisible());
  await staticPage.getByRole('link', { name: 'English', exact: true }).click();
  assert.equal(await staticPage.locator('html').getAttribute('lang'), 'en');

  // System preference also works without saved settings or storage permission.
  const systemContext = await browser.newContext({ colorScheme: 'dark' });
  await systemContext.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
  });
  const systemPage = await systemContext.newPage();
  await systemPage.goto(origin);
  assert.equal(await systemPage.locator('html').getAttribute('data-theme'), 'dark');
  await systemPage.getByRole('button', { name: 'Use light theme' }).click();
  assert.equal(await systemPage.locator('html').getAttribute('data-theme'), 'light');
  await systemContext.close();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin);
  await page.screenshot({ path: '/tmp/rebar-studio-landing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/rebar-studio-landing-mobile.png', fullPage: true });
  console.log('Passed: Caddy responses/headers, five viewport widths, images, links, screenshot switching, mobile navigation, FAQ, keyboard access, reduced motion, no third-party requests, and no-JavaScript use.');
} finally {
  await browser.close();
}
