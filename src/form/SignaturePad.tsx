// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A signature drawn with a finger, pen or mouse, stored as a PNG (Rebar refuses SVG as active
// content). Pointer events cover touch, pen and mouse alike.

import { Eraser, PenLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '../components/ui';

const WIDTH = 600;
const HEIGHT = 200;

export function SignaturePad({ title, onDone, onClose }: { title: string; onDone(png: Blob): void; onClose(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d')!;
    const { x, y } = point(event);
    drawing.current = true;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    setEmpty(false);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d')!;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const clear = () => {
    canvas.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
    setEmpty(true);
  };

  const done = () => {
    canvas.current?.toBlob((blob) => blob && onDone(blob), 'image/png');
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button icon={<Eraser size={17} />} onClick={clear} disabled={empty}>
            Clear
          </Button>
          <Button variant="primary" icon={<PenLine size={17} />} onClick={done} disabled={empty}>
            Use signature
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-400">Sign in the box with a finger, a pen or the mouse.</p>
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        aria-label="Signature area"
        className="w-full touch-none rounded-lg border-2 border-dashed border-slate-400 bg-white"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
    </Dialog>
  );
}
