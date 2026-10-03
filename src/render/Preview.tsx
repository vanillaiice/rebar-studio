// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The live preview of a rendered page. In the desktop app it is the real PDF, printed by Chromium
// with the parameters Rebar's PDF service uses; in a browser, the page paginated by paged.js in a
// sandboxed frame (scripts only: the template gets an opaque origin and cannot reach the app).

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { desktop } from '../platform/bridge';
import { engineAssetUrl, pagedDocument } from './document';
import { dataUrls, inlineFiles } from './files';
import { renderPdf } from './pdf';

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
  zoom: number;
  onState?(state: PreviewState): void;
}

export const Preview = forwardRef<PreviewHandle, Props>(function Preview({ html, files, fontCss, zoom, onState }, ref) {
  const [pdfUrl, setPdfUrl] = useState('');
  const [srcDoc, setSrcDoc] = useState('');
  const pdfBytes = useRef<Uint8Array | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const scroll = useRef(0);
  const report = useRef(onState);
  report.current = onState;

  useImperativeHandle(ref, () => ({
    pdf: () => pdfBytes.current,
    print: () => frame.current?.contentWindow?.postMessage({ type: 'reb-print' }, '*'),
  }));

  useEffect(() => {
    if (!html) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      report.current?.({ rendering: true, pages: 0, error: null });
      try {
        if (desktop) {
          const bytes = await renderPdf(html, files, fontCss);
          if (cancelled) return;
          pdfBytes.current = bytes;
          const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
          setPdfUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return url;
          });
          report.current?.({ rendering: false, pages: 0, error: null });
        } else {
          const urls = await dataUrls(files);
          if (cancelled) return;
          const page = pagedDocument(html, {
            tailwindUrl: engineAssetUrl('tailwindcss.js'),
            pagedUrl: engineAssetUrl('paged.polyfill.js'),
            fontCss,
            scrollY: scroll.current,
          });
          setSrcDoc(inlineFiles(page, urls));
        }
      } catch (e) {
        if (!cancelled) report.current?.({ rendering: false, pages: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [html, files, fontCss]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      if (event.data?.type === 'reb-scroll') scroll.current = Number(event.data.y) || 0;
      if (event.data?.type === 'reb-paged-done') {
        report.current?.({ rendering: false, pages: Number(event.data.pages) || 0, error: null });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  if (desktop) {
    return pdfUrl ? (
      <iframe
        title="PDF preview"
        src={`${pdfUrl}#toolbar=0&zoom=${Math.round(zoom * 100)}`}
        className="h-full w-full border-0"
      />
    ) : null;
  }
  return srcDoc ? (
    <iframe
      title="Preview"
      ref={frame}
      srcDoc={srcDoc}
      className="h-full w-full border-0"
      style={{ zoom }}
      // allow-modals lets the page open the print dialog; still no same-origin access.
      sandbox="allow-scripts allow-modals"
    />
  ) : null;
});
