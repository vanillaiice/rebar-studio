// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Photos are resized and compressed on the device before they are stored: the
// longest edge at most 2000 px, JPEG, with the camera's EXIF orientation applied. The original is
// kept instead only when the person asks for it in Settings.

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export const DEFAULT_MAX_EDGE = 2000;

export async function prepareImage(file: Blob, options: { maxEdge?: number; keepOriginal?: boolean } = {}): Promise<PreparedImage> {
  // imageOrientation 'from-image' turns the pixels the way the camera's EXIF tag says.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (options.keepOriginal) return { blob: file, width: bitmap.width, height: bitmap.height };
    const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('this browser cannot process images');
    // JPEG has no transparency: a white page shows through, as on paper.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('the image could not be compressed');
    // A small, already-compressed photo can grow when re-encoded: keep whichever is smaller.
    if (scale === 1 && file.size <= blob.size && /^image\/(jpeg|png|webp)$/.test(file.type)) {
      return { blob: file, width, height };
    }
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

export function isImage(file: File | Blob): boolean {
  return file.type.startsWith('image/');
}
