<reb-tailwind></reb-tailwind>

<style>body { font-family: "Inter", Arial, sans-serif; }</style>

<h1 class="text-2xl font-bold">Inspection checklist</h1>
<p class="mb-6 text-sm text-slate-500">{{.Reference}} · {{.ProjectName}}</p>

<div class="mb-6 grid grid-cols-2 gap-4 text-sm">
  <div><p class="text-slate-500">Element inspected</p><p class="font-semibold"><reb-text name="element" label="Element inspected" required></reb-text></p></div>
  <div><p class="text-slate-500">Inspection date</p><reb-declare name="inspected_on" label="Inspection date" type="date" default="today"></reb-declare><p class="font-semibold">{{formatDate "02/01/2006" .inspected_on}}</p></div>
</div>

<reb-table name="checks" label="Checks" options="no:autoincrement,item:text,result:select[Pass|Fail|N/A],comment:text,photo:photo">
  <table class="w-full border-collapse text-sm">
    <thead><tr class="bg-slate-800 text-white"><th class="p-2 w-10">#</th><th class="p-2 text-left">Item</th><th class="p-2 w-20">Result</th><th class="p-2 text-left">Comment</th><th class="p-2 w-24">Photo</th></tr></thead>
    <tbody>
      <tr reb-row class="border-b">
        <td class="p-2 text-center">{{.no}}</td>
        <td class="p-2">{{.item}}</td>
        <td class="p-2 text-center font-bold">{{.result}}</td>
        <td class="p-2">{{.comment}}</td>
        <td class="p-2">{{if .photo}}<img src="{{.photo}}" class="h-16 w-20 rounded object-cover">{{end}}</td>
      </tr>
    </tbody>
  </table>
</reb-table>

<div class="mt-6 rounded border p-4 text-sm">
  <p class="text-slate-500">Overall result</p>
  <p class="text-lg font-bold"><reb-select name="overall" label="Overall result" options="Accepted, Accepted with comments, Rejected" required></reb-select></p>
  <reb-declare name="reinspection" label="Re-inspection date" type="date" show-if="overall == 'Rejected'" required></reb-declare>
  {{if .reinspection}}<p>Re-inspection on {{formatDate "02/01/2006" .reinspection}}</p>{{end}}
</div>

<div class="mt-8 flex gap-12 text-sm">
  <div><reb-declare name="inspector_signature" label="Inspector signature" type="signature" required></reb-declare>{{if .inspector_signature}}<img src="{{.inspector_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}<p class="border-t pt-1"><reb-text name="inspector" label="Inspector" required></reb-text></p></div>
  <div><reb-declare name="contractor_signature" label="Contractor signature" type="signature"></reb-declare>{{if .contractor_signature}}<img src="{{.contractor_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}<p class="border-t pt-1"><reb-text name="contractor" label="Contractor representative"></reb-text></p></div>
</div>
