// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// A template's versions. A version is created when the template changes after documents used the
// previous one, so every document keeps the version it was filled from.

import { History, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Dialog } from '../components/ui';
import { formatDate } from '../components/format';
import { useToast } from '../components/toast';
import { db } from '../store/db';
import { restoreVersion, versionsOf } from '../store/templates';
import type { TemplateVersion } from '../store/types';

export function VersionsDialog({ templateId, currentId, onRestored, onClose }: { templateId: string; currentId: string; onRestored(v: TemplateVersion): void; onClose(): void }) {
  const [versions, setVersions] = useState<(TemplateVersion & { documents: number })[]>([]);
  const [viewing, setViewing] = useState<TemplateVersion | null>(null);
  const toast = useToast();

  useEffect(() => {
    void (async () => {
      const database = await db();
      const all = await versionsOf(templateId);
      setVersions(await Promise.all(all.map(async (v) => ({ ...v, documents: await database.countFromIndex('documents', 'templateVersionId', v.id) }))));
    })();
  }, [templateId]);

  if (viewing) {
    return (
      <Dialog title={`Version ${viewing.number}`} onClose={() => setViewing(null)} wide footer={<Button onClick={() => setViewing(null)}>Back</Button>}>
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-black/40 p-4 font-mono text-xs text-slate-300">{viewing.rebSource}</pre>
      </Dialog>
    );
  }

  return (
    <Dialog title="Versions" onClose={onClose} wide>
      <p className="mb-4 text-slate-400">
        Editing a template changes its current version until a document uses it; the next edit starts a new version. Documents keep the version they were filled from.
      </p>
      <ul className="flex flex-col divide-y divide-white/5">
        {versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-12 font-mono font-bold text-white">v{version.number}</span>
            <span className="flex-1 text-xs text-slate-400">
              Edited {formatDate(version.updatedAt)}
              {version.note && <span className="ml-2 text-slate-500">· {version.note}</span>}
            </span>
            {version.id === currentId && <Badge tone="amber">Current</Badge>}
            {!version.compiled && <Badge tone="red">Does not compile</Badge>}
            <Badge>{version.documents} document{version.documents === 1 ? '' : 's'}</Badge>
            <Button size="sm" variant="ghost" icon={<History size={16} />} onClick={() => setViewing(version)}>
              Source
            </Button>
            {version.id !== currentId && (
              <Button
                size="sm"
                icon={<RotateCcw size={16} />}
                onClick={async () => {
                  const restored = await restoreVersion(templateId, version.id);
                  toast(`Restored v${version.number} as v${restored.number}`, 'success');
                  onRestored(restored);
                }}
              >
                Restore
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
