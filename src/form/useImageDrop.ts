// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

import { useState, type DragEvent } from 'react';

// Handle file drags only: leave text selections and other editor drags alone.
export function useImageDrop(onFiles: (files: File[], event: DragEvent<HTMLElement>) => void, disabled = false) {
  const [over, setOver] = useState(false);
  const isFileDrag = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes('Files');
  return {
    over,
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      setOver(!disabled);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setOver(false);
      if (!disabled) onFiles(Array.from(event.dataTransfer.files), event);
    },
  };
}
