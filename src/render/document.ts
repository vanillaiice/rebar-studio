// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Turns rendered template HTML into the documents Chromium paginates:
//
// - pdfDocument: what the desktop app prints with printToPDF. It reproduces what Rebar sends its PDF
//   service (Gotenberg; rebar-on-rails lib/gotenberg.rb): the hidden <reb-footer> and <reb-header>
//   blocks become Chromium's footer and header documents, A4 unless the page's CSS says otherwise,
//   0.5 inch margins (1 inch where a header or footer is drawn), and Tailwind only when the template
//   asks for it (<reb-tailwind>). So Studio's PDF is Rebar's PDF.
// - pagedDocument: what a browser shows and prints, paginated by paged.js, which draws the header
//   and footer as running elements (named-page orientation is the one thing it cannot do).
//
// Both carry a Content-Security-Policy that blocks the network: templates are third-party content
// and documents hold personal data, so nothing a template writes may leave the machine (plan 9).
// Files (template images, photos, fonts) are referred to by bare file name.

export type MarginBlock = 'footer' | 'header';

export interface PdfDocument {
  html: string;
  header: string; // Chromium's header template, '' for none
  footer: string;
  tailwind: boolean; // the page loads tailwindcss.js, which must sit next to it
  margins: { top: number; bottom: number; left: number; right: number }; // inches
}

const TAILWIND = 'tailwindcss.js';

// The CSP for a rendered page: inline styles and scripts (Tailwind needs them), files only from
// the page's own folder (file: in the desktop app) or inlined (data:, blob:), and no connections.
export function contentSecurityPolicy(scriptSources: string[] = []): string {
  return [
    "default-src 'none'",
    'img-src data: blob: file:',
    "style-src 'unsafe-inline'",
    `script-src 'unsafe-inline' file: ${scriptSources.join(' ')}`.trim(),
    'font-src data: file:',
  ].join('; ');
}

// [the page without the block, the block's content or null], as Rebar's PDF client extracts it.
export function extractBlock(html: string, kind: MarginBlock): [string, string | null] {
  const opening = `<rebar-pdf-${kind}-extract`;
  const closing = `</rebar-pdf-${kind}-extract>`;
  const start = html.indexOf(opening);
  if (start < 0) return [html, null];
  const close = html.indexOf(closing, start);
  if (close < 0) return [html, null];
  const finish = close + closing.length;
  const content = html
    .slice(start, finish)
    .replace(opening, '<div style="width: 100%;"')
    .replace('style="display:none;"', '')
    .replace(closing, '</div>');
  return [html.slice(0, start) + html.slice(finish), content];
}

function wrap(html: string): string {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body class="bg-white">
    ${html}
</body>
</html>`;
}

// Chromium's header and footer have a tiny root font size, which breaks rem units: 16px is forced.
export function marginDocument(content: string, tailwind: boolean): string {
  const script = tailwind ? `<script src="${TAILWIND}"></script>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html { font-size: 16px !important; -webkit-print-color-adjust: exact; } body { margin: 0; padding: 0; width: 100%; }</style>${script}</head><body>${content}</body></html>\n`;
}

// insertIntoHead puts markup at the start of <head> (creating one when the page has none).
export function insertIntoHead(html: string, markup: string): string {
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + markup + html.slice(head.index + head[0].length);
  const root = /<html[^>]*>/i.exec(html);
  if (root) return html.slice(0, root.index + root[0].length) + `<head>${markup}</head>` + html.slice(root.index + root[0].length);
  return `<head>${markup}</head>` + html;
}

// The page tells the desktop app when it is ready to print: after load, once Tailwind (which
// styles the page from a MutationObserver, with no "done" event) stops writing styles and fonts
// are loaded. Rebar's PDF service waits a fixed second instead.
const READY_SCRIPT = `<script>(function () {
  function settled(done) {
    var finished = false, timer = null;
    var observer = new MutationObserver(bump);
    var cap = setTimeout(finish, 5000);
    function finish() {
      if (finished) return; finished = true;
      observer.disconnect(); clearTimeout(cap);
      Promise.resolve(document.fonts && document.fonts.ready).then(done);
    }
    function bump() { clearTimeout(timer); timer = setTimeout(finish, 120); }
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    bump();
  }
  window.addEventListener('load', function () { settled(function () { window.__rebReady = true; }); });
})();</script>`;

export function pdfDocument(rendered: string, fontCss = ''): PdfDocument {
  const [withoutFooter, footer] = extractBlock(rendered, 'footer');
  const [page, header] = extractBlock(withoutFooter, 'header');
  let html = page.toLowerCase().includes('<html') ? page : wrap(page);
  const tailwind = html.includes(TAILWIND);
  const fonts = fontCss ? `<style>${fontCss}</style>` : '';
  html = insertIntoHead(
    html,
    `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy()}">${fonts}${READY_SCRIPT}`,
  );
  return {
    html,
    header: header === null ? '' : marginDocument(fonts + header, tailwind),
    footer: footer === null ? '' : marginDocument(fonts + footer, tailwind),
    tailwind,
    margins: { top: header === null ? 0.5 : 1, bottom: footer === null ? 0.5 : 1, left: 0.5, right: 0.5 },
  };
}

export interface PagedOptions {
  tailwindUrl: string;
  pagedUrl: string;
  fontCss?: string;
  scrollY?: number;
  // Script sources to inline instead of loading the URLs: a page that stands on its own (the
  // HTML rendition a browser keeps of a final document).
  inline?: { tailwind: string; paged: string };
}

function inlineScript(code: string): string {
  return `<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`;
}

// paged.js only knows upper-case page sizes ("A4"); Chromium accepts any case.
function normalizePageSizes(css: string): string {
  return css.replace(/(\bsize\s*:\s*)([^;}<]+)/gi, (_, before: string, value: string) =>
    before + value.replace(/\b([ab]\d{1,2})\b/gi, (name) => name.toUpperCase()),
  );
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// pagedDocument builds the browser's page: the template's styles hoisted into <head> (paged.js reads
// @page rules only there), the footer and header as running elements at the start of the body
// (paged.js repeats one only from the page holding it), inline page breaks as classes (paged.js
// breaks from stylesheets only), page numbers filled per page. The page reports its page count and
// scroll position to the parent frame, and prints itself when asked.
export function pagedDocument(rendered: string, options: PagedOptions): string {
  const doc = new DOMParser().parseFromString(rendered, 'text/html');
  const wantsTailwind = doc.querySelector(`script[src$="${TAILWIND}"]`) !== null;
  doc.querySelectorAll('script, link').forEach((element) => element.remove());

  let styles = '';
  let css = '';
  doc.querySelectorAll('style').forEach((style) => {
    const text = normalizePageSizes(style.textContent ?? '');
    const type = style.getAttribute('type');
    styles += `<style${type ? ` type="${escapeAttribute(type)}"` : ''}>${text}</style>\n`;
    css += text + '\n';
    style.remove();
  });

  let margins = '';
  const running = (kind: MarginBlock) => {
    let found = false;
    doc.querySelectorAll(`rebar-pdf-${kind}-extract`).forEach((extract) => {
      const className = `reb-print-${kind} ${extract.getAttribute('class') ?? ''}`.trim();
      margins += `<div class="${escapeAttribute(className)}">${extract.innerHTML}</div>`;
      extract.remove();
      found = true;
    });
    return found;
  };
  const hasFooter = running('footer');
  const hasHeader = running('header');

  let breaks = false;
  doc.querySelectorAll('[style]').forEach((element) => {
    const style = element.getAttribute('style') ?? '';
    if (/(?:^|;)\s*(?:page-)?break-before\s*:\s*(?:always|page)/i.test(style)) {
      element.classList.add('reb-break-before');
      breaks = true;
    }
    if (/(?:^|;)\s*(?:page-)?break-after\s*:\s*(?:always|page)/i.test(style)) {
      element.classList.add('reb-break-after');
      breaks = true;
    }
  });

  const hasOwnSize = /@page[^{]*\{[^}]*\bsize\s*:/i.test(css);
  const base = `@page { ${hasOwnSize ? '' : 'size: A4; '}margin: 0.5in; }
body { margin: 0; }
${breaks ? '.reb-break-before { break-before: page; } .reb-break-after { break-after: page; }' : ''}`;
  const marginCss =
    (hasFooter ? '@page { margin-bottom: 1in; @bottom-center { content: element(rebFooter); } }\n.reb-print-footer { position: running(rebFooter); }\n' : '') +
    (hasHeader ? '@page { margin-top: 1in; @top-center { content: element(rebHeader); } }\n.reb-print-header { position: running(rebHeader); }\n' : '');
  const origin = options.inline ? 'null' : new URL(options.pagedUrl).origin;
  const csp = contentSecurityPolicy([origin === 'null' ? '' : origin, options.inline ? '' : 'app:'].filter(Boolean));
  const tailwindScript = !wantsTailwind ? '' : options.inline ? inlineScript(options.inline.tailwind) : `<script src="${options.tailwindUrl}"></script>`;
  const pagedScript = options.inline ? inlineScript(options.inline.paged) : `<script src="${options.pagedUrl}"></script>`;
  const fonts = options.fontCss ? `<style>${options.fontCss}</style>` : '';
  const scrollY = Math.max(0, Math.round(options.scrollY ?? 0));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${base}</style>
${fonts}
${styles}
<style>${marginCss}</style>
${tailwindScript}
<script>window.PagedConfig = { auto: false };</script>
${pagedScript}
<script>
(function () {
  function settled(done) {
    var finished = false, timer = null;
    var observer = new MutationObserver(bump);
    var cap = setTimeout(finish, 5000);
    function finish() {
      if (finished) return; finished = true;
      observer.disconnect(); clearTimeout(cap);
      Promise.resolve(document.fonts && document.fonts.ready).then(done);
    }
    function bump() { clearTimeout(timer); timer = setTimeout(finish, 120); }
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    bump();
  }
  function paginate() {
    window.PagedPolyfill.preview().then(function (flow) {
      var pages = document.querySelectorAll('.pagedjs_page');
      var total = flow && flow.total ? flow.total : pages.length;
      pages.forEach(function (page, i) {
        page.querySelectorAll('.pageNumber').forEach(function (s) { s.textContent = String(i + 1); });
        page.querySelectorAll('.totalPages').forEach(function (s) { s.textContent = String(total); });
      });
      // On screen, pages on a grey desk. Added once paginated: paged.js reads the stylesheets
      // before, applying print rules on screen and dropping screen ones.
      var screen = document.createElement('style');
      screen.textContent = '@media screen { html { background: #52525b; } body { padding: 16px; } .pagedjs_page { background: #ffffff; margin: 0 auto 16px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35); } }';
      document.head.appendChild(screen);
      window.scrollTo(0, ${scrollY});
      window.addEventListener('scroll', function () { parent.postMessage({ type: 'reb-scroll', y: window.scrollY }, '*'); });
      parent.postMessage({ type: 'reb-paged-done', pages: total, width: pages[0] ? pages[0].offsetWidth : 0 }, '*');
    });
  }
  window.addEventListener('message', function (event) {
    if (event.source === parent && event.data && event.data.type === 'reb-print') window.print();
  });
  window.addEventListener('load', function () { settled(paginate); });
})();
</script>
</head>
<body>
${margins}${doc.body.innerHTML}
</body>
</html>`;
}

// The bundled engine assets the documents load, resolved against the app's own address.
export function engineAssetUrl(name: 'tailwindcss.js' | 'paged.polyfill.js'): string {
  return new URL(name, document.baseURI).href;
}
