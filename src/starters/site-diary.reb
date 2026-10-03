<reb-tailwind></reb-tailwind>

<style>
  body { font-family: "Inter", Arial, sans-serif; color: #0f172a; }
  th { text-align: left; }
</style>

<div class="mb-6 flex items-end justify-between border-b-2 border-slate-800 pb-3">
  <div>
    <p class="text-xs uppercase tracking-widest text-slate-500">Site diary</p>
    <h1 class="text-2xl font-bold">{{.ProjectName}}</h1>
  </div>
  <div class="text-right text-sm">
    <reb-declare type="section" name="s_day" label="The day"></reb-declare>
    <reb-declare name="day" label="Date" type="date" default="today" required></reb-declare>
    <p class="font-semibold">{{formatDate "Monday 2 January 2006" .day}}</p>
    <p class="text-slate-500">{{.Reference}}</p>
  </div>
</div>

<div class="mb-6 grid grid-cols-3 gap-4 text-sm">
  <div><p class="text-slate-500">Weather</p><reb-select name="weather" label="Weather" options="Sunny, Cloudy, Rain, Wind, Sandstorm"></reb-select></div>
  <div><p class="text-slate-500">Temperature</p><reb-number name="temperature" label="Temperature (°C)" step="0.5"></reb-number> °C</div>
  <div><p class="text-slate-500">Shift</p><reb-radio name="shift" label="Shift" options="Day, Night" default="Day"></reb-radio></div>
</div>

<reb-declare type="section" name="s_people" label="Workforce"></reb-declare>
<h2 class="mb-2 font-bold">Workforce on site</h2>
<reb-table name="workforce" label="Workforce" options="trade:text,company:text,headcount:number">
  <table class="mb-1 w-full border-collapse text-sm">
    <thead><tr class="bg-slate-100"><th class="border p-2">Trade</th><th class="border p-2">Company</th><th class="border p-2 w-24">People</th></tr></thead>
    <tbody>
      <tr reb-row><td class="border p-2">{{.trade}}</td><td class="border p-2">{{.company}}</td><td class="border p-2 text-right">{{.headcount}}</td></tr>
    </tbody>
  </table>
  <p class="mb-6 text-right text-sm font-semibold">Total: {{sumColumn .workforce "headcount" | formatNumber 0}} people</p>
</reb-table>

<reb-declare type="section" name="s_work" label="Work and photos"></reb-declare>
<h2 class="mb-2 font-bold">Work carried out</h2>
<reb-textarea name="activities" label="Work carried out" required class="mb-6 text-sm"></reb-textarea>

<reb-declare name="had_delays" label="Delays or incidents today" type="checkbox"></reb-declare>
<reb-declare name="delays" label="Delays and incidents" type="textarea" show-if="had_delays" required></reb-declare>
{{if .had_delays}}
<h2 class="mb-2 font-bold text-red-700">Delays and incidents</h2>
<div class="mb-6 text-sm">{{.delays}}</div>
{{end}}

<h2 class="mb-2 font-bold">Photos</h2>
<reb-photogrid name="photos" label="Photos" class="mb-6 grid grid-cols-3 gap-2"></reb-photogrid>

<div class="mt-8 w-64 text-sm">
  <reb-declare name="signature" label="Site manager signature" type="signature"></reb-declare>{{if .signature}}<img src="{{.signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}
  <p class="border-t pt-1">{{.ReporterName}}</p>
</div>
