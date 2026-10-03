<reb-tailwind></reb-tailwind>
<style>body { font-family: "Inter", Arial, sans-serif; color: #0f172a; } th { text-align: left; }</style>

<div class="mb-6 rounded border border-emerald-200 bg-emerald-50 p-5">
  <p class="text-xs uppercase tracking-widest text-emerald-700">Equipment inspection</p>
  <h1 class="text-2xl font-bold">{{.ProjectName}}</h1>
  <p class="text-sm text-slate-500">{{.OrganizationName}} · {{.Reference}}</p>
</div>

<reb-declare type="section" name="s_equipment" label="Equipment"></reb-declare>
<div class="mb-6 grid grid-cols-2 gap-4 text-sm">
  <p>Equipment: <reb-text name="equipment" label="Equipment description" required></reb-text></p>
  <p>Asset ID: <reb-text name="asset_number" label="Asset or serial number" required></reb-text></p>
  <p><reb-declare name="inspection_date" label="Inspection date" type="date" default="today" required></reb-declare>Inspected: {{formatDate "02/01/2006" .inspection_date}}</p>
  <p>Meter: <reb-number name="hours" label="Operating hours" min="0"></reb-number> hours</p>
</div>

<reb-declare type="section" name="s_checks" label="Checks and defects"></reb-declare>
<reb-table name="checks" label="Inspection checks" options="no:autoincrement,check:text,result:select[Pass|Fail|Not applicable],notes:text,photo:photo">
  <table class="w-full border-collapse text-sm">
    <thead><tr class="bg-emerald-50"><th class="border p-2">#</th><th class="border p-2">Check</th><th class="border p-2">Result</th><th class="border p-2">Notes</th><th class="border p-2">Photo</th></tr></thead>
    <tbody><tr reb-row><td class="border p-2">{{.no}}</td><td class="border p-2">{{.check}}</td><td class="border p-2">{{.result}}</td><td class="border p-2">{{.notes}}</td><td class="border p-2">{{if .photo}}<img src="{{.photo}}" class="h-14 w-20 object-cover">{{end}}</td></tr></tbody>
  </table>
</reb-table>
<reb-declare name="unsafe" label="Equipment must be taken out of service" type="checkbox"></reb-declare>
<reb-declare name="corrective_action" label="Defects and corrective action" type="textarea" show-if="unsafe" required></reb-declare>
{{if .unsafe}}<div class="mt-6 border-2 border-red-600 p-4 text-sm"><h2 class="font-bold text-red-700">OUT OF SERVICE</h2><p>{{.corrective_action}}</p></div>{{end}}

<reb-declare type="section" name="s_signoff" label="Inspector sign-off"></reb-declare>
<p class="mt-6 text-sm">Inspector: <reb-text name="inspector" label="Inspector name" required></reb-text></p>
<reb-declare name="signature" label="Inspector signature" type="signature" required></reb-declare>
{{if .signature}}<img src="{{.signature}}" class="mt-2 h-16">{{else}}<div class="h-16"></div>{{end}}
<p class="mt-4 text-sm"><reb-declare name="next_inspection" label="Next inspection date" type="date"></reb-declare>{{if .next_inspection}}Next inspection: {{formatDate "02/01/2006" .next_inspection}}{{end}}</p>
