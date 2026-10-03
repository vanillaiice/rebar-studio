// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Fonts bundled with Studio, so a PDF looks the same offline and on every machine. A template uses
// one by naming its family in its CSS (font-family: "Inter") or a Tailwind class (font-['Inter']);
// only the families a document names are sent with it. Rebar's PDF service does not have these
// fonts: a template meant for Rebar too should list a fallback (font-family: "Inter", sans-serif).

import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import serif400 from '@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2?url';
import serif700 from '@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2?url';
import mono400 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import mono700 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import arabic400 from '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2?url';
import arabic700 from '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff2?url';

export interface BundledFont {
  family: string;
  description: string;
  files: { weight: 400 | 700; url: string; name: string }[];
}

export const BUNDLED_FONTS: BundledFont[] = [
  {
    family: 'Inter',
    description: 'Sans serif, for most documents',
    files: [
      { weight: 400, url: inter400, name: 'studio-font-inter-400.woff2' },
      { weight: 700, url: inter700, name: 'studio-font-inter-700.woff2' },
    ],
  },
  {
    family: 'Source Serif 4',
    description: 'Serif, for letters and certificates',
    files: [
      { weight: 400, url: serif400, name: 'studio-font-source-serif-4-400.woff2' },
      { weight: 700, url: serif700, name: 'studio-font-source-serif-4-700.woff2' },
    ],
  },
  {
    family: 'JetBrains Mono',
    description: 'Monospace, for codes and references',
    files: [
      { weight: 400, url: mono400, name: 'studio-font-jetbrains-mono-400.woff2' },
      { weight: 700, url: mono700, name: 'studio-font-jetbrains-mono-700.woff2' },
    ],
  },
  {
    family: 'Noto Sans Arabic',
    description: 'Arabic script',
    files: [
      { weight: 400, url: arabic400, name: 'studio-font-noto-sans-arabic-400.woff2' },
      { weight: 700, url: arabic700, name: 'studio-font-noto-sans-arabic-700.woff2' },
    ],
  },
];

// The bundled fonts a document names (case-insensitive; Tailwind writes spaces as underscores).
export function fontsUsedBy(html: string): BundledFont[] {
  const text = html.toLowerCase().replace(/_/g, ' ');
  return BUNDLED_FONTS.filter((font) => text.includes(font.family.toLowerCase()));
}

export function fontFaceCss(fonts: BundledFont[]): string {
  return fonts
    .flatMap((font) =>
      font.files.map(
        (file) =>
          `@font-face { font-family: "${font.family}"; font-weight: ${file.weight}; font-style: normal; src: url(${file.name}) format("woff2"); }`,
      ),
    )
    .join('\n');
}

const cache = new Map<string, Promise<Blob>>();

// The font files a document needs, by the names its @font-face rules use.
export async function fontFiles(fonts: BundledFont[]): Promise<Map<string, Blob>> {
  const files = new Map<string, Blob>();
  for (const font of fonts) {
    for (const file of font.files) {
      if (!cache.has(file.url)) cache.set(file.url, fetch(file.url).then((r) => r.blob()));
      files.set(file.name, await cache.get(file.url)!);
    }
  }
  return files;
}
