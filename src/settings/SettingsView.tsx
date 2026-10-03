// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Settings: the profile templates print ({{.OrganizationName}}, {{.OrganizationLogo}},
// {{.ReporterName}}), numbering, export names, photos, storage and backups, updates.

import { DatabaseBackup, HardDriveDownload, ImagePlus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSettings } from '../app/useSettings';
import { Badge, Button, Label, TextInput } from '../components/ui';
import { errorMessage, formatBytes, formatDate, inputClass } from '../components/format';
import { useConfirm } from '../components/useConfirm';
import { useToast } from '../components/toast';
import { engine } from '../engine/client';
import { buildBackup, markBackedUp, restoreBackup } from '../formats/backup';
import { desktop, IS_DESKTOP, openFiles, saveFile, type UpdateStatus } from '../platform/bridge';
import { assetUsage, deleteAsset, getAsset, putAsset } from '../store/assets';
import { updateSettings } from '../store/settings';
import type { Settings } from '../store/types';

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-brand-steel p-5">
      <h2 className="text-sm font-bold text-white">{title}</h2>
      {description && <p className="mt-1 text-xs text-slate-400">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

// A text setting saved when the input loses focus.
function SettingInput({ label, help, value, onSave, type = 'text', min }: { label: string; help?: ReactNode; value: string; onSave(v: string): void; type?: string; min?: number }) {
  const [draft, setDraft] = useState(value);
  // A new stored value (loaded, or changed elsewhere) replaces the draft.
  const [stored, setStored] = useState(value);
  if (value !== stored) {
    setStored(value);
    setDraft(value);
  }
  return (
    <Label label={label} help={help}>
      <TextInput type={type} min={min} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onSave(draft)} />
    </Label>
  );
}

async function measureUsage() {
  const estimate = (await navigator.storage?.estimate?.()) ?? {};
  const files = await assetUsage();
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  return { used: estimate.usage ?? files.bytes, quota: estimate.quota ?? 0, files: files.count, persisted };
}

export function SettingsView() {
  const settings = useSettings();
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [logoUrl, setLogoUrl] = useState('');
  const [usage, setUsage] = useState<{ used: number; quota: number; files: number; persisted: boolean | null } | null>(null);
  const [engineVersion, setEngineVersion] = useState('');
  const [appVersion, setAppVersion] = useState(__APP_VERSION__);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });

  // Read an input's value before calling change: the change is saved asynchronously, and by then React
  // has reset a controlled input to the value it last rendered.
  const change = (fn: (s: Settings) => void) => void updateSettings(fn).catch((e) => toast(errorMessage(e), 'error'));

  useEffect(() => {
    let url = '';
    void (async () => {
      const logo = settings.profile.logoAssetId ? await getAsset(settings.profile.logoAssetId) : undefined;
      url = logo ? URL.createObjectURL(logo.blob) : '';
      setLogoUrl(url);
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [settings.profile.logoAssetId]);

  const measure = () => measureUsage().then(setUsage);

  useEffect(() => {
    void measureUsage().then(setUsage);
    void engine.ready().then(setEngineVersion);
    void desktop?.getVersion().then(setAppVersion);
    return desktop?.onUpdateStatus(setUpdate);
  }, []);

  const setLogo = async () => {
    const [file] = await openFiles('image/png,image/jpeg,image/webp');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('The logo is limited to 5 MB.', 'error');
      return;
    }
    const asset = await putAsset(file, { owner: 'settings', kind: 'logo', name: file.name });
    const previous = settings.profile.logoAssetId;
    await updateSettings((s) => {
      s.profile.logoAssetId = asset.id;
    });
    if (previous) await deleteAsset(previous);
  };

  const removeLogo = async () => {
    const previous = settings.profile.logoAssetId;
    await updateSettings((s) => {
      s.profile.logoAssetId = null;
    });
    if (previous) await deleteAsset(previous);
  };

  const backup = async () => {
    try {
      const bytes = await buildBackup();
      const date = new Date().toISOString().slice(0, 10);
      const saved = await saveFile({ name: `rebar-studio-${date}.rebbackup`, bytes, type: 'application/zip', filters: [{ name: 'Rebar Studio backup', extensions: ['rebbackup'] }] });
      if (saved) {
        await markBackedUp();
        toast('Backup saved', 'success');
      }
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const restore = async () => {
    const [file] = await openFiles('.rebbackup');
    if (!file) return;
    const ok = await confirm({
      title: 'Restore a backup',
      message: `Everything in this workspace (templates, documents, files and settings) is replaced by the contents of ${file.name}. Make a backup first if you may need the current data.`,
      action: 'Replace and restore',
      danger: true,
    });
    if (!ok) return;
    try {
      const counts = await restoreBackup(new Uint8Array(await file.arrayBuffer()));
      toast(`Restored ${counts.templates} templates and ${counts.documents} documents`, 'success');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const persist = async () => {
    const granted = await navigator.storage?.persist?.();
    toast(granted ? 'This browser will keep Studio\'s data.' : 'The browser declined. Install Studio as an app, or keep backups.', granted ? 'success' : 'error');
    await measure();
  };

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-white/10 bg-brand-steel px-6 py-4">
        <h1 className="text-lg font-bold text-white">Settings</h1>
        <p className="text-xs text-slate-400">Everything stays on this device; nothing is sent anywhere.</p>
      </header>
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        <Section title="Profile" description="Templates print these as system values, so a template made here prints your details.">
          <SettingInput label="Organization" help={<code>{'{{.OrganizationName}}'}</code>} value={settings.profile.organizationName} onSave={(v) => change((s) => { s.profile.organizationName = v; })} />
          <SettingInput label="Your name" help={<code>{'{{.ReporterName}}'}</code>} value={settings.profile.authorName} onSave={(v) => change((s) => { s.profile.authorName = v; })} />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-300">Logo</span>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-40 items-center justify-center rounded-lg bg-white/90 p-2">
                {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-500">No logo</span>}
              </div>
              <Button size="sm" icon={<ImagePlus size={14} />} onClick={setLogo}>{logoUrl ? 'Replace' : 'Add logo'}</Button>
              {logoUrl && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={removeLogo}>Remove</Button>}
            </div>
            <span className="text-xs text-slate-500"><code>{'<img src="{{.OrganizationLogo}}">'}</code></span>
          </div>
        </Section>

        <Section title="Documents">
          <div className="grid grid-cols-2 gap-4">
            <SettingInput label="Reference prefix" value={settings.numbering.prefix} onSave={(v) => change((s) => { s.numbering.prefix = v; })} />
            <SettingInput label="Next number" type="number" min={1} value={String(settings.numbering.next)} onSave={(v) => change((s) => { s.numbering.next = Math.max(1, parseInt(v, 10) || 1); })} />
          </div>
          <p className="text-xs text-slate-500">The next document will be <span className="font-mono text-slate-300">{settings.numbering.prefix}{settings.numbering.next}</span> (<code>{'{{.Reference}}'}</code>; <code>{'{{.Number}}'}</code> is the number alone).</p>
          <SettingInput
            label="Exported file names"
            help={<>Placeholders: {'{template}'}, {'{title}'}, {'{reference}'}, {'{number}'}, {'{date}'}, {'{status}'}</>}
            value={settings.fileNamePattern}
            onSave={(v) => change((s) => { s.fileNamePattern = v.trim() || '{template}-{reference}-{date}'; })}
          />
          {IS_DESKTOP && (
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={settings.openAfterSave} onChange={(e) => { const value = e.target.checked; change((s) => { s.openAfterSave = value; }); }} className="mt-0.5 h-4 w-4 accent-brand-amber" />
              <span>
                Open files automatically after saving them
                <span className="block text-xs text-slate-500">PDFs, registers (CSV, JSON) and HTML open in their usual app; a batch export opens its folder.</span>
              </span>
            </label>
          )}
        </Section>

        <Section title="Photos" description="Photos are resized and compressed on this device before they are stored.">
          <Label label="Longest edge">
            <select className={`${inputClass} max-w-xs`} value={settings.photos.maxEdge} onChange={(e) => { const value = Number(e.target.value); change((s) => { s.photos.maxEdge = value; }); }}>
              {[1200, 1600, 2000, 3000].map((n) => <option key={n} value={n}>{n} px{n === 2000 ? ' (recommended)' : ''}</option>)}
            </select>
          </Label>
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input type="checkbox" checked={settings.photos.keepOriginal} onChange={(e) => { const value = e.target.checked; change((s) => { s.photos.keepOriginal = value; }); }} className="h-4 w-4 accent-brand-amber" />
            Keep original photos (larger files, full resolution)
          </label>
        </Section>

        <Section title="Storage and backups" description={IS_DESKTOP ? 'Your workspace lives in this app\'s data folder.' : 'Your workspace lives in this browser. Browsers can clear site data, so keep backups.'}>
          {usage && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span>{formatBytes(usage.used)} used{usage.quota ? ` of ${formatBytes(usage.quota)} available` : ''} · {usage.files} files</span>
              {usage.persisted === true && <Badge tone="green"><ShieldCheck size={12} /> Kept by the browser</Badge>}
              {usage.persisted === false && !IS_DESKTOP && <Button size="sm" onClick={persist}>Ask the browser to keep it</Button>}
            </div>
          )}
          <p className="text-xs text-slate-500">Last backup: {settings.lastBackupAt ? formatDate(settings.lastBackupAt) : 'never'}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<HardDriveDownload size={15} />} onClick={backup}>Back up now</Button>
            <Button icon={<DatabaseBackup size={15} />} onClick={restore}>Restore a backup</Button>
          </div>
          <Label label="Remind me to back up after">
            <select className={`${inputClass} max-w-xs`} value={settings.backupReminderDays} onChange={(e) => { const value = Number(e.target.value); change((s) => { s.backupReminderDays = value; }); }}>
              {[[3, '3 days'], [7, '1 week'], [14, '2 weeks'], [30, '1 month'], [0, 'Never remind me']].map(([n, label]) => <option key={n} value={n}>{label}</option>)}
            </select>
          </Label>
        </Section>

        {IS_DESKTOP && (
          <Section title="Updates">
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={settings.updates.autoCheck} onChange={(e) => { const value = e.target.checked; change((s) => { s.updates.autoCheck = value; }); }} className="h-4 w-4 accent-brand-amber" />
              Check for updates when Studio starts
            </label>
            <Label label="Channel">
              <select className={`${inputClass} max-w-xs`} value={settings.updates.channel} onChange={(e) => { const value = e.target.value as 'stable' | 'beta'; change((s) => { s.updates.channel = value; }); }}>
                <option value="stable">Stable</option>
                <option value="beta">Beta (earlier, less tested)</option>
              </select>
            </Label>
            <div className="flex items-center gap-3">
              <Button size="sm" icon={<RefreshCw size={14} />} disabled={update.state === 'checking' || update.state === 'downloading'} onClick={async () => setUpdate(await desktop!.checkForUpdates(settings.updates.channel))}>
                Check now
              </Button>
              <span className="text-xs text-slate-400">
                {update.state === 'checking' && 'Checking…'}
                {update.state === 'none' && 'Studio is up to date.'}
                {update.state === 'available' && `Version ${update.version} is available; downloading.`}
                {update.state === 'downloading' && `Downloading ${Math.round(update.percent ?? 0)}%`}
                {update.state === 'ready' && `Version ${update.version} is ready: restart to install.`}
                {update.state === 'unsupported' && (update.message ?? 'Updates are not available for this build.')}
                {update.state === 'error' && <span className="text-red-400">{update.message}</span>}
              </span>
              {update.state === 'ready' && <Button size="sm" variant="primary" onClick={() => desktop!.installUpdate()}>Restart and install</Button>}
            </div>
          </Section>
        )}

        <Section title="About">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-slate-500">Rebar Studio</dt><dd className="font-mono text-slate-300">{appVersion}</dd>
            <dt className="text-slate-500">Engine (reb)</dt><dd className="font-mono text-slate-300">{engineVersion}</dd>
          </dl>
          <p className="text-xs text-slate-500">
            Free software under the GNU GPL v3 or later. The engine is <span className="text-slate-300">github.com/vanillaiice/reb</span>; Studio is <span className="text-slate-300">github.com/vanillaiice/rebar-studio</span>.
          </p>
        </Section>
      </div>
      {confirmDialog}
    </div>
  );
}
