<reb-tailwind></reb-tailwind>

<style>
  body { font-family: "Source Serif 4", Georgia, serif; color: #1e293b; }
</style>

<div class="mx-auto max-w-2xl text-center">
  {{if .OrganizationLogo}}<img src="{{.OrganizationLogo}}" class="mx-auto mb-6 h-16 object-contain">{{end}}
  <p class="text-sm uppercase tracking-[0.3em] text-slate-500">{{.OrganizationName}}</p>
  <h1 class="mt-4 text-4xl font-bold">Certificate of Handover</h1>
  <p class="mt-2 text-slate-500">{{.Reference}}</p>

  <p class="mt-10 text-lg leading-relaxed">
    This certifies that the works described below, forming part of
    <strong>{{.ProjectName}}</strong>, were handed over by
    <strong><reb-text name="contractor" label="Contractor" required></reb-text></strong>
    to <strong><reb-text name="client" label="Client" required></reb-text></strong>
    on <reb-declare name="handover_date" label="Handover date" type="date" default="today" required></reb-declare><strong>{{formatDate "2 January 2006" .handover_date}}</strong>.
  </p>

  <div class="mt-8 rounded border border-slate-300 p-5 text-left">
    <p class="text-sm uppercase tracking-widest text-slate-500">Scope handed over</p>
    <reb-textarea name="scope" label="Scope handed over" required class="mt-2"></reb-textarea>
    <reb-declare name="has_exceptions" label="Handed over with exceptions" type="checkbox"></reb-declare>
    <reb-declare name="exceptions" label="Exceptions" type="textarea" show-if="has_exceptions" required></reb-declare>
    {{if .has_exceptions}}<p class="mt-4 text-sm uppercase tracking-widest text-slate-500">Exceptions</p><div class="mt-2">{{.exceptions}}</div>{{end}}
  </div>

  <div class="mt-16 grid grid-cols-2 gap-16 text-left">
    <div><reb-declare name="contractor_signature" label="Contractor signature" type="signature" required></reb-declare>{{if .contractor_signature}}<img src="{{.contractor_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}<p class="mt-1 border-t border-slate-400 pt-1 text-sm">For the contractor</p></div>
    <div><reb-declare name="client_signature" label="Client signature" type="signature" required></reb-declare>{{if .client_signature}}<img src="{{.client_signature}}" class="h-16">{{else}}<div class="h-16"></div>{{end}}<p class="mt-1 border-t border-slate-400 pt-1 text-sm">For the client</p></div>
  </div>
</div>
