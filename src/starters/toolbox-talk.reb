<reb-tailwind></reb-tailwind>

<style>body { font-family: "Inter", Arial, sans-serif; }</style>

<div class="mb-6 rounded bg-emerald-700 px-5 py-4 text-white">
  <p class="text-xs uppercase tracking-widest opacity-80">Toolbox talk</p>
  <h1 class="text-2xl font-bold"><reb-text name="topic" label="Topic" required placeholder="Working near live services"></reb-text></h1>
</div>

<div class="mb-6 grid grid-cols-3 gap-4 text-sm">
  <div><p class="text-slate-500">Presenter</p><p class="font-semibold"><reb-text name="presenter" label="Presenter" required></reb-text></p></div>
  <div><p class="text-slate-500">Date</p><reb-declare name="held_on" label="Date" type="date" default="today"></reb-declare><p class="font-semibold">{{formatDate "02/01/2006" .held_on}}</p></div>
  <div><p class="text-slate-500">Duration</p><p class="font-semibold"><reb-number name="minutes" label="Duration (minutes)" default="15"></reb-number> min</p></div>
</div>

<h2 class="mb-2 font-bold">Key points</h2>
<reb-textarea name="key_points" label="Key points" required class="mb-6 text-sm"></reb-textarea>

<h2 class="mb-2 font-bold">Attendance</h2>
<reb-table name="attendees" label="Attendees" options="no:autoincrement,name:text,company:text,signature:signature">
  <table class="w-full border-collapse text-sm">
    <thead><tr class="bg-slate-100"><th class="border p-2 w-10">#</th><th class="border p-2 text-left">Name</th><th class="border p-2 text-left">Company</th><th class="border p-2 w-40">Signature</th></tr></thead>
    <tbody>
      <tr reb-row><td class="border p-2 text-center">{{.no}}</td><td class="border p-2">{{.name}}</td><td class="border p-2">{{.company}}</td><td class="border p-1">{{if .signature}}<img src="{{.signature}}" class="mx-auto h-10">{{end}}</td></tr>
    </tbody>
  </table>
</reb-table>
