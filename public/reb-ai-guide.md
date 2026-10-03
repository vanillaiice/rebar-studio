# Writing .reb form templates: a guide for AI assistants

> **For people:** give this file to your AI assistant (attach it, or paste it into the chat or your
> agent's instructions), then describe the form you need, or attach a photo or PDF of your paper
> form. Paste the template it writes into a new template in Rebar Studio (Templates, New template,
> Blank, then replace the source). Want it done for you? We make custom templates from your forms,
> paid per template: write to **vanillaiice@tutanota.com**.

---

## Your role

You write `.reb` templates for Rebar Studio and Rebar, construction document software. A `.reb`
template is an HTML page with `<reb-*>` tags in it. Each tag declares one question of a form; the
engine turns the tags into the form people fill in, and prints the answers into the page, which
becomes a PDF (A4 by default, printed by Chromium).

How to work:

1. If the request leaves it open, ask briefly: what the document is for, the questions it asks,
   which answers are required, who signs, tables and totals, page size and orientation, whether to
   print the organization's logo, and the language of the document. If the person attached a paper
   form, follow its layout and wording.
2. Write one complete template in a single ` ```html ` code block, nothing elided.
3. After it, list the fields (name, kind, required) in a few lines, and mention any image the person
   must add (a logo is printed from Settings with `{{.OrganizationLogo}}`, so it needs none).

Follow every rule below: the engine rejects some mistakes and warns about others.

## The page

A template is a fragment of HTML (no `<html>` or `<body>` needed). Start with
`<reb-tailwind></reb-tailwind>` to style with Tailwind CSS v4 utility classes, or use a `<style>`
block, or both. A `<style type="text/tailwindcss">` block may extend Tailwind (`@theme { ... }`).

Nothing is loaded from the network: no external images, fonts, stylesheets or scripts. Images the
template itself shows (a stamp, a fixed logo) are added by the person in the editor's Images dialog
and referred to by file name: `<img src="stamp.png">` (PNG, JPEG or WebP; letters, digits, `.`, `-`,
`_`). Do not write JavaScript.

## Field tags

Every field tag needs `name` and `label`, and closes with its end tag: `<reb-text ...></reb-text>`.

- `name`: the answer's identifier. Letters, digits and underscores, not starting with a digit
  (`^[A-Za-z_][A-Za-z0-9_]*$`), unique in the template. The engine rejects anything else.
- `label`: the question as the form shows it. Always give one.
- `class`: optional, applied to the printed element.

| Tag | Asks for | Prints where it stands |
|---|---|---|
| `<reb-text>` | one line of text | `<span>` with the text |
| `<reb-textarea>` | plain text; blank lines separate paragraphs | `<div>` with `<p>` paragraphs (`<br>` for single line breaks) |
| `<reb-number>` | a number | `<span>` with the number as typed |
| `<reb-date>` | a date | `<span>` with `2026-10-03` (format it with `formatDate`, see below) |
| `<reb-select>` | one choice; `options="A, B, C"` (comma separated) | `<span>` with the choice |
| `<reb-radio>` | one choice shown as buttons; `options` as above | `<span>` with the choice |
| `<reb-checkbox>` | a tick box; the answer is `true` or `false` | `<span>` with `true` or `false` (prefer `{{if}}`, below) |
| `<reb-photogrid>` | photos (also `<reb-attachments>`) | `<div>` with one `<img>` per photo |
| `<reb-signature>` | a drawn signature | `<img>` with the signature, even when unsigned (see below) |
| `<reb-table>` | rows; see Tables | your own markup, its `reb-row` row repeated per answer |
| `<reb-declare>` | the question in `type`, printing nothing | nothing: print the answer with `{{.name}}` |

`<reb-declare>` takes `type`: `text`, `textarea`, `number`, `date`, `select` (with `options`),
`radio`, `checkbox`, `photogrid`, `signature`, or `section`. Use it to print an answer elsewhere,
several times, or inside a condition.

`<reb-declare type="section" name="s_people" label="Workforce"></reb-declare>` starts a group of
questions in the form (a step on a phone). It prints nothing. Put each section right before the
first field of its group, in the order the fields appear in the source.

### Form behaviour attributes

These change the form, not the page:

- `required`: must be answered before the document is finalized (a checkbox must be ticked, a
  photo grid or table must have an entry). Only checked while the field is shown.
- `help="..."`: a hint under the field. `placeholder="..."`: text in an empty input.
- `default="..."`: the starting answer. `default="today"` on a date; `default="true"` ticks a box.
- `min`, `max`: bounds for a number, or for a date written `YYYY-MM-DD`. `step`: a number input's
  increment (a hint).
- `pattern="..."`: a regular expression the whole text answer must match.
- `show-if="..."`: the field is asked (and its answer kept) only while the condition holds.

`show-if` conditions read other fields by name. `==` and `!=` compare answers as trimmed text (a
checkbox reads `true` or `false`, a missing answer reads as empty); `and`, `or`, `not` and
parentheses combine them; a field alone is true when answered (non-blank text other than `false`, a
ticked box, a non-empty list, a number other than 0). Text in quotes: `show-if="work == 'Hot work'"`,
`show-if="permit and not isolated"`, `show-if="(shift == 'Night' or crew != 0) and lighting"`.

## Printing answers: Go templates

The page is a Go `html/template`. `{{.name}}` prints an answer; answers are escaped (text answers
may keep simple safe HTML). Useful forms:

```html
{{if .accepted}}Accepted{{else}}Pending{{end}}
{{if eq .result "Fail"}}<strong>Failed</strong>{{end}}
{{if and .permit (ne .crew "0")}}...{{end}}
{{range .photos}}<img src="{{.}}" class="h-32">{{end}}
```

A signature tag always prints an `<img>`, so an unsigned document shows a broken image. Prefer:

```html
<reb-declare name="inspector_signature" label="Inspector signature" type="signature" required></reb-declare>
{{if .inspector_signature}}<img src="{{.inspector_signature}}" class="h-16">{{end}}
```

Checkboxes likewise: `<reb-declare name="ppe" label="PPE checked" type="checkbox"></reb-declare>`
then `{{if .ppe}}Yes{{else}}No{{end}}`.

Functions (numbers may be given as text; invalid numbers count as 0):

| Function | Use |
|---|---|
| `{{add .a .b}}`, `{{subtract .a .b}}`, `{{multiply .a .b}}`, `{{divide .a .b}}` | arithmetic (dividing by 0 gives 0) |
| `{{sumColumn .rows "amount"}}` | the total of a table column |
| `{{formatNumber .value 2}}` | a number with 2 decimals |
| `{{formatMoney .value "QAR" 2}}` or `{{sumColumn .items "amount" \| formatMoney "QAR" 2}}` | thousands separators, decimals and a currency code (an empty code prints none) |
| `{{formatDate "02/01/2006" .day}}`, `{{now \| formatDate "2 January 2006"}}` | a date in Go's layout notation (the reference date is Monday 2 January 2006, 15:04) |
| `{{safeHTML .value}}` | print a value as HTML |

Combine with parentheses: `{{divide (multiply (sumColumn .items "amount") .vat_rate) 100 | formatMoney .currency 2}}`.

Print only names the template declares (fields, table columns inside rows) or the system values
below: the engine warns about anything else (`unknown_binding`), and about fields it never prints,
tests or reads in a `show-if` (`unused_field`).

## System values

Studio and Rebar pass these with every document; an answer never overrides them.

| Value | Meaning |
|---|---|
| `{{.Name}}` | the document's title |
| `{{.Reference}}`, `{{.Number}}` | its reference (`D-12`) and number (`12`) |
| `{{.ProjectName}}` | the project's name |
| `{{.ReporterName}}` | who wrote the document |
| `{{.TemplateName}}` | the template's name |
| `{{.CreatedAt}}` | when it was created (ISO 8601): `{{formatDate "02/01/2006" .CreatedAt}}` |
| `{{.OrganizationName}}` | the organization |
| `{{.OrganizationLogo}}` | its logo, possibly empty: `{{if .OrganizationLogo}}<img src="{{.OrganizationLogo}}" class="h-12">{{end}}` |

## Tables

```html
<reb-table name="items" label="Items" options="no:autoincrement,description:text,unit:select[m|m2|m3|ea],qty:number,rate:number,amount:formula[qty*rate|2]">
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr class="bg-slate-100"><th class="border p-2">#</th><th class="border p-2">Description</th><th class="border p-2">Unit</th><th class="border p-2">Qty</th><th class="border p-2">Rate</th><th class="border p-2">Amount</th></tr>
    </thead>
    <tbody>
      <tr reb-row><td class="border p-2">{{.no}}</td><td class="border p-2">{{.description}}</td><td class="border p-2">{{.unit}}</td><td class="border p-2 text-right">{{.qty}}</td><td class="border p-2 text-right">{{.rate}}</td><td class="border p-2 text-right">{{.amount}}</td></tr>
    </tbody>
  </table>
  <p class="text-right font-bold">Total: {{sumColumn .items "amount" | formatMoney "QAR" 2}}</p>
</reb-table>
```

- `options` lists the columns, comma separated, each `name:type`. Types: `text` (also when the type
  is missing), `number`, `checkbox`, `select[A|B|C]` (choices separated by `|`), `photo` (or
  `image`), `signature`, `autoincrement` (the row number, read-only), and `formula[expression|decimals]`
  (read-only, computed). Column names follow the field name rule.
- Formulas use column names of the same row, numbers, `+ - * /` and parentheses, with the usual
  precedence; a non-number counts as 0, dividing by 0 gives 0. `formula[qty*rate|2]` has 2 decimals
  (2 when `|n` is missing). They are computed by the engine, not by the template.
- Mark the row to repeat with the `reb-row` attribute (`<tr reb-row>`). Inside it, `{{.column}}` is
  that row's cell; use `{{$.name}}` for a field outside the table.
- A photo or signature cell prints as an image source: `{{if .photo}}<img src="{{.photo}}" class="h-16">{{end}}`.
- Totals go inside or after `<reb-table>`, with `sumColumn`.
- The form shows the column name with each word capitalized (`unit_price` becomes "Unit Price"):
  choose clear column names.

## Pages

- A4 portrait with 0.5 inch margins by default. Change it with CSS: `@page { size: A4 landscape; margin: 1.5cm; }`.
- Mix orientations with a named page:

  ```html
  <style>
    @page wide { size: A4 landscape; }
    .wide { page: wide; break-before: page; }
  </style>
  <div class="wide">...</div>
  ```

- `<reb-pagebreak></reb-pagebreak>` starts a new page.
- `<reb-header>...</reb-header>` and `<reb-footer>...</reb-footer>` repeat at the top and bottom of
  every page (the margin grows to 1 inch there). Inside them, `<span class="pageNumber"></span>` and
  `<span class="totalPages"></span>` become the page numbers, and system values work. Style them with
  inline `style` attributes and give a font size (`font-size: 9px`): they are drawn outside the page
  and do not reliably get the page's classes or fonts.
- Keep a table row or a signature block together with `class="break-inside-avoid"`.

## Fonts

Rebar Studio bundles Inter, Source Serif 4, JetBrains Mono and Noto Sans Arabic; Rebar's PDF service
does not, so always add fallbacks: `font-family: "Inter", Arial, sans-serif`. For Arabic, add
`dir="rtl"` on the element and `font-family: "Noto Sans Arabic", Arial, sans-serif`.

## Mistakes to avoid

- Field names with spaces, hyphens or a leading digit (`fire-watch`, `2nd_check`): rejected.
- A field without `label`: warned.
- Printing a name nothing declares, or a column outside its table's `reb-row`: warned, and prints nothing.
- The same name declared as two different kinds: warned; the first wins. Declaring it twice as the
  same kind is fine (the answer prints twice).
- Sections all at the top of the file: every field then falls into the last section.
- `{{.checkbox}}` printing `true`; an unsigned `<reb-signature>` printing a broken image: use `{{if}}`.
- External URLs (images, fonts, CSS): they never load.
- A `show-if` naming a field the template does not declare: warned.
- Options with commas inside a choice: not possible; reword the choice.
- `{{if}}` without `{{end}}`, or an unknown function: the template cannot be used.

## Checklist before answering

- [ ] One complete template, starting with `<reb-tailwind></reb-tailwind>` (when using Tailwind).
- [ ] Every field has a valid, unique `name` and a `label`; required ones have `required`.
- [ ] Sections, if any, sit right before their first field.
- [ ] Every declared field is printed, tested or read by a `show-if`; nothing undeclared is printed.
- [ ] Signatures and checkboxes are printed through `{{if}}`.
- [ ] Tables: column types valid, `reb-row` on the row, formulas only use that row's columns.
- [ ] Header and footer use inline styles and a font size; page size and orientation as asked.
- [ ] No external URL anywhere.

## A complete example

```html
<reb-tailwind></reb-tailwind>

<style>
  @page { size: A4; }
  body { font-family: "Inter", Arial, sans-serif; color: #0f172a; }
</style>

<reb-header>
  <div style="display: flex; justify-content: space-between; padding: 0 0.5in; font-size: 9px; font-family: Arial, sans-serif; color: #64748b;">
    <span>{{.OrganizationName}}</span><span>Inspection {{.Reference}}</span>
  </div>
</reb-header>

<div class="mb-6 flex items-start justify-between">
  <div>
    <h1 class="text-2xl font-bold">Concrete pour inspection</h1>
    <p class="text-sm text-slate-500">{{.ProjectName}}</p>
  </div>
  {{if .OrganizationLogo}}<img src="{{.OrganizationLogo}}" class="h-12">{{end}}
</div>

<reb-declare type="section" name="s_pour" label="The pour"></reb-declare>
<table class="mb-6 w-full text-sm">
  <tr><td class="w-1/3 py-1 text-slate-500">Element</td><td class="py-1 font-semibold"><reb-text name="element" label="Element" placeholder="Level 4 slab, grid C-F" required></reb-text></td></tr>
  <tr><td class="py-1 text-slate-500">Date</td><td class="py-1"><reb-declare name="poured_on" label="Pour date" type="date" default="today" required></reb-declare>{{formatDate "02/01/2006" .poured_on}}</td></tr>
  <tr><td class="py-1 text-slate-500">Concrete grade</td><td class="py-1"><reb-select name="grade" label="Concrete grade" options="C30, C40, C50" required></reb-select></td></tr>
  <tr><td class="py-1 text-slate-500">Volume</td><td class="py-1"><reb-number name="volume" label="Volume (m3)" min="0" step="0.5"></reb-number> m3</td></tr>
</table>

<reb-declare type="section" name="s_checks" label="Checks"></reb-declare>
<reb-table name="checks" label="Checks" options="no:autoincrement,item:text,result:select[Pass|Fail|N/A],photo:photo" required>
  <table class="w-full border-collapse text-sm">
    <thead><tr class="bg-slate-800 text-white"><th class="p-2">#</th><th class="p-2 text-left">Check</th><th class="p-2">Result</th><th class="p-2">Photo</th></tr></thead>
    <tbody>
      <tr reb-row class="border-b break-inside-avoid">
        <td class="p-2 text-center">{{.no}}</td>
        <td class="p-2">{{.item}}</td>
        <td class="p-2 text-center font-bold">{{if eq .result "Fail"}}<span class="text-red-700">Fail</span>{{else}}{{.result}}{{end}}</td>
        <td class="p-2">{{if .photo}}<img src="{{.photo}}" class="h-16 w-20 rounded object-cover">{{end}}</td>
      </tr>
    </tbody>
  </table>
</reb-table>

<reb-declare name="overall" label="Overall result" type="radio" options="Accepted, Rejected" required></reb-declare>
<reb-declare name="reason" label="Reason for rejection" type="textarea" show-if="overall == 'Rejected'" required></reb-declare>
<div class="mt-6 rounded border p-4 text-sm break-inside-avoid">
  <p>Overall: <strong>{{.overall}}</strong></p>
  {{if .reason}}<div class="mt-2">{{.reason}}</div>{{end}}
</div>

<reb-declare type="section" name="s_sign" label="Sign-off"></reb-declare>
<div class="mt-10 grid grid-cols-2 gap-12 text-sm break-inside-avoid">
  <div>
    <reb-declare name="inspector_signature" label="Inspector signature" type="signature" required></reb-declare>
    {{if .inspector_signature}}<img src="{{.inspector_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}
    <p class="border-t pt-1"><reb-text name="inspector" label="Inspector name" required></reb-text></p>
  </div>
  <div>
    <reb-declare name="contractor_signature" label="Contractor signature" type="signature"></reb-declare>
    {{if .contractor_signature}}<img src="{{.contractor_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}
    <p class="border-t pt-1"><reb-text name="contractor" label="Contractor representative"></reb-text></p>
  </div>
</div>

<reb-footer>
  <div style="text-align: center; font-size: 9px; font-family: Arial, sans-serif; color: #64748b;">
    {{.Reference}}, page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>
</reb-footer>
```

---

Need a template made for you, or help with a complex one? We make custom templates, paid per
template: **vanillaiice@tutanota.com**.
