// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The desktop preview's pages: the PDF drawn with pdf.js into Studio's own scrolling column, instead
// of Chromium's PDF viewer, which shows a blank frame and jumps back to page 1 on every update. A new
// PDF is drawn off-screen and replaces the old pages in one step, where the reader was.

import { useEffect, useRef } from 'react';

type PdfJs = typeof import('pdfjs-dist');
let loading: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  loading ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    return lib;
  });
  return loading;
}

// CSS pixels per PDF point at 100%: a PDF point is 1/72 inch, a CSS pixel 1/96 inch.
const CSS_PER_POINT = 96 / 72;

export function PdfPages({ bytes, zoom, onPages, onError }: { bytes: Uint8Array; zoom: number; onPages?(count: number): void; onError?(message: string): void }) {
  const host = useRef<HTMLDivElement>(null);
  const report = useRef(onPages);
  const reportError = useRef(onError);
  useEffect(() => {
    report.current = onPages;
    reportError.current = onError;
  }, [onPages, onError]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const lib = await pdfjs();
      // pdf.js takes the buffer over: give it a copy, the caller keeps the PDF for saving.
      const task = lib.getDocument({ data: bytes.slice() });
      try {
        const document = await task.promise;
        const pixels = window.devicePixelRatio || 1;
        const pages: HTMLElement[] = [];
        for (let number = 1; number <= document.numPages; number++) {
          const page = await document.getPage(number);
          const viewport = page.getViewport({ scale: zoom * CSS_PER_POINT });
          const canvas = window.document.createElement('canvas');
          canvas.width = Math.floor(viewport.width * pixels);
          canvas.height = Math.floor(viewport.height * pixels);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `Page ${number} of ${document.numPages}`);
          await page.render({ canvas, viewport, transform: pixels === 1 ? undefined : [pixels, 0, 0, pixels, 0, 0] }).promise;
          if (cancelled) return;
          canvas.className = 'block bg-white shadow-[0_6px_20px_rgba(0,0,0,0.35)]';
          pages.push(canvas);
        }
        const target = host.current;
        if (cancelled || !target) return;
        // Replace every page at once, keeping the reader's place.
        const top = target.scrollTop;
        target.replaceChildren(...pages);
        target.scrollTop = top;
        report.current?.(pages.length);
      } finally {
        void task.destroy();
      }
    })().catch((error) => {
      if (!cancelled) reportError.current?.(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [bytes, zoom]);

  return <div ref={host} aria-label="PDF preview" className="flex h-full flex-col items-center gap-4 overflow-auto py-4" />;
}
