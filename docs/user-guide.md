# Rebar Studio: user guide

Rebar Studio makes form templates in the `.reb` format, fills documents from them and turns the
documents into PDFs. It needs no account and no connection: your templates and documents live on
your device.

## Desktop or browser

- **Desktop app** (Windows, macOS, Linux): the preview and every export are the real PDF, printed
  the way Rebar prints it. Use it when the PDF matters, for templates that mix portrait and
  landscape pages, and for batch PDF export.
- **Web app**: open it in Chrome or Edge, then install it (the install icon in the address bar, or
  "Add to Home Screen" on a tablet). It works offline once loaded. It prints through the browser's
  print dialog ("Save as PDF"); it cannot show mixed page orientations.

## Templates

The **Templates** page lists your templates. **New template** starts from a blank page or a starter
(permit to work, site diary, inspection checklist, snag list, handover certificate, price estimate,
toolbox talk). **Import** reads `.reb`, `.rebpack` and `.rebdoc` files.

The editor has four tabs:

- **Source**: the `.reb` file. The Components sidebar inserts fields, layout blocks and system
  values; typing `<` outside a tag suggests them too. Problems show as red (the template cannot be
  used) or amber (worth fixing) marks, and in the Problems list under the editor: click one to jump
  to it.
- **Form**: the form your template produces, to try it out (nothing is saved).
- **Compiled** and **Schema**: what the engine makes of the template.

The preview on the right uses sample answers. Changes are saved as you type.

**Images** holds the template's own images (a logo, a stamp): refer to one by its file name,
`<img src="logo.png">`. **Versions** lists the template's versions: once a document uses a version,
the next edit starts a new one, so filled documents never change. You can view and restore an older
version.

The **Reference** page has the full `.reb` specification. In short:

```html
<reb-text name="client" label="Client" required></reb-text>
<reb-select name="work_type" label="Work type" options="Hot work, Cold work"></reb-select>
<reb-text name="fire_watch" label="Fire watch" show-if="work_type == 'Hot work'"></reb-text>
<reb-table name="items" label="Items" options="qty:number,rate:number,amount:formula[qty*rate|2]">...</reb-table>
<p>{{.Reference}} for {{.OrganizationName}}</p>
```

## Documents

**Fill** (on a template) or **New document** starts a draft, numbered from Settings (`D-1`,
`D-2`...). The form follows the template: fields shown only when a condition holds, tables whose
computed columns update as you type, photos (take one with the camera, choose files, drop or paste
them), signatures drawn with a finger, pen or mouse. Everything is saved as you type; undo and
redo are in the header (Ctrl+Z outside a text box).

**Preview** shows the document as it will print. **Finalize** checks the answers (it takes you to
the first one that needs attention), renders the document, records its SHA-256 fingerprint and
locks it. A final document can be exported, duplicated, or **reopened as a revision**: a new draft
with the same reference and the next revision number.

When a template gets a new version, its drafts can **move to the latest version**; final documents
keep theirs.

The **Documents** page filters by template and status, and exports a selection: PDFs to a folder
(desktop), `.rebdoc` files, or for one template, its **register** (one row per document, as CSV or
JSON).

## Files

| File | What it holds | Use it to |
|---|---|---|
| `.reb` | a template's source | edit it anywhere, keep it in version control |
| `.rebpack` | a template with its images | share a template, or import it into Rebar |
| `.rebdoc` | one document: its template version, answers, photos, signatures and final PDF | archive it, send it, open it on another device |
| `.rebbackup` | the whole workspace | back up, or move to another device |

The desktop app opens these files when you double-click them.

## Settings

- **Profile**: your organization's name and logo, and your name; templates print them as
  `{{.OrganizationName}}`, `{{.OrganizationLogo}}` and `{{.ReporterName}}`.
- **Documents**: the reference prefix and next number, and how exported files are named. In the
  desktop app, **Open files automatically after saving them** opens exported PDFs and registers in
  their usual app (and the folder after a batch export); Studio's own files are only saved.
- **Photos**: the size photos are reduced to (or keep the originals).
- **Storage and backups**: what your workspace uses, **Back up now** and **Restore a backup**
  (restoring replaces everything). A browser can clear a site's data: keep backups, and install the
  web app. Studio reminds you when a backup is due.
- **Updates** (desktop): check at startup, stable or beta channel.

## Fonts

Studio bundles Inter, Source Serif 4, JetBrains Mono and Noto Sans Arabic so PDFs look the same on
every machine. Name one in your CSS: `font-family: "Inter", Arial, sans-serif`. Rebar's PDF service
does not have these fonts, so keep a fallback in templates you also use in Rebar.
