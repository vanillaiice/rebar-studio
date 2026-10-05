// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The live preview of a rendered page. In the desktop app it is the real PDF, printed by Chromium
// with the parameters Rebar's PDF service uses, drawn page by page (PdfPages); in a browser, the page
// paginated by paged.js in a sandboxed frame (scripts only: the template gets an opaque origin and
// cannot reach the app).
//
// Updates never blank the preview: a new version is prepared out of sight (the next PDF drawn
// off-screen, the next page paginated in a hidden frame) and replaces the shown one only when ready,
// where the reader was.
//
// Zoom 'fit' sizes the pages to the pane's width, and follows the pane as it is resized.

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { desktop } from '../platform/bridge';
import { engineAssetUrl, pagedDocument } from './document';
import { A4_WIDTH, fitZoom } from './fit';
import { dataUrls, inlineFiles } from './files';
import { renderPdf } from './pdf';
import { PdfPages } from './PdfPages';

export interface PreviewHandle {
  pdf(): Uint8Array | null; // the last PDF (desktop)
  print(): void; // the browser's print dialog (web)
}

export interface PreviewState {
  rendering: boolean;
  pages: number;
  error: string | null;
}

interface Props {
  html: string;
  files: Map<string, Blob>;
  fontCss: string;
  zoom: number | 'fit';
  onState?(state: PreviewState): void;
  onZoom?(zoom: number): void; // the zoom in effect, also when fitting
}

// Two frames take turns: the shown one, and the next version paginating behind it.
type Slot = { id: number; doc: string } | null;

export const Preview = forwardRef<PreviewHandle, Props>(function Preview({ html, files, fontCss, zoom, onState, onZoom }, ref) {
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [slots, setSlots] = useState<[Slot, Slot]>([null, null]);
  const [front, setFront] = useState<0 | 1>(0);
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const scroll = useRef(0);
  const next = useRef(1);
  const frontNow = useRef<0 | 1>(0);
  const report = useRef(onState);
  useEffect(() => {
    report.current = onState;
    frontNow.current = front;
  });

  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pageWidth, setPageWidth] = useState(A4_WIDTH);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const effective = zoom === 'fit' ? fitZoom(width, pageWidth) : zoom;
  const reportZoom = useRef(onZoom);
  useEffect(() => {
    reportZoom.current = onZoom;
  });
  useEffect(() => reportZoom.current?.(effective), [effective]);

  useImperativeHandle(ref, () => ({
    pdf: () => pdf,
    print: () => frames[frontNow.current].current?.contentWindow?.postMessage({ type: 'reb-print' }, '*'),
  }));

  useEffect(() => {
    if (!html) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      report.current?.({ rendering: true, pages: 0, error: null });
      try {
        if (desktop) {
          const bytes = await renderPdf(html, files, fontCss);
          if (!cancelled) setPdf(bytes);
        } else {
          const urls = await dataUrls(files);
          if (cancelled) return;
          const page = pagedDocument(html, {
            tailwindUrl: engineAssetUrl('tailwindcss.js'),
            pagedUrl: engineAssetUrl('paged.polyfill.js'),
            fontCss,
            scrollY: scroll.current,
          });
          // Paginate behind the shown frame; the message handler swaps them when it is done.
          const back = (1 - frontNow.current) as 0 | 1;
          setSlots((current) => {
            const updated: [Slot, Slot] = [...current];
            updated[back] = { id: next.current++, doc: inlineFiles(page, urls) };
            return updated;
          });
        }
      } catch (e) {
        if (!cancelled) report.current?.({ rendering: false, pages: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [html, files, fontCss]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const index = frames.findIndex((f) => f.current && event.source === f.current.contentWindow);
      if (index < 0) return;
      if (event.data?.type === 'reb-scroll' && index === frontNow.current) scroll.current = Number(event.data.y) || 0;
      if (event.data?.type === 'reb-paged-done') {
        if (index !== frontNow.current) setFront(index as 0 | 1);
        if (Number(event.data.width) > 0) setPageWidth(Number(event.data.width));
        report.current?.({ rendering: false, pages: Number(event.data.pages) || 0, error: null });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // the frame refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (desktop) {
    return (
      <div ref={box} className="h-full w-full">
        {pdf && width > 0 && (
          <PdfPages
            bytes={pdf}
            zoom={effective}
            onPages={(pages, first) => {
              setPageWidth(first);
              report.current?.({ rendering: false, pages, error: null });
            }}
            onError={(error) => report.current?.({ rendering: false, pages: 0, error })}
          />
        )}
      </div>
    );
  }
  return (
    <div ref={box} className="relative h-full w-full">
      {slots.map((slot, index) =>
        slot ? (
          <iframe
            key={slot.id}
            ref={frames[index]}
            title={index === front ? 'Preview' : 'Next preview'}
            aria-hidden={index !== front}
            tabIndex={index === front ? undefined : -1}
            srcDoc={slot.doc}
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-200 motion-reduce:transition-none ${index === front ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
            style={{ zoom: effective }}
            // allow-modals lets the page open the print dialog; still no same-origin access.
            sandbox="allow-scripts allow-modals"
          />
        ) : null,
      )}
    </div>
  );
});
