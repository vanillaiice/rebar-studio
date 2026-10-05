// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The first-run tour, and the reminder to back up a workspace that only lives on this device.

import { HardDriveDownload, LayoutTemplate, Lock, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog } from '../components/ui';
import { useToast } from '../components/toast';
import { db } from '../store/db';
import { updateSettings } from '../store/settings';
import { navigate } from './router';
import { useSettings } from './useSettings';

const STEPS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <LayoutTemplate size={32} />,
    title: 'Templates',
    body: 'Write a .reb template with a live PDF preview, or start from a starter. Studio runs the same engine as Rebar, so a template behaves the same in both.',
  },
  {
    icon: <FileText size={32} />,
    title: 'Documents',
    body: 'Fill documents from your templates: text, tables with totals, photos from the camera, signatures. Everything is saved as you type.',
  },
  {
    icon: <Lock size={32} />,
    title: 'Finalize',
    body: 'Finalizing checks the answers, renders the PDF, records its fingerprint and locks the document. Reopen it as a revision to change it.',
  },
  {
    icon: <ShieldCheck size={32} />,
    title: 'Your data stays here',
    body: 'No account and no server: templates and documents live on this device and work offline. Back up from Settings to keep a copy.',
  },
];

export function Onboarding() {
  const settings = useSettings();
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [documents, setDocuments] = useState(0);
  const reminded = useRef(false);
  const toast = useToast();

  useEffect(() => {
    void db().then((d) => d.count('documents')).then((n) => {
      setDocuments(n);
      setLoaded(true);
    });
  }, []);

  // Remind once per start when the last backup is older than the setting allows.
  useEffect(() => {
    if (!loaded || reminded.current || !settings.onboarded || settings.backupReminderDays === 0 || documents === 0) return;
    const last = settings.lastBackupAt ? Date.parse(settings.lastBackupAt) : 0;
    if (Date.now() - last < settings.backupReminderDays * 86_400_000) return;
    reminded.current = true;
    toast(settings.lastBackupAt ? 'It has been a while since your last backup.' : 'Your documents are only on this device: make a backup.', 'info', {
      label: 'Back up',
      run: () => navigate({ name: 'settings' }),
    });
  }, [loaded, settings, documents, toast]);

  if (!loaded || settings.onboarded) return null;
  const finish = () => void updateSettings((s) => { s.onboarded = true; });
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <Dialog
      title="Welcome to Rebar Studio"
      onClose={finish}
      footer={
        <>
          <Button variant="ghost" onClick={finish}>Skip</Button>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
          {last ? (
            <>
              <Button onClick={() => { finish(); navigate({ name: 'settings' }); }}>Set up my profile</Button>
              <Button variant="primary" onClick={finish}>Start</Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setStep(step + 1)}>Next</Button>
          )}
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="rounded-2xl bg-brand-amber/15 p-4 text-brand-amber">{current.icon}</div>
        <h3 className="text-lg font-bold text-white">{current.title}</h3>
        <p className="max-w-sm text-slate-300">{current.body}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 w-6 rounded-full ${i === step ? 'bg-brand-amber' : 'bg-white/15'}`} />
          ))}
        </div>
        {last && <p className="flex items-center gap-1.5 text-xs text-slate-500"><HardDriveDownload size={15} /> Settings has backup and restore.</p>}
      </div>
    </Dialog>
  );
}
