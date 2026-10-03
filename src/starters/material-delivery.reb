<reb-tailwind></reb-tailwind>
<style>body { font-family: "Inter", Arial, sans-serif; color: #0f172a; } th { text-align: left; }</style>

<div class="mb-6 border-l-8 border-sky-600 bg-sky-50 p-5">
  <p class="text-xs uppercase tracking-widest text-sky-700">{{.OrganizationName}}</p>
  <h1 class="text-2xl font-bold">Material delivery</h1>
  <p class="text-sm text-slate-500">{{.ProjectName}} · {{.Reference}}</p>
</div>

<reb-declare type="section" name="s_delivery" label="Delivery details"></reb-declare>
<div class="mb-6 grid grid-cols-2 gap-4 text-sm">
  <p>Supplier: <reb-text name="supplier" label="Supplier" required></reb-text></p>
  <p>Delivery note: <reb-text name="delivery_note" label="Delivery note number" required></reb-text></p>
  <p><reb-declare name="delivered_on" label="Delivery date" type="date" default="today" required></reb-declare>Date: {{formatDate "02/01/2006" .delivered_on}}</p>
  <p>Vehicle: <reb-text name="vehicle" label="Vehicle registration"></reb-text></p>
</div>

<reb-declare type="section" name="s_materials" label="Materials received"></reb-declare>
<reb-table name="materials" label="Materials" options="no:autoincrement,description:text,unit:select[ea|m|m2|m3|kg|tonne],ordered:number,received:number,condition:select[Good|Damaged|Rejected]">
  <table class="w-full border-collapse text-sm">
    <thead><tr class="bg-sky-50"><th class="border p-2">#</th><th class="border p-2">Material</th><th class="border p-2">Unit</th><th class="border p-2">Ordered</th><th class="border p-2">Received</th><th class="border p-2">Condition</th></tr></thead>
    <tbody><tr reb-row><td class="border p-2">{{.no}}</td><td class="border p-2">{{.description}}</td><td class="border p-2">{{.unit}}</td><td class="border p-2">{{.ordered}}</td><td class="border p-2">{{.received}}</td><td class="border p-2">{{.condition}}</td></tr></tbody>
  </table>
</reb-table>

<reb-declare type="section" name="s_receipt" label="Receipt and photos"></reb-declare>
<reb-declare name="has_discrepancies" label="Delivery has discrepancies" type="checkbox"></reb-declare>
<reb-declare name="discrepancies" label="Discrepancies and action taken" type="textarea" show-if="has_discrepancies" required></reb-declare>
{{if .has_discrepancies}}<h2 class="mt-6 font-bold text-red-700">Discrepancies</h2><p class="text-sm">{{.discrepancies}}</p>{{end}}
<h2 class="mb-2 mt-6 font-bold">Delivery photos</h2>
<reb-photogrid name="photos" label="Delivery photos" class="grid grid-cols-3 gap-2"></reb-photogrid>
<p class="mt-6 text-sm">Received by: <reb-text name="received_by" label="Received by" required></reb-text></p>
<reb-declare name="signature" label="Receiver signature" type="signature"></reb-declare>
{{if .signature}}<img src="{{.signature}}" class="mt-2 h-16">{{end}}
