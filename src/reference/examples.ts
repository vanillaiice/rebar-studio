// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// The reference's examples (test/reference.test.ts checks each with the engine).

export const HERO = `<h1 class="text-2xl font-bold">Site visit</h1>
<p>
  Visited by
  <reb-text name="visitor" label="Visitor">
  </reb-text>
  on
  <reb-date name="visited_on" label="Date"
    default="today"></reb-date>.
</p>`;

export const FIELDS = `<p>Weather:
  <reb-select name="weather" label="Weather"
    options="Sunny, Cloudy, Rain"></reb-select>
</p>
<p>Shift:
  <reb-radio name="shift" label="Shift"
    options="Day, Night"></reb-radio>
</p>
<p>Crew:
  <reb-number name="crew" label="Crew size">
  </reb-number> people
</p>
<reb-textarea name="notes"
  label="What was done"></reb-textarea>`;

export const RULES = `<reb-select name="work" label="Type of work"
  options="Hot work, Cold work"
  required></reb-select>

<reb-text name="fire_watch"
  label="Fire watch name"
  required
  show-if="work == 'Hot work'"
  help="Stays until the area is cool.">
</reb-text>`;

export const ANYWHERE = `<reb-declare name="client"
  label="Client"></reb-declare>
<reb-declare name="accepted"
  label="Client accepted"
  type="checkbox"></reb-declare>

<p>Prepared for <b>{{.client}}</b>.</p>
{{if .accepted}}
  <p>Accepted by {{.client}}.</p>
{{else}}
  <p>Awaiting {{.client}}.</p>
{{end}}`;

export const TABLES = `<reb-table name="items" label="Items"
  options="item:text, qty:number,
    rate:number,
    amount:formula[qty*rate|2]">
  <table class="w-full text-sm">
    <tr class="border-b">
      <th class="text-left">Item</th>
      <th>Qty</th><th>Rate</th>
      <th class="text-right">Amount</th>
    </tr>
    <tr reb-row>
      <td>{{.item}}</td>
      <td>{{.qty}}</td><td>{{.rate}}</td>
      <td class="text-right">{{.amount}}</td>
    </tr>
  </table>
  <p class="text-right font-bold">
    Total: {{sumColumn .items "amount"
      | formatMoney "QAR" 2}}
  </p>
</reb-table>`;

export const PHOTOS = `<reb-photogrid name="photos"
  label="Photos"
  class="grid grid-cols-2 gap-2">
</reb-photogrid>

<reb-declare name="signed"
  label="Inspector signature"
  type="signature"></reb-declare>
{{if .signed}}
  <img src="{{.signed}}" class="h-14">
{{end}}
<p class="border-t text-sm">Inspector</p>`;

export const VALUES = `<p class="text-sm text-slate-500">
  {{.OrganizationName}}, {{.ProjectName}}
</p>
<h1 class="text-xl font-bold">{{.Name}}</h1>
<p>
  Reference {{.Reference}},
  by {{.ReporterName}} on
  {{formatDate "2 January 2006" .CreatedAt}}.
</p>`;

export const PAGES = `<style>
  @page { size: A4; margin: 1.5cm; }
</style>

<reb-header>
  <div style="font-size: 9px">
    {{.OrganizationName}}, {{.Reference}}
  </div>
</reb-header>

<reb-footer>
  <div style="font-size: 9px; text-align: center">
    Page <span class="pageNumber"></span>
    of <span class="totalPages"></span>
  </div>
</reb-footer>

<reb-pagebreak></reb-pagebreak>`;

export const LANDSCAPE = `<style>
  @page wide { size: A4 landscape; }
  .wide { page: wide; break-before: page; }
</style>

<div class="wide">A wide table goes here.</div>`;

// What each example's form starts with, so its page reads like a real document before anyone types.
export const STARTING_ANSWERS: Record<string, Record<string, unknown>> = {
  HERO: { visitor: 'Mariam Haddad' },
  FIELDS: { weather: 'Sunny', shift: 'Day', crew: '14', notes: 'Level 4 slab poured.\n\nCuring started at 16:00.' },
  RULES: { work: 'Cold work' },
  ANYWHERE: { client: 'Al Sadd Holding', accepted: false },
  TABLES: { items: [{ item: 'Concrete C40 (m3)', qty: '24', rate: '350' }, { item: 'Rebar (t)', qty: '3.5', rate: '2800' }] },
};
