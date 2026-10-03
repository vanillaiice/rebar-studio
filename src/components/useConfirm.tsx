// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

import { useCallback, useState, type ReactNode } from 'react';
import { Button, Dialog } from './ui';

// useConfirm returns an async confirm(question) and the dialog element to render.
export function useConfirm(): [(options: { title: string; message: ReactNode; action: string; danger?: boolean }) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<{
    title: string;
    message: ReactNode;
    action: string;
    danger?: boolean;
    resolve(value: boolean): void;
  } | null>(null);
  const confirm = useCallback(
    (options: { title: string; message: ReactNode; action: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => setState({ ...options, resolve })),
    [],
  );
  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  const element = state ? (
    <Dialog
      title={state.title}
      onClose={() => close(false)}
      footer={
        <>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {state.action}
          </Button>
        </>
      }
    >
      {state.message}
    </Dialog>
  ) : null;
  return [confirm, element];
}

