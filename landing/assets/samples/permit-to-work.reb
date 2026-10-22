<reb-tailwind></reb-tailwind>

<style>
  @page { size: A4; }
  body { font-family: "Inter", Arial, sans-serif; color: #0f172a; }
</style>

<reb-header class="text-slate-500">
  <div style="display: flex; justify-content: space-between; padding: 0 0.5in; font-size: 9px; font-family: Arial, sans-serif;">
    <span>{{.OrganizationName}}</span>
    <span>Permit {{.Reference}}</span>
  </div>
</reb-header>

<div class="mb-6 border-l-8 border-amber-500 bg-amber-50 px-5 py-4">
  <p class="text-xs font-semibold uppercase tracking-widest text-amber-700">Permit to work</p>
  <h1 class="text-2xl font-bold">{{.Name}}</h1>
  <p class="text-sm text-slate-600">{{.ProjectName}}</p>
</div>

<reb-declare type="section" name="s_work" label="The work"></reb-declare>
<table class="mb-6 w-full text-sm">
  <tr>
    <td class="w-1/3 py-1 text-slate-500">Work type</td>
    <td class="py-1 font-semibold"><reb-select name="work_type" label="Work type" options="Hot work, Confined space, Electrical isolation, Work at height" required></reb-select></td>
  </tr>
  <tr>
    <td class="py-1 text-slate-500">Location</td>
    <td class="py-1"><reb-text name="location" label="Location" placeholder="Level 3, east stair core" required></reb-text></td>
  </tr>
  <tr>
    <td class="py-1 text-slate-500">Valid on</td>
    <td class="py-1"><reb-declare name="valid_on" label="Valid on" type="date" default="today" required></reb-declare>{{formatDate "02/01/2006" .valid_on}}</td>
  </tr>
  <tr>
    <td class="py-1 text-slate-500">Crew size</td>
    <td class="py-1"><reb-number name="crew" label="Crew size" min="1" max="50" step="1"></reb-number></td>
  </tr>
</table>

<h2 class="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Description of the work</h2>
<reb-textarea name="description" label="Description of the work" help="What will be done, with which equipment." class="mb-6 text-sm"></reb-textarea>

<reb-declare type="section" name="s_controls" label="Controls"></reb-declare>
<h2 class="mb-2 text-sm font-bold uppercase tracking-wider text-slate-500">Controls</h2>
<ul class="mb-6 list-none space-y-1 text-sm">
  <li><reb-declare name="ppe_checked" label="PPE inspected and worn" type="checkbox" required></reb-declare>{{if .ppe_checked}}[x]{{else}}[ ]{{end}} PPE inspected and worn</li>
  <li><reb-declare name="area_barricaded" label="Area barricaded" type="checkbox"></reb-declare>{{if .area_barricaded}}[x]{{else}}[ ]{{end}} Area barricaded</li>
  <li><reb-declare name="fire_watch" label="Fire watch name" type="text" show-if="work_type == 'Hot work'" required></reb-declare>{{if .fire_watch}}Fire watch: {{.fire_watch}}{{end}}</li>
  <li><reb-declare name="gas_test" label="Gas test reading (% LEL)" type="number" show-if="work_type == 'Confined space'" required max="10"></reb-declare>{{if .gas_test}}Gas test: {{.gas_test}} % LEL{{end}}</li>
</ul>

<reb-declare type="section" name="s_sign" label="Authorization"></reb-declare>
<div class="grid grid-cols-2 gap-8 text-sm">
  <div>
    <p class="text-slate-500">Issued by</p>
    <reb-declare name="issuer_signature" label="Issuer signature" type="signature" required></reb-declare>{{if .issuer_signature}}<img src="{{.issuer_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}
    <p class="font-semibold"><reb-text name="issuer" label="Issuer name" required></reb-text></p>
  </div>
  <div>
    <p class="text-slate-500">Accepted by</p>
    <reb-declare name="receiver_signature" label="Receiver signature" type="signature"></reb-declare>{{if .receiver_signature}}<img src="{{.receiver_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}
    <p class="font-semibold"><reb-text name="receiver" label="Receiver name"></reb-text></p>
  </div>
</div>

<reb-footer>
  <div style="text-align: center; font-size: 9px; color: #64748b; font-family: Arial, sans-serif;">
    Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>
</reb-footer>
