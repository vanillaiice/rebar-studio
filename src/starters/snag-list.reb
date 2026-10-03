<reb-tailwind></reb-tailwind>

<style>
  @page { size: A4 landscape; }
  body { font-family: "Inter", Arial, sans-serif; }
</style>

<div class="mb-4 flex items-baseline justify-between">
  <h1 class="text-2xl font-bold">Snag list</h1>
  <p class="text-sm text-slate-500">{{.ProjectName}} · <reb-text name="area" label="Area or unit" required></reb-text> · {{.Reference}}</p>
</div>

<reb-table name="snags" label="Snags" options="no:autoincrement,location:text,description:text,trade:select[Civil|MEP|Finishes|Facade|Landscape],priority:select[High|Medium|Low],photo:photo,closed:checkbox">
  <table class="w-full border-collapse text-xs">
    <thead><tr class="bg-slate-100"><th class="border p-1.5">#</th><th class="border p-1.5">Location</th><th class="border p-1.5">Description</th><th class="border p-1.5">Trade</th><th class="border p-1.5">Priority</th><th class="border p-1.5">Photo</th><th class="border p-1.5">Closed</th></tr></thead>
    <tbody>
      <tr reb-row>
        <td class="border p-1.5 text-center">{{.no}}</td>
        <td class="border p-1.5">{{.location}}</td>
        <td class="border p-1.5">{{.description}}</td>
        <td class="border p-1.5">{{.trade}}</td>
        <td class="border p-1.5 font-bold">{{.priority}}</td>
        <td class="border p-1.5">{{if .photo}}<img src="{{.photo}}" class="h-14 w-20 object-cover">{{end}}</td>
        <td class="border p-1.5 text-center">{{if .closed}}Yes{{else}}No{{end}}</td>
      </tr>
    </tbody>
  </table>
</reb-table>

<p class="mt-4 text-xs text-slate-500">Raised by {{.ReporterName}}, {{formatDate "02/01/2006" .CreatedAt}}</p>

<reb-footer>
  <div style="text-align: right; padding: 0 0.5in; font-size: 9px; color: #64748b; font-family: Arial, sans-serif;">{{.Reference}} · page <span class="pageNumber"></span>/<span class="totalPages"></span></div>
</reb-footer>
