// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Components the sidebar and autocompletion insert (reb specification sections 3 and 4).

export interface Snippet {
  label: string;
  snippet: string;
  help?: string;
  group: 'Fields' | 'Layout' | 'Values';
}

export const SNIPPETS: Snippet[] = [
  { group: 'Fields', label: 'Text', snippet: '<reb-text name="field_name" label="Field label"></reb-text>' },
  { group: 'Fields', label: 'Text area', snippet: '<reb-textarea name="field_name" label="Field label"></reb-textarea>', help: 'Plain text; blank lines make paragraphs.' },
  { group: 'Fields', label: 'Number', snippet: '<reb-number name="field_name" label="Field label" min="0" step="1"></reb-number>' },
  { group: 'Fields', label: 'Date', snippet: '<reb-date name="field_name" label="Field label" default="today"></reb-date>' },
  { group: 'Fields', label: 'Select', snippet: '<reb-select name="field_name" label="Field label" options="Option 1, Option 2"></reb-select>' },
  { group: 'Fields', label: 'Radio buttons', snippet: '<reb-radio name="field_name" label="Field label" options="Yes, No"></reb-radio>' },
  { group: 'Fields', label: 'Checkbox', snippet: '<reb-declare name="field_name" label="Field label" type="checkbox"></reb-declare>{{if .field_name}}Yes{{else}}No{{end}}', help: 'The answer is true or false: test it with {{if .name}}.' },
  { group: 'Fields', label: 'Photo grid', snippet: '<reb-photogrid name="photos" label="Photos" class="grid grid-cols-3 gap-2"></reb-photogrid>' },
  { group: 'Fields', label: 'Signature', snippet: '<reb-signature name="signature" label="Signature" class="h-16"></reb-signature>' },
  { group: 'Fields', label: 'Table', snippet: '<reb-table name="rows" label="Rows" options="no:autoincrement,item:text,qty:number">\n  <table class="w-full border-collapse text-sm">\n    <thead><tr class="bg-slate-100"><th class="border p-2">#</th><th class="border p-2">Item</th><th class="border p-2">Qty</th></tr></thead>\n    <tbody>\n      <tr reb-row><td class="border p-2">{{.no}}</td><td class="border p-2">{{.item}}</td><td class="border p-2">{{.qty}}</td></tr>\n    </tbody>\n  </table>\n</reb-table>' },
  { group: 'Fields', label: 'Table with totals', snippet: '<reb-table name="items" label="Items" options="description:text,qty:number,rate:number,amount:formula[qty*rate|2]">\n  <table class="w-full border-collapse text-sm">\n    <thead><tr class="bg-slate-100"><th class="border p-2">Description</th><th class="border p-2">Qty</th><th class="border p-2">Rate</th><th class="border p-2">Amount</th></tr></thead>\n    <tbody>\n      <tr reb-row><td class="border p-2">{{.description}}</td><td class="border p-2">{{.qty}}</td><td class="border p-2">{{.rate}}</td><td class="border p-2">{{.amount}}</td></tr>\n    </tbody>\n  </table>\n  <p class="text-right font-bold">Total: {{sumColumn .items "amount" | formatMoney "QAR" 2}}</p>\n</reb-table>' },
  { group: 'Fields', label: 'Hidden field', snippet: '<reb-declare name="field_name" label="Field label" type="text"></reb-declare>{{.field_name}}', help: 'Declares a field without printing it where it is declared.' },
  { group: 'Fields', label: 'Required', snippet: ' required', help: 'Add inside a field tag: the field must be answered.' },
  { group: 'Fields', label: 'Show if', snippet: ' show-if="other_field == \'Yes\'"', help: 'Add inside a field tag: shown only while the condition holds.' },
  { group: 'Layout', label: 'Form section', snippet: '<reb-declare type="section" name="section_1" label="Section title"></reb-declare>', help: 'Groups the fields after it in the form; prints nothing.' },
  { group: 'Layout', label: 'Page break', snippet: '<reb-pagebreak></reb-pagebreak>' },
  { group: 'Layout', label: 'Header', snippet: '<reb-header>\n  <div style="padding: 0 0.5in; font-size: 9px; font-family: Arial, sans-serif; color: #64748b;">{{.OrganizationName}} · {{.Reference}}</div>\n</reb-header>' },
  { group: 'Layout', label: 'Footer', snippet: '<reb-footer>\n  <div style="text-align: center; font-size: 9px; font-family: Arial, sans-serif; color: #64748b;">\n    Page <span class="pageNumber"></span> of <span class="totalPages"></span>\n  </div>\n</reb-footer>' },
  { group: 'Layout', label: 'Landscape pages', snippet: '<style>\n  @page landscape { size: A4 landscape; }\n  .landscape-page { page: landscape; page-break-before: always; }\n</style>\n<div class="landscape-page">\n</div>', help: 'Only the desktop app previews mixed orientations; the browser preview cannot.' },
  { group: 'Layout', label: 'Tailwind', snippet: '<reb-tailwind></reb-tailwind>' },
  { group: 'Values', label: 'Document title', snippet: '{{.Name}}' },
  { group: 'Values', label: 'Reference', snippet: '{{.Reference}}' },
  { group: 'Values', label: 'Project', snippet: '{{.ProjectName}}' },
  { group: 'Values', label: 'Organization', snippet: '{{.OrganizationName}}' },
  { group: 'Values', label: 'Logo', snippet: '{{if .OrganizationLogo}}<img src="{{.OrganizationLogo}}" class="h-12">{{end}}' },
  { group: 'Values', label: 'Author', snippet: '{{.ReporterName}}' },
  { group: 'Values', label: 'Created on', snippet: '{{formatDate "02/01/2006" .CreatedAt}}' },
  { group: 'Values', label: 'Today', snippet: '{{now | formatDate "02/01/2006"}}' },
];
