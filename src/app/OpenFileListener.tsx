// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Files opened from the system: double-clicked .reb, .rebpack and .rebdoc files reach the desktop
// app through its file associations, and an installed web app through the File Handling API.

import { useEffect } from 'react';
import { useToast } from '../components/toast';
import { importReb, importRebpack } from '../formats/rebpack';
import { importRebdoc } from '../formats/rebdoc';
import { desktop } from '../platform/bridge';
import { navigate } from './router';

async function open(name: string, bytes: Uint8Array): Promise<string> {
  if (name.endsWith('.rebdoc')) {
    navigate({ name: 'document', id: (await importRebdoc(bytes)).id });
    return 'document';
  }
  const template = name.endsWith('.rebpack') ? await importRebpack(bytes, name) : await importReb(new TextDecoder().decode(bytes), name);
  navigate({ name: 'editor', id: template.id });
  return 'template';
}

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}

export function OpenFileListener() {
  const toast = useToast();
  useEffect(() => {
    const handle = (name: string, bytes: Uint8Array) =>
      open(name, bytes).then(
        (kind) => toast(`Opened ${name} as a new ${kind}`, 'success'),
        (e) => toast(`${name}: ${e instanceof Error ? e.message : String(e)}`, 'error'),
      );
    const unsubscribe = desktop?.onOpenFile((file) => void handle(file.name, file.bytes));
    const queue = (window as unknown as { launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void } }).launchQueue;
    queue?.setConsumer(async (params) => {
      for (const handleFile of params.files) {
        const file = await handleFile.getFile();
        await handle(file.name, new Uint8Array(await file.arrayBuffer()));
      }
    });
    return unsubscribe;
  }, [toast]);
  return null;
}
